"""Trivy scan service tests — fixture JSON, trivy binary never invoked."""

import asyncio
import io
import tarfile

from services import trivy_service
from services.trivy_service import (
    _item_key, _safe_extract, find_manifest_packages, osv_query,
    to_analyses, to_osv_analyses,
)


def run(coro):
    return asyncio.run(coro)


class FakeResp:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


FIXTURE = {
    "Results": [
        {"Target": "package-lock.json",
         "Vulnerabilities": [
             {"VulnerabilityID": "CVE-2024-1234", "PkgName": "lodash", "Severity": "CRITICAL",
              "Title": "Prototype pollution", "Description": "Bad.", "FixedVersion": "4.17.22"},
             {"VulnerabilityID": "CVE-2024-0001", "PkgName": "leftpad", "Severity": "LOW",
              "Title": "Minor", "Description": "Meh.", "FixedVersion": ""},
         ],
         "Secrets": [
             {"RuleID": "github-pat", "Title": "GitHub PAT", "Severity": "CRITICAL"},
         ],
         "Misconfigurations": [
             {"ID": "DS002", "Title": "No USER", "Description": "Runs as root",
              "Resolution": "Add USER.", "Severity": "HIGH", "Status": "FAIL"},
             {"ID": "DS003", "Title": "OK thing", "Description": "Fine",
              "Resolution": "", "Severity": "LOW", "Status": "PASS"},
         ]},
    ]
}


def test_to_analyses_gates_severity_and_builds_remediation():
    items = to_analyses(FIXTURE, "web", "acme/web")
    kinds = [(i["vulnerability"]["type"], i["vulnerability"]["severity"]) for i in items]
    assert ("vulnerability", "CRITICAL") in kinds  # lodash
    assert ("secret", "CRITICAL") in kinds  # github-pat
    assert ("misconfig", "HIGH") in kinds  # DS002
    assert len(items) == 3  # LOW vuln + PASS misconfig excluded
    lodash = next(i for i in items if i["vulnerability"].get("cve_id") == "CVE-2024-1234")
    assert lodash["analysis"]["priority"] == "P1"
    assert any("4.17.22" in s for s in lodash["analysis"]["remediation_steps"])
    assert lodash["vulnerability"]["package"] == "lodash"


def test_to_analyses_caps_findings(monkeypatch):
    monkeypatch.setattr(trivy_service, "MAX_FINDINGS", 2)
    assert len(to_analyses(FIXTURE, "web", "acme/web")) == 2


def test_item_key_prefers_cve():
    with_cve = {"analysis": {"title": "T"}, "vulnerability": {"cve_id": "CVE-1", "package": "p"}}
    without = {"analysis": {"title": "T2"}, "vulnerability": {"cve_id": None, "package": "p"}}
    assert _item_key(with_cve) == "CVE-1"
    assert _item_key(without) == "p:T2"


def test_safe_extract_blocks_traversal(tmp_path):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        info = tarfile.TarInfo("../../evil.sh")
        info.size = 4
        tar.addfile(info, io.BytesIO(b"evil"))
    buf.seek(0)
    import pytest

    with tarfile.open(fileobj=buf) as tar:
        with pytest.raises(RuntimeError, match="Unsafe tar member"):
            _safe_extract(tar, tmp_path)


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows
        self._single = False

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def neq(self, *a, **k):
        return self

    def single(self):
        self._single = True
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        data = self._rows[0] if (self._single and self._rows) else self._rows
        return type("R", (), {"data": data})()


def _fake_supabase(monkeypatch, project=None, incidents=None):
    import services.trivy_service as ts

    def table(name):
        if name == "projects":
            return _FakeQuery([project] if project else [])
        if name == "incidents":
            return _FakeQuery(incidents or [])
        if name == "plugin_installations":
            return _FakeQuery([])
        return _FakeQuery([])

    monkeypatch.setattr(ts.supabase, "table", table)


def _project():
    return {"id": "p1", "repo_owner": "acme", "repo_name": "web", "branch": "main",
            "service_name": "web", "name": "Web", "owner_id": "u1",
            "service_repository_url": "acme/web"}


def test_scan_project_missing_trivy_is_honest(monkeypatch):
    import services.trivy_service as ts

    _fake_supabase(monkeypatch, project=_project())
    monkeypatch.setattr(ts, "trivy_available", lambda: False)
    out = run(ts.scan_project("p1"))
    assert out["status"] == "failed" and "not installed" in out["detail"]


def test_scan_project_no_repo_skips(monkeypatch):
    import services.trivy_service as ts

    _fake_supabase(monkeypatch, project={"id": "p1", "owner_id": "u1"})
    monkeypatch.setattr(ts, "trivy_available", lambda: True)
    out = run(ts.scan_project("p1"))
    assert out["status"] == "skipped"


