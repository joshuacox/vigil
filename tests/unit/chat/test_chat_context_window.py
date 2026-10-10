"""Chat carries the resolved model's window to the agent layer (#2123).

The fold ceiling is flat unless the config names the model's window, so the
turn chat resolved must say what window it resolved to — from the gateway
catalogue, and only when the catalogue knows the model.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
import yaml

from core.agents import prompts
from services.api.routers import claude

pytestmark = pytest.mark.unit


class _Registry:
    """Stands in for the gateway catalogue behind ModelRegistry."""

    window = None
    failure = None

    @staticmethod
    def get_model_info(provider_id, provider_type, model_id):
        if _Registry.failure is not None:
            raise _Registry.failure
        return SimpleNamespace(context_window=_Registry.window)


@pytest.fixture
def turn(monkeypatch, tmp_path):
    """Run one chat turn; returns the payload the relay saw."""
    monkeypatch.setattr(prompts, "skill_roots", lambda *_: [tmp_path])
    monkeypatch.setattr(claude, "live_mcp_tools", lambda _registry: [])
    monkeypatch.setattr(
        claude, "provider_for", lambda _p: SimpleNamespace(provider_type="ollama")
    )
    monkeypatch.setattr(claude, "model_for", lambda _p, model: model)
    monkeypatch.setattr(
        claude,
        "_resolve_provider_model_for_request",
        lambda *_: ("ollama-local", "small-model"),
    )
    monkeypatch.setattr(claude, "ModelRegistry", _Registry)
    _Registry.window = None
    _Registry.failure = None

    async def run():
        sent: dict = {}

        async def _relay(payload, *_args):
            sent.update(payload)
            yield ""

        monkeypatch.setattr(claude, "_relay", _relay)
        response = await claude.chat_stream(
            claude.ChatRequest(messages=[{"role": "user", "content": "hi"}]),
            current_user=SimpleNamespace(username="nestor", user_id="u-1"),
            registry=MagicMock(),
            workflows=MagicMock(),
        )
        async for _ in response.body_iterator:
            pass
        return sent

    return run


@pytest.mark.asyncio
async def test_chat_config_carries_the_catalogues_window(turn):
    _Registry.window = 16384
    sent = await turn()
    assert yaml.safe_load(sent["config"])["context_window"] == 16384


@pytest.mark.asyncio
async def test_chat_config_omits_a_window_the_catalogue_does_not_know(turn):
    # A model the catalogue has no entry for reports a window of 0: unknown,
    # so no key — the agent layer keeps its flat ceiling.
    _Registry.window = 0
    sent = await turn()
    assert "context_window" not in yaml.safe_load(sent["config"])


@pytest.mark.asyncio
async def test_chat_config_omits_the_window_when_the_lookup_fails(turn):
    _Registry.failure = RuntimeError("gateway unreachable")
    sent = await turn()
    assert "context_window" not in yaml.safe_load(sent["config"])
