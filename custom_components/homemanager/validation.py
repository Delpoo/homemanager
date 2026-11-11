"""Persistent V2 contract validation independent of the browser and HA runtime."""

from __future__ import annotations

from copy import deepcopy
import json
import math
import re
from typing import Any

from .const import MAX_CONFIGURATION_BYTES, MAX_PLAN_BYTES, SCHEMA_VERSION
from .errors import ModelError
from .piece_look import BLOCK_SLOTS, LOOK_KEYS, LookError, check_piece, inputs
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
    # Plan 0.12 (#96): device programs and modes as shortcuts.
    "scene": {"turn_on"}, "vacuum": {"start", "pause", "stop", "return_to_base", "locate", "clean_spot"},
    "select": {"select_option"}, "input_button": {"press"},
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
MAX_ROOM_RECTS = 12
# 0.13: a space's own outline, rings of points (outer first, then holes).
MAX_OUTLINE_RINGS = 8
MAX_OUTLINE_POINTS = 200


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


def _symbol_look(display: dict) -> None:
    """Plan 0.12 (#92, #93, #94): how a symbol and its values look. All optional."""
    def hex_color(value: Any) -> None:
        if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            _fail()
    if "values" in display:
        values = display["values"]
        if not isinstance(values, list) or len(values) > 8:
            _fail()
        seen = set()
        for value in values:
            _fields(value, {"entity"}, {"decimals", "unit", "label", "size", "color", "ranges", "dot"})
            _entity(value["entity"])
            if value["entity"] in seen:
                _fail()
            seen.add(value["entity"])
            if "decimals" in value and (type(value["decimals"]) is not int or not 0 <= value["decimals"] <= 3):
                _fail()
            for flag in ("unit", "dot"):
                if flag in value and not isinstance(value[flag], bool):
                    _fail()
            if "label" in value and (not isinstance(value["label"], str) or not value["label"].strip() or len(value["label"]) > 16):
                _fail()
            if "size" in value and value["size"] not in ("s", "m", "l"):
                _fail()
            if "color" in value:
                hex_color(value["color"])
            if "ranges" in value:
                if not isinstance(value["ranges"], list) or len(value["ranges"]) > 6:
                    _fail()
                for item in value["ranges"]:
                    _fields(item, {"from", "color"})
                    _number(item["from"], -1e9, 1e9)
                    hex_color(item["color"])
    if "valuePlace" in display and display["valuePlace"] not in ("inside", "beside", "below"):
        _fail()
    # 0.13 indicators: visual marks from one reading; at most one of each type.
    if "indicators" in display:
        indicators = display["indicators"]
        if not isinstance(indicators, list) or len(indicators) > 5:
            _fail()
        kinds = set()
        for item in indicators:
            _fields(item, {"type", "entity"}, {"attribute", "hidden", "min", "max", "width", "fill", "empty", "ranges", "states", "none", "position"})
            if item["type"] not in ("ring", "border", "icon", "led", "number") or item["type"] in kinds:
                _fail()
            kinds.add(item["type"])
            _entity(item["entity"])
            if "attribute" in item and (not isinstance(item["attribute"], str) or not re.fullmatch(r"[A-Za-z0-9_]{1,80}", item["attribute"])):
                _fail()
            if "hidden" in item and not isinstance(item["hidden"], bool):
                _fail()
            for key in ("min", "max"):
                if key in item:
                    _number(item[key], -1e9, 1e9)
            if "min" in item and "max" in item and item["min"] >= item["max"]:
                _fail()
            if "width" in item and (type(item["width"]) is not int or not 2 <= item["width"] <= 10):
                _fail()
            for key in ("fill", "empty", "none"):
                if key in item:
                    hex_color(item[key])
            if "position" in item and item["position"] not in ("tr", "br", "b"):
                _fail()
            if "ranges" in item:
                if not isinstance(item["ranges"], list) or len(item["ranges"]) > 8:
                    _fail()
                for part in item["ranges"]:
                    _fields(part, {"from", "to", "color"}, {"name"})
                    _number(part["from"], -1e9, 1e9)
                    _number(part["to"], -1e9, 1e9)
                    if part["from"] > part["to"]:
                        _fail()
                    hex_color(part["color"])
                    if "name" in part and (not isinstance(part["name"], str) or len(part["name"]) > 24):
                        _fail()
            if "states" in item:
                states = item["states"]
                if not isinstance(states, dict) or len(states) > 16:
                    _fail()
                for key, color in states.items():
                    if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_ .-]{1,40}", key) or key in UNSAFE:
                        _fail()
                    hex_color(color)
    for key, low, high in (("scale", 0.5, 2.5), ("roomScale", 0.5, 2.5), ("opacity", 0, 100)):
        if key in display:
            _number(display[key], low, high)
    if "shape" in display and display["shape"] not in ("circle", "pill", "dot", "icon"):
        _fail()
    if "standalone" in display and display["standalone"] is not True:
        _fail()


