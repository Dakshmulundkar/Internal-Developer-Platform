"""ai_fix policy + OpenAI fixer tests — no live OpenAI calls.

Run from backend/: venv\\Scripts\\python.exe -m pytest tests\\ -q
"""

import asyncio
import json

from services.autofix import ai_fix
from services.autofix.ai_fix import cause_hint, classify_file, fix_file


def run(coro):
    return asyncio.run(coro)


def test_classify_small_vs_large():
    assert classify_file("eslint", 3, 1000)[0] == "small"
    assert classify_file("eslint", 5, 1000)[0] == "small"
    assert classify_file("eslint", 6, 1000)[0] == "large"
    assert classify_file("ruff", 2, 31_000)[0] == "large"
    assert classify_file("eslint", 0, 100)[0] == "large"


def test_cause_hint_maps_common_rules():
    hint = cause_hint("eslint", [{"rule": "no-unused-vars", "message": "x", "line": 1}])
    assert "unused" in hint
    hint = cause_hint("ruff", [{"rule": "F401", "message": "y", "line": 2}])
    assert "never used" in hint
    assert "human review" in cause_hint("eslint", [])


def test_fix_file_needs_key(monkeypatch):
    monkeypatch.setattr(ai_fix.settings, "OPENAI_API_KEY", "", raising=False)
    code, reason = fix_file("eslint", "a.js", "code", [])
    assert code is None
    assert "OPENAI_API_KEY" in reason


class _FakeResp:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, resp=None, exc=None):
        self._resp = resp
        self._exc = exc

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def post(self, url, headers=None, json=None):
        if self._exc:
            raise self._exc
        return self._resp


def _wire(monkeypatch, resp=None, exc=None):
    monkeypatch.setattr(ai_fix.settings, "OPENAI_API_KEY", "sk-test", raising=False)
    monkeypatch.setattr(
        ai_fix.httpx, "Client",
        lambda **kw: _FakeClient(resp=resp, exc=exc), raising=False,
    )


def test_fix_file_rejects_bad_key(monkeypatch):
    _wire(monkeypatch, resp=_FakeResp(401))
    code, reason = fix_file("eslint", "a.js", "code", [])
    assert code is None
    assert "API key" in reason


def test_fix_file_returns_code_on_success(monkeypatch):
    payload = {"choices": [{"message": {"content": json.dumps({"fixed_code": "const x = 1;"})}}]}
    _wire(monkeypatch, resp=_FakeResp(200, payload))
    code, reason = fix_file(
        "eslint", "a.js", "var x = 1;",
        [{"rule": "no-var", "line": 1, "message": "use let"}],
    )
    assert code == "const x = 1;"
    assert reason is None


def test_fix_file_discards_garbage(monkeypatch):
    payload = {"choices": [{"message": {"content": "not json"}}]}
    _wire(monkeypatch, resp=_FakeResp(200, payload))
    code, reason = fix_file("eslint", "a.js", "code", [])
    assert code is None
    assert reason


def test_fix_file_discards_giant_rewrite(monkeypatch):
    payload = {"choices": [{"message": {"content": json.dumps({"fixed_code": "x" * 1000})}}]}
    _wire(monkeypatch, resp=_FakeResp(200, payload))
    code, reason = fix_file("eslint", "a.js", "tiny", [])
    assert code is None
    assert "rewrite" in reason
