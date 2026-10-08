"""Batch 2 monitoring-depth adapter tests — fixture JSON, no live vendor keys."""

import asyncio

from services.plugins.base import PluginCtx
from services.plugins.monitoring_adapters import (
    DynatraceAdapter,
    ElasticAdapter,
    HoneycombAdapter,
    NetlifyAdapter,
    PrometheusAdapter,
    SnykAdapter,
    SonarQubeAdapter,
    StatuspageAdapter,
    VictorOpsAdapter,
)
from services.plugins.registry import get_adapter


class FakeResp:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = str(payload)[:200]

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


class FakeClient:
    def __init__(self, resp: FakeResp):
        self._resp = resp

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, *args, **kwargs):
        return self._resp

    async def post(self, *args, **kwargs):
        return self._resp


def patch_client(monkeypatch, resp: FakeResp):
    import services.plugins.rest_adapters as ra

    monkeypatch.setattr(ra.httpx, "AsyncClient", lambda *a, **k: FakeClient(resp))
    # _assert_safe_target does real DNS — bypass for fixture hosts.
    monkeypatch.setattr(ra, "_assert_safe_target", lambda url: None)


def run(coro):
    return asyncio.run(coro)


def test_registry_covers_batch2():
    for pid, cls in [
        ("plugin-prometheus", PrometheusAdapter),
        ("plugin-elastic", ElasticAdapter),
        ("plugin-dynatrace", DynatraceAdapter),
        ("plugin-honeycomb", HoneycombAdapter),
        ("plugin-statuspage", StatuspageAdapter),
        ("plugin-victorops", VictorOpsAdapter),
        ("plugin-sonarqube", SonarQubeAdapter),
        ("plugin-snyk", SnykAdapter),
        ("plugin-netlify", NetlifyAdapter),
    ]:
        assert isinstance(get_adapter(pid), cls), pid


def test_prometheus_firing_and_pending(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"data": {"alerts": [
        {"labels": {"alertname": "HighCPU", "severity": "critical", "instance": "a:1"},
         "annotations": {"summary": "cpu hot"}, "state": "firing"},
        {"labels": {"alertname": "Watch", "severity": "warning"}, "annotations": {}, "state": "pending"},
    ]}}))
    rows = run(PrometheusAdapter().fetch(PluginCtx(plugin_id="plugin-prometheus", base_url="http://p:9090")))
    assert rows[0]["status"] == "firing" and rows[0]["severity"] == "high"
    assert rows[1]["status"] == "pending"


def test_prometheus_needs_base_url():
    assert "Base URL" in run(PrometheusAdapter().test(PluginCtx(plugin_id="plugin-prometheus"))).message


def test_elastic_error_rule_fires(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"data": [
        {"id": "r1", "name": "Latency", "rule_type_id": "xpack", "execution_status": {"status": "error"}},
        {"id": "r2", "name": "OK rule", "rule_type_id": "xpack", "execution_status": {"status": "ok"}},
    ]}))
    rows = run(ElasticAdapter().fetch(
        PluginCtx(plugin_id="plugin-elastic", token="k", base_url="https://kb:5601")))
    assert rows[0]["status"] == "firing" and rows[1]["status"] == "resolved"


def test_dynatrace_open_problem_critical(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"problems": [
        {"problemId": "P1", "displayId": "P-1", "title": "Availability loss",
         "severityLevel": "AVAILABILITY"},
    ]}))
    rows = run(DynatraceAdapter().fetch(
        PluginCtx(plugin_id="plugin-dynatrace", token="k", base_url="https://env.live.dynatrace.com")))
    assert rows[0]["severity"] == "critical" and rows[0]["status"] == "firing"


def test_honeycomb_triggers_are_pending_never_firing(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, [
        {"id": "t1", "name": "Burn", "threshold": 2, "disabled": False},
        {"id": "t2", "name": "Off", "disabled": True},
    ]))
    rows = run(HoneycombAdapter().fetch(
        PluginCtx(plugin_id="plugin-honeycomb", token="k", config={"dataset": "api"})))
    assert len(rows) == 1
    assert rows[0]["status"] == "pending" and rows[0]["title"].startswith("[armed]")


