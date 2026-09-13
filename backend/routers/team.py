"""Team management router — add/remove team members, list team, search users."""

import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from config import settings
from database import supabase
from dependencies import get_current_user, get_user_project_ids
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

_VALID_ROLES = {"viewer", "developer", "admin"}
_ADMIN_ROLES = {"admin", "owner"}

_SCHEMA_CACHE_WIKI = (
    "PGRST204 means the 'notifications' table exists in Postgres but PostgREST's "
    "schema cache is stale. Reload it via Supabase Dashboard → Settings → API → "
    "'Reload schema cache', then retry the invite."
)


class TeamMemberAdd(BaseModel):
    project_id: str
    email: str
    role: str = "developer"
    name: str = ""


class TeamMemberUpdate(BaseModel):
    role: str = None


def _user_project_ids(user_id: str) -> list[str]:
    return get_user_project_ids(user_id)


def _caller_role(user_id: str, project_id: str) -> str | None:
    """Return the caller's highest role on the project (owner > admin > developer > viewer).

    Returns None (instead of raising) if the project is missing or unreadable,
    so callers can distinguish "not found" from "forbidden" cleanly.
    """
    try:
        owner = supabase.table("projects").select("owner_id").eq("id", project_id).single().execute()
        if owner.data and str(owner.data.get("owner_id")) == str(user_id):
            return "owner"
    except Exception as exc:
        logger.debug("[Team] owner lookup failed for project %s: %s", project_id, exc)
        return None
    res = (
        supabase.table("team_members")
        .select("role")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .eq("status", "accepted")  # pending invites don't grant management rights
        .execute()
    )
    roles = [r.get("role") for r in (res.data or []) if r.get("role")]
    for role in ("owner", "admin", "developer", "viewer"):
        if role in roles:
            return role
    return None


def _is_schema_cache_error(exc: Exception) -> bool:
    """Return True if the exception indicates a stale PostgREST schema cache.

    PostgREST returns PGRST204 ('Could not find the ... column ... in the schema
    cache') when the table exists in Postgres but the cache predates it. Supabase
    only picks up the change after a manual 'Reload schema cache' (or a
    pg_notify('pgrst', 'reload schema') from a privileged client).
    """
    text = str(exc)
    return "PGRST204" in text or ("schema cache" in text.lower())


async def _insert_team_invite_notification(notification: dict) -> dict | None:
    """Insert an in-platform notification, retrying briefly across schema reloads.

    The invite itself must never fail because the notification couldn't be
    written, so this is best-effort: it retries a few times with backoff (so a
    concurrent 'Reload schema cache' mid-flight still lands the row) and then
    swallows the error with an actionable log line. Returns the created row on
    success (caller uses it to push a WebSocket event), None on failure.
    """
    for attempt in range(1, 4):
        try:
            res = supabase.table("notifications").insert(notification).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            if attempt < 3 and _is_schema_cache_error(exc):
                wait = attempt * 2  # 2s, then 4s
                logger.info(
                    "[Team] Notification insert hit stale schema cache (attempt %d/3) — retrying in %ss",
                    attempt,
                    wait,
                )
                await asyncio.sleep(wait)
                continue
            logger.warning("[Team] in-platform notification insert failed (non-fatal): %s", exc)
            if _is_schema_cache_error(exc):
                logger.warning("[Team] %s", _SCHEMA_CACHE_WIKI)
            return None
    return None


@router.get("")
async def list_team_members(project_id: str = None, current_user=Depends(get_current_user)):
    """List team members for the user's projects."""
    user_id = str(current_user.id)
    project_ids = _user_project_ids(user_id)
    if not project_ids:
        return []

    query = supabase.table("team_members").select("*").in_("project_id", project_ids)
    if project_id:
        query = query.eq("project_id", project_id)
    res = query.execute()
    return res.data or []


