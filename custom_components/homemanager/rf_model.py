"""RF remote library: remotes, their transmission settings, buttons, parts and layout.

A remote groups the buttons of one physical control. Everything that must be
identical for all its buttons lives on the remote: which transmitter reaches
the equipment, the RCSwitch protocol, the code length, the pulse length and how
the burst is sent (repeats and the wait between frames).

- A button is a name, an optional icon and its code. It has no fixed meaning.
- A part is what Home Assistant sees: a fan or a light built from some of the
  buttons, each with a role inside that part ("off" of the light is not "off"
  of the fan). Buttons outside every part become button entities.
- The layout is how the remote is drawn: widgets on a grid of four columns.
  `None` means "not designed yet": the frontend draws a default one.

Codes never leave the backend: `public()` replaces them with a fingerprint so
browsers can tell buttons apart without being able to replay them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import re
from typing import Any

from .model import ModelError
from .rf_codec import MAX_BITS, MIN_BITS, PROTOCOLS

ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
CODE = re.compile(r"^[01]+$")
ICON = re.compile(r"^mdi:[a-z0-9-]{1,64}$")
# Node names of ESPHome devices (they prefix the device's action names).
TRANSMITTER = re.compile(r"^[a-z0-9_]{1,64}$")
MAX_REMOTES = 64
MAX_BUTTONS = 64
MAX_PARTS = 8
MAX_NAME = 80
MAX_DESCRIPTION = 200
MAX_SPEEDS = 12
SPEED_ROLES = tuple(f"speed_{level}" for level in range(1, MAX_SPEEDS + 1))
ROLES = {
    "fan": frozenset({"on", "off", "toggle", "speed_up", "speed_down", "direction", *SPEED_ROLES}),
    "light": frozenset({"on", "off", "toggle"}),
}
# Grid of the remote designer.
COLUMNS = 4
MAX_ROWS = 40
MAX_HEIGHT = 3
MAX_WIDGETS = 64
MAX_LABEL = 40
# How many buttons each widget type uses, in order:
# button [press]; toggle [on or toggle, off?]; updown [down, up];
# steps [1, 2, ...]; modes [one per mode].
WIDGETS = {"button": (1, 1), "toggle": (1, 2), "updown": (2, 2), "steps": (2, MAX_SPEEDS), "modes": (2, 8)}
# Defaults for a new remote: what most 433 MHz fan remotes use. The capture
# replaces protocol, length and pulse with measured values.
DEFAULTS = {"protocol": 1, "nbits": 24, "pulse_us": 350, "repeats": 5, "wait_us": 0}
LIMITS = {"pulse_us": (50, 2000), "repeats": (1, 20), "wait_us": (0, 100_000)}
DEFAULT_ICON = "mdi:remote"


def _text(value: Any, name: str, limit: int = MAX_NAME) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        raise ModelError("invalid_rf", f"{name} must be 1-{limit} characters")
    return value.strip()


def _optional_text(value: Any, name: str, limit: int) -> str | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    return _text(value, name, limit)


def _icon(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str) or not ICON.match(value):
        raise ModelError("invalid_rf", "icon must look like mdi:name")
    return value


def _id(value: Any, name: str, error: str = "invalid_rf") -> str:
    if not isinstance(value, str) or not ID.match(value):
        raise ModelError(error, f"{name} must be lowercase letters, digits, '-' or '_'")
    return value


def _int(value: Any, name: str, low: int, high: int, error: str = "invalid_rf") -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise ModelError(error, f"{name} must be an integer between {low} and {high}")
    return value


def fingerprint(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()[:8]


def slug(name: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48] or "item"
    candidate, index = base, 2
    while candidate in taken:
        candidate, index = f"{base}-{index}", index + 1
    return candidate


@dataclass
class Button:
    button_id: str
    name: str
    code: str
    icon: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {"name": self.name, "code": self.code, "icon": self.icon}

    def public(self) -> dict[str, Any]:
        return {"id": self.button_id, "name": self.name, "icon": self.icon, "fingerprint": fingerprint(self.code)}


@dataclass
class Part:
    """A fan or a light for Home Assistant, made of buttons with roles."""

    part_id: str
    name: str
    kind: str
    # Number of speeds of a fan whose remote only has "faster/slower" buttons.
    speeds: int | None = None
    roles: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, part_id: str, raw: dict[str, Any]) -> Part:
        if not isinstance(raw, dict):
            raise ModelError("invalid_rf", "a part must be an object")
        kind = raw.get("kind")
        if kind not in ROLES:
            raise ModelError("invalid_rf", "a part is a fan or a light")
        roles = raw.get("roles") or {}
        if not isinstance(roles, dict) or any(role not in ROLES[kind] or not isinstance(button, str) for role, button in roles.items()):
            raise ModelError("invalid_rf", f"unknown role for a {kind}")
        speeds = raw.get("speeds")
        if speeds is not None:
            _int(speeds, "speeds", 1, MAX_SPEEDS)
        return cls(_id(part_id, "part id"), _text(raw.get("name"), "name"), kind, speeds if kind == "fan" else None, dict(roles))

    def as_dict(self) -> dict[str, Any]:
        return {"name": self.name, "kind": self.kind, "speeds": self.speeds, "roles": dict(self.roles)}

    def public(self) -> dict[str, Any]:
        return {"id": self.part_id, **self.as_dict()}


def _widget(raw: Any, buttons: dict[str, Button], taken: set[str]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ModelError("invalid_layout", "a widget must be an object")
    kind = raw.get("type")
    if kind not in WIDGETS:
        raise ModelError("invalid_layout", "unknown widget type")
    widget_id = _id(raw.get("id"), "widget id", "invalid_layout")
    if widget_id in taken:
        raise ModelError("invalid_layout", "widget ids must be unique")
    x, y = _int(raw.get("x"), "x", 0, COLUMNS - 1, "invalid_layout"), _int(raw.get("y"), "y", 0, MAX_ROWS - 1, "invalid_layout")
    w, h = _int(raw.get("w"), "w", 1, COLUMNS - x, "invalid_layout"), _int(raw.get("h"), "h", 1, MAX_HEIGHT, "invalid_layout")
    used = raw.get("buttons")
    low, high = WIDGETS[kind]
    if not isinstance(used, list) or not low <= len(used) <= high or any(button not in buttons for button in used):
        raise ModelError("invalid_layout", f"a {kind} uses {low}-{high} of this remote's buttons")
    return {
        "id": widget_id,
        "type": kind,
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "buttons": list(used),
        "label": _optional_text(raw.get("label"), "label", MAX_LABEL),
        "icon": _icon(raw.get("icon")),
    }


def validate_layout(raw: Any, buttons: dict[str, Button]) -> list[dict[str, Any]] | None:
    """Checks a designed layout. Overlaps are the designer's business, bounds and
    button references are not: a widget never points at a missing button."""
    if raw is None:
        return None
    if not isinstance(raw, list) or len(raw) > MAX_WIDGETS:
        raise ModelError("invalid_layout", f"a layout holds at most {MAX_WIDGETS} widgets")
    taken: set[str] = set()
    widgets = []
    for item in raw:
        widget = _widget(item, buttons, taken)
        taken.add(widget["id"])
        widgets.append(widget)
    return widgets


@dataclass
class Remote:
    remote_id: str
    name: str
    transmitter: str
    protocol: int = DEFAULTS["protocol"]
    nbits: int = DEFAULTS["nbits"]
    pulse_us: int = DEFAULTS["pulse_us"]
    repeats: int = DEFAULTS["repeats"]
    wait_us: int = DEFAULTS["wait_us"]
    icon: str | None = None
    description: str | None = None
    # Pulse length read from the first captured signal, kept to tell a
    # measured setting from one adjusted by hand.
    measured_pulse_us: int | None = None
    buttons: dict[str, Button] = field(default_factory=dict)
    parts: dict[str, Part] = field(default_factory=dict)
    layout: list[dict[str, Any]] | None = None

    @classmethod
    def from_input(cls, remote_id: str, raw: dict[str, Any], previous: Remote | None = None) -> Remote:
        """Validates user input. Buttons, parts and layout are edited separately."""

        def pick(key: str, default: Any) -> Any:
            return raw[key] if key in raw else getattr(previous, key) if previous else default

        remote = cls(
            remote_id=_id(remote_id, "remote id"),
            name=_text(raw.get("name"), "name"),
            transmitter=pick("transmitter", None),
            protocol=pick("protocol", DEFAULTS["protocol"]),
            nbits=pick("nbits", DEFAULTS["nbits"]),
            pulse_us=pick("pulse_us", DEFAULTS["pulse_us"]),
            repeats=pick("repeats", DEFAULTS["repeats"]),
            wait_us=pick("wait_us", DEFAULTS["wait_us"]),
            icon=_icon(pick("icon", None)),
            description=_optional_text(pick("description", None), "description", MAX_DESCRIPTION),
            measured_pulse_us=pick("measured_pulse_us", None),
            buttons=dict(previous.buttons) if previous else {},
            parts=dict(previous.parts) if previous else {},
            layout=previous.layout if previous else None,
        )
        remote.validate()
        return remote

    def validate(self) -> None:
        if not isinstance(self.transmitter, str) or not TRANSMITTER.match(self.transmitter):
            raise ModelError("invalid_rf", "transmitter must be an ESPHome device name")
        if self.protocol not in PROTOCOLS:
            raise ModelError("invalid_rf", f"protocol must be one of {sorted(PROTOCOLS)}")
        _int(self.nbits, "nbits", MIN_BITS, MAX_BITS)
        for key, (low, high) in LIMITS.items():
            _int(getattr(self, key), key, low, high)
        if self.measured_pulse_us is not None:
            _int(self.measured_pulse_us, "measured_pulse_us", *LIMITS["pulse_us"])
        if len(self.buttons) > MAX_BUTTONS:
            raise ModelError("too_many_buttons", f"a remote holds at most {MAX_BUTTONS} buttons")
        for button in self.buttons.values():
            self.check_code(button.code)
        if len(self.parts) > MAX_PARTS:
            raise ModelError("invalid_rf", f"a remote has at most {MAX_PARTS} parts")
        for part in self.parts.values():
            if any(button not in self.buttons for button in part.roles.values()):
                raise ModelError("invalid_rf", "a role points at a missing button")
        self.layout = validate_layout(self.layout, self.buttons)

    def check_code(self, code: Any) -> str:
        if not isinstance(code, str) or not CODE.match(code) or len(code) != self.nbits:
            # Changing the code length of a remote with buttons lands here too.
            raise ModelError("invalid_code", f"codes of this remote are {self.nbits} bits")
        return code

    def put_button(self, button_id: str | None, raw: dict[str, Any], code: str | None, role: dict[str, Any] | None = None) -> Button:
        """Creates or edits a button; `role` optionally gives it a role in a part."""
        previous = self.buttons.get(button_id) if button_id else None
        if button_id and previous is None:
            raise ModelError("button_not_found", "unknown button")
        name = _text(raw.get("name"), "name")
        if code is None and previous is None:
            raise ModelError("invalid_code", "a new button needs a captured code")
        if previous is None and len(self.buttons) >= MAX_BUTTONS:
            raise ModelError("too_many_buttons", f"a remote holds at most {MAX_BUTTONS} buttons")
        button = Button(
            button_id=button_id or slug(name, set(self.buttons)),
            name=name,
            code=self.check_code(code) if code is not None else previous.code,  # type: ignore[union-attr]
            icon=_icon(raw["icon"]) if "icon" in raw else previous.icon if previous else None,
        )
        part = None
        if role is not None:
            part = self.parts.get(role.get("part", ""))
            if part is None:
                raise ModelError("part_not_found", "unknown part")
            if role.get("role") not in ROLES[part.kind]:
                raise ModelError("invalid_rf", f"unknown role for a {part.kind}")
        self.buttons[button.button_id] = button
        if part is not None:
            part.roles[role["role"]] = button.button_id  # type: ignore[index]
        if previous is None and self.layout is not None:
            self._append_widget(button.button_id)
        return button

    def _append_widget(self, button_id: str) -> None:
        """A newly learned button appears at the bottom of a designed remote."""
        taken = {widget["id"] for widget in self.layout or []}
        row = max((widget["y"] + widget["h"] for widget in self.layout or []), default=0)
        if row >= MAX_ROWS or len(self.layout or []) >= MAX_WIDGETS:
            return
        self.layout = [*(self.layout or []), {"id": slug(f"b-{button_id}", taken), "type": "button", "x": 0, "y": row, "w": 1, "h": 1, "buttons": [button_id], "label": None, "icon": None}]

    def delete_button(self, button_id: str) -> None:
        if button_id not in self.buttons:
            raise ModelError("button_not_found", "unknown button")
        del self.buttons[button_id]
        for part in self.parts.values():
            part.roles = {role: button for role, button in part.roles.items() if button != button_id}
        if self.layout is not None:
            # Widgets that keep enough buttons survive without the deleted one.
            kept = []
            for widget in self.layout:
                used = [button for button in widget["buttons"] if button != button_id]
                if len(used) >= WIDGETS[widget["type"]][0]:
                    kept.append({**widget, "buttons": used})
            self.layout = kept

    def put_parts(self, raw: list[dict[str, Any]]) -> None:
        """Replaces all parts. Entries without an id are new parts."""
        if not isinstance(raw, list) or len(raw) > MAX_PARTS:
            raise ModelError("invalid_rf", f"a remote has at most {MAX_PARTS} parts")
        parts: dict[str, Part] = {}
        for item in raw:
            part_id = item.get("id") if isinstance(item, dict) else None
            if part_id is None:
                part_id = slug(_text(item.get("name") if isinstance(item, dict) else None, "name"), set(parts) | set(self.parts))
            if part_id in parts:
                raise ModelError("invalid_rf", "part ids must be unique")
            parts[part_id] = Part.from_dict(part_id, item)
        self.parts = parts
        self.validate()

    def settings(self) -> dict[str, Any]:
        return {
            "transmitter": self.transmitter,
            "protocol": self.protocol,
            "nbits": self.nbits,
            "pulse_us": self.pulse_us,
            "repeats": self.repeats,
            "wait_us": self.wait_us,
            "measured_pulse_us": self.measured_pulse_us,
        }

    def _about(self) -> dict[str, Any]:
        return {"name": self.name, "icon": self.icon, "description": self.description, **self.settings()}

    def as_dict(self) -> dict[str, Any]:
        return {
            **self._about(),
            "buttons": {key: button.as_dict() for key, button in self.buttons.items()},
            "parts": {key: part.as_dict() for key, part in self.parts.items()},
            "layout": self.layout,
        }

    def public(self) -> dict[str, Any]:
        return {
            "id": self.remote_id,
            **self._about(),
            "buttons": [button.public() for button in self.buttons.values()],
            "parts": [part.public() for part in self.parts.values()],
            "layout": self.layout,
        }

    @classmethod
    def from_dict(cls, remote_id: str, raw: dict[str, Any]) -> Remote:
        remote = cls(
            remote_id=_id(remote_id, "remote id"),
            name=_text(raw["name"], "name"),
            icon=_icon(raw.get("icon")),
            description=_optional_text(raw.get("description"), "description", MAX_DESCRIPTION),
            measured_pulse_us=raw.get("measured_pulse_us"),
            buttons={_id(key, "button id"): Button(key, _text(item["name"], "name"), item["code"], _icon(item.get("icon"))) for key, item in raw.get("buttons", {}).items()},
            parts={key: Part.from_dict(key, item) for key, item in (raw.get("parts") or {}).items()},
            layout=raw.get("layout"),
            **{key: raw[key] for key in ("transmitter", "protocol", "nbits", "pulse_us", "repeats", "wait_us")},
        )
        remote.validate()
        return remote


@dataclass
class Library:
    remotes: dict[str, Remote] = field(default_factory=dict)
    # Receiver preselected when learning buttons.
    default_receiver: str | None = None

    def get(self, remote_id: str) -> Remote:
        remote = self.remotes.get(remote_id)
        if remote is None:
            raise ModelError("remote_not_found", "unknown remote")
        return remote

    def put_remote(self, remote_id: str | None, raw: dict[str, Any]) -> Remote:
        if remote_id is None:
            remote_id = slug(_text(raw.get("name"), "name"), set(self.remotes))
        previous = self.remotes.get(remote_id)
        if previous is None and len(self.remotes) >= MAX_REMOTES:
            raise ModelError("too_many_remotes", f"at most {MAX_REMOTES} remotes")
        remote = Remote.from_input(remote_id, raw, previous)
        self.remotes[remote_id] = remote
        return remote

    def set_default_receiver(self, node: str | None) -> None:
        if node is not None and (not isinstance(node, str) or not TRANSMITTER.match(node)):
            raise ModelError("invalid_rf", "receiver must be an ESPHome device name")
        self.default_receiver = node

    def buttons_with_code(self, code: str) -> list[str]:
        return [f"{remote.name} · {button.name}" for remote in self.remotes.values() for button in remote.buttons.values() if button.code == code]

    def copy(self) -> Library:
        return Library({key: Remote.from_dict(key, remote.as_dict()) for key, remote in self.remotes.items()}, self.default_receiver)

    def as_dict(self) -> dict[str, Any]:
        return {"remotes": {key: remote.as_dict() for key, remote in self.remotes.items()}, "default_receiver": self.default_receiver}

    def public(self) -> dict[str, Any]:
        return {"remotes": [remote.public() for remote in self.remotes.values()]}


# Migration from 0.4 (storage version 1) -------------------------------------

LEGACY_ICONS = {
    "off": "mdi:power",
    "power": "mdi:power",
    "light": "mdi:lightbulb",
    "light_on": "mdi:lightbulb-on",
    "light_off": "mdi:lightbulb-off",
    "brightness_up": "mdi:brightness-7",
    "brightness_down": "mdi:brightness-5",
    "color_temperature": "mdi:thermometer",
    "speed_up": "mdi:plus",
    "speed_down": "mdi:minus",
    "direction": "mdi:rotate-3d-variant",
    "timer": "mdi:timer-outline",
    "mode": "mdi:tune-variant",
}
_LEGACY_FAN = {"off": "off", "power": "toggle", "speed_up": "speed_up", "speed_down": "speed_down", "direction": "direction"}
_LEGACY_LIGHT = {"light": "toggle", "light_on": "on", "light_off": "off"}


def migrate_remote_v1(raw: dict[str, Any], light_name: str) -> dict[str, Any]:
    """Turns 0.4 button functions into parts with roles, keeping the same entities:
    the fan part is `fan` and the light part `light`, as their unique ids were."""
    buttons = raw.get("buttons") or {}
    functions = {key: item.get("function") for key, item in buttons.items()}
    present = set(functions.values())
    levels = sorted(int(value[6:]) for value in present if isinstance(value, str) and value.startswith("speed_") and value[6:].isdigit())
    fan = bool(levels) or bool(present & {"off", "power", "speed_up", "speed_down"})
    light = bool(present & set(_LEGACY_LIGHT))
    parts: dict[str, Any] = {}

    def roles(mapping: dict[str, str]) -> dict[str, str]:
        found: dict[str, str] = {}
        for key, function in functions.items():
            role = mapping.get(function or "")
            if role and role not in found:
                found[role] = key
        return found

    if fan:
        fan_roles = roles({**_LEGACY_FAN, **{f"speed_{level}": f"speed_{level}" for level in levels}})
        parts["fan"] = {"name": raw["name"], "kind": "fan", "speeds": raw.get("speeds"), "roles": fan_roles}
    if light:
        parts["light"] = {"name": light_name, "kind": "light", "speeds": None, "roles": roles(_LEGACY_LIGHT)}
    migrated = {key: value for key, value in raw.items() if key != "speeds"}
    migrated["buttons"] = {
        key: {"name": item["name"], "code": item["code"], "icon": LEGACY_ICONS.get(item.get("function") or "")} for key, item in buttons.items()
    }
    migrated["parts"] = parts
    migrated["layout"] = None
    migrated.setdefault("icon", "mdi:ceiling-fan-light" if fan and light else "mdi:ceiling-fan" if fan else "mdi:lightbulb" if light else DEFAULT_ICON)
    return migrated
