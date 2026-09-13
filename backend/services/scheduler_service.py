"""Scheduled tasks service — runs DB-backed jobs via APScheduler inside the FastAPI process.

Tasks are stored in the `scheduled_tasks` table (cron_expression, task_type, task_config).
Supported task types:
  - email_digest   send an email digest to the rule owner's email
  - health_check   run a monitoring probe for a project
  - alert_sync     sync plugin alerts (best-effort, placeholder)
  - report         emit a message summary as a notification

The scheduler is optional: if APScheduler is not installed the app still starts
and the /scheduled-tasks endpoints work (they just can't run yet).
"""

import logging
from datetime import datetime, timezone

from database import supabase

logger = logging.getLogger(__name__)

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger

    APS_AVAILABLE = True
except Exception:  # pragma: no cover
    APS_AVAILABLE = False

_scheduler = None  # type: ignore


# ── Task execution ────────────────────────────────────────────────────────────

async def _run_task(task: dict) -> dict:
    """Execute one scheduled task by its type."""
    task_type = task.get("task_type", "")
    config = task.get("task_config") or {}
    project_id = task.get("project_id")
    owner_id = task.get("owner_id")

    try:
        if task_type == "email_digest":
            from services.email_service import send_email

            email = None
            if owner_id:
                u = supabase.table("auth.users").select("email").eq("id", str(owner_id)).execute()
                email = u.data[0]["email"] if u.data else None
            if email:
                counts = {"incidents": 0, "alerts": 0, "deployments": 0}
                if project_id:
                    counts["incidents"] = len((supabase.table("incidents").select("id").eq("project_id", project_id).eq("status", "open").execute().data or []))
                    counts["deployments"] = len((supabase.table("deployments").select("id").eq("project_id", project_id).execute().data or []))
                html = (
                    f"<p>Here is your project digest.</p>"
                    f"<ul><li>Open incidents: {counts['incidents']}</li>"
                    f"<li>Deployments: {counts['deployments']}</li></ul>"
                )
                await send_email(email, config.get("subject") or "Aether IDP — Scheduled Digest", html)
            return {"status": "success", "detail": "email_digest executed"}

        if task_type == "health_check":
            if project_id:
                from services.service_prober import probe_project

                await probe_project(str(project_id))
                return {"status": "success", "detail": "health probe fired"}
            return {"status": "skipped", "detail": "No project_id configured"}

        if task_type == "alert_sync":
            # Best-effort: sync all connected monitoring plugins.
            try:
                from background.plugin_sync import sync_all_plugins

                await sync_all_plugins()
            except Exception as sync_exc:
                logger.warning("alert_sync plugin sync failed: %s", sync_exc)
            return {"status": "success", "detail": "alert_sync executed"}

        if task_type == "report":
            from services.notification_service import create_notification

            summary = config.get("message") or f"Scheduled report '{task.get('name')}'"
            await create_notification(
                user_id=str(owner_id) if owner_id else "",
                title=config.get("title") or "Scheduled Report",
                message=summary,
                type="info",
                project_id=project_id,
            )
            return {"status": "success", "detail": "report notification sent"}

        return {"status": "skipped", "detail": f"Unsupported task type: {task_type}"}
    except Exception as exc:
        logger.error("Scheduled task %s failed: %s", task.get("id"), exc)
        return {"status": "failed", "detail": str(exc)}


def _record_run(task: dict, outcome: dict) -> None:
    """Update last_run_at / next_run_at after a task fires."""
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        supabase.table("scheduled_tasks").update({"last_run_at": now_iso}).eq("id", task["id"]).execute()
        # Persist the outcome somewhere lightweight — reuse automation_executions? No.
        # Log via entity_activities is also possible but overkill; keep last_run_at only.
        logger.info("Scheduled task %s ran: %s", task.get("name"), outcome["status"])
    except Exception as exc:
        logger.warning("Failed to record scheduled task run: %s", exc)


async def _job_wrapper(task: dict) -> None:
    """Async job body executed by APScheduler."""
    outcome = await _run_task(task)
    _record_run(task, outcome)


def _cron_parse(expression: str):
    """Parse a 5-field cron expression to apscheduler CronTrigger args."""
    parts = expression.split()
    if len(parts) == 5:
        minute, hour, day, month, dow = parts
        return CronTrigger(
            minute=minute, hour=hour, day=day, month=month, day_of_week=dow,
            timezone=timezone.utc,
        )
    if len(parts) == 6:
        sec, minute, hour, day, month, dow = parts
        return CronTrigger(
            second=sec, minute=minute, hour=hour, day=day, month=month,
            day_of_week=dow, timezone=timezone.utc,
        )
    raise ValueError(f"Unsupported cron expression: {expression}")


def start_scheduler() -> bool:
    """Start the in-process APScheduler and load all enabled tasks.

    Returns True if the scheduler started, False if APScheduler is unavailable.
    """
    global _scheduler
    if not APS_AVAILABLE:
        logger.warning("APScheduler not installed — scheduled tasks will not run. pip install apscheduler")
        return False
    if _scheduler is not None:
        return True

    try:
        _scheduler = AsyncIOScheduler(timezone=timezone.utc)
        tasks = (supabase.table("scheduled_tasks").select("*").eq("enabled", True).execute().data or [])
        loaded = 0
        for task in tasks:
            try:
                trigger = _cron_parse(task.get("cron_expression", "0 */12 * * *"))
                _scheduler.add_job(
                    _job_wrapper, trigger, args=[task],
                    id=f"sched-{task['id']}", replace_existing=True,
                    coalesce=True, max_instances=1, misfire_grace_time=60,
                )
                loaded += 1
            except Exception as exc:
                logger.warning("Failed to schedule task %s: %s", task.get("name"), exc)
        _scheduler.start()
        logger.info("APScheduler started with %d loaded task(s).", loaded)
        return True
    except Exception as exc:
        logger.error("Failed to start scheduler: %s", exc)
        _scheduler = None
        return False


def get_scheduler_status() -> dict:
    """Return an informational status of the in-process scheduler."""
    if not APS_AVAILABLE:
        return {"available": False, "running": None, "jobs": 0}
    return {
        "available": True,
        "running": _scheduler is not None and bool(getattr(_scheduler, "running", False)),
        "jobs": len(getattr(_scheduler, "get_jobs", lambda: [])()) if _scheduler is not None else 0,
    }