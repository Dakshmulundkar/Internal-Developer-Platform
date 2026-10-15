"""GitHub PAT endpoint tests — no live GitHub, no Supabase.

Run from backend/: venv\\Scripts\\python.exe -m pytest tests\\ -q
"""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import routers.github_token as gt
from routers.github_token import (
    TokenIn,
    delete_github_token,
    get_stored_token,
    github_token_status,
    save_github_token,
)


class FakeGitHubResp:
    def __init__(self, status_code=200, payload=None, scopes="repo"):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.headers = {"X-OAuth-Scopes": scopes} if scopes is not None else {}

    def json(self):
        return self._payload


class FakeAsyncClient:
    """Drop-in for httpx.AsyncClient used as async context manager."""

    def __init__(self, resp=None, exc=None):
        self._resp = resp
        self._exc = exc

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, headers=None):
        if self._exc:
            raise self._exc
        return self._resp


class FakeQuery:
    def __init__(self, db, table, rows):
        self._db = db
        self._table = table
        self._rows = rows
        self._deleted = False

    # chainable no-ops (the fake store ignores filters — one user per test)
    def select(self, *args):
        return self

    def eq(self, *args):
        return self

    def limit(self, *args):
        return self

    def upsert(self, row, on_conflict=None):
        rows = self._db.setdefault(self._table, [])
        for i, existing in enumerate(rows):
            if existing.get("user_id") == row.get("user_id"):
                rows[i] = {**existing, **row}
                break
        else:
            rows.append(dict(row))
        return self

    def delete(self):
        self._deleted = True
        return self

    def execute(self):
        if self._deleted:
            self._db[self._table] = []
            self.data = []
        else:
            self.data = list(self._db.get(self._table, []))
        return self


class FakeSupabase:
    def __init__(self):
        self.db = {}

    def table(self, name):
        return FakeQuery(self.db, name, self.db.get(name, []))


def _user():
    return SimpleNamespace(id="user-1")


def run(coro):
    return asyncio.run(coro)


def make_token(monkeypatch, resp=None, exc=None):
    fake = FakeSupabase()
    monkeypatch.setattr(
        gt, "supabase", fake, raising=False
    )
    monkeypatch.setattr(
        gt.httpx,
        "AsyncClient",
        lambda **kwargs: FakeAsyncClient(resp=resp, exc=exc),
        raising=False,
    )
    return fake


def test_save_validates_and_stores_without_returning_secret(monkeypatch):
    fake = make_token(
        monkeypatch,
        resp=FakeGitHubResp(200, {"login": "octocat"}, scopes="repo"),
    )
    out = run(save_github_token(TokenIn(token="ghp_secretvalue"), _user()))
    assert out == {"github_login": "octocat", "last4": "alue", "scopes": "repo"}
    rows = fake.db["user_github_tokens"]
    assert len(rows) == 1
    # full token must not be stored or returned in plaintext anywhere
    assert "ghp_secretvalue" not in str(out)
    assert rows[0]["token_last4"] == "alue"
    # decrypt round-trips back to the original (via real crypto helpers)
    token, login = get_stored_token("user-1")
    assert token == "ghp_secretvalue"
    assert login == "octocat"


def test_save_rejected_token_is_400_with_scope_hint(monkeypatch):
    make_token(monkeypatch, resp=FakeGitHubResp(401, {"message": "Bad"}))
    with pytest.raises(HTTPException) as excinfo:
        run(save_github_token(TokenIn(token="ghp_bad"), _user()))
    assert excinfo.value.status_code == 400
    assert "repo" in excinfo.value.detail
    assert "github.com/settings/tokens" in excinfo.value.detail


def test_save_empty_token_is_400(monkeypatch):
    make_token(monkeypatch, resp=FakeGitHubResp(200, {"login": "x"}))
    with pytest.raises(HTTPException) as excinfo:
        run(save_github_token(TokenIn(token="   "), _user()))
    assert excinfo.value.status_code == 400


def test_save_github_unreachable_is_502(monkeypatch):
    import httpx

    make_token(monkeypatch, exc=httpx.ConnectError("down"))
    with pytest.raises(HTTPException) as excinfo:
        run(save_github_token(TokenIn(token="ghp_x"), _user()))
    assert excinfo.value.status_code == 502


def test_status_disconnected_and_connected(monkeypatch):
    fake = make_token(monkeypatch)
    assert run(github_token_status(_user())) == {"connected": False}
    fake.db["user_github_tokens"] = [
        {
            "user_id": "user-1",
            "encrypted_token": "cipher",
            "token_last4": "1234",
            "scopes": "repo",
            "github_login": "octocat",
            "created_at": "2026-10-15T00:00:00",
        }
    ]
    out = run(github_token_status(_user()))
    assert out["connected"] is True
    assert out["github_login"] == "octocat"
    assert out["last4"] == "1234"
    assert "token" not in "".join(out.keys()).replace("token_", "X")
    assert "encrypted" not in str(out)


def test_delete_removes_row(monkeypatch):
    fake = make_token(monkeypatch)
    fake.db["user_github_tokens"] = [{"user_id": "user-1"}]
    assert run(delete_github_token(_user())) == {"connected": False}
    assert fake.db["user_github_tokens"] == []


def test_get_stored_token_empty_when_disconnected(monkeypatch):
    make_token(monkeypatch)
    assert get_stored_token("user-1") == ("", "")
