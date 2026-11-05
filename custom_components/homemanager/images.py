"""Authenticated immutable plan images, included in HA .storage backups."""
from __future__ import annotations
import base64
import hashlib
import re
import struct
import zlib
from datetime import datetime, timedelta
import logging
from typing import Any
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from .errors import ModelError
from .const import MAX_PLAN_BYTES, STORAGE_VERSION
from .svg import validate_svg
from .storage_policy import check_quota, encoded_size

PREFIX = "homemanager.images."
MAX_IMAGES = 48
# An image not yet referenced by a saved plan may belong to a draft still being
# edited (another tab, a recovery copy): it is kept for this long before cleanup.
UNSAVED_GRACE = timedelta(days=2)
_LOGGER = logging.getLogger(__name__)

def image_data(raw: Any) -> dict:
    if not isinstance(raw, dict) or set(raw) != {"format", "content"} or raw["format"] not in ("svg", "png", "jpg") or not isinstance(raw["content"], str):
        raise ModelError("invalid_image", "invalid image")
    if len(raw["content"]) > 1400000:
        raise ModelError("plan_too_large", "each image must fit 1 MiB")
    try:
        data = base64.b64decode(raw["content"], validate=True)
    except (ValueError, TypeError) as error:
        raise ModelError("invalid_image", "invalid image encoding") from error
    if not data or len(data) > MAX_PLAN_BYTES:
        raise ModelError("plan_too_large", "each image must fit 1 MiB")
    fmt = raw["format"]
    if fmt == "svg":
        try:
            source = data.decode("utf-8")
            validate_svg(source)
        except (UnicodeError, ModelError) as error:
            raise ModelError("unsafe_plan", "use a static SVG without active content") from error
    elif fmt == "png":
        if len(data) < 33 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
            raise ModelError("invalid_image", "invalid PNG")
        width, height = struct.unpack(">II", data[16:24])
        if not 0 < width <= 16384 or not 0 < height <= 16384 or width * height > 40_000_000:
            raise ModelError("invalid_image", "image dimensions exceed limits")
        offset, ended = 8, False
        while offset + 12 <= len(data):
            count = struct.unpack(">I", data[offset:offset+4])[0]
            end = offset + 12 + count
            if end > len(data) or zlib.crc32(data[offset+4:end-4]) & 0xffffffff != struct.unpack(">I", data[end-4:end])[0]:
                raise ModelError("invalid_image", "invalid PNG chunk")
            kind = data[offset+4:offset+8]
            if kind == b"acTL":
                raise ModelError("invalid_image", "animated images are not supported")
            offset = end
            if kind == b"IEND":
                ended = True
                break
        if not ended or offset != len(data):
            raise ModelError("invalid_image", "incomplete PNG")
    else:
        if not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
            raise ModelError("invalid_image", "invalid JPEG")
        # Inspect a bounded SOF marker without decoding or executing image content.
        pos, dimensions = 2, None
        while pos + 4 < len(data):
            if data[pos] != 255:
                break
            marker = data[pos+1]
            pos += 2
            if marker in (0xd8, 0xd9) or 0xd0 <= marker <= 0xd7:
                continue
            length = int.from_bytes(data[pos:pos+2], "big")
            if length < 2 or pos + length > len(data):
                break
            if marker in (0xc0, 0xc1, 0xc2) and length >= 8:
                dimensions = (int.from_bytes(data[pos+3:pos+5], "big"), int.from_bytes(data[pos+5:pos+7], "big"))
                break
            pos += length
        if not dimensions or not all(0 < n <= 16384 for n in dimensions) or dimensions[0] * dimensions[1] > 40_000_000:
            raise ModelError("invalid_image", "unsupported JPEG dimensions")
    return {"format": fmt, "content": base64.b64encode(data).decode(), "sha256": hashlib.sha256(data).hexdigest()}

def scope_key(scope: str) -> str:
    if not isinstance(scope, str) or len(scope) > 64 or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", scope):
        raise ModelError("invalid_image", "invalid image scope")
    return PREFIX + scope

def _cache(store) -> dict:
    # Per-scope copy of the stored images, so each image/get does not reread the whole file.
    if not hasattr(store, "_image_cache"):
        store._image_cache = {}
    return store._image_cache

