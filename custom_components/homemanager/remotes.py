"""Read the private IR library alongside the live, legacy RF library."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.storage import Store

from .const import DOMAIN
from .ir_model import IrRemote
from .model import ModelError
from .rf import RfManager
from .rf_model import MAX_REMOTES

DATA_REMOTES = f"{DOMAIN}_remotes"
IR_STORAGE_KEY = "homemanager.ir"
IR_STORAGE_VERSION = 1

_LOGGER = logging.getLogger(__name__)


class RemotesLibrary:
    def __init__(self, hass: HomeAssistant, rf: RfManager) -> None:
        self._rf = rf
        self._ir_store = Store[dict[str, Any]](
            hass, IR_STORAGE_VERSION, IR_STORAGE_KEY, private=True, read_only=True
        )
        self._ir: dict[str, IrRemote] = {}

    async def async_load(self) -> None:
        """Unreadable IR data must never prevent RF or HomeManager from loading."""
        try:
            data = await self._ir_store.async_load()
        except (HomeAssistantError, KeyError, NotImplementedError, OSError, TypeError, ValueError):
            _LOGGER.warning("Could not load the HomeManager IR library")
            return

        if data is None:
            return
        remotes = data.get("remotes") if isinstance(data, dict) else None
        if not isinstance(remotes, dict) or len(remotes) > MAX_REMOTES:
            _LOGGER.warning("Invalid HomeManager IR library")
            return

        invalid = 0
        for remote_id, raw in remotes.items():
            try:
                self._ir[remote_id] = IrRemote.from_dict(remote_id, raw)
            except ModelError:
                invalid += 1
        if invalid:
            _LOGGER.warning("Ignored %s invalid HomeManager IR remote(s)", invalid)

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
