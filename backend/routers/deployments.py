"""Deployments router — list and sync."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from config import settings
from database import supabase
from dependencies import get_current_user, get_user_project_ids
from models.deployment import DeploymentResponse
from services import netlify_service, vercel_service
from validators import is_valid_uuid

logger = logging.getLogger(__name__)
router = APIRouter()

import httpx


def _user_project_ids(user_id: str) -> list[str]:
    # Delegate to shared helper in dependencies.py
    return get_user_project_ids(user_id)


@router.get("", response_model=list[DeploymentResponse])
async def list_deployments(project_id: str = None, current_user=Depends(get_current_user)):
    """Return deployments belonging to the authenticated user's projects."""
    user_id = str(current_user.id)
    project_ids = _user_project_ids(user_id)
    if not project_ids:
        return []

    query = supabase.table("deployments").select("*").in_("project_id", project_ids)
    if project_id:
        if is_valid_uuid(project_id):
            query = query.eq("project_id", project_id)
        else:
            p_res = supabase.table("projects").select("id").eq("name", project_id).in_("id", project_ids).execute()
            if p_res.data:
                query = query.eq("project_id", p_res.data[0]["id"])
            else:
                return []
    res = query.order("created_at", desc=True).execute()
    existing_deployments = res.data or []

    # If no deployments exist in DB, don't fabricate fake records.
    # Real deployments come from provider sync (/sync/{project_id}) or webhooks.
    return existing_deployments


@router.get("/{deployment_id}", response_model=DeploymentResponse)
async def get_deployment(deployment_id: str, current_user=Depends(get_current_user)):
    """Fetch deployment by internal UUID or external_event_id."""
    project_ids = _user_project_ids(str(current_user.id))
    if not project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found")

    if is_valid_uuid(deployment_id):
        res = supabase.table("deployments").select("*").eq("id", deployment_id).in_("project_id", project_ids).execute()
    else:
        res = supabase.table("deployments").select("*").eq("external_event_id", deployment_id).in_("project_id", project_ids).execute()

    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found")
    return res.data[0]


@router.get("/sync/{project_id}")
async def sync_deployments(project_id: str, current_user=Depends(get_current_user)):
    """Fetch latest deployments from provider or live endpoint and upsert them into Supabase."""
    user_id = str(current_user.id)
    project_ids = _user_project_ids(user_id)
    if not project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if not is_valid_uuid(project_id):
        # Resolve project by name within the user's accessible projects
        p_res = supabase.table("projects").select("*").eq("name", project_id).in_("id", project_ids).execute()
        if p_res.data:
            project = p_res.data[0]
            project_id = project["id"]
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid project ID format: {project_id}")
    else:
        proj_res = supabase.table("projects").select("*").eq("id", project_id).execute()
        if not proj_res.data or project_id not in project_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        project = proj_res.data[0]

    # Check Vercel plugin installation
    pi_res = supabase.table("plugin_installations").select("*").eq("installed_by", user_id).eq("plugin_id", "vercel").execute()
    vercel_pi = pi_res.data[0] if pi_res.data else {}

    raw_selector = vercel_pi.get("project_selector") or project.get("vercel_project_id") or project.get("name") or ""
    clean_selector = raw_selector.replace("https://", "").replace("http://", "").strip().rstrip("/")
    if clean_selector.endswith(".vercel.app"):
        clean_selector = clean_selector[:-11]

    token = getattr(settings, "VERCEL_API_TOKEN", "") or vercel_pi.get("api_key_encrypted") or ""
    if "••••" in token:
        token = ""

    deployments: list = []

    # 1. Attempt Vercel API if token available
    if token and clean_selector:
        try:
            deployments = await vercel_service.fetch_deployments(clean_selector, token)
        except Exception as exc:
            logger.warning("Vercel API fetch failed for %s: %s", clean_selector, exc)

    # 2. No fallback fabrication — return whatever the provider actually returned
    synced = 0
    for dep in deployments:
        dep["project_id"] = project_id
        try:
            supabase.table("deployments").upsert(dep, on_conflict="external_event_id").execute()
            synced += 1
        except Exception as exc:
            logger.warning("Upsert failed for deployment %s: %s", dep.get("external_event_id"), exc)

    return {"synced": synced, "deployments": deployments}
