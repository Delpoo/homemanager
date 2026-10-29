"""Persistent storage in Home Assistant's .storage, outside any dashboard.

Current homes live in one store; each home's plan history lives in its own
store so that replacing a plan never rewrites every other home's history.
"""

from __future__ import annotations

import asyncio
from collections import OrderedDict
from collections.abc import Callable
import logging
from typing import Any
from pathlib import Path

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import MAX_HOMES, MAX_PLAN_HISTORY, MAX_PLAN_STORES, MAX_SUBSCRIPTIONS_PER_CONNECTION, MAX_SUBSCRIPTIONS_TOTAL, PLAN_STORAGE_KEY_PREFIX, STORAGE_KEY, STORAGE_MINOR_VERSION, STORAGE_VERSION
from .model import Home, Homes, ModelError, PlanVersion, plan_digest, record_plan, validate_home_id
from .storage_policy import check_quota, disk_sizes, encoded_size
from .svg import validate_svg

_LOGGER = logging.getLogger(__name__)

Listener = Callable[[str, int | None], None]


class _VersionedStore(Store[dict[str, Any]]):
    """Storage schema upgrades. Data is never dropped: an unknown future major
    version refuses to load (HA keeps the file) instead of being overwritten."""

    async def _async_migrate_func(self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any]) -> dict[str, Any]:
        if old_major_version > STORAGE_VERSION:
            raise NotImplementedError(f"HomeManager storage version {old_major_version} is newer than this release; update HomeManager")
        # Minor versions only add optional fields; nothing to rewrite yet.
        return old_data


