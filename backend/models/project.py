"""Pydantic models for project resources."""

from typing import Optional

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    repo_owner: Optional[str] = None
    repo_name: Optional[str] = None
    branch: str = "main"
    provider: str  # 'vercel' | 'netlify'
    vercel_project_id: Optional[str] = None
    netlify_site_id: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    repo_owner: Optional[str] = None
    repo_name: Optional[str] = None
    branch: Optional[str] = None
    provider: Optional[str] = None
    vercel_project_id: Optional[str] = None
    netlify_site_id: Optional[str] = None
    status: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    repo_owner: Optional[str] = None
    repo_name: Optional[str] = None
    branch: str = "main"
    provider: str
    environment: str = "production"
    status: str = "queued"
    owner_id: str
    vercel_project_id: Optional[str] = None
    netlify_site_id: Optional[str] = None
    created_at: Optional[str] = None
