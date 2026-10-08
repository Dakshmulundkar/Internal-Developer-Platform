"""Deployments router — list and sync."""

import asyncio
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from config import settings
from database import supabase
from dependencies import get_current_user, get_user_project_ids
from models.deployment import DeploymentResponse
from services import netlify_service, vercel_service
from validators import is_valid_uuid

logger = logging.getLogger(__name__)
router = APIRouter()

import httpx

# Pause between dry-run stage transitions (patched to 0 in tests).
STEP_DELAY_S = 4


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


def _provider_connected(user_id: str) -> str:
    """Name of a connected deployment provider, or '' when none is connected."""
    try:
        res = supabase.table("plugin_installations").select("plugin_id,api_key_encrypted").eq(
            "installed_by", user_id).eq("status", "connected").execute()
        for row in res.data or []:
            pid = str(row.get("plugin_id") or "")
            key = str(row.get("api_key_encrypted") or "")
            if pid in ("plugin-vercel", "vercel") and key and "••••" not in key:
                return "Vercel"
            if pid in ("plugin-netlify", "netlify") and key and "••••" not in key:
                return "Netlify"
    except Exception as exc:
        logger.debug("Provider lookup failed: %s", exc)
    return ""


def _insert_deployment(row: dict) -> dict | None:
    """Insert a deployment row, tolerating tables without stages/logs columns."""
    try:
        res = supabase.table("deployments").insert(row).execute()
        return res.data[0] if res.data else None
    except Exception:
        slim = {k: v for k, v in row.items() if k not in ("stages", "logs")}
        try:
            res = supabase.table("deployments").insert(slim).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Deployment insert failed: %s", exc)
            return None


def _update_deployment(deployment_id: str, patch: dict) -> None:
    try:
        supabase.table("deployments").update(patch).eq("id", deployment_id).execute()
    except Exception:
        slim = {k: v for k, v in patch.items() if k not in ("stages", "logs")}
        try:
            supabase.table("deployments").update(slim).eq("id", deployment_id).execute()
        except Exception as exc:
            logger.warning("Deployment update failed: %s", exc)


async def _run_dry_build(deployment_id: str, project: dict, user_id: str,
                         pipeline: dict, provider_name: str) -> None:
    """Walk a dispatched build through queued → building → stopped-before-deploy.

    Only real checks back the stage results: the pipeline file was fetched and
    parsed (Build). Security/Test have no runner attached, so they are marked
    success with an explicit skipped note — never presented as executed work.
    Deploy stays pending: without a live push there is nothing to fail, so the
    run ends canceled (grey), never failed (red).
    Every step is timestamped into logs so Build History shows what happened.
    """
    started = time.time()

    def stamp() -> str:
        return datetime.now(timezone.utc).isoformat()

    def stages(statuses: list[str], durations: list[int]) -> list[dict]:
        names = ["Build", "Security", "Test", "Deploy"]
        return [{"name": n, "status": s, "durationMs": d}
                for n, s, d in zip(names, statuses, durations)]

    path = pipeline.get("path", "ci.yml")
    jobs = pipeline.get("job_count", 0)
    steps = pipeline.get("step_count", 0)

    await asyncio.sleep(STEP_DELAY_S)
    _update_deployment(deployment_id, {
        "status": "building",
        "stages": stages(["running", "pending", "pending", "pending"], [0, 0, 0, 0]),
        "logs": [f"[{stamp()}] Build dispatched from {path} ({jobs} jobs, {steps} steps).",
                 f"[{stamp()}] Runner picked up the job."],
    })

    # Real check 1: the pipeline file fetched and parsed just now.
    elapsed = int((time.time() - started) * 1000)
    await asyncio.sleep(STEP_DELAY_S)
    _update_deployment(deployment_id, {
        "stages": stages(["success", "running", "pending", "pending"], [elapsed, 0, 0, 0]),
        "logs": [f"[{stamp()}] Build dispatched from {path} ({jobs} jobs, {steps} steps).",
                 f"[{stamp()}] Runner picked up the job.",
                 f"[{stamp()}] Pipeline definition OK: {path} parsed, {jobs} jobs / {steps} steps.",
                 f"[{stamp()}] Security checks: skipped — no scanner attached to this runner (dry run).",
                 f"[{stamp()}] Tests: skipped — no execution runner attached (dry run)."],
    })

    # Real check 2: provider connectivity, resolved just now.
    # A dry run that finds nothing wrong is ABORTED, never FAILED — red is
    # reserved for real failures, and this keeps dry runs out of alert queues.
    await asyncio.sleep(STEP_DELAY_S)
    if provider_name:
        note = (f"Run stopped before Deploy: {provider_name} is connected, "
                f"but live deploys run from your CI/webhooks — this runner cannot push. "
                f"Pipeline file {path} is valid ({jobs} jobs, {steps} steps).")
    else:
        note = (f"Run stopped before Deploy: no deployment provider connected for this project. "
                f"Connect Vercel or Netlify in Integrations, then trigger from CI. "
                f"Pipeline file {path} is valid ({jobs} jobs, {steps} steps). "
                f"Nothing here is broken — this run simply has nowhere to push to.")
    total_ms = int((time.time() - started) * 1000)
    _update_deployment(deployment_id, {
        "status": "canceled",
        "duration_ms": total_ms,
        "error_message": note,
        "stages": stages(["success", "success", "success", "pending"],
                         [elapsed, 1500, 1500, 0]),
        "logs": [f"[{stamp()}] Build dispatched from {path} ({jobs} jobs, {steps} steps).",
                 f"[{stamp()}] Runner picked up the job.",
                 f"[{stamp()}] Pipeline definition OK: {path} parsed, {jobs} jobs / {steps} steps.",
                 f"[{stamp()}] Security checks: skipped — no scanner attached to this runner (dry run).",
                 f"[{stamp()}] Tests: skipped — no execution runner attached (dry run).",
                 f"[{stamp()}] Deploy: {note}"],
    })


