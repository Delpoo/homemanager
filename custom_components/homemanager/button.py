"""Buttons for RF remote functions that are not part of a fan or light."""

from __future__ import annotations

from typing import Any

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .errors import ModelError
from .ir import DATA_IR, IrManager
from .ir_model import IrButton
from .remotes import DATA_REMOTES, RemotesLibrary
from .rf import RfManager
from .rf_entity import RemoteEntity, async_setup_platform_entities, loose_buttons
from .rf_websocket import DATA_RF


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    manager = hass.data[DATA_RF]
    entry.async_on_unload(
        async_setup_platform_entities(
            hass,
            manager,
            "button",
            lambda remote: [f"button_{key}" for key in loose_buttons(remote)],
            lambda remote_id, key: RemoteButton(manager, remote_id, key),
            async_add_entities,
        )
    )
    library: RemotesLibrary = hass.data[DATA_REMOTES]
    ir: IrManager = hass.data[DATA_IR]
    current: dict[str, IrRemoteButton] = {}

    @callback
    def sync_ir() -> None:
        desired = {f"ir:{remote.remote_id}:{button_id}": (remote.remote_id, button_id)
                   for remote in library.ir_remotes() for button_id in remote.buttons}
        added = []
        for unique_id, (remote_id, button_id) in desired.items():
            if unique_id in current:
                if current[unique_id].hass is not None:
                    current[unique_id].async_write_ha_state()
                continue
            entity = IrRemoteButton(library, ir, remote_id, button_id, unique_id)
            current[unique_id] = entity
            added.append(entity)
        if added:
            async_add_entities(added)
        registry = er.async_get(hass)
        for unique_id in current.keys() - desired.keys():
            del current[unique_id]
            if entity_id := registry.async_get_entity_id("button", DOMAIN, unique_id):
                registry.async_remove(entity_id)

    sync_ir()
    entry.async_on_unload(library.subscribe_ir(sync_ir))


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
    def icon(self) -> str | None:
        remote = self.remote
        button = remote.buttons.get(self.button_id) if remote else None
        return button.icon if button else None

    @property
    def available(self) -> bool:
        remote = self.remote
        return remote is not None and self.button_id in remote.buttons

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        # Not `homemanager_remote`: a button has no state to correct. This one
        # lets a plan device bound to the button show its remote.
        return {"homemanager_remote_button": self.remote_id, **self.on_air()}

    async def async_press(self) -> None:
        await self.press(self.button_id)


class IrRemoteButton(ButtonEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, library: RemotesLibrary, ir: IrManager, remote_id: str, button_id: str, unique_id: str) -> None:
        self._library = library
        self._ir = ir
        self._remote_id = remote_id
        self._button_id = button_id
        self._attr_unique_id = unique_id

    def _button(self) -> IrButton | None:
        try:
            return self._library.ir_remote(self._remote_id).buttons.get(self._button_id)
        except ModelError:
            return None

    @property
    def name(self) -> str:
        button = self._button()
        return button.name if button else self._button_id

    @property
    def icon(self) -> str | None:
        button = self._button()
        return button.icon if button else None

    @property
    def available(self) -> bool:
        return self._button() is not None

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(identifiers={(DOMAIN, f"ir:{self._remote_id}")},
                          name=self._library.ir_remote(self._remote_id).name,
                          manufacturer="HomeManager", model="IR remote")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"homemanager_ir_remote": self._remote_id}

    async def async_press(self) -> None:
        try:
            self._ir.press(self._remote_id, self._button_id)
        except ModelError as error:
            raise HomeAssistantError(str(error)) from None
