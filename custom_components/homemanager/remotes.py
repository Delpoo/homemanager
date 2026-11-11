"""Keep the private IR library alongside the live, legacy RF library."""

from __future__ import annotations

from collections.abc import Callable
from copy import deepcopy
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
from .rf_model import MAX_BUTTONS, MAX_REMOTES, _text, append_layout_button, remove_layout_button, slug

DATA_REMOTES = f"{DOMAIN}_remotes"
IR_STORAGE_KEY = "homemanager.ir"
IR_STORAGE_VERSION = 1
MAX_IR_TIMINGS = 1_000_000

_LOGGER = logging.getLogger(__name__)


def _retired(raw: Any) -> list[str]:
    return [key for key in raw[-4096:] if isinstance(key, str)] if isinstance(raw, list) else []


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
        self._ir_listeners: set[Callable[[], None]] = set()

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

    def ir_remotes(self) -> tuple[IrRemote, ...]:
        return tuple(self._ir.values())

    def ir_capture(self, remote_id: str, button_id: str) -> dict[str, Any]:
        capture = self._ir_data["remotes"][remote_id]["buttons"][button_id].get("capture")
        return capture if isinstance(capture, dict) else {}

    def subscribe_ir(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._ir_listeners.add(listener)
        return lambda: self._ir_listeners.discard(listener)

    async def _replace_ir(self, remote_id: str, raw: dict[str, Any] | None) -> IrRemote | None:
        if not self._ir_writable:
            raise ModelError("ir_save_failed", "the infrared library is unavailable for editing")
        remote = IrRemote.from_dict(remote_id, raw) if raw is not None else None
        remotes = dict(self._ir_data["remotes"])
        data = {**self._ir_data, "remotes": remotes}
        if remote is None:
            remotes.pop(remote_id)
            data["retired"] = [*_retired(self._ir_data.get("retired"))[-4095:], remote_id]
        else:
            remotes[remote_id] = raw
        try:
            await self._ir_store.async_save(data)
        except (HomeAssistantError, OSError):
            raise ModelError("ir_save_failed", "could not save the infrared library") from None
        self._ir_data = data
        if remote is None:
            self._ir.pop(remote_id)
        else:
            self._ir[remote_id] = remote
        for listener in tuple(self._ir_listeners):
            listener()
        return remote

    async def async_add_ir_button(
        self,
        *,
        remote_id: str | None,
        remote_name: str | None,
        button_name: str,
        emitter_id: str,
        signal: IrSignal,
        capture: dict[str, Any],
        replace_button: str | None = None,
    ) -> str:
        if not self._ir_writable:
            raise ModelError("ir_save_failed", "the infrared library is unavailable for editing")
        timings = sum(len(button.signal.timings_us) for remote in self._ir.values() for button in remote.buttons.values())
        stored = self._ir_data["remotes"]
        if remote_id is None:
            if replace_button is not None:
                raise ModelError("invalid_ir", "select the remote of the button to relearn")
            if len(stored) >= MAX_REMOTES:
                raise ModelError("too_many_remotes", f"at most {MAX_REMOTES} infrared remotes")
            name = _text(remote_name, "remote name")
            remote_id = slug(name, set(stored) | set(_retired(self._ir_data.get("retired"))))
            raw = {"name": name, "emitter": emitter_id}
        else:
            remote = self.ir_remote(remote_id)
            if replace_button is not None:
                if (previous := remote.buttons.get(replace_button)) is None:
                    raise ModelError("button_not_found", "unknown infrared button")
                timings -= len(previous.signal.timings_us)
            raw = stored[remote_id]

        if timings + len(signal.timings_us) > MAX_IR_TIMINGS:
            raise ModelError("ir_library_full", "the infrared library has reached its signal limit")

        buttons = raw.get("buttons", {})
        if replace_button is None and len(buttons) >= MAX_BUTTONS:
            raise ModelError("too_many_buttons", f"at most {MAX_BUTTONS} buttons per infrared remote")
        name = _text(button_name, "button name")
        button_id = replace_button or slug(name, set(buttons) | set(_retired(raw.get("retired_buttons"))))
        previous_raw = buttons.get(button_id, {})
        previous_capture = previous_raw.get("capture")
        if isinstance(previous_capture, dict) and isinstance(previous_capture.get("trials"), list):
            capture = {**capture, "trials": [*capture.get("trials", []), *previous_capture["trials"]][:6]}
        button = {**previous_raw, "name": name, "signal": signal.as_dict(), "capture": capture}
        button.pop("emitter", None)
        if emitter_id != raw["emitter"]:
            button["emitter"] = emitter_id
        raw = {**raw, "buttons": {**buttons, button_id: button}}
        if replace_button is None and raw.get("layout") is not None:
            raw["layout"] = append_layout_button(raw["layout"], button_id)
        await self._replace_ir(remote_id, raw)
        return remote_id

    async def async_import_ir(self, name: str, emitter: str, signals: list[tuple[str, IrSignal, dict[str, Any]]],
                              remote_id: str | None = None) -> dict[str, Any]:
        stored = self._ir_data["remotes"]
        if remote_id is None:
            if len(stored) >= MAX_REMOTES:
                raise ModelError("too_many_remotes", f"at most {MAX_REMOTES} infrared remotes")
            name = _text(name, "remote name")
            remote_id = slug(name, set(stored) | set(_retired(self._ir_data.get("retired"))))
            raw = {"name": name, "emitter": emitter, "buttons": {}}
            fingerprints: set[str] = set()
        else:
            remote = self.ir_remote(remote_id)
            raw = deepcopy(stored[remote_id])
            fingerprints = {button.signal.fingerprint for button in remote.buttons.values()}
        timings = sum(len(button.signal.timings_us) for remote in self._ir.values() for button in remote.buttons.values())
        buttons = raw["buttons"]
        added = 0
        for label, signal, provenance in signals:
            if signal.fingerprint in fingerprints:
                continue
            if len(buttons) >= MAX_BUTTONS or timings + len(signal.timings_us) > MAX_IR_TIMINGS:
                raise ModelError("ir_library_full", "the imported signals exceed the infrared library limits")
            button_id = slug(label, set(buttons) | set(_retired(raw.get("retired_buttons"))))
            buttons[button_id] = {"name": label, "icon": None, "signal": signal.as_dict(),
                                  "emitter": emitter, "provenance": provenance}
            if raw.get("layout") is not None:
                raw["layout"] = append_layout_button(raw["layout"], button_id)
            fingerprints.add(signal.fingerprint)
            timings += len(signal.timings_us)
            added += 1
        if added:
            await self._replace_ir(remote_id, raw)
        return {"id": remote_id, "added": added, "duplicates": len(signals) - added}

    async def async_duplicate_ir_remote(self, remote_id: str, name: str, emitter: str | None) -> dict[str, Any]:
        """0.13: the same remote for another appliance, with its signals and design.
        A new emitter replaces the one of the original and of each button."""
        self.ir_remote(remote_id)
        stored = self._ir_data["remotes"]
        if len(stored) >= MAX_REMOTES:
            raise ModelError("too_many_remotes", f"at most {MAX_REMOTES} infrared remotes")
        source = stored[remote_id]
        timings = sum(len(button.signal.timings_us) for remote in self._ir.values() for button in remote.buttons.values())
        if timings + sum(len(button.signal.timings_us) for button in self._ir[remote_id].buttons.values()) > MAX_IR_TIMINGS:
            raise ModelError("ir_library_full", "the infrared library has reached its signal limit")
        new_id = slug(_text(name, "remote name"), set(stored) | set(_retired(self._ir_data.get("retired"))))
        raw = deepcopy(source)
        raw["name"] = name
        raw.pop("retired_buttons", None)
        if emitter is not None:
            raw["emitter"] = emitter
            for button in raw.get("buttons", {}).values():
                button.pop("emitter", None)
        remote = await self._replace_ir(new_id, raw)
        assert remote is not None
        return remote.public()

    async def async_edit_ir_remote(self, remote_id: str, changes: dict[str, Any] | None) -> dict[str, Any] | None:
        self.ir_remote(remote_id)
        raw = self._ir_data["remotes"][remote_id]
        remote = await self._replace_ir(remote_id, {**raw, **changes} if changes is not None else None)
        return remote.public() if remote else None

    async def async_edit_ir_button(self, remote_id: str, button_id: str,
                                   changes: dict[str, Any] | None) -> dict[str, Any]:
        remote = self.ir_remote(remote_id)
        if button_id not in remote.buttons:
            raise ModelError("button_not_found", "unknown infrared button")
        raw = self._ir_data["remotes"][remote_id]
        buttons = dict(raw["buttons"])
        patch: dict[str, Any] = {"buttons": buttons}
        if changes is None:
            del buttons[button_id]
            patch["retired_buttons"] = [*_retired(raw.get("retired_buttons"))[-511:], button_id]
            if remote.layout is not None:
                patch["layout"] = remove_layout_button(remote.layout, button_id)
        else:
            fields = dict(changes)
            signal = {**buttons[button_id]["signal"], **{key: fields.pop(key) for key in ("carrier_hz", "carrier_source") if key in fields}}
            buttons[button_id] = {**buttons[button_id], **fields, "signal": signal}
        updated = await self._replace_ir(remote_id, {**raw, **patch})
        assert updated is not None
        return updated.public()

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
