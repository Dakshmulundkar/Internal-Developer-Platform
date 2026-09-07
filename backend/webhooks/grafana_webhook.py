"""Grafana webhook receiver for Prometheus Alertmanager and Grafana Unified Alerting."""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Request

from database import supabase
from services.incident_service import create_from_alert

logger = logging.getLogger(__name__)
router = APIRouter()


def _resolve_project_id(hints: List[str]) -> Optional[str]:
    """Resolve an internal project ID using hints (vercel_project_id, name, id)."""
    for hint in hints:
        if not hint:
            continue
        hint_clean = hint.strip().lower()

        # Check by vercel_project_id
        res = supabase.table("projects").select("id").ilike("vercel_project_id", f"%{hint_clean}%").execute()
        if res.data:
            return res.data[0]["id"]

        # Check by name
        res = supabase.table("projects").select("id").ilike("name", f"%{hint_clean}%").execute()
        if res.data:
            return res.data[0]["id"]

        # Check by repo_name
        res = supabase.table("projects").select("id").ilike("repo_name", f"%{hint_clean}%").execute()
        if res.data:
            return res.data[0]["id"]

    # Fallback to the first available project
    fallback = supabase.table("projects").select("id").limit(1).execute()
    if fallback.data:
        return fallback.data[0]["id"]

    return None


@router.post("/grafana")
async def grafana_webhook(request: Request, background_tasks: BackgroundTasks) -> Dict[str, Any]:
    """Receive and process Grafana / Alertmanager alert webhooks."""
    try:
        payload = await request.json()
    except Exception as exc:
        logger.warning("Failed to parse Grafana webhook JSON: %s", exc)
        return {"status": "error", "detail": "Invalid JSON"}

    # Determine format: Alertmanager format has "alerts", legacy Grafana has "ruleName"/"title"
    alerts_list = payload.get("alerts")
    created_alerts = []

    if alerts_list and isinstance(alerts_list, list):
        # Alertmanager format
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

            # Find matching project
            project_hints = [
                labels.get("project_id"),
                labels.get("project"),
                labels.get("app"),
                labels.get("service"),
                labels.get("instance"),
                payload.get("groupLabels", {}).get("alertname"),
            ]
            project_id = _resolve_project_id(project_hints)

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

                if alert_record["status"] == "firing" and severity in ("critical", "high"):
                    background_tasks.add_task(create_from_alert, alert_record)
    else:
        # Legacy Grafana single alert format
        state = str(payload.get("state", "alerting")).lower()
        title = payload.get("ruleName") or payload.get("title") or "Grafana Alert"
        description = payload.get("message") or f"Evaluation matches: {payload.get('evalMatches')}"
        severity = "critical" if state in ("alerting", "firing") else "medium"

        project_hints = [
            payload.get("ruleName"),
            payload.get("title"),
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

            if alert_record["status"] == "firing" and severity in ("critical", "high"):
                background_tasks.add_task(create_from_alert, alert_record)

    return {
        "status": "processed",
        "count": len(created_alerts),
        "alerts": created_alerts,
    }
