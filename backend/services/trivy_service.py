"""IDP-side vulnerability scanning with Trivy (no Docker daemon required).

Two entry points, both honest about prerequisites:
- ``scan_image_ref`` — scans an already-pushed image by reference
  (``trivy image`` pulls its own manifest; no local Docker needed).
- ``scan_repo`` — downloads a repo tarball, scans the filesystem for
  vulnerabilities + secrets + misconfigurations (works with or without
  a Dockerfile), then cleans up.

Findings flow into the existing ``create_from_security_triage`` pipeline, so
no incident code changed. Only HIGH/CRITICAL findings are reported (cap
``MAX_FINDINGS``) and already-open incidents are skipped, so scheduled
rescans never duplicate or spam.
"""

import io
import json
import logging
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
from pathlib import Path

from database import supabase
from services.plugins import crypto

logger = logging.getLogger(__name__)

TRIVY_SEVERITIES = "HIGH,CRITICAL"
MAX_FINDINGS = 25
SCAN_TIMEOUT_S = 600
OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch"
OSV_MAX_PACKAGES = 100
_SKIP_DIRS = {"node_modules", ".git", "vendor", "dist", "build", "__pycache__", ".venv", "venv"}


def trivy_available() -> bool:
    """True when a `trivy` binary is on PATH."""
    return shutil.which("trivy") is not None


def _run_trivy(args: list[str], timeout: int = SCAN_TIMEOUT_S) -> dict:
    if not trivy_available():
        raise RuntimeError(
            "Trivy is not installed on the backend. Install it (https://aquasec.com/products/trivy) "
            "or run scans from GitHub Actions instead."
        )
    proc = subprocess.run(
        ["trivy", *args], capture_output=True, text=True, timeout=timeout,
    )
    if proc.returncode not in (0,):
        # Trivy exits non-zero when vulnerabilities are found with --exit-code;
        # we never pass it, so non-zero here is a real failure.
        raise RuntimeError(f"Trivy failed: {(proc.stderr or proc.stdout or '')[:500]}")
    try:
        return json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Trivy returned unparseable JSON: {exc}") from exc


def _safe_extract(tar: tarfile.TarFile, dest: Path) -> None:
    """Extract a tarball while blocking path-traversal members."""
    dest_resolved = dest.resolve()
    for member in tar.getmembers():
        member_path = (dest_resolved / member.name).resolve()
        if not str(member_path).startswith(str(dest_resolved)):
            raise RuntimeError(f"Unsafe tar member blocked: {member.name}")
    tar.extractall(dest)


def download_repo_tarball(owner: str, repo: str, branch: str, token: str = "") -> tuple[Path, Path]:
    """Download a repo as a tarball into a temp dir.

    Returns (scan_root, tmp_base) — always remove tmp_base when done.
    """
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "aether-idp"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = f"https://api.github.com/repos/{owner}/{repo}/tarball/{branch or 'main'}"
    req = urllib.request.Request(url, headers=headers)
    tmp = Path(tempfile.mkdtemp(prefix="aether-scan-"))
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
        with tarfile.open(fileobj=io.BytesIO(data)) as tar:
            _safe_extract(tar, tmp)
        # Tarball extracts into a single top-level dir — descend into it.
        children = [p for p in tmp.iterdir() if p.is_dir()]
        root = children[0] if len(children) == 1 else tmp
        return root, tmp
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise


def scan_image_ref(image_ref: str) -> dict:
    """Scan a pushed image by reference (no Docker daemon needed)."""
    return _run_trivy([
        "image", "--format", "json", "--severity", TRIVY_SEVERITIES,
        "--scanners", "vuln,secret", "--quiet", image_ref,
    ])


def scan_filesystem(path: str) -> dict:
    """Scan a local directory (repo checkout) for vulns + secrets + misconfigs."""
    return _run_trivy([
        "fs", "--format", "json", "--severity", TRIVY_SEVERITIES,
        "--scanners", "vuln,secret,misconfig", "--quiet", path,
    ])


