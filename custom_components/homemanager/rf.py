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

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.storage import Store
from homeassistant.loader import async_get_integration

from .const import DOMAIN
from .model import ModelError
from .rf_codec import decode, summarize
from .rf_model import Library, Remote, fingerprint, migrate_remote_v1, validate_layout

_LOGGER = logging.getLogger(__name__)

RF_STORAGE_KEY = "homemanager.rf"
RF_STORAGE_VERSION = 2
SEND_ACTION = "homemanager_rf_send"
CAPTURE_ACTION = "homemanager_rf_capture"
RAW_EVENT = "esphome.homemanager_rf_raw"
PACKAGE = "github://Delpoo/homemanager/esphome/homemanager-rf.yaml"
MAX_CAPTURE_SECONDS = 60
MAX_TIMINGS = 2000
# Receptions further apart than this are separate presses of the button.
BURST_GAP_SECONDS = 0.3
# A code is trusted once it arrives this many times in one press, or in two
# separate presses: either way it is not a partial or noisy read.
CONFIRM_FRAMES = 3
CANDIDATE_TTL_SECONDS = 15 * 60
# Undecodable receptions are reported at most this often.
NOISE_INTERVAL_SECONDS = 0.5


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
    # Frames of the current press and of the press with the most frames.
    burst_frames: int = 0
    best_burst: int = 0
    last_seen: float = 0.0

    @property
    def pulse_us(self) -> int:
        ordered = sorted(self.pulses)
        return int(round(ordered[len(ordered) // 2] / 10) * 10)

    @property
    def confirmed_by(self) -> str | None:
        if self.best_burst >= CONFIRM_FRAMES:
            return "frames"
        if self.bursts >= 2:
            return "presses"
        return None

    def public(self, known: list[str]) -> dict[str, Any]:
        return {
            "candidate_id": self.candidate_id,
            "transmitter": self.transmitter,
            "protocol": self.protocol,
            "nbits": len(self.bits),
            "pulse_us": self.pulse_us,
            "frames": self.frames,
            "bursts": self.bursts,
            "burst_frames": self.burst_frames,
            "confirmed": self.confirmed_by is not None,
            "confirmed_by": self.confirmed_by,
            "fingerprint": fingerprint(self.bits),
            "known_as": known,
        }


class _RfStore(Store[dict[str, Any]]):
    async def _async_migrate_func(self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any]) -> dict[str, Any]:
        if old_major_version >= 2:
            return old_data
        # 0.4: button functions become parts with roles (same entities).
        light = "Luz" if str(self.hass.config.language).startswith("es") else "Light"
        remotes = {}
        for remote_id, raw in (old_data.get("remotes") or {}).items():
            try:
                remotes[remote_id] = migrate_remote_v1(raw, light)
            except (KeyError, TypeError, ValueError, AttributeError):
                _LOGGER.error("Could not migrate stored RF remote %s; it is kept as it was", remote_id)
                remotes[remote_id] = raw
        return {"remotes": remotes, "default_receiver": None}


class RfManager:
    """Event-loop only, like HomeManagerStore."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store = _RfStore(hass, RF_STORAGE_VERSION, RF_STORAGE_KEY, atomic_writes=True)
        self.library = Library()
        self._locks: dict[str, asyncio.Lock] = {}
        self._candidates: dict[str, Candidate] = {}
        self._listeners: set[Callable[[], None]] = set()
        # Entities built from remotes (rf_entity.py), by unique id.
        self.entities: dict[str, Any] = {}

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        for remote_id, raw in (data.get("remotes") or {}).items():
            try:
                self.library.remotes[remote_id] = Remote.from_dict(remote_id, raw)
            except (KeyError, TypeError, ValueError, AttributeError, ModelError):
                _LOGGER.error("Ignoring unreadable stored RF remote %s; the stored file is left unchanged", remote_id)
        try:
            self.library.set_default_receiver(data.get("default_receiver"))
        except ModelError:
            self.library.default_receiver = None

    async def _commit(self, change: Callable[[], Any]) -> Any:
        """Applies a change and persists it, restoring the previous state on failure."""
        before = self.library.copy()
        try:
            result = change()
            await self._store.async_save(self.library.as_dict())
        except Exception:
            self.library = before
            raise
        for listener in list(self._listeners):
            listener()
        return result

    @property
    def subscriber_count(self) -> int:
        return len(self._listeners)

    @callback
    def async_subscribe(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._listeners.add(listener)
        return lambda: self._listeners.discard(listener)

    # Transmitters and ESPHome devices -------------------------------------

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

    async def async_devices(self) -> dict[str, Any]:
        """Every ESPHome device, with or without the package, for the setup page."""
        registry = dr.async_get(self.hass)
        devices = []
        for entry in self.hass.config_entries.async_entries("esphome"):
            node = str(entry.data.get("device_name") or "").replace("-", "_")
            if not node:
                continue
            found = dr.async_entries_for_config_entry(registry, entry.entry_id)
            device = found[0] if found else None
            devices.append(
                {
                    "id": node,
                    "name": (device.name_by_user or device.name) if device and (device.name_by_user or device.name) else entry.title or node,
                    "device_id": device.id if device else None,
                    "manufacturer": device.manufacturer if device else None,
                    "model": device.model if device else None,
                    "online": entry.state is ConfigEntryState.LOADED,
                    "has_package": self.hass.services.has_service("esphome", f"{node}_{SEND_ACTION}"),
                    "can_capture": self.hass.services.has_service("esphome", f"{node}_{CAPTURE_ACTION}"),
                }
            )
        devices.sort(key=lambda item: (not item["has_package"], str(item["name"]).lower()))
        integration = await async_get_integration(self.hass, DOMAIN)
        return {
            "devices": devices,
            "default_receiver": self.library.default_receiver,
            "package": f"{PACKAGE}@v{integration.version}" if integration.version else f"{PACKAGE}@main",
            "builder_url": self._builder_url(),
        }

    def _builder_url(self) -> str | None:
        """Ingress path of the ESPHome Builder app, when Supervisor runs it."""
        if "hassio" not in self.hass.config.components:
            return None
        try:
            from homeassistant.components.hassio import get_addons_list  # noqa: PLC0415

            addons = get_addons_list(self.hass)
        except Exception:  # noqa: BLE001 - Supervisor not ready or API changed
            return None
        slugs = sorted((addon.get("state") != "started", str(addon.get("slug"))) for addon in addons if "esphome" in str(addon.get("slug", "")))
        return f"/hassio/ingress/{slugs[0][1]}" if slugs else None

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

    async def async_set_default_receiver(self, node: str | None) -> None:
        await self._commit(lambda: self.library.set_default_receiver(node))

    # Library ------------------------------------------------------------

    async def async_put_remote(self, remote_id: str | None, raw: dict[str, Any]) -> Remote:
        return await self._commit(lambda: self.library.put_remote(remote_id, raw))

    async def async_delete_remote(self, remote_id: str) -> None:
        self.library.get(remote_id)
        await self._commit(lambda: self.library.remotes.pop(remote_id))

    async def async_put_button(
        self, remote_id: str, button_id: str | None, raw: dict[str, Any], candidate_id: str | None, code: str | None, role: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        remote = self.library.get(remote_id)
        if candidate_id is not None:
            candidate = self._candidate(candidate_id)
            if candidate.protocol != remote.protocol:
                raise ModelError("invalid_code", "the captured code uses another protocol than this remote")
            code = candidate.bits
        button = await self._commit(lambda: self.library.get(remote_id).put_button(button_id, raw, code, role))
        return button.public()

    async def async_delete_button(self, remote_id: str, button_id: str) -> None:
        self.library.get(remote_id)
        await self._commit(lambda: self.library.get(remote_id).delete_button(button_id))

    async def async_put_parts(self, remote_id: str, parts: list[dict[str, Any]]) -> dict[str, Any]:
        self.library.get(remote_id)
        await self._commit(lambda: self.library.get(remote_id).put_parts(parts))
        return self.library.get(remote_id).public()

    async def async_put_layout(self, remote_id: str, layout: list[dict[str, Any]] | None) -> dict[str, Any]:
        def change() -> None:
            remote = self.library.get(remote_id)
            remote.layout = validate_layout(layout, remote.buttons)

        self.library.get(remote_id)
        await self._commit(change)
        return self.library.get(remote_id).public()

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

    def assume(self, entity_id: str, is_on: bool) -> None:
        """Corrects an RF entity's assumed state; nothing is transmitted."""
        for entity in self.entities.values():
            if entity.entity_id == entity_id:
                entity.assume(is_on)
                return
        raise ModelError("entity_not_found", "not an RF entity of HomeManager")

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
        """Listens for `seconds`. Reports `{"candidate": ...}` for every heard code
        as it accumulates frames and presses, and `{"noise": n}` when signals
        arrive that no supported protocol explains. Returns a stop function
        (also called when time runs out)."""
        self._require(transmitter, CAPTURE_ACTION)
        seconds = max(1, min(MAX_CAPTURE_SECONDS, seconds))
        device = self._device(transmitter)
        device_id = device.id if device else None
        heard: dict[tuple[int, str], Candidate] = {}
        noise = {"count": 0, "reported": -NOISE_INTERVAL_SECONDS}

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
            now = _now()
            if reading is None:
                noise["count"] += 1
                if now - noise["reported"] >= NOISE_INTERVAL_SECONDS:
                    noise["reported"] = now
                    report({"noise": noise["count"]})
                return
            candidate = heard.get((reading.protocol, reading.bits))
            if candidate is None:
                candidate = Candidate(secrets.token_hex(8), transmitter, reading.protocol, reading.bits)
                heard[(reading.protocol, reading.bits)] = candidate
                self._candidates[candidate.candidate_id] = candidate
            if now - candidate.last_seen > BURST_GAP_SECONDS:
                candidate.bursts += 1
                candidate.burst_frames = 0
            candidate.last_seen = now
            candidate.frames += reading.frames
            candidate.burst_frames += reading.frames
            candidate.best_burst = max(candidate.best_burst, candidate.burst_frames)
            candidate.pulses.extend(frame.pulse_us for frame in frames if frame.bits == reading.bits)
            report({"candidate": candidate.public(self.library.buttons_with_code(candidate.bits))})

        unlisten = self.hass.bus.async_listen(RAW_EVENT, received)
        stopped = False

        @callback
        def stop() -> None:
            """Ends the capture; what the client gets back when unsubscribing.
            It must not call `done`: the connection may be iterating its
            subscriptions while it closes."""
            nonlocal stopped
            if stopped:
                return
            stopped = True
            unlisten()
            cancel_timer()
            self.hass.async_create_task(self._stop_device_capture(transmitter))

        @callback
        def expired(*_: Any) -> None:
            if not stopped:
                stop()
                done()

        cancel_timer = async_call_later(self.hass, seconds, expired)
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
