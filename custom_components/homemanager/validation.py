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
MDI_ICON = re.compile(r"mdi:[a-z0-9]+(?:-[a-z0-9]+)*\Z")
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

# Controls of a map device (contract V2, optional): steps each type takes, as
# (minimum, maximum). A slider has none when it adjusts an entity's own value.
CONTROL_STEPS = {"button": (1, 1), "cycle": (2, 4), "slider": (0, 12), "updown": (2, 2), "select": (2, 8)}
MAX_CONTROLS = 8
MAX_PINNED = 3
SYMBOL_ARCHETYPES = ("actuator", "equipment", "sensor", "meter", "remote", "infrastructure")
SYMBOL_SHOW = ("icon", "value", "both")
DEVICE_CATEGORIES = ("switch", "equipment", "remote", "meter", "plant", "alert", "presence", "infrastructure")
ROOM_SHAPE_SOURCES = ("svg", "app")
ROOM_FRAMES = ("tight", "normal", "wide")


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


def _shape(value: Any) -> None:
    """D22: a space's own rectangle, normalized to the plan like device positions."""
    _fields(value, {"x", "y", "width", "height"})
    for key in ("x", "y", "width", "height"):
        _number(value[key], 0, 1)
    if value["width"] <= 0 or value["height"] <= 0:
        _fail()
    if value["x"] + value["width"] > 1 + 1e-9 or value["y"] + value["height"] > 1 + 1e-9:
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


def _controls(bindings: dict[str, Any], display: dict[str, Any]) -> None:
    types: dict[str, str] = {}
    if "controls" in bindings:
        if not isinstance(bindings["controls"], list) or len(bindings["controls"]) > MAX_CONTROLS:
            _fail()
        for control in bindings["controls"]:
            _fields(control, {"id", "type", "label", "steps"}, {"entityId", "orientation"})
            _id(control["id"])
            if control["id"] in types or not isinstance(control["type"], str) or control["type"] not in CONTROL_STEPS:
                _fail()
            types[control["id"]] = control["type"]
            _text(control["label"], 80)
            low, high = CONTROL_STEPS[control["type"]]
            steps = control["steps"]
            if not isinstance(steps, list) or not low <= len(steps) <= high or (control["type"] == "slider" and len(steps) == 1):
                _fail()
            for step in steps:
                _fields(step, {"actionId"}, {"label", "icon"})
                _id(step["actionId"])
                if "label" in step:
                    _text(step["label"], 80)
                if "icon" in step:
                    _text(step["icon"])
            if "entityId" in control:
                if control["type"] != "slider" or steps:
                    _fail()
                _entity(control["entityId"])
            if "orientation" in control and (control["type"] != "slider" or control["orientation"] not in ("vertical", "horizontal")):
                _fail()
    tap = bindings.get("tap")
    if tap is not None and (not isinstance(tap, str) or types.get(tap) not in ("button", "cycle")):
        _fail()
    if "pinned" in display:
        pinned = display["pinned"]
        if not isinstance(pinned, list) or len(pinned) > MAX_PINNED or len(set(map(str, pinned))) != len(pinned) or any(not isinstance(item, str) or item not in types for item in pinned):
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
        _fields(room, {"id", "label"}, {"icon", "shape", "shapeSource", "frame", "nav"})
        _id(room["id"])
        _text(room["label"])
        if "icon" in room:
            _text(room["icon"])
            if not MDI_ICON.fullmatch(room["icon"]):
                _fail()
        if "shape" in room:
            _shape(room["shape"])
        if "shapeSource" in room and (room["shapeSource"] not in ROOM_SHAPE_SOURCES or "shape" not in room):
            _fail()
        if "frame" in room and room["frame"] not in ROOM_FRAMES:
            _fail()
        if "nav" in room:
            nav = room["nav"]
            _fields(nav, set(), {"skip", "hidden"})
            if "skip" in nav and type(nav["skip"]) is not bool:
                _fail()
            if "hidden" in nav:
                hidden = nav["hidden"]
                if type(hidden) is not list or len(hidden) > 200 or len(set(map(str, hidden))) != len(hidden):
                    _fail()
                for item in hidden:
                    _id(item)
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
        display = device["display"]
        _fields(display, {"label", "icon"}, {"size", "pinned", "archetype", "show", "category", "alerts", "highlight"})
        _text(display["label"])
        _text(display["icon"])
        if "size" in display and display["size"] not in ("s", "m", "l"):
            _fail()
        if "archetype" in display and display["archetype"] not in SYMBOL_ARCHETYPES:
            _fail()
        if "show" in display and display["show"] not in SYMBOL_SHOW:
            _fail()
        if "category" in display and display["category"] not in DEVICE_CATEGORIES:
            _fail()
        if "highlight" in display and not isinstance(display["highlight"], bool):
            _fail()
        if "alerts" in display:
            rules = display["alerts"]
            if not isinstance(rules, list) or len(rules) > 4:
                _fail()
            for rule in rules:
                _fields(rule, {"reading", "level"}, {"below", "above", "forMinutes"})
                _entity(rule["reading"])
                if rule["level"] not in ("alert", "warning"):
                    _fail()
                for key in ("below", "above", "forMinutes"):
                    if key in rule and (
                        isinstance(rule[key], bool)
                        or not isinstance(rule[key], (int, float))
                        or not math.isfinite(rule[key])
                    ):
                        _fail()
                if "forMinutes" in rule and rule["forMinutes"] < 0:
                    _fail()
        bindings = device["bindings"]
        _fields(bindings, {"entityId", "primaryAction", "advancedPopupId"}, {"quickActions", "remoteId", "controls", "tap", "deviceId", "readings"})
        if "deviceId" in bindings:
            _text(bindings["deviceId"])
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", bindings["deviceId"]) or bindings["deviceId"] in UNSAFE:
                _fail()
        if "readings" in bindings:
            readings = bindings["readings"]
            if not isinstance(readings, list) or len(readings) > 3:
                _fail()
            for reading in readings:
                _entity(reading)
            if len(set(readings)) != len(readings) or bindings["entityId"] in readings:
                _fail()
            if readings and not bindings.get("deviceId"):
                _fail()
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
        _controls(bindings, display)
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
