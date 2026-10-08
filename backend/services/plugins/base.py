"""Plugin adapter contract. Every integration implements test() + fetch().

test()  — verify credentials against the real vendor API. No fake success.
fetch() — pull data and return rows in the internal monitoring_alerts shape
          (source/title/description/severity/status/labels). Rows without a
          vendor API map to [] — the sync loop skips them.
"""

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class PluginCtx:
    plugin_id: str = ""
    token: str = ""              # decrypted API key (never log this)
    base_url: str = ""
    project_selector: str = ""
    config: dict[str, Any] = field(default_factory=dict)  # config_data extras
    installation_id: str | None = None


@dataclass
class TestResult:
    success: bool
    message: str


class BaseAdapter:
    """One adapter per plugin (or plugin family). Register in registry.py."""

    plugin_ids: tuple[str, ...] = ()

    async def test(self, ctx: PluginCtx) -> TestResult:
        raise NotImplementedError

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        return []

    async def send(self, ctx: PluginCtx, title: str, body: str) -> TestResult:
        """Deliver an outbound notification. Only collaboration plugins implement this."""
        return TestResult(False, f"Sending is not supported by {ctx.plugin_id or 'this plugin'}.")
