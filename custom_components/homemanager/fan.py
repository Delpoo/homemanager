"""Fans built from RF remotes (see rf_entity.py)."""

from __future__ import annotations

import math
from typing import Any

from homeassistant.components.fan import FanEntity, FanEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.util.percentage import percentage_to_ranged_value, ranged_value_to_percentage

from .rf_entity import Layout, RemoteEntity, async_setup_platform_entities, button_for, layout
from .rf_websocket import DATA_RF


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    manager = hass.data[DATA_RF]
    entry.async_on_unload(
        async_setup_platform_entities(
            hass,
            manager,
            "fan",
            lambda remote, shape: ["fan"] if shape.fan else [],
            lambda remote_id, key: RemoteFan(manager, remote_id, key),
            async_add_entities,
        )
    )


class RemoteFan(RemoteEntity, FanEntity, RestoreEntity):
    _attr_name = None

    def __init__(self, *args: Any) -> None:
        super().__init__(*args)
        self._is_on: bool | None = None
        self._level = 0
        self._last_level = 0
        self._direction: str | None = None

    @property
    def _shape(self) -> Layout | None:
        return layout(self.remote) if self.remote else None

    @property
    def supported_features(self) -> FanEntityFeature:
        shape, remote = self._shape, self.remote
        features = FanEntityFeature(0)
        if not shape or not remote:
            return features
        if shape.speed_count:
            features |= FanEntityFeature.SET_SPEED
        if shape.speed_count or button_for(remote, "power"):
            features |= FanEntityFeature.TURN_ON
        if button_for(remote, "off", "power"):
            features |= FanEntityFeature.TURN_OFF
        if button_for(remote, "direction"):
            features |= FanEntityFeature.DIRECTION
        return features

    @property
    def speed_count(self) -> int:
        shape = self._shape
        return shape.speed_count if shape and shape.speed_count else 100

    @property
    def is_on(self) -> bool | None:
        return self._is_on

    @property
    def percentage(self) -> int | None:
        shape = self._shape
        if self._is_on is False:
            return 0
        if self._is_on is None or not shape or not shape.speed_count or not self._level:
            return None
        return ranged_value_to_percentage((1, shape.speed_count), self._level)

    @property
    def current_direction(self) -> str | None:
        return self._direction

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) is None:
            return
        self._is_on = {"on": True, "off": False}.get(last.state)
        percentage = last.attributes.get("percentage")
        shape = self._shape
        if shape and shape.speed_count and isinstance(percentage, int) and percentage > 0:
            self._level = self._last_level = math.ceil(percentage_to_ranged_value((1, shape.speed_count), percentage))
        direction = last.attributes.get("direction")
        self._direction = direction if direction in ("forward", "reverse") else None

    async def async_set_percentage(self, percentage: int) -> None:
        shape, remote = self._shape, self.remote
        if percentage <= 0:
            await self.async_turn_off()
            return
        if not shape or not remote or not shape.speed_count:
            return
        level = max(1, min(shape.speed_count, math.ceil(percentage_to_ranged_value((1, shape.speed_count), percentage))))
        if shape.direct_speeds:
            # Sent even when it is the assumed level: re-sending is how a user
            # re-synchronizes a fan that someone changed with its own remote.
            await self.press(button_for(remote, f"speed_{level}"))
        else:
            current = self._level if self._is_on else 0
            if level > current:
                await self.step(button_for(remote, "speed_up"), level - current)
            elif level < current:
                await self.step(button_for(remote, "speed_down"), current - level)
        self._is_on, self._level, self._last_level = True, level, level
        self.async_write_ha_state()

    async def async_turn_on(self, percentage: int | None = None, preset_mode: str | None = None, **kwargs: Any) -> None:
        remote, shape = self.remote, self._shape
        if not remote or not shape:
            return
        if percentage is not None:
            await self.async_set_percentage(percentage)
            return
        if shape.direct_speeds:
            level = self._last_level or 1
            await self.press(button_for(remote, f"speed_{level}"))
            self._level = self._last_level = level
        elif self._is_on is not True:
            await self.press(button_for(remote, "power"))
        self._is_on = True
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        remote = self.remote
        if not remote:
            return
        if (off := button_for(remote, "off")) is not None:
            await self.press(off)
        elif self._is_on is not False:
            # A power toggle is only sent when the fan is not already off by assumption.
            await self.press(button_for(remote, "power"))
        self._is_on, self._level = False, 0
        self.async_write_ha_state()

    async def async_set_direction(self, direction: str) -> None:
        remote = self.remote
        if not remote or direction == self._direction:
            return
        await self.press(button_for(remote, "direction"))
        self._direction = direction
        self.async_write_ha_state()

    def assume(self, is_on: bool) -> None:
        self._is_on = is_on
        if not is_on:
            self._level = 0
        self.async_write_ha_state()
