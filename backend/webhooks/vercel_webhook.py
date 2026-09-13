"""Vercel webhook receiver — HMAC-SHA1 verified."""

import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status

from config import settings
from database import supabase
from services.incident_service import create_from_deployment

logger = logging.getLogger(__name__)
router = APIRouter()


async def _eval_automation(event_type: str, entity: dict) -> None:
    """Evaluate automation rules for an event (best-effort, non-blocking)."""
    try:
        from services.automation_engine import evaluate_event

        await evaluate_event(event_type, entity)
    except Exception as exc:
        logger.warning("Automation evaluation failed: %s", exc)

_EVENT_STATUS: dict = {
    "deployment.created": "queued",
    "deployment.succeeded": "success",
    "deployment.error": "failed",
    "deployment.canceled": "failed",
    "deployment.ready": "success",
}


@router.post("/vercel")
async def vercel_webhook(request: Request, background_tasks: BackgroundTasks):
    """Receive and process Vercel deployment webhooks."""
    body = await request.body()

    # HMAC-SHA1 signature verification
    if settings.VERCEL_WEBHOOK_SECRET:
        sig_header = request.headers.get("x-vercel-signature", "")
        expected = hmac.new(
            settings.VERCEL_WEBHOOK_SECRET.encode(),
            body,
            hashlib.sha1,
        ).hexdigest()
        if not hmac.compare_digest(expected, sig_header):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    event_type: str = payload.get("type", "")
    dep_data: dict = payload.get("payload", {}).get("deployment") or payload.get("deployment") or {}

    mapped_status = _EVENT_STATUS.get(event_type)
    if not mapped_status:
        # Unknown event — acknowledge and ignore
        return {"received": True}

    vercel_project_id: str = dep_data.get("projectId") or payload.get("payload", {}).get("projectId", "")

    # Look up our internal project by vercel_project_id
    project_res = supabase.table("projects").select("id,provider").eq("vercel_project_id", vercel_project_id).single().execute()
    if not project_res.data:
        logger.warning("No project matched vercel_project_id=%s", vercel_project_id)
        return {"received": True}

    project_id: str = project_res.data["id"]
    meta: dict = dep_data.get("meta", {})
    external_event_id: str = dep_data.get("id") or dep_data.get("uid", "")

    deployment_row = {
        "project_id": project_id,
        "external_event_id": external_event_id,
        "version": dep_data.get("url"),
        "status": mapped_status,
        "commit_hash": meta.get("githubCommitSha"),
        "commit_message": meta.get("githubCommitMessage"),
        "branch": meta.get("githubCommitRef"),
        "author": meta.get("githubCommitAuthorName"),
        "provider": "vercel",
        "url": dep_data.get("url"),
        "error_message": dep_data.get("errorMessage"),
    }

    upsert_res = supabase.table("deployments").upsert(deployment_row, on_conflict="external_event_id").execute()

    # Broadcast deployment status change to the project owner via WebSocket
    try:
        from main import broadcast_to_user

        owner = supabase.table("projects").select("owner_id").eq("id", project_id).single().execute()
        if owner.data:
            dep_saved = upsert_res.data[0] if upsert_res.data else {"id": "unknown", **deployment_row}
            await broadcast_to_user(str(owner.data["owner_id"]), "deployment.status_changed", {
                "id": dep_saved.get("id"),
                "status": mapped_status,
                "project_id": project_id,
                "version": deployment_row["version"],
            })
    except Exception:
        pass

    if mapped_status == "failed" and upsert_res.data:
        deployment_id: str = upsert_res.data[0].get("id", "")
        if deployment_id:
            background_tasks.add_task(create_from_deployment, deployment_id)

    if upsert_res.data:
        dep = upsert_res.data[0]
        background_tasks.add_task(_eval_automation, "deployment.status_change", {
            "id": dep.get("id"),
            "project_id": project_id,
            "status": mapped_status,
            "version": deployment_row.get("version"),
            "provider": deployment_row.get("provider"),
        })

    # Log activity feed entry
    try:
        owner = supabase.table("projects").select("owner_id").eq("id", project_id).single().execute()
        dep_saved = upsert_res.data[0] if upsert_res.data else {}
        supabase.table("entity_activities").insert({
            "entity_type": "deployment",
            "entity_id": dep_saved.get("id"),
            "user_id": str(owner.data["owner_id"]) if owner.data else None,
            "user_name": "vercel",
            "action": "status_change",
            "description": f"Deployment {deployment_row['version']} status → {mapped_status}",
            "metadata": {"event_type": event_type, "url": deployment_row.get("url")},
        }).execute()
    except Exception:
        pass

    return {"received": True}
