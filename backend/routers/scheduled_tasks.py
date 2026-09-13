"""Scheduled tasks router — CRUD for scheduled_tasks and scheduler status."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from database import supabase
from dependencies import get_current_user, get_user_project_ids
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()


class ScheduledTaskIn(BaseModel):
    name: str
    description: str = ""
    enabled: bool = True
    sort_order: int = 0
    cron_expression: str
    task_type: str
    task_config: dict = Field(default_factory=dict)
    project_id: str | None = None


class ScheduledTaskUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    sort_order: int | None = None
    cron_expression: str | None = None
    task_type: str | None = None
    task_config: dict | None = None
    project_id: str | None = None


_TASK_TYPES = {"email_digest", "health_check", "alert_sync", "report"}


@router.get("")
async def list_tasks(current_user=Depends(get_current_user)):
    """List scheduled tasks owned by the current user."""
    user_id = str(current_user.id)
    res = (
        supabase.table("scheduled_tasks")
        .select("*")
        .eq("owner_id", user_id)
        .order("sort_order", desc=False)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_task(body: ScheduledTaskIn, current_user=Depends(get_current_user)):
    """Create a scheduled task."""
    user_id = str(current_user.id)
    if body.task_type not in _TASK_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid task_type. Must be one of: {sorted(_TASK_TYPES)}")

    if body.project_id and body.project_id not in get_user_project_ids(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Validate cron expression format (5 or 6 space-separated fields).
    parts = body.cron_expression.strip().split()
    if len(parts) not in (5, 6):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cron_expression must have 5 or 6 fields")

    data = body.model_dump()
    data["owner_id"] = user_id
    if not data.get("sort_order"):
        rows = (supabase.table("scheduled_tasks").select("sort_order").eq("owner_id", user_id).execute().data or [])
        data["sort_order"] = max((r.get("sort_order") or 0 for r in rows), default=-1) + 1
    res = supabase.table("scheduled_tasks").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create scheduled task")
    return res.data[0]


@router.patch("/{task_id}")
async def update_task(task_id: str, body: ScheduledTaskUpdate, current_user=Depends(get_current_user)):
    """Update a scheduled task."""
    user_id = str(current_user.id)
    task = supabase.table("scheduled_tasks").select("*").eq("id", task_id).execute()
    if not task.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    if str(task.data[0].get("owner_id")) != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    data = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if "cron_expression" in data:
        parts = data["cron_expression"].strip().split()
        if len(parts) not in (5, 6):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cron_expression must have 5 or 6 fields")
    if "project_id" in data and data["project_id"] and data["project_id"] not in get_user_project_ids(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    res = supabase.table("scheduled_tasks").update(data).eq("id", task_id).execute()
    return res.data[0] if res.data else {"success": True}


@router.delete("/{task_id}")
async def delete_task(task_id: str, current_user=Depends(get_current_user)):
    """Delete a scheduled task."""
    user_id = str(current_user.id)
    task = supabase.table("scheduled_tasks").select("*").eq("id", task_id).execute()
    if not task.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    if str(task.data[0].get("owner_id")) != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    supabase.table("scheduled_tasks").delete().eq("id", task_id).execute()
    return {"deleted": True, "id": task_id}


@router.post("/{task_id}/run")
async def run_task_now(task_id: str, current_user=Depends(get_current_user)):
    """Manually trigger a scheduled task."""
    from services.scheduler_service import _run_task

    user_id = str(current_user.id)
    task = supabase.table("scheduled_tasks").select("*").eq("id", task_id).execute()
    if not task.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    if str(task.data[0].get("owner_id")) != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    outcome = await _run_task(task.data[0])
    from services.scheduler_service import _record_run
    _record_run(task.data[0], outcome)
    return {"task_id": task_id, **outcome}


@router.get("/status")
async def scheduler_status(current_user=Depends(get_current_user)):
    """Return the in-process APScheduler status."""
    from services.scheduler_service import get_scheduler_status

    return get_scheduler_status()