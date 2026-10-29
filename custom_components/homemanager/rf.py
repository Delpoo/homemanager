"""RF remote manager: stores remotes and buttons, sends and captures codes.

Transmitters are ESPHome devices running the HomeManager RF package
(esphome/homemanager-rf.yaml), which exposes two device actions:

- `homemanager_rf_send(code, protocol, pulse_length, repeats, wait_us)`;
- `homemanager_rf_capture(seconds)`, after which the device fires
  `esphome.homemanager_rf_raw` events carrying the raw receiver timings.

No helper, script or template is involved: the remote's own settings say which
transmitter, protocol, pulse length, repeats and frame wait to use. Codes stay
in this process and in .storage; browsers only get names and fingerprints.
A press is reported as "sent", never as a confirmed physical state.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
import logging
import secrets
import time
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.storage import Store

from .model import ModelError
from .rf_codec import decode, summarize
from .rf_model import Library, Remote, fingerprint

_LOGGER = logging.getLogger(__name__)

RF_STORAGE_KEY = "homemanager.rf"
RF_STORAGE_VERSION = 1
SEND_ACTION = "homemanager_rf_send"
CAPTURE_ACTION = "homemanager_rf_capture"
RAW_EVENT = "esphome.homemanager_rf_raw"
MAX_CAPTURE_SECONDS = 60
MAX_TIMINGS = 2000
# Two receptions further apart than this are two presses of the button.
BURST_GAP_SECONDS = 1.0
CANDIDATE_TTL_SECONDS = 15 * 60


def _now() -> float:
    return time.monotonic()


@dataclass
class Candidate:
    """A code heard during a capture. Its id is what the browser sees."""

    candidate_id: str
    transmitter: str
    protocol: int
    bits: str
    pulses: list[int] = field(default_factory=list)
    frames: int = 0
    bursts: int = 0
    last_seen: float = 0.0

    @property
    def pulse_us(self) -> int:
        ordered = sorted(self.pulses)
        return int(round(ordered[len(ordered) // 2] / 10) * 10)

    def public(self, known: list[str]) -> dict[str, Any]:
        return {
            "candidate_id": self.candidate_id,
            "transmitter": self.transmitter,
            "protocol": self.protocol,
            "nbits": len(self.bits),
            "pulse_us": self.pulse_us,
            "frames": self.frames,
            "bursts": self.bursts,
            # The same code in two separate presses: not a partial or noisy read.
            "confirmed": self.bursts >= 2,
            "fingerprint": fingerprint(self.bits),
            "known_as": known,
        }


class RfManager:
    """Event-loop only, like HomeManagerStore."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, RF_STORAGE_VERSION, RF_STORAGE_KEY, atomic_writes=True)
        self.library = Library()
        self._locks: dict[str, asyncio.Lock] = {}
        self._candidates: dict[str, Candidate] = {}
        self._listeners: set[Callable[[], None]] = set()

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        for remote_id, raw in (data.get("remotes") or {}).items():
            try:
                self.library.remotes[remote_id] = Remote.from_dict(remote_id, raw)
            except (KeyError, TypeError, ValueError, ModelError):
                _LOGGER.error("Ignoring unreadable stored RF remote %s; the stored file is left unchanged", remote_id)

    async def _commit(self, change: Callable[[], Any]) -> Any:
        """Applies a change and persists it, restoring the previous state on failure."""
        before = {key: Remote.from_dict(key, remote.as_dict()) for key, remote in self.library.remotes.items()}
        try:
            result = change()
            await self._store.async_save(self.library.as_dict())
        except Exception:
            self.library.remotes = before
            raise
        for listener in list(self._listeners):
            listener()
        return result

    @callback
    def async_subscribe(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._listeners.add(listener)
        return lambda: self._listeners.discard(listener)

    # Transmitters -------------------------------------------------------

    def transmitters(self) -> list[dict[str, Any]]:
        """ESPHome devices that expose the HomeManager send action."""
        found = []
        for service in sorted(self.hass.services.async_services_for_domain("esphome")):
            if not service.endswith(f"_{SEND_ACTION}"):
                continue
            node = service[: -len(SEND_ACTION) - 1]
            device = self._device(node)
            found.append(
                {
                    "id": node,
                    "name": (device.name_by_user or device.name) if device else node,
                    "device_id": device.id if device else None,
                    "can_capture": self.hass.services.has_service("esphome", f"{node}_{CAPTURE_ACTION}"),
                }
            )
        return found

    def _device(self, node: str) -> dr.DeviceEntry | None:
        registry = dr.async_get(self.hass)
        for entry in self.hass.config_entries.async_entries("esphome"):
            if str(entry.data.get("device_name", "")).replace("-", "_") == node:
                devices = dr.async_entries_for_config_entry(registry, entry.entry_id)
                return devices[0] if devices else None
        return None

    def _require(self, node: str, action: str) -> None:
        if not self.hass.services.has_service("esphome", f"{node}_{action}"):
            raise ModelError("transmitter_unavailable", f"{node} does not expose {action}; install the HomeManager RF package on it")

    # Library ------------------------------------------------------------

    async def async_put_remote(self, remote_id: str | None, raw: dict[str, Any]) -> Remote:
        return await self._commit(lambda: self.library.put_remote(remote_id, raw))

    async def async_delete_remote(self, remote_id: str) -> None:
        self.library.get(remote_id)
        await self._commit(lambda: self.library.remotes.pop(remote_id))

    async def async_put_button(self, remote_id: str, button_id: str | None, raw: dict[str, Any], candidate_id: str | None, code: str | None) -> dict[str, Any]:
        remote = self.library.get(remote_id)
        if candidate_id is not None:
            candidate = self._candidate(candidate_id)
            if candidate.protocol != remote.protocol:
                raise ModelError("invalid_code", "the captured code uses another protocol than this remote")
            code = candidate.bits
        button = await self._commit(lambda: remote.put_button(button_id, raw, code))
        return button.public()

    async def async_delete_button(self, remote_id: str, button_id: str) -> None:
        remote = self.library.get(remote_id)
        if button_id not in remote.buttons:
            raise ModelError("button_not_found", "unknown button")
        await self._commit(lambda: remote.buttons.pop(button_id))

    # Sending ------------------------------------------------------------

    async def _send(self, transmitter: str, protocol: int, bits: str, pulse_us: int, repeats: int, wait_us: int) -> None:
        self._require(transmitter, SEND_ACTION)
        # One transmission at a time per transmitter: a second press waits
        # instead of interleaving its frames with the first one.
        async with self._locks.setdefault(transmitter, asyncio.Lock()):
            await self.hass.services.async_call(
                "esphome",
                f"{transmitter}_{SEND_ACTION}",
                {"code": bits, "protocol": protocol, "pulse_length": pulse_us, "repeats": repeats, "wait_us": wait_us},
                blocking=True,
            )

    async def async_press(self, remote_id: str, button_id: str) -> dict[str, Any]:
        remote = self.library.get(remote_id)
        button = remote.buttons.get(button_id)
        if button is None:
            raise ModelError("button_not_found", "unknown button")
        await self._send(remote.transmitter, remote.protocol, button.code, remote.pulse_us, remote.repeats, remote.wait_us)
        return {"result": "sent"}

    async def async_test(self, candidate_id: str, settings: dict[str, Any]) -> dict[str, Any]:
        """Sends a captured code with trial settings, before anything is saved.
        This is how a pulse length or repeat count is chosen: try, then ask."""
        candidate = self._candidate(candidate_id)
        trial = Remote.from_input(
            "trial",
            {"name": "trial", "transmitter": settings.get("transmitter", candidate.transmitter), "protocol": candidate.protocol, "nbits": len(candidate.bits), **{key: settings[key] for key in ("pulse_us", "repeats", "wait_us") if key in settings}},
        )
        if "pulse_us" not in settings:
            trial.pulse_us = candidate.pulse_us
        await self._send(trial.transmitter, trial.protocol, candidate.bits, trial.pulse_us, trial.repeats, trial.wait_us)
        return {"result": "sent", **trial.settings()}

    # Capturing ----------------------------------------------------------

    def _candidate(self, candidate_id: str) -> Candidate:
        self._expire()
        candidate = self._candidates.get(candidate_id)
        if candidate is None:
            raise ModelError("candidate_not_found", "the capture expired; press the button again")
        return candidate

    def _expire(self) -> None:
        limit = _now() - CANDIDATE_TTL_SECONDS
        for key in [key for key, item in self._candidates.items() if item.last_seen < limit]:
            del self._candidates[key]

    async def async_capture(self, transmitter: str, seconds: int, report: Callable[[dict[str, Any]], None], done: Callable[[], None]) -> Callable[[], None]:
        """Listens for `seconds`; reports every heard code as it accumulates
        presses. Returns a stop function (also called when time runs out)."""
        self._require(transmitter, CAPTURE_ACTION)
        seconds = max(1, min(MAX_CAPTURE_SECONDS, seconds))
        device = self._device(transmitter)
        device_id = device.id if device else None
        heard: dict[tuple[int, str], Candidate] = {}

        @callback
        def received(event: Event) -> None:
            if device_id and event.data.get("device_id") not in (None, device_id):
                return
            try:
                timings = [int(value) for value in str(event.data.get("timings", "")).split(",")[:MAX_TIMINGS] if value.strip()]
            except ValueError:
                return
            frames = decode(timings)
            reading = summarize(frames)
            if reading is None:
                return
            now = _now()
            candidate = heard.get((reading.protocol, reading.bits))
            if candidate is None:
                candidate = Candidate(secrets.token_hex(8), transmitter, reading.protocol, reading.bits)
                heard[(reading.protocol, reading.bits)] = candidate
                self._candidates[candidate.candidate_id] = candidate
            if now - candidate.last_seen > BURST_GAP_SECONDS:
                candidate.bursts += 1
            candidate.last_seen = now
            candidate.frames += reading.frames
            candidate.pulses.extend(frame.pulse_us for frame in frames if frame.bits == reading.bits)
            report(candidate.public(self.library.buttons_with_code(candidate.bits)))

        unlisten = self.hass.bus.async_listen(RAW_EVENT, received)
        stopped = False

        @callback
        def stop(*_: Any) -> None:
            nonlocal stopped
            if stopped:
                return
            stopped = True
            unlisten()
            cancel_timer()
            self.hass.async_create_task(self._stop_device_capture(transmitter))
            done()

        cancel_timer = async_call_later(self.hass, seconds, stop)
        try:
            await self.hass.services.async_call("esphome", f"{transmitter}_{CAPTURE_ACTION}", {"seconds": seconds}, blocking=True)
        except Exception:
            stop()
            raise
        return stop

    async def _stop_device_capture(self, transmitter: str) -> None:
        try:
            await self.hass.services.async_call("esphome", f"{transmitter}_{CAPTURE_ACTION}", {"seconds": 0}, blocking=True)
        except Exception:  # The device stops by itself when its window ends.
            _LOGGER.debug("Could not end the capture window on %s early", transmitter)
