"""Task 58 remediation endpoint tests — no LLM calls, no DB."""

import asyncio
from types import SimpleNamespace


class FakeTable:
    def __init__(self, rows=None):
        self._rows = rows or []
        self._single = False

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def single(self):
        self._single = True
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        data = self._rows[0] if (self._single and self._rows) else self._rows
        return type("R", (), {"data": data})()


def _incident():
    return {"id": "33333333-3333-3333-3333-333333333333", "project_id": "p1",
            "title": "Deploy failed", "description": "tsc error TS2339",
            "severity": "high", "provider": "vercel", "deployment_id": "d1"}


def _deployment():
    return {"error_message": "error TS2339: Property X missing",
            "provider": "vercel", "branch": "main", "version": "v2",
            "stages": [{"name": "Build", "status": "failed", "durationMs": 1},
                       {"name": "Deploy", "status": "pending", "durationMs": 0}]}


def run(coro):
    return asyncio.run(coro)


def _wire(monkeypatch, incident=None, deployment=None, cached=None, llm=None):
    import routers.incidents as ri
    import services.ai_service as ai

    def table(name):
        if name == "incidents":
            t = FakeTable([incident] if incident else [])
            return t
        if name == "deployments":
            t = FakeTable([deployment] if deployment else [])
            return t
        return FakeTable([])

    # incidents router uses .single() on the incidents lookup
    orig_table = table

    def table_single(name):
        t = orig_table(name)
        if name in ("incidents", "deployments"):
            t._single = True
        return t

    monkeypatch.setattr(ri.supabase, "table", table_single)
    monkeypatch.setattr(ri, "_user_project_ids", lambda uid: ["p1"])
    calls = {"llm": 0}

    async def fake_analyze(context):
        calls["llm"] += 1
        assert "TS2339" in (context.get("error_message") or ""), \
            "prompt must carry the real error, not canned text"
        assert context.get("failed_stage") == "Build"
        return llm or {"steps": [{"title": "Fix TS2339", "description": "Add the missing property."}]}

    async def fake_cached(incident_id):
        return cached

    async def fake_cache(incident_id, result):
        calls["cached"] = result

    monkeypatch.setattr(ai, "analyze_incident", fake_analyze)
    monkeypatch.setattr(ai, "get_cached", fake_cached)
    monkeypatch.setattr(ai, "cache", fake_cache)
    return calls


def test_remediation_uses_cache_without_llm(monkeypatch):
    import routers.incidents as ri

    calls = _wire(monkeypatch, incident=_incident(), deployment=_deployment(),
                  cached={"steps": [{"title": "Cached fix", "description": ""}]})
    out = run(ri.remediate_incident(_incident()["id"], SimpleNamespace(id="u1")))
    assert out["cached"] is True
    assert out["steps"][0]["title"] == "Cached fix"
    assert calls["llm"] == 0


def test_remediation_generates_from_live_fields(monkeypatch):
    import routers.incidents as ri

    calls = _wire(monkeypatch, incident=_incident(), deployment=_deployment(), cached=None)
    out = run(ri.remediate_incident(_incident()["id"], SimpleNamespace(id="u1")))
    assert out["cached"] is False and out["generic"] is False
    assert "TS2339" in out["steps"][0]["title"] or "Fix TS2339" in out["steps"][0]["title"]
    assert calls["llm"] == 1
    assert calls["cached"]["steps"][0]["title"] == "Fix TS2339"


def test_remediation_unknown_incident_404(monkeypatch):
    import fastapi
    import routers.incidents as ri

    _wire(monkeypatch, incident=None)
    try:
        run(ri.remediate_incident("missing", SimpleNamespace(id="u1")))
        assert False, "expected HTTPException"
    except fastapi.HTTPException as exc:
        assert exc.status_code == 404
