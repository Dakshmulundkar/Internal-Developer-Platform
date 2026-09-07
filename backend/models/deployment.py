"""Pydantic models for deployment resources."""

from typing import Optional

from pydantic import BaseModel


class DeploymentResponse(BaseModel):
    id: str
    project_id: str
    version: Optional[str] = None
    status: Optional[str] = None
    commit_hash: Optional[str] = None
    commit_message: Optional[str] = None
    branch: Optional[str] = None
    author: Optional[str] = None
    provider: Optional[str] = None
    url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None
