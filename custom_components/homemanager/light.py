"""Lights built from the light parts of RF remotes (see rf_entity.py)."""

from __future__ import annotations

from typing import Any

from homeassistant.components.light import ColorMode, LightEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from .rf_entity import PartEntity, async_setup_platform_entities, parts_of, role
from .rf_websocket import DATA_RF


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    manager = hass.data[DATA_RF]
    entry.async_on_unload(
        async_setup_platform_entities(
            hass,
            manager,
            "light",
            lambda remote: parts_of(remote, "light"),
            lambda remote_id, key: RemoteLight(manager, remote_id, key),
            async_add_entities,
        )
    )


class RemoteLight(PartEntity, LightEntity, RestoreEntity):
    _attr_color_mode = ColorMode.ONOFF
    _attr_supported_color_modes = {ColorMode.ONOFF}

    def __init__(self, *args: Any) -> None:
        super().__init__(*args)
        self._attr_is_on = None

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) is not None:
            self._attr_is_on = {"on": True, "off": False}.get(last.state)

    async def _switch(self, on: bool) -> None:
        part = self.part
        if not part:
            return
        direct = role(part, "on" if on else "off")
        if direct is not None:
            await self.press(direct)
        elif self._attr_is_on is not on:
            # A toggle code is only sent when the assumed state differs; sending
            # it anyway would switch the light the wrong way.
            await self.press(role(part, "toggle"))
        self._attr_is_on = on
        self.async_write_ha_state()

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._switch(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._switch(False)

    def assume(self, is_on: bool) -> None:
        self._attr_is_on = is_on
        self.async_write_ha_state()
