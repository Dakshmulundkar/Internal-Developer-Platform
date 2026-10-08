"""Batch 3b cloud/collab adapter tests — fixtures only, no live clouds."""

import asyncio
import datetime

from services.plugins.aws_sign import sign_request, signed_url
from services.plugins.base import PluginCtx
from services.plugins.collab_adapters import SlackAdapter, TeamsAdapter
from services.plugins.cloud_adapters import (
    CloudWatchAdapter,
    CodeDeployAdapter,
    GCPDeployAdapter,
    KubernetesAdapter,
)
from services.plugins.registry import get_adapter

KUBECONFIG = """
apiVersion: v1
kind: Config
current-context: prod
clusters:
- name: prod
  cluster: {server: https://k8s.example.com:6443}
contexts:
- name: prod
  context: {cluster: prod, user: bot}
users:
- name: bot
  user: {token: k8s-token-123}
"""


class FakeResp:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text or str(payload)[:500]

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


def patch_cloud(monkeypatch, resp: FakeResp):
    import services.plugins.cloud_adapters as ca

    monkeypatch.setattr(ca.httpx, "AsyncClient", lambda *a, **k: FakeClient(resp))
    monkeypatch.setattr(ca, "_assert_safe_target", lambda url: None)


def patch_collab(monkeypatch, resp: FakeResp):
    import services.plugins.rest_adapters as ra

    monkeypatch.setattr(ra.httpx, "AsyncClient", lambda *a, **k: FakeClient(resp))
    monkeypatch.setattr(ra, "_assert_safe_target", lambda url: None)


def run(coro):
    return asyncio.run(coro)


def test_registry_covers_batch3b():
    for pid, cls in [
        ("plugin-aws", CodeDeployAdapter),
        ("plugin-cloudwatch", CloudWatchAdapter),
        ("plugin-gcp", GCPDeployAdapter),
        ("plugin-kubernetes", KubernetesAdapter),
        ("plugin-slack", SlackAdapter),
        ("plugin-msteams", TeamsAdapter),
    ]:
        assert isinstance(get_adapter(pid), cls), pid


# ── SigV4 ───────────────────────────────────────────────────────────

FIXED_NOW = datetime.datetime(2026, 9, 15, 12, 0, 0, tzinfo=datetime.timezone.utc)


def _sig(payload=""):
    return sign_request("GET", "https://sts.us-east-1.amazonaws.com/", "sts",
                        "us-east-1", "AKID", "SECRET",
                        params={"Action": "GetCallerIdentity", "Version": "2011-06-15"},
                        payload=payload, now=FIXED_NOW)


def test_sigv4_shape_and_determinism():
    h1 = _sig()
    h2 = _sig()
    assert h1 == h2
    auth = h1["Authorization"]
    assert auth.startswith("AWS4-HMAC-SHA256 Credential=AKID/20260915/us-east-1/sts/aws4_request")
    assert "SignedHeaders=host;x-amz-date" in auth
    sig = auth.split("Signature=")[1]
    assert len(sig) == 64 and all(c in "0123456789abcdef" for c in sig)
    assert h1["x-amz-date"] == "20260915T120000Z"


def test_sigv4_payload_sensitivity():
    assert _sig()["Authorization"] != _sig("different")["Authorization"]


def test_signed_url_sorted_encoding():
    url = signed_url("https://x/", {"b": "2", "a": "1 2"})
    assert url == "https://x/?a=1%202&b=2"


# ── AWS ─────────────────────────────────────────────────────────────

AWS_CTX = PluginCtx(plugin_id="plugin-aws", token="sk",
                    config={"access_key_id": "AKID", "region": "us-east-1"})


def test_codedeploy_needs_keys():
    assert "region" in run(CodeDeployAdapter().test(
        PluginCtx(plugin_id="plugin-aws", token="sk", config={}))).message


def test_codedeploy_sts_ok(monkeypatch):
    patch_cloud(monkeypatch, FakeResp(200, {}, "<xml/>"))
    assert run(CodeDeployAdapter().test(AWS_CTX)).success is True


def test_codedeploy_fetch_maps(monkeypatch):
    import services.plugins.cloud_adapters as ca

    class SeqClient(FakeClient):
        async def post(self, *args, **kwargs):
            target = (kwargs.get("headers") or {}).get("x-amz-target", "")
            if "ListDeployments" in target:
                return FakeResp(200, {"deployments": ["d-1"]})
            return FakeResp(200, {"deploymentsInfo": [{
                "deploymentId": "d-1", "applicationName": "web", "deploymentGroupName": "prod",
                "status": "Failed",
                "revision": {"gitHubLocation": {"commitId": "abcdef1234567"}},
                "createTime": 1726000000,
                "deploymentOverview": {"Failed": 2},
            }]})

    monkeypatch.setattr(ca, "_assert_safe_target", lambda url: None)
    monkeypatch.setattr(ca.httpx, "AsyncClient", lambda *a, **k: SeqClient(FakeResp()))
    rows = run(CodeDeployAdapter().fetch(AWS_CTX))
    assert rows[0]["status"] == "failed" and rows[0]["commit_hash"] == "abcdef1"
    assert "2 targets failed" in (rows[0]["error_message"] or "")


