"""Persistent V2 contract validation independent of the browser and HA runtime."""

from __future__ import annotations

from copy import deepcopy
import json
import math
import re
from typing import Any

from .const import MAX_CONFIGURATION_BYTES, MAX_PLAN_BYTES, SCHEMA_VERSION
from .errors import ModelError
from .svg import validate_svg

UNSAFE = frozenset({"__proto__", "prototype", "constructor"})
ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
ENTITY = re.compile(r"[a-z][a-z0-9_]*\.[a-z0-9_]+\Z")
RESERVED = re.compile(r"(?:entity_id|device_id|area_id|rf_codes?|ir_codes?|codes?|protocol|pulse_length|raw(?:_data)?|rc_switch|commands?|command_type)\Z", re.I)
EXECUTABLE = re.compile(r"{{|{%|<\s*script\b|javascript\s*:|\b(?:eval|Function)\s*\(", re.I)
KINDS = frozenset("light fan curtain ac sensor switch robot purifier plant infra energy media lock camera appliance other".split())
SERVICES = {
    "light": {"turn_on", "turn_off", "toggle"},
    "fan": {"turn_on", "turn_off", "toggle", "set_percentage", "set_preset_mode", "set_direction", "oscillate"},
    "cover": {"open_cover", "close_cover", "stop_cover", "set_cover_position"},
    "climate": {"turn_on", "turn_off", "set_temperature", "set_hvac_mode", "set_fan_mode", "set_preset_mode", "set_swing_mode"},
    "switch": {"turn_on", "turn_off", "toggle"}, "button": {"press"}, "script": {"turn_on"},
}


def _fail() -> None:
    raise ModelError("invalid_configuration", "configuration does not satisfy the persistent V2 contract")


def _fields(value: Any, required: set[str], optional: set[str] | None = None) -> None:
    if not isinstance(value, dict) or not required <= value.keys() or value.keys() - required - (optional or set()):
        _fail()


def _text(value: Any, limit: int = 240) -> None:
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        _fail()


def _id(value: Any) -> None:
    _text(value)
    if not ID.fullmatch(value) or value in UNSAFE:
        _fail()


def _entity(value: Any) -> None:
    _text(value)
    if not ENTITY.fullmatch(value) or value.endswith(".all"):
        _fail()


def _number(value: Any, minimum: float, maximum: float, integer: bool = False) -> None:
    if type(value) not in (int, float) or not minimum <= value <= maximum or (type(value) is float and not math.isfinite(value)) or (integer and value != int(value)):
        _fail()


def _json(value: Any, depth: int = 0, *, action: bool = False) -> None:
    if depth > (10 if action else 24):
        _fail()
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, str):
        try:
            value.encode("utf-8")
        except UnicodeError:
            _fail()
        if action and (len(value) > 1024 or EXECUTABLE.search(value)):
            _fail()
        return
    if type(value) in (int, float):
        if (type(value) is int and value.bit_length() > 1023) or (type(value) is float and not math.isfinite(value)):
            _fail()
        return
    if isinstance(value, list):
        if action and len(value) > 100:
            _fail()
        for item in value:
            _json(item, depth + 1, action=action)
        return
    if isinstance(value, dict):
        if action and len(value) > 100:
            _fail()
        for key, item in value.items():
            if not isinstance(key, str) or key in UNSAFE or (action and (not key or len(key) > 100 or RESERVED.fullmatch(key))):
                _fail()
            try:
                key.encode("utf-8")
            except UnicodeError:
                _fail()
            _json(item, depth + 1, action=action)
        return
    _fail()


def _map(value: Any) -> None:
    if not isinstance(value, dict) or len(value) > 2000:
        _fail()
    for key in value:
        _id(key)


