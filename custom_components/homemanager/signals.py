"""Read-only analysis of signed envelope timings. Never edits a replay payload."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from statistics import median
from typing import Any

from .rf_codec import PROTOCOLS, decode, summarize

MAX_SAMPLES = 4096
ABS_TOLERANCE_US = 120
REL_TOLERANCE = 0.25
THUMBNAIL_VERSION = 1


def timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds")


def sample(timings: list[int] | tuple[int, ...], node: str | None, *, at: str | None = None,
           integrity: str = "received") -> dict[str, Any]:
    return {"timings_us": list(timings), "node": node, "at": at or timestamp(),
            "format": "signed_us", "integrity": integrity}


def _near(value: int, target: int) -> bool:
    return abs(value - target) <= target * REL_TOLERANCE


def _decoded(protocol: str, bits: str, **fields: Any) -> dict[str, Any]:
    return {"protocol": protocol, "bits": bits, "word_length": len(bits),
            "hex": f"{int(bits, 2):0{(len(bits) + 3) // 4}X}", **fields}


def _distance_bits(raw: list[int], unit: int, high: int, low: int) -> str:
    if len(raw) < 3 or not _near(raw[0], high) or not _near(-raw[1], low):
        return ""
    bits = []
    for index in range(2, len(raw), 2):
        if not _near(raw[index], unit):
            return ""
        if index + 1 == len(raw):
            return "".join(bits)
        pause = -raw[index + 1]
        if _near(pause, unit):
            bits.append("0")
        elif _near(pause, unit * 3):
            bits.append("1")
        else:
            return ""
    return ""  # The stop mark is missing.


def _rc6(raw: list[int]) -> dict[str, Any] | None:
    unit = 444
    if len(raw) < 3 or not _near(raw[0], 6 * unit) or not _near(-raw[1], 2 * unit):
        return None
    levels: list[bool] = []
    for timing in raw[2:]:
        halves = round(abs(timing) / unit)
        if not 1 <= halves <= 3 or not _near(abs(timing), halves * unit):
            return None
        levels.extend([timing > 0] * halves)
    # A demodulator may end the capture at the last mark.
    if len(levels) == 43 and levels[-1]:
        levels.append(False)
    if len(levels) != 44:
        return None
    pairs = [(levels[index], levels[index + 1]) for index in range(0, 8, 2)]
    if levels[8] != levels[9] or levels[10] != levels[11]:
        return None
    pairs.append((levels[8], levels[10]))
    pairs.extend((levels[index], levels[index + 1]) for index in range(12, 44, 2))
    if any(first == second for first, second in pairs):
        return None
    bits = "".join("1" if first else "0" for first, _ in pairs)
    if bits[:4] != "1000":
        return None  # Mode 0 is the 8-bit address + 8-bit command format.
    return _decoded("RC6", bits, mode=0, toggle=int(bits[4]),
                    address=f"{int(bits[5:13], 2):02X}", command=f"{int(bits[13:], 2):02X}")


def _decode_ir(raw: list[int]) -> dict[str, Any] | None:
    if result := _rc6(raw):
        return result
    bits = _distance_bits(raw, 425, 3400, 1700)
    if 32 <= len(bits) <= 296 and len(bits) % 8 == 0:
        return _decoded("AEHA", bits, address=f"{int(bits[:16], 2):04X}",
                        data=" ".join(f"{int(bits[index:index + 8], 2):02X}" for index in range(16, len(bits), 8)))
    bits = _distance_bits(raw, 560, 9000, 4500)
    if len(bits) == 32:
        a, b, command, inverse = [int(bits[index:index + 8][::-1], 2) for index in range(0, 32, 8)]
        if command ^ inverse == 255:
            address = a if a ^ b == 255 else a | (b << 8)
            return _decoded("NEC", bits, address=f"{address:02X}", command=f"{command:02X}",
                            inverted_command=True)
    return None


def frame_ranges(raw: list[int], medium: str, base: int) -> list[dict[str, int]]:
    # Separate plausible framing gaps from bit-length pauses. These are
    # inferred ranges, not claims about how many presses the user made.
    threshold = max(6500, base * 8) if medium == "ir" else max(1, base * 5)
    frames = []
    start = 0
    for index, duration in enumerate(raw):
        if duration < -threshold:
            if index > start:
                frames.append({"start": start, "end": index, "gap_us": -duration})
            start = index + 1
    if start < len(raw):
        frames.append({"start": start, "end": len(raw), "gap_us": 0})
    return frames


def _histogram(raw: list[int]) -> list[dict[str, int]]:
    # Powers-of-two duration bins avoid hiding narrow pulses beside long gaps.
    marks = Counter(value.bit_length() - 1 for value in raw if value > 0)
    spaces = Counter((-value).bit_length() - 1 for value in raw if value < 0)
    return [{"low_us": 1 << power, "high_us": (1 << (power + 1)) - 1,
             "marks": marks[power], "spaces": spaces[power]} for power in sorted(marks.keys() | spaces.keys())]


def analyze(raw: list[int], medium: str, integrity: str) -> dict[str, Any]:
    durations = sorted(abs(timing) for timing in raw if timing)
    short = durations[:max(1, len(durations) // 2)]
    base = round(median(short)) if short else 0
    spread = round(median(abs(value - base) for value in short)) if short else 0
    frames = frame_ranges(raw, medium, base)
    changes = [index for index, (before, after) in enumerate(zip(raw, raw[1:]), 1) if before * after > 0]
    decoded = None
    if medium == "rf":
        if reading := summarize(decode(raw)):
            decoded = _decoded(f"RCSwitch {reading.protocol}", reading.bits, base_us=reading.pulse_us,
                               repetitions=reading.frames, inverted=False)
    else:
        for frame in frames[:32]:
            block = raw[frame["start"]:frame["end"]]
            if decoded := _decode_ir(block):
                break
    return {"duration_us": sum(durations), "count": len(raw), "transitions": sum(a * b < 0 for a, b in zip(raw, raw[1:])),
            "base_us": base or None, "spread_us": spread if base else None, "frames": frames,
            "histogram": _histogram(raw), "decoded": decoded,
            "discontinuities": changes + [index for index, value in enumerate(raw) if value == 0],
            "leading_pause": bool(raw and raw[0] < 0), "integrity": integrity}


def rf_wire(protocol: int, bits: str, pulse_us: int, repeats: int, wait_us: int) -> list[int]:
    """Reproduce the documented RF package: sync first, then bits per frame."""
    one, _, sync, _ = PROTOCOLS[protocol]
    frame = [pulse_us, -round(sync * pulse_us)]
    for bit in bits:
        frame.extend((round(one * pulse_us), -pulse_us) if bit == "1" else (pulse_us, -round(one * pulse_us)))
    result = []
    for index in range(repeats):
        result.extend(frame)
        if index + 1 < repeats:
            result[-1] -= wait_us
    return result


def prepare_rf(bits: str, settings: dict[str, Any], *, at: str | None = None) -> dict[str, Any]:
    wire = rf_wire(settings["protocol"], bits, settings["pulse_us"], settings["repeats"], settings["wait_us"])
    return {**sample(wire, settings["transmitter"], at=at, integrity="prepared"), "settings": {
        **settings, "carrier_hz": None, "carrier_source": "unknown", "inverted": False, "wire_source": "esphome_service"}}


def prepare_ir(timings: tuple[int, ...], emitter: str, settings: dict[str, Any], *, at: str | None = None) -> dict[str, Any]:
    return {**sample(timings, emitter, at=at, integrity="prepared"), "settings": {
        **settings, "repeats": 1, "wire_source": "esphome_ir_proxy"}}


def thumbnail(raw: list[int]) -> dict[str, Any]:
    """Versioned SVG miniature derived from a bounded envelope density trace."""
    total = sum(map(abs, raw))
    width = 96
    levels = [0.0] * width
    if total:
        start = 0.0
        for timing in raw:
            end = start + abs(timing) * width / total
            if timing > 0:
                for index in range(int(start), min(width, int(end) + 1)):
                    levels[index] += min(end, index + 1) - max(start, index)
            start = end
    points = " ".join(f"{index},{round(16 - max(0, min(1, level)) * 14, 2)}" for index, level in enumerate(levels))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 18" role="img">'
           f'<polyline fill="none" stroke="#4f7a5a" points="{points}"/></svg>')
    return {"version": THUMBNAIL_VERSION, "levels": [round(max(0, min(1, level)), 2) for level in levels], "svg": svg}


def compare(reference: list[int], observed: list[int]) -> dict[str, Any]:
    """Align at the first mark. Never repairs signs or rewrites raw evidence."""
    inverted = len(reference) == len(observed) and len(reference) >= 4 and all(
        a * b < 0 and abs(a + b) <= max(ABS_TOLERANCE_US, abs(a) * REL_TOLERANCE)
        for a, b in zip(reference, observed)
    )
    start_a = next((index for index, value in enumerate(reference) if value > 0), 0)
    start_b = next((index for index, value in enumerate(observed) if value > 0), 0)
    if inverted:
        start_a = start_b = 0
    reference, observed = reference[start_a:], observed[start_b:]
    errors = []
    opposite = 0
    for index, (a, b) in enumerate(zip(reference, observed)):
        if a * b <= 0 and a != b:
            opposite += 1
            errors.append(index)
        elif abs(a - b) > max(ABS_TOLERANCE_US, abs(a) * REL_TOLERANCE):
            errors.append(index)
    return {"compared": min(len(reference), len(observed)), "different": len(errors), "opposite_sign": opposite,
            "length_delta": len(observed) - len(reference), "indices": errors[:64], "start": [start_a, start_b],
            "absolute_us": ABS_TOLERANCE_US, "relative": REL_TOLERANCE, "polarity_inverted": inverted}