class HomeManagerStore:
    """Serializes persistence and publishes only successfully stored candidates."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = _VersionedStore(hass, STORAGE_VERSION, STORAGE_KEY, minor_version=STORAGE_MINOR_VERSION, atomic_writes=True)
        self._plans: OrderedDict[str, Store[dict[str, Any]]] = OrderedDict()
        self.state = Homes()
        self._listeners: dict[str, set[Listener]] = {}
        self._connection_counts: dict[int, int] = {}
        self._lock = asyncio.Lock()
        self._sizes: dict[str, int] = {}
        self._quarantined: dict[str, Any] = {}
        self.viewer_user_ids: set[str] = set()

    async def async_load(self) -> None:
        self._sizes = await self.hass.async_add_executor_job(disk_sizes, Path(self.hass.config.path(".storage")))
        data = await self._store.async_load() or {}
        if not isinstance(data, dict) or not isinstance(data.get("homes", {}), dict):
            raise ModelError("storage_error", "HomeManager storage is unreadable; restore a backup")
        for home_id in data.get("plan_home_ids", []):
            self._sizes.setdefault(f"{PLAN_STORAGE_KEY_PREFIX}{validate_home_id(home_id)}", 1024)
        for home_id, raw in (data.get("homes") or {}).items():
            try:
                self.state.homes[validate_home_id(home_id)] = Home.from_dict(home_id, raw)
            except (KeyError, TypeError, ValueError, ModelError):
                # Never drop data silently: keep the file untouched and report.
                self._quarantined[home_id] = raw
                _LOGGER.error("An unreadable HomeManager home was quarantined; its stored data is preserved")

    def _plan_store(self, home_id: str) -> Store[dict[str, Any]]:
        validate_home_id(home_id)
        if home_id not in self._plans:
            self._plans[home_id] = _VersionedStore(self.hass, STORAGE_VERSION, f"{PLAN_STORAGE_KEY_PREFIX}{home_id}", minor_version=STORAGE_MINOR_VERSION, atomic_writes=True)
        self._plans.move_to_end(home_id)
        while len(self._plans) > MAX_HOMES:
            self._plans.popitem(last=False)
        return self._plans[home_id]

    def _document(self, state: Homes, sizes: dict[str, int]) -> dict[str, Any]:
        homes = {**self._quarantined, **{home_id: home.as_dict() for home_id, home in state.homes.items()}}
        return {"homes": homes, "plan_home_ids": sorted(key.removeprefix(PLAN_STORAGE_KEY_PREFIX) for key in sizes if key.startswith(PLAN_STORAGE_KEY_PREFIX))}

    async def _usage(self) -> dict[str, int]:
        try:
            actual = await self.hass.async_add_executor_job(disk_sizes, Path(self.hass.config.path(".storage")))
        except OSError as error:
            raise ModelError("storage_error", "HomeManager could not inspect its storage") from error
        return {**self._sizes, **actual}

    async def async_plans(self, home_id: str) -> list[PlanVersion]:
        validate_home_id(home_id)
        try:
            data = await self._plan_store(home_id).async_load() or {}
            plans = [PlanVersion(**item) for item in data.get("plans", [])]
            if len(plans) > MAX_PLAN_HISTORY:
                raise ModelError("storage_error", "plan history exceeds its limit")
            for plan in plans:
                validate_svg(plan.content)
                if type(plan.revision) is not int or plan.revision < 1 or plan.sha256 != plan_digest(plan.content) or plan.plan_id != f"r{plan.revision}-{plan.sha256[:12]}" or not isinstance(plan.created_at, str):
                    raise ModelError("storage_error", "invalid plan metadata")
            return plans
        except (OSError, ValueError, TypeError, KeyError, AttributeError, ModelError) as error:
            raise ModelError("storage_error", "the plan history is unreadable; restore a backup") from error

    async def async_save(self, home_id: str, expected_revision: int | None, configuration: Any, title: Any, user_id: str | None) -> Home:
        async with self._lock:
            if home_id in self._quarantined:
                raise ModelError("storage_error", "restore the quarantined home from a backup before editing")
            now = dt_util.utcnow()
            candidate = Homes(dict(self.state.homes))
            home, plan_changed = candidate.save(home_id, expected_revision, configuration, title, user_id, now)
            previous = await self.async_plans(home_id) if plan_changed else []
            history = record_plan(previous, home, now) if plan_changed else []
            sizes = await self._usage()
            plan_data = {"plans": [vars(item) for item in history]}
            plan_key = f"{PLAN_STORAGE_KEY_PREFIX}{home_id}"
            if plan_changed:
                sizes[plan_key] = encoded_size(plan_data)
            document = self._document(candidate, sizes)
            sizes[STORAGE_KEY] = encoded_size(document)
            check_quota(sizes)
            plan_written = False
            try:
                if plan_changed:
                    await self._plan_store(home_id).async_save(plan_data)
                    plan_written = True
                await self._store.async_save(document)
            except Exception as error:
                if plan_written:
                    try:
                        if previous:
                            await self._plan_store(home_id).async_save({"plans": [vars(item) for item in previous]})
                        else:
                            await self._plan_store(home_id).async_remove()
                    except Exception:
                        _LOGGER.error("HomeManager history rollback failed; restore a backup before continuing")
                raise ModelError("storage_error", "HomeManager could not save; reload before retrying") from error
            self.state = candidate
            self._sizes = sizes
            self._notify(home_id, home.revision)
            return home

    async def async_delete(self, home_id: str, expected_revision: int) -> None:
        async with self._lock:
            candidate = Homes(dict(self.state.homes))
            candidate.delete(home_id, expected_revision)
            try:
                await self._store.async_save(self._document(candidate, self._sizes))
            except Exception as error:
                raise ModelError("storage_error", "HomeManager could not delete; reload before retrying") from error
            self.state = candidate
            self._sizes[STORAGE_KEY] = encoded_size(self._document(candidate, self._sizes))
            self._notify(home_id, None)

    async def async_storage_status(self) -> dict[str, Any]:
        sizes = await self._usage()
        retained = sorted(key.removeprefix(PLAN_STORAGE_KEY_PREFIX) for key in sizes if key.startswith(PLAN_STORAGE_KEY_PREFIX) and key.removeprefix(PLAN_STORAGE_KEY_PREFIX) not in self.state.homes and key.removeprefix(PLAN_STORAGE_KEY_PREFIX) not in self._quarantined)
        return {"bytes": sum(sizes.values()), "retained_home_ids": retained[:MAX_PLAN_STORES]}

    async def async_purge_history(self, home_id: str) -> None:
        validate_home_id(home_id)
        async with self._lock:
            if home_id in self.state.homes or home_id in self._quarantined:
                raise ModelError("home_in_use", "only a deleted home's retained history can be purged")
            try:
                await self._plan_store(home_id).async_remove()
                self._sizes.pop(f"{PLAN_STORAGE_KEY_PREFIX}{home_id}", None)
                self._plans.pop(home_id, None)
                await self._store.async_save(self._document(self.state, self._sizes))
            except Exception as error:
                raise ModelError("storage_error", "HomeManager could not purge the retained history") from error

    @callback
    def async_subscribe(self, home_id: str, listener: Listener, connection_id: int | None = None) -> Callable[[], None]:
        self.state.get(home_id)
        owner = connection_id if connection_id is not None else id(listener)
        if self._connection_counts.get(owner, 0) >= MAX_SUBSCRIPTIONS_PER_CONNECTION or sum(map(len, self._listeners.values())) >= MAX_SUBSCRIPTIONS_TOTAL:
            raise ModelError("subscription_limit", "too many HomeManager subscriptions")
        self._listeners.setdefault(home_id, set()).add(listener)
        self._connection_counts[owner] = self._connection_counts.get(owner, 0) + 1
        closed = False

        @callback
        def unsubscribe() -> None:
            nonlocal closed
            if closed:
                return
            closed = True
            self._listeners.get(home_id, set()).discard(listener)
            if not self._listeners.get(home_id):
                self._listeners.pop(home_id, None)
            count = self._connection_counts.get(owner, 0) - 1
            if count > 0:
                self._connection_counts[owner] = count
            else:
                self._connection_counts.pop(owner, None)

        return unsubscribe

    @callback
    def async_close(self) -> None:
        self._listeners.clear()
        self._connection_counts.clear()

    @callback
    def _notify(self, home_id: str, revision: int | None) -> None:
        for listener in list(self._listeners.get(home_id, ())):
            try:
                listener(home_id, revision)
            except Exception:
                # A disconnected/broken observer must not turn a committed save
                # into an apparent failure or block other observers. No payload.
                _LOGGER.debug("A HomeManager observer could not receive an update")
