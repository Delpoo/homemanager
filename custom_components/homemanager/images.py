"""Authenticated immutable plan images, included in HA .storage backups."""
from __future__ import annotations
import base64
import hashlib
import re
import struct
import zlib
from typing import Any
from homeassistant.helpers.storage import Store
from .errors import ModelError
from .const import MAX_PLAN_BYTES, STORAGE_VERSION
from .svg import validate_svg
from .storage_policy import check_quota, encoded_size

PREFIX = "homemanager.images."

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

async def read_images(store, scope: str) -> dict:
    key = scope_key(scope)
    data = await Store(store.hass, STORAGE_VERSION, key, atomic_writes=True).async_load() or {"images": {}}
    if not isinstance(data, dict) or not isinstance(data.get("images"), dict):
        raise ModelError("storage_error", "image storage is unreadable")
    return data["images"]

async def put_image(store, scope: str, raw: Any) -> dict:
    image = image_data(raw)
    key = scope_key(scope)
    async with store._lock:
        images = await read_images(store, scope)
        if image["sha256"] in images:
            return image
        if len(images) >= 48:
            raise ModelError("storage_quota", "image collection reached its limit of 48 images")
        data = {"images": {**images, image["sha256"]: image}}
        sizes = await store._usage()
        sizes[key] = encoded_size(data)
        check_quota(sizes)
        try:
            await Store(store.hass, STORAGE_VERSION, key, atomic_writes=True).async_save(data)
        except Exception as error:
            raise ModelError("storage_error", "image was not saved") from error
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
