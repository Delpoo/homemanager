"""Validated persistent homes, plan versions and compare-and-swap revisions."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
import hashlib
import re
from typing import Any

from .errors import ModelError
from .validation import validate_configuration

from .const import MAX_HOMES, MAX_PLAN_HISTORY, MAX_TITLE_LENGTH

HOME_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
UNSAFE_KEYS = frozenset({"__proto__", "prototype", "constructor"})


class RevisionConflict(ModelError):
    """The stored revision differs from the one the editor loaded."""

    def __init__(self, current: int | None) -> None:
        super().__init__("revision_conflict", f"Stored revision is {current}")
        self.current = current


def validate_home_id(home_id: Any) -> str:
    if not isinstance(home_id, str) or len(home_id) > 64 or not HOME_ID.fullmatch(home_id) or home_id in UNSAFE_KEYS:
        raise ModelError("invalid_home_id", "home_id must be kebab-case, at most 64 characters")
    return home_id


def validate_title(title: Any) -> str | None:
    if title is None:
        return None
    if not isinstance(title, str) or not title.strip() or len(title) > MAX_TITLE_LENGTH or any(ord(c) < 32 for c in title):
        raise ModelError("invalid_title", "title must be plain text")
    try:
        title.encode("utf-8")
    except UnicodeError as error:
        raise ModelError("invalid_title", "title must be valid Unicode text") from error
    return title.strip()


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
        if not isinstance(data, dict) or type(data["revision"]) is not int or data["revision"] < 1 or not isinstance(data["updated_at"], str):
            raise ModelError("storage_error", "invalid stored home metadata")
        datetime.fromisoformat(data["updated_at"])
        return cls(home_id, validate_title(data.get("title")), data["revision"], data["updated_at"], data.get("updated_by"), validate_configuration(data["configuration"]))


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
        if expected_revision is not None and (type(expected_revision) is not int or expected_revision < 1):
            raise ModelError("invalid_revision", "revision must be a positive integer or null")
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
        if type(expected_revision) is not int or expected_revision < 1:
            raise ModelError("invalid_revision", "revision must be a positive integer")
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
