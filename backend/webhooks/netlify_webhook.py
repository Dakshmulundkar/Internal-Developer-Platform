"""Netlify webhook receiver — HMAC-SHA256 verified."""

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

_EVENT_STATUS: dict = {
    "deploy_created": "queued",
    "deploy_building": "queued",
    "deploy_ready": "success",
    "deploy_failed": "failed",
    "deploy_locked": "queued",
}


@router.post("/netlify")
async def netlify_webhook(request: Request, background_tasks: BackgroundTasks):
    """Receive and process Netlify deploy webhooks."""
    body = await request.body()

    # HMAC-SHA256 signature verification
    if settings.NETLIFY_WEBHOOK_SECRET:
        sig_header = request.headers.get("x-netlify-signature", "")
        expected = hmac.new(
            settings.NETLIFY_WEBHOOK_SECRET.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, sig_header):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    event_type: str = request.headers.get("x-netlify-event", payload.get("event", ""))
    mapped_status = _EVENT_STATUS.get(event_type)
    if not mapped_status:
        return {"received": True}

    site_id: str = payload.get("site_id", "")
    project_res = supabase.table("projects").select("id,provider").eq("netlify_site_id", site_id).single().execute()
    if not project_res.data:
        logger.warning("No project matched netlify_site_id=%s", site_id)
        return {"received": True}

    project_id: str = project_res.data["id"]
    external_event_id: str = payload.get("id", "")

    deployment_row = {
        "project_id": project_id,
        "external_event_id": external_event_id,
        "version": payload.get("id"),
        "status": mapped_status,
        "commit_hash": payload.get("commit_ref"),
        "commit_message": payload.get("title"),
        "branch": payload.get("branch"),
        "author": payload.get("committer"),
        "provider": "netlify",
        "url": payload.get("deploy_ssl_url") or payload.get("url"),
        "error_message": payload.get("error_message"),
    }

    upsert_res = supabase.table("deployments").upsert(deployment_row, on_conflict="external_event_id").execute()

    if mapped_status == "failed" and upsert_res.data:
        deployment_id: str = upsert_res.data[0].get("id", "")
        if deployment_id:
            background_tasks.add_task(create_from_deployment, deployment_id)

    return {"received": True}
