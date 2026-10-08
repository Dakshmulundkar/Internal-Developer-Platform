"""OAuth connect flows for collaboration plugins (Slack, Microsoft Teams).

Flow: authenticated frontend calls GET /plugins/oauth/{provider}/start?installation_id=
 → receives the provider authorize URL → browser navigates there → provider
redirects to /plugins/oauth/{provider}/callback → code exchanged for tokens →
stored encrypted on the installation → browser redirected to the frontend.

Requires server env: SLACK_CLIENT_ID/SECRET, MS_CLIENT_ID/SECRET (+ MS_TENANT_ID,
default "common"). Without them, /start returns 503 with a clear message and the
paste-a-token path keeps working.
"""

import logging
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse

from config import settings
from database import supabase
from dependencies import get_current_user
from services.plugins import crypto
from validators import is_valid_uuid

logger = logging.getLogger(__name__)
router = APIRouter()


def _user_id(user: Any) -> str:
    if hasattr(user, "id"):
        return str(user.id)
    if isinstance(user, dict):
        return str(user.get("id"))
    return str(user)


def _redirect_base() -> str:
    return (getattr(settings, "APP_BACKEND_URL", "") or "http://localhost:8001").rstrip("/")


def _frontend_integrations() -> str:
    return (getattr(settings, "APP_FRONTEND_URL", "") or "http://localhost:5173").rstrip("/") + "/"


def _get_installation(installation_id: str, user_id: str) -> dict | None:
    query = supabase.table("plugin_installations").select("*")
    if is_valid_uuid(installation_id):
        query = query.eq("id", installation_id)
    else:
        query = query.eq("plugin_id", installation_id)
    res = query.eq("installed_by", user_id).limit(1).execute()
    return res.data[0] if res.data else None


def _store_tokens(row_id: str, api_key: str | None, extra_config: dict | None = None) -> None:
    current = supabase.table("plugin_installations").select("config_data").eq("id", row_id).limit(1).execute()
    merged = dict((current.data[0].get("config_data") if current.data else {}) or {})
    if extra_config:
        merged.update(extra_config)
    upd: dict = {"status": "connected", "last_sync_at": datetime.now(timezone.utc).isoformat()}
    if api_key:
        upd["api_key_encrypted"] = crypto.encrypt_key(api_key)
        upd["api_key_hint"] = f"{api_key[:4]}_••••••••••••••••••••{api_key[-4:]}" if len(api_key) >= 8 else "••••••••"
    if merged:
        upd["config_data"] = merged
    supabase.table("plugin_installations").update(upd).eq("id", row_id).execute()


def _fail_frontend(reason: str) -> RedirectResponse:
    return RedirectResponse(f"{_frontend_integrations()}?oauth_error={reason}", status_code=302)


# ── Slack ────────────────────────────────────────────────────────────

@router.get("/slack/start", summary="Get Slack OAuth authorize URL")
async def slack_start(installation_id: str, current_user=Depends(get_current_user)):
    client_id = (getattr(settings, "SLACK_CLIENT_ID", "") or "").strip()
    if not client_id:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Slack OAuth not configured (SLACK_CLIENT_ID). Paste a bot token instead.")
    row = _get_installation(installation_id, _user_id(current_user))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plugin installation not found")
    redirect_uri = f"{_redirect_base()}/plugins/oauth/slack/callback"
    params = urlencode({
        "client_id": client_id,
        "scope": "chat:write,channels:read,users:read",
        "redirect_uri": redirect_uri,
        "state": row["id"],
    })
    return {"url": f"https://slack.com/oauth/v2/authorize?{params}"}


@router.get("/slack/callback", summary="Slack OAuth callback")
async def slack_callback(code: str = "", error: str = "", state: str = ""):
    if error or not code:
        return _fail_frontend(error or "cancelled")
    client_id = (getattr(settings, "SLACK_CLIENT_ID", "") or "").strip()
    client_secret = (getattr(settings, "SLACK_CLIENT_SECRET", "") or "").strip()
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post("https://slack.com/api/oauth.v2.access", data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": f"{_redirect_base()}/plugins/oauth/slack/callback",
            })
            data = resp.json()
        if not data.get("ok"):
            logger.warning("Slack OAuth failed: %s", data.get("error"))
            return _fail_frontend(data.get("error", "oauth_failed"))
        _store_tokens(state, data.get("access_token", ""),
                      {"slack_team": (data.get("team") or {}).get("name", ""),
                       "slack_bot_user": (data.get("bot_user_id") or "")})
    except Exception as exc:
        logger.warning("Slack OAuth callback failed: %s", exc)
        return _fail_frontend("callback_failed")
    return RedirectResponse(_frontend_integrations(), status_code=302)


# ── Microsoft Teams (Graph) ──────────────────────────────────────────

def _ms_tenant() -> str:
    return (getattr(settings, "MS_TENANT_ID", "") or "common").strip() or "common"


@router.get("/teams/start", summary="Get Microsoft OAuth authorize URL")
async def teams_start(installation_id: str, current_user=Depends(get_current_user)):
    client_id = (getattr(settings, "MS_CLIENT_ID", "") or "").strip()
    if not client_id:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Microsoft OAuth not configured (MS_CLIENT_ID). Paste a Graph token instead.")
    row = _get_installation(installation_id, _user_id(current_user))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plugin installation not found")
    redirect_uri = f"{_redirect_base()}/plugins/oauth/teams/callback"
    params = urlencode({
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "response_mode": "query",
        "scope": "https://graph.microsoft.com/ChannelMessage.Send https://graph.microsoft.com/Channel.ReadBasic.All offline_access",
        "state": row["id"],
    })
    return {"url": f"https://login.microsoftonline.com/{_ms_tenant()}/oauth2/v2.0/authorize?{params}"}


@router.get("/teams/callback", summary="Microsoft OAuth callback")
async def teams_callback(code: str = "", error: str = "", state: str = ""):
    if error or not code:
        return _fail_frontend(error or "cancelled")
    client_id = (getattr(settings, "MS_CLIENT_ID", "") or "").strip()
    client_secret = (getattr(settings, "MS_CLIENT_SECRET", "") or "").strip()
    redirect_uri = f"{_redirect_base()}/plugins/oauth/teams/callback"
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(
                f"https://login.microsoftonline.com/{_ms_tenant()}/oauth2/v2.0/token", data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                })
            data = resp.json()
        access = data.get("access_token", "")
        if not access:
            logger.warning("Teams OAuth failed: %s", data.get("error"))
            return _fail_frontend(data.get("error", "oauth_failed"))
        _store_tokens(state, access, {
            "ms_refresh_token": data.get("refresh_token", ""),
            "ms_expires_at": int(time.time()) + int(data.get("expires_in", 3600)),
        })
    except Exception as exc:
        logger.warning("Teams OAuth callback failed: %s", exc)
        return _fail_frontend("callback_failed")
    return RedirectResponse(_frontend_integrations(), status_code=302)
