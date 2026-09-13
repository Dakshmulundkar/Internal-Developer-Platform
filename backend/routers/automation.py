"""Automation router — CRUD for automation rules and execution history."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from database import supabase
from dependencies import get_current_user, get_user_project_ids
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()


class AutomationRuleIn(BaseModel):
    name: str
    description: str = ""
    enabled: bool = True
    sort_order: int = 0
    project_id: str | None = None
    trigger_type: str
    tags: list[str | None] = Field(default_factory=list)
    conditions: list = Field(default_factory=list)
    actions: list = Field(default_factory=list)


class AutomationRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    sort_order: int | None = None
    project_id: str | None = None
    trigger_type: str | None = None
    tags: list[str | None] | None = None
    conditions: list | None = None
    actions: list | None = None


def _user_project_ids(user_id: str) -> list[str]:
    return get_user_project_ids(user_id)


@router.get("/rules")
async def list_rules(trigger_type: str = None, current_user=Depends(get_current_user)):
    """List automation rules owned by the current user."""
    user_id = str(current_user.id)
    query = supabase.table("automation_rules").select("*").eq("owner_id", user_id)
    if trigger_type:
        query = query.eq("trigger_type", trigger_type)
    res = query.order("sort_order", desc=False).order("created_at", desc=True).execute()
    return res.data or []


@router.post("/rules", status_code=status.HTTP_201_CREATED)
async def create_rule(body: AutomationRuleIn, current_user=Depends(get_current_user)):
    """Create a new automation rule."""
    user_id = str(current_user.id)
    if body.project_id and body.project_id not in _user_project_ids(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    data = body.model_dump()
    data["owner_id"] = user_id
    if not data.get("sort_order"):
        rows = (supabase.table("automation_rules").select("sort_order").eq("owner_id", user_id).execute().data or [])
        data["sort_order"] = max((r.get("sort_order") or 0 for r in rows), default=-1) + 1
    res = supabase.table("automation_rules").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create rule")
    return res.data[0]


@router.patch("/rules/{rule_id}")
async def update_rule(rule_id: str, body: AutomationRuleUpdate, current_user=Depends(get_current_user)):
    """Update an automation rule."""
    user_id = str(current_user.id)
    rule = supabase.table("automation_rules").select("*").eq("id", rule_id).execute()
    if not rule.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    if str(rule.data[0].get("owner_id")) != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    data = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if "project_id" in data and data.get("project_id") and data.get("project_id") not in _user_project_ids(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    res = supabase.table("automation_rules").update(data).eq("id", rule_id).execute()
    return res.data[0] if res.data else {"success": True}


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str, current_user=Depends(get_current_user)):
    """Delete an automation rule."""
    user_id = str(current_user.id)
    rule = supabase.table("automation_rules").select("*").eq("id", rule_id).execute()
    if not rule.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    if str(rule.data[0].get("owner_id")) != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    supabase.table("automation_rules").delete().eq("id", rule_id).execute()
    return {"deleted": True, "id": rule_id}


@router.get("/executions")
async def list_executions(limit: int = Query(50, ge=1, le=200), current_user=Depends(get_current_user)):
    """List recent executions for the user's rules."""
    user_id = str(current_user.id)
    rule_ids = [
        r["id"]
        for r in (supabase.table("automation_rules").select("id").eq("owner_id", user_id).execute().data or [])
    ]
    if not rule_ids:
        return []
    res = (
        supabase.table("automation_executions")
        .select("*")
        .in_("rule_id", rule_ids)
        .order("executed_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


@router.get("/triggers")
async def list_triggers(current_user=Depends(get_current_user)):
    """Return the list of supported trigger types and example conditions."""
    return {
        "triggers": [
            {
                "type": "deployment.status_change",
                "description": "A deployment changes status (queued → building → ready/failed)",
                "example_conditions": [{"field": "status", "op": "eq", "value": "failed"}],
                "example_actions": [
                    {"type": "notify", "title": "Deployment failed", "message": "A deployment just failed."},
                    {"type": "email", "subject": "Deployment failed"},
                    {"type": "webhook", "url": "https://example.com/hooks/idp"},
                ],
            },
            {
                "type": "incident.created",
                "description": "A new incident is created (from alerts or failed deployments)",
                "example_conditions": [{"field": "severity", "op": "eq", "value": "critical"}],
                "example_actions": [
                    {"type": "notify", "title": "Critical incident", "message": "A critical incident was created."},
                    {"type": "comment", "content": "Automated acknowledgement: team notified."},
                ],
            },
            {
                "type": "alert.fired",
                "description": "A monitoring alert fires",
                "example_conditions": [{"field": "severity", "op": "in", "value": ["critical", "high"]}],
                "example_actions": [
                    {"type": "notify", "title": "Alert", "message": "An alert just fired."},
                    {"type": "webhook", "url": "https://example.com/pager"},
                ],
            },
        ]
    }


@router.post("/test")
async def test_rule(body: AutomationRuleIn, current_user=Depends(get_current_user)):
    """Dry-run: evaluate a rule against a sample entity without persisting."""
    from services.automation_engine import _evaluate_conditions, _eval_op

    entity = {
        "id": "sample",
        "project_id": body.project_id or "sample-project",
        "status": "failed",
        "severity": "critical",
    }
    matched = _evaluate_conditions(body.conditions or [], entity)
    return {"conditions_met": matched, "sample_entity": entity}