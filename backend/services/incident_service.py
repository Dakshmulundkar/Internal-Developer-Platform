"""Incident creation helpers called by webhooks and background tasks."""

import logging

from database import supabase

logger = logging.getLogger(__name__)


async def create_from_deployment(deployment_id: str) -> None:
    """Auto-create an incident when a deployment fails."""
    try:
        dep_res = supabase.table("deployments").select("*").eq("id", deployment_id).single().execute()
        if not dep_res.data:
            logger.warning("Deployment %s not found for incident creation", deployment_id)
            return
        dep = dep_res.data
        title = f"Deployment failed: {dep.get('error_message') or dep.get('version') or deployment_id}"
        inc_res = supabase.table("incidents").insert({
            "project_id": dep["project_id"],
            "deployment_id": deployment_id,
            "severity": "critical",
            "provider": dep.get("provider"),
            "title": title,
            "description": dep.get("error_message"),
            "status": "open",
        }).execute()
        if inc_res.data:
            inc_id = inc_res.data[0]["id"]
            inc = inc_res.data[0]
            supabase.table("incident_timeline").insert({
                "incident_id": inc_id,
                "event": "Incident auto-created from failed deployment",
                "type": "alert",
            }).execute()

            # Evaluate automation rules for the new incident (best-effort)
            try:
                from services.automation_engine import evaluate_event

                await evaluate_event("incident.created", {**inc, "project_id": dep["project_id"]})
            except Exception as exc:
                logger.debug("Automation evaluation skipped: %s", exc)

            # Log activity feed entries
            try:
                proj_res = supabase.table("projects").select("owner_id, name").eq("id", dep["project_id"]).single().execute()
                actor = None
                if proj_res.data and proj_res.data.get("owner_id"):
                    actor = str(proj_res.data["owner_id"])
                rows = [
                    {
                        "entity_type": "incident",
                        "entity_id": inc_id,
                        "user_id": actor,
                        "user_name": "system",
                        "action": "auto_created",
                        "description": f"Incident auto-created from failed deployment {dep.get('version') or deployment_id}",
                    },
                    {
                        "entity_type": "deployment",
                        "entity_id": deployment_id,
                        "user_id": actor,
                        "user_name": "system",
                        "action": "failed",
                        "description": f"Deployment failed — incident {inc_id} created",
                    },
                ]
                for row in rows:
                    try:
                        supabase.table("entity_activities").insert(row).execute()
                    except Exception:
                        pass
            except Exception:
                pass

            # Broadcast incident.created to project owner
            try:
                from main import broadcast_to_user

                proj_res = supabase.table("projects").select("owner_id").eq("id", dep["project_id"]).single().execute()
                if proj_res.data:
                    await broadcast_to_user(str(proj_res.data["owner_id"]), "incident.created", inc_res.data[0])
            except Exception:
                pass

            # Fan out to connected collaboration plugins (best-effort)
            try:
                from services.notify_fanout import fanout_incident

                await fanout_incident({**inc_res.data[0], "project_id": dep["project_id"]})
            except Exception:
                pass
    except Exception as exc:
        logger.error("create_from_deployment failed: %s", exc)


async def create_from_security_triage(project_id: str, payload: dict) -> list[str]:
    """Create incidents from a GitHub security triage webhook payload.

    One incident is created per AI-analysed vulnerability. Incident rows are
    scoped to a single service (service_id) and flagged source='security_triage'
    so the frontend can render the security context. Returns created incident ids.
    """
    if not payload:
        return []

    service_id = payload.get("service_id")
    service_name = payload.get("service_name")
    repository = payload.get("repository")
    run_id = payload.get("github_run_id")
    branch = payload.get("branch")
    commit_sha = payload.get("commit_sha")
    scan_timestamp = payload.get("timestamp")

    # Resolve the project the service is registered under (RBAC scoping).
    if project_id is None and service_name:
        proj_res = supabase.table("projects").select("id").eq("service_name", service_name).limit(1).execute()
        if proj_res.data:
            project_id = proj_res.data[0]["id"]
    if not project_id:
        logger.warning("Security triage webhook: no matching project for service %s", service_name)
        return []

    analyses = (payload.get("triage_report") or {}).get("analyses") or []
    created_ids: list[str] = []

    for item in analyses:
        try:
            created = await _create_single_triage_incident(
                project_id=project_id,
                service_id=service_id,
                service_name=service_name,
                repository=repository,
                run_id=run_id,
                branch=branch,
                commit_sha=commit_sha,
                scan_timestamp=scan_timestamp,
                item=item,
            )
            if created:
                created_ids.append(created)
        except Exception as exc:
            logger.error("Security triage: incident creation failed, continuing: %s", exc)
            continue

    return created_ids


