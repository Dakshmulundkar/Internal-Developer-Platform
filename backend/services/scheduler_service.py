"""Scheduled tasks service — runs DB-backed jobs via APScheduler inside the FastAPI process.

Tasks are stored in the `scheduled_tasks` table (cron_expression, task_type, task_config).
Supported task types:
  - email_digest   send an email digest to the rule owner's email
  - health_check   run a monitoring probe for a project
  - alert_sync     sync plugin alerts (best-effort, placeholder)
  - report         emit a message summary as a notification
  - security_rescan  IDP-side Trivy rescan of a project's repo/image
  - repo_poll      watch a linked GitHub branch; dispatch a build on new commits
                   (auto-created per repo-linked project — this is what makes
                   pushes turn into pipeline runs with zero setup)

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

        if task_type == "security_rescan":
            # IDP-side Trivy rescan of a project's repo/image. Catches CVEs
            # disclosed after the code was pushed (event-driven scans miss these).
            if not project_id:
                return {"status": "skipped", "detail": "No project_id configured"}
            try:
                from services.trivy_service import scan_project

                outcome = await scan_project(
                    str(project_id), image_ref=str(config.get("image_ref") or ""))
                return {"status": outcome.get("status", "success"), "detail": outcome.get("detail", "")}
            except Exception as exc:
                logger.warning("security_rescan failed: %s", exc)
                return {"status": "failed", "detail": str(exc)}

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

        if task_type == "repo_poll":
            return await _poll_repo_commit(task)

        return {"status": "skipped", "detail": f"Unsupported task type: {task_type}"}
    except Exception as exc:
        logger.error("Scheduled task %s failed: %s", task.get("id"), exc)
        return {"status": "failed", "detail": str(exc)}


async def _job_wrapper(task: dict) -> None:
    """Async job body executed by APScheduler.

    Re-reads the task row on every fire: repo_poll advances ``last_sha`` in
    the DB each tick, and users edit tasks in the UI — the captured dict from
    schedule time would be stale in both cases (stale last_sha would dispatch
    the same commit forever). Deleted/disabled tasks are dropped or skipped.
    """
    task_id = task.get("id")
    try:
        res = supabase.table("scheduled_tasks").select("*").eq("id", task_id).execute()
        rows = res.data or []
    except Exception as exc:
        # Transient read failure: skip this tick, keep the job. Only a
        # successful read proving deletion removes the job.
        logger.debug("scheduled task refresh failed for %s: %s", task_id, exc)
        return
    fresh = rows[0] if rows else None
    if fresh is None:
        try:
            if _scheduler is not None:
                _scheduler.remove_job(f"sched-{task_id}")
        except Exception:
            pass
        return
    if not fresh.get("enabled", True):
        return
    outcome = await _run_task(fresh)
    _record_run(fresh, outcome)


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


# ── Repo polling (push → pipeline) ────────────────────────────────────────────

# Default cadence for auto-created poll tasks. Editable per task in the UI.
REPO_POLL_CRON = "*/5 * * * *"


async def _github_branch_head(owner: str, repo: str, branch: str, token: str):
    """Return (sha, message, author) for the branch HEAD, or None on failure."""
    import httpx

    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "aether-idp"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/commits/{branch}",
                headers=headers)
    except Exception as exc:
        logger.warning("repo_poll: commit lookup failed for %s/%s: %s", owner, repo, exc)
        return None
    if resp.status_code != 200:
        logger.warning("repo_poll: GitHub returned %s for %s/%s@%s",
                       resp.status_code, owner, repo, branch)
        return None
    payload = resp.json()
    return (
        str(payload.get("sha", "")),
        str((payload.get("commit") or {}).get("message", "")),
        str(((payload.get("commit") or {}).get("author") or {}).get("name", "")),
    )


def _actions_outcome(run: dict):
    """Map a GitHub Actions run to (deployment_status, stage_status), or None to skip."""
    status, conclusion = run.get("status"), (run.get("conclusion") or "")
    if status == "completed":
        if conclusion == "success":
            return "ready", "success"
        if conclusion in ("failure", "timed_out"):
            return "failed", "failed"
        if conclusion == "cancelled":
            return "canceled", "pending"
        return None
    if status in ("in_progress", "queued", "waiting", "pending", "requested"):
        return "building", "running"
    return None


async def _github_actions_runs(owner: str, repo: str, branch: str, token: str, limit: int):
    """Recent workflow runs for the branch (newest first). Raises on API failure."""
    import httpx

    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "aether-idp"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/actions/runs",
            params={"branch": branch, "per_page": max(1, min(50, limit))},
            headers=headers)
    if resp.status_code != 200:
        raise RuntimeError(f"GitHub Actions API returned {resp.status_code}")
    return (resp.json().get("workflow_runs") or [])


async def _backfill_runs(owner: str, repo: str, branch: str, token: str,
                         project: dict, owner_uid: str, limit: int) -> int:
    """Import recent Actions runs as deployment rows (history backfill).

    Same row shape as live dispatches; no dry-run walk (the work already ran
    on GitHub — statuses come from real conclusions, never fabricated).
    Already-imported run ids are skipped. Returns rows created.
    """
    from routers import deployments as dep_router
    from services.pipeline_file import PipelineFileError, fetch_definition

    runs = await _github_actions_runs(owner, repo, branch, token, limit)
    if not runs:
        return 0
    try:
        pipeline = await fetch_definition(owner, repo, branch, token)
    except PipelineFileError:
        pipeline = {"path": "ci.yml", "job_count": 0, "step_count": 0}
    project_id = project.get("id")
    try:
        existing = (supabase.table("deployments").select("external_event_id")
                    .eq("project_id", project_id).execute().data or [])
        known = {str(r.get("external_event_id") or "") for r in existing}
    except Exception as exc:
        # Without the dedup set a retry would re-import everything as
        # duplicates — abort the backfill instead; the next tick retries.
        raise RuntimeError(f"backfill dedup read failed: {exc}")
    provider_name = dep_router._provider_connected(owner_uid)
    made = 0
    for run in runs:
        mapped = _actions_outcome(run)
        if mapped is None:
            continue
        dep_status, stage_status = mapped
        event_id = f"gha-{project_id}-{run.get('id')}"
        if event_id in known:
            continue
        head_commit = run.get("head_commit") or {}
        commit = {
            "sha": str(run.get("head_sha") or ""),
            "message": str(head_commit.get("message") or ""),
            "author": str((head_commit.get("author") or {}).get("name") or ""),
        }
        url = run.get("html_url") or ""
        preset = {
            "status": dep_status,
            "stages": [
                {"name": "Build", "status": stage_status, "durationMs": 0},
                {"name": "Security", "status": "pending", "durationMs": 0},
                {"name": "Test", "status": "pending", "durationMs": 0},
                {"name": "Deploy", "status": "pending", "durationMs": 0},
            ],
            "created_at": run.get("created_at") or None,
            "logs": [
                f"Imported from GitHub Actions run #{run.get('id')} "
                f"({run.get('conclusion') or run.get('status')}) — {url}".strip(),
                f"Commit {str(commit['sha'])[:7]}: "
                f"{str(commit['message']).split(chr(10))[0][:200]}".strip(),
            ],
        }
        if dep_status == "failed":
            preset["error_message"] = (
                f"GitHub Actions run #{run.get('id')} concluded "
                f"{run.get('conclusion')}: {url}".strip())
        try:
            created = await dep_router._dispatch_build_run(
                project, owner_uid, pipeline, commit, provider_name,
                lambda *a: None, event_id, preset)
        except Exception as exc:
            # One poison run must not abort the whole batch (or block the
            # backfilled flag forever) — skip it, import the rest.
            logger.warning("repo_poll backfill row failed for run %s: %s",
                           run.get("id"), exc)
            continue
        if created:
            made += 1
            known.add(event_id)
    return made


async def _poll_repo_commit(task: dict) -> dict:
    """One poll tick: backfill history once, then dispatch iff HEAD moved.

    Same run shape as the manual PipelineCenter dispatch — the shared
    ``_dispatch_build_run`` core stores the queued deployment and schedules
    the dry-run walk.
    """
    from routers import deployments as dep_router
    from routers.projects import _normalize_repo, _user_github_token
    from services.pipeline_file import PipelineFileError, fetch_definition

    project_id = task.get("project_id")
    if not project_id:
        return {"status": "skipped", "detail": "No project_id configured"}
    proj = supabase.table("projects").select("*").eq("id", project_id).single().execute()
    project = proj.data if getattr(proj, "data", None) else None
    if not project:
        return {"status": "skipped", "detail": "Project no longer exists"}

    owner, repo = _normalize_repo(project.get("repo_owner") or "", project.get("repo_name") or "")
    if not owner or not repo:
        return {"status": "skipped", "detail": "Project has no GitHub repository linked"}

    config = dict(task.get("task_config") or {})
    branch = str(config.get("branch") or project.get("branch") or "main")
    owner_uid = str(task.get("owner_id") or project.get("owner_id") or "")
    token = _user_github_token(owner_uid)
    head = await _github_branch_head(owner, repo, branch, token)
    if not head or not head[0]:
        return {"status": "skipped", "detail": f"Could not read {owner}/{repo}@{branch}"}
    sha, message, author = head

    if not config.get("backfilled"):
        # First pass (or pre-backfill tasks): import recent Actions runs so
        # every version is visible, then track HEAD going forward.
        try:
            limit = int(config.get("backfill_limit") or 20)
        except (TypeError, ValueError):
            limit = 20
        try:
            imported = await _backfill_runs(owner, repo, branch, token,
                                            project, owner_uid, limit)
        except Exception as exc:
            logger.warning("repo_poll backfill failed for %s/%s: %s", owner, repo, exc)
            return {"status": "failed",
                    "detail": f"History backfill failed, will retry: {exc}"}
        config["backfilled"] = True
        config["last_sha"] = sha
        supabase.table("scheduled_tasks").update({"task_config": config}).eq("id", task["id"]).execute()
        tail = f", backfilled {imported} run(s)" if imported else ""
        return {"status": "success",
                "detail": f"tracking {owner}/{repo}@{branch} at {sha[:7]}{tail}"}

    last_sha = str(config.get("last_sha") or "")
    if not last_sha:
        config["last_sha"] = sha
        supabase.table("scheduled_tasks").update({"task_config": config}).eq("id", task["id"]).execute()
        return {"status": "success", "detail": f"tracking {owner}/{repo}@{branch} at {sha[:7]}"}
    if sha == last_sha:
        return {"status": "success", "detail": f"no new commits ({sha[:7]})"}

    try:
        pipeline = await fetch_definition(owner, repo, branch, token)
    except PipelineFileError as exc:
        return {"status": "failed", "detail": f"Pipeline file unreadable: {exc.detail}"}

    import asyncio
    import time as _time

    def _schedule_bg(fn, *args):
        # BackgroundTasks.add_task(fn, *args) shape → asyncio equivalent.
        asyncio.create_task(fn(*args))

    created = await dep_router._dispatch_build_run(
        project, owner_uid, pipeline,
        {"sha": sha, "message": message, "author": author},
        dep_router._provider_connected(owner_uid),
        _schedule_bg, f"auto-{project_id}-{sha[:7]}-{int(_time.time())}")
    # Let the scheduled dry-run start so it isn't destroyed with this tick.
    await asyncio.sleep(0)
    if not created:
        return {"status": "failed", "detail": "Could not store the build run"}

    config["last_sha"] = sha
    supabase.table("scheduled_tasks").update({"task_config": config}).eq("id", task["id"]).execute()
    return {"status": "success",
            "detail": f"new commit {sha[:7]} dispatched as build {created.get('id')}"}


def schedule_task(task: dict) -> bool:
    """Add (or replace) one task's job on the live scheduler. Best-effort."""
    if not APS_AVAILABLE or _scheduler is None:
        return False
    try:
        trigger = _cron_parse(task.get("cron_expression") or "*/5 * * * *")
        _scheduler.add_job(
            _job_wrapper, trigger, args=[task],
            id=f"sched-{task['id']}", replace_existing=True,
            coalesce=True, max_instances=1, misfire_grace_time=60,
        )
        return True
    except Exception as exc:
        logger.warning("Failed to schedule task %s: %s", task.get("name"), exc)
        return False