def _remediation_for(package: str, fixed: str, target: str) -> list[str]:
    steps = []
    if package and fixed:
        steps.append(f"Upgrade {package} to version {fixed} or later ({target}).")
    elif package:
        steps.append(f"No fixed version published yet for {package} — assess exposure and consider replacing it.")
    steps.append("Re-run the Trivy scan after the fix and confirm no HIGH/CRITICAL findings remain.")
    return steps


def to_analyses(trivy_json: dict, service_name: str, repository: str) -> list[dict]:
    """Convert Trivy JSON output into triage-payload analyses (HIGH/CRITICAL, capped)."""
    items: list[dict] = []
    for result in trivy_json.get("Results") or []:
        target = result.get("Target", "")
        for vuln in result.get("Vulnerabilities") or []:
            severity = str(vuln.get("Severity", "")).upper()
            if severity not in ("HIGH", "CRITICAL"):
                continue
            package = vuln.get("PkgName", "")
            fixed = vuln.get("FixedVersion", "")
            title = f"{vuln.get('VulnerabilityID', 'Vulnerability')} in {package or target}"
            items.append({
                "analysis": {
                    "title": title[:300],
                    "description": (vuln.get("Description") or vuln.get("Title") or title)[:2000],
                    "priority": "P1" if severity == "CRITICAL" else "P2",
                    "assigned_team": "devops",
                    "story_points": 5 if severity == "CRITICAL" else 3,
                    "remediation_steps": _remediation_for(package, fixed, target),
                    "testing_steps": ["Re-run the Trivy scan on the fixed code/image."],
                },
                "vulnerability": {
                    "type": "vulnerability",
                    "target": target,
                    "severity": severity,
                    "cve_id": vuln.get("VulnerabilityID") if str(vuln.get("VulnerabilityID", "")).startswith("CVE-") else None,
                    "package": package,
                    "fixed_version": fixed or None,
                },
            })
            if len(items) >= MAX_FINDINGS:
                return items
        for secret in result.get("Secrets") or []:
            title = f"Exposed secret ({secret.get('RuleID', 'unknown rule')}) in {target}"
            items.append({
                "analysis": {
                    "title": title[:300],
                    "description": f"Secret matched by rule {secret.get('RuleID')} in {target}. Rotate it immediately.",
                    "priority": "P1",
                    "assigned_team": "security",
                    "story_points": 3,
                    "remediation_steps": [
                        "Revoke/rotate the exposed credential immediately.",
                        "Remove the secret from the codebase and use a secret manager.",
                    ],
                    "testing_steps": ["Re-run the secret scan to confirm removal."],
                },
                "vulnerability": {
                    "type": "secret",
                    "target": target,
                    "severity": "CRITICAL",
                    "cve_id": None,
                    "package": str(secret.get("RuleID", "")),
                    "fixed_version": None,
                },
            })
            if len(items) >= MAX_FINDINGS:
                return items
        for misconfig in result.get("Misconfigurations") or []:
            if str(misconfig.get("Status", "")).upper() != "FAIL":
                continue
            title = f"Misconfiguration {misconfig.get('ID', '')} in {target}"
            items.append({
                "analysis": {
                    "title": title[:300],
                    "description": (misconfig.get("Description") or title)[:2000],
                    "priority": "P2",
                    "assigned_team": "devops",
                    "story_points": 3,
                    "remediation_steps": [misconfig.get("Resolution") or "Fix the misconfiguration per scanner guidance."],
                    "testing_steps": ["Re-run the config scan to confirm."],
                },
                "vulnerability": {
                    "type": "misconfig",
                    "target": target,
                    "severity": str(misconfig.get("Severity", "HIGH")).upper(),
                    "cve_id": None,
                    "package": str(misconfig.get("ID", "")),
                    "fixed_version": None,
                },
            })
            if len(items) >= MAX_FINDINGS:
                return items
    return items