async def _create_single_triage_incident(
    project_id: str,
    service_id: str | None,
    service_name: str | None,
    repository: str | None,
    run_id: str | None,
    branch: str | None,
    commit_sha: str | None,
    scan_timestamp: str | None,
    item: dict,
) -> str | None:
    """Create one security incident + timeline + audit log from a triage analysis.

    Any failure inside a single incident is caught by the caller so one bad
    analysis never aborts the whole webhook batch.
    """
    analysis = (item or {}).get("analysis") or {}
    vuln = (item or {}).get("vulnerability") or {}
    if not analysis.get("title"):
        return None

    inc_res = supabase.table("incidents").insert({
        "project_id": project_id,
        "service_id": service_id,
        "service_repository_url": repository,
        "visibility_scope": "project",
        "source": "security_triage",
        "provider": "trivy",
        "severity": _map_severity(vuln.get("severity")),
        "title": analysis.get("title")[:300],
        "description": analysis.get("description"),
        "status": "open",
        "security_metadata": {
            "source": "security_triage",
            "service": service_name,
            "service_id": service_id,
            "vulnerability_type": vuln.get("type"),
            "target": vuln.get("target"),
            "severity_trivy": vuln.get("severity"),
            "cve_id": vuln.get("cve_id"),
            "package": vuln.get("package"),
            "fixed_version": vuln.get("fixed_version"),
            "priority": analysis.get("priority", "P2"),
            "assigned_team": analysis.get("assigned_team", "devops"),
            "story_points": analysis.get("story_points", 5),
            "ai_confidence": analysis.get("confidence_score", 80),
            "remediation_steps": analysis.get("remediation_steps", []),
            "testing_steps": analysis.get("testing_steps", []),
            "github_issue_url": analysis.get("github_issue_url"),
            "scan_run_id": run_id,
            "scan_timestamp": scan_timestamp,
            "repository": repository,
            "branch": branch,
            "commit_sha": commit_sha,
        },
    }).execute()

    if not inc_res.data:
        return None

    inc = inc_res.data[0]
    supabase.table("incident_timeline").insert({
        "incident_id": inc["id"],
        "event": f"Security triage incident auto-created for {service_name} ({vuln.get('type', 'vulnerability')})",
        "type": "alert",
    }).execute()

    try:
        supabase.table("security_incident_audit_logs").insert({
            "incident_id": inc["id"],
            "service_id": service_id,
            "project_id": project_id,
            "action": "created",
            "new_state": {"status": "open", "severity": inc.get("severity")},
            "notes": f"scan_run={run_id} repository={repository}",
        }).execute()
    except Exception as exc:
        logger.warning("security audit log insert failed: %s", exc)

    # Broadcast incident.created to every connected user of the project (RBAC).
    try:
        from services.websocket_service import broadcast_to_project

        await broadcast_to_project(
            project_id=project_id,
            event_type="incident.created",
            data=inc,
        )
    except Exception as exc:
        logger.warning("Security triage broadcast failed: %s", exc)

    return inc["id"]


def _map_severity(trivy_severity: str | None) -> str:
    """Map Trivy severity to Aether severity."""
    return {
        "CRITICAL": "critical",
        "HIGH": "high",
        "MEDIUM": "medium",
        "LOW": "low",
    }.get((trivy_severity or "").upper(), "medium")


