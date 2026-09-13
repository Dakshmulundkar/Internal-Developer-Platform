"""Notifications router — list and mark-read endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from database import supabase
from dependencies import get_current_user
from models.notification import NotificationResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(current_user=Depends(get_current_user)):
    """Return all notifications for the authenticated user, newest first."""
    res = (
        supabase.table("notifications")
        .select("*")
        .eq("user_id", str(current_user.id))
        .order("created_at", desc=True)
        .execute()
    )
    rows = res.data or []
    # Flatten the JSONB `data` payload into top-level fields (team_member_id,
    # project_id, project_name, invite_token, …) so the frontend can render
    # invite actions (Accept/Decline needs the token) without knowing the exact
    # column layout.
    for row in rows:
        payload = row.get("data")
        if isinstance(payload, dict):
            for key in ("project_id", "incident_id", "deployment_id", "team_member_id", "project_name", "invite_token", "role"):
                if payload.get(key) is not None and row.get(key) is None:
                    row[key] = payload[key]
    return rows


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: str, current_user=Depends(get_current_user)):
    """Mark a single notification as read."""
    notif = supabase.table("notifications").select("user_id").eq("id", notification_id).single().execute()
    if not notif.data or notif.data.get("user_id") != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    supabase.table("notifications").update({"read": True}).eq("id", notification_id).execute()
    return {"success": True}


@router.patch("/read-all")
async def mark_all_read(current_user=Depends(get_current_user)):
    """Mark all of the authenticated user's notifications as read."""
    supabase.table("notifications").update({"read": True}).eq("user_id", str(current_user.id)).execute()
    return {"success": True}
