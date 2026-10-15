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
from services import ai_service

logger = logging.getLogger(__name__)
router = APIRouter()


def _user_project_ids(user_id: str) -> list[str]:
    """Return all project ids accessible to user_id (owned or team member)."""
    return get_user_project_ids(user_id)


def _actor(user) -> str:
    """Human-readable actor for timeline events (embed in text, no schema change)."""
    return getattr(user, "email", None) or str(getattr(user, "id", "unknown"))


def _timeline(incident_id: str, event: str, event_type: str) -> None:
    """Append a timeline row. Failures are non-fatal (mirrors _security_audit)."""
    try:
        supabase.table("incident_timeline").insert({
            "incident_id": incident_id,
            "event": event,
            "type": event_type,
        }).execute()
    except Exception as exc:
        logger.warning("timeline insert failed: %s", exc)


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

    # Feedback history (newest first). Missing table = pre-migration graceful skip.
    try:
        fb_res = supabase.table("incident_feedback").select("*").eq(
            "incident_id", incident_id).order("created_at", desc=True).execute()
        incident["feedback"] = fb_res.data or []
    except Exception as exc:
        logger.warning("incident_feedback read skipped (run incident_feedback_schema.sql): %s", exc)
        incident["feedback"] = []

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

    # Fan out to connected collaboration plugins (best-effort)
    try:
        from services.notify_fanout import fanout_incident

        await fanout_incident({**res.data[0], "project_id": body.project_id})
    except Exception:
        pass
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
    _timeline(incident_id, f"Incident resolved by {_actor(current_user)}", "resolve")

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
    _timeline(
        incident_id,
        f"Ignored by {_actor(current_user)}: {ignored_reason or 'no reason given'}",
        "ignore",
    )

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
    _timeline(
        incident_id,
        f"Comment added by {user_name}: {body.content[:60]}",
        "comment",
    )
    return comment_res.data[0] if comment_res.data else {"success": True}


@router.post("/{incident_id}/feedback")
async def submit_feedback(
    incident_id: str,
    body: FeedbackUpdate,
    current_user=Depends(get_current_user),
):
    """Submit feedback for an incident — history row + latest-column mirror."""
    project_ids = _user_project_ids(str(current_user.id))
    inc = supabase.table("incidents").select("project_id").eq("id", incident_id).single().execute()
    if not inc.data or inc.data.get("project_id") not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    # Keep legacy "latest" columns in sync (old readers keep working).
    updates: dict = {"feedback_is_real": body.is_real}
    if body.comment is not None:
        updates["feedback_comment"] = body.comment
    supabase.table("incidents").update(updates).eq("id", incident_id).execute()

    # History row so "who said what" survives; missing table = pre-migration fallback.
    row: dict = {
        "incident_id": incident_id,
        "user_id": str(current_user.id),
        "user_name": getattr(current_user, "email", "") or str(current_user.id),
        "is_real": body.is_real,
        "comment": body.comment or "",
    }
    try:
        fb_res = supabase.table("incident_feedback").insert(row).execute()
        if fb_res.data:
            row = dict(fb_res.data[0])
    except Exception as exc:
        logger.warning("incident_feedback insert skipped (run incident_feedback_schema.sql): %s", exc)

    _timeline(
        incident_id,
        f"Feedback by {_actor(current_user)}: "
        + ("real incident" if body.is_real else "false positive"),
        "feedback",
    )
    return row


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

    # Assign trail: only when the assignee actually changed.
    new_assignee = updates.get("assigned_to")
    if new_assignee is not None and new_assignee != inc.data.get("assigned_to"):
        _timeline(
            incident_id,
            f"Assigned to {new_assignee} by {_actor(current_user)}",
            "assign",
        )

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


@router.post("/{incident_id}/remediation", summary="AI-generated remediation for one incident")
async def remediate_incident(incident_id: str, current_user=Depends(get_current_user)):
    """Generate remediation steps from the incident's live fields (cached per incident).

    Steps reference the actual error, failed stage, provider, and log lines —
    never canned seed text. Falls back to a labeled-generic list only when the
    AI backend is unreachable.
    """
    project_ids = _user_project_ids(str(current_user.id))
    inc = supabase.table("incidents").select("*").eq("id", incident_id).single().execute()
    if not inc.data or inc.data.get("project_id") not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    incident = inc.data

    cached = await ai_service.get_cached(incident_id)
    if cached:
        return {"steps": cached.get("steps", []), "cached": True, "generic": False}

    deployment: dict = {}
    failed_stage = ""
    if incident.get("deployment_id"):
        try:
            dep = supabase.table("deployments").select(
                "error_message,provider,branch,version,stages").eq(
                "id", incident["deployment_id"]).single().execute()
            if dep.data:
                deployment = dep.data
                stages = deployment.get("stages") or []
                if isinstance(stages, str):
                    try:
                        import json as _json
                        stages = _json.loads(stages)
                    except Exception:
                        stages = []
                failed = next((s for s in stages
                               if isinstance(s, dict) and s.get("status") == "failed"), None)
                failed_stage = str((failed or {}).get("name") or "")
        except Exception as exc:
            logger.debug("remediation deployment lookup skipped: %s", exc)

    context = {
        "title": incident.get("title", ""),
        "description": incident.get("description", ""),
        "error_message": deployment.get("error_message") or incident.get("description") or "",
        "failed_stage": failed_stage,
        "provider": deployment.get("provider") or incident.get("provider") or "",
        "branch": deployment.get("branch") or "",
        "deployment_version": deployment.get("version") or "",
        "incident_severity": incident.get("severity") or "",
        "user_question": "Give step-by-step remediation for this specific incident.",
    }
    try:
        result = await ai_service.analyze_incident(context)
        await ai_service.cache(incident_id, result)
        return {"steps": result.get("steps", []), "cached": False, "generic": False}
    except Exception as exc:
        logger.warning("remediation generation failed: %s", exc)
        return {"steps": [
            {"title": "Inspect runtime logs", "description": "Check application and provider logs for errors."},
            {"title": "Verify environment configuration", "description": "Confirm required variables and credentials."},
            {"title": "Mark incident as resolved", "description": "Verify system health first."},
        ], "cached": False, "generic": True}

    return incident
