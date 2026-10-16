"""Repo Auto-Fix endpoints (Phase 8, Tasks 79 + 81).

POST /repo/autofix/scan  — dry-run: clone, detect, lint, report. Never pushes.
POST /repo/autofix/apply — fix, commit to a fresh aether/autofix-* branch, open a PR.
GET  /repo/autofix/runs  — last 5 runs (audit trail, newest first).
"""

import logging
import secrets
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user, get_user_project_ids
from routers.github_token import get_stored_token
from routers.projects import _normalize_repo
from services import audit_service
from services.autofix import ai_fix
from services.autofix import detect as detect_mod
from services.autofix import lint_runner
from services.autofix import repo_service
from services.autofix import triage as triage_mod
from services.autofix.repo_service import RepoAccessError, redact

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_CLONE_MB = 200
SCAN_LIMIT_PER_DAY = 20
APPLY_LIMIT_PER_DAY = 10

# ponytail: in-memory daily windows reset on restart and don't span processes;
# move these counters to the DB if the backend ever scales past one process.
_scan_counts: dict = {}


class ProjectIn(BaseModel):
    project_id: str


class ApplyIn(BaseModel):
    project_id: str
    use_ai: bool = True


def _check_scan_limit(user_id: str) -> None:
    today = date.today().isoformat()
    day, count = _scan_counts.get(user_id, (today, 0))
    if day != today:
        day, count = today, 0
    if count >= SCAN_LIMIT_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail="Daily scan limit reached (20/day) — try again tomorrow.",
        )
    _scan_counts[user_id] = (day, count + 1)


def _today_start_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(hour=0, minute=0, second=0, microsecond=0)
        .isoformat()
    )


def _check_apply_limit(user_id: str) -> None:
    try:
        res = (
            supabase.table("autofix_runs")
            .select("id")
            .eq("user_id", user_id)
            .gte("created_at", _today_start_iso())
            .execute()
        )
        used = len(getattr(res, "data", None) or [])
    except Exception as exc:
        logger.warning("apply rate-limit check failed: %s", type(exc).__name__)
        used = 0
    if used >= APPLY_LIMIT_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail="Daily auto-fix limit reached (10/day) — try again tomorrow.",
        )


def _resolve_repo(project_id: str, user_id: str) -> str:
    """Return `owner/repo` for a project the user owns; 404 otherwise."""
    try:
        res = (
            supabase.table("projects")
            .select("id,owner_id,repo_owner,repo_name")
            .eq("id", project_id)
            .single()
            .execute()
        )
    except Exception:
        res = None
    project = getattr(res, "data", None) if res else None
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    if project.get("owner_id") != user_id and project_id not in get_user_project_ids(user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    owner, repo = _normalize_repo(
        project.get("repo_owner") or "", project.get("repo_name") or ""
    )
    if not owner or not repo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project has no GitHub repository linked.",
        )
    return f"{owner}/{repo}"


def _project_branch(project_id: str) -> str:
    """Project's configured branch (label for scanned-version stamps). "" when unknown."""
    try:
        res = supabase.table("projects").select("branch").eq("id", project_id).single().execute()
        return (res.data or {}).get("branch") or ""
    except Exception:
        return ""


def _record_run(user_id, project_id, repo, branch, pr_url, findings, run_status, error):
    try:
        supabase.table("autofix_runs").insert(
            {
                "user_id": user_id,
                "project_id": project_id,
                "repo": repo,
                "branch": branch,
                "pr_url": pr_url,
                "findings": findings,
                "status": run_status,
                "error": error,
            }
        ).execute()
    except Exception as exc:
        logger.warning("autofix run row insert failed: %s", type(exc).__name__)


def _user_name(current_user) -> str:
    return getattr(current_user, "email", "") or ""


