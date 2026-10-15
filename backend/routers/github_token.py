"""GitHub classic PAT storage for Repo Auto-Fix (Phase 8, Task 75).

The token is write-only from the client's perspective: it is validated
against the GitHub API, Fernet-encrypted at rest (reusing the plugin-key
crypto helpers), and never returned again — only the login, the last 4
characters, and the scopes are readable via GET status.
"""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user
from services.plugins.crypto import decrypt_key, encrypt_key

logger = logging.getLogger(__name__)

router = APIRouter()

GITHUB_API = "https://api.github.com"
# A classic PAT must carry the `repo` scope for private-repo clone/push.
REPO_SCOPE_HINT = "https://github.com/settings/tokens"


class TokenIn(BaseModel):
    token: str


def _row_for_user(user_id: str):
    res = (
        supabase.table("user_github_tokens")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = getattr(res, "data", None) or []
    return rows[0] if rows else None


@router.post("/github/token")
async def save_github_token(
    body: TokenIn, current_user=Depends(get_current_user)
):
    token = (body.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token is empty.")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{GITHUB_API}/user",
                headers={
                    "Authorization": f"token {token}",
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "aether-idp",
                },
            )
    except httpx.HTTPError as exc:
        logger.warning("GitHub unreachable during token check: %s", type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail="Could not reach GitHub to verify the token — try again.",
        )
    if resp.status_code in (401, 403):
        raise HTTPException(
            status_code=400,
            detail=(
                "GitHub rejected this token — create a classic PAT with the "
                f"`repo` scope at {REPO_SCOPE_HINT}"
            ),
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"GitHub returned unexpected status {resp.status_code} — try again.",
        )

    gh_user = resp.json()
    login = gh_user.get("login") or ""
    scopes = resp.headers.get("X-OAuth-Scopes") or ""

    supabase.table("user_github_tokens").upsert(
        {
            "user_id": current_user.id,
            "encrypted_token": encrypt_key(token),
            "token_last4": token[-4:],
            "scopes": scopes,
            "github_login": login,
        },
        on_conflict="user_id",
    ).execute()

    return {"github_login": login, "last4": token[-4:], "scopes": scopes}


@router.get("/github/token/status")
async def github_token_status(current_user=Depends(get_current_user)):
    row = _row_for_user(current_user.id)
    if not row:
        return {"connected": False}
    return {
        "connected": True,
        "github_login": row.get("github_login") or "",
        "last4": row.get("token_last4") or "",
        "scopes": row.get("scopes") or "",
        "created_at": row.get("created_at"),
    }


@router.delete("/github/token")
async def delete_github_token(current_user=Depends(get_current_user)):
    supabase.table("user_github_tokens").delete().eq(
        "user_id", current_user.id
    ).execute()
    return {"connected": False}


def get_stored_token(user_id: str) -> tuple[str, str]:
    """Decrypt the stored PAT for internal use (autofix flows).

    Returns (token, github_login); ("", "") when not connected.
    """
    row = _row_for_user(user_id)
    if not row:
        return "", ""
    return decrypt_key(row.get("encrypted_token")), row.get("github_login") or ""
