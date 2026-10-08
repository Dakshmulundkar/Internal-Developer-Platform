"""Batch 3b cloud adapters — AWS (SigV4), GCP (service-account JWT), Kubernetes.

AWS keys: access key ID in config `access_key_id`, secret in the API key box,
`region` in config. GCP: service-account JSON in config `service_account_json`,
plus `project_id` + `region`. Kubernetes: kubeconfig YAML in config `kubeconfig`,
optional `namespace`.
"""

import base64
import json
import logging
import time
import xml.etree.ElementTree as ET

import httpx
import yaml

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from services.service_prober import _assert_safe_target
from .aws_sign import sign_request, signed_url
from .rest_adapters import RestAdapter
from .base import PluginCtx, TestResult

logger = logging.getLogger(__name__)

TIMEOUT = 15.0

_gcp_token_cache: dict[str, tuple[str, float]] = {}


def _aws_keys(ctx: PluginCtx) -> tuple[str, str, str] | None:
    ak = str(ctx.config.get("access_key_id") or "").strip()
    sk = ctx.token or ""
    region = str(ctx.config.get("region") or "").strip()
    if not ak or not sk or "••••" in sk or not region:
        return None
    return ak, sk, region


class CodeDeployAdapter(RestAdapter):
    plugin_ids = ("plugin-aws",)

    async def _api(self, ctx: PluginCtx, keys, target: str, body: dict) -> dict:
        ak, sk, region = keys
        url = f"https://codedeploy.{region}.amazonaws.com/"
        payload = json.dumps(body)
        headers = sign_request("POST", url, "codedeploy", region, ak, sk,
                               payload=payload, amz_target=f"CodeDeploy_20141006.{target}")
        _assert_safe_target(url)
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(url, headers=headers, content=payload)
            resp.raise_for_status()
            return resp.json()

    async def test(self, ctx: PluginCtx) -> TestResult:
        keys = _aws_keys(ctx)
        if not keys:
            return TestResult(False, "AWS needs access key ID + secret key + region (e.g. us-east-1).")
        ak, sk, region = keys
        params = {"Action": "GetCallerIdentity", "Version": "2011-06-15"}
        url = signed_url(f"https://sts.{region}.amazonaws.com/", params)
        headers = sign_request("GET", f"https://sts.{region}.amazonaws.com/", "sts",
                               region, ak, sk, params=params)
        try:
            _assert_safe_target(url)
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    return TestResult(True, "AWS credentials validated (STS identity confirmed).")
                if resp.status_code in (401, 403):
                    return TestResult(False, "AWS rejected the keys (HTTP 401/403). Check key + secret.")
                return TestResult(False, f"AWS STS returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach AWS STS: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        keys = _aws_keys(ctx)
        if not keys:
            return []
        try:
            app_filter = str(ctx.config.get("app") or "").strip()
            list_body: dict = {}
            if app_filter:
                list_body["applicationName"] = app_filter
            listed = await self._api(ctx, keys, "ListDeployments", list_body)
            dep_ids = (listed.get("deployments") or [])[:5]
            if not dep_ids:
                return []
            batch = await self._api(ctx, keys, "BatchGetDeployments", {"deploymentIds": dep_ids})
            infos = batch.get("deploymentsInfo") or []
        except Exception as exc:
            logger.warning("CodeDeploy fetch failed: %s", exc)
            return []
        status_map = {"Succeeded": "ready", "Failed": "failed", "Stopped": "failed"}
        rows = []
        for info in infos:
            overview = info.get("deploymentOverview") or {}
            rows.append({
                "kind": "deploy",
                "provider": "aws",
                "version": str(info.get("deploymentId", ""))[:12],
                "status": status_map.get(str(info.get("status", "")), "building"),
                "branch": "",
                "commit_hash": str(info.get("revision", {}).get("gitHubLocation", {}).get("commitId", "") or "")[:7],
                "commit_message": f"{info.get('applicationName', '')} / {info.get('deploymentGroupName', '')}"[:200],
                "created_at": info.get("createTime"),
                "error_message": overview.get("Failed") and f"{overview.get('Failed')} targets failed" or None,
            })
        return rows


class CloudWatchAdapter(RestAdapter):
    plugin_ids = ("plugin-cloudwatch",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        keys = _aws_keys(ctx)
        if not keys:
            return TestResult(False, "AWS needs access key ID + secret key + region.")
        ak, sk, region = keys
        params = {"Action": "DescribeAlarms", "StateValue": "ALARM", "MaxRecords": "1", "Version": "2010-08-01"}
        url = signed_url(f"https://monitoring.{region}.amazonaws.com/", params)
        headers = sign_request("GET", f"https://monitoring.{region}.amazonaws.com/",
                               "monitoring", region, ak, sk, params=params)
        try:
            _assert_safe_target(url)
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    return TestResult(True, "CloudWatch reachable with these keys.")
                if resp.status_code in (401, 403):
                    return TestResult(False, "AWS rejected the keys (HTTP 401/403). Needs cloudwatch:DescribeAlarms.")
                return TestResult(False, f"CloudWatch returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach CloudWatch: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        keys = _aws_keys(ctx)
        if not keys:
            return []
        ak, sk, region = keys
        params = {"Action": "DescribeAlarms", "StateValue": "ALARM", "MaxRecords": "50", "Version": "2010-08-01"}
        url = signed_url(f"https://monitoring.{region}.amazonaws.com/", params)
        headers = sign_request("GET", f"https://monitoring.{region}.amazonaws.com/",
                               "monitoring", region, ak, sk, params=params)
        try:
            _assert_safe_target(url)
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                root = ET.fromstring(resp.text)
        except Exception as exc:
            logger.warning("CloudWatch fetch failed: %s", exc)
            return []
        rows = []
        for m in root.iter():
            if not m.tag.endswith("MetricAlarms"):
                continue
            for alarm in list(m):
                def _text(node, name):
                    el = next((c for c in node if c.tag.endswith(name)), None)
                    return el.text if el is not None else ""
                rows.append({
                    "source": "cloudwatch",
                    "title": f"Alarm: {_text(alarm, 'AlarmName')}",
                    "description": _text(alarm, "StateReason")[:300],
                    "severity": "critical",
                    "status": "firing",
                    "labels": {"alarm": _text(alarm, "AlarmName"),
                               "metric": _text(alarm, "MetricName")},
                })
        return rows


# ── GCP ─────────────────────────────────────────────────────────────


def _gcp_access_token(sa_json: str) -> str:
    """Exchange a service-account key for an OAuth access token (cached ~55 min)."""
    sa = json.loads(sa_json)
    cache_key = sa.get("client_email", "")
    cached = _gcp_token_cache.get(cache_key)
    if cached and cached[1] > time.time() + 60:
        return cached[0]
    now = int(time.time())
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    claims = base64.urlsafe_b64encode(json.dumps({
        "iss": sa["client_email"],
        "scope": "https://www.googleapis.com/auth/cloud-platform",
        "aud": sa.get("token_uri", "https://oauth2.googleapis.com/token"),
        "exp": now + 3600,
        "iat": now,
    }).encode()).rstrip(b"=").decode()
    signing_input = f"{header}.{claims}".encode()
    key = serialization.load_pem_private_key(sa["private_key"].encode(), password=None)
    sig = key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    assertion = f"{header}.{claims}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"
    import urllib.request

    req = urllib.request.Request(
        sa.get("token_uri", "https://oauth2.googleapis.com/token"),
        data=f"grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={assertion}".encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        token = json.loads(resp.read().decode())["access_token"]
    _gcp_token_cache[cache_key] = (token, now + 3600)
    return token


class GCPDeployAdapter(RestAdapter):
    plugin_ids = ("plugin-gcp",)

    def _ctx_vals(self, ctx: PluginCtx) -> tuple[str, str, str] | None:
        sa = str(ctx.config.get("service_account_json") or "").strip()
        project = str(ctx.config.get("project_id") or "").strip()
        region = str(ctx.config.get("region") or "").strip()
        if not sa or not project or not region:
            return None
        return sa, project, region

    def _get(self, url: str, token: str) -> dict:
        import urllib.request

        _assert_safe_target(url)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode())

    async def test(self, ctx: PluginCtx) -> TestResult:
        vals = self._ctx_vals(ctx)
        if not vals:
            return TestResult(False, "GCP needs service-account JSON + project ID + region.")
        sa, project, region = vals
        try:
            token = await _run_blocking(_gcp_access_token, sa)
            data = await _run_blocking(
                self._get,
                f"https://clouddeploy.googleapis.com/v1/projects/{project}/locations/{region}/deliveryPipelines?pageSize=1",
                token,
            )
            return TestResult(True, f"GCP Cloud Deploy verified for {project}/{region}.")
        except Exception as exc:
            msg = str(exc)
            if "401" in msg or "invalid_grant" in msg:
                return TestResult(False, "GCP rejected the service-account key. Check JSON + IAM roles.")
            return TestResult(False, f"GCP check failed: {msg[:200]}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        import asyncio

        vals = self._ctx_vals(ctx)
        if not vals:
            return []
        sa, project, region = vals
        try:
            token = await _run_blocking(_gcp_access_token, sa)
            pipes = await _run_blocking(
                self._get,
                f"https://clouddeploy.googleapis.com/v1/projects/{project}/locations/{region}/deliveryPipelines?pageSize=3",
                token,
            )
            rows = []
            for pipe in (pipes.get("deliveryPipelines") or [])[:3]:
                pname = pipe.get("name", "")
                rels = await _run_blocking(self._get, f"https://clouddeploy.googleapis.com/v1/{pname}/releases?pageSize=2", token)
                for rel in (rels.get("releases") or [])[:2]:
                    rname = rel.get("name", "")
                    rollouts = await _run_blocking(
                        self._get, f"https://clouddeploy.googleapis.com/v1/{rname}/rollouts?pageSize=1", token)
                    rollout_list = rollouts.get("rollouts") or []
                    state = str((rollout_list[0].get("state", "") if rollout_list else "") or "")
                    rows.append({
                        "kind": "deploy",
                        "provider": "gcp",
                        "version": rname.split("/")[-1][:12],
                        "status": "ready" if state == "SUCCEEDED" else "failed" if state == "FAILED" else "building",
                        "commit_message": f"{pname.split('/')[-1]} release"[:200],
                        "created_at": rel.get("createTime"),
                    })
            return rows
        except Exception as exc:
            logger.warning("GCP fetch failed: %s", exc)
            return []


async def _run_blocking(fn, *args):
    import asyncio

    return await asyncio.to_thread(fn, *args)


# ── Kubernetes ──────────────────────────────────────────────────────


class KubernetesAdapter(RestAdapter):
    plugin_ids = ("plugin-kubernetes",)

    def _kube(self, ctx: PluginCtx) -> tuple[str, dict, bool] | None:
        raw = str(ctx.config.get("kubeconfig") or "").strip()
        if not raw:
            return None, {}, False
        try:
            cfg = yaml.safe_load(raw)
        except Exception:
            return None, {}, False, {}, False
        try:
            ctx_name = ctx.config.get("context") or (cfg.get("current-context") or "")
            named_ctx = next((c["context"] for c in cfg.get("contexts", []) if c.get("name") == ctx_name), {})
            cluster = next((c["cluster"] for c in cfg.get("clusters", []) if c.get("name") == named_ctx.get("cluster")), {})
            user = next((u["user"] for u in cfg.get("users", []) if u.get("name") == named_ctx.get("user")), {})
            server = str(cluster.get("server", "")).rstrip("/")
            headers: dict = {}
            if user.get("token"):
                headers["Authorization"] = f"Bearer {user['token']}"
            insecure = bool(cluster.get("insecure-skip-tls-verify", False))
            if not server or not headers:
                return None, {}, False
            return server, headers, insecure
        except Exception:
            return None, {}, False

    async def test(self, ctx: PluginCtx) -> TestResult:
        parsed = self._kube(ctx)
        if not parsed or not parsed[0]:
            return TestResult(False, "Kubernetes needs a kubeconfig with a token-auth user (paste the YAML).")
        server, headers, insecure = parsed
        try:
            _assert_safe_target(server)
            async with httpx.AsyncClient(timeout=TIMEOUT, verify=not insecure) as client:
                resp = await client.get(f"{server}/api", headers=headers)
                if resp.status_code == 200:
                    return TestResult(True, "Kubernetes API reachable with this kubeconfig.")
                if resp.status_code in (401, 403):
                    return TestResult(False, "Kubernetes rejected the credentials (HTTP 401/403).")
                return TestResult(False, f"Kubernetes API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Kubernetes at {server}: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        parsed = self._kube(ctx)
        if not parsed or not parsed[0]:
            return []
        server, headers, insecure = parsed
        namespace = str(ctx.config.get("namespace") or "").strip()
        path = f"/api/v1/namespaces/{namespace}/pods" if namespace else "/api/v1/pods"
        try:
            _assert_safe_target(server)
            async with httpx.AsyncClient(timeout=TIMEOUT, verify=not insecure) as client:
                resp = await client.get(f"{server}{path}", headers=headers, params={"limit": "100"})
                resp.raise_for_status()
                pods = resp.json().get("items", [])
        except Exception as exc:
            logger.warning("Kubernetes fetch failed: %s", exc)
            return []
        bad_wait = {"CrashLoopBackOff", "OOMKilled", "ImagePullBackOff", "ErrImagePull", "CreateContainerConfigError"}
        rows = []
        for pod in pods:
            meta = pod.get("metadata", {}) or {}
            status = pod.get("status", {}) or {}
            phase = str(status.get("phase", ""))
            problems = []
            for cs in (status.get("containerStatuses") or []):
                waiting = (cs.get("waiting") or {}).get("reason", "")
                terminated = (cs.get("terminated") or {}).get("reason", "")
                if waiting in bad_wait or terminated in ("OOMKilled", "Error"):
                    problems.append(waiting or terminated)
                elif int(cs.get("restartCount", 0) or 0) >= 5:
                    problems.append(f"restarts={cs.get('restartCount')}")
            if phase == "Failed":
                problems.append("phase=Failed")
            if not problems:
                continue
            rows.append({
                "source": "kubernetes",
                "title": f"Pod unhealthy: {meta.get('name', '')}",
                "description": f"ns: {meta.get('namespace', '')} · {', '.join(problems[:3])}",
                "severity": "critical" if ("CrashLoopBackOff" in problems or "OOMKilled" in problems) else "high",
                "status": "firing",
                "labels": {"pod": str(meta.get("name", "")), "namespace": str(meta.get("namespace", ""))},
            })
        return rows
