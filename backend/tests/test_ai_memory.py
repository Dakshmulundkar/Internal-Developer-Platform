"""Tasks 57/58 — chat memory threading + remediation generation. No LLM calls."""

import asyncio


class FakeTable:
    def __init__(self, rows=None):
        self._rows = rows or []
        self._single = False
        self.inserted: list = []

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def single(self):
        self._single = True
        return self

    def limit(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def insert(self, row):
        self.inserted.append(row)
        return self

    def execute(self):
        if self.inserted and not self._rows:
            return type("R", (), {"data": [{**self.inserted[-1]}]})()
        data = self._rows[0] if (self._single and self._rows) else self._rows
        return type("R", (), {"data": data})()


def run(coro):
    return asyncio.run(coro)


TURNS = [
    {"role": "user", "content": "Why did it fail?"},
    {"role": "assistant", "content": "Missing env var."},
]


def test_history_roundtrip_and_cap(monkeypatch):
    import services.ai_service as ai

    tables = {}

    def table(name):
        tables.setdefault(name, FakeTable([]))
        return tables[name]

    # Seed two stored turns.
    tables["ai_chat_messages"] = FakeTable(
        [{"role": "user", "content": "Why did it fail?"},
         {"role": "assistant", "content": "Missing env var."}])

    monkeypatch.setattr(ai.supabase, "table", table)
    monkeypatch.setattr(ai, "is_valid_uuid", lambda v: True)

    out = run(ai.get_history("inc-1"))
    assert out == TURNS

    run(ai.save_turn("inc-1", "user", "And the fix?"))
    run(ai.save_turn("inc-1", "assistant", "Set it and redeploy."))
    run(ai.save_turn("inc-1", "hacker', 'x'); DROP TABLE ai_chat_messages; --", "x"))
    assert tables["ai_chat_messages"].inserted[0] == {
        "incident_id": "inc-1", "role": "user", "content": "And the fix?"}
    # Invalid roles and empty content are dropped, never stored.
    assert len(tables["ai_chat_messages"].inserted) == 2


def test_history_missing_table_is_empty_not_fatal(monkeypatch):
    import services.ai_service as ai

    def boom(name):
        raise RuntimeError("relation does not exist")

    monkeypatch.setattr(ai.supabase, "table", boom)
    monkeypatch.setattr(ai, "is_valid_uuid", lambda v: True)
    assert run(ai.get_history("inc-1")) == []
    # save_turn must not raise either
    run(ai.save_turn("inc-1", "user", "hello"))


def test_history_threaded_into_llm_messages(monkeypatch):
    import httpx
    import services.ai_service as ai
    from config import settings

    sent = {}

    class FakeResp:
        status_code = 200

        def json(self):
            return {"choices": [{"message": {"content":
                '{"explanation": "ok", "confidence": 90, "causes": [], "steps": []}'}}]}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            sent["messages"] = json["messages"]
            return FakeResp()

    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: FakeClient())
    monkeypatch.setattr(settings, "GROQ_API_KEY", "test-key", raising=False)
    history = [{"role": "user", "content": "Why did it fail?"},
               {"role": "assistant", "content": "Missing env var."}]
    out = run(ai.analyze_incident({"title": "T"}, history=history))
    roles = [m["role"] for m in sent["messages"]]
    # system + incident context + two history turns, in order
    assert roles == ["system", "user", "user", "assistant"]
    assert sent["messages"][-1]["content"] == "Missing env var."
    assert out["confidence"] == 90
