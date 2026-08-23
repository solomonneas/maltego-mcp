"""Shared pytest fixtures for transforms/."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import responses


@pytest.fixture
def fake_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Write a config.toml under tmp_path and point MALTEGO_MCP_CONFIG_DIR at it."""
    cfg_dir = tmp_path / "maltego-mcp"
    cfg_dir.mkdir()
    cfg_path = cfg_dir / "config.toml"
    cfg_path.write_text(
        """
[misp]
url = "https://misp.test"

[thehive]
url = "https://thehive.test"

[cortex]
url = "https://cortex.test"
allowed_analyzers = ["VirusTotal_GetReport_3_1", "AbuseIPDB_1_0"]
max_analyzers_per_run = 2

[network]
timeout_s = 5
""".strip()
    )
    monkeypatch.setenv("MALTEGO_MCP_CONFIG_DIR", str(cfg_dir))
    monkeypatch.setenv("MISP_API_KEY", "test-misp-key")
    monkeypatch.setenv("THEHIVE_API_KEY", "test-thehive-key")
    monkeypatch.setenv("CORTEX_API_KEY", "test-cortex-key")
    monkeypatch.setenv("MALTEGO_MCP_MISP_ORIGIN", "https://misp.test")
    monkeypatch.setenv("MALTEGO_MCP_THEHIVE_ORIGIN", "https://thehive.test")
    monkeypatch.setenv("MALTEGO_MCP_CORTEX_ORIGIN", "https://cortex.test")
    monkeypatch.setenv("MALTEGO_MCP_CORTEX_RUN_CAPABILITY", "test-capability")
    yield cfg_path


@pytest.fixture
def mocked_responses() -> Iterator[responses.RequestsMock]:
    with responses.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        yield rsps