def _open_keys(project_id: str) -> set[str]:
    """Fingerprint set of already-open security incidents (dedupe rescans)."""
    try:
        res = supabase.table("incidents").select("id, title, security_metadata").eq(
            "project_id", project_id).eq("source", "security_triage").neq("status", "resolved").execute()
    except Exception as exc:
        logger.warning("Dedupe lookup failed: %s", exc)
        return set()
    keys = set()
    for inc in res.data or []:
        meta = inc.get("security_metadata") or {}
        keys.add(meta.get("cve_id") or f"{meta.get('package')}:{inc.get('title')}")
    return keys


def _item_key(item: dict) -> str:
    vuln = item.get("vulnerability") or {}
    return vuln.get("cve_id") or f"{vuln.get('package')}:{item.get('analysis', {}).get('title')}"


def _owner_github_token(owner_id: str) -> str:
    """Decrypt the owner's GitHub plugin token, if they connected GitHub."""
    try:
        res = supabase.table("plugin_installations").select("api_key_encrypted,plugin_id").eq(
            "installed_by", owner_id).execute()
        for row in res.data or []:
            pid = str(row.get("plugin_id") or "")
            if "github" in pid:
                token = crypto.decrypt_key(row.get("api_key_encrypted"))
                if token and "••••" not in token:
                    return token
    except Exception as exc:
        logger.debug("GitHub token lookup failed: %s", exc)
    return ""


# ── OSV.dev manifest audit (free, no auth, no installs) ────────────────────
# Complements Trivy: direct dependency lookup without building anything.
# Only vulns explicitly marked HIGH/CRITICAL are reported (same gate as Trivy).


def _parse_package_lock(data: dict) -> list[tuple[str, str]]:
    out = []
    for path, info in (data.get("packages") or {}).items():
        if not path or not isinstance(info, dict):
            continue
        name = path.split("node_modules/")[-1]
        if name and info.get("version") and "node_modules" not in name.replace("node_modules/", "", 1):
            out.append((name, str(info["version"])))
    for name, info in (data.get("dependencies") or {}).items():  # v1 lockfiles
        if isinstance(info, dict) and info.get("version"):
            out.append((name, str(info["version"])))
    return [("npm", n, v) for n, v in out]


def _parse_requirements(text: str) -> list[tuple[str, str, str]]:
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(("#", "-", " ")):
            continue
        for sep in ("===", "=="):
            if sep in line:
                name, ver = line.split(sep, 1)
                name = name.strip().split("[")[0]
                ver = ver.strip().split(";")[0].strip()
                if name and ver:
                    out.append(("PyPI", name, ver))
                break
    return out


def _parse_pom(root) -> list[tuple[str, str, str]]:
    ns = {"m": "http://maven.apache.org/POM/4.0.0"}
    out = []
    for dep in root.findall(".//m:dependency", ns) or root.findall(".//dependency"):
        g = dep.findtext("m:groupId", default="") or dep.findtext("groupId", default="")
        a = dep.findtext("m:artifactId", default="") or dep.findtext("artifactId", default="")
        v = dep.findtext("m:version", default="") or dep.findtext("version", default="")
        if g and a and v and "${" not in v:
            out.append(("Maven", f"{g.strip()}:{a.strip()}", v.strip()))
    return out


def _parse_gemfile_lock(text: str) -> list[tuple[str, str, str]]:
    import re

    out, in_specs = [], False
    for line in text.splitlines():
        if line.strip() == "GEM":
            in_specs, in_specs_done = True, False
        if in_specs and line.strip() and not line.startswith((" ", "\t")) and line.strip() != "GEM":
            in_specs = False
        if in_specs:
            m = re.match(r"\s{4}([\w\-\.]+) \(([^)]+)\)", line)
            if m:
                out.append(("RubyGems", m.group(1), m.group(2).split(",")[0].strip()))
    return out