@router.post("/scan")
async def scan_repo(body: ProjectIn, current_user=Depends(get_current_user)):
    user_id = str(current_user.id)
    _check_scan_limit(user_id)
    token, _login = get_stored_token(user_id)
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Connect GitHub in Settings → GitHub Auto-Fix first.",
        )
    full_name = _resolve_repo(body.project_id, user_id)

    findings = []
    try:
        with repo_service.temporary_clone(full_name, token) as clone:
            stack = detect_mod.detect_stack(clone)
            size = repo_service.tree_size_mb(clone)
            if stack != "unknown" and not any(
                (clone / name).exists()
                for name in ("Dockerfile", "Dockerfile.frontend", "Dockerfile.backend")
            ):
                findings.append(
                    {
                        "type": "missing_dockerfile",
                        "fixable": True,
                        "automation": "template",
                        "detail": f"No Dockerfile found ({stack} stack) — Auto-Fix can generate one.",
                    }
                )
            for entry in lint_runner.run_lint_fixes(clone):
                tool = entry["tool"]
                if entry["skipped_reason"]:
                    findings.append(
                        {
                            "type": "lint",
                            "tool": tool,
                            "fixable": False,
                            "automation": "none",
                            "detail": entry["skipped_reason"],
                        }
                    )
                elif entry["remaining_errors"] == 0 and not entry["fixed_files"]:
                    findings.append(
                        {
                            "type": "lint",
                            "tool": tool,
                            "fixable": False,
                            "automation": "none",
                            "detail": f"{tool} is clean.",
                        }
                    )
                else:
                    file_details = []
                    for f in entry.get("files", []):
                        size = ai_fix.file_size_bytes(clone, f["file"])
                        cls, reason = ai_fix.classify_file(
                            tool, f["errors"], size
                        )
                        file_details.append(
                            {
                                "file": f["file"],
                                "errors": f["errors"],
                                "fixable_count": f.get("fixable", 0),
                                "automation": "ai" if cls == "small" else "triage",
                                "reason": "" if cls == "small" else reason,
                                "cause": ai_fix.cause_hint(
                                    tool, f.get("messages", [])
                                ),
                                "messages": f.get("messages", [])[:5],
                            }
                        )
                    ai_n = sum(1 for d in file_details if d["automation"] == "ai")
                    triage_n = sum(
                        1 for d in file_details if d["automation"] == "triage"
                    )
                    findings.append(
                        {
                            "type": "lint",
                            "tool": tool,
                            "fixable": True,
                            "automation": "lint",
                            "detail": (
                                f"{entry['remaining_errors']} remaining issue(s) "
                                f"across {len(entry['fixed_files'])} auto-fixed file(s): "
                                f"{ai_n} file(s) AI-eligible, {triage_n} file(s) need a ticket."
                            ),
                            "files": file_details,
                        }
                    )
    except RepoAccessError as exc:
        raise HTTPException(status_code=400, detail=redact(str(exc), [token]))

    fixable = [f for f in findings if f.get("fixable")]
    apply_enabled, blocked = True, None
    if size > MAX_CLONE_MB:
        apply_enabled, blocked = (
            False,
            f"Repository is larger than {MAX_CLONE_MB} MB — apply disabled.",
        )
    elif not fixable:
        apply_enabled, blocked = False, "Nothing fixable found."

    await audit_service.log(
        user_id,
        _user_name(current_user),
        "autofix.scan",
        f"{full_name}: {len(fixable)} fixable finding(s)",
        project_id=body.project_id,
    )
    return {
        "repo": full_name,
        "stack": stack,
        "clone_mb": size,
        "findings": findings,
        "apply_enabled": apply_enabled,
        "apply_blocked_reason": blocked,
        "ai_available": ai_fix.ai_available(),
    }


