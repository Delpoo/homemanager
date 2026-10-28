"""Persistent storage in Home Assistant's .storage, outside any dashboard.

Current homes live in one store; each home's plan history lives in its own
store so that replacing a plan never rewrites every other home's history.
"""

from __future__ import annotations

from collections.abc import Callable
import logging
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import PLAN_STORAGE_KEY_PREFIX, STORAGE_KEY, STORAGE_VERSION
from .model import Home, Homes, ModelError, PlanVersion, record_plan, validate_home_id

_LOGGER = logging.getLogger(__name__)

Listener = Callable[[str, int | None], None]


class HomeManagerStore:
    """Owns the in-memory state and its persistence. Not thread-safe by design:
    every method runs in the event loop, which serializes mutations."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY, atomic_writes=True)
        self._plans: dict[str, Store[dict[str, Any]]] = {}
        self.state = Homes()
        self._listeners: dict[str, set[Listener]] = {}

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        for home_id, raw in (data.get("homes") or {}).items():
            try:
                self.state.homes[validate_home_id(home_id)] = Home.from_dict(home_id, raw)
            except (KeyError, TypeError, ValueError, ModelError):
                # Never drop data silently: keep the file untouched and report.
                _LOGGER.error("Ignoring unreadable stored home %s; the stored file is left unchanged", home_id)

    def _plan_store(self, home_id: str) -> Store[dict[str, Any]]:
        if home_id not in self._plans:
            self._plans[home_id] = Store(self.hass, STORAGE_VERSION, f"{PLAN_STORAGE_KEY_PREFIX}{home_id}", atomic_writes=True)
        return self._plans[home_id]

    async def _persist(self) -> None:
        await self._store.async_save({"homes": {home_id: home.as_dict() for home_id, home in self.state.homes.items()}})

    async def async_plans(self, home_id: str) -> list[PlanVersion]:
        validate_home_id(home_id)
        data = await self._plan_store(home_id).async_load() or {}
        return [PlanVersion(**item) for item in data.get("plans", [])]

    async def async_save(self, home_id: str, expected_revision: int | None, configuration: Any, title: Any, user_id: str | None) -> Home:
        now = dt_util.utcnow()
        previous = self.state.homes.get(home_id)
        # Synchronous compare-and-swap; nothing is awaited before the state changes.
        home, plan_changed = self.state.save(home_id, expected_revision, configuration, title, user_id, now)
        try:
            await self._persist()
        except Exception:
            # Only undo our own change: a later save that already replaced it wins.
            if self.state.homes.get(home_id) is home:
                if previous is None:
                    self.state.homes.pop(home_id, None)
                else:
                    self.state.homes[home_id] = previous
            raise
        if plan_changed:
            history = record_plan(await self.async_plans(home_id), home, now)
            await self._plan_store(home_id).async_save({"plans": [vars(item) for item in history]})
        self._notify(home_id, home.revision)
        return home

    async def async_delete(self, home_id: str, expected_revision: int) -> None:
        self.state.delete(home_id, expected_revision)
        await self._persist()
        # Plan history is kept on purpose: deleting a home must stay recoverable.
        self._notify(home_id, None)

    @callback
    def async_subscribe(self, home_id: str, listener: Listener) -> Callable[[], None]:
        self._listeners.setdefault(home_id, set()).add(listener)

        @callback
        def unsubscribe() -> None:
            self._listeners.get(home_id, set()).discard(listener)

        return unsubscribe

    @callback
    def _notify(self, home_id: str, revision: int | None) -> None:
        for listener in list(self._listeners.get(home_id, ())):
            listener(home_id, revision)
