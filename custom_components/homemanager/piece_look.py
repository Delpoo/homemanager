"""How a designed control piece looks and behaves (0.13 designer, second part).

Shared by the remote library (rf_model) and the plan configuration (validation),
and mirrored by src/ha/validation.mjs. Everything here is optional: a layout
saved before has none of it and stays valid. Pure checks, no Home Assistant.
"""

from __future__ import annotations

from collections.abc import Callable
import math
import re
from typing import Any

COLOR = re.compile(r"#[0-9A-Fa-f]{6}\Z")
ICON = re.compile(r"mdi:[a-z0-9]+(?:-[a-z0-9]+)*\Z")
# Pieces that step through levels, and pieces that pick one of several options.
LEVELS = ("updown", "slider", "steps", "knob")
MODES = ("modes", "cycle")
# Ready-made blocks and the keys each one has.
BLOCK_SLOTS = {
    "dpad": ("up", "down", "left", "right", "ok"),
    "numpad": ("1", "2", "3", "4", "5", "6", "7", "8", "9", "dash", "0", "enter"),
    "transport": ("prev", "rew", "play", "ff", "next"),
    "colors": ("red", "green", "yellow", "blue"),
}
THEMES = ("grafito", "claro", "arena", "vidrio")
MAX_LEVELS = 24
LOOK_KEYS = frozenset(
    {
        "fontSize", "fontWeight", "iconSize", "border", "active", "radius", "relief", "anim", "brand",
        "hold", "holdButton", "values", "names", "wrap", "sendBy", "display", "valueSize",
        "options", "slots", "period", "theme", "gap", "chart",
    }
)


class LookError(ValueError):
    """A piece field outside the shared contract."""


def _check(ok: bool, what: str) -> None:
    if not ok:
        raise LookError(what)


def _int(value: Any, low: int, high: int) -> bool:
    return type(value) is int and low <= value <= high


def _label(value: Any, limit: int) -> bool:
    return isinstance(value, str) and bool(value.strip()) and len(value) <= limit


def level_count(raw: dict[str, Any]) -> int | None:
    """How many levels a piece declares, or None when it does not say."""
    if isinstance(raw.get("names"), list):
        return len(raw["names"])
    values = raw.get("values")
    if isinstance(values, dict) and all(_int(values.get(k), -9999, 9999) for k in ("min", "max")) and _int(values.get("step"), 1, 9999):
        return (values["max"] - values["min"]) // values["step"] + 1
    return None


def send_by(kind: str, raw: dict[str, Any]) -> str:
    return raw.get("sendBy") or ("updown" if kind == "updown" else "level")


def inputs(kind: str, raw: dict[str, Any], default: tuple[int, int]) -> tuple[int, int]:
    """How many learned buttons a piece uses, given what it says about itself."""
    if kind in BLOCK_SLOTS:
        return (0, len(BLOCK_SLOTS[kind]))
    if kind not in LEVELS:
        return default
    mode = send_by(kind, raw)
    if mode == "updown":
        return (2, 2)
    if mode == "advance":
        return (1, 1)
    count = level_count(raw)
    return (count, count) if count is not None else (2, MAX_LEVELS)


