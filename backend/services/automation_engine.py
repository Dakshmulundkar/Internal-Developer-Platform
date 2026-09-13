"""Automation engine — evaluates automation rules against platform events.

Rules live in the `automation_rules` table and are evaluated whenever an event
is emitted (deployment.status_change, incident.created, alert.fired). A rule
with a `project_id` only triggers for that project; a rule without one triggers
for all projects owned by the rule's owner.

Actions currently supported:
  - notify           create an in-app notification
  - email            send an email via Resend
  - webhook          POST a JSON payload to an external URL
  - resolve_incident set an incident to resolved
  - comment          append a comment to the triggering entity
  - update_status    update the status field on the entity
"""

import logging
from datetime import datetime, timezone

from database import supabase

logger = logging.getLogger(__name__)

VALID_TRIGGERS = {"deployment.status_change", "incident.created", "alert.fired"}


# ── Condition evaluation ──────────────────────────────────────────────────────

def _get_field(entity: dict, field: str):
    """Resolve a possibly-dotted field path on the entity dict."""
    value = entity
    for part in field.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def _eval_op(op: str, actual, expected) -> bool:
    if op in ("eq", "equals", "=="):
        return str(actual).lower() == str(expected).lower()
    if op in ("ne", "neq", "!="):
        return str(actual).lower() != str(expected).lower()
    if op == "contains":
        return expected.lower() in str(actual).lower()
    if op == "not_contains":
        return expected.lower() not in str(actual).lower()
    if op == "in":
        try:
            return str(actual).lower() in [str(x).lower() for x in expected]
        except TypeError:
            return False
    if op in ("gt", ">", "gte", ">=", "lt", "<", "lte", "<="):
        try:
            a, b = float(actual), float(expected)
        except (TypeError, ValueError):
            return False
        return {
            "gt": a > b,
            "gte": a >= b,
            "lt": a < b,
            "lte": a <= b,
            ">": a > b,
            ">=": a >= b,
            "<": a < b,
            "<=": a <= b,
        }.get(op, False)
    if op == "exists":
        return actual is not None
    return False


def _evaluate_conditions(conditions: list, entity: dict) -> bool:
    try:
        combined = conditions or []
        # If a condition dict has a top-level "all"/"any" key use that, else AND.
        if isinstance(combined, dict):
            combined = [combined]
        for cond in combined:
            if not isinstance(cond, dict):
                continue
            if "all" in cond:
                if not all(_evaluate_conditions(c, entity) for c in cond["all"]):
                    return False
                continue
            if "any" in cond:
                if not any(_evaluate_conditions(c, entity) for c in cond["any"]):
                    return False
                continue
            field = cond.get("field", "")
            op = cond.get("op", "eq")
            expected = cond.get("value", True)
            if not _eval_op(op, _get_field(entity, field), expected):
                return False
        return True
    except Exception as exc:
        logger.warning("Condition evaluation error: %s", exc)
        return False


# ── Actions ───────────────────────────────────────────────────────────────────

def _resolve_target_user(entity: dict, rule: dict):
    """Return the user id the automated action should notify/email."""
    project_id = rule.get("project_id") or entity.get("project_id")
    if project_id:
        p = supabase.table("projects").select("owner_id").eq("id", project_id).single().execute()
        if p.data and p.data.get("owner_id"):
            return str(p.data["owner_id"])
    return str(entity.get("owner_id") or rule.get("owner_id") or "")


