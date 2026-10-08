"""Plugin installations router — list, upsert, delete, and test plugin configs."""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user
from services.plugins import crypto
from services.plugins.base import PluginCtx
from services.plugins.registry import get_adapter, normalize_plugin_id, normalize_record
from validators import is_valid_uuid

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_user_id(user: Any) -> str:
    """Safely extract user ID from Supabase User object or dict."""
    if hasattr(user, "id"):
        return str(user.id)
    if isinstance(user, dict):
        return str(user.get("id"))
    return str(user)


def _validate_enabled_projects(user_id: str, project_ids: List[str]) -> List[str]:
    """Restrict enabled_for_projects to projects the user can actually access."""
    if not project_ids:
        return []
    from dependencies import get_user_project_ids
    allowed = set(get_user_project_ids(user_id))
    return [p for p in project_ids if p in allowed]


class PluginConfigUpdate(BaseModel):
    plugin_id: Optional[str] = None
    plugin_name: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    api_key: Optional[str] = None          # saved to api_key_encrypted
    api_key_hint: Optional[str] = None
    base_url: Optional[str] = None
    project_selector: Optional[str] = None
    config_data: Optional[Dict[str, Any]] = None
    enabled_for_projects: Optional[List[str]] = None
    webhook_url: Optional[str] = None


class PluginTestRequest(BaseModel):
    id: Optional[str] = None
    plugin_id: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    project_selector: Optional[str] = None
    config_data: Optional[Dict[str, Any]] = None


def _format_plugin_record(record: dict) -> dict:
    """Format plugin record for frontend consumption (hide raw encrypted keys, supply hints)."""
    rec = normalize_record(record)
    stored_key = rec.pop("api_key_encrypted", None)
    api_key = crypto.decrypt_key(stored_key) if stored_key else ""

    if not rec.get("api_key_hint"):
        if api_key:
            if "••••" in str(api_key):
                rec["api_key_hint"] = str(api_key)
            elif len(str(api_key)) >= 8:
                s = str(api_key)
                rec["api_key_hint"] = f"{s[:4]}_••••••••••••••••••••{s[-4:]}"
            else:
                rec["api_key_hint"] = "••••••••"
        else:
            rec["api_key_hint"] = ""
    return rec


@router.get("", summary="List plugin installations for the current user")
async def list_plugins(current_user=Depends(get_current_user)):
    user_id = _get_user_id(current_user)
    try:
        res = (
            supabase.table("plugin_installations")
            .select("*")
            .eq("installed_by", user_id)
            .execute()
        )
        data = res.data or []

        # Auto-seed default plugins if none exist for this user
        if not data:
            # Query user projects to associate with
            p_res = supabase.table("projects").select("id").eq("owner_id", user_id).execute()
            user_project_ids = [p["id"] for p in (p_res.data or [])]

            default_seeds = [
                {
                    "installed_by": user_id,
                    "plugin_id": "plugin-vercel",
                    "plugin_name": "Vercel",
                    "category": "deployment",
                    "status": "connected",
                    "base_url": "https://api.vercel.com",
                    "project_selector": "",
                    "api_key_encrypted": None,
                    "enabled_for_projects": user_project_ids,
                },
                {
                    "installed_by": user_id,
                    "plugin_id": "plugin-grafana",
                    "plugin_name": "Grafana Cloud",
                    "category": "monitoring",
                    "status": "connected",
                    "base_url": "https://g-8949d28229f3479a838dc2a11b811802.grafana.net",
                    "project_selector": "",
                    "api_key_encrypted": None,
                    "enabled_for_projects": user_project_ids,
                },
                {
                    "installed_by": user_id,
                    "plugin_id": "plugin-github-actions",
                    "plugin_name": "GitHub Actions",
                    "category": "deployment",
                    "status": "connected",
                    "base_url": "https://api.github.com",
                    "project_selector": "Internal-Developer-Platform",
                    "api_key_encrypted": None,
                    "enabled_for_projects": user_project_ids,
                },
                {
                    "installed_by": user_id,
                    "plugin_id": "plugin-sentry",
                    "plugin_name": "Sentry",
                    "category": "error_tracking",
                    "status": "disconnected",
                    "base_url": "https://sentry.io",
                    "project_selector": "",
                    "enabled_for_projects": user_project_ids,
                },
            ]

            insert_res = supabase.table("plugin_installations").insert(default_seeds).execute()
            data = insert_res.data or default_seeds

        return [_format_plugin_record(r) for r in data]
    except Exception as exc:
        logger.error("list_plugins failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load plugins") from exc


