"""Batch 0 plugin framework tests — no live vendor keys needed.

Run from backend/:  ../backend/venv/Scripts/python.exe -m pytest tests/ -q
(On Windows: backend\\venv\\Scripts\\python.exe -m pytest tests\\ -q)
"""

import asyncio

from services.plugins import crypto
from services.plugins.adapters import (
    DatadogAdapter,
    GenericAdapter,
    GitHubAdapter,
    GrafanaAdapter,
    NewRelicAdapter,
    SentryAdapter,
    VercelAdapter,
)
from services.plugins.base import PluginCtx
from services.plugins.registry import (
    get_adapter,
    normalize_plugin_id,
    normalize_record,
)


class FakeResp:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


class FakeClient:
    """Minimal stand-in for httpx.AsyncClient (async context manager)."""

    def __init__(self, resp: FakeResp):
        self._resp = resp

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, *args, **kwargs):
        return self._resp


def patch_client(monkeypatch, resp: FakeResp):
    import services.plugins.adapters as adapters

    monkeypatch.setattr(adapters.httpx, "AsyncClient", lambda *a, **k: FakeClient(resp))


def run(coro):
    return asyncio.run(coro)


# ── crypto ──────────────────────────────────────────────────────────

def test_encrypt_decrypt_roundtrip():
    token = "glpat-SECRET-123"
    stored = crypto.encrypt_key(token)
    assert stored != token  # actually encrypted when FERNET_KEY is set
    assert crypto.decrypt_key(stored) == token


def test_decrypt_legacy_plaintext_passthrough():
    assert crypto.decrypt_key("old-plaintext-key") == "old-plaintext-key"
    assert crypto.decrypt_key("") == ""
    assert crypto.decrypt_key(None) == ""


def test_rotation_previous_key_still_decrypts(monkeypatch):
    from cryptography.fernet import Fernet
    from config import settings
    import services.plugins.crypto as crypto_mod

    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()
    old_stored = Fernet(old_key.encode()).encrypt(b"rotation-secret").decode()
    monkeypatch.setattr(settings, "FERNET_KEY", new_key, raising=False)
    monkeypatch.setattr(settings, "FERNET_PREVIOUS_KEY", old_key, raising=False)
    assert crypto_mod.decrypt_key(old_stored) == "rotation-secret"
    # New writes always use the current key.
    fresh = crypto_mod.encrypt_key("fresh-secret")
    assert crypto_mod.decrypt_key(fresh) == "fresh-secret"


def test_sync_due_gating():
    import time
    from background.plugin_sync import DEFAULT_SYNC_INTERVAL, SYNC_INTERVALS, _sync_due

    now = time.time()
    recent = datetime_to_iso(now - 10)
    old = datetime_to_iso(now - 10_000)
    assert _sync_due({"plugin_id": "plugin-uptimerobot", "last_sync_at": recent}, now) is False
    assert _sync_due({"plugin_id": "plugin-uptimerobot", "last_sync_at": old}, now) is True
    assert _sync_due({"plugin_id": "plugin-grafana", "last_sync_at": None}, now) is True
    assert _sync_due({"plugin_id": "plugin-grafana", "last_sync_at": "garbage"}, now) is True
    assert SYNC_INTERVALS["plugin-uptimerobot"] < DEFAULT_SYNC_INTERVAL


def datetime_to_iso(ts: float) -> str:
    from datetime import datetime, timezone

    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


# ── registry ────────────────────────────────────────────────────────

def test_legacy_ids_normalize():
    assert normalize_plugin_id("vercel") == "plugin-vercel"
    assert normalize_plugin_id("grafana") == "plugin-grafana"
    assert normalize_plugin_id("github") == "plugin-github"
    assert normalize_plugin_id("sentry") == "plugin-sentry"
    assert normalize_plugin_id("plugin-datadog") == "plugin-datadog"
    assert normalize_plugin_id(None) == ""


def test_legacy_record_normalized():
    rec = normalize_record({"plugin_id": "github", "plugin_name": "GitHub Actions", "category": "ci_cd"})
    assert rec["plugin_id"] == "plugin-github-actions"
    assert rec["category"] == "deployment"


