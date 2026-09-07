"""Pydantic models for incident resources."""

from typing import Any, List, Optional

from pydantic import BaseModel


class IncidentCreate(BaseModel):
    project_id: str
    deployment_id: Optional[str] = None
    severity: str = "high"
    provider: Optional[str] = None
    title: str
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    suggested_action: Optional[str] = None


class IncidentUpdate(BaseModel):
    severity: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    ignored_reason: Optional[str] = None
    feedback_is_real: Optional[bool] = None
    feedback_comment: Optional[str] = None
    suggested_action: Optional[str] = None


class CommentCreate(BaseModel):
    content: str


class FeedbackUpdate(BaseModel):
    is_real: bool
    comment: Optional[str] = None


class IncidentResponse(BaseModel):
    id: str
    project_id: str
    deployment_id: Optional[str] = None
    severity: Optional[str] = None
    provider: Optional[str] = None
    title: str
    description: Optional[str] = None
    status: str = "open"
    assigned_to: Optional[str] = None
    ignored_reason: Optional[str] = None
    feedback_is_real: Optional[bool] = None
    feedback_comment: Optional[str] = None
    suggested_action: Optional[str] = None
    resolved_at: Optional[str] = None
    created_at: Optional[str] = None
    comments: List[Any] = []
    timeline: List[Any] = []
