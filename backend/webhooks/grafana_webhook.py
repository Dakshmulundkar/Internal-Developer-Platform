"""Grafana webhook receiver for Prometheus Alertmanager and Grafana Unified Alerting."""

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status

from config import settings
from database import supabase
from services.incident_service import create_from_alert

logger = logging.getLogger(__name__)
router = APIRouter()


async def _eval_automation(event_type: str, entity: dict) -> None:
    """Evaluate automation rules for an event (best-effort, non-blocking)."""
    try:
        from services.automation_engine import evaluate_event

        await evaluate_event(event_type, entity)
    except Exception as exc:
        logger.warning("Automation evaluation failed: %s", exc)


def _resolve_project_id(hints: List[str], cache: Optional[Dict[str, Optional[str]]] = None) -> Optional[str]:
    """Resolve an internal project ID using exact project identifiers.

    Matches case-insensitively but exactly (no substring wildcards), so alerts
    never get mis-routed to an unrelated project. Results are cached per hint
    within a single request to avoid repeated queries for the same label.
    """
    for hint in hints:
        if not hint:
            continue
        hint_clean = str(hint).strip().lower()
        if not hint_clean:
            continue
        if cache is not None and hint_clean in cache:
            return cache[hint_clean]

        # Check by vercel_project_id, name, or repo_name (all exact, CI)
        for field in ("vercel_project_id", "name", "repo_name"):
            res = supabase.table("projects").select("id").ilike(field, hint_clean).limit(1).execute()
            if res.data:
                project_id = res.data[0]["id"]
                if cache is not None:
                    cache[hint_clean] = project_id
                return project_id

        if cache is not None:
            cache[hint_clean] = None

    return None


@router.post("/grafana")
async def grafana_webhook(request: Request, background_tasks: BackgroundTasks) -> Dict[str, Any]:
    """Receive and process Grafana / Alertmanager alert webhooks."""
    body = await request.body()

    # HMAC-SHA256 signature verification (matches the pattern used by the
    # Vercel, Netlify, and GitHub security triage webhooks).
    if not settings.GRAFANA_WEBHOOK_SECRET:
        if settings.ENVIRONMENT == "production":
            logger.error(
                "GRAFANA_WEBHOOK_SECRET not configured — refusing webhook in production"
            )
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Webhook not configured")
        logger.warning(
            "GRAFANA_WEBHOOK_SECRET not configured — webhook signature verification disabled (dev only)"
        )
    else:
        signature = request.headers.get("x-webhook-secret", "")
        expected = "sha256=" + hmac.new(
            settings.GRAFANA_WEBHOOK_SECRET.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    try:
        payload = json.loads(body)
    except Exception as exc:
        logger.warning("Failed to parse Grafana webhook JSON: %s", exc)
        return {"status": "error", "detail": "Invalid JSON"}

    # Determine format: Alertmanager format has "alerts", legacy Grafana has "ruleName"/"title"
    alerts_list = payload.get("alerts")
    created_alerts = []

    if alerts_list and isinstance(alerts_list, list):
        # Alertmanager format
        hint_cache: Dict[str, Optional[str]] = {}
        for item in alerts_list:
            labels = item.get("labels", {})
            annotations = item.get("annotations", {})
            status = item.get("status", payload.get("status", "firing")).lower()

            title = (
                annotations.get("summary")
                or annotations.get("title")
                or labels.get("alertname")
                or payload.get("title")
                or "Grafana Alert"
            )
            description = (
                annotations.get("description")
                or annotations.get("message")
                or payload.get("message")
                or f"Status: {status}"
            )
            severity = labels.get("severity", "critical" if status == "firing" else "medium").lower()

            # Find matching project. Only explicit project identifiers (id /
            # name / app / service / instance) are trusted — never the alert
            # name, which is a free-text Grafana expression.
            project_hints = [
                labels.get("project_id"),
                labels.get("project"),
                labels.get("app"),
                labels.get("service"),
                labels.get("instance"),
            ]
            project_id = _resolve_project_id(project_hints, hint_cache)

            starts_at = item.get("startsAt") or datetime.now(timezone.utc).isoformat()
            ends_at = item.get("endsAt")

            alert_row = {
                "source": "grafana",
                "title": title,
                "description": description,
                "severity": severity,
                "status": "firing" if status in ("firing", "alerting") else "resolved",
                "project_id": project_id,
                "labels": labels,
                "value": str(item.get("value") or item.get("values") or annotations.get("value") or ""),
                "threshold": str(annotations.get("threshold") or ""),
                "fired_at": starts_at,
                "resolved_at": ends_at if status == "resolved" else None,
            }

            res = supabase.table("monitoring_alerts").insert(alert_row).execute()
            if res.data:
                alert_record = res.data[0]
                created_alerts.append(alert_record)

                # Evaluate automation rules for the fired alert (only when we
                # can tie it to a project)
                if alert_record["status"] == "firing" and project_id:
                    background_tasks.add_task(
                        _eval_automation, "alert.fired",
                        {
                            "id": alert_record.get("id"),
                            "project_id": project_id,
                            "severity": severity,
                            "title": title,
                            "status": "firing",
                        },
                    )

                if alert_record["status"] == "firing" and project_id and severity in ("critical", "high"):
                    background_tasks.add_task(create_from_alert, alert_record)
    else:
        # Legacy Grafana single alert format
        state = str(payload.get("state", "alerting")).lower()
        title = payload.get("ruleName") or payload.get("title") or "Grafana Alert"
        description = payload.get("message") or f"Evaluation matches: {payload.get('evalMatches')}"
        severity = "critical" if state in ("alerting", "firing") else "medium"

        project_hints = [
            payload.get("project_id"),
            payload.get("project"),
            payload.get("app"),
            payload.get("service"),
        ]
        project_id = _resolve_project_id(project_hints)

        alert_row = {
            "source": "grafana",
            "title": title,
            "description": description,
            "severity": severity,
            "status": "firing" if state in ("alerting", "firing") else "resolved",
            "project_id": project_id,
            "labels": {"ruleId": str(payload.get("ruleId", "")), "ruleUrl": str(payload.get("ruleUrl", ""))},
            "value": str(payload.get("evalMatches") or ""),
            "fired_at": datetime.now(timezone.utc).isoformat(),
            "resolved_at": datetime.now(timezone.utc).isoformat() if state == "ok" else None,
        }

        res = supabase.table("monitoring_alerts").insert(alert_row).execute()
        if res.data:
            alert_record = res.data[0]
            created_alerts.append(alert_record)

            if alert_record["status"] == "firing" and project_id:
                background_tasks.add_task(
                    _eval_automation, "alert.fired",
                    {
                        "id": alert_record.get("id"),
                        "project_id": project_id,
                        "severity": severity,
                        "title": title,
                        "status": "firing",
                    },
                )

            if alert_record["status"] == "firing" and project_id and severity in ("critical", "high"):
                background_tasks.add_task(create_from_alert, alert_record)

    return {
        "status": "processed",
        "count": len(created_alerts),
        "alerts": created_alerts,
    }
