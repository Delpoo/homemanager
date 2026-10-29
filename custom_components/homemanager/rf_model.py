"""RF remote library: remotes, their transmission settings and their buttons.

A remote groups the buttons of one physical control. Everything that must be
identical for all its buttons lives on the remote: which transmitter reaches
the equipment, the RCSwitch protocol, the code length, the pulse length and how
the burst is sent (repeats and the wait between frames). A button is a name,
an optional function used to build controls, and its code.

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
# Node names of ESPHome devices (they prefix the device's action names).
TRANSMITTER = re.compile(r"^[a-z0-9_]{1,64}$")
MAX_REMOTES = 64
MAX_BUTTONS = 64
MAX_NAME = 80
MAX_SPEEDS = 12
FUNCTIONS = frozenset(
    {
        "off",
        "power",
        "light",
        "light_on",
        "light_off",
        "brightness_up",
        "brightness_down",
        "color_temperature",
        "speed_up",
        "speed_down",
        "direction",
        "timer",
        "mode",
        "other",
        *(f"speed_{level}" for level in range(1, MAX_SPEEDS + 1)),
    }
)
# Defaults for a new remote: what most 433 MHz fan remotes use. The capture
# replaces protocol, length and pulse with measured values.
DEFAULTS = {"protocol": 1, "nbits": 24, "pulse_us": 350, "repeats": 5, "wait_us": 0}
LIMITS = {"pulse_us": (50, 2000), "repeats": (1, 20), "wait_us": (0, 100_000)}


def _text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > MAX_NAME:
        raise ModelError("invalid_rf", f"{name} must be 1-{MAX_NAME} characters")
    return value.strip()


def _id(value: Any, name: str) -> str:
    if not isinstance(value, str) or not ID.match(value):
        raise ModelError("invalid_rf", f"{name} must be lowercase letters, digits, '-' or '_'")
    return value


def _int(value: Any, name: str, low: int, high: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise ModelError("invalid_rf", f"{name} must be an integer between {low} and {high}")
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
    function: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {"name": self.name, "code": self.code, "function": self.function}

    def public(self) -> dict[str, Any]:
        return {"id": self.button_id, "name": self.name, "function": self.function, "fingerprint": fingerprint(self.code)}


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
    buttons: dict[str, Button] = field(default_factory=dict)

    @classmethod
    def from_input(cls, remote_id: str, raw: dict[str, Any], previous: Remote | None = None) -> Remote:
        """Validates user input. Buttons are edited separately and carried over."""
        remote = cls(
            remote_id=_id(remote_id, "remote id"),
            name=_text(raw.get("name"), "name"),
            transmitter=raw.get("transmitter", previous.transmitter if previous else None),
            protocol=raw.get("protocol", previous.protocol if previous else DEFAULTS["protocol"]),
            nbits=raw.get("nbits", previous.nbits if previous else DEFAULTS["nbits"]),
            pulse_us=raw.get("pulse_us", previous.pulse_us if previous else DEFAULTS["pulse_us"]),
            repeats=raw.get("repeats", previous.repeats if previous else DEFAULTS["repeats"]),
            wait_us=raw.get("wait_us", previous.wait_us if previous else DEFAULTS["wait_us"]),
            buttons=dict(previous.buttons) if previous else {},
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
        if len(self.buttons) > MAX_BUTTONS:
            raise ModelError("too_many_buttons", f"a remote holds at most {MAX_BUTTONS} buttons")
        for button in self.buttons.values():
            self.check_code(button.code)

    def check_code(self, code: Any) -> str:
        if not isinstance(code, str) or not CODE.match(code) or len(code) != self.nbits:
            # Changing the code length of a remote with buttons lands here too.
            raise ModelError("invalid_code", f"codes of this remote are {self.nbits} bits")
        return code

    def put_button(self, button_id: str | None, raw: dict[str, Any], code: str | None) -> Button:
        previous = self.buttons.get(button_id) if button_id else None
        if button_id and previous is None:
            raise ModelError("button_not_found", "unknown button")
        name = _text(raw.get("name"), "name")
        function = raw.get("function")
        if function is not None and function not in FUNCTIONS:
            raise ModelError("invalid_rf", "unknown button function")
        if code is None and previous is None:
            raise ModelError("invalid_code", "a new button needs a captured code")
        if previous is None and len(self.buttons) >= MAX_BUTTONS:
            raise ModelError("too_many_buttons", f"a remote holds at most {MAX_BUTTONS} buttons")
        button = Button(
            button_id=button_id or slug(name, set(self.buttons)),
            name=name,
            code=self.check_code(code) if code is not None else previous.code,  # type: ignore[union-attr]
            function=function,
        )
        self.buttons[button.button_id] = button
        return button

    def settings(self) -> dict[str, Any]:
        return {
            "transmitter": self.transmitter,
            "protocol": self.protocol,
            "nbits": self.nbits,
            "pulse_us": self.pulse_us,
            "repeats": self.repeats,
            "wait_us": self.wait_us,
        }

    def as_dict(self) -> dict[str, Any]:
        return {"name": self.name, **self.settings(), "buttons": {key: button.as_dict() for key, button in self.buttons.items()}}

    def public(self) -> dict[str, Any]:
        return {"id": self.remote_id, "name": self.name, **self.settings(), "buttons": [button.public() for button in self.buttons.values()]}

    @classmethod
    def from_dict(cls, remote_id: str, raw: dict[str, Any]) -> Remote:
        remote = cls(
            remote_id=_id(remote_id, "remote id"),
            name=_text(raw["name"], "name"),
            buttons={_id(key, "button id"): Button(key, _text(item["name"], "name"), item["code"], item.get("function")) for key, item in raw.get("buttons", {}).items()},
            **{key: raw[key] for key in ("transmitter", "protocol", "nbits", "pulse_us", "repeats", "wait_us")},
        )
        remote.validate()
        return remote


@dataclass
class Library:
    remotes: dict[str, Remote] = field(default_factory=dict)

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

    def buttons_with_code(self, code: str) -> list[str]:
        return [f"{remote.name} · {button.name}" for remote in self.remotes.values() for button in remote.buttons.values() if button.code == code]

    def as_dict(self) -> dict[str, Any]:
        return {"remotes": {key: remote.as_dict() for key, remote in self.remotes.items()}}

    def public(self) -> dict[str, Any]:
        return {"remotes": [remote.public() for remote in self.remotes.values()]}