@router.patch("/{installation_id}", summary="Update plugin configuration")
async def update_plugin(
    installation_id: str,
    body: PluginConfigUpdate,
    current_user=Depends(get_current_user),
):
    user_id = _get_user_id(current_user)

    try:
        query = supabase.table("plugin_installations").select("*")
        if is_valid_uuid(installation_id):
            query = query.eq("id", installation_id)
        else:
            query = query.eq("plugin_id", installation_id)
        existing = query.eq("installed_by", user_id).limit(1).execute()
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plugin installation not found")

    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plugin installation not found")

    current_record = existing.data[0]
    real_id = current_record["id"]

    update_data: dict[str, Any] = {}
    if body.status is not None:
        update_data["status"] = body.status
    elif body.api_key:
        update_data["status"] = "connected"

    # Save real API key if supplied (ignore hints with masked bullets)
    if body.api_key is not None and body.api_key.strip() and "••••" not in body.api_key:
        real_key = body.api_key.strip()
        update_data["api_key_encrypted"] = crypto.encrypt_key(real_key)
        update_data["status"] = "connected"
        if len(real_key) >= 8:
            update_data["api_key_hint"] = f"{real_key[:4]}_••••••••••••••••••••{real_key[-4:]}"
        else:
            update_data["api_key_hint"] = "••••••••"

    if body.base_url is not None:
        update_data["base_url"] = body.base_url

    if body.project_selector is not None:
        update_data["project_selector"] = body.project_selector

    if body.enabled_for_projects is not None:
        update_data["enabled_for_projects"] = _validate_enabled_projects(user_id, body.enabled_for_projects)

    if body.plugin_name is not None:
        update_data["plugin_name"] = body.plugin_name

    if body.category is not None:
        update_data["category"] = body.category

    if body.webhook_url is not None:
        update_data["webhook_url"] = body.webhook_url

    if body.config_data is not None:
        merged = dict(current_record.get("config_data") or {})
        merged.update(body.config_data)
        update_data["config_data"] = merged

    update_data["last_sync_at"] = datetime.now(timezone.utc).isoformat()

    try:
        res = (
            supabase.table("plugin_installations")
            .update(update_data)
            .eq("id", real_id)
            .execute()
        )
        record = res.data[0] if res.data else {**current_record, **update_data}
        return _format_plugin_record(record)
    except Exception as exc:
        logger.error("update_plugin failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update plugin configuration") from exc


@router.post("", summary="Create a plugin installation")
async def create_plugin(
    body: PluginConfigUpdate,
    current_user=Depends(get_current_user),
):
    user_id = _get_user_id(current_user)

    insert_data: dict[str, Any] = {
        "installed_by": user_id,
        "status": body.status or ("connected" if body.api_key else "disconnected"),
    }
    if body.plugin_id:
        insert_data["plugin_id"] = body.plugin_id
    if body.plugin_name:
        insert_data["plugin_name"] = body.plugin_name
    if body.category:
        insert_data["category"] = body.category
    if body.api_key:
        insert_data["api_key_encrypted"] = crypto.encrypt_key(body.api_key)
    if body.base_url:
        insert_data["base_url"] = body.base_url
    if body.project_selector:
        insert_data["project_selector"] = body.project_selector
    if body.enabled_for_projects:
        insert_data["enabled_for_projects"] = _validate_enabled_projects(user_id, body.enabled_for_projects)
    if body.webhook_url:
        insert_data["webhook_url"] = body.webhook_url

    try:
        res = supabase.table("plugin_installations").insert(insert_data).execute()
        record = res.data[0] if res.data else insert_data
        return _format_plugin_record(record)
    except Exception as exc:
        logger.error("create_plugin failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create plugin installation") from exc


