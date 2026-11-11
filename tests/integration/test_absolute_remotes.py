"""Verify absolute Mitsubishi state, local adapters, and persistent schedule dispatch."""
from datetime import UTC, datetime
from unittest.mock import Mock

import pytest

from custom_components.homemanager.absolute_profiles import (
    MITSUBISHI, checksum, decode_frame, decode_signal, encode_frame, encode_signal,
)
from custom_components.homemanager.absolute_remotes import DATA_ABSOLUTE, AbsoluteRemotes, occurrence
from custom_components.homemanager.errors import ModelError
from custom_components.homemanager.ir_proxy import IrProxy
from custom_components.homemanager.remote_catalog import parse_catalog

TX = "esphome:22222222222222222222222222222222"
REFERENCE = bytes.fromhex("23 cb 26 01 00 20 18 08 36 c0 00 00 00 00 00 00 00 00")
FRAME = REFERENCE[:17] + bytes([checksum(REFERENCE)])
FLIPPER = """Filetype: IR signals file
Version: 1
#
name: Demo power
type: raw
frequency: 38000
duty_cycle: 0.330000
data: 500 700 500 800
#
name: Unsupported
type: parsed
protocol: Unknown
address: 00 00 00 00
command: 00 00 00 00
"""


def test_mitsubishi_wire_checksum_and_all_fields():
    assert decode_signal(encode_signal(FRAME)) == FRAME
    state = {**decode_frame(FRAME), "power": False, "temperature": 19.5, "mode": "heat",
             "fan": "quiet", "vane": "swing", "wide_vane": "left", "native_timer": "both",
             "clock": "20:30", "start_time": "22:00", "stop_time": "07:00"}
    frame = encode_frame(FRAME, state)
    assert decode_frame(frame) == state
    assert frame[-1] == checksum(frame)
    with pytest.raises(ModelError, match="valid Mitsubishi"):
        decode_frame(frame[:-1] + bytes([(frame[-1] + 1) & 255]))
    with pytest.raises(ModelError, match="10-minute"):
        encode_frame(FRAME, {**state, "clock": "20:31"})


def test_catalog_keeps_partial_match_and_never_treats_unknown_protocol_as_raw():
    rows = parse_catalog("Flipper-IRDB", FLIPPER)
    assert rows[0][0] == "Demo power"
    assert rows[0][1].timings_us == (500, -700, 500, -800)
    assert rows[1] == ("Unsupported", None, "unsupported_signal")
    smart = parse_catalog("SmartIR", '{"commands":{"off":[560,680,560]}}')
    assert smart[0][1].timings_us == (560, -680, 560)
    assert parse_catalog("IRremoteESP8266", "uint16_t rawData[3] = {560, 680, 560};")[0][1].timings_us == (560, -680, 560)


async def _call(client, suffix, **fields):
    await client.send_json_auto_id({"type": "homemanager/remotes/" + suffix, **fields})
    result = await client.receive_json()
    assert result["success"], result
    return result["result"]


async def test_import_and_create_absolute_schedule_persist_with_explicit_power(
    hass, setup_integration, hass_ws_client, hass_storage, monkeypatch,
):
    monkeypatch.setattr(IrProxy, "devices", lambda self: {"receivers": [], "emitters": [{"id": TX, "name": "Synthetic"}]})
    send = Mock()
    monkeypatch.setattr(IrProxy, "send", send)
    admin = await hass_ws_client(hass)
    partial = await _call(admin, "catalog/preview", source="Flipper-IRDB", document=FLIPPER)
    assert [row["supported"] for row in partial] == [True, False]
    document = "uint8_t state[18] = {" + ",".join(str(byte) for byte in FRAME) + "};"
    info = dict(source="IRremoteESP8266", document=document, indexes=[0], name="Example AC",
                brand="Mitsubishi Electric", model="Example 144", entry="synthetic vector", revision="fixture", emitter=TX)
    imported = await _call(admin, "catalog/import", **info)
    assert imported["added"] == 1
    assert (await _call(admin, "catalog/import", **info, remote_id=imported["id"]))["duplicates"] == 1
    saved = (await _call(admin, "resources"))["learned"][0]
    assert saved["buttons"][0]["provenance"]["revision"] == "fixture"
    created = await _call(admin, "absolute", command="create", fields={
        "profile": MITSUBISHI, "name": "Synthetic AC", "brand": "Mitsubishi Electric", "model": "144",
        "remote_id": saved["id"], "button_id": saved["buttons"][0]["id"], "emitter": TX,
    })
    assert "seed" not in created and created["requested"] is None
    control = await _call(admin, "absolute", command="schedule", control_id=created["id"], fields={
        "days": [2], "zone": "UTC", "time": "12:34", "power": False, "state": created["state"],
    })
    send.assert_not_called()
    now = datetime(2026, 11, 11, 12, 34, tzinfo=UTC)
    assert occurrence(control["schedules"][0], now)
    absolute: AbsoluteRemotes = hass.data[DATA_ABSOLUTE]
    await absolute.async_tick(now)
    await absolute.async_tick(now)
    assert send.call_count == 1
    assert not decode_frame(decode_signal(send.call_args.args[1]))["power"]
    result = absolute.resources()["controls"][0]
    assert result["requested"]["status"] == "sent"
    assert result["schedules"][0]["result"] == "sent"
    assert hass_storage["homemanager.absolute_remotes"]["data"]["controls"][created["id"]]["requested"]["state"]["power"] is False
