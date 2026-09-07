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
            supabase.table("incident_timeline").insert({
                "incident_id": inc_id,
                "event": "Incident auto-created from failed deployment",
                "type": "alert",
            }).execute()
    except Exception as exc:
        logger.error("create_from_deployment failed: %s", exc)


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

        return inc_id
    except Exception as exc:
        logger.error("create_from_alert failed: %s", exc)
        return None
