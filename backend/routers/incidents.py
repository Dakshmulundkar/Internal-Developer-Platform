"""Incidents router — full implementation."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from database import supabase
from dependencies import get_current_user, get_user_project_ids
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
    """Return all project ids accessible to user_id (owned or team member)."""
    return get_user_project_ids(user_id)


def _security_audit(
    incident_id: str,
    service_id: str | None,
    project_id: str | None,
    actor_id: str,
    actor_email: str | None,
    action: str,
    old_state: dict | None = None,
    new_state: dict | None = None,
    notes: str | None = None,
) -> None:
    """Append a row to security_incident_audit_logs. Failures are non-fatal."""
    if not project_id:
        return
    try:
        supabase.table("security_incident_audit_logs").insert({
            "incident_id": incident_id,
            "service_id": service_id,
            "project_id": project_id,
            "actor_id": actor_id,
            "actor_email": actor_email,
            "action": action,
            "old_state": old_state,
            "new_state": new_state,
            "notes": notes,
        }).execute()
    except Exception as exc:
        logger.warning("security audit log insert failed: %s", exc)


@router.get("", response_model=list[IncidentResponse])
async def list_incidents(
    project_id: str = None,
    service_id: str = None,
    severity: str = None,
    status: str = None,
    source: str = None,
    current_user=Depends(get_current_user),
):
    """Return incidents for the authenticated user's projects, optionally filtered."""
    project_ids = _user_project_ids(str(current_user.id))
    if not project_ids:
        return []

    query = supabase.table("incidents").select("*").in_("project_id", project_ids)
    if project_id:
        query = query.eq("project_id", project_id)
    if service_id:
        query = query.eq("service_id", service_id)
    if severity:
        query = query.eq("severity", severity)
    if status:
        query = query.eq("status", status)
    if source:
        query = query.eq("source", source)
    res = query.order("created_at", desc=True).execute()
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

    # Broadcast incident.created via WebSocket
    try:
        from main import broadcast_to_user
        await broadcast_to_user(str(current_user.id), "incident.created", res.data[0])
    except Exception:
        pass

    # Auto-deploy audit log
    await audit_service.log(
        user_id=str(current_user.id),
        user_name=getattr(current_user, "email", ""),
        action="incident.created",
        details=f"Created incident: {body.title}",
        project_id=body.project_id,
    )
    return {**res.data[0], "comments": [], "timeline": []}


@router.post("/{incident_id}/resolve")
async def resolve_incident(incident_id: str, current_user=Depends(get_current_user)):
    """Mark an incident as resolved."""
    project_ids = _user_project_ids(str(current_user.id))
    inc = supabase.table("incidents").select("*").eq("id", incident_id).single().execute()
    if not inc.data or inc.data.get("project_id") not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    now = datetime.now(timezone.utc).isoformat()
    res = supabase.table("incidents").update({"status": "resolved", "resolved_at": now}).eq("id", incident_id).execute()
    supabase.table("incident_timeline").insert({
        "incident_id": incident_id,
        "event": "Incident resolved",
        "type": "resolve",
    }).execute()

    # Security incidents keep an immutable audit trail
    if inc.data.get("source") == "security_triage":
        _security_audit(
            incident_id=incident_id,
            service_id=inc.data.get("service_id"),
            project_id=inc.data.get("project_id"),
            actor_id=str(current_user.id),
            actor_email=getattr(current_user, "email", None),
            action="resolved",
            old_state={"status": inc.data.get("status")},
            new_state={"status": "resolved", "resolved_at": now},
        )

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

    # Push the state change to the whole project team in real time
    try:
        from services.websocket_service import broadcast_incident_changed
        updated = res.data[0] if res.data else {**dict(inc.data), "status": "resolved", "resolved_at": now}
        await broadcast_incident_changed(updated, actor_name=getattr(current_user, "email", "") or "")
    except Exception as exc:
        logger.debug("incident resolve broadcast skipped (non-fatal): %s", exc)

    return {"success": True}


@router.post("/{incident_id}/ignore")
async def ignore_incident(
    incident_id: str,
    body: dict,
    current_user=Depends(get_current_user),
):
    """Ignore an incident with a reason."""
    project_ids = _user_project_ids(str(current_user.id))
    inc = supabase.table("incidents").select("*").eq("id", incident_id).single().execute()
    if not inc.data or inc.data.get("project_id") not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    ignored_reason = body.get("ignored_reason", "")
    res = supabase.table("incidents").update({"status": "resolved", "ignored_reason": ignored_reason}).eq("id", incident_id).execute()

    # Security incidents keep an immutable audit trail
    if inc.data.get("source") == "security_triage":
        _security_audit(
            incident_id=incident_id,
            service_id=inc.data.get("service_id"),
            project_id=inc.data.get("project_id"),
            actor_id=str(current_user.id),
            actor_email=getattr(current_user, "email", None),
            action="ignored",
            old_state={"status": inc.data.get("status")},
            new_state={"status": "resolved", "ignored_reason": ignored_reason},
            notes=ignored_reason,
        )

    # Push the state change to the whole project team in real time
    try:
        from services.websocket_service import broadcast_incident_changed
        updated = res.data[0] if res.data else {**dict(inc.data), "status": "resolved", "ignored_reason": ignored_reason}
        await broadcast_incident_changed(updated, actor_name=getattr(current_user, "email", "") or "")
    except Exception as exc:
        logger.debug("incident ignore broadcast skipped (non-fatal): %s", exc)

    return {"success": True}


@router.post("/{incident_id}/comments")
async def add_comment(
    incident_id: str,
    body: CommentCreate,
    current_user=Depends(get_current_user),
):
    """Add a comment to an incident."""
    project_ids = _user_project_ids(str(current_user.id))
    inc = supabase.table("incidents").select("*").eq("id", incident_id).single().execute()
    if not inc.data or inc.data.get("project_id") not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    user_name = getattr(current_user, "email", "").split("@")[0] or "User"

    comment_row = {
        "incident_id": incident_id,
        "user_id": str(current_user.id),
        "user_name": user_name,
        "content": body.content,
    }
    comment_res = supabase.table("incident_comments").insert(comment_row).execute()
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

    # Push the state change to the whole project team in real time so a ticket
    # accepted / re-assigned / fixed by one member updates everyone's board.
    try:
        from services.websocket_service import broadcast_incident_changed
        await broadcast_incident_changed(incident, actor_name=getattr(current_user, "email", "") or "")
    except Exception as exc:
        logger.debug("incident update broadcast skipped (non-fatal): %s", exc)

    return incident
