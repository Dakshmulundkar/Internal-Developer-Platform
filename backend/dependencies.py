"""FastAPI dependency functions shared across routers."""

import logging
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import supabase

logger = logging.getLogger(__name__)

# Reusable bearer-token extractor
_bearer = HTTPBearer(auto_error=True)

# ── Short-TTL identity cache ────────────────────────────────────────────────
# Every protected endpoint used to resolve the JWT against Supabase's Auth
# service (a network round trip per request + again inside get_user_project_ids),
# which is the dominant cost of "slow login / slow page switching". We cache the
# RESOLVED identity per token for 30s. This is safe: an expired/revoked token is
# simply re-validated once the entry ages out, and per-user data is always
# fetched fresh from Postgres — only the identity resolution is memoized.
_IDENTITY_CACHE_TTL = 30.0
_identity_cache: dict[str, tuple[float, object]] = {}


def _cached_identity(token: str):
    entry = _identity_cache.get(token)
    if entry and (time.monotonic() - entry[0]) < _IDENTITY_CACHE_TTL:
        return entry[1]
    return None


def _store_identity(token: str, user) -> None:
    # Bound the cache so a busy account can't bloat memory unboundedly.
    if len(_identity_cache) > 4096:
        _identity_cache.clear()
    _identity_cache[token] = (time.monotonic(), user)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
):
    """Extract and validate the JWT from the Authorization header.

    Cached-for-30s per token for speed. Raises HTTP 401 if the token is
    missing, malformed, or rejected by Supabase.

    Returns the Supabase user object on success.
    """
    token = credentials.credentials

    cached = _cached_identity(token)
    if cached is not None:
        return cached

    try:
        response = supabase.auth.get_user(token)
        user = response.user
        if user is None:
            raise ValueError("No user returned")
    except Exception as exc:
        # Invalidate anything stale for this token (e.g. revoked) so we
        # don't serve a dead identity indefinitely.
        _identity_cache.pop(token, None)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    _store_identity(token, user)
    return user


_optional_bearer = HTTPBearer(auto_error=False)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
):
    """Optionally extract user if Bearer token is provided, otherwise return None."""
    if not credentials or not credentials.credentials:
        return None
    try:
        response = supabase.auth.get_user(credentials.credentials)
        return response.user
    except Exception:
        return None


def get_user_project_ids(user_id: str) -> list[str]:
    """Return all project IDs accessible to user_id.

    A user can access a project when they own it OR when they are an ACCEPTED
    member of that project's team (RBAC). Invitees who haven't accepted yet
    don't get project access — data visibility starts on acceptance.
    """
    owner_res = (
        supabase.table("projects")
        .select("id")
        .eq("owner_id", user_id)
        .execute()
    )
    member_res = (
        supabase.table("team_members")
        .select("project_id")
        .eq("user_id", user_id)
        .eq("status", "accepted")
        .execute()
    )
    project_ids = [r["id"] for r in (owner_res.data or [])]
    project_ids += [r["project_id"] for r in (member_res.data or [])]
    return list(dict.fromkeys(project_ids))  # dedupe, preserve order
