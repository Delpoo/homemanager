"""HomeManager-owned absolute controls and their persistent local schedules."""
from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import UTC, datetime, timedelta
import logging
import re
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_track_utc_time_change

from .absolute_profiles import MITSUBISHI, PROFILES
from .errors import ModelError
from .ir import IrManager
from .remotes import RemotesLibrary, _IrStore
from .rf_model import _text, validate_layout

DATA_ABSOLUTE = "homemanager_absolute"
_LOGGER = logging.getLogger(__name__)
MAX_CONTROLS = 64
MAX_SCHEDULES = 32
_TIME = re.compile(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]\Z")
_EXTRA_REFERENCES = ("schedules", "send", "power-on", "power-off")


def _zone(name: Any) -> ZoneInfo:
    try:
        if isinstance(name, str) and len(name) <= 80:
            return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        pass
    raise ModelError("invalid_schedule", "select a valid IANA time zone")


def schedule_input(raw: dict[str, Any], ident: str) -> dict[str, Any]:
    days, time, power = raw.get("days"), raw.get("time"), raw.get("power")
    if not isinstance(days, list) or not days or len(days) > 7 or any(type(day) is not int or not 0 <= day <= 6 for day in days):
        raise ModelError("invalid_schedule", "select one or more weekdays")
    if not isinstance(time, str) or not _TIME.fullmatch(time) or type(power) is not bool or type(raw.get("enabled", True)) is not bool:
        raise ModelError("invalid_schedule", "select a valid schedule action and time")
    zone = _zone(raw.get("zone"))
    return {"id": ident, "days": sorted(set(days)), "time": time, "power": power,
            "zone": zone.key, "enabled": raw.get("enabled", True)}


def occurrence(schedule: dict[str, Any], now: datetime) -> str | None:
    local = now.astimezone(_zone(schedule["zone"]))
    if not schedule["enabled"] or local.weekday() not in schedule["days"] or local.strftime("%H:%M") != schedule["time"]:
        return None
    # On the repeated hour of a DST change, a wall-clock time is run once.
    return local.strftime("%Y-%m-%dT%H:%M")


def next_occurrence(schedule: dict[str, Any], now: datetime) -> str | None:
    if not schedule["enabled"]:
        return None
    zone = _zone(schedule["zone"])
    hour, minute = map(int, schedule["time"].split(":"))
    today = now.astimezone(zone).date()
    for offset in range(8):
        day = today + timedelta(days=offset)
        if day.weekday() not in schedule["days"]:
            continue
        local = datetime(day.year, day.month, day.day, hour, minute, tzinfo=zone)
        utc = local.astimezone(UTC)
        if utc > now and utc.astimezone(zone).replace(tzinfo=None) == local.replace(tzinfo=None):
            return local.isoformat()
    return None