# Plan 0.12 (#97): links that may open, and Home Assistant pages. Never javascript:, data: or file:.
_BLOCKED_SCHEMES = re.compile(r"(?:javascript|data|file|vbscript|about|blob|chrome|ms-[a-z-]+):", re.I)
_LINK = re.compile(r"(?:https://[^\s\"'<>]{1,500}|[a-z][a-z0-9+.-]{1,30}:[^\s\"'<>]{1,500})", re.I)
_HA_PATH = re.compile(r"/(?!/)[A-Za-z0-9/_\-.?=&%#]{0,200}")


def _link(value: Any) -> None:
    if not isinstance(value, str) or not _LINK.fullmatch(value) or _BLOCKED_SCHEMES.match(value) or value.lower().startswith("http:"):
        _fail()


def _ha_path(value: Any) -> None:
    if not isinstance(value, str) or not _HA_PATH.fullmatch(value):
        _fail()


def _gesture_action(binding: Any, choose: bool) -> None:
    _fields(binding, {"action"}, {"controlId", "path", "url", "mobileUrl", "fallback", "fallbackPath", "options"})
    kinds = {"screen", "panel", "native", "none", "control", "more-info", "navigate", "url"} | ({"choose"} if choose else set())
    action = binding["action"]
    if action not in kinds:
        _fail()
    owners = {"controlId": "control", "path": "navigate", "url": "url", "mobileUrl": "url", "fallback": "url", "fallbackPath": "url", "options": "choose"}
    for key, kind in owners.items():
        if key in binding and action != kind:
            _fail()
    if action == "control":
        _id(binding.get("controlId"))
    if action == "navigate":
        _ha_path(binding.get("path"))
    if action == "url":
        _link(binding.get("url"))
        if "mobileUrl" in binding:
            _link(binding["mobileUrl"])
        if "fallback" in binding and binding["fallback"] not in ("screen", "panel", "more-info", "navigate"):
            _fail()
        if ("fallbackPath" in binding) != (binding.get("fallback") == "navigate"):
            _fail()
        if "fallbackPath" in binding:
            _ha_path(binding["fallbackPath"])
    if action == "choose":
        options = binding.get("options")
        if not isinstance(options, list) or not 2 <= len(options) <= 4:
            _fail()
        for item in options:
            _fields(item, {"label", "do"}, {"icon"})
            if not isinstance(item["label"], str) or not item["label"].strip() or len(item["label"]) > 40:
                _fail()
            if "icon" in item and (not isinstance(item["icon"], str) or not re.fullmatch(r"mdi:[a-z0-9]+(?:-[a-z0-9]+)*", item["icon"])):
                _fail()
            _gesture_action(item["do"], False)


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
    elif domain == "select":
        allowed = required = {"option"}
        if "option" in data:
            _text(data["option"], 1024)
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
    for gesture in ("tap", "hold"):
        binding = bindings.get(gesture)
        if binding is None:
            continue
        if isinstance(binding, str):
            _id(binding)
            if gesture == "tap" and types.get(binding) not in ("button", "cycle"):
                _fail()
        else:
            _gesture_action(binding, True)
    if "attached" in display:
        _attached(display["attached"])
    if "pinned" in display:
        pinned = display["pinned"]
        if not isinstance(pinned, list) or len(pinned) > MAX_PINNED or len(set(map(str, pinned))) != len(pinned) or any(not isinstance(item, str) or item not in types for item in pinned):
            _fail()


MAX_ATTACHED = 6


