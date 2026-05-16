"""Atomic JSON file writes.

Any crash mid-write of a multi-hundred-KB JSON file used to leave the target
in an invalid state — next load raised JSONDecodeError and the scraper lost
its sync / resume state. This helper writes to a sibling `.tmp` file then
uses os.replace() which is atomic on the same filesystem.

Usage:
    from scraper._atomic import atomic_write_json
    atomic_write_json(Path("data/x_sync_state.json"), state_dict)
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def atomic_write_json(path: Path, obj: Any, *, ensure_ascii: bool = False,
                      indent: int = 2, newline_at_end: bool = True) -> None:
    """Write obj as JSON to `path` atomically.

    On success, `path` either shows the old bytes or the new bytes — never
    partial. On failure (disk full, SIGKILL, power loss), the old file is
    untouched and the `.tmp` sibling may be left behind for manual cleanup.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    payload = json.dumps(obj, ensure_ascii=ensure_ascii, indent=indent)
    if newline_at_end:
        payload += "\n"
    tmp.write_text(payload, encoding="utf-8")
    os.replace(tmp, path)


def atomic_write_text(path: Path, text: str) -> None:
    """Atomic plain-text variant (for logs, non-JSON state)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)