async def read_images(store, scope: str) -> dict:
    key = scope_key(scope)
    cache = _cache(store)
    if key in cache:
        return cache[key]
    data = await Store(store.hass, STORAGE_VERSION, key, atomic_writes=True).async_load() or {"images": {}}
    if not isinstance(data, dict) or not isinstance(data.get("images"), dict):
        raise ModelError("storage_error", "image storage is unreadable")
    cache[key] = data["images"]
    return data["images"]

def referenced_images(configurations) -> dict[str, set[str]]:
    """Every image a saved plan still shows, by scope."""
    used: dict[str, set[str]] = {}
    for configuration in configurations:
        views = configuration.get("planViews") if isinstance(configuration, dict) else None
        for view in views if isinstance(views, list) else []:
            for mode in ("light", "dark"):
                image = view.get(mode) if isinstance(view, dict) else None
                if isinstance(image, dict) and isinstance(image.get("scope"), str) and isinstance(image.get("sha256"), str):
                    used.setdefault(image["scope"], set()).add(image["sha256"])
    return used

def _recent(raw: Any, now: datetime) -> bool:
    # Only an image no saved plan has shown yet gets the grace: one that a plan
    # used and then replaced goes at once.
    if not isinstance(raw, dict) or raw.get("saved"):
        return False
    added = raw.get("added_at")
    parsed = dt_util.parse_datetime(added) if isinstance(added, str) else None
    return parsed is not None and now - parsed < UNSAVED_GRACE

async def prune_images(store, configurations, now: datetime | None = None) -> int:
    """Removes images no saved plan uses, past the grace period. Called under store._lock.
    Never touches an image a current plan references; an emptied scope loses its file."""
    now = now or dt_util.utcnow()
    used = referenced_images(configurations)
    removed = 0
    for key in [key for key in store._sizes if key.startswith(PREFIX)]:
        scope = key.removeprefix(PREFIX)
        try:
            images = await read_images(store, scope)
        except ModelError:
            continue
        shown = used.get(scope, set())
        keep = {
            sha: {**raw, "saved": True} if sha in shown and isinstance(raw, dict) and not raw.get("saved") else raw
            for sha, raw in images.items()
            if sha in shown or _recent(raw, now)
        }
        if keep == images:
            continue
        disk = Store(store.hass, STORAGE_VERSION, key, atomic_writes=True)
        try:
            if keep:
                data = {"images": keep}
                await disk.async_save(data)
                store._sizes[key] = encoded_size(data)
            else:
                await disk.async_remove()
                store._sizes.pop(key, None)
        except Exception:
            _LOGGER.warning("HomeManager could not remove unused plan images; they stay until the next save")
            _cache(store).pop(key, None)
            continue
        _cache(store)[key] = keep
        removed += len(images) - len(keep)
    return removed

async def put_image(store, scope: str, raw: Any) -> dict:
    image = image_data(raw)
    key = scope_key(scope)
    async with store._lock:
        images = await read_images(store, scope)
        if image["sha256"] in images:
            return image
        if len(images) >= MAX_IMAGES:
            raise ModelError("storage_quota", "plan images reached their limit of 48; remove unused plan alternatives and save the plan to free them")
        data = {"images": {**images, image["sha256"]: {**image, "added_at": dt_util.utcnow().isoformat()}}}
        sizes = await store._usage()
        sizes[key] = encoded_size(data)
        check_quota(sizes)
        try:
            await Store(store.hass, STORAGE_VERSION, key, atomic_writes=True).async_save(data)
        except Exception as error:
            _cache(store).pop(key, None)
            raise ModelError("storage_error", "image was not saved") from error
        _cache(store)[key] = data["images"]
        store._sizes = sizes
    return image

async def get_image(store, scope: str, sha: str) -> dict:
    if not isinstance(sha, str) or not re.fullmatch(r"[a-f0-9]{64}", sha):
        raise ModelError("invalid_image", "invalid image reference")
    raw = (await read_images(store, scope)).get(sha)
    if not isinstance(raw, dict):
        raise ModelError("image_not_found", "image is missing; restore the image backup")
    image = image_data({"format": raw.get("format"), "content": raw.get("content")})
    if image["sha256"] != sha:
        raise ModelError("storage_error", "image checksum mismatch")
    return image
