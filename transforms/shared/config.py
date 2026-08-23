"""Loads ~/.maltego-mcp/config.toml plus env vars. Never logs secret values."""

from __future__ import annotations

import logging
import os
import sys
from urllib.parse import urlsplit
from dataclasses import dataclass
from pathlib import Path

if sys.version_info >= (3, 11):
    import tomllib
else:  # pragma: no cover - we pin >=3.11
    import tomli as tomllib

log = logging.getLogger("transforms.config")


class ConfigError(RuntimeError):
    """Raised when config.toml is missing or required env var is unset."""


def default_config_dir() -> Path:
    """Resolve the platform default config dir.

    Windows: %APPDATA%/maltego-mcp
    POSIX:   ~/.maltego-mcp
    """
    if os.name == "nt":
        appdata = os.environ.get("APPDATA")
        if not appdata:
            raise ConfigError("APPDATA env var is unset on Windows")
        return Path(appdata) / "maltego-mcp"
    return Path.home() / ".maltego-mcp"


def _config_dir() -> Path:
    override = os.environ.get("MALTEGO_MCP_CONFIG_DIR")
    return Path(override) if override else default_config_dir()


@dataclass(frozen=True)
class BackendConfig:
    """One backend block (misp/thehive/cortex). api_key is read lazily from env."""

    url: str
    api_key_env: str
    verify_ssl: bool = True
    ca_bundle: str | None = None

    @property
    def api_key(self) -> str:
        value = os.environ.get(self.api_key_env)
        if not value:
            raise ConfigError(
                f"environment variable {self.api_key_env} is not set; "
                f"required to authenticate to {self.url}"
            )
        return value


@dataclass(frozen=True)
class Config:
    misp: BackendConfig
    thehive: BackendConfig
    cortex: BackendConfig
    network_timeout_s: int
    network_max_response_bytes: int
    cortex_allowed_analyzers: frozenset[str]
    cortex_max_analyzers_per_run: int

    @classmethod
    def from_toml(cls, path: Path) -> Config:
        with path.open("rb") as fh:
            data = tomllib.load(fh)
        def backend(name: str, env_name: str) -> BackendConfig:
            block = data[name]
            if "api_key_env" in block:
                raise ConfigError(f"{name}.api_key_env is unsupported; credentials use fixed environment names")
            url = str(block["url"]).rstrip("/")
            parsed = urlsplit(url)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise ConfigError(f"{name}.url must be an HTTPS origin without userinfo")
            approved = os.environ.get(f"MALTEGO_MCP_{name.upper()}_ORIGIN")
            if not approved or approved.rstrip("/") != url:
                raise ConfigError(f"{name}.url is not bound by its protected MALTEGO_MCP_{name.upper()}_ORIGIN policy")
            verify_ssl = bool(block.get("verify_ssl", True))
            if not verify_ssl and os.environ.get("MALTEGO_MCP_ALLOW_INSECURE_TLS") != "1":
                raise ConfigError(f"{name}.verify_ssl=false requires MALTEGO_MCP_ALLOW_INSECURE_TLS=1")
            if not verify_ssl:
                log.warning("TLS certificate verification disabled by explicit break-glass gate for %s", name)
            ca_bundle = block.get("ca_bundle")
            if ca_bundle is not None and not isinstance(ca_bundle, str):
                raise ConfigError(f"{name}.ca_bundle must be a path")
            return BackendConfig(url=url, api_key_env=env_name, verify_ssl=verify_ssl, ca_bundle=ca_bundle)
        misp = backend("misp", "MISP_API_KEY")
        thehive = backend("thehive", "THEHIVE_API_KEY")
        cortex = backend("cortex", "CORTEX_API_KEY")
        timeout = int(data.get("network", {}).get("timeout_s", 30))
        max_response = int(data.get("network", {}).get("max_response_bytes", 1_000_000))
        if timeout <= 0 or max_response <= 0:
            raise ConfigError("network limits must be positive")
        allowed = data["cortex"].get("allowed_analyzers", [])
        if not isinstance(allowed, list) or not all(isinstance(value, str) and value for value in allowed):
            raise ConfigError("cortex.allowed_analyzers must be a list of analyzer IDs")
        max_analyzers = int(data["cortex"].get("max_analyzers_per_run", 0))
        if max_analyzers < 0:
            raise ConfigError("cortex.max_analyzers_per_run must be non-negative")
        log.debug("loaded config from %s (network.timeout_s=%d)", path, timeout)
        return cls(misp=misp, thehive=thehive, cortex=cortex, network_timeout_s=timeout, network_max_response_bytes=max_response, cortex_allowed_analyzers=frozenset(allowed), cortex_max_analyzers_per_run=max_analyzers)


def load_config() -> Config:
    cfg_path = _config_dir() / "config.toml"
    if not cfg_path.exists():
        raise ConfigError(
            f"config.toml not found at {cfg_path}; "
            f"see transforms/README.md for setup instructions"
        )
    return Config.from_toml(cfg_path)
