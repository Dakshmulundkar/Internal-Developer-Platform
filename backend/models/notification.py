"""Pydantic models for notification resources."""

from typing import Optional

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    title: Optional[str] = None
    message: Optional[str] = None
    type: Optional[str] = None
    project_id: Optional[str] = None
    incident_id: Optional[str] = None
    deployment_id: Optional[str] = None
    read: bool = False
    created_at: Optional[str] = None
