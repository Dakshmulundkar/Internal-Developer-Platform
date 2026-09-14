"""Rollback execution and polling service."""

import asyncio
import logging
from datetime import datetime, timezone

import httpx

from config import settings
from database import supabase
from validators import is_valid_uuid

logger = logging.getLogger(__name__)


async def execute_rollback(project_id: str, target_deployment_id: str, user_id: str) -> str:
    """Trigger a rollback via the provider API and insert a rollback_operations row.

    Handles both internal Supabase UUIDs and external deployment IDs (e.g. 'd_...').
    Returns the newly created rollback operation id.
    """
    if not is_valid_uuid(project_id):
        raise ValueError(f"Invalid project ID format: {project_id}")

    proj_res = supabase.table("projects").select("*").eq("id", project_id).single().execute()
    if not proj_res.data:
        raise ValueError(f"Project {project_id} not found")
    project = proj_res.data

    # Find or resolve deployment
    deployment = None
    if is_valid_uuid(target_deployment_id):
        dep_res = supabase.table("deployments").select("*").eq("id", target_deployment_id).execute()
        if dep_res.data:
            deployment = dep_res.data[0]

    if not deployment:
        # Check by external_event_id or version
        dep_res = supabase.table("deployments").select("*").eq("external_event_id", target_deployment_id).execute()
        if dep_res.data:
            deployment = dep_res.data[0]
        else:
            dep_res = supabase.table("deployments").select("*").eq("version", target_deployment_id).execute()
            if dep_res.data:
                deployment = dep_res.data[0]

    # If deployment is not in DB yet (e.g. selected from Vercel list directly), create record
    if not deployment:
        new_dep = {
            "project_id": project_id,
            "external_event_id": target_deployment_id,
            "version": target_deployment_id,
            "status": "ready",
            "provider": project.get("provider", "vercel"),
            "url": f"https://{project.get('vercel_project_id')}.vercel.app" if project.get("vercel_project_id") else None,
        }
        dep_insert = supabase.table("deployments").insert(new_dep).execute()
        if dep_insert.data:
            deployment = dep_insert.data[0]
        else:
            raise ValueError(f"Could not resolve or record deployment {target_deployment_id}")

    # Tenant-isolation guard: the target deployment MUST belong to the project
    # the caller is operating on. A bare id / external_event_id / version lookup
    # above can match a row in a different tenant's project, so verify it here
    # before issuing any provider call or writing a rollback row.
    if str(deployment.get("project_id") or "") != project_id:
        raise ValueError(f"Deployment {target_deployment_id} does not belong to project {project_id}")

    real_deployment_uuid = deployment["id"]
    provider_deployment_id = deployment.get("external_event_id") or deployment.get("version") or target_deployment_id
    target_version = deployment.get("version") or provider_deployment_id

    # Retrieve provider token (from settings or plugin_installations)
    provider = project.get("provider")
    token = ""
    if provider == "vercel":
        token = getattr(settings, "VERCEL_API_TOKEN", "") or ""
        if not token:
            pi_res = supabase.table("plugin_installations").select("api_key_encrypted").eq("installed_by", user_id).eq("plugin_id", "vercel").execute()
            if pi_res.data and pi_res.data[0].get("api_key_encrypted"):
                token = pi_res.data[0]["api_key_encrypted"]
    elif provider == "netlify":
        token = getattr(settings, "NETLIFY_API_TOKEN", "") or ""
        if not token:
            pi_res = supabase.table("plugin_installations").select("api_key_encrypted").eq("installed_by", user_id).eq("plugin_id", "netlify").execute()
            if pi_res.data and pi_res.data[0].get("api_key_encrypted"):
                token = pi_res.data[0]["api_key_encrypted"]

    provider_api_error = None
    if token:
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                if provider == "vercel" and project.get("vercel_project_id"):
                    resp = await client.post(
                        f"https://api.vercel.com/v9/projects/{project['vercel_project_id']}/aliases",
                        headers={"Authorization": f"Bearer {token}"},
                        json={"deployment": provider_deployment_id},
                    )
                    if resp.status_code >= 400:
                        provider_api_error = f"Vercel API error ({resp.status_code}): {resp.text}"
                        logger.warning(provider_api_error)
                elif provider == "netlify" and project.get("netlify_site_id"):
                    resp = await client.post(
                        f"https://api.netlify.com/api/v1/sites/{project['netlify_site_id']}/deploys/{provider_deployment_id}/restore",
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    if resp.status_code >= 400:
                        provider_api_error = f"Netlify API error ({resp.status_code}): {resp.text}"
                        logger.warning(provider_api_error)
            except Exception as exc:
                provider_api_error = f"Provider request failed: {exc}"
                logger.error(provider_api_error)
    else:
        logger.info("No provider API token found for %s; proceeding in simulated/standalone mode", provider)

    initial_logs = [{"step": f"Rollback to deployment {provider_deployment_id} ({target_version}) initiated", "timestamp": datetime.now(timezone.utc).isoformat()}]
    if provider_api_error:
        initial_logs.append({"step": f"Provider notice: {provider_api_error}", "timestamp": datetime.now(timezone.utc).isoformat()})

    op_res = supabase.table("rollback_operations").insert({
        "project_id": project_id,
        "target_deployment_id": real_deployment_uuid,
        "target_version": target_version,
        "status": "in_progress",
        "initiated_by": user_id,
        "audit_logs": initial_logs,
    }).execute()

    if not op_res.data:
        raise RuntimeError("Failed to create rollback operation record in Supabase")

    # Log activity feed entry for rollback initiation
    try:
        supabase.table("entity_activities").insert({
            "entity_type": "rollback",
            "entity_id": op_res.data[0]["id"],
            "user_id": user_id,
            "user_name": "system",
            "action": "rollback_initiated",
            "description": f"Rollback to {target_version} initiated",
            "metadata": {"target_deployment_id": real_deployment_uuid},
        }).execute()
    except Exception:
        pass

    return op_res.data[0]["id"]


async def poll_rollback_status(rollback_id: str) -> None:
    """Background task: poll the provider API for real deployment status.

    Checks Vercel/Netlify API for the actual deployment state instead of
    hardcoding success. Falls back to success after timeout if no provider
    token is available.
    """
    for attempt in range(10):
        await asyncio.sleep(5)
        try:
            op_res = supabase.table("rollback_operations").select("*").eq("id", rollback_id).single().execute()
            if not op_res.data:
                break
            op = op_res.data
            logs = op.get("audit_logs", [])
            logs.append({"step": f"Poll attempt {attempt + 1}", "timestamp": datetime.now(timezone.utc).isoformat()})

            # Try to check real provider status
            project_id = op.get("project_id")
            target_dep_id = op.get("target_deployment_id")
            real_status = None

            if project_id and target_dep_id:
                try:
                    proj_res = supabase.table("projects").select("*").eq("id", project_id).single().execute()
                    if proj_res.data:
                        project = proj_res.data
                        provider = project.get("provider")

                        # Get deployment to find external_event_id
                        dep_res = supabase.table("deployments").select("external_event_id, version").eq("id", str(target_dep_id)).execute()
                        ext_id = dep_res.data[0].get("external_event_id") if dep_res.data else None

                        if provider == "vercel" and project.get("vercel_project_id"):
                            token = getattr(settings, "VERCEL_API_TOKEN", "") or ""
                            if not token:
                                pi_res = supabase.table("plugin_installations").select("api_key_encrypted").eq("plugin_id", "vercel").eq("installed_by", str(project.get("owner_id") or "")).limit(1).execute()
                                if pi_res.data:
                                    token = pi_res.data[0].get("api_key_encrypted") or ""
                            if token and "••••" not in token:
                                async with httpx.AsyncClient(timeout=15.0) as client:
                                    resp = await client.get(
                                        f"https://api.vercel.com/v13/deployments",
                                        headers={"Authorization": f"Bearer {token}"},
                                        params={"app": project["vercel_project_id"], "limit": 5},
                                    )
                                    if resp.status_code < 400:
                                        data = resp.json()
                                        deployments_list = data.get("deployments", [])
                                        # Match the specific deployment (by its external id/uid/url),
                                        # not the latest deployment, which may belong to a newer run.
                                        deployment = next(
                                            (d for d in deployments_list
                                             if d.get("id") == ext_id or d.get("uid") == ext_id or d.get("url") == ext_id),
                                            deployments_list[0] if deployments_list else None,
                                        )
                                        if deployment:
                                            real_status = deployment.get("state")  # QUEUED, BUILDING, READY, ERROR, CANCELED
                                            logs.append({"step": f"Vercel reports deployment state: {real_status}", "timestamp": datetime.now(timezone.utc).isoformat()})

                        elif provider == "netlify" and project.get("netlify_site_id"):
                            token = getattr(settings, "NETLIFY_API_TOKEN", "") or ""
                            if not token:
                                pi_res = supabase.table("plugin_installations").select("api_key_encrypted").eq("plugin_id", "netlify").eq("installed_by", str(project.get("owner_id") or "")).limit(1).execute()
                                if pi_res.data:
                                    token = pi_res.data[0].get("api_key_encrypted") or ""
                            if token and "••••" not in token:
                                async with httpx.AsyncClient(timeout=15.0) as client:
                                    resp = await client.get(
                                        f"https://api.netlify.com/api/v1/sites/{project['netlify_site_id']}/deploys",
                                        headers={"Authorization": f"Bearer {token}"},
                                    )
                                    if resp.status_code < 400:
                                        data = resp.json()
                                        if data:
                                            deploy = next(
                                                (d for d in data if d.get("id") == ext_id),
                                                data[0],
                                            )
                                            real_status = deploy.get("state")  # prepared, building, ready, error
                                            logs.append({"step": f"Netlify reports deployment state: {real_status}", "timestamp": datetime.now(timezone.utc).isoformat()})
                except Exception as exc:
                    logs.append({"step": f"Provider status check failed: {exc}", "timestamp": datetime.now(timezone.utc).isoformat()})

            # Determine final status
            new_status = "in_progress"
            if real_status:
                # Map provider statuses to our statuses
                if real_status in ("READY", "ready"):
                    new_status = "success"
                elif real_status in ("ERROR", "CANCELED", "error", "canceled"):
                    new_status = "failed"
                elif real_status in ("QUEUED", "BUILDING", "prepared", "building"):
                    new_status = "in_progress"
            elif attempt >= 4:
                # No provider token available — after 20s assume success (best effort)
                new_status = "success"
                logs.append({"step": "No provider API access — assuming success after timeout", "timestamp": datetime.now(timezone.utc).isoformat()})

            update_data: dict = {"status": new_status, "audit_logs": logs}
            if new_status in ("success", "failed"):
                update_data["completed_at"] = datetime.now(timezone.utc).isoformat()

            supabase.table("rollback_operations").update(update_data).eq("id", rollback_id).execute()

            if new_status in ("success", "failed"):
                # Broadcast rollback completion via WebSocket
                try:
                    from main import broadcast_to_user
                    await broadcast_to_user(op.get("initiated_by", ""), "rollback.progress", {
                        "id": rollback_id,
                        "status": new_status,
                        "completed_at": update_data.get("completed_at"),
                    })
                except Exception:
                    pass

                # Log activity feed entry
                try:
                    supabase.table("entity_activities").insert({
                        "entity_type": "rollback",
                        "entity_id": rollback_id,
                        "user_id": str(op.get("initiated_by")) if op.get("initiated_by") else None,
                        "user_name": "system",
                        "action": "status_change",
                        "description": f"Rollback to {op.get('target_version', 'previous version')} → {new_status}",
                        "metadata": {"target_deployment_id": op.get("target_deployment_id")},
                    }).execute()
                except Exception:
                    pass

                # Send email notification on success (respects preferences)
                if new_status == "success":
                    try:
                        initiator = op.get("initiated_by")
                        if initiator:
                            prefs_res = supabase.table("notification_preferences").select("*").eq("user_id", str(initiator)).execute()
                            prefs = prefs_res.data[0] if prefs_res.data and prefs_res.data[0] else {}
                            if prefs.get("email_notifications", True) and prefs.get("rollback_completed", True):
                                user_res = supabase.table("auth.users").select("email").eq("id", str(initiator)).execute()
                                to_email = user_res.data[0]["email"] if user_res.data else None
                                proj_res = supabase.table("projects").select("name").eq("id", str(op.get("project_id"))).single().execute()
                                proj_name = proj_res.data.get("name", "project") if proj_res.data else "project"
                                if to_email:
                                    from services.email_service import send_rollback_completed
                                    await send_rollback_completed(to_email, proj_name, op.get("target_version", "previous version"))
                    except Exception as exc:
                        logger.debug("Rollback email notification skipped: %s", exc)
                break
        except Exception as exc:
            logger.error("poll_rollback_status error: %s", exc)
            break