async def _run_action(action: dict, event_type: str, entity: dict, rule: dict, context: dict) -> dict:
    """Execute a single action. Returns {'status': ..., 'detail': ...}."""
    atype = (action.get("type") or "").lower()
    target_user = action.get("target_user_id") or _resolve_target_user(entity, rule)
    project_id = rule.get("project_id") or entity.get("project_id")
    incident_id = entity.get("id") if event_type == "incident.created" else None
    entity_id = str(entity.get("id") or "")

    try:
        if atype == "notify":
            from services.notification_service import create_notification

            await create_notification(
                user_id=target_user,
                title=action.get("title") or f"Automation: {event_type}",
                message=action.get("message") or f"Rule '{rule.get('name')}' triggered on {event_type}.",
                type="info",
                project_id=project_id,
                incident_id=incident_id,
            )
            return {"status": "success", "detail": f"Notification sent to {target_user}"}

        if atype == "email":
            from services.email_service import send_email

            email = action.get("to")
            if not email:
                u = supabase.table("auth.users").select("email").eq("id", target_user).execute()
                email = u.data[0]["email"] if u.data else None
            if email:
                ok = await send_email(
                    email,
                    action.get("subject") or f"Automation: {event_type}",
                    action.get("body") or f"<p>Rule '{rule.get('name')}' triggered on {event_type}.</p>",
                )
                return {"status": "success" if ok else "skipped", "detail": f"Email to {email}"}
            return {"status": "skipped", "detail": "No email recipient available"}

        if atype == "webhook":
            import httpx

            payload = {
                "event": event_type,
                "rule": rule.get("name"),
                "triggered_at": datetime.now(timezone.utc).isoformat(),
                "entity": entity,
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(action.get("url", ""), json=payload)
            ok = resp.status_code < 300
            return {"status": "success" if ok else "failed", "detail": f"POST → {resp.status_code}"}

        if atype == "resolve_incident":
            if event_type == "incident.created" or entity.get("entity_type") == "incident":
                supabase.table("incidents").update({"status": "resolved"}).eq("id", entity_id).execute()
                supabase.table("incident_timeline").insert({
                    "incident_id": entity_id,
                    "event": f"Resolved automatically by automation rule '{rule.get('name')}'",
                    "type": "action",
                }).execute()
                return {"status": "success", "detail": "Incident resolved"}
            return {"status": "skipped", "detail": "Entity is not an incident"}

        if atype == "comment":
            _TABLES = {
                "deployment": ("deployment_comments", "deployment_id"),
                "rollback": ("rollback_comments", "rollback_id"),
                "incident": ("incident_comments", "incident_id"),
                "project": ("project_comments", "project_id"),
            }
            etype = (action.get("entity_type") or event_type.split(".")[0]).lower()
            if etype == "alert":
                etype = "incident"
            table, fkey_col = _TABLES.get(etype, (None, None))
            if table:
                owner = supabase.table("projects").select("owner_id").eq("id", project_id).single().execute()
                supabase.table(table).insert({
                    fkey_col: entity_id,
                    "user_id": str(owner.data["owner_id"]) if owner.data else None,
                    "user_name": "automation",
                    "content": action.get("content") or f"Automation rule '{rule.get('name')}' triggered.",
                }).execute()
                return {"status": "success", "detail": "Comment added"}
            return {"status": "skipped", "detail": f"Unsupported entity type for comment: {etype}"}

        if atype == "update_status":
            _ET = {
                "deployment": "deployments",
                "incident": "incidents",
                "rollback": "rollback_operations",
                "project": "projects",
            }
            etype = (action.get("entity_type") or event_type.split(".")[0]).lower()
            table = _ET.get(etype)
            if table and entity_id:
                supabase.table(table).update({"status": action.get("value")}).eq("id", entity_id).execute()
                return {"status": "success", "detail": f"{etype} status → {action.get('value')}"}
            return {"status": "skipped", "detail": "No table to update"}

        return {"status": "skipped", "detail": f"Unsupported action type: {atype}"}
    except Exception as exc:
        logger.error("Automation action '%s' failed: %s", atype, exc)
        return {"status": "failed", "detail": str(exc)}


# ── Rule lookup + evaluation ──────────────────────────────────────────────────

def _matching_rules(event_type: str, entity: dict, context: dict) -> list[dict]:
    """Fetch enabled rules that could match this event."""
    if event_type not in VALID_TRIGGERS:
        logger.debug("Ignoring unknown trigger %s", event_type)
        return []

    project_id = entity.get("project_id")
    query = (
        supabase.table("automation_rules")
        .select("*")
        .eq("trigger_type", event_type)
        .eq("enabled", True)
    )
    res = query.execute()
    if not res.data:
        return []

    matching = []
    for rule in res.data:
        # Rule scoped to a project: skip if event is for a different project.
        if rule.get("project_id") and project_id and str(rule.get("project_id")) != str(project_id):
            continue
        matching.append(rule)
    return matching


async def evaluate_event(event_type: str, entity: dict, context: dict | None = None) -> list[dict]:
    """Run all matching enabled rules for an event. Returns execution results."""
    context = context or {}
    results = []
    for rule in _matching_rules(event_type, entity, context):
        conditions = rule.get("conditions") or []
        if not _evaluate_conditions(conditions, entity):
            results.append({"rule_id": rule["id"], "status": "skipped", "reason": "conditions not met"})
            continue

        action_results = []
        for action in rule.get("actions") or []:
            outcome = await _run_action(action, event_type, entity, rule, context)
            action_results.append(outcome)

        overall = "success"
        if any(a.get("status") == "failed" for a in action_results):
            overall = "failed"
        elif any(a.get("status") == "success" for a in action_results):
            overall = "success"
        else:
            overall = "skipped"

        try:
            supabase.table("automation_rules").update({
                "last_triggered_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", rule["id"]).execute()
        except Exception:
            pass

        try:
            supabase.table("automation_executions").insert({
                "rule_id": rule["id"],
                "triggered_by": event_type,
                "triggered_id": entity.get("id"),
                "status": overall,
                "result": {"actions": action_results},
            }).execute()
        except Exception as exc:
            logger.warning("Failed to record automation execution: %s", exc)

        results.append({
            "rule_id": rule["id"],
            "rule_name": rule.get("name"),
            "status": overall,
            "actions": action_results,
        })

    return results