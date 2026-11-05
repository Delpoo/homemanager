"""Synthetic digital envelopes. No payloads from an installation."""

from custom_components.homemanager.signals import analyze, compare, rf_wire, thumbnail


def _rc6(toggle: int) -> list[int]:
    bits = f"1000{toggle}0110010010110110"
    half_units: list[int] = []
    for index, bit in enumerate(bits):
        width = 2 if index == 4 else 1
        sign = 1 if bit == "1" else -1
        half_units.extend([sign] * width + [-sign] * width)
    raw = [2664, -888]
    for half in half_units:
        if raw[-1] * half > 0:
            raw[-1] += half * 444
        else:
            raw.append(half * 444)
    return raw


def test_rc6_decodes_toggle_and_keeps_word_structure() -> None:
    for toggle in (0, 1):
        decoded = analyze(_rc6(toggle), "ir", "received")["decoded"]
        assert (decoded["protocol"], decoded["toggle"], decoded["address"], decoded["command"]) == ("RC6", toggle, "64", "B6")
        assert decoded["word_length"] == 21


def test_long_aeha_retains_gaps_frames_histogram_and_exact_timings() -> None:
    bits = "0100101001110001" + "01100101" * 16
    one = [3400, -1700, *[value for bit in bits for value in (425, -1275 if bit == "1" else -425)], 425]
    raw = [*one, -31_000, *one, -18_000]
    original = list(raw)
    measured = analyze(raw, "ir", "received")
    assert raw == original and len(raw) > 385
    assert measured["decoded"]["protocol"] == "AEHA"
    assert measured["decoded"]["address"] == "4A71"
    assert measured["decoded"]["word_length"] == 144
    assert [frame["gap_us"] for frame in measured["frames"]] == [31_000, 18_000]
    assert sum(bin["marks"] + bin["spaces"] for bin in measured["histogram"]) == len(raw)
    assert measured["duration_us"] == sum(map(abs, raw))
    graphic = thumbnail(raw)
    assert graphic["version"] == 1 and len(graphic["levels"]) == 96
    assert "<svg" in graphic["svg"]


def test_nec_validates_inverse_byte_and_unknown_remains_inspectable() -> None:
    values = [0x36, 0xC9, 0x25, 0xDA]
    bits = "".join(f"{value:08b}"[::-1] for value in values)
    raw = [9000, -4500, *[value for bit in bits for value in (560, -1680 if bit == "1" else -560)], 560]
    assert analyze(raw, "ir", "received")["decoded"]["command"] == "25"
    raw[-2] = -560 if raw[-2] != -560 else -1680
    assert analyze(raw, "ir", "received")["decoded"] is None
    unknown = analyze([-300, -350, 0, 150, -1000], "rf", "possibly_truncated")
    assert unknown["decoded"] is None and unknown["leading_pause"]
    assert set(unknown["discontinuities"]) == {1, 2}


def test_rf_adapter_representation_and_comparison_of_defective_replay() -> None:
    bits = "1001010100110001"
    wire = rf_wire(1, bits, 400, 2, 150)
    frame = rf_wire(1, bits, 400, 1, 0)
    assert frame[:6] == [400, -12400, 1200, -400, 400, -1200]
    assert wire == [*frame[:-1], frame[-1] - 150, *frame]
    assert analyze(frame, "rf", "prepared")["decoded"]["bits"] == bits
    raw = [1000, -500, 320, -700]
    defective = compare(raw, [1000, 500, 465])
    assert defective["different"] == 2 and defective["opposite_sign"] == 1 and defective["length_delta"] == -1
    inverse = compare(raw, [-value for value in raw])
    assert inverse["polarity_inverted"] and inverse["opposite_sign"] == 4
    assert compare(raw, [1200, -440, 390, -720])["different"] == 0