@router.get("/runs")
async def list_runs(project_id: str = "", current_user=Depends(get_current_user)):
    user_id = str(current_user.id)
    query = (
        supabase.table("autofix_runs")
        .select("id,status,branch,pr_url,findings,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(5)
    )
    if project_id:
        query = query.eq("project_id", project_id)
    res = query.execute()
    return {"runs": getattr(res, "data", None) or []}


@router.post("/apply")
async def apply_fixes(body: ApplyIn, current_user=Depends(get_current_user)):
    user_id = str(current_user.id)
    token, _login = get_stored_token(user_id)
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Connect GitHub in Settings → GitHub Auto-Fix first.",
        )
    full_name = _resolve_repo(body.project_id, user_id)
    _check_apply_limit(user_id)

    try:
        with repo_service.temporary_clone(full_name, token) as clone:
            head_sha = repo_service.clone_head_sha(clone)
            scan_branch = _project_branch(body.project_id)
            stack = detect_mod.detect_stack(clone)
            written = detect_mod.generate_dockerfiles(clone)
            lint_entries = lint_runner.run_lint_fixes(clone)

            # ── Split remaining per-file errors into AI vs triage ──
            small, large = [], []
            for entry in lint_entries:
                tool = entry["tool"]
                if entry["skipped_reason"]:
                    continue
                for f in entry.get("files", []):
                    size = ai_fix.file_size_bytes(clone, f["file"])
                    cls, reason = ai_fix.classify_file(tool, f["errors"], size)
                    cause = ai_fix.cause_hint(tool, f.get("messages", []))
                    (small if cls == "small" else large).append(
                        (tool, f, size, reason, cause)
                    )
            if len(small) > ai_fix.AI_MAX_FILES_PER_RUN:
                overflow = small[ai_fix.AI_MAX_FILES_PER_RUN:]
                small = small[:ai_fix.AI_MAX_FILES_PER_RUN]
                large.extend(
                    (t, f, s,
                     f"over the {ai_fix.AI_MAX_FILES_PER_RUN}-file per-run AI cap — ticketed instead",
                     c)
                    for t, f, s, _r, c in overflow
                )

            # ── AI phase: small files only, each validated by re-linting ──
            ai_fixed, ai_notes = [], []
            if body.use_ai and ai_fix.ai_available():
                for tool, f, _size, _reason, _cause in small:
                    target = clone / f["file"]
                    try:
                        code = target.read_text(encoding="utf-8", errors="strict")
                    except (OSError, UnicodeDecodeError):
                        ai_notes.append(f"{f['file']}: unreadable — skipped")
                        continue
                    fixed, fail = ai_fix.fix_file(
                        tool, f["file"], code, f.get("messages", [])
                    )
                    if fixed is None:
                        ai_notes.append(f"{f['file']}: AI skipped ({fail})")
                        continue
                    target.write_text(fixed, encoding="utf-8")
                    after, _ = lint_runner.lint_file_errors(clone, f["file"], tool)
                    if 0 <= after < f["errors"]:
                        ai_fixed.append(f["file"])
                    else:
                        target.write_text(code, encoding="utf-8")  # revert
                        ai_notes.append(
                            f"{f['file']}: AI fix didn't reduce errors — reverted"
                        )
            elif body.use_ai:
                ai_notes.append(
                    "OpenAI key not configured — AI fixes skipped "
                    "(set OPENAI_API_KEY in backend/.env)"
                )

            # ── Triage phase: large files become Incidents-page tickets ──
            tickets = []
            for tool, f, _size, reason, cause in large:
                ticket = await triage_mod.create_triage_ticket(
                    user_id, _user_name(current_user), body.project_id,
                    full_name, tool, f["file"], f["errors"], cause, reason,
                    commit_sha=head_sha, branch=scan_branch,
                )
                if ticket:
                    tickets.append(ticket)

            # The only writers are the generator, lint --fix and validated
            # AI fixes, so their union is exactly what the PR will contain.
            changed = sorted(
                set(written)
                | {
                    f
                    for entry in lint_entries
                    for f in entry["fixed_files"]
                }
                | set(ai_fixed)
            )

            bullets = []
            if written:
                bullets.append(f"generated {', '.join(written)}")
            for entry in lint_entries:
                if entry["fixed_files"]:
                    bullets.append(
                        f"{entry['tool']} --fix touched "
                        f"{len(entry['fixed_files'])} file(s)"
                    )
            if ai_fixed:
                bullets.append(
                    f"AI-assisted fixes in {len(ai_fixed)} file(s) "
                    "(OpenAI, validated by re-linting — please review carefully)"
                )
            if not changed:
                _record_run(
                    user_id, body.project_id, full_name, None, None,
                    None, "no_changes", None,
                )
                await audit_service.log(
                    user_id, _user_name(current_user), "autofix.apply",
                    f"{full_name}: no changes needed "
                    f"({len(tickets)} ticket(s) opened)", project_id=body.project_id,
                )
                message = "Nothing to fix — repo is already healthy."
                if tickets:
                    message += f" {len(tickets)} large problem(s) were ticketed instead."
                return {
                    "status": "no_changes",
                    "message": message,
                    "tickets": tickets,
                    "ai_fixed": [],
                    "ai_notes": ai_notes,
                }

            stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
            branch = f"{repo_service.BRANCH_PREFIX}{stamp}-{secrets.token_hex(2)}"
            title = f"fix(aether): {'; '.join(bullets) or 'automated fixes'}"[:120]
            pr_body = (
                "Automated fixes by Aether IDP — please review before merging:\n\n"
                + "".join(f"- {b}\n" for b in bullets)
                + f"\nStack detected: {stack}\n"
            )
            if ai_fixed:
                pr_body += (
                    "\nAI-assisted files (OpenAI, each validated by re-linting — "
                    "review these carefully):\n"
                    + "".join(f"- {name}\n" for name in ai_fixed)
                )
            if tickets:
                pr_body += (
                    "\nLarger problems were NOT touched — triage tickets opened:\n"
                    + "".join(f"- {t['title']}\n" for t in tickets)
                )
            pr_url = repo_service.push_and_open_pr(
                clone, full_name, token, branch, title, pr_body
            )
            findings = [
                {"type": "generated_file", "file": name} for name in written
            ] + [
                {
                    "type": "lint",
                    "tool": entry["tool"],
                    "fixed_files": entry["fixed_files"],
                }
                for entry in lint_entries
                if entry["fixed_files"]
            ] + [
                {"type": "ai_fix", "file": name} for name in ai_fixed
            ] + [
                {"type": "triage", "ticket_id": t["id"], "title": t["title"]}
                for t in tickets
            ]
            _record_run(
                user_id, body.project_id, full_name, branch, pr_url,
                findings, "pr_opened", None,
            )
            await audit_service.log(
                user_id, _user_name(current_user), "autofix.apply",
                f"{full_name}: PR opened {pr_url} "
                f"({len(ai_fixed)} AI file(s), {len(tickets)} ticket(s))",
                project_id=body.project_id,
            )
            return {
                "status": "pr_opened",
                "branch": branch,
                "pr_url": pr_url,
                "files": changed,
                "tickets": tickets,
                "ai_fixed": ai_fixed,
                "ai_notes": ai_notes,
            }
    except HTTPException:
        raise
    except RepoAccessError as exc:
        safe = redact(str(exc), [token])[:300]
        _record_run(
            user_id, body.project_id, full_name, None, None, None, "failed", safe
        )
        raise HTTPException(status_code=500, detail=safe)
    except Exception as exc:
        logger.warning("autofix.apply failed: %s", type(exc).__name__)
        _record_run(
            user_id, body.project_id, full_name, None, None, None,
            "failed", "Auto-fix failed — try again.",
        )
        raise HTTPException(
            status_code=500, detail="Auto-fix failed — try again."
        )
