"""Home Assistant entities built from RF remotes.

Each remote becomes a device. What its buttons do decides its entities:

- a fan when it has speed buttons, "faster/slower", "off" or "power";
- a light when it has a light button (one that toggles, or separate on/off);
- a button entity for everything else (timers, brightness steps, modes...).

RF is one-way, so every state here is assumed: it is what was last sent,
restored across restarts, and it can be corrected without sending anything.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
import re
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .model import ModelError
from .rf import RfManager
from .rf_model import Remote

SPEED = re.compile(r"^speed_(\d+)$")
# Pause between presses when a speed is reached by repeated "faster/slower".
STEP_DELAY_SECONDS = 0.4
FAN_FUNCTIONS = {"off", "power", "speed_up", "speed_down", "direction"}
LIGHT_FUNCTIONS = {"light", "light_on", "light_off"}


@dataclass(frozen=True)
class Layout:
    """Which entities a remote gets; derived only from its button functions."""

    fan: bool
    speed_count: int
    direct_speeds: bool
    light: bool
    buttons: tuple[str, ...]


def layout(remote: Remote) -> Layout:
    functions = {button.function for button in remote.buttons.values() if button.function}
    levels = sorted(int(match.group(1)) for function in functions if (match := SPEED.match(function)))
    stepping = {"speed_up", "speed_down"} <= functions
    speed_count = levels[-1] if levels else (remote.speeds or 0) if stepping else 0
    fan = bool(levels) or bool(functions & FAN_FUNCTIONS - {"direction"})
    light = bool(functions & LIGHT_FUNCTIONS)
    covered = (FAN_FUNCTIONS | {f"speed_{level}" for level in levels} if fan else set()) | (LIGHT_FUNCTIONS if light else set())
    buttons = tuple(key for key, button in remote.buttons.items() if button.function not in covered)
    return Layout(fan, speed_count, bool(levels), light, buttons)


def button_for(remote: Remote, *functions: str) -> str | None:
    for function in functions:
        for key, button in remote.buttons.items():
            if button.function == function:
                return key
    return None


class RemoteEntity(Entity):
    """Base: reads its remote live from the manager on every access."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_assumed_state = True

    def __init__(self, manager: RfManager, remote_id: str, key: str) -> None:
        self.manager = manager
        self.remote_id = remote_id
        self._attr_unique_id = f"rf_{remote_id}_{key}"

    @property
    def remote(self) -> Remote | None:
        return self.manager.library.remotes.get(self.remote_id)

    @property
    def available(self) -> bool:
        return self.remote is not None

    @property
    def device_info(self) -> DeviceInfo:
        remote = self.remote
        return DeviceInfo(
            identifiers={(DOMAIN, f"rf_{self.remote_id}")},
            name=remote.name if remote else self.remote_id,
            manufacturer="HomeManager",
            model="RF remote",
        )

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        # Lets HomeManager panels offer "correct state" for this entity.
        return {"homemanager_remote": self.remote_id}

    async def press(self, button_id: str | None) -> None:
        if button_id is None:
            raise HomeAssistantError("This remote has no button for that function")
        try:
            await self.manager.async_press(self.remote_id, button_id)
        except ModelError as error:
            raise HomeAssistantError(str(error)) from error

    async def step(self, button_id: str | None, times: int) -> None:
        for index in range(times):
            if index:
                await asyncio.sleep(STEP_DELAY_SECONDS)
            await self.press(button_id)

    def assume(self, is_on: bool) -> None:
        """Corrects the assumed state without sending anything."""
        raise ModelError("not_assumable", "this entity has no state to correct")

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.manager.entities[self.unique_id] = self  # type: ignore[index]

    async def async_will_remove_from_hass(self) -> None:
        self.manager.entities.pop(self.unique_id, None)  # type: ignore[arg-type]
        await super().async_will_remove_from_hass()


def async_setup_platform_entities(
    hass: HomeAssistant,
    manager: RfManager,
    platform: str,
    wanted: Callable[[Remote, Layout], list[str]],
    build: Callable[[str, str], Entity],
    add: AddEntitiesCallback,
) -> Callable[[], None]:
    """Keeps a platform's entities in step with the library: adds new ones,
    removes those whose remote or button disappeared, refreshes the rest."""
    current: dict[str, Entity] = {}

    @callback
    def sync() -> None:
        desired: dict[str, tuple[str, str]] = {}
        for remote in manager.library.remotes.values():
            for key in wanted(remote, layout(remote)):
                desired[f"rf_{remote.remote_id}_{key}"] = (remote.remote_id, key)
        new = [build(remote_id, key) for unique_id, (remote_id, key) in desired.items() if unique_id not in current]
        for entity in new:
            current[entity.unique_id] = entity  # type: ignore[index]
        if new:
            add(new)
        registry = er.async_get(hass)
        for unique_id in [unique_id for unique_id in current if unique_id not in desired]:
            entity = current.pop(unique_id)
            if entity_id := registry.async_get_entity_id(platform, DOMAIN, unique_id):
                registry.async_remove(entity_id)
        for entity in current.values():
            if entity.hass and entity not in new:
                entity.async_write_ha_state()

    sync()
    return manager.async_subscribe(sync)
