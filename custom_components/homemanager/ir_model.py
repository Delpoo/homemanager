"""IR-backed controls and private raw signals for the Remotes library."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property
import json
import re
from typing import Any

from .errors import ModelError
from .rf_model import ID, MAX_BUTTONS, MAX_DESCRIPTION, _icon, _int, _optional_text, _text, fingerprint, validate_layout

MAX_TIMINGS = 4096
MAX_DURATION_US = 2_000_000
MAX_CARRIER_HZ = 1_000_000
EMITTER = re.compile(r"(?:infrared\.[a-z0-9_]{1,246}|(?:esphome:)?[a-f0-9]{32})")


def _emitter(value: Any) -> str:
    if not isinstance(value, str) or not EMITTER.fullmatch(value):
        raise ModelError("invalid_ir", "emitter must identify an infrared transmitter")
    return value


@dataclass(frozen=True)
class IrSignal:
    carrier_hz: int | None
    timings_us: tuple[int, ...]
    carrier_source: str = "known"

    @classmethod
    def from_dict(cls, raw: Any) -> IrSignal:
        if not isinstance(raw, dict) or "carrier_hz" not in raw:
            raise ModelError("invalid_ir", "a signal needs a carrier and raw timings")
        carrier = raw["carrier_hz"]
        carrier_source = raw.get("carrier_source", "known")
        if carrier_source in ("known", "estimated"):
            _int(carrier, "carrier_hz", 0, MAX_CARRIER_HZ, "invalid_ir")
        elif carrier_source != "unknown" or carrier is not None:
            raise ModelError("invalid_ir", "carrier_source must match the carrier value")

        timings = raw.get("timings_us")
        if not isinstance(timings, list) or not 1 <= len(timings) <= MAX_TIMINGS:
            raise ModelError("invalid_ir", f"a signal needs 1–{MAX_TIMINGS} timings")
        duration = 0
        for index, timing in enumerate(timings):
            is_mark = index % 2 == 0
            if isinstance(timing, bool) or not isinstance(timing, int) or timing == 0 or (timing > 0) != is_mark:
                raise ModelError("invalid_ir", "timings must alternate positive marks and negative spaces")
            duration += abs(timing)
            if duration > MAX_DURATION_US:
                raise ModelError("invalid_ir", f"a signal may last at most {MAX_DURATION_US} microseconds")
        return cls(carrier, tuple(timings), carrier_source)

    def as_dict(self) -> dict[str, Any]:
        return {"carrier_hz": self.carrier_hz, "carrier_source": self.carrier_source, "timings_us": list(self.timings_us)}

    @cached_property
    def fingerprint(self) -> str:
        return fingerprint(json.dumps([self.carrier_hz, self.timings_us], separators=(",", ":")))


@dataclass(frozen=True, slots=True)
class IrButton:
    button_id: str
    name: str
    icon: str | None
    signal: IrSignal
    emitter: str | None
    provenance: dict[str, Any] | None = None

    @classmethod
    def from_dict(cls, button_id: str, raw: Any) -> IrButton:
        if not isinstance(button_id, str) or not ID.fullmatch(button_id) or not isinstance(raw, dict):
            raise ModelError("invalid_ir", "invalid infrared button")
        emitter = raw.get("emitter")
        origin = raw.get("provenance")
        keys = ("source", "brand", "model", "entry", "revision", "function")
        provenance = {key: origin[key] for key in keys if isinstance(origin.get(key), str) and 0 < len(origin[key]) <= 120} if isinstance(origin, dict) else {}
        if provenance:
            provenance.update(partial=origin.get("partial") is True, index=origin.get("index") if type(origin.get("index")) is int else None)
        return cls(
            button_id,
            _text(raw.get("name"), "name"),
            _icon(raw.get("icon")),
            IrSignal.from_dict(raw.get("signal")),
            _emitter(emitter) if emitter is not None else None,
            provenance or None,
        )

    def as_dict(self) -> dict[str, Any]:
        data = {"name": self.name, "icon": self.icon, "signal": self.signal.as_dict()}
        if self.emitter is not None:
            data["emitter"] = self.emitter
        if self.provenance:
            data["provenance"] = dict(self.provenance)
        return data

    def public(self) -> dict[str, Any]:
        return {
            "id": self.button_id,
            "name": self.name,
            "icon": self.icon,
            "command_type": "ir_raw",
            "fingerprint": self.signal.fingerprint,
            **({"provenance": dict(self.provenance)} if self.provenance else {}),
        }


@dataclass(frozen=True, slots=True)
class IrRemote:
    remote_id: str
    name: str
    emitter: str
    icon: str | None
    description: str | None
    buttons: dict[str, IrButton]
    layout: list[dict[str, Any]] | None

    @classmethod
    def from_dict(cls, remote_id: str, raw: Any) -> IrRemote:
        if not isinstance(remote_id, str) or not ID.fullmatch(remote_id) or not isinstance(raw, dict):
            raise ModelError("invalid_ir", "invalid infrared remote")
        raw_buttons = raw.get("buttons", {})
        if not isinstance(raw_buttons, dict) or len(raw_buttons) > MAX_BUTTONS:
            raise ModelError("invalid_ir", f"a remote holds at most {MAX_BUTTONS} buttons")
        try:
            buttons = {button_id: IrButton.from_dict(button_id, item) for button_id, item in raw_buttons.items()}
            return cls(
                remote_id,
                _text(raw.get("name"), "name"),
                _emitter(raw.get("emitter")),
                _icon(raw.get("icon")),
                _optional_text(raw.get("description"), "description", MAX_DESCRIPTION),
                buttons,
                validate_layout(raw.get("layout"), buttons),
            )
        except ModelError as error:
            if error.code == "invalid_ir":
                raise
            raise ModelError("invalid_ir", str(error)) from None
        except TypeError:
            raise ModelError("invalid_ir", "invalid infrared remote layout") from None

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "emitter": self.emitter,
            "icon": self.icon,
            "description": self.description,
            "buttons": {button_id: button.as_dict() for button_id, button in self.buttons.items()},
            "layout": self.layout,
        }

    def public(self) -> dict[str, Any]:
        return {
            "id": self.remote_id,
            "source": "ir",
            "name": self.name,
            "icon": self.icon,
            "description": self.description,
            "buttons": [button.public() for button in self.buttons.values()],
            "layout": self.layout,
        }