async def create_from_alert(alert: dict) -> str | None:
    """Auto-create an incident from a monitoring alert and notify user."""
    try:
        project_id = alert.get("project_id")
        title = f"Alert: {alert.get('title', 'Unknown alert')}"
        severity = alert.get("severity", "high")
        provider = alert.get("source", "monitoring")
        description = alert.get("description")

        inc_res = supabase.table("incidents").insert({
            "project_id": project_id,
            "severity": severity,
            "provider": provider,
            "title": title,
            "description": description,
            "status": "open",
        }).execute()

        if not inc_res.data:
            return None

        inc = inc_res.data[0]
        inc_id = inc["id"]

        # Evaluate automation rules for the new incident (best-effort)
        try:
            from services.automation_engine import evaluate_event

            await evaluate_event("incident.created", {**inc, "project_id": project_id})
        except Exception as exc:
            logger.debug("Automation evaluation skipped: %s", exc)

        # 1. Timeline
        supabase.table("incident_timeline").insert({
            "incident_id": inc_id,
            "event": f"Incident auto-created from {provider} alert: {alert.get('title')}",
            "type": "alert",
        }).execute()

        # 2. Link alert if alert id is present
        if alert.get("id"):
            supabase.table("monitoring_alerts").update({"incident_id": inc_id}).eq("id", alert["id"]).execute()

        # 3. Notification and audit log for project owner
        if project_id:
            proj_res = supabase.table("projects").select("owner_id, name").eq("id", project_id).execute()
            if proj_res.data and proj_res.data[0].get("owner_id"):
                owner_id = proj_res.data[0]["owner_id"]
                proj_name = proj_res.data[0].get("name", "Project")

                # Insert notification
                try:
                    supabase.table("notifications").insert({
                        "user_id": owner_id,
                        "project_id": project_id,
                        "incident_id": inc_id,
                        "type": "alert",
                        "title": f"[{severity.upper()}] {alert.get('title')}",
                        "message": description or f"A new alert was detected for {proj_name}.",
                    }).execute()
                except Exception as n_err:
                    logger.warning("Failed to insert notification: %s", n_err)

                # Insert audit log
                try:
                    supabase.table("audit_logs").insert({
                        "user_id": owner_id,
                        "project_id": project_id,
                        "action": "incident_auto_created",
                        "details": f"Incident '{title}' auto-created from {provider} alert.",
                    }).execute()
                except Exception as a_err:
                    logger.warning("Failed to insert audit log: %s", a_err)

                # Log activity feed entry
                try:
                    supabase.table("entity_activities").insert({
                        "entity_type": "incident",
                        "entity_id": inc_id,
                        "user_id": str(owner_id),
                        "user_name": proj_name,
                        "action": "auto_created",
                        "description": f"Incident auto-created from {provider} alert: {alert.get('title')}",
                    }).execute()
                except Exception:
                    pass

                # Broadcast incident.created to owner
                try:
                    from main import broadcast_to_user

                    await broadcast_to_user(str(owner_id), "incident.created", inc)
                except Exception:
                    pass

                # Send email notification (respects notification preferences)
                try:
                    prefs_res = supabase.table("notification_preferences").select("*").eq("user_id", owner_id).execute()
                    prefs = prefs_res.data[0] if prefs_res.data and prefs_res.data[0] else {}
                    if prefs.get("email_notifications", True) and prefs.get("incident_created", True):
                        user_res = supabase.table("auth.users").select("email").eq("id", owner_id).execute()
                        to_email = user_res.data[0]["email"] if user_res.data else None
                        if to_email:
                            from services.email_service import send_incident_created
                            await send_incident_created(to_email, alert.get("title", "New incident"), severity, proj_name, inc_id)
                except Exception as exc:
                    logger.debug("Email notification skipped: %s", exc)

                # Fan out to connected collaboration plugins (Slack/Discord/Teams/Jira/Linear)
                try:
                    from services.notify_fanout import fanout_incident

                    await fanout_incident({**inc, "project_id": project_id})
                except Exception as exc:
                    logger.debug("Collaboration fan-out skipped: %s", exc)

        return inc_id
    except Exception as exc:
        logger.error("create_from_alert failed: %s", exc)
        return None