def _parse_go_mod(text: str) -> list[tuple[str, str, str]]:
    import re

    out = []
    for line in text.splitlines():
        line = line.strip()
        m = re.match(r"^([\w\.\-/]+)\s+v([\w\.\-+]+)", line)
        if m and not line.startswith("module") and "=>" not in line:
            out.append(("Go", m.group(1), "v" + m.group(2)))
    return out


def find_manifest_packages(scan_root: str) -> list[tuple[str, str, str]]:
    """Collect (ecosystem, name, version) from well-known manifest files."""
    import xml.etree.ElementTree as ET

    found: list[tuple[str, str, str]] = []
    root = Path(scan_root)
    try:
        candidates = [p for p in root.rglob("*")
                      if p.is_file() and p.name in (
                          "package-lock.json", "requirements.txt", "pom.xml",
                          "Gemfile.lock", "go.mod")
                      and not any(part in _SKIP_DIRS for part in p.parts)]
    except Exception:
        return []
    for path in candidates[:20]:  # bound I/O on huge trees
        try:
            if path.name == "package-lock.json":
                found.extend(_parse_package_lock(json.loads(path.read_text()[:2_000_000])))
            elif path.name == "requirements.txt":
                found.extend(_parse_requirements(path.read_text()[:500_000]))
            elif path.name == "pom.xml":
                found.extend(_parse_pom(ET.fromstring(path.read_text()[:2_000_000])))
            elif path.name == "Gemfile.lock":
                found.extend(_parse_gemfile_lock(path.read_text()[:500_000]))
            elif path.name == "go.mod":
                found.extend(_parse_go_mod(path.read_text()[:200_000]))
        except Exception:
            continue
    # Dedupe, cap for one batched request.
    seen, unique = set(), []
    for eco, name, ver in found:
        key = (eco, name, ver)
        if key not in seen:
            seen.add(key)
            unique.append((eco, name, ver))
        if len(unique) >= OSV_MAX_PACKAGES:
            break
    return unique


def osv_query(packages: list[tuple[str, str, str]]) -> dict:
    """One batched OSV.dev request (free, no auth). Raises on transport failure."""
    import httpx

    queries = [{"package": {"name": n, "ecosystem": e}, "version": v} for e, n, v in packages]
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(OSV_BATCH_URL, json={"queries": queries})
        resp.raise_for_status()
        return resp.json()


def _osv_severity(vuln: dict) -> str | None:
    raw = str((vuln.get("database_specific") or {}).get("severity") or "").upper()
    if raw in ("CRITICAL", "HIGH"):
        return raw
    return None


def _osv_fixed(vuln: dict) -> str:
    for affected in vuln.get("affected") or []:
        for r in affected.get("ranges") or []:
            for ev in r.get("events") or []:
                if ev.get("fixed"):
                    return str(ev["fixed"])
    return ""


def to_osv_analyses(osv_resp: dict, packages: list[tuple[str, str, str]]) -> tuple[list[dict], int]:
    """Map OSV results to triage analyses. Returns (items, omitted_count)."""
    items: list[dict] = []
    omitted = 0
    for pkg, result in zip(packages, osv_resp.get("results") or []):
        eco, name, ver = pkg
        for vuln in result.get("vulns") or []:
            severity = _osv_severity(vuln)
            if not severity:
                omitted += 1
                continue
            vid = next((a for a in (vuln.get("aliases") or []) if str(a).startswith("CVE-")),
                       (vuln.get("aliases") or [vuln.get("id", "")])[0])
            fixed = _osv_fixed(vuln)
            title = f"{vid} in {name}@{ver} ({eco})"
            items.append({
                "analysis": {
                    "title": title[:300],
                    "description": (vuln.get("summary") or vuln.get("details") or title)[:2000],
                    "priority": "P1" if severity == "CRITICAL" else "P2",
                    "assigned_team": "devops",
                    "story_points": 5 if severity == "CRITICAL" else 3,
                    "remediation_steps": (
                        [f"Upgrade {name} to version {fixed} or later."]
                        if fixed else
                        [f"No fixed version published for {name}@{ver} — assess exposure."]
                    ),
                    "testing_steps": ["Re-run the dependency scan after upgrading."],
                },
                "vulnerability": {
                    "type": "vulnerability",
                    "target": f"{eco}:{name}",
                    "severity": severity,
                    "cve_id": vid if str(vid).startswith("CVE-") else None,
                    "package": name,
                    "fixed_version": fixed or None,
                },
            })
            if len(items) >= MAX_FINDINGS:
                return items, omitted
    return items, omitted


