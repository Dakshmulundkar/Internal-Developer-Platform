"""Monitoring router — alerts, plugin sync, and service probing."""

import logging
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel

from background.plugin_sync import sync_all_plugins
from database import supabase
from dependencies import get_current_user, get_optional_user
from services.incident_service import create_from_alert
from services.service_prober import probe_project, trigger_test_event

logger = logging.getLogger(__name__)
router = APIRouter()


def is_valid_uuid(val: str) -> bool:
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def _user_project_ids(user_id: str) -> list[str]:
    res = supabase.table("projects").select("id").eq("owner_id", user_id).execute()
    return [r["id"] for r in (res.data or [])]


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
            query = query.eq("project_id", project_id)
        else:
            p_res = supabase.table("projects").select("id").eq("name", project_id).eq("owner_id", str(current_user.id)).execute()
            if p_res.data:
                query = query.eq("project_id", p_res.data[0]["id"])
            else:
                return []
    res = query.order("fired_at", desc=True).limit(100).execute()
    return res.data or []


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
    if is_valid_uuid(project_id) and project_id not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    try:
        results = await probe_project(project_id=project_id, custom_url=custom_url)
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
    if is_valid_uuid(body.project_id) and body.project_id not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    try:
        outcome = await trigger_test_event(
            project_id=body.project_id,
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
    """Direct event intake from external test runners, deployed sites, or client telemetry."""
    assigned_project_id = None
    if current_user:
        project_ids = _user_project_ids(str(current_user.id))
        assigned_project_id = body.project_id if (body.project_id and body.project_id in project_ids) else (project_ids[0] if project_ids else None)
    else:
        if body.project_id and is_valid_uuid(body.project_id):
            assigned_project_id = body.project_id
        else:
            all_p = supabase.table("projects").select("id").limit(1).execute()
            assigned_project_id = all_p.data[0]["id"] if all_p.data else None

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
    if body.status == "firing":
        background_tasks.add_task(create_from_alert, created)

    return {"status": "accepted", "alert": created}
