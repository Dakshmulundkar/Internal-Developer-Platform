"""Pydantic models for rollback resources."""

from typing import Any, List

from pydantic import BaseModel


class RollbackRequest(BaseModel):
    project_id: str
    target_deployment_id: str


class RollbackResponse(BaseModel):
    rollback_id: str
    status: str
    audit_logs: List[Any] = []
