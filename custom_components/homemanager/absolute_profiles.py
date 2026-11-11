"""Capability definitions and the Mitsubishi Electric 144-bit wire format."""
from __future__ import annotations

from typing import Any

from .errors import ModelError
from .ir_model import IrSignal

MITSUBISHI = "mitsubishi-electric-144"
_HEADER = bytes.fromhex("23 cb 26 01 00")
_MODE = {"heat": (1, 0), "dry": (2, 2), "cool": (3, 6), "auto": (4, 0), "fan": (7, 7)}
_FAN = {"auto": 0, "low": 1, "medium": 2, "high": 3, "max": 4, "quiet": 5}
_VANE = {"auto": 0, "highest": 1, "high": 2, "middle": 3, "low": 4, "lowest": 5, "swing": 7}
_WIDE = {"far_left": 1, "left": 2, "center": 3, "right": 4, "far_right": 5, "wide": 6, "auto": 8}
_TIMER = {"none": 0, "stop": 3, "start": 5, "both": 7}


def _choice(values: dict[str, Any]) -> dict[str, Any]:
    return {"type": "select", "options": list(values)}


CAPABILITIES = {
    "power": {"type": "boolean"},
    "temperature": {"type": "number", "min": 16, "max": 31, "step": 0.5, "unit": "°C"},
    "mode": _choice(_MODE), "fan": _choice(_FAN), "vane": _choice(_VANE),
    "wide_vane": _choice(_WIDE), "econo_cool": {"type": "boolean", "mode": "cool"},
    "clock": {"type": "time", "step": 600}, "native_timer": _choice(_TIMER),
    "start_time": {"type": "time", "step": 600}, "stop_time": {"type": "time", "step": 600},
}


def _time_value(value: Any) -> int:
    if isinstance(value, str) and len(value) == 5 and value[2] == ":" and value[:2].isascii() and value[3:].isascii():
        try:
            hour, minute = map(int, value.split(":"))
            if 0 <= hour < 24 and 0 <= minute < 60 and minute % 10 == 0 and value == f"{hour:02}:{minute:02}":
                return hour * 6 + minute // 10
        except ValueError:
            pass
    raise ModelError("invalid_profile", "use a valid clock time in 10-minute increments")


def _clock(value: int) -> str:
    return f"{value // 6:02}:{value % 6 * 10:02}" if value < 144 else "00:00"


def _key(options: dict[str, int], value: int, default: str) -> str:
    return next((key for key, number in options.items() if number == value), default)


def checksum(state: bytes) -> int:
    return sum(state[:17]) & 0xFF


def decode_frame(state: bytes) -> dict[str, Any]:
    if len(state) != 18 or state[:5] != _HEADER or checksum(state) != state[17]:
        raise ModelError("invalid_profile", "the signal is not a valid Mitsubishi Electric 144-bit frame")
    mode = next((key for key, bits in _MODE.items() if bits[0] == ((state[6] >> 3) & 7)), None)
    temperature = 16 + (state[7] & 15) + (0.5 if state[7] & 16 else 0)
    if mode is None or temperature > 31:
        raise ModelError("invalid_profile", "unsupported mode or temperature in the captured frame")
    return {
        "power": bool(state[5] & 32), "temperature": temperature, "mode": mode,
        "fan": "auto" if state[9] & 128 else _key(_FAN, state[9] & 7, "auto"),
        "vane": _key(_VANE, (state[9] >> 3) & 7, "auto"),
        "wide_vane": _key(_WIDE, state[8] >> 4, "center"), "econo_cool": bool(state[14] & 32) and mode == "cool",
        "clock": _clock(state[10]), "stop_time": _clock(state[11]), "start_time": _clock(state[12]),
        "native_timer": _key(_TIMER, state[13] & 7, "none"),
    }


def encode_frame(seed: bytes, target: dict[str, Any]) -> bytes:
    decode_frame(seed)
    if not isinstance(target, dict) or target.keys() != CAPABILITIES.keys():
        raise ModelError("invalid_profile", "an absolute state requires all supported fields")
    for key in ("power", "econo_cool"):
        if type(target[key]) is not bool:
            raise ModelError("invalid_profile", f"{key} must be boolean")
    for key, choices in (("mode", _MODE), ("fan", _FAN), ("vane", _VANE),
                         ("wide_vane", _WIDE), ("native_timer", _TIMER)):
        if not isinstance(target[key], str) or target[key] not in choices:
            raise ModelError("invalid_profile", f"unsupported value for {key}")
    temp = target["temperature"]
    if type(temp) not in (int, float) or not 16 <= temp <= 31 or temp * 2 != int(temp * 2):
        raise ModelError("invalid_profile", "temperature must be between 16 and 31 °C in half-degree increments")
    mode, mode_bits = _MODE[target["mode"]]
    if target["econo_cool"] and target["mode"] != "cool":
        raise ModelError("invalid_profile", "ECONO COOL requires cooling mode")
    state = bytearray(seed)
    state[5] = (state[5] & ~32) | (32 if target["power"] else 0)
    state[6] = (state[6] & ~56) | (mode << 3)
    state[7] = (state[7] & ~31) | (int(temp) - 16) | (16 if temp != int(temp) else 0)
    state[8] = (_WIDE[target["wide_vane"]] << 4) | mode_bits
    state[9] = _FAN[target["fan"]] | (_VANE[target["vane"]] << 3) | 64 | (128 if target["fan"] == "auto" else 0)
    state[10], state[11], state[12] = (_time_value(target[key]) for key in ("clock", "stop_time", "start_time"))
    state[13] = (state[13] & ~7) | _TIMER[target["native_timer"]]
    state[14] = (state[14] & ~32) | (32 if target["econo_cool"] else 0)
    state[15] &= ~32  # 10 °C i-SAVE is a different setpoint mode.
    state[17] = checksum(state)
    return bytes(state)


def encode_signal(frame: bytes, carrier: int = 38000, source: str = "known") -> IrSignal:
    decode_frame(frame)
    block = [3400, -1750]
    for byte in frame:
        for bit in range(8):
            block.extend((450, -1300 if byte & (1 << bit) else -420))
    block.extend((440, -15500))
    return IrSignal.from_dict({"carrier_hz": carrier, "carrier_source": source, "timings_us": block * 2})


def decode_signal(signal: IrSignal) -> bytes:
    """Identify a complete checksummed frame in a learned waveform."""
    timings = signal.timings_us
    for offset in range(0, len(timings) - 290, 2):
        if not 2500 <= timings[offset] <= 4400 or not -2300 <= timings[offset + 1] <= -1200:
            continue
        frame = bytearray(18)
        for bit in range(144):
            mark, space = timings[offset + 2 + bit * 2:offset + 4 + bit * 2]
            if not 230 <= mark <= 750 or not -1800 <= space <= -230:
                break
            if space <= -850:
                frame[bit // 8] |= 1 << (bit % 8)
        else:
            try:
                decode_frame(frame)
                return bytes(frame)
            except ModelError:
                continue
    raise ModelError("invalid_profile", "learn a complete Mitsubishi Electric 144-bit signal first")


# Each protocol supplies the same operations. Existing learned signals still use the raw playback path.
PROFILES = {MITSUBISHI: (CAPABILITIES, decode_signal, decode_frame, encode_frame, encode_signal)}
