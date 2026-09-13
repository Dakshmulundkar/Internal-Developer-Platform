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
    project_name: Optional[str] = None  # flattened from data.project_name
    incident_id: Optional[str] = None
    deployment_id: Optional[str] = None
    team_member_id: Optional[str] = None  # flattened from data.team_member_id (team invites)
    invite_token: Optional[str] = None  # flattened from data.invite_token (team invites — needed to accept/decline)
    role: Optional[str] = None  # flattened from data.role (team invites)
    data: Optional[dict] = None  # raw JSONB payload (invite_token etc.)
    read: bool = False
    created_at: Optional[str] = None