@router.post("", status_code=status.HTTP_201_CREATED)
async def add_team_member(body: TeamMemberAdd, current_user=Depends(get_current_user)):
    """Add a team member to a project.

    Behaviour:
    - If an Aether account exists for the email → creates a team_members row with
      status='invited' AND inserts a notification so the user sees a banner immediately.
    - If no Aether account exists → stores a pending invite (user_id = NULL) that gets
      resolved when the user later registers.
    - Either way an invitation email is sent via Resend (falls back to console log when
      RESEND_API_KEY is not set).
    """
    user_id = str(current_user.id)

    # 404 if the project doesn't exist (instead of a misleading 403/500) —
    # the UI must never send a made-up project_id like "workspace".
    try:
        proj_exists = supabase.table("projects").select("id").eq("id", body.project_id).maybe_single().execute()
    except Exception:
        proj_exists = None
    if not proj_exists or not proj_exists.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Verify admin privileges via _caller_role (checks projects.owner_id directly)
    # This replaces the project_ids pre-check which could 403 when RLS or seed data
    # causes get_user_project_ids() to miss the project even for the real owner.
    caller_role = _caller_role(user_id, body.project_id)
    if caller_role not in _ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can manage team members")
    if body.role not in _VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {sorted(_VALID_ROLES)}",
        )
    if body.role == "admin" and caller_role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the project owner can assign the admin role")

    # ── Resolve the invited user by email ────────────────────────────────────
    target_user_id: str | None = None
    member_name: str = body.name or body.email.split("@")[0]

    try:
        admin_res = supabase.auth.admin.list_users()
        users = admin_res if isinstance(admin_res, list) else getattr(admin_res, "users", [])
        matched = [u for u in users if getattr(u, "email", "") == body.email]
        if matched:
            target_user_id = str(matched[0].id)
            meta = getattr(matched[0], "user_metadata", {}) or {}
            member_name = body.name or meta.get("full_name") or meta.get("name") or member_name
    except Exception as e:
        logger.warning("[Team] admin.list_users lookup failed: %s", e)

    # Fallback: profiles table
    if not target_user_id:
        try:
            prof_res = supabase.table("profiles").select("id,full_name").eq("email", body.email).limit(1).execute()
            if prof_res.data:
                target_user_id = prof_res.data[0]["id"]
                member_name = body.name or prof_res.data[0].get("full_name") or member_name
        except Exception:
            pass

    if not target_user_id:
        logger.info("[Team] User %s not found in auth — storing as pending invite", body.email)

    # ── Check for duplicate ───────────────────────────────────────────────────
    existing = supabase.table("team_members").select("id").eq("project_id", body.project_id).eq("email", body.email).execute()
    if existing.data:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a team member or has a pending invite")

    # ── Generate a secure invite token (for the email accept link) ───────────
    invite_token = secrets.token_urlsafe(32)
    invite_expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    insert_data: dict = {
        "project_id": body.project_id,
        "name": member_name,
        "email": body.email,
        "role": body.role,
        "status": "invited",
        "added_by": user_id,
        "invite_token": invite_token,
        "invite_expires_at": invite_expires_at,
    }
    if target_user_id:
        insert_data["user_id"] = target_user_id

    res = supabase.table("team_members").insert(insert_data).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to add team member")

    new_member = res.data[0]
    new_member_id = new_member["id"]

    # ── Fetch project name for display ────────────────────────────────────────
    project_name = body.project_id  # fallback
    try:
        proj = supabase.table("projects").select("name").eq("id", body.project_id).single().execute()
        if proj.data:
            project_name = proj.data.get("name", body.project_id)
    except Exception:
        pass

    inviter_name = getattr(current_user, "email", "A team admin")
    try:
        inv_meta = getattr(current_user, "user_metadata", {}) or {}
        inviter_name = inv_meta.get("full_name") or inv_meta.get("name") or inviter_name
    except Exception:
        pass

    # ── Build accept/decline URLs ─────────────────────────────────────────────
    frontend = settings.APP_FRONTEND_URL.rstrip("/")
    accept_url = f"{frontend}/#/invite/accept?token={invite_token}&member_id={new_member_id}"
    decline_url = f"{frontend}/#/invite/decline?token={invite_token}&member_id={new_member_id}"

    # ── Send invite email (non-blocking — failure does not abort the invite) ──
    try:
        from services.email_service import send_team_invite
        await send_team_invite(
            to=body.email,
            inviter_name=inviter_name,
            project_name=project_name,
            role=body.role,
            accept_url=accept_url,
            decline_url=decline_url,
        )
    except Exception as email_err:
        logger.warning("[Team] invite email send failed (non-fatal): %s", email_err)

    # ── Create an in-platform notification for the invited user (if they have an account) ──
    if target_user_id:
        notif = await _insert_team_invite_notification({
            "user_id": target_user_id,
            "type": "team_invite",
            "title": f"Invitation to join {project_name}",
            "message": (
                f"{inviter_name} invited you to join '{project_name}' as {body.role}. "
                f"Accept or decline in Settings → Team."
            ),
            "read": False,
            "data": {
                "team_member_id": new_member_id,
                "project_id": body.project_id,
                "project_name": project_name,
                "role": body.role,
                "invite_token": invite_token,
                "inviter_name": inviter_name,
            },
        })

        # ── Push a real-time event so the invitee's banner appears instantly ──
        if notif:
            try:
                from main import broadcast_to_user
                await broadcast_to_user(target_user_id, "notification.new", {
                    "id": notif.get("id"),
                    "user_id": target_user_id,
                    "type": "team_invite",
                    "title": notif.get("title"),
                    "message": notif.get("message"),
                    "read": notif.get("read", False),
                    "project_id": body.project_id,
                    "team_member_id": new_member_id,
                    "invite_token": invite_token,
                    "created_at": notif.get("created_at"),
                })
            except Exception as exc:
                logger.debug("[Team] invite WebSocket broadcast skipped (non-fatal): %s", exc)

    # ── Audit log ─────────────────────────────────────────────────────────────
    try:
        from services import audit_service
        await audit_service.log(
            user_id=user_id,
            user_name=getattr(current_user, "email", ""),
            action="team_member.invited",
            details=f"Invited {member_name} ({body.email}) as {body.role} to {project_name}",
            project_id=body.project_id,
        )
    except Exception:
        pass

    return new_member


