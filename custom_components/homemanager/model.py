"""Pure storage model: envelope validation and revision checks.

No Home Assistant imports, so the rules are testable in isolation. The
frontend performs the full semantic validation and SVG sanitization (see
src/ha/validation.mjs and src/card/geometry.ts) before saving and again before
rendering; this module is the server-side boundary for shape, size and
concurrency. Only administrators can write (enforced by the websocket layer).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
import hashlib
import json
import re
from typing import Any

from .const import (
    MAX_CONFIGURATION_BYTES,
    MAX_HOMES,
    MAX_PLAN_BYTES,
    MAX_PLAN_HISTORY,
    MAX_TITLE_LENGTH,
    SCHEMA_VERSION,
)

HOME_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
UNSAFE_KEYS = frozenset({"__proto__", "prototype", "constructor"})
REQUIRED_KEYS = frozenset({"schemaVersion", "rooms", "catalog", "architecture", "actions", "panels", "stateSources"})
OPTIONAL_KEYS = frozenset({"commandTtlSeconds"})
MAX_DEPTH = 32
# Defence in depth. Every client sanitizes the plan with an explicit allowlist
# before saving AND before rendering (src/card/geometry.ts); the server refuses
# content that no sanitized plan can contain, so a crafted websocket call cannot
# park active content in storage for other viewers.
UNSAFE_PLAN = re.compile(
    r"<\s*(?:script|foreignobject|iframe|object|embed|image|a|animate|set|handler|listener)\b"
    r"|<!(?:doctype|entity)"
    r"|\son[a-z]+\s*="
    r"|=\s*[\"'][^\"']*\b(?:javascript|vbscript|data|file|blob|https?)\s*:"
    r"|url\s*\(\s*['\"]?\s*(?!#)"
    r"|@import",
    re.IGNORECASE,
)


class ModelError(Exception):
    """A request that must be rejected. `code` is a stable websocket error code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class RevisionConflict(ModelError):
    """The stored revision differs from the one the editor loaded."""

    def __init__(self, current: int | None) -> None:
        super().__init__("revision_conflict", f"Stored revision is {current}")
        self.current = current


def validate_home_id(home_id: Any) -> str:
    if not isinstance(home_id, str) or len(home_id) > 64 or not HOME_ID.match(home_id) or home_id in UNSAFE_KEYS:
        raise ModelError("invalid_home_id", "home_id must be kebab-case, at most 64 characters")
    return home_id


def validate_title(title: Any) -> str | None:
    if title is None:
        return None
    if not isinstance(title, str) or not title.strip() or len(title) > MAX_TITLE_LENGTH or any(ord(c) < 32 for c in title):
        raise ModelError("invalid_title", "title must be plain text")
    return title.strip()


def _check_json(value: Any, depth: int = 0) -> None:
    if depth > MAX_DEPTH:
        raise ModelError("invalid_configuration", "configuration is nested too deeply")
    if value is None or isinstance(value, (bool, str)):
        return
    if isinstance(value, (int, float)):
        if isinstance(value, float) and value != value or value in (float("inf"), float("-inf")):
            raise ModelError("invalid_configuration", "non-finite number")
        return
    if isinstance(value, list):
        for item in value:
            _check_json(item, depth + 1)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str) or key in UNSAFE_KEYS:
                raise ModelError("invalid_configuration", "unsafe object key")
            _check_json(item, depth + 1)
        return
    raise ModelError("invalid_configuration", "configuration must be JSON data")


