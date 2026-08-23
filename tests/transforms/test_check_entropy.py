"""Build-time entropy scan refuses to ship a .mtz containing likely secrets."""

from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

from scripts.check_entropy import EntropyError, scan_zip


def _make_zip(path: Path, entries: dict[str, str]) -> None:
    with zipfile.ZipFile(path, "w") as zf:
        for name, content in entries.items():
            zf.writestr(name, content)


def test_clean_zip_passes(tmp_path: Path) -> None:
    z = tmp_path / "clean.mtz"
    _make_zip(z, {"Servers/Local.tas": "<MaltegoServer name='Local'/>"})
    scan_zip(z)


def test_high_entropy_string_blocks_build(tmp_path: Path) -> None:
    z = tmp_path / "leaky.mtz"
    secret = "AKIAIOSFODNN7EXAMPLE0K1q3vJALrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"  # content-guard: allow secret/api-key-assignment
    _make_zip(z, {"TransformRepositories/Local/x.transform": f"<x key='{secret}'/>"})
    with pytest.raises(EntropyError, match="entropy"):
        scan_zip(z)


def test_entropy_error_never_echoes_the_candidate(tmp_path: Path) -> None:
    z = tmp_path / "leaky.mtz"
    secret = "Aa7qZ9mK2pLs8Vx4Nc1Rd6Tw0Yh3Jf5Bu7Ge9Qi2Ok6Ml4Za"  # content-guard: allow secret/api-key-assignment
    _make_zip(z, {"TransformRepositories/Local/x.transform": f"<x key='{secret}'/>"})
    with pytest.raises(EntropyError) as exc:
        scan_zip(z)
    message = str(exc.value)
    assert "TransformRepositories/Local/x.transform" in message
    assert "offset=" in message
    assert secret not in message
    assert not any(secret[i:i + 4] in message for i in range(len(secret) - 3))


def test_force_env_var_overrides(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    z = tmp_path / "leaky.mtz"
    secret = "AKIAIOSFODNN7EXAMPLE0K1q3vJALrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"  # content-guard: allow secret/api-key-assignment
    _make_zip(z, {"TransformRepositories/Local/x.transform": f"<x key='{secret}'/>"})
    monkeypatch.setenv("MALTEGO_MCP_BUILD_FORCE", "1")
    scan_zip(z)
