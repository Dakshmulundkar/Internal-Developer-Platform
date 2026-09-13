"""Security incidents API — project-scoped RBAC over security triage rows.

All queries are scoped to the authenticated user's project membership (owner +
team member), mirroring the RLS policies enforced at the database layer.
"""

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from database import supabase
from dependencies import get_current_user, get_user_project_ids
from services.security_service import SecurityTriageService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/security", tags=["security"])


def _resolve_accessible_incident(incident_id: str, user_id: str) -> Dict[str, Any]:
    """Resolve an incident with proper 404 / 403 / 400 semantics."""
    try:
        res = (
            supabase.table("incidents")
            .select("id, project_id, source, status")
            .eq("id", incident_id)
            .single()
            .execute()
        )
    except Exception:
        res = None

    if not res or not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    incident = res.data
    if incident.get("source") != "security_triage":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not a security incident",
        )

    if str(incident.get("project_id")) not in get_user_project_ids(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return incident


@router.get("/incidents")
async def get_security_incidents(
    project_id: Optional[str] = Query(None),
    service_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
):
    """List security incidents visible to the current user (project-scoped)."""
    service = SecurityTriageService(str(current_user.id))
    incidents, total = service.get_incidents_for_user(
        project_id=project_id,
        service_id=service_id,
        severity=severity,
        status=status,
        limit=limit,
        offset=offset,
    )

    if project_id and project_id not in service._user_project_ids():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "incidents": [_format_incident(inc) for inc in incidents],
    }


@router.get("/incidents/{incident_id}")
async def get_incident_detail(
    incident_id: str,
    current_user=Depends(get_current_user),
):
    """Detailed view of a single security incident."""
    _resolve_accessible_incident(incident_id, str(current_user.id))
    service = SecurityTriageService(str(current_user.id))
    incident = service.get_incident_by_id(incident_id)
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return _format_incident(incident)


@router.post("/incidents/{incident_id}/resolve")
async def resolve_incident(
    incident_id: str,
    body: Optional[Dict[str, Any]] = None,
    current_user=Depends(get_current_user),
):
    """Resolve a security incident with audit logging."""
    _resolve_accessible_incident(incident_id, str(current_user.id))

    notes = (body or {}).get("resolution_notes")
    service = SecurityTriageService(str(current_user.id))
    try:
        incident = service.resolve_incident(incident_id, notes=notes)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    # Real-time: reflect the fix/resolve to every connected member of the project
    try:
        from services.websocket_service import broadcast_incident_changed
        await broadcast_incident_changed(incident, actor_name=getattr(current_user, "email", "") or "")
    except Exception as exc:
        logger.debug("security resolve broadcast skipped (non-fatal): %s", exc)

    return {"status": "resolved", "incident": _format_incident(incident)}


@router.post("/incidents/{incident_id}/ignore")
async def ignore_incident(
    incident_id: str,
    body: Optional[Dict[str, Any]] = None,
    current_user=Depends(get_current_user),
):
    """Ignore a security incident with a validated reason."""
    _resolve_accessible_incident(incident_id, str(current_user.id))

    reason = (body or {}).get("reason")
    if reason not in ["false_positive", "acceptable_risk", "wont_fix"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reason",
        )

    service = SecurityTriageService(str(current_user.id))
    try:
        incident = service.ignore_incident(incident_id, reason)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    # Real-time: reflect the ignore to every connected member of the project
    try:
        from services.websocket_service import broadcast_incident_changed
        await broadcast_incident_changed(incident, actor_name=getattr(current_user, "email", "") or "")
    except Exception as exc:
        logger.debug("security ignore broadcast skipped (non-fatal): %s", exc)

    return {"status": "ignored", "reason": reason, "incident": _format_incident(incident)}


@router.get("/metrics")
async def get_security_metrics(
    project_id: Optional[str] = Query(None),
    service_id: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
    current_user=Depends(get_current_user),
):
    """Aggregated security metrics across the user's projects."""
    service = SecurityTriageService(str(current_user.id))
    metrics = service.get_metrics(
        project_id=project_id,
        service_id=service_id,
        days=days,
    )
    if project_id and project_id not in service._user_project_ids():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return metrics


def _format_incident(incident: Dict[str, Any]) -> Dict[str, Any]:
    """Shape an incident row into the API response schema."""
    return {
        "id": str(incident.get("id")),
        "project_id": str(incident.get("project_id")),
        "service_id": incident.get("service_id"),
        "title": incident.get("title"),
        "description": incident.get("description"),
        "severity": incident.get("severity"),
        "status": incident.get("status"),
        "source": incident.get("source"),
        "provider": incident.get("provider"),
        "security_metadata": incident.get("security_metadata") or {},
        "visibility_scope": incident.get("visibility_scope"),
        "created_at": incident.get("created_at"),
        "updated_at": incident.get("updated_at"),
        "resolved_at": incident.get("resolved_at"),
    }