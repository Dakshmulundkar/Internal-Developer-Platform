"""Comment router — works across deployments, rollbacks, and projects.

Also parses @mentions in comments and notifies mentioned users.
"""

import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from database import supabase
from dependencies import get_current_user, get_user_project_ids
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

_COMMENT_TABLES = {
    "deployment": ("deployment_comments", "deployment_id", "deployments"),
    "rollback": ("rollback_comments", "rollback_id", "rollback_operations"),
    "project": ("project_comments", "project_id", "projects"),
}


def _table_for(entity_type: str, entity_id: str, user_id: str):
    """Return (fkey_col, table_name) if the user is a member of the entity's project, else raise 404."""
    if entity_type not in _COMMENT_TABLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported entity type: {entity_type}")

    table, fkey_col, parent_table = _COMMENT_TABLES[entity_type]
    project_ids = get_user_project_ids(user_id)

    if entity_type == "project":
        project_id = entity_id
    elif entity_type == "deployment":
        parent = supabase.table("deployments").select("project_id").eq("id", entity_id).single().execute()
        project_id = parent.data["project_id"] if parent.data else None
    else:
        parent = supabase.table("rollback_operations").select("project_id").eq("id", entity_id).single().execute()
        project_id = parent.data["project_id"] if parent.data else None

    if not project_id or project_id not in project_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")

    return table, fkey_col


def _extract_mentions(content: str) -> list[str]:
    """Extract @username mentions from content; return unique usernames."""
    pattern = r"@([a-zA-Z0-9_.-]+)"
    matches = re.findall(pattern, content)
    return list(dict.fromkeys(matches))


async def _notify_mentioned(mentioned: list[str], entity_type: str, entity_id: str, by_name: str, content: str, requester_id: str):
    """Look up users by name/email and send them notifications."""
    if not mentioned:
        return
    for username in mentioned:
        # Try to match a user by email prefix or name
        user_res = supabase.table("auth.users").select("id,email").ilike("email", f"{username}%").execute()
        if not user_res.data:
            user_res = supabase.table("auth.users").select("id,email").ilike("email", f"%{username}@%").execute()
        if not user_res.data:
            continue
        target_user = user_res.data[0]
        if str(target_user["id"]) == requester_id:
            continue
        try:
            from services.notification_service import create_notification
            await create_notification(
                user_id=str(target_user["id"]),
                title=f"Mentioned by {by_name}",
                message=f"{by_name} mentioned you in a {entity_type} comment: {content[:80]}",
                type="mention",
            )
        except Exception as exc:
            logger.warning("Mention notification failed for %s: %s", username, exc)


class CommentCreate(BaseModel):
    content: str


class CommentUpdate(BaseModel):
    content: str


@router.get("/{entity_type}/{entity_id}")
async def list_comments(
    entity_type: str,
    entity_id: str,
    current_user=Depends(get_current_user),
):
    """List comments for an entity."""
    table, fkey_col = _table_for(entity_type, entity_id, str(current_user.id))
    res = supabase.table(table).select("*").eq(fkey_col, entity_id).order("created_at", desc=True).execute()
    return res.data or []


@router.post("/{entity_type}/{entity_id}")
async def add_comment(
    entity_type: str,
    entity_id: str,
    body: CommentCreate,
    current_user=Depends(get_current_user),
):
    """Add a comment to an entity (deployment / rollback / project)."""
    table, fkey_col = _table_for(entity_type, entity_id, str(current_user.id))

    user_name = getattr(current_user, "email", "").split("@")[0] or "User"

    comment_row = {
        fkey_col: entity_id,
        "user_id": str(current_user.id),
        "user_name": user_name,
        "content": body.content,
    }
    res = supabase.table(table).insert(comment_row).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to add comment")

    # @mention notification
    mentioned = _extract_mentions(body.content)
    if mentioned:
        await _notify_mentioned(
            mentioned, entity_type, entity_id,
            by_name=user_name, content=body.content,
            requester_id=str(current_user.id),
        )

    # Log entity activity
    try:
        supabase.table("entity_activities").insert({
            "entity_type": entity_type,
            "entity_id": entity_id,
            "user_id": str(current_user.id),
            "user_name": user_name,
            "action": "comment",
            "description": f"Comment added: {body.content[:80]}",
        }).execute()
    except Exception:
        pass

    return res.data[0]


@router.patch("/{entity_type}/{entity_id}/{comment_id}")
async def edit_comment(
    entity_type: str,
    entity_id: str,
    comment_id: str,
    body: CommentUpdate,
    current_user=Depends(get_current_user),
):
    """Edit an existing comment."""
    table, _ = _table_for(entity_type, entity_id, str(current_user.id))
    res = supabase.table(table).update({
        "content": body.content,
        "edited": True,
        "edited_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", comment_id).eq("user_id", str(current_user.id)).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found or not yours")
    return res.data[0]


@router.delete("/{entity_type}/{entity_id}/{comment_id}")
async def delete_comment(
    entity_type: str,
    entity_id: str,
    comment_id: str,
    current_user=Depends(get_current_user),
):
    """Delete a comment (author only)."""
    table, _ = _table_for(entity_type, entity_id, str(current_user.id))

    # Allow deletion by comment author
    res = supabase.table(table).delete().eq("id", comment_id).eq("user_id", str(current_user.id)).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found or not yours")
    return {"deleted": True, "id": comment_id}