def check_piece(raw: dict[str, Any], kind: str, used: list[str], is_ref: Callable[[str], bool]) -> dict[str, Any]:
    """Checks the optional fields of one piece and returns the ones it has."""
    look: dict[str, Any] = {}
    present = LOOK_KEYS & raw.keys()
    drawn = kind != "canvas"
    for key in present:
        value = raw[key]
        if key == "fontSize":
            _check(drawn and _int(value, 8, 40), key)
        elif key == "fontWeight":
            _check(drawn and type(value) is int and value in (400, 500, 700), key)
        elif key == "iconSize":
            _check(drawn and _int(value, 12, 64), key)
        elif key in ("border", "active"):
            _check(drawn and isinstance(value, str) and bool(COLOR.fullmatch(value)), key)
        elif key == "radius":
            _check(_int(value, 0, 60) or (drawn and type(value) is int and value == 999), key)
        elif key == "relief":
            _check(drawn and value in ("flat", "outline"), key)
        elif key == "anim":
            _check(drawn and value in ("flash", "none"), key)
        elif key == "brand":
            _check(kind == "button" and _label(value, 40), key)
        elif key == "hold":
            _check(value == "repeat" and kind in ("button", *LEVELS) or value == "other" and kind == "button", key)
        elif key == "holdButton":
            _check(raw.get("hold") == "other" and isinstance(value, str) and is_ref(value), key)
        elif key == "values":
            _check(kind in LEVELS and "names" not in raw and isinstance(value, dict), key)
            _check({"min", "max", "step"} <= value.keys() <= {"min", "max", "step", "unit"}, key)
            _check(_int(value["min"], -9999, 9999) and _int(value["max"], -9999, 9999) and value["min"] < value["max"], key)
            _check(_int(value["step"], 1, 9999) and (value["max"] - value["min"]) // value["step"] + 1 <= 1000, key)
            _check("unit" not in value or isinstance(value["unit"], str) and len(value["unit"]) <= 6, key)
        elif key == "names":
            _check(kind in LEVELS and isinstance(value, list) and 2 <= len(value) <= MAX_LEVELS, key)
            _check(all(_label(name, 20) for name in value), key)
        elif key == "wrap":
            _check(kind in (*LEVELS, *MODES) and isinstance(value, bool), key)
        elif key == "sendBy":
            _check(kind in LEVELS and value in ("updown", "advance", "level"), key)
        elif key == "display":
            _check(kind in LEVELS and value in ("value", "name", "dots", "text") or kind == "modes" and value == "list", key)
        elif key == "valueSize":
            _check(kind in LEVELS and _int(value, 12, 40), key)
        elif key == "options":
            _check(kind in MODES and isinstance(value, list) and len(value) == len(used), key)
            for option in value:
                _check(isinstance(option, dict) and option.keys() <= {"label", "icon"}, key)
                _check(option.get("label") is None or _label(option["label"], 20), key)
                _check(option.get("icon") is None or isinstance(option["icon"], str) and bool(ICON.fullmatch(option["icon"])), key)
        elif key == "slots":
            _check(kind in BLOCK_SLOTS and isinstance(value, dict) and value.keys() <= set(BLOCK_SLOTS[kind]), key)
            _check(all(isinstance(ref, str) and is_ref(ref) for ref in value.values()), key)
        elif key == "period":
            _check((kind == "graph" or "chart" in raw) and value in ("1h", "24h", "7d", "30d"), key)
        elif key == "chart":
            _check(kind not in ("canvas", "title", "separator") and isinstance(value, dict) and value.keys() <= {
                "scale", "min", "max", "style", "precision", "digits", "unit", "reading", "attribute",
            }, key)
            _check("reading" not in value or isinstance(value["reading"], str)
                   and re.fullmatch(r"[a-z0-9_]+\.[a-z0-9_]+", value["reading"]), key)
            _check("attribute" not in value or isinstance(value["attribute"], str)
                   and re.fullmatch(r"[a-zA-Z0-9_]{1,80}", value["attribute"]), key)
            _check(value.get("scale", "auto") in ("auto", "fixed", "log"), key)
            _check(value.get("style", "area") in ("area", "line"), key)
            _check(value.get("precision", "decimals") in ("decimals", "significant"), key)
            _check("digits" not in value or _int(value["digits"], 1 if value.get("precision") == "significant" else 0, 6), key)
            _check("unit" not in value or isinstance(value["unit"], str) and len(value["unit"]) <= 16, key)
            _check(all(name not in value or type(value[name]) in (int, float) and abs(value[name]) < math.inf
                       for name in ("min", "max")), key)
            _check(value.get("scale") != "fixed" or "min" in value and "max" in value and value["min"] < value["max"], key)
        elif key == "theme":
            _check(kind == "canvas" and value in THEMES, key)
        elif key == "gap":
            _check(kind == "canvas" and _int(value, 2, 24), key)
        look[key] = value
    _check(raw.get("hold") != "other" or "holdButton" in raw, "holdButton")
    if kind in LEVELS and send_by(kind, raw) == "level":
        _check((level_count(raw) or 0) <= MAX_LEVELS, "levels")
    if kind in BLOCK_SLOTS:
        # A block uses exactly the buttons its keys send, each once.
        slots = raw.get("slots") or {}
        _check(len(set(used)) == len(used) and set(used) == set(slots.values()), "slots")
    return look