def _action(action: Any) -> None:
    _fields(action, {"domain", "service", "target"}, {"data"})
    domain, service = action["domain"], action["service"]
    if not isinstance(domain, str) or not isinstance(service, str) or service not in SERVICES.get(domain, set()):
        _fail()
    _fields(action["target"], {"entity_id"})
    target = action["target"]["entity_id"]
    targets = target if isinstance(target, list) else [target]
    if not 1 <= len(targets) <= 20:
        _fail()
    for target in targets:
        _entity(target)
        if not target.startswith(f"{domain}."):
            _fail()
    if len(set(targets)) != len(targets):
        _fail()
    data = action.get("data", {})
    if not isinstance(data, dict):
        _fail()
    _json(data, action=True)
    if len(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()) > 8192:
        _fail()
    required: set[str] = set()
    allowed: set[str] = set()
    field = None
    if domain == "script":
        allowed = {"variables"}
        if "variables" in data and not isinstance(data["variables"], dict):
            _fail()
    elif domain == "light":
        allowed = {"brightness", "brightness_pct", "color_temp_kelvin", "rgb_color", "transition"} if service == "turn_on" else ({"transition"} if service == "turn_off" else set())
        for name, low, high, integer in (("brightness", 0, 255, True), ("brightness_pct", 0, 100, False), ("color_temp_kelvin", 1, 9007199254740991, True), ("transition", 0, 6553, False)):
            if name in data:
                _number(data[name], low, high, integer)
        if {"brightness", "brightness_pct"} <= data.keys() or {"color_temp_kelvin", "rgb_color"} <= data.keys():
            _fail()
        if "rgb_color" in data:
            if not isinstance(data["rgb_color"], list) or len(data["rgb_color"]) != 3:
                _fail()
            for value in data["rgb_color"]:
                _number(value, 0, 255, True)
    elif domain == "fan":
        field = {"set_percentage": "percentage", "set_preset_mode": "preset_mode", "set_direction": "direction", "oscillate": "oscillating"}.get(service)
        allowed = {field} if field else ({"percentage", "preset_mode"} if service == "turn_on" else set())
        required = {field} if field else set()
        if "percentage" in data:
            _number(data["percentage"], 0, 100, True)
        if "preset_mode" in data:
            _text(data["preset_mode"], 1024)
        if "direction" in data and data["direction"] not in ("forward", "reverse"):
            _fail()
        if "oscillating" in data and type(data["oscillating"]) is not bool:
            _fail()
        if {"percentage", "preset_mode"} <= data.keys():
            _fail()
    elif domain == "cover" and service == "set_cover_position":
        allowed = required = {"position"}
        if "position" in data:
            _number(data["position"], 0, 100, True)
    elif domain == "climate":
        field = {"set_hvac_mode": "hvac_mode", "set_fan_mode": "fan_mode", "set_preset_mode": "preset_mode", "set_swing_mode": "swing_mode"}.get(service)
        allowed = {field} if field else ({"temperature", "target_temp_low", "target_temp_high", "hvac_mode"} if service == "set_temperature" else set())
        required = {field} if field else set()
        if field and field in data:
            _text(data[field], 1024)
        if service == "set_temperature":
            single, low, high = (key in data for key in ("temperature", "target_temp_low", "target_temp_high"))
            if (not single and not (low and high)) or (single and (low or high)):
                _fail()
            for key in ("temperature", "target_temp_low", "target_temp_high"):
                if key in data:
                    _number(data[key], -9007199254740991, 9007199254740991)
            if low and data["target_temp_low"] > data["target_temp_high"]:
                _fail()
            if "hvac_mode" in data:
                _text(data["hvac_mode"], 1024)
    if not required <= data.keys() or data.keys() - allowed:
        _fail()