def _attached(items: Any) -> None:
    """0.13: pieces of the device's control drawn next to its symbol (see validation.mjs)."""
    if not isinstance(items, list) or len(items) > MAX_ATTACHED:
        _fail()
    ids = set()

    def between(value: Any, low: int, high: int) -> bool:
        return type(value) is int and low <= value <= high

    for item in items:
        _fields(item, {"id", "piece", "dx", "dy", "w", "h"}, {"locked", "fixedSize", "look"})
        for key in ("id", "piece"):
            if not isinstance(item[key], str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", item[key]) or item[key] in UNSAFE:
                _fail()
        if item["id"] in ids:
            _fail()
        ids.add(item["id"])
        if not between(item["dx"], -600, 600) or not between(item["dy"], -600, 600) or not between(item["w"], 24, 480) or not between(item["h"], 20, 320):
            _fail()
        for key in ("locked", "fixedSize"):
            if key in item and item[key] is not True:
                _fail()
        if "look" not in item:
            continue
        look = item["look"]
        _fields(look, set(), {"fontSize", "valueSize", "bg", "fg", "radius", "relief", "opacity"})
        if "fontSize" in look and not between(look["fontSize"], 8, 40):
            _fail()
        if "valueSize" in look and not between(look["valueSize"], 12, 40):
            _fail()
        for key in ("bg", "fg"):
            if key in look and (not isinstance(look[key], str) or not re.fullmatch(r"#[0-9A-Fa-f]{6}", look[key])):
                _fail()
        if "radius" in look and not between(look["radius"], 0, 60) and not (type(look["radius"]) is int and look["radius"] == 999):
            _fail()
        if "relief" in look and look["relief"] not in ("raised", "flat", "outline"):
            _fail()
        if "opacity" in look and not between(look["opacity"], 30, 100):
            _fail()


def validate_configuration(configuration: Any) -> dict[str, Any]:
    """Validate all persistent fields; pending action/panel references stay inert."""
    _json(configuration)
    _fields(configuration, {"schemaVersion", "rooms", "catalog", "architecture", "actions", "panels", "stateSources"}, {"commandTtlSeconds", "rules", "planViews", "nowPanels", "symbolSizes", "initialView", "baseRules", "pinnedAutomations", "planWidthMetres"})
    if type(configuration["schemaVersion"]) is not int or configuration["schemaVersion"] != SCHEMA_VERSION:
        raise ModelError("unsupported_schema", "schemaVersion 2 required; migrate in the editor first")
    if len(json.dumps(configuration, ensure_ascii=False, separators=(",", ":")).encode()) > MAX_CONFIGURATION_BYTES:
        raise ModelError("configuration_too_large", "the configuration exceeds 3 MiB")
    rooms = configuration["rooms"]
    if not isinstance(rooms, list) or len(rooms) > 200:
        _fail()
    room_ids: set[str] = set()
    for room in rooms:
        _fields(room, {"id", "label"}, {"icon", "shape", "rects", "outline", "shapeSource", "frame", "nav", "areaId"})
        if "areaId" in room:
            _text(room["areaId"])
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
        if "rects" in room:
            rects = room["rects"]
            if "shape" not in room or type(rects) is not list or not 2 <= len(rects) <= MAX_ROOM_RECTS:
                _fail()
            for rect in rects:
                _shape(rect)
        if "outline" in room:
            outline = room["outline"]
            if room.get("shapeSource") != "app" or "rects" in room or type(outline) is not list or not 1 <= len(outline) <= MAX_OUTLINE_RINGS:
                _fail()
            for ring in outline:
                if type(ring) is not list or not 3 <= len(ring) <= MAX_OUTLINE_POINTS:
                    _fail()
                for point in ring:
                    if type(point) is not list or len(point) != 2 or any(type(value) not in (int, float) or isinstance(value, bool) or not 0 <= value <= 1 for value in point):
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
        _fields(display, {"label", "icon"}, {"size", "pinned", "attached", "archetype", "show", "category", "alerts", "highlight", "modules", "layer", "disabledBaseRules", "color", "values", "valuePlace", "scale", "roomScale", "opacity", "shape", "standalone", "indicators"})
        _symbol_look(display)
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
        if "color" in display and (not isinstance(display["color"], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", display["color"])):
            _fail()
        if "modules" in display:
            modules = display["modules"]
            if not isinstance(modules, list) or len(modules) > 7 or any(not isinstance(m, str) or m not in ("device", "indicators", "gestures", "control", "pinned", "native", "rules") for m in modules) or len(set(modules)) != len(modules):
                _fail()
        if "layer" in display and display["layer"] not in ("controls", "sensors", "energy", "infrastructure"):
            _fail()
        if "disabledBaseRules" in display:
            disabled = display["disabledBaseRules"]
            if not isinstance(disabled, list) or len(disabled) > 3 or any(not isinstance(key, str) or key not in ("safety", "battery", "unavailable") for key in disabled) or len(set(disabled)) != len(disabled):
                _fail()
        if "alerts" in display:
            rules = display["alerts"]
            if not isinstance(rules, list) or len(rules) > 2000:
                _fail()
            for rule in rules:
                _fields(rule, {"reading", "level"}, {"below", "above", "forMinutes", "enabled"})
                if "enabled" in rule and type(rule["enabled"]) is not bool:
                    _fail()
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
        _fields(bindings, {"entityId", "primaryAction", "advancedPopupId"}, {"quickActions", "remoteId", "irRemoteId", "controls", "tap", "deviceId", "readings", "hold", "layout"})
        if "layout" in bindings:
            validate_control_layout(bindings["layout"])
        if "deviceId" in bindings:
            _text(bindings["deviceId"])
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", bindings["deviceId"]) or bindings["deviceId"] in UNSAFE:
                _fail()
        if "readings" in bindings:
            readings = bindings["readings"]
            if not isinstance(readings, list) or len(readings) > 31:
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
        if (infrared := bindings.get("irRemoteId")) is not None:
            if not isinstance(infrared, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", infrared):
                _fail()
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
    # Plan 0.12 (#94): symbol size by view and zoom, and the initial view. Optional.
    if "symbolSizes" in configuration:
        sizes = configuration["symbolSizes"]
        _fields(sizes, {"house", "room", "min", "max"})
        for key in ("house", "room", "min", "max"):
            _number(sizes[key], 0.5, 2.5)
    # Plan 0.12 (#60): the automatic rules' switches and limits. Absent: as before.
    if "baseRules" in configuration:
        rules = configuration["baseRules"]
        _fields(rules, set(), {"battery", "unavailable", "safety"})
        for key, extra, low, high in (("battery", "below", 1, 100), ("unavailable", "minutes", 1, 1440), ("safety", None, 0, 0)):
            if key in rules:
                _fields(rules[key], set(), {"enabled"} | ({extra} if extra else set()))
                if "enabled" in rules[key] and not isinstance(rules[key]["enabled"], bool):
                    _fail()
                if extra and extra in rules[key]:
                    _number(rules[key][extra], low, high)
    if "initialView" in configuration:
        view = configuration["initialView"]
        _fields(view, {"room", "x", "y", "zoom"}, {"planView"})
        if view["room"] is not None and (not isinstance(view["room"], str) or len(view["room"]) > 64 or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", view["room"])):
            _fail()
        _number(view["x"], -1, 2)
        _number(view["y"], -1, 2)
        _number(view["zoom"], 0.5, 16)
        if "planView" in view and (not isinstance(view["planView"], str) or len(view["planView"]) > 64 or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", view["planView"])):
            _fail()
    if "nowPanels" in configuration:
        panels = configuration["nowPanels"]
        _fields(panels, set(), {"home", "wall"})
        for blocks in panels.values():
            if not isinstance(blocks, list) or len(blocks) > 32:
                _fail()
            ids = set()
            for block in blocks:
                _fields(block, {"id", "type"}, {"title", "devices", "readings", "deviceId", "controlId", "roomId"})
                _id(block["id"])
                if block["id"] in ids or block["type"] not in ("alerts", "climate", "reading", "readings", "active", "energy", "control", "shortcut"):
                    _fail()
                ids.add(block["id"])
                if "title" in block:
                    _text(block["title"])
                for key in ("deviceId", "controlId", "roomId"):
                    if key in block:
                        _id(block[key])
                for key in ("devices", "readings"):
                    if key in block:
                        values = block[key]
                        if not isinstance(values, list) or len(values) > (2000 if key == "devices" else 200) or any(not isinstance(v, str) for v in values) or len(set(values)) != len(values):
                            _fail()
                        for value in values:
                            if key == "devices":
                                _id(value)
                            elif len(value) > 240 or (not re.fullmatch(r"[a-z][a-z0-9_]*\.[a-z0-9_]+", value) or value.endswith(".all")):
                                _fail()
    if "planWidthMetres" in configuration:
        width = configuration["planWidthMetres"]
        if isinstance(width, bool) or not isinstance(width, (int, float)) or not math.isfinite(width) or width < 0.5 or width > 10000:
            _fail()
    if "pinnedAutomations" in configuration:
        pins = configuration["pinnedAutomations"]
        if not isinstance(pins, list) or len(pins) > 12:
            _fail()
        seen = set()
        for pin in pins:
            _fields(pin, {"id", "icon"})
            if not isinstance(pin["id"], str) or not re.fullmatch(r"homemanager_[a-z0-9_]{1,52}", pin["id"]) or pin["id"] in seen:
                _fail()
            if not isinstance(pin["icon"], str) or not MDI_ICON.fullmatch(pin["icon"]):
                _fail()
            seen.add(pin["id"])
    if "planViews" in configuration:
        views = configuration["planViews"]
        if not isinstance(views, list) or len(views) > 12:
            _fail()
        ids = set()
        for view in views:
            _fields(view, {"id", "name"}, {"light", "dark", "lightBackground", "darkBackground"})
            _id(view["id"])
            _text(view["name"])
            if view["id"] in ids or not ("light" in view or "dark" in view):
                _fail()
            ids.add(view["id"])
            for mode in ("light", "dark"):
                if mode in view:
                    image = view[mode]
                    _fields(image, {"scope", "sha256", "format", "box"})
                    if not isinstance(image["scope"], str) or len(image["scope"]) > 64 or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", image["scope"]) or not isinstance(image["sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", image["sha256"]) or image["format"] not in ("svg", "png", "jpg"):
                        _fail()
                    if not isinstance(image["box"], list) or len(image["box"]) != 4:
                        _fail()
                    for i, value in enumerate(image["box"]):
                        _number(value, -10000000, 10000000)
                        if i > 1 and value <= 0:
                            _fail()
                bg = view.get(mode + "Background", "transparent")
                if not isinstance(bg, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}|transparent", bg):
                    _fail()
    if "rules" in configuration:
        rules = configuration["rules"]
        if not isinstance(rules, list) or len(rules) > 2000:
            _fail()
        rule_ids = set()
        for rule in rules:
            _fields(rule, {"id", "name", "enabled", "sources", "symbols", "level"}, {"below", "above", "state", "forMinutes", "badge", "highlight", "color", "bar", "now"})
            _id(rule["id"])
            if rule["id"] in rule_ids:
                _fail()
            rule_ids.add(rule["id"])
            _text(rule["name"])
            if rule["level"] not in ("alert", "warning", "indicator"):
                _fail()
            for key in ("enabled", "badge", "highlight", "bar", "now"):
                if key in rule and type(rule[key]) is not bool:
                    _fail()
            for key in ("below", "above", "forMinutes"):
                if key in rule and (type(rule[key]) not in (int, float) or not math.isfinite(rule[key]) or (key == "forMinutes" and rule[key] < 0)):
                    _fail()
            if "color" in rule and (not isinstance(rule["color"], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", rule["color"])):
                _fail()
            sources = rule["sources"]
            if not isinstance(sources, list) or not 1 <= len(sources) <= 2000:
                _fail()
            readings = set()
            binary = None
            for source in sources:
                _fields(source, {"reading"}, {"deviceId"})
                _entity(source["reading"])
                reading = source["reading"]
                if not reading.startswith(("sensor.", "binary_sensor.")) or reading in readings:
                    _fail()
                readings.add(reading)
                current = reading.startswith("binary_sensor.")
                if binary is not None and current != binary:
                    _fail()
                binary = current
                if "deviceId" in source:
                    _text(source["deviceId"])
                    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", source["deviceId"]) or source["deviceId"] in UNSAFE:
                        _fail()
            if binary:
                if "below" in rule or "above" in rule or ("state" in rule and rule["state"] not in ("on", "off")):
                    _fail()
            elif "state" in rule or not ({"below", "above"} & rule.keys()):
                _fail()
            symbols = rule["symbols"]
            if not isinstance(symbols, list) or len(symbols) > 2000:
                _fail()
            for symbol in symbols:
                _id(symbol)
            if len(set(symbols)) != len(symbols):
                _fail()
    if "commandTtlSeconds" in configuration:
        _number(configuration["commandTtlSeconds"], 1, 300, True)
    return deepcopy(configuration)


def validate_control_layout(layout: Any) -> None:
    counts = {'button': (1, 1), 'toggle': (1, 2), 'updown': (2, 2), 'steps': (2, 12), 'modes': (2, 8), 'cycle': (2, 4), 'slider': (2, 12), 'indicator': (0, 0), 'title': (0, 0), 'separator': (0, 0), 'control': (1, 1), 'knob': (2, 12), 'preset': (1, 12), 'graph': (0, 0), 'canvas': (0, 0), **{kind: (0, len(keys)) for kind, keys in BLOCK_SLOTS.items()}}
    if not isinstance(layout, list) or len(layout) > 64:
        _fail()
    # 0.13: an optional canvas piece sets the grid (2-30 columns, 2-40 rows).
    canvases = [p for p in layout if isinstance(p, dict) and p.get("type") == "canvas"]
    if len(canvases) > 1:
        _fail()
    columns = canvases[0].get("w") if canvases else 4
    if type(columns) is not int or not 2 <= columns <= 30:
        _fail()
    ids = set()
    for p in layout:
        _fields(p, {"id", "type", "x", "y", "w", "h", "buttons", "label", "icon"}, {"reading", "attribute", "bg", "fg", "shape", "hideIcon", "hideLabel", "orientation", "sequence", *LOOK_KEYS})
        if not isinstance(p["id"], str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", p["id"]) or p["id"] in UNSAFE or p["id"] in ids:
            _fail()
        ids.add(p["id"])
        if not isinstance(p["type"], str) or p["type"] not in counts:
            _fail()
        canvas = p["type"] == "canvas"
        bounds = [("x", 0, 0), ("y", 0, 0), ("w", 2, 30), ("h", 2, 40)] if canvas else [("x", 0, columns - 1), ("y", 0, 39), ("w", 1, columns), ("h", 1, 12)]
        for k, low, high in bounds:
            if type(p[k]) is not int or not low <= p[k] <= high:
                _fail()
        if p["x"] + p["w"] > (30 if canvas else columns):
            _fail()
        low, high = inputs(p["type"], p, counts[p["type"]])
        if not isinstance(p["buttons"], list) or not low <= len(p["buttons"]) <= high:
            _fail()
        for ref in p["buttons"]:
            _id(ref)
        try:
            check_piece(p, p["type"], p["buttons"], lambda ref: bool(ID.fullmatch(ref)) and ref not in UNSAFE)
        except LookError:
            _fail()
        if p["label"] is not None:
            _text(p["label"], 40)
        if p["icon"] is not None and (not isinstance(p["icon"], str) or not MDI_ICON.fullmatch(p["icon"])):
            _fail()
        if "reading" in p:
            _entity(p["reading"])
        if "attribute" in p and (not isinstance(p["attribute"], str) or not re.fullmatch(r"[A-Za-z0-9_]{1,80}", p["attribute"])):
            _fail()
        for key in ("bg", "fg"):
            if key in p and (not isinstance(p[key], str) or not re.fullmatch(r"#[0-9A-Fa-f]{6}", p[key])):
                _fail()
        if "shape" in p and p["shape"] not in ("round", "square"):
            _fail()
        for key in ("hideIcon", "hideLabel"):
            if key in p and not isinstance(p[key], bool):
                _fail()
        if "orientation" in p and (p["orientation"] != "vertical" or p["type"] not in ("updown", "slider", "steps")):
            _fail()
        if p["type"] == "preset" or "sequence" in p:
            sequence = p.get("sequence")
            if p["type"] != "preset" or not isinstance(sequence, list) or not 1 <= len(sequence) <= 24:
                _fail()
            for step in sequence:
                if isinstance(step, dict) and set(step) == {"wait"}:
                    if type(step["wait"]) is not int or not 50 <= step["wait"] <= 5000:
                        _fail()
                elif isinstance(step, dict) and "button" in step and set(step) <= {"button", "times"}:
                    if step["button"] not in p["buttons"] or ("times" in step and (type(step["times"]) is not int or not 1 <= step["times"] <= 10)):
                        _fail()
                else:
                    _fail()
