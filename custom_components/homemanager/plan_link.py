"""The drawing a person keeps as a file in Home Assistant's config folder.

Nothing watches the folder: an administrator's open panel asks now and then.
The file is only read here, by a fixed path built from a validated home ID. It
is never parsed or served: the frontend sanitizes it, and the normal save
validates the result like any other plan.
"""

from __future__ import annotations

from datetime import UTC, datetime
import hashlib
from pathlib import Path
import stat
from typing import Any

from .const import MAX_LINKED_PLAN_BYTES


def read_linked(path: Path, with_content: bool = False) -> dict[str, Any]:
    """Blocking. Says what is there; a bad file is a state, not an error."""
    try:
        if path.is_symlink():
            return {"state": "unreadable"}
        info = path.stat()
        if not stat.S_ISREG(info.st_mode):
            return {"state": "unreadable"}
        if info.st_size > MAX_LINKED_PLAN_BYTES:
            return {"state": "too_large", "bytes": info.st_size}
        raw = path.read_bytes()
    except FileNotFoundError:
        return {"state": "missing"}
    except OSError:
        return {"state": "unreadable"}
    if len(raw) > MAX_LINKED_PLAN_BYTES:
        return {"state": "too_large", "bytes": len(raw)}
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return {"state": "unreadable"}
    result: dict[str, Any] = {
        "state": "ready",
        "sha256": hashlib.sha256(raw).hexdigest(),
        "bytes": len(raw),
        "modified_at": datetime.fromtimestamp(info.st_mtime, UTC).isoformat(),
    }
    if with_content:
        result["content"] = text
    return result


def ensure_folder(path: Path) -> None:
    """Blocking. So the folder is there to find; failing to create it changes nothing else."""
    try:
        path.mkdir(exist_ok=True)
    except OSError:
        pass