@router.post("/{member_id}/accept")
async def accept_team_invite(member_id: str, token: str = Query(...), current_user=Depends(get_current_user)):
    """Accept a pending team invite.

    The invite token is validated against the stored token + expiry.
    The authenticated user must match the invited email.
    """
    user_id = str(current_user.id)
    user_email = getattr(current_user, "email", "")

    member = supabase.table("team_members").select("*").eq("id", member_id).execute()
    if not member.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    row = member.data[0]

    # Validate token
    stored_token = row.get("invite_token")
    if not stored_token or stored_token != token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid invite token")

    # Check expiry
    expires_at = row.get("invite_expires_at")
    if expires_at:
        try:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp:
                raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite has expired")
        except ValueError:
            pass

    # Ensure the caller's email matches the invite (or user_id already matches)
    if row.get("email") and row["email"].lower() != user_email.lower():
        if row.get("user_id") and str(row["user_id"]) != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This invite was not sent to your account")

    # Accept: set status + bind user_id if not already set
    update_data: dict = {"status": "accepted", "invite_token": None}
    if not row.get("user_id"):
        update_data["user_id"] = user_id

    res = supabase.table("team_members").update(update_data).eq("id", member_id).execute()

    # Mark the notification as read
    try:
        supabase.table("notifications").update({"read": True}).eq("data->>team_member_id", member_id).execute()
    except Exception as notif_err:
        logger.info("[Team] notification mark-read skipped (non-fatal): %s", notif_err)

    # ── Live push: every connected teammate (incl. the owner) instantly sees
    #    the new accepted member and the acceptor's pending invite vanish. ──
    try:
        from services.websocket_service import broadcast_to_project
        row["status"] = "accepted"
        row["user_id"] = row.get("user_id") or user_id
        row["invite_token"] = None
        await broadcast_to_project(
            str(row.get("project_id") or ""),
            "team.members.changed",
            {"member": row, "action": "accepted", "actor_email": user_email},
        )
    except Exception as ws_err:
        logger.info("[Team] accept broadcast skipped (non-fatal): %s", ws_err)

    return res.data[0] if res.data else {"accepted": True}


@router.post("/{member_id}/decline")
async def decline_team_invite(member_id: str, token: str = Query(...), current_user=Depends(get_current_user)):
    """Decline a pending team invite."""
    user_id = str(current_user.id)
    user_email = getattr(current_user, "email", "")

    member = supabase.table("team_members").select("*").eq("id", member_id).execute()
    if not member.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    row = member.data[0]
    stored_token = row.get("invite_token")
    if not stored_token or stored_token != token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid invite token")

    if row.get("email") and row["email"].lower() != user_email.lower():
        if row.get("user_id") and str(row["user_id"]) != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This invite was not sent to your account")

    res = supabase.table("team_members").update({"status": "declined", "invite_token": None}).eq("id", member_id).execute()

    # Mark the notification as read
    try:
        supabase.table("notifications").update({"read": True}).eq("data->>team_member_id", member_id).execute()
    except Exception as notif_err:
        logger.info("[Team] notification mark-read skipped (non-fatal): %s", notif_err)

    # ── Live push: owner + teammates instantly see the invite disappear ──
    try:
        from services.websocket_service import broadcast_to_project
        row["status"] = "declined"
        row["invite_token"] = None
        await broadcast_to_project(
            str(row.get("project_id") or ""),
            "team.members.changed",
            {"member": row, "action": "declined", "actor_email": user_email},
        )
    except Exception as ws_err:
        logger.info("[Team] decline broadcast skipped (non-fatal): %s", ws_err)

    return {"declined": True, "id": member_id}


