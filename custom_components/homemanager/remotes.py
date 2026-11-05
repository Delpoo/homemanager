"""Keep the private IR library alongside the live, legacy RF library."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.storage import Store
from homeassistant.util.file import WriteError
from homeassistant.util.json import SerializationError

from .const import DOMAIN
from .ir_model import IrRemote, IrSignal
from .model import ModelError
from .rf import RfManager
from .rf_model import MAX_BUTTONS, MAX_REMOTES, _text, slug

DATA_REMOTES = f"{DOMAIN}_remotes"
IR_STORAGE_KEY = "homemanager.ir"
IR_STORAGE_VERSION = 1
MAX_IR_TIMINGS = 1_000_000

_LOGGER = logging.getLogger(__name__)


class _IrStore(Store[dict[str, Any]]):
    async def _async_migrate_func(self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any]) -> dict[str, Any]:
        raise ModelError("invalid_ir_store", "unsupported infrared storage version")

    async def _async_write_data(self, data: dict[str, Any]) -> None:
        # The HA store logs these errors and returns by default. Only publish a
        # newly learned button once the atomic write has actually succeeded.
        try:
            await super()._async_write_data(data)
        except (OSError, SerializationError, WriteError):
            raise ModelError("ir_save_failed", "could not save the infrared library") from None


class RemotesLibrary:
    def __init__(self, hass: HomeAssistant, rf: RfManager) -> None:
        self._rf = rf
        self._ir_store = _IrStore(
            hass, IR_STORAGE_VERSION, IR_STORAGE_KEY, private=True, atomic_writes=True
        )
        self._ir: dict[str, IrRemote] = {}
        self._ir_data: dict[str, Any] = {"remotes": {}}
        self._ir_writable = True

    async def async_load(self) -> None:
        """Unreadable IR data must never prevent RF or HomeManager from loading."""
        try:
            data = await self._ir_store.async_load()
        except (HomeAssistantError, KeyError, ModelError, NotImplementedError, OSError, TypeError, ValueError):
            _LOGGER.warning("Could not load the HomeManager IR library")
            self._ir_writable = False
            return

        if data is None:
            return
        remotes = data.get("remotes") if isinstance(data, dict) else None
        if not isinstance(remotes, dict) or len(remotes) > MAX_REMOTES:
            _LOGGER.warning("Invalid HomeManager IR library")
            self._ir_writable = False
            return

        self._ir_data = data
        invalid = 0
        for remote_id, raw in remotes.items():
            try:
                self._ir[remote_id] = IrRemote.from_dict(remote_id, raw)
            except ModelError:
                invalid += 1
        if invalid:
            _LOGGER.warning("Ignored %s invalid HomeManager IR remote(s)", invalid)

    def ir_remote(self, remote_id: str) -> IrRemote:
        if (remote := self._ir.get(remote_id)) is None:
            raise ModelError("remote_not_found", "unknown infrared remote")
        return remote

    async def async_add_ir_button(
        self,
        *,
        remote_id: str | None,
        remote_name: str | None,
        button_name: str,
        emitter_id: str,
        signal: IrSignal,
    ) -> str:
        if not self._ir_writable:
            raise ModelError("ir_save_failed", "the infrared library is unavailable for editing")
        timings = sum(len(button.signal.timings_us) for remote in self._ir.values() for button in remote.buttons.values())
        if timings + len(signal.timings_us) > MAX_IR_TIMINGS:
            raise ModelError("ir_library_full", "the infrared library has reached its signal limit")
        stored = self._ir_data["remotes"]
        if remote_id is None:
            if len(stored) >= MAX_REMOTES:
                raise ModelError("too_many_remotes", f"at most {MAX_REMOTES} infrared remotes")
            name = _text(remote_name, "remote name")
            remote_id = slug(name, set(stored))
            raw = {"name": name, "emitter": emitter_id}
        else:
            self.ir_remote(remote_id)
            raw = stored[remote_id]

        buttons = raw.get("buttons", {})
        if len(buttons) >= MAX_BUTTONS:
            raise ModelError("too_many_buttons", f"at most {MAX_BUTTONS} buttons per infrared remote")
        name = _text(button_name, "button name")
        button_id = slug(name, set(buttons))
        button = {"name": name, "signal": signal.as_dict()}
        if emitter_id != raw["emitter"]:
            button["emitter"] = emitter_id
        raw = {**raw, "buttons": {**buttons, button_id: button}}
        remote = IrRemote.from_dict(remote_id, raw)
        data = {**self._ir_data, "remotes": {**stored, remote_id: raw}}
        try:
            await self._ir_store.async_save(data)
        except (HomeAssistantError, OSError):
            raise ModelError("ir_save_failed", "could not save the infrared library") from None
        self._ir_data = data
        self._ir[remote_id] = remote
        return remote_id

    def public(self) -> dict[str, Any]:
        """Project RF in place so its IDs, storage and rollback remain intact."""
        remotes = []
        for remote in self._rf.library.remotes.values():
            public = remote.public()
            public["source"] = "rf"
            public["buttons"] = [
                {**button, "command_type": "rf_rcswitch"} for button in public["buttons"]
            ]
            remotes.append(public)
        remotes.extend(remote.public() for remote in self._ir.values())
        return {"remotes": remotes}
