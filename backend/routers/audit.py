"""Audit logs router — paginated read endpoint."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from database import supabase
from dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def list_audit_logs(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    project_id: Optional[str] = Query(default=None),
    current_user=Depends(get_current_user),
):
    """Return paginated audit logs for the authenticated user."""
    query = supabase.table("audit_logs").select("*").eq("user_id", str(current_user.id))
    if project_id:
        query = query.eq("project_id", project_id)
    res = (
        query.order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return res.data or []
