"""Bound storage across active homes and retained, deleted-home histories."""

from pathlib import Path
import json
import re
from typing import Any

from .const import MAX_PLAN_STORES, MAX_TOTAL_STORAGE_BYTES, PLAN_STORAGE_KEY_PREFIX, STORAGE_KEY
from .errors import ModelError

SAFE_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")


def encoded_size(data: Any) -> int:
    # Reserve space for HA's version/key metadata and JSON formatting.
    return len(json.dumps(data, ensure_ascii=False).encode("utf-8")) + 1024


def disk_sizes(directory: Path) -> dict[str, int]:
    """Never follow symlinks or enumerate anything outside HA's storage folder."""
    sizes: dict[str, int] = {}
    if not directory.exists():
        return sizes
    for file in directory.iterdir():
        name = file.name
        home_id = name.removeprefix(PLAN_STORAGE_KEY_PREFIX)
        if name != STORAGE_KEY and not (name.startswith(PLAN_STORAGE_KEY_PREFIX) and len(home_id) <= 64 and SAFE_ID.fullmatch(home_id)):
            continue
        if file.is_symlink() or not file.is_file():
            raise ModelError("storage_error", "HomeManager storage requires regular files")
        sizes[name] = file.stat().st_size
    return sizes


def check_quota(sizes: dict[str, int]) -> None:
    count = sum(key.startswith(PLAN_STORAGE_KEY_PREFIX) for key in sizes)
    if count > MAX_PLAN_STORES or sum(sizes.values()) > MAX_TOTAL_STORAGE_BYTES:
        raise ModelError("storage_quota", "HomeManager storage quota reached; purge a retained deleted-home history or reduce the plan")