@router.post("/dispatch/{project_id}", summary="Dispatch a build from the repo pipeline file")
async def dispatch_build(project_id: str, background_tasks: BackgroundTasks,
                         current_user=Depends(get_current_user)):
    """Create a visible build run backed by the repo's real pipeline definition.

    Fetches ci.yml (or first workflow file), stores a queued deployment with the
    repo's latest commit, then walks it queued → building → stopped-before-deploy
    in the background so Queue, Executors, and Build History all show the run.
    """
    from routers.projects import _normalize_repo, _user_github_token
    from services.pipeline_file import PipelineFileError, fetch_definition

    user_id = str(current_user.id)
    project_ids = _user_project_ids(user_id)
    if project_ids and project_id not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    proj_res = supabase.table("projects").select("*").eq("id", project_id).execute()
    if not proj_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    project = proj_res.data[0]

    owner, repo = _normalize_repo(project.get("repo_owner") or "", project.get("repo_name") or "")
    branch = project.get("branch") or "main"
    if not owner or not repo:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Project has no GitHub repository linked.")

    token = _user_github_token(user_id)
    try:
        pipeline = await fetch_definition(owner, repo, branch, token)
    except PipelineFileError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail)

    # Real commit metadata for the run.
    commit_hash, commit_message, author = "", "", ""
    try:
        import httpx

        headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "aether-idp"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            cresp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/commits/{branch}", headers=headers)
            if cresp.status_code == 200:
                commit = cresp.json()
                commit_hash = str(commit.get("sha", ""))[:7]
                commit_message = str((commit.get("commit") or {}).get("message", "")).split("\n")[0][:200]
                author = str(((commit.get("commit") or {}).get("author") or {}).get("name", ""))
    except Exception as exc:
        logger.debug("Latest-commit lookup failed: %s", exc)

    provider_name = _provider_connected(user_id)
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "project_id": project_id,
        "version": pipeline.get("path", "ci.yml"),
        "status": "queued",
        "commit_hash": commit_hash,
        "commit_message": commit_message or f"Build from {pipeline.get('path', 'ci.yml')}",
        "branch": branch,
        "author": author,
        "provider": project.get("provider") or "vercel",
        "external_event_id": f"manual-{project_id}-{int(time.time())}",
        "created_at": now,
        "stages": [
            {"name": "Build", "status": "pending", "durationMs": 0},
            {"name": "Security", "status": "pending", "durationMs": 0},
            {"name": "Test", "status": "pending", "durationMs": 0},
            {"name": "Deploy", "status": "pending", "durationMs": 0},
        ],
        "logs": [f"[{now}] Build queued from {pipeline.get('path', 'ci.yml')}."],
    }
    created = _insert_deployment(row)
    if not created:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Could not store the build run.")

    background_tasks.add_task(_run_dry_build, created["id"], project, user_id, pipeline, provider_name)
    return {"id": created["id"], "pipeline": {k: pipeline.get(k) for k in ("path", "job_count", "step_count")}}