@router.get("/invites/pending")
async def get_pending_invites(current_user=Depends(get_current_user)):
    """Return all pending invites for the authenticated user's email."""
    user_email = getattr(current_user, "email", "")
    user_id = str(current_user.id)

    # Match by email (catches invites sent before account existed) OR user_id
    try:
        res = (
            supabase.table("team_members")
            .select("*, projects(name)")
            .eq("status", "invited")
            .eq("email", user_email)
            .execute()
        )
    except Exception:
        # Fallback: match by user_id
        res = (
            supabase.table("team_members")
            .select("*, projects(name)")
            .eq("status", "invited")
            .eq("user_id", user_id)
            .execute()
        )

    rows = res.data or []
    # Also catch rows matched by user_id that have a different email
    try:
        by_uid = (
            supabase.table("team_members")
            .select("*, projects(name)")
            .eq("status", "invited")
            .eq("user_id", user_id)
            .execute()
        )
        for r in (by_uid.data or []):
            if not any(x["id"] == r["id"] for x in rows):
                rows.append(r)
    except Exception:
        pass

    # Flatten projects(name) join
    for row in rows:
        if isinstance(row.get("projects"), dict):
            row["project_name"] = row["projects"].get("name", row.get("project_id", ""))
        else:
            row["project_name"] = row.get("project_id", "")

    return rows


@router.patch("/{member_id}")
async def update_team_member_role(
    member_id: str,
    body: TeamMemberUpdate,
    current_user=Depends(get_current_user),
):
    """Update a team member's role."""
    user_id = str(current_user.id)
    member = supabase.table("team_members").select("*").eq("id", member_id).execute()
    if not member.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found")

    project_id = member.data[0].get("project_id")
    caller_role = _caller_role(user_id, project_id)
    if caller_role not in _ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can manage team members")

    if body.role not in _VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {sorted(_VALID_ROLES)}",
        )
    if body.role == "admin" and caller_role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the project owner can assign the admin role")

    # Never allow changing or stripping the project owner's own role
    owner_res = supabase.table("projects").select("owner_id").eq("id", project_id).single().execute()
    target_user_id = member.data[0].get("user_id")
    if owner_res.data and target_user_id and str(owner_res.data.get("owner_id")) == str(target_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The project owner's role cannot be changed")

    res = supabase.table("team_members").update({"role": body.role}).eq("id", member_id).execute()
    return res.data[0] if res.data else {"success": True}


@router.delete("/{member_id}")
async def remove_team_member(member_id: str, current_user=Depends(get_current_user)):
    """Remove a team member from a project."""
    user_id = str(current_user.id)
    member = supabase.table("team_members").select("*").eq("id", member_id).execute()
    if not member.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found")

    project_id = member.data[0].get("project_id")
    caller_role = _caller_role(user_id, project_id)
    if caller_role not in _ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can manage team members")

    # The project owner can never be removed via the team endpoint
    owner_res = supabase.table("projects").select("owner_id").eq("id", project_id).single().execute()
    target_user_id = member.data[0].get("user_id")
    if owner_res.data and target_user_id and str(owner_res.data.get("owner_id")) == str(target_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The project owner cannot be removed")

    supabase.table("team_members").delete().eq("id", member_id).execute()
    return {"deleted": True, "id": member_id}


@router.get("/search")
async def search_users(q: str = Query("", min_length=1), current_user=Depends(get_current_user)):
    """Search users by email or name for @mention autocomplete.

    Uses the Auth Admin API (service role) — `auth.users` is NOT exposed to
    PostgREST under the public schema (a raw `supabase.table("auth.users")` query
    fails with PGRST205).
    """
    try:
        admin_res = supabase.auth.admin.list_users()
        users = admin_res if isinstance(admin_res, list) else getattr(admin_res, "users", [])
    except Exception as exc:
        logger.warning("[Team] user search (admin.list_users) failed: %s", exc)
        return []

    needle = q.strip().lower()
    results: list[dict] = []
    for u in users:
        email = (getattr(u, "email", "") or "").lower()
        meta = getattr(u, "user_metadata", None) or {}
        full_name = (meta.get("full_name") or meta.get("name") or "").lower()
        user_name = (meta.get("user_name") or meta.get("preferred_username") or "").lower()
        if needle and needle not in email and needle not in full_name and needle not in user_name:
            continue
        display_name = meta.get("full_name") or meta.get("name") or (getattr(u, "email", "") or "").split("@")[0]
        results.append({
            "id": str(u.id),
            "email": getattr(u, "email", ""),
            "name": display_name,
            "avatar_url": meta.get("avatar_url", ""),
        })
        if len(results) >= 10:
            break
    return results