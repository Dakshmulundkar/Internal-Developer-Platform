"""Rollback router — trigger and status endpoints."""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from database import supabase
from dependencies import get_current_user
from models.rollback import RollbackRequest, RollbackResponse
from services.rollback_service import execute_rollback, poll_rollback_status

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def start_rollback(
    body: RollbackRequest,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
):
    """Initiate a rollback and kick off background polling."""
    try:
        rollback_id = await execute_rollback(
            project_id=body.project_id,
            target_deployment_id=body.target_deployment_id,
            user_id=str(current_user.id),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("execute_rollback error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Rollback failed") from exc

    background_tasks.add_task(poll_rollback_status, rollback_id)
    return {"rollback_id": rollback_id, "status": "in_progress"}


@router.get("/{rollback_id}", response_model=RollbackResponse)
async def get_rollback(rollback_id: str, current_user=Depends(get_current_user)):
    """Fetch the current status of a rollback operation."""
    res = supabase.table("rollback_operations").select("*").eq("id", rollback_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rollback not found")
    op = res.data
    return RollbackResponse(
        rollback_id=op["id"],
        status=op.get("status", "in_progress"),
        audit_logs=op.get("audit_logs", []),
    )
