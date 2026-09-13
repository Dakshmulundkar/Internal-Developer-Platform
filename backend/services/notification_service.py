"""Notification creation and WebSocket broadcast helper."""

import logging

from database import supabase

logger = logging.getLogger(__name__)


async def create_notification(
    user_id: str,
    title: str,
    message: str,
    type: str,
    project_id: str = None,
    incident_id: str = None,
    deployment_id: str = None,
) -> None:
    """Persist a notification row and push it to the user's WebSocket (if connected)."""
    row: dict = {
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": type,
    }
    if project_id:
        row["project_id"] = project_id
    if incident_id:
        row["incident_id"] = incident_id
    if deployment_id:
        row["deployment_id"] = deployment_id

    saved_id = None
    try:
        res = supabase.table("notifications").insert(row).execute()
        if res.data:
            saved_id = res.data[0].get("id")
    except Exception as exc:
        logger.warning("create_notification DB insert failed: %s", exc)

    # Broadcast the full notification via WebSocket
    try:
        from main import broadcast_to_user

        notif_data = {**row, "id": saved_id, "read": False}
        # Remove None values
        notif_data = {k: v for k, v in notif_data.items() if v is not None}
        await broadcast_to_user(str(user_id), "notification.new", notif_data)
    except Exception as exc:
        logger.debug("WebSocket broadcast skipped: %s", exc)
