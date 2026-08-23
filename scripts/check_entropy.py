"""Refuse to build a .mtz that contains high-entropy strings (likely secrets).

Override with MALTEGO_MCP_BUILD_FORCE=1 (use sparingly; intended for the rare
case where a long structured ID looks like a secret to the heuristic).
"""

from __future__ import annotations

import math
import os
import re
import hashlib
import zipfile
from pathlib import Path

ENTROPY_THRESHOLD = 4.5
MIN_TOKEN_LEN = 30
TOKEN_RE = re.compile(r"[A-Za-z0-9+/=_-]{%d,}" % MIN_TOKEN_LEN)


class EntropyError(RuntimeError):
    pass


def shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    freqs: dict[str, int] = {}
    for ch in s:
        freqs[ch] = freqs.get(ch, 0) + 1
    n = len(s)
    return -sum((c / n) * math.log2(c / n) for c in freqs.values())


def _scan_text(name: str, text: str) -> list[str]:
    hits: list[str] = []
    for match in TOKEN_RE.finditer(text):
        token = match.group(0)
        if shannon_entropy(token) >= ENTROPY_THRESHOLD:
            digest = hashlib.sha256(token.encode("utf-8")).hexdigest()[:12]
            hits.append(f"{name}: offset={match.start()} len={len(token)} rule=high-entropy sha256={digest}")
    return hits


def scan_zip(path: Path) -> None:
    if os.environ.get("MALTEGO_MCP_BUILD_FORCE") == "1":
        return
    findings: list[str] = []
    with zipfile.ZipFile(path) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            with zf.open(info) as fh:
                blob = fh.read()
            try:
                text = blob.decode("utf-8")
            except UnicodeDecodeError:
                continue
            findings.extend(_scan_text(info.filename, text))
    if findings:
        raise EntropyError(
            "high-entropy strings found in build output (likely secrets):\n  "
            + "\n  ".join(findings)
            + "\nset MALTEGO_MCP_BUILD_FORCE=1 to override"
        )