def test_honeycomb_needs_dataset():
    assert run(HoneycombAdapter().fetch(PluginCtx(plugin_id="plugin-honeycomb", token="k"))) == []


def test_statuspage_degraded_component_fires(monkeypatch):
    import services.plugins.rest_adapters as ra

    class SeqClient(FakeClient):
        async def get(self, *args, **kwargs):
            if "components" in args[0]:
                return FakeResp(200, [{"id": "c1", "name": "API", "status": "major_outage"}])
            return FakeResp(200, [])

    monkeypatch.setattr(ra, "_assert_safe_target", lambda url: None)
    monkeypatch.setattr(ra.httpx, "AsyncClient", lambda *a, **k: SeqClient(FakeResp()))
    rows = run(StatuspageAdapter().fetch(
        PluginCtx(plugin_id="plugin-statuspage", token="k", config={"page_id": "abc"})))
    assert rows[0]["severity"] == "critical" and rows[0]["status"] == "firing"


def test_statuspage_needs_page_id():
    assert run(StatuspageAdapter().test(
        PluginCtx(plugin_id="plugin-statuspage", token="k", config={}))).success is False


def test_victorops_triggered_fires(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"incidents": [
        {"incidentNumber": 7, "entityDisplayName": "DB", "currentPhase": "TRIGGERED", "service": "db"},
        {"incidentNumber": 8, "entityDisplayName": "Old", "currentPhase": "RESOLVED"},
    ]}))
    rows = run(VictorOpsAdapter().fetch(
        PluginCtx(plugin_id="plugin-victorops", token="k", config={"api_id": "aid"})))
    assert len(rows) == 1 and rows[0]["severity"] == "critical"


def test_victorops_needs_api_id():
    assert run(VictorOpsAdapter().test(
        PluginCtx(plugin_id="plugin-victorops", token="k", config={}))).success is False


def test_sonarqube_error_fires_ok_silent(monkeypatch):
    import services.plugins.rest_adapters as ra

    class SeqClient(FakeClient):
        def __init__(self):
            self.calls = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, *args, **kwargs):
            self.calls += 1
            if "validate" in args[0]:
                return FakeResp(200, {"valid": True})
            return FakeResp(200, {"projectStatus": {"status": "ERROR", "conditions": [
                {"metricKey": "bugs", "status": "ERROR", "actualValue": "3"}]}})

    monkeypatch.setattr(ra, "_assert_safe_target", lambda url: None)
    monkeypatch.setattr(ra.httpx, "AsyncClient", lambda *a, **k: SeqClient())
    ctx = PluginCtx(plugin_id="plugin-sonarqube", token="tok",
                    base_url="https://sonar:9000", config={"project_key": "web"})
    assert run(SonarQubeAdapter().test(ctx)).success is True
    rows = run(SonarQubeAdapter().fetch(ctx))
    assert rows[0]["status"] == "firing" and "bugs" in rows[0]["description"]


def test_snyk_issues_fire(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"data": [
        {"id": "s1", "attributes": {"title": "RCE in lib", "effectiveSeverityLevel": "critical",
                                   "packageName": "lib", "issueType": "vuln"}},
    ]}))
    rows = run(SnykAdapter().fetch(
        PluginCtx(plugin_id="plugin-snyk", token="k", config={"org_id": "org-1"})))
    assert rows[0]["severity"] == "critical" and rows[0]["labels"]["snyk_id"] == "s1"


def test_snyk_needs_org():
    assert run(SnykAdapter().fetch(PluginCtx(plugin_id="plugin-snyk", token="k", config={}))) == []


def test_netlify_user_validates(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"user": {"login": "dev"}}))
    result = run(NetlifyAdapter().test(PluginCtx(plugin_id="plugin-netlify", token="nf-key")))
    assert result.success is True and "dev" in result.message


def test_netlify_no_token_fails():
    assert run(NetlifyAdapter().test(PluginCtx(plugin_id="plugin-netlify"))).success is False
