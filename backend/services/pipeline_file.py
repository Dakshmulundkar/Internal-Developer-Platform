"""Pipeline definition fetching from GitHub (shared by routers).

Tokens stay server-side. Raises PipelineFileError(status, detail) for honest
HTTP mapping instead of silent fallbacks.
"""

import base64
import logging

import httpx
import yaml

logger = logging.getLogger(__name__)

WORKFLOW_CANDIDATES = ("ci.yml", "ci.yaml", "build.yml", "build.yaml", "pipeline.yml", "pipeline.yaml")


class PipelineFileError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _headers(token: str) -> dict:
    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "aether-idp"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


async def _get_json(url: str, token: str, branch: str) -> dict | list:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=_headers(token), params={"ref": branch})
        if resp.status_code == 404:
            raise PipelineFileError(404, "not found")
        if resp.status_code == 401:
            raise PipelineFileError(401, "GitHub rejected the credentials. Reconnect the GitHub plugin.")
        if resp.status_code == 403 and "rate limit" in resp.text.lower():
            raise PipelineFileError(429, "GitHub API rate limit reached. Connect GitHub for a higher quota.")
        if resp.status_code != 200:
            raise PipelineFileError(502, f"GitHub API returned HTTP {resp.status_code}.")
        return resp.json()


async def check_repo(owner: str, repo: str, branch: str, token: str) -> None:
    """Raise a precise error unless the repo is reachable."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"https://api.github.com/repos/{owner}/{repo}",
                                    headers=_headers(token), params={"ref": branch})
    except Exception as exc:
        raise PipelineFileError(502, f"Could not reach GitHub: {exc}")
    if resp.status_code == 404:
        hint = ". Connect the GitHub plugin so builds can read it." if not token else "."
        raise PipelineFileError(404, f"Repository {owner}/{repo} not found or is private{hint}")
    if resp.status_code == 401:
        raise PipelineFileError(401, "GitHub rejected the credentials. Reconnect the GitHub plugin.")
    if resp.status_code != 200:
        raise PipelineFileError(502, f"GitHub API returned HTTP {resp.status_code}.")


async def fetch_definition(owner: str, repo: str, branch: str, token: str) -> dict:
    """Fetch + parse the repo's CI workflow file. Returns path/sha/jobs/steps/content."""
    base = f"https://api.github.com/repos/{owner}/{repo}/contents"

    async def fetch_json(url: str) -> dict:
        try:
            data = await _get_json(url, token, branch)
        except PipelineFileError as exc:
            if exc.status == 404:
                raise PipelineFileError(404, "No workflow file found in .github/workflows.")
            raise
        if not isinstance(data, dict):
            raise PipelineFileError(404, "No workflow file found in .github/workflows.")
        return data

    entry: dict | None = None
    for candidate in WORKFLOW_CANDIDATES:
        try:
            entry = await fetch_json(f"{base}/.github/workflows/{candidate}")
            break
        except PipelineFileError as exc:
            if exc.status != 404:
                raise
    if entry is None:
        try:
            listing = await _get_json(f"{base}/.github/workflows", token, branch)
        except PipelineFileError as exc:
            if exc.status == 404:
                raise PipelineFileError(404, "No workflow file found in .github/workflows.")
            raise
        if not isinstance(listing, list):
            raise PipelineFileError(404, "No workflow file found in .github/workflows.")
        picked = next((i for i in listing
                       if str(i.get("name", "")).endswith((".yml", ".yaml"))), None)
        if picked is None:
            raise PipelineFileError(404, "No workflow file found in .github/workflows.")
        entry = await fetch_json(picked.get("url") or f"{base}/.github/workflows/{picked['name']}")

    try:
        text = base64.b64decode(str(entry.get("content", "") or "")).decode("utf-8", errors="replace")
    except Exception:
        raise PipelineFileError(502, "Could not decode the workflow file from GitHub.")
    if len(text) > 100_000:
        raise PipelineFileError(502, "Workflow file too large to preview (over 100KB).")

    jobs: dict = {}
    try:
        doc = yaml.safe_load(text) or {}
        if isinstance(doc.get("jobs"), dict):
            for job_name, job in doc["jobs"].items():
                steps = job.get("steps") if isinstance(job, dict) else None
                jobs[str(job_name)] = len(steps) if isinstance(steps, list) else 0
    except Exception:
        jobs = {}

    return {
        "path": entry.get("path", ""),
        "sha": entry.get("sha", ""),
        "size": entry.get("size", len(text)),
        "jobs": jobs,
        "job_count": len(jobs),
        "step_count": sum(jobs.values()),
        "content": text,
    }
