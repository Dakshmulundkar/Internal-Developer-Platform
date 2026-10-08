"""Projects router — full CRUD implementation."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from database import supabase
from dependencies import get_current_user, get_user_project_ids
from models.project import ProjectCreate, ProjectResponse, ProjectUpdate
from services import audit_service
from services.pipeline_file import PipelineFileError, check_repo, fetch_definition
from services.plugins import crypto

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=list[ProjectResponse])
async def list_projects(current_user=Depends(get_current_user)):
    """Return all projects accessible to the authenticated user.

    A project is accessible when the user owns it OR when they are an ACCEPTED
    member of that project's team. Accepted team invites must make the shared
    project appear here, otherwise the invitee never sees it after accepting.
    """
    accessible_ids = get_user_project_ids(str(current_user.id))
    if not accessible_ids:
        return []
    res = supabase.table("projects").select("*").in_("id", accessible_ids).execute()
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
    """Fetch a single project — 404 if not found or the user lacks access.

    Access is granted to the owner and to ACCEPTED team members, matching the
    list endpoint so invitees can open the project they just joined.
    """
    res = supabase.table("projects").select("*").eq("id", project_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    project = res.data
    if project.get("owner_id") != str(current_user.id):
        accessible_ids = get_user_project_ids(str(current_user.id))
        if project_id not in accessible_ids:
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


def _normalize_repo(owner: str, repo: str) -> tuple[str, str]:
    """Accept a full URL, `owner/repo`, or a bare name — always return (owner, repo).

    Users paste whatever the onboarding form accepted, e.g.
    `https://github.com/Dakshmulundkar/Internal-Developer-Platform.git`.
    """
    text = (repo or "").strip()
    # Full URL form.
    if "://" in text:
        parts = [p for p in text.rstrip("/").split("/") if p]
        if len(parts) >= 2:
            owner = owner or parts[-2]
            text = parts[-1]
    # `owner/repo` form.
    if "/" in text:
        maybe_owner, maybe_repo = text.split("/", 1)
        owner = owner or maybe_owner
        text = maybe_repo
    if text.endswith(".git"):
        text = text[:-4]
    return owner.strip(), text.strip()


def _user_github_token(user_id: str) -> str:
    """Decrypt the user's GitHub plugin token, if they connected GitHub."""
    try:
        res = supabase.table("plugin_installations").select("api_key_encrypted,plugin_id").eq(
            "installed_by", user_id).execute()
        for row in res.data or []:
            if "github" in str(row.get("plugin_id") or ""):
                token = crypto.decrypt_key(row.get("api_key_encrypted"))
                if token and "••••" not in token:
                    return token
    except Exception as exc:
        logger.debug("GitHub token lookup failed: %s", exc)
    return ""


@router.get("/{project_id}/pipeline-file", summary="Fetch the project's CI workflow file from GitHub")
async def get_pipeline_file(project_id: str, current_user=Depends(get_current_user)):
    """Return the repo's pipeline definition (ci.yml or first workflow file).

    Looks up `.github/workflows/ci.yml` (then siblings), falling back to the
    first `.yml`/`.yaml` file in `.github/workflows`. Parses jobs/steps so the
    frontend can show what a build would run. Tokens stay server-side.
    """
    user_id = str(current_user.id)
    res = supabase.table("projects").select("*").eq("id", project_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    project = res.data
    if project.get("owner_id") != user_id and project_id not in get_user_project_ids(user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    owner, repo = project.get("repo_owner") or "", project.get("repo_name") or ""
    branch = project.get("branch") or "main"
    # Normalize: repo_name may hold a full URL, `owner/repo`, or a bare name
    # (users paste whatever the onboarding form accepted).
    owner, repo = _normalize_repo(owner, repo)
    if not owner or not repo:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Project has no GitHub repository linked.")

    token = _user_github_token(user_id)

    try:
        await check_repo(owner, repo, branch, token)
        return await fetch_definition(owner, repo, branch, token)
    except PipelineFileError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail)
