"""Decodes RCSwitch-style RF frames from raw receiver timings.

ESPHome reports a reception as signed microsecond durations: positive values
are marks (carrier on), negative values are spaces. RCSwitch protocols encode
each bit as a mark/space pair whose lengths are multiples of one pulse length,
and separate frames with a long sync space. Decoding here (instead of trusting
the device's own rc_switch dump) also yields the measured pulse length, which
is what distinguishes, for example, a 350 µs remote from a 400 µs one.

Only non-inverted protocols are supported; that covers the 433 MHz fan and
light remotes this feature targets.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from statistics import median

# (one_high, one_low, sync_low) in pulse units, with the nominal pulse length,
# for the RCSwitch protocols whose sync mark is one pulse and whose zero bit is
# (1, one_high). Protocols 3, 5, 6 and 8 do not fit that shape and are left out.
PROTOCOLS: dict[int, tuple[float, float, float, int]] = {
    1: (3, 1, 31, 350),
    2: (2, 1, 10, 650),
    4: (3, 1, 6, 380),
    7: (6, 1, 62, 150),
}
MIN_BITS = 8
MAX_BITS = 64
# Relative tolerance when classifying a duration against the measured pulse.
TOLERANCE = 0.4


@dataclass(frozen=True)
class Frame:
    protocol: int
    bits: str
    pulse_us: int


@dataclass(frozen=True)
class Reading:
    """The most frequent valid frame of one reception."""

    protocol: int
    bits: str
    pulse_us: int
    frames: int


def _near(value: float, target: float) -> bool:
    return abs(value - target) <= target * TOLERANCE


def _segments(timings: list[int]) -> tuple[list[list[int]], bool]:
    """Split on long spaces: each segment starts with a bit mark and usually ends
    with the sync mark of the next frame. The flag says whether any sync space
    was seen: receivers whose idle timeout is shorter than the sync space (for
    example 10 ms against 31 x 350 us) deliver one frame per reception and
    never include it."""
    durations = [abs(value) for value in timings if value]
    if len(durations) < 2 * MIN_BITS:
        return [], False
    short = median(sorted(durations)[: max(1, len(durations) // 2)])
    segments: list[list[int]] = []
    current: list[int] = []
    synced = False
    for value in timings:
        if value < 0 and -value > short * 5:
            synced = True
            if current:
                segments.append(current)
            current = []
        elif value:
            current.append(value)
    if current:
        segments.append(current)
    return segments, synced


def _decode_segment(segment: list[int], sync_low: float | None) -> Frame | None:
    # Drop a leading space and a trailing lone mark (the next frame's sync mark).
    if segment and segment[0] < 0:
        segment = segment[1:]
    if len(segment) % 2:
        segment = segment[:-1]
    pairs = [(segment[i], -segment[i + 1]) for i in range(0, len(segment), 2)]
    if not MIN_BITS <= len(pairs) <= MAX_BITS or any(high <= 0 or low <= 0 for high, low in pairs):
        return None
    # A bit lasts (one_high + one_low) pulses whichever its value, so the whole
    # pair measures the pulse; receivers that stretch marks and shorten spaces
    # (or the opposite) do not bias it. The share of the mark gives the value.
    period = median(high + low for high, low in pairs)
    for protocol, (one_high, one_low, sync, _nominal) in PROTOCOLS.items():
        total = one_high + one_low
        pulse = period / total
        # Without a sync space only the bit shape identifies the protocol; the
        # first match wins (protocol 1 before 4, which shares its 1:3 shape).
        if sync_low is not None and not _near(sync_low / pulse, sync):
            continue
        bits = []
        for high, low in pairs:
            share = high / (high + low)
            if not _near(high + low, period):
                break
            if abs(share - one_high / total) <= 0.12:
                bits.append("1")
            elif abs(share - 1 / total) <= 0.12:
                bits.append("0")
            else:
                break
        else:
            return Frame(protocol, "".join(bits), int(round(pulse / 10) * 10))
    return None


def decode(timings: list[int]) -> list[Frame]:
    """All frames found in one raw reception, in order."""
    frames: list[Frame] = []
    # The sync space that precedes each segment identifies the protocol.
    sync_lows = [-value for value in timings if value < 0]
    if not sync_lows:
        return frames
    segments, synced = _segments(timings)
    longest = sorted(sync_lows, reverse=True)
    sync_low = median(longest[: max(1, len(segments))]) if synced else None
    for segment in segments:
        frame = _decode_segment(segment, sync_low)
        if frame:
            frames.append(frame)
    return frames


def summarize(frames: list[Frame]) -> Reading | None:
    """The dominant code; partial reads (fewer bits) never win over full ones."""
    if not frames:
        return None
    counts = Counter((frame.protocol, frame.bits) for frame in frames)
    (protocol, bits), count = max(counts.items(), key=lambda item: (len(item[0][1]), item[1]))
    pulses = [frame.pulse_us for frame in frames if frame.protocol == protocol and frame.bits == bits]
    return Reading(protocol, bits, int(round(median(pulses) / 10) * 10), count)


def encode_timings(protocol: int, bits: str, pulse_us: int, repeats: int = 1) -> list[int]:
    """Synthetic raw timings for a code; used by tests and the firmware check."""
    one_high, one_low, sync, _nominal = PROTOCOLS[protocol]
    timings: list[int] = []
    for _ in range(repeats):
        timings += [pulse_us, -int(sync * pulse_us)]
        for bit in bits:
            high, low = (one_high, one_low) if bit == "1" else (1, one_high)
            timings += [int(high * pulse_us), -int(low * pulse_us)]
    return timings + [pulse_us, -int(sync * pulse_us)]
