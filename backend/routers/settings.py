"""Settings router — notification preferences and user preferences."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from database import supabase
from dependencies import get_current_user
from config import settings as app_settings
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

NOW = lambda: datetime.now(timezone.utc).isoformat()


@router.get("/security")
async def get_security_config(current_user=Depends(get_current_user)):
    """Security triage webhook status (secret configured + target path).

    The webhook secret lives in backend env (GITHUB_WEBHOOK_SECRET) and is never
    returned — only whether it is configured and the URL the CI workflow posts to.
    """
    return {
        "configured": bool(app_settings.GITHUB_WEBHOOK_SECRET),
        "usage": "Set GITHUB_WEBHOOK_SECRET in the backend environment to enable X-Hub-Signature-256 verification.",
        "webhook_path": "/webhooks/github/security/{service_id}",
    }


class NotificationPreferences(BaseModel):
    email_notifications: bool = True
    incident_created: bool = True
    incident_escalated: bool = True
    deployment_failed: bool = True
    rollback_completed: bool = True
    mention_received: bool = True
    daily_digest: bool = False
    weekly_digest: bool = False


class UserPreferences(BaseModel):
    theme: str = "dark"
    timezone: str = "UTC"
    dashboard_layout: list = []


@router.get("/notifications")
async def get_notification_preferences(current_user=Depends(get_current_user)):
    """Get notification preferences for the current user."""
    user_id = str(current_user.id)
    res = supabase.table("notification_preferences").select("*").eq("user_id", user_id).execute()
    if res.data and res.data[0]:
        return res.data[0]
    return {
        "email_notifications": True,
        "incident_created": True,
        "incident_escalated": True,
        "deployment_failed": True,
        "rollback_completed": True,
        "mention_received": True,
        "daily_digest": False,
        "weekly_digest": False,
    }


@router.post("/notifications")
async def save_notification_preferences(body: NotificationPreferences, current_user=Depends(get_current_user)):
    """Save notification preferences for the current user."""
    user_id = str(current_user.id)
    data = body.model_dump()
    res = supabase.table("notification_preferences").upsert({
        "user_id": user_id,
        **data,
        "updated_at": NOW(),
    }).execute()
    return res.data[0] if res.data else {"success": True}


@router.get("/preferences")
async def get_user_preferences(current_user=Depends(get_current_user)):
    """Get user preferences (theme, timezone, dashboard layout)."""
    user_id = str(current_user.id)
    res = supabase.table("user_preferences").select("*").eq("user_id", user_id).execute()
    if res.data and res.data[0]:
        return res.data[0]
    return {"theme": "dark", "timezone": "UTC", "dashboard_layout": []}


@router.post("/preferences")
async def save_user_preferences(body: UserPreferences, current_user=Depends(get_current_user)):
    """Save user preferences."""
    user_id = str(current_user.id)
    data = body.model_dump()
    res = supabase.table("user_preferences").upsert({
        "user_id": user_id,
        **data,
        "updated_at": NOW(),
    }).execute()
    return res.data[0] if res.data else {"success": True}