@router.post("/test", summary="Test plugin connection server-side")
async def test_plugin_connection(
    body: PluginTestRequest,
    current_user=Depends(get_current_user),
):
    """Verify credentials and external API accessibility for a plugin."""
    user_id = _get_user_id(current_user)

    plugin_id = body.plugin_id
    token = body.api_key or ""
    base_url = body.base_url or ""
    project_selector = body.project_selector or ""
    target_row_id = None
    stored_config: dict = {}
    # Unsaved form values (test-before-save) merge over stored config below.
    form_config: dict = dict(body.config_data or {})

    # If an existing installation ID was provided, fetch stored credentials if not supplied
    if body.id:
        query = supabase.table("plugin_installations").select("*")
        if is_valid_uuid(body.id):
            query = query.eq("id", body.id)
        else:
            query = query.eq("plugin_id", body.id)
        existing = query.eq("installed_by", user_id).limit(1).execute()
        if existing.data:
            rec = existing.data[0]
            target_row_id = rec.get("id")
            plugin_id = plugin_id or rec.get("plugin_id")
            token = token or crypto.decrypt_key(rec.get("api_key_encrypted")) or ""
            base_url = base_url or rec.get("base_url") or ""
            project_selector = project_selector or rec.get("project_selector") or ""
            stored_config = rec.get("config_data") or {}
    elif plugin_id:
        existing = supabase.table("plugin_installations").select("*").eq("plugin_id", plugin_id).eq("installed_by", user_id).limit(1).execute()
        if existing.data:
            rec = existing.data[0]
            target_row_id = rec.get("id")
            token = token or crypto.decrypt_key(rec.get("api_key_encrypted")) or ""
            base_url = base_url or rec.get("base_url") or ""
            project_selector = project_selector or rec.get("project_selector") or ""
            stored_config = rec.get("config_data") or {}

    canonical_id = normalize_plugin_id(plugin_id)
    adapter = get_adapter(canonical_id)
    merged_config = {**stored_config, **{k: v for k, v in form_config.items() if v not in (None, "")}}
    ctx = PluginCtx(
        plugin_id=canonical_id,
        token=token,
        base_url=base_url,
        project_selector=project_selector,
        config=merged_config,
        installation_id=target_row_id,
    )
    try:
        result = await adapter.test(ctx)
        outcome: dict = {"success": result.success, "message": result.message}
    except Exception as exc:
        logger.warning("Plugin test crashed for %s: %s", canonical_id, exc)
        outcome = {"success": False, "message": f"Test failed: {exc}"}

    # If verification was successful and we know the DB record, persist verified state and credentials
    if outcome.get("success") and target_row_id and is_valid_uuid(target_row_id):
        try:
            upd: dict[str, Any] = {
                "status": "connected",
                "last_sync_at": datetime.now(timezone.utc).isoformat(),
            }
            if body.api_key and body.api_key.strip() and "••••" not in body.api_key:
                real_key = body.api_key.strip()
                upd["api_key_encrypted"] = crypto.encrypt_key(real_key)
                if len(real_key) >= 8:
                    upd["api_key_hint"] = f"{real_key[:4]}_••••••••••••••••••••{real_key[-4:]}"
                else:
                    upd["api_key_hint"] = "••••••••"
            if body.base_url:
                upd["base_url"] = body.base_url
            if body.project_selector:
                upd["project_selector"] = body.project_selector
            supabase.table("plugin_installations").update(upd).eq("id", target_row_id).execute()
        except Exception as exc:
            logger.warning("Failed to persist plugin config on test success: %s", exc)

    return outcome


class NotifyRequest(BaseModel):
    title: str = "Test notification from Aether IDP"
    message: str = "If you received this, outbound delivery works."


@router.post("/{installation_id}/notify", summary="Send a notification via a collaboration plugin")
async def notify_via_plugin(
    installation_id: str,
    body: NotifyRequest,
    current_user=Depends(get_current_user),
):
    """Manual send (and the UI's Send-test button). Only sending-capable plugins."""
    from services.notify_fanout import SEND_CAPABLE

    user_id = _get_user_id(current_user)
    query = supabase.table("plugin_installations").select("*")
    if is_valid_uuid(installation_id):
        query = query.eq("id", installation_id)
    else:
        query = query.eq("plugin_id", installation_id)
    existing = query.eq("installed_by", user_id).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plugin installation not found")
    rec = existing.data[0]
    pid = normalize_plugin_id(rec.get("plugin_id"))
    if pid not in SEND_CAPABLE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"{rec.get('plugin_name', 'Plugin')} does not support sending.")
    adapter = get_adapter(pid)
    ctx = PluginCtx(
        plugin_id=pid,
        token=crypto.decrypt_key(rec.get("api_key_encrypted")),
        base_url=rec.get("base_url") or "",
        project_selector=rec.get("project_selector") or "",
        config=rec.get("config_data") or {},
        installation_id=rec.get("id"),
    )
    result = await adapter.send(ctx, body.title, body.message)
    return {"success": result.success, "message": result.message}


@router.delete("/{installation_id}", summary="Remove a plugin installation")
async def delete_plugin(installation_id: str, current_user=Depends(get_current_user)):
    user_id = _get_user_id(current_user)
    try:
        query = supabase.table("plugin_installations").select("id, installed_by")
        if is_valid_uuid(installation_id):
            query = query.eq("id", installation_id)
        else:
            query = query.eq("plugin_id", installation_id)
        existing = query.eq("installed_by", user_id).limit(1).execute()
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plugin installation not found")

    real_id = existing.data[0]["id"]
    supabase.table("plugin_installations").delete().eq("id", real_id).execute()
    return {"deleted": True}
