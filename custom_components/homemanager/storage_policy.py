"""Bound storage across active homes and retained, deleted-home histories."""

from pathlib import Path
import json
import re
from typing import Any

from .const import MAX_PLAN_STORES, MAX_TOTAL_STORAGE_BYTES, PLAN_STORAGE_KEY_PREFIX, STORAGE_KEY, STORAGE_MINOR_VERSION, STORAGE_VERSION
from .errors import ModelError

SAFE_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")


def encoded_size(data: Any) -> int:
    # HA stores an envelope with two-space indentation. Compact JSON plus a
    # constant reserve undercounts large, deeply nested documents. Include the
    # entire envelope at the longest permitted key, plus serialization headroom.
    envelope = {"version": STORAGE_VERSION, "minor_version": STORAGE_MINOR_VERSION, "key": PLAN_STORAGE_KEY_PREFIX + "x" * 64, "data": data}
    return len(json.dumps(envelope, ensure_ascii=False, indent=2).encode("utf-8")) + 1024


def disk_sizes(directory: Path) -> dict[str, int]:
    """Never follow symlinks or enumerate anything outside HA's storage folder."""
    sizes: dict[str, int] = {}
    if not directory.exists():
        return sizes
    for file in directory.iterdir():
        name = file.name
        prefix = "homemanager.images." if name.startswith("homemanager.images.") else PLAN_STORAGE_KEY_PREFIX
        home_id = name.removeprefix(prefix)
        if name != STORAGE_KEY and not (name.startswith((PLAN_STORAGE_KEY_PREFIX, "homemanager.images.")) and len(home_id) <= 64 and SAFE_ID.fullmatch(home_id)):
            continue
        if file.is_symlink() or not file.is_file():
            raise ModelError("storage_error", "HomeManager storage requires regular files")
        sizes[name] = file.stat().st_size
    return sizes


def check_quota(sizes: dict[str, int]) -> None:
    count = sum(key.startswith((PLAN_STORAGE_KEY_PREFIX, "homemanager.images.")) for key in sizes)
    if count > MAX_PLAN_STORES or sum(sizes.values()) > MAX_TOTAL_STORAGE_BYTES:
        # Say what fills it: plan images, or plans and their histories (#63).
        if image_bytes(sizes) * 2 > sum(sizes.values()):
            raise ModelError("storage_quota", "HomeManager storage quota reached: plan images use most of it; remove unused plan alternatives and save the plan")
        raise ModelError("storage_quota", "HomeManager storage quota reached; purge a retained deleted-home history or reduce the plan")


def image_bytes(sizes: dict[str, int]) -> int:
    return sum(size for key, size in sizes.items() if key.startswith("homemanager.images."))
