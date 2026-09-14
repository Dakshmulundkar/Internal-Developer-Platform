"""Sharing router — guest/share links for read-only external access.

Creates token-based share links for incidents, deployments, and projects.
The public GET endpoint requires only the token (no auth) and increments
access_count. Link owners can revoke links at any time.
"""

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

_ALLOWED_ENTITIES = {
    "incident": "incidents",
    "deployment": "deployments",
    "project": "projects",
}

_PBKDF2_HASH_ITERATIONS = 600_000


def _hash_share_password(password: str) -> str:
    """Hash a share-link password using a salted, slow KDF (PBKDF2-SHA256)."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), _PBKDF2_HASH_ITERATIONS
    )
    return f"pbkdf2_sha256${_PBKDF2_HASH_ITERATIONS}${salt}${digest.hex()}"


def _verify_share_password(stored: str, supplied: str, link_id: str) -> bool:
    """Verify a share-link password (constant-time), supporting the old unsalted
    SHA-256 format for pre-migration links and upgrading them in place."""
    try:
        method, iterations, salt, expected = stored.split("$")
        if method == "pbkdf2_sha256":
            digest = hashlib.pbkdf2_hmac(
                "sha256", supplied.encode(), bytes.fromhex(salt), int(iterations)
            )
            return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, AttributeError):
        pass

    # Legacy: plain sha256 hexdigest. Verify, then re-hash with PBKDF2 since we
    # have the plaintext password available at check time.
    if len(stored or "") == 64:
        legacy = hashlib.sha256(supplied.encode()).hexdigest()
        if hmac.compare_digest(legacy, stored):
            try:
                supabase.table("share_links").update(
                    {"password_hash": _hash_share_password(supplied)}
                ).eq("id", link_id).execute()
            except Exception:
                pass
            return True
    return False


class ShareLinkCreate(BaseModel):
    entity_type: str
    entity_id: str
    expires_in_days: int | None = 7  # None = never expires
    password: str | None = None


def _entity_owner(entity_type: str, entity_id: str):
    """Return the entity row and its owner_id, or raise 404."""
    table = _ALLOWED_ENTITIES.get(entity_type)
    if not table:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported entity type: {entity_type}")

    res = supabase.table(table).select("*").eq("id", entity_id).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
    entity = res.data[0]

    if entity_type == "project":
        owner_id = entity.get("owner_id")
    else:
        project_id = entity.get("project_id")
        owner_id = None
        if project_id:
            p = supabase.table("projects").select("owner_id").eq("id", project_id).single().execute()
            owner_id = p.data.get("owner_id") if p.data else None
    return entity, str(owner_id) if owner_id else None


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_share_link(body: ShareLinkCreate, current_user=Depends(get_current_user)):
    """Create a shareable link for an entity you own."""
    user_id = str(current_user.id)
    entity, owner_id = _entity_owner(body.entity_type, body.entity_id)
    if owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    token = secrets.token_urlsafe(32)
    from datetime import timedelta

    expires_iso = None
    if body.expires_in_days:
        expires_iso = (datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)).isoformat()

    password_hash = None
    if body.password:
        password_hash = _hash_share_password(body.password)

    res = supabase.table("share_links").insert({
        "entity_type": body.entity_type,
        "entity_id": body.entity_id,
        "token": token,
        "password_hash": password_hash,
        "created_by": user_id,
        "expires_at": expires_iso,
        "access_count": 0,
    }).execute()

    if not res.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create share link")

    row = res.data[0]
    url = f"/share/{body.entity_type}/{body.entity_id}?token={token}"
    return {**row, "url": url}


@router.get("/{entity_type}/{entity_id}")
async def public_view(entity_type: str, entity_id: str, token: str = "", password: str = ""):
    """Public (token-based) read-only view of an entity. No auth required.

    If the share link was created with a password, the caller must provide
    the matching password (cleartext in the query string) to view the entity.
    """
    link_res = (
        supabase.table("share_links")
        .select("*")
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .eq("token", token)
        .eq("revoked", False)
        .execute()
    )
    if not link_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found or revoked")

    link = link_res.data[0]
    if link.get("expires_at"):
        try:
            exp = datetime.fromisoformat(link["expires_at"].replace("Z", "+00:00"))
            if exp < datetime.now(timezone.utc):
                raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share link expired")
        except ValueError:
            pass

    if link.get("password_hash"):
        if not password:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Password required")
        if not _verify_share_password(link.get("password_hash"), password, link["id"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")

    entity, _ = _entity_owner(entity_type, entity_id)

    # Increment access count
    try:
        supabase.table("share_links").update({
            "access_count": (link.get("access_count") or 0) + 1,
            "last_accessed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", link["id"]).execute()
    except Exception:
        pass

    redacted = {k: v for k, v in entity.items() if k not in ("webhook_secret", "api_token_hint", "api_key")}
    return {"entity_type": entity_type, "entity": redacted}


@router.get("/mine")
async def my_share_links(current_user=Depends(get_current_user)):
    """List all share links created by the current user."""
    user_id = str(current_user.id)
    res = supabase.table("share_links").select("*").eq("created_by", user_id).order("created_at", desc=True).execute()
    return res.data or []


@router.delete("/{link_id}")
async def revoke_share_link(link_id: str, current_user=Depends(get_current_user)):
    """Revoke a share link (creator only)."""
    user_id = str(current_user.id)
    link = supabase.table("share_links").select("*").eq("id", link_id).execute()
    if not link.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")
    if str(link.data[0].get("created_by")) != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    supabase.table("share_links").update({"revoked": True}).eq("id", link_id).execute()
    return {"revoked": True, "id": link_id}