"""Activity feed router — reads from the generic entity_activities table."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from database import supabase
from dependencies import get_current_user, get_user_project_ids

logger = logging.getLogger(__name__)
router = APIRouter()

_ENTITY_PROJECT_KEYS = {
    "project": None,  # entity_id is the project id itself
    "deployment": "deployments",
    "incident": "incidents",
    "rollback": "rollback_operations",
}


def _assert_owns(entity_type: str, entity_id: str, user_id: str):
    """Raise 400/404 unless the entity belongs to a project the user is a member of."""
    project_table = _ENTITY_PROJECT_KEYS.get(entity_type)
    if entity_type not in _ENTITY_PROJECT_KEYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported entity type: {entity_type}")

    if project_table is None:
        project_id = entity_id
    else:
        res = supabase.table(project_table).select("project_id").eq("id", entity_id).single().execute()
        project_id = res.data["project_id"] if res.data else None

    if not project_id or project_id not in get_user_project_ids(user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")


@router.get("/{entity_type}/{entity_id}")
async def get_activity(
    entity_type: str,
    entity_id: str,
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
):
    """Return a paginated activity feed for an entity."""
    _assert_owns(entity_type, entity_id, str(current_user.id))

    res = (
        supabase.table("entity_activities")
        .select("*")
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return res.data or []


@router.get("/{entity_type}/{entity_id}/count")
async def activity_count(
    entity_type: str,
    entity_id: str,
    current_user=Depends(get_current_user),
):
    """Return the number of activity entries for an entity."""
    _assert_owns(entity_type, entity_id, str(current_user.id))
    res = (
        supabase.table("entity_activities")
        .select("id", count="exact")
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .execute()
    )
    return {"count": res.count if res.count is not None else 0}