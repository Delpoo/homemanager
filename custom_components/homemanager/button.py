"""Buttons for RF remote functions that are not part of a fan or light."""

from __future__ import annotations

from typing import Any

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .rf import RfManager
from .rf_entity import RemoteEntity, async_setup_platform_entities
from .rf_websocket import DATA_RF


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    manager = hass.data[DATA_RF]
    entry.async_on_unload(
        async_setup_platform_entities(
            hass,
            manager,
            "button",
            lambda remote, shape: [f"button_{key}" for key in shape.buttons],
            lambda remote_id, key: RemoteButton(manager, remote_id, key),
            async_add_entities,
        )
    )


class RemoteButton(RemoteEntity, ButtonEntity):
    _attr_assumed_state = False

    def __init__(self, manager: RfManager, remote_id: str, key: str) -> None:
        super().__init__(manager, remote_id, key)
        self.button_id = key.removeprefix("button_")

    @property
    def name(self) -> str:
        remote = self.remote
        button = remote.buttons.get(self.button_id) if remote else None
        return button.name if button else self.button_id

    @property
    def available(self) -> bool:
        remote = self.remote
        return remote is not None and self.button_id in remote.buttons

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {}

    async def async_press(self) -> None:
        await self.press(self.button_id)