def validate_configuration(configuration: Any) -> dict[str, Any]:
    """Validate the persistent envelope. Returns the configuration unchanged."""
    if not isinstance(configuration, dict):
        raise ModelError("invalid_configuration", "configuration must be an object")
    _check_json(configuration)
    keys = set(configuration)
    if not REQUIRED_KEYS <= keys or keys - REQUIRED_KEYS - OPTIONAL_KEYS:
        raise ModelError("invalid_configuration", "configuration fields are missing or unexpected")
    if configuration["schemaVersion"] != SCHEMA_VERSION:
        raise ModelError("unsupported_schema", f"schemaVersion {SCHEMA_VERSION} required; migrate in the editor first")
    if not isinstance(configuration["rooms"], list) or not isinstance(configuration["catalog"], dict):
        raise ModelError("invalid_configuration", "rooms must be a list and catalog an object")
    for name in ("actions", "panels", "stateSources"):
        if not isinstance(configuration[name], dict):
            raise ModelError("invalid_configuration", f"{name} must be an object")
    architecture = configuration["architecture"]
    if not isinstance(architecture, dict) or set(architecture) != {"format", "content"} or architecture["format"] != "svg" or not isinstance(architecture["content"], str):
        raise ModelError("invalid_configuration", "architecture must be {format: 'svg', content}")
    if len(architecture["content"].encode("utf-8")) > MAX_PLAN_BYTES:
        raise ModelError("plan_too_large", "the plan exceeds 1 MiB")
    # Namespace declarations are the only URLs a sanitized plan carries.
    scanned = re.sub(r"\sxmlns(?::[\w.-]+)?\s*=\s*\"[^\"]*\"", "", architecture["content"])
    if not scanned.lstrip().startswith("<svg") or UNSAFE_PLAN.search(scanned):
        raise ModelError("unsafe_plan", "the plan must be a sanitized SVG (save it from the HomeManager editor)")
    if len(json.dumps(configuration, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) > MAX_CONFIGURATION_BYTES:
        raise ModelError("configuration_too_large", "the configuration exceeds 3 MiB")
    return configuration


def plan_digest(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


@dataclass
class Home:
    """One dwelling: its current configuration and revision metadata."""

    home_id: str
    title: str | None
    revision: int
    updated_at: str
    updated_by: str | None
    configuration: dict[str, Any]

    def summary(self) -> dict[str, Any]:
        configuration = self.configuration
        return {
            "home_id": self.home_id,
            "title": self.title,
            "revision": self.revision,
            "updated_at": self.updated_at,
            "plan_sha256": plan_digest(configuration["architecture"]["content"]),
            "rooms": len(configuration["rooms"]),
            "devices": len(configuration["catalog"].get("devices", [])),
        }

    def as_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "revision": self.revision,
            "updated_at": self.updated_at,
            "updated_by": self.updated_by,
            "configuration": self.configuration,
        }

    @classmethod
    def from_dict(cls, home_id: str, data: dict[str, Any]) -> Home:
        return cls(home_id, data.get("title"), int(data["revision"]), data["updated_at"], data.get("updated_by"), data["configuration"])


@dataclass
class PlanVersion:
    """A previous or current plan, kept for restoring after a bad replacement."""

    plan_id: str
    sha256: str
    created_at: str
    created_by: str | None
    revision: int
    content: str

    def summary(self) -> dict[str, Any]:
        return {
            "plan_id": self.plan_id,
            "sha256": self.sha256,
            "bytes": len(self.content.encode("utf-8")),
            "created_at": self.created_at,
            "created_by": self.created_by,
            "revision": self.revision,
        }


@dataclass
class Homes:
    """In-memory state. Every mutation is synchronous: called from the event loop,
    the revision check and the update cannot interleave with another request,
    which makes the save a compare-and-swap without locks."""

    homes: dict[str, Home] = field(default_factory=dict)

    def get(self, home_id: str) -> Home:
        home = self.homes.get(validate_home_id(home_id))
        if home is None:
            raise ModelError("home_not_found", "unknown home")
        return home

    def save(self, home_id: str, expected_revision: int | None, configuration: Any, title: Any, user_id: str | None, now: datetime) -> tuple[Home, bool]:
        """Create (expected_revision None) or replace. Returns the home and whether the plan changed."""
        validate_home_id(home_id)
        clean_title = validate_title(title)
        clean = validate_configuration(configuration)
        current = self.homes.get(home_id)
        if (current.revision if current else None) != expected_revision:
            raise RevisionConflict(current.revision if current else None)
        if current is None and len(self.homes) >= MAX_HOMES:
            raise ModelError("too_many_homes", f"at most {MAX_HOMES} homes")
        plan_changed = current is None or current.configuration["architecture"]["content"] != clean["architecture"]["content"]
        home = Home(
            home_id,
            clean_title if title is not None else (current.title if current else None),
            (current.revision if current else 0) + 1,
            now.isoformat(),
            user_id,
            clean,
        )
        self.homes[home_id] = home
        return home, plan_changed

    def delete(self, home_id: str, expected_revision: int) -> None:
        home = self.get(home_id)
        if home.revision != expected_revision:
            raise RevisionConflict(home.revision)
        del self.homes[home_id]


def record_plan(history: list[PlanVersion], home: Home, now: datetime) -> list[PlanVersion]:
    """Append the home's current plan unless it equals the latest entry; keep the newest MAX_PLAN_HISTORY."""
    content = home.configuration["architecture"]["content"]
    digest = plan_digest(content)
    if history and history[-1].sha256 == digest:
        return history
    version = PlanVersion(f"r{home.revision}-{digest[:12]}", digest, now.isoformat(), home.updated_by, home.revision, content)
    return [*history, version][-MAX_PLAN_HISTORY:]