CW_XML = """<DescribeAlarmsResponse xmlns="https://monitoring.amazonaws.com/doc/2010-08-01/">
<DescribeAlarmsResult><MetricAlarms><member>
<AlarmName>CPUHigh</AlarmName><MetricName>CPUUtilization</MetricName>
<StateValue>ALARM</StateValue><StateReason>Threshold crossed</StateReason>
</member></MetricAlarms></DescribeAlarmsResult></DescribeAlarmsResponse>"""


def test_cloudwatch_alarm_maps_firing(monkeypatch):
    patch_cloud(monkeypatch, FakeResp(200, {}, CW_XML))
    ctx = PluginCtx(plugin_id="plugin-cloudwatch", token="sk",
                    config={"access_key_id": "AKID", "region": "us-east-1"})
    rows = run(CloudWatchAdapter().fetch(ctx))
    assert len(rows) == 1 and rows[0]["source"] == "cloudwatch"
    assert rows[0]["status"] == "firing" and "CPUHigh" in rows[0]["title"]


# ── GCP ─────────────────────────────────────────────────────────────

def test_gcp_needs_all_three():
    ctx = PluginCtx(plugin_id="plugin-gcp", token="x", config={"project_id": "p"})
    assert run(GCPDeployAdapter().test(ctx)).success is False


def test_gcp_fetch_maps_rollout(monkeypatch):
    import services.plugins.cloud_adapters as ca

    async def fake_token(sa):
        return "tok"

    def sync_fake_token(sa):
        return "tok"

    def fake_get(self, url, token):
        if "deliveryPipelines?" in url:
            return {"deliveryPipelines": [{"name": "projects/p/locations/r/deliveryPipelines/web"}]}
        if "/releases?" in url:
            return {"releases": [{"name": "projects/p/locations/r/deliveryPipelines/web/releases/rel1",
                                  "createTime": "2026-09-01T00:00:00Z"}]}
        return {"rollouts": [{"state": "SUCCEEDED"}]}

    monkeypatch.setattr(ca, "_gcp_access_token", sync_fake_token)
    monkeypatch.setattr(ca.GCPDeployAdapter, "_get", fake_get)
    ctx = PluginCtx(plugin_id="plugin-gcp", token="x",
                    config={"service_account_json": '{"client_email":"a"}',
                            "project_id": "p", "region": "r"})
    rows = run(GCPDeployAdapter().fetch(ctx))
    assert rows[0]["status"] == "ready" and rows[0]["provider"] == "gcp"


# ── Kubernetes ──────────────────────────────────────────────────────

def test_kubeconfig_parses():
    adapter = KubernetesAdapter()
    server, headers, insecure = adapter._kube(
        PluginCtx(plugin_id="plugin-kubernetes", config={"kubeconfig": KUBECONFIG}))
    assert server == "https://k8s.example.com:6443"
    assert headers == {"Authorization": "Bearer k8s-token-123"}
    assert insecure is False


def test_kubeconfig_garbage_rejected():
    adapter = KubernetesAdapter()
    assert adapter._kube(PluginCtx(plugin_id="plugin-kubernetes",
                                   config={"kubeconfig": "not: [valid"}))[0] is None


def test_k8s_crashloop_fires(monkeypatch):
    patch_cloud(monkeypatch, FakeResp(200, {"items": [
        {"metadata": {"name": "web-abc", "namespace": "prod"},
         "status": {"phase": "Running", "containerStatuses": [
             {"restartCount": 12, "waiting": {"reason": "CrashLoopBackOff"}}]}},
        {"metadata": {"name": "ok", "namespace": "prod"},
         "status": {"phase": "Running", "containerStatuses": [{"restartCount": 0}]}},
    ]}))
    rows = run(KubernetesAdapter().fetch(
        PluginCtx(plugin_id="plugin-kubernetes", config={"kubeconfig": KUBECONFIG})))
    assert len(rows) == 1 and rows[0]["severity"] == "critical"
    assert rows[0]["source"] == "kubernetes"


# ── Slack / Teams ───────────────────────────────────────────────────

def test_slack_auth_ok(monkeypatch):
    patch_collab(monkeypatch, FakeResp(200, {"ok": True, "user": "bot", "team": "acme"}))
    result = run(SlackAdapter().test(PluginCtx(plugin_id="plugin-slack", token="xoxb-k")))
    assert result.success is True and "acme" in result.message


def test_slack_bad_token(monkeypatch):
    patch_collab(monkeypatch, FakeResp(200, {"ok": False, "error": "invalid_auth"}))
    assert run(SlackAdapter().test(PluginCtx(plugin_id="plugin-slack", token="bad"))).success is False


def test_teams_me_ok(monkeypatch):
    patch_collab(monkeypatch, FakeResp(200, {"displayName": "Dev"}))
    assert run(TeamsAdapter().test(PluginCtx(plugin_id="plugin-msteams", token="k"))).success is True


def test_oauth_router_imports():
    import routers.plugin_oauth as oauth

    routes = {getattr(r, "path", "") for r in oauth.router.routes}
    assert "/slack/start" in routes and "/slack/callback" in routes
    assert "/teams/start" in routes and "/teams/callback" in routes