def test_scan_project_dedupes_open_incidents(monkeypatch):
    import services.trivy_service as ts

    _fake_supabase(monkeypatch, project=_project(), incidents=[
        {"id": "i1", "title": "CVE-2024-1234 in lodash",
         "security_metadata": {"cve_id": "CVE-2024-1234"}},
    ])
    monkeypatch.setattr(ts, "trivy_available", lambda: True)
    created = []
    monkeypatch.setattr(ts, "download_repo_tarball", lambda *a, **k: ("/tmp/x", "/tmp/x"))
    monkeypatch.setattr(ts, "scan_filesystem", lambda path: FIXTURE)

    async def fake_create(project_id, payload):
        created.append(payload)
        return ["new-id"] if payload["triage_report"]["analyses"] else []

    import services.incident_service as inc
    monkeypatch.setattr(inc, "create_from_security_triage", fake_create)
    # scan_project imports create_from_security_triage lazily from incident_service —
    # patch the source so the lazy import sees the fake.
    out = run(ts.scan_project("p1"))
    assert out["status"] == "success"
    # CVE-2024-1234 already open → only secret + misconfig reported
    reported = created[0]["triage_report"]["analyses"]
    assert len(reported) == 2
    assert out["new_incidents"] == 1


def test_scan_project_unknown_project(monkeypatch):
    import services.trivy_service as ts

    _fake_supabase(monkeypatch, project=None)
    out = run(ts.scan_project("nope"))
    assert out["status"] == "failed"


# ── OSV manifest audit ──────────────────────────────────────────────

LOCK_V3 = {"packages": {"": {"version": "1.0.0"},
                        "node_modules/lodash": {"version": "4.17.20"},
                        "node_modules/nover": {}}}
LOCK_V1 = {"dependencies": {"leftpad": {"version": "1.3.0"}}}
REQ_TXT = "requests==2.28.0\n# comment\nflask>=2.0\nDjango===4.2.0 ; python_version>'3'\n"
GOMOD = "module example.com/x\n\ngo 1.21\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n)"
GEMLOCK = "GEM\n  specs:\n    rails (7.0.4)\n    nokogiri (1.13.9-x86_64-linux)\n\nPLATFORMS\n"


def test_manifest_parsers(tmp_path):
    from services.trivy_service import (
        _parse_gemfile_lock, _parse_go_mod, _parse_package_lock, _parse_requirements,
    )

    assert ("npm", "lodash", "4.17.20") in _parse_package_lock(LOCK_V3)
    assert ("npm", "leftpad", "1.3.0") in _parse_package_lock(LOCK_V1)
    reqs = _parse_requirements(REQ_TXT)
    assert ("PyPI", "requests", "2.28.0") in reqs
    assert ("PyPI", "Django", "4.2.0") in reqs
    assert not any(n == "flask" for _, n, _ in reqs)  # unpinned skipped
    assert ("Go", "github.com/gin-gonic/gin", "v1.9.1") in _parse_go_mod(GOMOD)
    gems = _parse_gemfile_lock(GEMLOCK)
    assert ("RubyGems", "rails", "7.0.4") in gems


def test_find_manifest_packages_skips_vendored(tmp_path):
    (tmp_path / "node_modules" / "dep").mkdir(parents=True)
    (tmp_path / "node_modules" / "dep" / "package-lock.json").write_text('{"packages":{}}')
    (tmp_path / "package-lock.json").write_text(
        '{"packages": {"node_modules/a": {"version": "1.0.0"}}}')
    found = find_manifest_packages(str(tmp_path))
    assert found == [("npm", "a", "1.0.0")]


def test_osv_mapping_gates_severity():
    pkgs = [("npm", "lodash", "4.17.20"), ("PyPI", "x", "1.0")]
    resp = {"results": [
        {"vulns": [
            {"id": "GHSA-1", "aliases": ["CVE-2024-9999"], "summary": "Bad.",
             "database_specific": {"severity": "HIGH"},
             "affected": [{"ranges": [{"events": [{"introduced": "0"}, {"fixed": "4.17.21"}]}]}]},
            {"id": "GHSA-2", "aliases": [], "summary": "Meh.",
             "database_specific": {"severity": "moderate"}, "affected": []},
            {"id": "GHSA-3", "aliases": [], "summary": "Unknown.",
             "database_specific": {}, "affected": []},
        ]},
        {"vulns": []},
    ]}
    items, omitted = to_osv_analyses(resp, pkgs)
    assert len(items) == 1
    assert omitted == 2
    assert items[0]["vulnerability"]["cve_id"] == "CVE-2024-9999"
    assert items[0]["vulnerability"]["fixed_version"] == "4.17.21"
    assert "4.17.21" in items[0]["analysis"]["remediation_steps"][0]


def test_osv_query_posts_batch(monkeypatch):
    import httpx

    seen = {}

    class FakeSyncClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, url, json=None):
            seen["url"] = url
            seen["n"] = len(json["queries"])
            return FakeResp(200, {"results": [{"vulns": []}]})

    monkeypatch.setattr(httpx, "Client", FakeSyncClient)
    out = osv_query([("npm", "a", "1.0.0"), ("PyPI", "b", "2.0")])
    assert seen["url"].endswith("/v1/querybatch") and seen["n"] == 2
    assert out == {"results": [{"vulns": []}]}