def ensure_repo_poll_task(project: dict) -> dict | None:
    """Create + live-schedule the auto-build poll task for a repo-linked project.

    Idempotent: returns the existing row when one is already present.
    Never raises — called from request paths and startup.
    """
    try:
        from routers.projects import _normalize_repo

        owner, repo = _normalize_repo(project.get("repo_owner") or "", project.get("repo_name") or "")
        project_id = project.get("id")
        owner_id = project.get("owner_id")
        if not owner or not repo or not project_id or not owner_id:
            return None
        existing = (supabase.table("scheduled_tasks").select("*")
                    .eq("project_id", project_id).eq("task_type", "repo_poll")
                    .execute().data or [])
        if existing:
            schedule_task(existing[0])
            return existing[0]
        row = {
            "name": f"Auto-build {repo}",
            "description": f"Dispatch a pipeline run on every new commit to {owner}/{repo}.",
            "enabled": True,
            "cron_expression": REPO_POLL_CRON,
            "task_type": "repo_poll",
            "task_config": {"branch": project.get("branch") or "main"},
            "project_id": project_id,
            "owner_id": owner_id,
        }
        res = supabase.table("scheduled_tasks").insert(row).execute()
        if not res.data:
            return None
        schedule_task(res.data[0])
        logger.info("repo_poll task created for project %s (%s/%s)", project_id, owner, repo)
        return res.data[0]
    except Exception as exc:
        logger.warning("ensure_repo_poll_task failed: %s", exc)
        return None