def test_adapter_dispatch():
    assert isinstance(get_adapter("plugin-grafana"), GrafanaAdapter)
    assert isinstance(get_adapter("grafana"), GrafanaAdapter)  # legacy short id
    assert isinstance(get_adapter("plugin-vercel"), VercelAdapter)
    assert isinstance(get_adapter("plugin-github"), GitHubAdapter)
    assert isinstance(get_adapter("plugin-github-actions"), GitHubAdapter)
    assert isinstance(get_adapter("plugin-sentry"), SentryAdapter)
    assert isinstance(get_adapter("plugin-datadog"), DatadogAdapter)
    assert isinstance(get_adapter("plugin-newrelic"), NewRelicAdapter)
    assert isinstance(get_adapter("plugin-something-new"), GenericAdapter)


# ── adapters: test() honesty ────────────────────────────────────────

def test_sentry_missing_org_fails():
    adapter = SentryAdapter()
    ctx = PluginCtx(plugin_id="plugin-sentry", token="real-token", config={})
    result = run(adapter.test(ctx))
    assert result.success is False
    assert "organization" in result.message


def test_sentry_missing_token_fails():
    adapter = SentryAdapter()
    ctx = PluginCtx(plugin_id="plugin-sentry", config={"org": "acme", "projects": "web"})
    assert run(adapter.test(ctx)).success is False


def test_sentry_success(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"slug": "web"}))
    adapter = SentryAdapter()
    ctx = PluginCtx(plugin_id="plugin-sentry", token="tok", config={"org": "acme", "projects": "web"})
    result = run(adapter.test(ctx))
    assert result.success is True


def test_sentry_401_fails(monkeypatch):
    patch_client(monkeypatch, FakeResp(401, {}, "unauthorized"))
    adapter = SentryAdapter()
    ctx = PluginCtx(plugin_id="plugin-sentry", token="bad", config={"org": "acme", "projects": "web"})
    result = run(adapter.test(ctx))
    assert result.success is False


def test_sentry_fetch_maps_issues(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, [
        {"id": 1, "title": "TypeError: x", "culprit": "app.py", "level": "error"},
    ]))
    adapter = SentryAdapter()
    ctx = PluginCtx(plugin_id="plugin-sentry", token="tok", config={"org": "acme", "projects": "web"})
    rows = run(adapter.fetch(ctx))
    assert len(rows) == 1
    assert rows[0]["source"] == "sentry"
    assert rows[0]["status"] == "firing"
    assert rows[0]["severity"] == "high"


def test_datadog_validate(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"valid": True}))
    adapter = DatadogAdapter()
    ctx = PluginCtx(plugin_id="plugin-datadog", token="dd-key", config={"app_key": "app"})
    assert run(adapter.test(ctx)).success is True


def test_datadog_rejected(monkeypatch):
    patch_client(monkeypatch, FakeResp(403, {}, "forbidden"))
    adapter = DatadogAdapter()
    ctx = PluginCtx(plugin_id="plugin-datadog", token="bad")
    result = run(adapter.test(ctx))
    assert result.success is False


def test_datadog_no_key_fails():
    assert run(DatadogAdapter().test(PluginCtx(plugin_id="plugin-datadog"))).success is False


def test_newrelic_success(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"violations": []}))
    adapter = NewRelicAdapter()
    ctx = PluginCtx(plugin_id="plugin-newrelic", token="NRAK-xxx")
    assert run(adapter.test(ctx)).success is True


def test_grafana_unreachable_fails(monkeypatch):
    import services.plugins.adapters as adapters

    class BoomClient(FakeClient):
        async def get(self, *args, **kwargs):
            raise ConnectionError("dns fail")

    monkeypatch.setattr(adapters.httpx, "AsyncClient", lambda *a, **k: BoomClient(FakeResp()))
    adapter = GrafanaAdapter()
    ctx = PluginCtx(plugin_id="plugin-grafana", base_url="https://grafana.example.com", token="tok")
    result = run(adapter.test(ctx))
    assert result.success is False


def test_grafana_fetch_without_creds_returns_empty():
    rows = run(GrafanaAdapter().fetch(PluginCtx(plugin_id="plugin-grafana")))
    assert rows == []


def test_generic_no_url_fails():
    assert run(GenericAdapter().test(PluginCtx())).success is False
