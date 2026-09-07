"""Incidents router — full implementation."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from database import supabase
from dependencies import get_current_user
from models.incident import (
    CommentCreate,
    FeedbackUpdate,
    IncidentCreate,
    IncidentResponse,
    IncidentUpdate,
)
from services import audit_service, notification_service

logger = logging.getLogger(__name__)
router = APIRouter()


def _user_project_ids(user_id: str) -> list[str]:
    """Return all project ids owned by user_id."""
    res = supabase.table("projects").select("id").eq("owner_id", user_id).execute()
    return [r["id"] for r in (res.data or [])]


@router.get("", response_model=list[IncidentResponse])
async def list_incidents(project_id: str = None, current_user=Depends(get_current_user)):
    """Return incidents for the authenticated user's projects, optionally filtered by project."""
    project_ids = _user_project_ids(str(current_user.id))
    if not project_ids:
        return []

    query = supabase.table("incidents").select("*").in_("project_id", project_ids)
    if project_id:
        query = query.eq("project_id", project_id)
    res = query.execute()
    return res.data or []


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: str, current_user=Depends(get_current_user)):
    """Fetch a single incident with its comments and timeline."""
    project_ids = _user_project_ids(str(current_user.id))
    res = supabase.table("incidents").select("*").eq("id", incident_id).single().execute()
    if not res.data or res.data.get("project_id") not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    incident = dict(res.data)

    comments_res = supabase.table("incident_comments").select("*").eq("incident_id", incident_id).execute()
    incident["comments"] = comments_res.data or []

    timeline_res = supabase.table("incident_timeline").select("*").eq("incident_id", incident_id).execute()
    incident["timeline"] = timeline_res.data or []

    return incident


@router.post("", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(body: IncidentCreate, current_user=Depends(get_current_user)):
    """Manually create an incident."""
    project_ids = _user_project_ids(str(current_user.id))
    if body.project_id not in project_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    res = supabase.table("incidents").insert(body.model_dump()).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create incident")
    return {**res.data[0], "comments": [], "timeline": []}


@router.post("/{incident_id}/resolve")
async def resolve_incident(incident_id: str, current_user=Depends(get_current_user)):
    """Mark an incident as resolved."""
    project_ids = _user_project_ids(str(current_user.id))
    inc = supabase.table("incidents").select("*").eq("id", incident_id).single().execute()
    if not inc.data or inc.data.get("project_id") not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("incidents").update({"status": "resolved", "resolved_at": now}).eq("id", incident_id).execute()
    supabase.table("incident_timeline").insert({
        "incident_id": incident_id,
        "event": "Incident resolved",
        "type": "resolve",
    }).execute()

    await audit_service.log(
        user_id=str(current_user.id),
        user_name=getattr(current_user, "email", ""),
        action="incident.resolved",
        details=f"Resolved incident {incident_id}",
        project_id=inc.data.get("project_id"),
    )
    await notification_service.create_notification(
        user_id=str(current_user.id),
        title="Incident Resolved",
        message=f"Incident '{inc.data.get('title')}' has been resolved.",
        type="incident_resolved",
        project_id=inc.data.get("project_id"),
        incident_id=incident_id,
    )
    return {"success": True}


@router.post("/{incident_id}/ignore")
async def ignore_incident(
    incident_id: str,
    body: dict,
    current_user=Depends(get_current_user),
):
    """Ignore an incident with a reason."""
    project_ids = _user_project_ids(str(current_user.id))
    inc = supabase.table("incidents").select("project_id").eq("id", incident_id).single().execute()
    if not inc.data or inc.data.get("project_id") not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    ignored_reason = body.get("ignored_reason", "")
    supabase.table("incidents").update({"status": "resolved", "ignored_reason": ignored_reason}).eq("id", incident_id).execute()
    return {"success": True}


@router.post("/{incident_id}/comments")
async def add_comment(
    incident_id: str,
    body: CommentCreate,
    current_user=Depends(get_current_user),
):
    """Add a comment to an incident."""
    project_ids = _user_project_ids(str(current_user.id))
    inc = supabase.table("incidents").select("project_id").eq("id", incident_id).single().execute()
    if not inc.data or inc.data.get("project_id") not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    comment_res = supabase.table("incident_comments").insert({
        "incident_id": incident_id,
        "content": body.content,
        "author_id": str(current_user.id),
    }).execute()
    supabase.table("incident_timeline").insert({
        "incident_id": incident_id,
        "event": f"Comment added: {body.content[:80]}",
        "type": "comment",
    }).execute()
    return comment_res.data[0] if comment_res.data else {"success": True}


@router.post("/{incident_id}/feedback")
async def submit_feedback(
    incident_id: str,
    body: FeedbackUpdate,
    current_user=Depends(get_current_user),
):
    """Submit AI feedback for an incident."""
    project_ids = _user_project_ids(str(current_user.id))
    inc = supabase.table("incidents").select("project_id").eq("id", incident_id).single().execute()
    if not inc.data or inc.data.get("project_id") not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    updates: dict = {"feedback_is_real": body.is_real}
    if body.comment is not None:
        updates["feedback_comment"] = body.comment
    supabase.table("incidents").update(updates).eq("id", incident_id).execute()
    return {"success": True}


@router.patch("/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: str,
    body: IncidentUpdate,
    current_user=Depends(get_current_user),
):
    """Partially update incident fields."""
    project_ids = _user_project_ids(str(current_user.id))
    inc = supabase.table("incidents").select("*").eq("id", incident_id).single().execute()
    if not inc.data or inc.data.get("project_id") not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {**inc.data, "comments": [], "timeline": []}

    res = supabase.table("incidents").update(updates).eq("id", incident_id).execute()
    incident = dict(res.data[0]) if res.data else dict(inc.data)

    comments_res = supabase.table("incident_comments").select("*").eq("incident_id", incident_id).execute()
    incident["comments"] = comments_res.data or []
    timeline_res = supabase.table("incident_timeline").select("*").eq("incident_id", incident_id).execute()
    incident["timeline"] = timeline_res.data or []
    return incident
