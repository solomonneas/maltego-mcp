"""Config loader: TOML parsing, env fallback, missing-key handling, never-log-secret."""

from __future__ import annotations

import logging
import os
from pathlib import Path

import pytest

from transforms.shared.config import (
    Config,
    ConfigError,
    load_config,
)


def test_loads_misp_thehive_cortex_blocks(fake_config: Path) -> None:
    cfg = load_config()
    assert isinstance(cfg, Config)
    assert cfg.misp.url == "https://misp.test"
    assert cfg.misp.api_key == "test-misp-key"
    assert cfg.misp.verify_ssl is True
    assert cfg.thehive.url == "https://thehive.test"
    assert cfg.thehive.api_key == "test-thehive-key"
    assert cfg.cortex.url == "https://cortex.test"
    assert cfg.cortex.api_key == "test-cortex-key"
    assert cfg.network_timeout_s == 5


def test_missing_env_var_raises_with_clear_message(
    fake_config: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("MISP_API_KEY", raising=False)
    cfg = load_config()
    with pytest.raises(ConfigError, match="MISP_API_KEY"):
        _ = cfg.misp.api_key


def test_missing_config_file_raises(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("MALTEGO_MCP_CONFIG_DIR", str(tmp_path / "nope"))
    with pytest.raises(ConfigError, match="config.toml"):
        load_config()


def test_never_logs_secret_value(
    fake_config: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="transforms")
    cfg = load_config()
    _ = cfg.misp.api_key
    rendered = "\n".join(rec.getMessage() for rec in caplog.records)
    assert "test-misp-key" not in rendered


def test_default_config_dir_resolution(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """When MALTEGO_MCP_CONFIG_DIR is unset, fall back to platform default."""
    monkeypatch.delenv("MALTEGO_MCP_CONFIG_DIR", raising=False)
    monkeypatch.setenv("APPDATA", str(tmp_path / "Roaming"))  # Windows path
    from transforms.shared.config import default_config_dir

    p = default_config_dir()
    if os.name == "nt":
        assert p.name == "maltego-mcp"
        assert "Roaming" in str(p)
    else:
        assert p.name == ".maltego-mcp"


def test_rejects_config_controlled_secret_name_and_insecure_origin(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    cfg = tmp_path / "config.toml"
    cfg.write_text('''
[misp]
url = "http://attacker.invalid"
api_key_env = "UNRELATED_SENTINEL"
[thehive]
url = "https://thehive.test"
[cortex]
url = "https://cortex.test"
''')
    monkeypatch.setenv("UNRELATED_SENTINEL", "must-not-leak")
    with pytest.raises(ConfigError):
        Config.from_toml(cfg)


def test_rejects_verify_ssl_false_without_breakglass(tmp_path: Path) -> None:
    cfg = tmp_path / "config.toml"
    cfg.write_text('''
[misp]
url = "https://misp.test"
verify_ssl = false
[thehive]
url = "https://thehive.test"
[cortex]
url = "https://cortex.test"
''')
    import os
    os.environ["MALTEGO_MCP_MISP_ORIGIN"] = "https://misp.test"
    os.environ["MALTEGO_MCP_THEHIVE_ORIGIN"] = "https://thehive.test"
    os.environ["MALTEGO_MCP_CORTEX_ORIGIN"] = "https://cortex.test"
    with pytest.raises(ConfigError, match="verify_ssl"):
        Config.from_toml(cfg)
