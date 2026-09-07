"""Projects router — full CRUD implementation."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from database import supabase
from dependencies import get_current_user
from models.project import ProjectCreate, ProjectResponse, ProjectUpdate
from services import audit_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=list[ProjectResponse])
async def list_projects(current_user=Depends(get_current_user)):
    """Return all projects owned by the authenticated user."""
    res = supabase.table("projects").select("*").eq("owner_id", str(current_user.id)).execute()
    return res.data or []


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate, current_user=Depends(get_current_user)):
    """Insert a new project and return the created row."""
    payload = body.model_dump()
    payload["owner_id"] = str(current_user.id)
    res = supabase.table("projects").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create project")
    project = res.data[0]
    await audit_service.log(
        user_id=str(current_user.id),
        user_name=getattr(current_user, "email", ""),
        action="project.created",
        details=f"Created project '{project.get('name')}'",
        project_id=project.get("id"),
    )
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, current_user=Depends(get_current_user)):
    """Fetch a single project — 404 if not found or not owned by the user."""
    res = supabase.table("projects").select("*").eq("id", project_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    project = res.data
    if project.get("owner_id") != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str, body: ProjectUpdate, current_user=Depends(get_current_user)
):
    """Partially update a project."""
    # Ownership check
    existing = supabase.table("projects").select("owner_id").eq("id", project_id).single().execute()
    if not existing.data or existing.data.get("owner_id") != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return existing.data

    res = supabase.table("projects").update(updates).eq("id", project_id).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Update failed")
    await audit_service.log(
        user_id=str(current_user.id),
        user_name=getattr(current_user, "email", ""),
        action="project.updated",
        details=f"Updated project {project_id}",
        project_id=project_id,
    )
    return res.data[0]


@router.delete("/{project_id}")
async def delete_project(project_id: str, current_user=Depends(get_current_user)):
    """Delete a project owned by the authenticated user."""
    existing = supabase.table("projects").select("owner_id").eq("id", project_id).single().execute()
    if not existing.data or existing.data.get("owner_id") != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    supabase.table("projects").delete().eq("id", project_id).execute()
    await audit_service.log(
        user_id=str(current_user.id),
        user_name=getattr(current_user, "email", ""),
        action="project.deleted",
        details=f"Deleted project {project_id}",
        project_id=project_id,
    )
    return {"success": True}
