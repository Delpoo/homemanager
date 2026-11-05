"""Bounded manual learning and playback through ESPHome's native IR proxy."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
import secrets
from typing import Any

from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .errors import ModelError
from .ir_model import IrSignal
from .ir_proxy import IrProxy
from .remotes import RemotesLibrary

DATA_IR = f"{DOMAIN}_ir"
CAPTURE_SECONDS = 15
CANDIDATE_SECONDS = 120
MAX_CAPTURES = 4
MAX_CANDIDATES = 16


@dataclass(frozen=True, slots=True)
class _Candidate:
    owner: object
    timings: tuple[int, ...]
    expiry: asyncio.TimerHandle


class IrManager:
    def __init__(self, hass: HomeAssistant, library: RemotesLibrary) -> None:
        self._hass = hass
        self._library = library
        self._proxy = IrProxy(hass)
        self._captures: dict[str, tuple[object, asyncio.Task[None]]] = {}
        self._candidates: dict[str, _Candidate] = {}
        self._save_lock = asyncio.Lock()

    def devices(self) -> dict[str, Any]:
        return self._proxy.devices()

    def _forget_candidate(self, candidate_id: str) -> None:
        if candidate := self._candidates.pop(candidate_id, None):
            candidate.expiry.cancel()

    @callback
    def start_capture(
        self, owner: object, receiver_id: str, report: Callable[[dict[str, Any]], None]
    ) -> Callable[[], None]:
        if not any(device["id"] == receiver_id for device in self.devices()["receivers"]):
            raise ModelError("ir_receiver_unavailable", "the selected infrared receiver is unavailable")
        if (
            receiver_id in self._captures
            or len(self._captures) >= MAX_CAPTURES
            or any(active_owner is owner for active_owner, _ in self._captures.values())
        ):
            raise ModelError("ir_capture_busy", "an infrared capture is already in progress")

        for candidate_id, candidate in list(self._candidates.items()):
            if candidate.owner is owner:
                self._forget_candidate(candidate_id)
        task = self._hass.async_create_background_task(
            self._capture(owner, receiver_id, report), "HomeManager IR capture", eager_start=False
        )
        self._captures[receiver_id] = (owner, task)
        task.add_done_callback(lambda _: self._captures.pop(receiver_id, None))

        def stop() -> None:
            task.cancel()

        return stop

    async def _capture(self, owner: object, receiver_id: str, report: Callable[[dict[str, Any]], None]) -> None:
        try:
            async with asyncio.timeout(CAPTURE_SECONDS):
                timings = await self._proxy.async_capture(receiver_id)
        except TimeoutError:
            report({"status": "timeout"})
            return
        except ModelError as error:
            report({"status": "error", "code": error.code})
            return
        if len(self._candidates) >= MAX_CANDIDATES:
            self._forget_candidate(next(iter(self._candidates)))
        candidate_id = secrets.token_hex(16)
        loop = asyncio.get_running_loop()
        expiry = loop.call_later(CANDIDATE_SECONDS, self._forget_candidate, candidate_id)
        self._candidates[candidate_id] = _Candidate(owner, timings, expiry)
        report({"candidate_id": candidate_id, "count": len(timings), "duration_us": sum(map(abs, timings))})

    def _signal(self, owner: object, candidate_id: str, carrier_hz: int, carrier_source: str) -> IrSignal:
        candidate = self._candidates.get(candidate_id)
        if candidate is None or candidate.owner is not owner or candidate.expiry.when() <= asyncio.get_running_loop().time():
            raise ModelError("ir_candidate_unavailable", "capture an infrared signal first")
        return IrSignal.from_dict({
            "carrier_hz": carrier_hz, "carrier_source": carrier_source, "timings_us": list(candidate.timings)
        })

    def test(self, owner: object, candidate_id: str, emitter_id: str, carrier_hz: int, carrier_source: str) -> dict[str, str]:
        self._proxy.send(emitter_id, self._signal(owner, candidate_id, carrier_hz, carrier_source))
        return {"result": "sent"}

    async def async_save(self, owner: object, msg: dict[str, Any]) -> dict[str, str]:
        # Complete the single storage transaction even if its websocket closes
        # while HA is writing the file in its executor.
        task = self._hass.async_create_task(self._async_save(owner, msg), "HomeManager IR save")
        return await asyncio.shield(task)

    async def _async_save(self, owner: object, msg: dict[str, Any]) -> dict[str, str]:
        async with self._save_lock:
            if self._hass.is_stopping:
                raise ModelError("ir_save_failed", "Home Assistant is shutting down")
            remote_id, remote_name = msg.get("remote_id"), msg.get("remote_name")
            if (remote_id is None) == (remote_name is None):
                raise ModelError("invalid_ir", "select an infrared remote or name a new one")
            candidate_id = msg["candidate_id"]
            signal = self._signal(owner, candidate_id, msg["carrier_hz"], msg["carrier_source"])
            emitter_id = msg["emitter_id"]
            if not any(device["id"] == emitter_id for device in self.devices()["emitters"]):
                raise ModelError("ir_emitter_unavailable", "the selected infrared transmitter is unavailable")
            saved_id = await self._library.async_add_ir_button(
                remote_id=remote_id, remote_name=remote_name, button_name=msg["button_name"],
                emitter_id=emitter_id, signal=signal,
            )
            self._forget_candidate(candidate_id)
            return {"id": saved_id}

    def press(self, remote_id: str, button_id: str) -> dict[str, str]:
        remote = self._library.ir_remote(remote_id)
        if (button := remote.buttons.get(button_id)) is None:
            raise ModelError("button_not_found", "unknown infrared button")
        self._proxy.send(button.emitter or remote.emitter, button.signal)
        return {"result": "sent"}

    async def async_close(self) -> None:
        captures = [task for _, task in self._captures.values()]
        for task in captures:
            task.cancel()
        await asyncio.gather(*captures, return_exceptions=True)
        async with self._save_lock:
            for candidate_id in list(self._candidates):
                self._forget_candidate(candidate_id)