class AbsoluteRemotes:
    def __init__(self, hass: HomeAssistant, library: RemotesLibrary, ir: IrManager) -> None:
        self.hass, self.library, self.ir = hass, library, ir
        self.store = _IrStore(hass, 1, "homemanager.absolute_remotes", private=True, atomic_writes=True)
        self.items: dict[str, Any] = {}
        self.lock = asyncio.Lock()
        self.unlisten = None
        self.writable = True

    async def async_load(self) -> None:
        try:
            data = await self.store.async_load()
            if data is not None:
                if not isinstance(data, dict) or not isinstance(data.get("controls"), dict) or len(data["controls"]) > MAX_CONTROLS:
                    raise ValueError("invalid control store")
                for ident, item in data["controls"].items():
                    if not isinstance(item, dict) or item.get("profile") not in PROFILES:
                        raise ValueError("invalid control record")
                    profile = PROFILES[item["profile"]]
                    profile[3](bytes.fromhex(item["seed"]), item["state"])
                    validate_layout(item.get("layout"), set(profile[0]) | set(_EXTRA_REFERENCES))
                    if not isinstance(item.get("schedules"), dict) or len(item["schedules"]) > MAX_SCHEDULES:
                        raise ValueError("invalid schedule store")
                    for schedule_id, schedule in item["schedules"].items():
                        schedule_input(schedule, schedule_id)
                        profile[3](bytes.fromhex(item["seed"]), schedule["state"])
                    self.items[ident] = item
        except (HomeAssistantError, ValueError, TypeError, KeyError, ModelError, NotImplementedError, OSError):
            self.items.clear()
            self.writable = False
            _LOGGER.warning("HomeManager absolute controls storage is unavailable")
        if self.writable:
            self.unlisten = async_track_utc_time_change(self.hass, self.async_tick, second=0)

    async def async_close(self) -> None:
        if self.unlisten:
            self.unlisten()
            self.unlisten = None
        async with self.lock:
            self.writable = False

    async def _save(self, items: dict[str, Any]) -> None:
        if not self.writable or self.hass.is_stopping:
            raise ModelError("absolute_unavailable", "absolute control storage is unavailable")
        await self.store.async_save({"controls": items})
        self.items = items

    def public(self, item: dict[str, Any]) -> dict[str, Any]:
        result = {key: deepcopy(item[key]) for key in
                  ("id", "name", "profile", "brand", "model", "emitter", "state", "requested", "preset", "powerful", "layout") if key in item}
        result["capabilities"] = PROFILES[item["profile"]][0]
        result["powerful_configured"] = bool(item.get("powerful_signal"))
        result["schedules"] = [{**schedule, "next": next_occurrence(schedule, datetime.now(UTC))}
                               for schedule in item["schedules"].values()]
        return result

    def resources(self) -> dict[str, Any]:
        return {
            "controls": [self.public(item) for item in self.items.values()],
            "profiles": list(PROFILES),
            "zone": self.hass.config.time_zone,
            "emitters": self.ir.devices()["emitters"],
            "learned": [remote.public() for remote in self.library.ir_remotes()],
        }

    async def async_command(self, command: str, ident: str | None, fields: dict[str, Any]) -> dict[str, Any]:
        async with self.lock:
            if not self.writable or self.hass.is_stopping:
                raise ModelError("absolute_unavailable", "absolute control storage is unavailable")
            if command == "create":
                if len(self.items) >= MAX_CONTROLS or fields.get("profile") not in PROFILES:
                    raise ModelError("invalid_profile", "unknown profile or too many controls")
                remote = self.library.ir_remote(fields.get("remote_id", ""))
                button = remote.buttons.get(fields.get("button_id", ""))
                if button is None:
                    raise ModelError("invalid_profile", "select a learned infrared signal")
                if button.signal.carrier_hz in (0, None):
                    raise ModelError("invalid_profile", "configure the carrier of the learned signal")
                ident = uuid4().hex
                codec = PROFILES[fields["profile"]]
                seed = codec[1](button.signal)
                item = {"id": ident, "profile": fields["profile"], "seed": seed.hex(),
                        "name": _text(fields.get("name"), "name"), "brand": _text(fields.get("brand"), "brand"),
                        "model": _text(fields.get("model"), "model"),
                        "emitter": fields.get("emitter"), "carrier": button.signal.carrier_hz,
                        "carrier_source": button.signal.carrier_source, "state": codec[2](seed),
                        "requested": None, "preset": None, "schedules": {}}
                self._check_emitter(item["emitter"])
            else:
                if ident not in self.items:
                    raise ModelError("absolute_not_found", "unknown absolute control")
                item = deepcopy(self.items[ident])
                codec = PROFILES[item["profile"]]
                seed = bytes.fromhex(item["seed"])
                if command == "remove":
                    await self._save({key: value for key, value in self.items.items() if key != ident})
                    return {}
                if command in ("configure", "send", "preset"):
                    target = fields.get("state")
                    codec[3](seed, target)
                    if command == "preset":
                        item["preset"] = target
                    else:
                        item["state"] = target
                    if command == "send":
                        self._transmit(item, target)
                    if command == "configure" and "emitter" in fields:
                        self._check_emitter(fields["emitter"])
                        item["emitter"] = fields["emitter"]
                    if command == "configure" and "name" in fields:
                        item["name"] = _text(fields["name"], "name")
                elif command == "link-powerful" and item["profile"] == MITSUBISHI:
                    if fields.get("remove"):
                        item.pop("powerful_signal", None)
                    else:
                        remote = self.library.ir_remote(fields.get("remote_id", ""))
                        button = remote.buttons.get(fields.get("button_id", ""))
                        if button is None or button.signal.carrier_hz in (None, 0):
                            raise ModelError("invalid_profile", "select a learned POWERFUL COOL signal")
                        state = codec[2](codec[1](button.signal))
                        if not state["power"] or state["mode"] != "cool":
                            raise ModelError("invalid_profile", "the learned signal must request powered cooling")
                        item["powerful_signal"] = {"remote_id": remote.remote_id, "button_id": button.button_id,
                                                   "fingerprint": button.signal.fingerprint}
                elif command == "powerful" and item["profile"] == MITSUBISHI:
                    link = item.get("powerful_signal")
                    if not link:
                        raise ModelError("invalid_profile", "link a learned POWERFUL COOL signal first")
                    remote = self.library.ir_remote(link["remote_id"])
                    button = remote.buttons.get(link["button_id"])
                    if button is None or button.signal.fingerprint != link["fingerprint"]:
                        raise ModelError("invalid_profile", "the learned POWERFUL COOL signal has changed")
                    state = codec[2](codec[1](button.signal))
                    self.ir.send_signal(item["emitter"], button.signal)
                    now = datetime.now(UTC)
                    item["requested"] = {"state": state, "at": now.isoformat(), "status": "sent"}
                    item["powerful"] = (now + timedelta(minutes=15)).isoformat()
                elif command == "design":
                    item["layout"] = validate_layout(fields.get("layout"), set(codec[0]) | set(_EXTRA_REFERENCES))
                elif command == "schedule":
                    schedule_id = fields.get("schedule_id")
                    schedules = item["schedules"]
                    if schedule_id is not None and (not isinstance(schedule_id, str) or schedule_id not in schedules):
                        raise ModelError("invalid_schedule", "unknown schedule")
                    if fields.get("remove") is True and schedule_id:
                        del schedules[schedule_id]
                    else:
                        if not schedule_id and len(schedules) >= MAX_SCHEDULES:
                            raise ModelError("invalid_schedule", "too many schedules")
                        schedule_id = schedule_id or uuid4().hex
                        schedule = schedule_input(fields, schedule_id)
                        target = fields.get("state")
                        if not isinstance(target, dict):
                            raise ModelError("invalid_schedule", "select an absolute state")
                        target = {**target, "power": schedule["power"]}
                        codec[3](seed, target)
                        previous = schedules.get(schedule_id, {})
                        schedules[schedule_id] = {**schedule, "state": target, "last": previous.get("last"),
                                                  "result": previous.get("result")}
                else:
                    raise ModelError("invalid_profile", "unknown absolute control action")
            await self._save({**self.items, ident: item})
            return self.public(item)

    def _check_emitter(self, emitter: Any) -> None:
        if not isinstance(emitter, str) or not any(row["id"] == emitter for row in self.ir.devices()["emitters"]):
            raise ModelError("ir_emitter_unavailable", "select an available infrared emitter")

    def _transmit(self, item: dict[str, Any], target: dict[str, Any]) -> None:
        if not self.writable or self.hass.is_stopping:
            raise ModelError("absolute_unavailable", "absolute control storage is unavailable")
        _, _, _, encode, waveform = PROFILES[item["profile"]]
        signal = waveform(encode(bytes.fromhex(item["seed"]), target), item["carrier"], item["carrier_source"])
        self.ir.send_signal(item["emitter"], signal)
        item.pop("powerful", None)
        item["requested"] = {"state": target, "at": datetime.now(UTC).isoformat(), "status": "sent"}

    async def async_tick(self, now: datetime) -> None:
        async with self.lock:
            if not self.writable or self.hass.is_stopping:
                return
            for ident, existing in list(self.items.items()):
                for schedule_id, row in existing["schedules"].items():
                    due = occurrence(row, now)
                    if due is None or due == row.get("last"):
                        continue
                    item = deepcopy(self.items[ident])
                    schedule = item["schedules"][schedule_id]
                    schedule["last"], schedule["result"] = due, "pending"
                    try:
                        # Persist the claim before an irreversible request. A restart never repeats it.
                        await self._save({**self.items, ident: item})
                        item = deepcopy(item)
                        schedule = item["schedules"][schedule_id]
                        try:
                            self._transmit(item, schedule["state"])
                            schedule["result"] = "sent"
                        except ModelError as error:
                            schedule["result"] = error.code
                        except Exception:  # noqa: BLE001 - an emitter that is not ready must not stop the other schedules
                            _LOGGER.exception("A HomeManager schedule could not send its signal")
                            schedule["result"] = "send_failed"
                        await self._save({**self.items, ident: item})
                    except ModelError:
                        _LOGGER.warning("Could not persist a HomeManager schedule execution")
