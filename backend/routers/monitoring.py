"""Monitoring router — alerts, plugin sync, and service probing."""

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel

from background.plugin_sync import sync_all_plugins
from database import supabase
from dependencies import get_current_user, get_optional_user, get_user_project_ids
from services.incident_service import create_from_alert
from services.service_prober import probe_project, trigger_test_event
from validators import is_valid_uuid

logger = logging.getLogger(__name__)
router = APIRouter()


def _user_project_ids(user_id: str) -> list[str]:
    return get_user_project_ids(user_id)


class TriggerTestRequest(BaseModel):
    project_id: str
    test_type: str
    custom_url: Optional[str] = None


class EventIntakeRequest(BaseModel):
    project_id: Optional[str] = None
    source: str = "test_runner"
    title: str
    description: Optional[str] = None
    severity: str = "high"
    status: str = "firing"
    labels: Optional[Dict[str, Any]] = None
    value: Optional[str] = None
    threshold: Optional[str] = None


@router.get("/alerts")
async def list_alerts(project_id: str = None, current_user=Depends(get_current_user)):
    """Return monitoring alerts for the authenticated user's projects."""
    project_ids = _user_project_ids(str(current_user.id))
    if not project_ids:
        return []

    query = supabase.table("monitoring_alerts").select("*").in_("project_id", project_ids)
    if project_id:
        if is_valid_uuid(project_id):
            if project_id not in project_ids:
                return []
            query = query.eq("project_id", project_id)
        else:
            p_res = supabase.table("projects").select("id").eq("name", project_id).in_("id", project_ids).execute()
            if p_res.data:
                query = query.eq("project_id", p_res.data[0]["id"])
            else:
                return []
    res = query.order("fired_at", desc=True).limit(100).execute()
    return res.data or []


def _resolve_project_param(project_id: str, project_ids: list[str]) -> str:
    """Resolve a project_id path/query value (UUID or name) within the caller's scope."""
    if is_valid_uuid(project_id):
        if project_id in project_ids:
            return project_id
    else:
        p_res = supabase.table("projects").select("id").eq("name", project_id).in_("id", project_ids).execute()
        if p_res.data:
            return p_res.data[0]["id"]
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")


@router.post("/sync")
async def trigger_monitoring_sync(
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
):
    """Trigger an immediate background synchronization across all active plugins."""
    background_tasks.add_task(sync_all_plugins)
    return {"status": "sync_triggered"}


@router.post("/probe/{project_id}")
async def handle_probe(
    project_id: str,
    custom_url: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    """Probe the specified project endpoints and record alerts/incidents."""
    project_ids = _user_project_ids(str(current_user.id))
    resolved = _resolve_project_param(project_id, project_ids)

    try:
        results = await probe_project(project_id=resolved, custom_url=custom_url)
        return results
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err)) from val_err
    except Exception as exc:
        logger.error("Probe failed for project %s: %s", project_id, exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Probe execution error: {exc}") from exc


@router.post("/trigger-test")
async def handle_trigger_test(
    body: TriggerTestRequest,
    current_user=Depends(get_current_user),
):
    """Execute a simulated testing button action (500, slow request, storm, etc.)."""
    project_ids = _user_project_ids(str(current_user.id))
    resolved = _resolve_project_param(body.project_id, project_ids)

    try:
        outcome = await trigger_test_event(
            project_id=resolved,
            test_type=body.test_type,
            custom_url=body.custom_url,
        )
        return outcome
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err)) from val_err
    except Exception as exc:
        logger.error("Trigger test failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Test trigger error: {exc}") from exc


@router.post("/events")
async def ingest_event(
    body: EventIntakeRequest,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_optional_user),
):
    """Direct event intake from external test runners, deployed sites, or client telemetry.

    Unauthenticated callers must supply an explicit, valid project_id (no
    fallback) and their events are recorded WITHOUT triggering incidents,
    notifications, or emails. Fully-authenticated callers may create alerts in
    their own projects including the auto-incident flow.
    """
    assigned_project_id = None
    if current_user:
        project_ids = _user_project_ids(str(current_user.id))
        if body.project_id and body.project_id in project_ids:
            assigned_project_id = body.project_id
    else:
        # Unauthenticated: only accept an explicit project UUID; never fall back
        # to guessing a project (that would let callers target random tenants).
        if body.project_id and is_valid_uuid(body.project_id):
            assigned_project_id = body.project_id

    if not assigned_project_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No project available for event assignment.")

    alert_row = {
        "source": body.source,
        "title": body.title,
        "description": body.description,
        "severity": body.severity,
        "status": body.status,
        "project_id": assigned_project_id,
        "labels": body.labels or {},
        "value": body.value,
        "threshold": body.threshold,
    }

    res = supabase.table("monitoring_alerts").insert(alert_row).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to persist alert")

    created = res.data[0]
    # Unauthenticated events are ingest-only — no incident/email side effects.
    if body.status == "firing" and current_user is not None:
        background_tasks.add_task(create_from_alert, created)

    return {"status": "accepted", "alert": created}