async def scan_project(project_id: str, image_ref: str = "") -> dict:
    """Scan one project's repo (or image) and report new findings as incidents.

    Returns a summary dict — never raises for scan-level problems (they are
    reported in the summary so schedulers record them honestly).
    """
    try:
        proj = supabase.table("projects").select("*").eq("id", project_id).single().execute()
    except Exception as exc:
        return {"status": "failed", "detail": f"Project not found: {exc}"}
    if not proj.data:
        return {"status": "failed", "detail": "Project not found"}
    project = proj.data

    if not trivy_available():
        return {"status": "failed",
                "detail": "Trivy is not installed on the backend. Install it or scan from GitHub Actions."}

    owner, repo = project.get("repo_owner") or "", project.get("repo_name") or ""
    branch = project.get("branch") or "main"
    service_name = project.get("service_name") or project.get("name", "")
    repository = project.get("service_repository_url") or (
        f"{owner}/{repo}" if owner and repo else "")

    tmp_base: Path | None = None
    try:
        if image_ref:
            trivy_json = scan_image_ref(image_ref)
        elif owner and repo:
            token = _owner_github_token(project.get("owner_id", ""))
            scan_root, tmp_base = download_repo_tarball(owner, repo, branch, token)
            trivy_json = scan_filesystem(str(scan_root))
        else:
            return {"status": "skipped",
                    "detail": "Project has no repo_owner/repo_name and no image_ref was given."}

        from services.incident_service import create_from_security_triage

        analyses = to_analyses(trivy_json, service_name, repository)
        osv_note = ""
        if not image_ref:
            # OSV manifest audit on the same checkout (free, no installs).
            try:
                pkgs = find_manifest_packages(str(scan_root))
                if pkgs:
                    osv_items, omitted = to_osv_analyses(osv_query(pkgs), pkgs)
                    analyses = (analyses + osv_items)[:MAX_FINDINGS]
                    if omitted:
                        osv_note = f" {omitted} lower-severity OSV findings omitted."
            except Exception as exc:
                logger.warning("OSV audit failed for %s: %s", project_id, exc)
        seen = _open_keys(project_id)
        fresh = [a for a in analyses if _item_key(a) not in seen]
        if not fresh:
            return {"status": "success", "detail": f"Scanned, {len(analyses)} findings, 0 new (rest already open).{osv_note}",
                    "scanned": len(analyses), "new_incidents": 0}
        payload = {
            "service_id": service_name or project_id,
            "service_name": service_name,
            "repository": repository,
            "branch": branch,
            "triage_report": {"analyses": fresh},
        }
        created = await create_from_security_triage(project_id, payload)
        return {"status": "success",
                "detail": f"Scanned, {len(analyses)} findings, {len(created)} new incidents.",
                "scanned": len(analyses), "new_incidents": len(created)}
    except Exception as exc:
        logger.warning("Project scan failed for %s: %s", project_id, exc)
        return {"status": "failed", "detail": str(exc)[:300]}
    finally:
        if tmp_base:
            shutil.rmtree(tmp_base, ignore_errors=True)
