"""Private signal datasheets and deliberate RF/IR diagnostic sessions."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import json
import logging
import secrets
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.storage import Store
from homeassistant.util.file import WriteError
from homeassistant.util.json import SerializationError

from .const import DOMAIN
from .errors import ModelError
from .ir import IrManager
from .ir_model import IrSignal
from .remotes import RemotesLibrary
from .rf import Candidate, RfManager
from .rf_model import Remote, fingerprint
from .signals import MAX_SAMPLES, THUMBNAIL_VERSION, analyze, compare, prepare_ir, prepare_rf, sample, thumbnail, timestamp

DATA_DIAGNOSTICS = f"{DOMAIN}_diagnostics"
STORAGE_KEY = "homemanager.signals"
MAX_HISTORY = 8
MAX_STORAGE_BYTES = 12 * 1024 * 1024
MAX_RECORDS = 2 * 64 * 64
_LOGGER = logging.getLogger(__name__)


def _storage_size(data: dict[str, Any]) -> int:
    envelope = {"version": 1, "minor_version": 1, "key": STORAGE_KEY, "data": data}
    return len(json.dumps(envelope, indent=2, ensure_ascii=False).encode("utf-8"))


class _DiagnosticStore(Store[dict[str, Any]]):
    async def _async_migrate_func(self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any]) -> dict[str, Any]:
        raise ModelError("diagnostics_unavailable", "unsupported diagnostic storage version")

    async def _async_write_data(self, data: dict[str, Any]) -> None:
        try:
            await super()._async_write_data(data)
        except (OSError, SerializationError, WriteError):
            raise ModelError("diagnostics_unavailable", "could not save diagnostic evidence") from None


@dataclass(frozen=True, slots=True)
class _Button:
    identity: dict[str, Any]
    fingerprint: str
    emitter: str
    prepared: dict[str, Any]
    original: dict[str, Any] | None
    rf_remote: Remote | None = None
    rf_bits: str | None = None
    ir_signal: IrSignal | None = None

    @property
    def key(self) -> str:
        return f"{self.identity['source']}:{self.identity['remote_id']}:{self.identity['button_id']}"


def _compact(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    timings = raw.get("timings_us")
    if not isinstance(timings, list) or not 0 < len(timings) <= MAX_SAMPLES or any(
        type(timing) is not int or abs(timing) > 2_000_000 for timing in timings
    ):
        return {}
    return raw


def _present(raw: dict[str, Any] | None, medium: str, *, advanced: bool) -> dict[str, Any] | None:
    if not raw or not (data := _compact(raw)):
        return None
    timings = data["timings_us"]
    stats = analyze(timings, medium, data.get("integrity", "unknown"))
    graphic = thumbnail(timings)
    if advanced:
        return {**data, "analysis": stats, "graphic": graphic}
    # The learning screen gets a density trace and compact evidence. Exact
    # timings and decoded bits require the explicitly opened admin datasheet.
    decoded = stats["decoded"]
    return {"node": data.get("node"), "at": data.get("at"), "integrity": stats["integrity"],
            "duration_us": stats["duration_us"], "count": stats["count"], "protocol": decoded["protocol"] if decoded else None,
            "frames": len(stats["frames"]), "levels": graphic["levels"], "base_us": stats["base_us"]}


def _compare_shown(reference: dict[str, Any], seen: dict[str, Any]) -> dict[str, Any]:
    return {**compare(reference["timings_us"], seen["timings_us"]),
            "reference_blocks": len(reference["analysis"]["frames"]),
            "observed_blocks": len(seen["analysis"]["frames"])}


class Diagnostics:
    def __init__(self, hass: HomeAssistant, rf: RfManager, ir: IrManager, library: RemotesLibrary) -> None:
        self.hass = hass
        self.rf = rf
        self.ir = ir
        self.library = library
        self._store = _DiagnosticStore(hass, 1, STORAGE_KEY, private=True, atomic_writes=True)
        self._data: dict[str, Any] = {}
        self._can_write = True
        self._write_lock = asyncio.Lock()
        self._session = asyncio.Lock()

    async def async_close(self) -> None:
        async with self._session, self._write_lock:
            self._can_write = False

    async def async_load(self) -> None:
        try:
            data = await self._store.async_load()
            if data is not None:
                records = data.get("buttons") if isinstance(data, dict) else None
                if not isinstance(records, dict) or len(records) > MAX_RECORDS:
                    raise ValueError("invalid diagnostic storage")
                self._data = {key: record for key, record in records.items() if isinstance(record, dict)}
        except (HomeAssistantError, KeyError, ModelError, OSError, TypeError, ValueError):
            self._can_write = False
            _LOGGER.warning("HomeManager diagnostic storage is unavailable")

    def on_rf_learned(self, remote_id: str, button_id: str, code: str, candidate: Candidate) -> None:
        if candidate.observation:
            original = {**candidate.observation, "receptions": {"frames": candidate.frames, "presses": candidate.bursts}}
            self.hass.async_create_task(self._remember_rf(f"rf:{remote_id}:{button_id}", code, original, list(candidate.trials)),
                                        "HomeManager RF signal evidence")

    async def _remember_rf(self, key: str, code: str, original: dict[str, Any], trials: list[dict[str, Any]]) -> None:
        try:
            async with self._write_lock:
                version = thumbnail(original["timings_us"])
                previous = self._data.get(key, {})
                retained = previous.get("history", []) if previous.get("fingerprint") == code else []
                data = {**self._data, key: {"fingerprint": code, "original": original,
                                           "graphic": {"version": version["version"], "levels": version["levels"]},
                                           "history": [*retained, *[{**trial, "id": secrets.token_hex(8)} for trial in reversed(trials)]][:MAX_HISTORY]}}
                await self._save(data)
        except ModelError:
            _LOGGER.warning("Could not keep optional evidence for a learned RF signal")

    async def _save(self, data: dict[str, Any]) -> None:
        if not self._can_write or self.hass.is_stopping:
            raise ModelError("diagnostics_unavailable", "diagnostic storage is unavailable")
        envelope = {"buttons": data}
        if len(data) > MAX_RECORDS or await self.hass.async_add_executor_job(_storage_size, envelope) > MAX_STORAGE_BYTES:
            raise ModelError("diagnostics_full", "diagnostic storage is full; clear old tests to continue")
        try:
            await self._store.async_save(envelope)
        except (HomeAssistantError, OSError):
            raise ModelError("diagnostics_unavailable", "could not save diagnostic evidence") from None
        self._data = data

    def candidate(self, connection: object, source: str, candidate_id: str, advanced: bool) -> dict[str, Any] | None:
        if source == "ir":
            raw, planned = self.ir.candidate_evidence(connection, candidate_id, include_trial=advanced)
        else:
            raw, planned = self.rf.candidate_evidence(candidate_id, include_trial=advanced)
        original = _present(raw, source, advanced=advanced)
        if not advanced:
            return original
        prepared = _present(planned, source, advanced=True)
        return {"original": original, "prepared": prepared,
                "comparison": _compare_shown(original, prepared) if original and prepared else None}

    def _button(self, source: str, remote_id: str, button_id: str) -> _Button:
        remote = self.rf.library.get(remote_id) if source == "rf" else self.library.ir_remote(remote_id)
        button = remote.buttons.get(button_id)
        if button is None:
            raise ModelError("button_not_found", "unknown remote button")
        identity = {"source": source, "remote_id": remote_id, "remote_name": remote.name,
                    "button_id": button_id, "button_name": button.name, "icon": button.icon}
        if source == "rf":
            emitter = remote.transmitter
            code = fingerprint(button.code)
            record = self._data.get(f"rf:{remote_id}:{button_id}", {})
            original = record.get("original") if record.get("fingerprint") == code else None
            prepared = prepare_rf(button.code, remote.settings())
            return _Button(identity, code, emitter, prepared, original, rf_remote=remote, rf_bits=button.code)
        emitter = button.emitter or remote.emitter
        signal = button.signal
        capture = self.library.ir_capture(remote_id, button_id)
        original = sample(signal.timings_us, capture.get("node"), at=capture.get("at"),
                          integrity="received" if capture.get("at") else "legacy")
        if not capture.get("at"):
            original["at"] = None
        prepared = prepare_ir(signal.timings_us, emitter, {"carrier_hz": signal.carrier_hz, "carrier_source": signal.carrier_source})
        # Carrier edits are an emission setting. They do not orphan the
        # capture or previously recorded observations of this button.
        return _Button(identity, remote_id + ":" + button_id, emitter, prepared, original, ir_signal=signal)

    def _history(self, button: _Button) -> list[dict[str, Any]]:
        record = self._data.get(button.key, {})
        history = record.get("history") if record.get("fingerprint") == button.fingerprint else None
        rows = [item for item in history[:MAX_HISTORY] if isinstance(item, dict)] if isinstance(history, list) else []
        if button.ir_signal is not None and not record.get("hide_learning_trials"):
            capture = self.library.ir_capture(button.identity["remote_id"], button.identity["button_id"])
            initial = capture.get("trials")
            if isinstance(initial, list):
                seen = {item.get("id") for item in rows}
                rows.extend(item for item in initial[:6] if isinstance(item, dict) and item.get("id") not in seen)
        return rows[:MAX_HISTORY]

    def sheet(self, source: str, remote_id: str, button_id: str, trial_id: str | None) -> dict[str, Any]:
        button = self._button(source, remote_id, button_id)
        history = self._history(button)
        trial = next((item for item in history if item.get("id") == trial_id), {})
        if trial_id and not trial:
            raise ModelError("diagnostic_not_found", "unknown diagnostic test")
        prepared = _compact(trial.get("prepared", button.prepared)) or button.prepared
        original = _compact(trial.get("original", button.original))
        prepared_view = _present(prepared, source, advanced=True)
        original_view = _present(original, source, advanced=True)
        assert prepared_view is not None
        observed: dict[str, Any] = {}
        receptions = trial.get("observed")
        for role, reception in (receptions.items() if isinstance(receptions, dict) else ()):
            if not isinstance(reception, dict) or not isinstance(reception.get("blocks"), list):
                continue
            blocks = [shown for raw in reception["blocks"][:4] if (shown := _present(raw, source, advanced=True))]
            observed[role] = {**reception, "blocks": blocks,
                              "comparisons": [_compare_shown(prepared_view, block) for block in blocks]}
        return {"identity": button.identity, "emitter": button.emitter, "original": original_view,
                "prepared": prepared_view, "observed": observed,
                "comparison": _compare_shown(original_view, prepared_view) if original_view else None,
                "history": [{key: value for key, value in item.items() if key not in {"prepared", "observed", "original"}}
                            | {"snapshot": "prepared" in item} for item in history]}

    def devices(self, source: str) -> dict[str, Any]:
        if source == "ir":
            return self.ir.devices()
        transmitters = self.rf.transmitters()
        return {"emitters": [{key: node[key] for key in ("id", "name")} for node in transmitters],
                "receivers": [{key: node[key] for key in ("id", "name")} for node in transmitters if node["can_capture"] and node["device_id"]]}

    async def _record(self, button: _Button, row: dict[str, Any]) -> str:
        row_id = secrets.token_hex(8)
        async with self._write_lock:
            record = self._data.get(button.key, {})
            retained = record if record.get("fingerprint") == button.fingerprint else {}
            updated = {**retained, "fingerprint": button.fingerprint,
                       "history": [{"id": row_id, "at": timestamp(), **row}, *self._history(button)[:MAX_HISTORY - 1]]}
            await self._save({**self._data, button.key: updated})
        return row_id

    async def async_note(self, source: str, remote_id: str, button_id: str, msg: dict[str, Any]) -> dict[str, str]:
        button = self._button(source, remote_id, button_id)
        evidence = {key: msg[key] for key in ("camera", "response", "note", "trial_id") if key in msg}
        if not evidence.keys() & {"camera", "response", "note"}:
            raise ModelError("invalid_observation", "enter an observation")
        if "camera" in evidence and source != "ir":
            raise ModelError("invalid_observation", "the camera check applies to infrared only")
        emitter = button.emitter
        if "trial_id" in evidence:
            trial = next((row for row in self._history(button) if row.get("id") == evidence["trial_id"]), None)
            if trial is None:
                raise ModelError("invalid_observation", "unknown diagnostic test")
            emitter = trial.get("emitter", emitter)
        row_id = await self._record(button, {"kind": "observation", "emitter": emitter, **evidence})
        return {"id": row_id}

    async def async_clear(self, source: str, remote_id: str, button_id: str) -> None:
        button = self._button(source, remote_id, button_id)
        async with self._write_lock:
            data = dict(self._data)
            if record := data.pop(button.key, None):
                if record.get("original"):
                    data[button.key] = {**record, "history": []}
            if button.ir_signal is not None:
                data[button.key] = {"fingerprint": button.fingerprint, "hide_learning_trials": True, "history": []}
            await self._save(data)

    async def async_rf_test(self, remote_id: str, button_id: str) -> dict[str, Any]:
        button = self._button("rf", remote_id, button_id)
        trial = {"kind": "send", "emitter": button.emitter,
                 "prepared": button.prepared, "original": button.original}
        try:
            await self.rf.async_press(remote_id, button_id)
        except (ModelError, HomeAssistantError):
            try:
                await self._record(button, {**trial, "status": "error"})
            except ModelError:
                pass
            raise
        try:
            row_id = await self._record(button, {**trial, "status": "sent"})
        except ModelError:
            return {"status": "sent", "saved": False}
        return {"id": row_id, "status": "sent", "saved": True}

    async def async_run(self, source: str, remote_id: str, button_id: str, emitter: str,
                        receivers: dict[str, str]) -> dict[str, Any]:
        if self._session.locked():
            raise ModelError("diagnostic_busy", "a diagnostic test is already in progress")
        async with self._session:
            button = self._button(source, remote_id, button_id)
            devices = self.devices(source)
            if emitter not in {device["id"] for device in devices["emitters"]}:
                raise ModelError("invalid_emitter", "select an available transmitter")
            available = {device["id"] for device in devices["receivers"]}
            if len(set(receivers.values())) != len(receivers) or not set(receivers.values()) <= available:
                raise ModelError("invalid_receiver", "select distinct available receivers")
            if source == "rf" and any((node == emitter) != (role == "self") for role, node in receivers.items()):
                raise ModelError("invalid_receiver", "select a receiver on the appropriate node")
            prepared = {**button.prepared, "node": emitter}
            if source == "rf":
                prepared["settings"] = {**button.prepared["settings"], "transmitter": emitter}
            try:
                async with asyncio.timeout(8):
                    if button.rf_remote is not None and button.rf_bits is not None:
                        observed = await self.rf.async_diagnose(button.rf_remote, button.rf_bits, emitter, receivers)
                    else:
                        assert button.ir_signal is not None
                        observed = await self.ir.async_diagnose(emitter, button.ir_signal, receivers)
            except TimeoutError:
                raise ModelError("diagnostic_inconclusive", "the diagnostic timed out; check the device before repeating the test") from None
            except HomeAssistantError:
                raise ModelError("diagnostic_send_failed", "the transmitter did not accept the request") from None
            try:
                row_id = await self._record(button, {"kind": "send", "status": "sent", "emitter": emitter,
                                                     "prepared": prepared, "original": button.original, "observed": observed,
                                                     "graphic_version": THUMBNAIL_VERSION})
            except ModelError:
                # Never label a completed send as failed, which invites a second press.
                return {"status": "sent", "saved": False}
            return {"id": row_id, "status": "sent", "saved": True}
