"""GitHub security triage webhook receiver.

Receives a POST from the per-service GitHub Actions security triage workflow
(``/webhooks/github/security/{service_id}``), verifies the ``X-Hub-Signature-256``
HMAC-SHA256 signature, resolves the registered project (RBAC scoping), and queues
incident creation to the background so the webhook request never blocks (202).

Conditional verification: when ``GITHUB_WEBHOOK_SECRET`` is not configured the
signature check is skipped (a warning is logged) so local testing still works.
"""

import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status

from config import settings
from database import supabase
from services.incident_service import create_from_security_triage

logger = logging.getLogger(__name__)
router = APIRouter()


def _verify_security_webhook(request_body: bytes, signature: str) -> bool:
    """Verify the GitHub ``X-Hub-Signature-256`` HMAC-SHA256 signature."""
    if not settings.GITHUB_WEBHOOK_SECRET:
        if settings.ENVIRONMENT == "production":
            logger.error(
                "GITHUB_WEBHOOK_SECRET not configured — refusing webhook in production"
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Webhook not configured",
            )
        logger.warning(
            "GITHUB_WEBHOOK_SECRET not configured — webhook signature verification disabled (dev only)"
        )
        return True
    expected = "sha256=" + hmac.new(
        settings.GITHUB_WEBHOOK_SECRET.encode(),
        request_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/security/{service_id}", status_code=status.HTTP_202_ACCEPTED)
async def github_security_webhook(
    service_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Create service-scoped security incidents from a triage payload.

    The request returns immediately (202) and the incidents are created in the
    background via ``create_from_security_triage`` (per-incident error isolation
    + per-project WebSocket broadcast).
    """
    body = await request.body()

    signature = request.headers.get("x-hub-signature-256", "")
    if not _verify_security_webhook(body, signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )

    # The service must be registered on a project for RBAC scoping. Accept
    # either the service_name or the service_id for robustness.
    service_name = payload.get("service_name") or service_id
    proj_res = (
        supabase.table("projects")
        .select("id")
        .in_("service_name", [service_name, service_id])
        .limit(1)
        .execute()
    )
    project_id = proj_res.data[0]["id"] if proj_res.data else None

    if not project_id:
        logger.error(
            "Security triage webhook: service %s not registered on any project",
            service_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service {service_id} not found",
        )

    background_tasks.add_task(create_from_security_triage, project_id, payload)

    logger.info(
        "Security triage webhook accepted for service=%s project=%s",
        service_id,
        project_id,
    )

    return {
        "status": "accepted",
        "service_id": service_id,
        "project_id": project_id,
        "message": "Webhook queued for processing",
    }