def validate_configuration(configuration: Any) -> dict[str, Any]:
    """Validate all persistent fields; pending action/panel references stay inert."""
    _json(configuration)
    _fields(configuration, {"schemaVersion", "rooms", "catalog", "architecture", "actions", "panels", "stateSources"}, {"commandTtlSeconds"})
    if type(configuration["schemaVersion"]) is not int or configuration["schemaVersion"] != SCHEMA_VERSION:
        raise ModelError("unsupported_schema", "schemaVersion 2 required; migrate in the editor first")
    if len(json.dumps(configuration, ensure_ascii=False, separators=(",", ":")).encode()) > MAX_CONFIGURATION_BYTES:
        raise ModelError("configuration_too_large", "the configuration exceeds 3 MiB")
    rooms = configuration["rooms"]
    if not isinstance(rooms, list) or len(rooms) > 200:
        _fail()
    room_ids: set[str] = set()
    for room in rooms:
        _fields(room, {"id", "label"})
        _id(room["id"])
        _text(room["label"])
        if room["id"] in room_ids:
            _fail()
        room_ids.add(room["id"])
    catalog = configuration["catalog"]
    _fields(catalog, {"schemaVersion", "devices"})
    if type(catalog["schemaVersion"]) is not int or catalog["schemaVersion"] != 2 or not isinstance(catalog["devices"], list) or len(catalog["devices"]) > 2000:
        _fail()
    device_ids: set[str] = set()
    for device in catalog["devices"]:
        _fields(device, {"id", "roomId", "kind", "position", "mobility", "display", "bindings", "state"})
        _id(device["id"])
        if device["id"] in device_ids:
            _fail()
        device_ids.add(device["id"])
        if device["roomId"] is not None:
            _id(device["roomId"])
            if device["roomId"] not in room_ids:
                _fail()
        if not isinstance(device["kind"], str) or device["kind"] not in KINDS or device["mobility"] not in ("fixed", "editable", "portable"):
            _fail()
        _fields(device["position"], {"x", "y"})
        for value in device["position"].values():
            _number(value, 0, 1)
        _fields(device["display"], {"label", "icon"})
        for value in device["display"].values():
            _text(value)
        bindings = device["bindings"]
        _fields(bindings, {"entityId", "primaryAction", "advancedPopupId"}, {"quickActions", "remoteId"})
        for name in ("entityId", "primaryAction", "advancedPopupId", "remoteId"):
            if bindings.get(name) is not None:
                (_entity if name == "entityId" else _id)(bindings[name])
        if "quickActions" in bindings:
            # Up to four actions offered when the icon is held (contract V2, optional).
            if not isinstance(bindings["quickActions"], list) or len(bindings["quickActions"]) > 4:
                _fail()
            quick_ids: set[str] = set()
            for item in bindings["quickActions"]:
                _fields(item, {"id", "label", "actionId"})
                _id(item["id"])
                _text(item["label"], 80)
                _id(item["actionId"])
                if item["id"] in quick_ids:
                    _fail()
                quick_ids.add(item["id"])
        _fields(device["state"], {"value", "confidence"})
        if device["state"] != {"value": "unknown", "confidence": "unknown"}:
            _fail()
    architecture = configuration["architecture"]
    _fields(architecture, {"format", "content"})
    if architecture["format"] != "svg" or not isinstance(architecture["content"], str):
        _fail()
    if len(architecture["content"].encode()) > MAX_PLAN_BYTES:
        raise ModelError("plan_too_large", "the plan exceeds 1 MiB")
    validate_svg(architecture["content"])
    for name in ("actions", "panels", "stateSources"):
        _map(configuration[name])
    for action in configuration["actions"].values():
        _action(action)
    for panel in configuration["panels"].values():
        _fields(panel, {"kind", "title", "controls"})
        if panel["kind"] not in ("device-controls", "rf-fan"):
            _fail()
        _text(panel["title"])
        if not isinstance(panel["controls"], list) or len(panel["controls"]) > 100:
            _fail()
        control_ids: set[str] = set()
        for control in panel["controls"]:
            _fields(control, {"id", "label", "actionId"})
            _id(control["id"])
            _id(control["actionId"])
            _text(control["label"])
            if control["id"] in control_ids:
                _fail()
            control_ids.add(control["id"])
            action = configuration["actions"].get(control["actionId"])
            if panel["kind"] == "rf-fan" and action and (action["domain"], action["service"]) != ("script", "turn_on"):
                _fail()
    for device_id, source in configuration["stateSources"].items():
        if device_id not in device_ids:
            _fail()
        _fields(source, {"entityId", "attribute", "feedback"})
        _entity(source["entityId"])
        if source["attribute"] is not None:
            _text(source["attribute"], 100)
            if source["attribute"] in UNSAFE or RESERVED.fullmatch(source["attribute"]):
                _fail()
        if source["feedback"] not in ("measured", "optimistic", "transmitter"):
            _fail()
    if "commandTtlSeconds" in configuration:
        _number(configuration["commandTtlSeconds"], 1, 300, True)
    return deepcopy(configuration)