def _ensure_all_repo_polls() -> int:
    """Create poll tasks for every repo-linked project missing one.

    Runs at scheduler startup so existing projects get auto-builds with
    zero setup. Returns the number of tasks created.
    """
    try:
        rows = (supabase.table("projects")
                .select("id,owner_id,repo_owner,repo_name,branch")
                .execute().data or [])
    except Exception as exc:
        logger.warning("repo_poll reconcile read failed: %s", exc)
        return 0
    made = 0
    for project in rows:
        before = True
        try:
            existing = (supabase.table("scheduled_tasks").select("id")
                        .eq("project_id", project.get("id")).eq("task_type", "repo_poll")
                        .execute().data or [])
            before = not existing
        except Exception:
            pass
        if before and ensure_repo_poll_task(project) is not None:
            made += 1
    if made:
        logger.info("repo_poll reconcile created %d task(s)", made)
    return made


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
        # Every repo-linked project gets an auto-build poll task — this is
        # what turns pushes into pipeline runs with zero user setup.
        try:
            _ensure_all_repo_polls()
        except Exception as exc:
            logger.warning("repo_poll reconcile skipped: %s", exc)
        tasks = (supabase.table("scheduled_tasks").select("*").eq("enabled", True).execute().data or [])
        loaded = 0
        for task in tasks:
            if schedule_task(task):
                loaded += 1
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