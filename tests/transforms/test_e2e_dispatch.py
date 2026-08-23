"""End-to-end: invoke `python project.py local mispeventpivot` with TRX XML on stdin."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PROJECT_PY = REPO_ROOT / "transforms" / "project.py"

# A minimal TRX request the maltego-trx handler accepts. Maltego's local
# transform protocol is much simpler than the TDS one: the LocalArgs include
# the value as the first positional, then key=value extras.
LOCAL_ARGS = ["1.2.3.4", ""]


@pytest.fixture
def venv_python() -> Path:
    if sys.platform == "win32":
        py = REPO_ROOT / "transforms" / ".venv" / "Scripts" / "python.exe"
    else:
        py = REPO_ROOT / "transforms" / ".venv" / "bin" / "python"
    if not py.exists():
        pytest.skip("transforms/.venv not bootstrapped; run npm run setup:transforms")
    return py


def test_dispatch_runs_named_transform(venv_python: Path, tmp_path: Path) -> None:
    """Run `project.py local mispeventpivot 1.2.3.4`. The transform will fail
    to reach the (non-existent) MISP backend, but that surfaces as a UIMessage
    rather than a Python crash; the goal here is to prove project.py routes
    the trailing arg correctly through maltego-trx's local handler.
    """
    cfg_dir = tmp_path / "maltego-mcp"
    cfg_dir.mkdir()
    (cfg_dir / "config.toml").write_text(
        '[misp]\nurl = "https://nope.invalid"\n'
        '[thehive]\nurl = "https://thehive.invalid"\n'
        '[cortex]\nurl = "https://cortex.invalid"\n'
        '[network]\ntimeout_s = 2\n'
    )
    env = {
        **os.environ,
        "MALTEGO_MCP_CONFIG_DIR": str(cfg_dir),
        "MISP_API_KEY": "k",
        "MALTEGO_MCP_MISP_ORIGIN": "https://nope.invalid",
        "MALTEGO_MCP_THEHIVE_ORIGIN": "https://thehive.invalid",
        "MALTEGO_MCP_CORTEX_ORIGIN": "https://cortex.invalid",
        "PYTHONPATH": str(REPO_ROOT),
    }

    proc = subprocess.run(
        [
            str(venv_python),
            str(PROJECT_PY),
            "local",
            "MispEventPivot",
            "1.2.3.4",
        ],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 0, f"stderr: {proc.stderr}\nstdout: {proc.stdout}"
    assert "<MaltegoMessage>" in proc.stdout
    assert "MaltegoTransformResponseMessage" in proc.stdout
