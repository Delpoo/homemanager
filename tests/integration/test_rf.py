"""RF remote manager: decoding, library, permissions, sending and capture.

Codes and timings are synthetic; no household remote appears here.
"""

import random

from homeassistant.core import HomeAssistant, ServiceCall

from custom_components.homemanager.rf import RAW_EVENT
from custom_components.homemanager.rf_codec import decode, encode_timings, summarize

CODE = "101101011001011001110101"
OTHER = "101101011001011001110110"


def _jitter(timings: list[int], seed: int = 1) -> list[int]:
    generator = random.Random(seed)
    return [int(value * generator.uniform(0.85, 1.15)) for value in timings]


def test_decoder_measures_protocol_and_pulse_length() -> None:
    for protocol, pulse in ((1, 350), (1, 400), (2, 650), (4, 380)):
        # The receiver usually starts listening in the middle of a frame.
        reading = summarize(decode(_jitter(encode_timings(protocol, CODE, pulse, repeats=5))[7:]))
        assert reading is not None
        assert (reading.protocol, reading.bits, reading.pulse_us) == (protocol, CODE, pulse)
        assert reading.frames >= 4


def _single_frame(bits: str, pulse: int) -> list[int]:
    """One frame as a receiver with a 10 ms idle timeout delivers it: the bits and
    the next sync mark, without the sync space (31 x pulse) that ended it."""
    return encode_timings(1, bits, pulse)[2:-1]


def test_decoder_reads_frames_delivered_one_by_one() -> None:
    for pulse in (350, 400):
        # Receivers typically lengthen marks and shorten spaces by tens of µs.
        frame = [value + 60 if value > 0 else value + 60 for value in _single_frame(CODE, pulse)]
        reading = summarize(decode(_jitter(frame, pulse)))
        assert reading is not None
        assert (reading.protocol, reading.bits, reading.frames) == (1, CODE, 1)
        assert abs(reading.pulse_us - pulse) <= 20


def test_decoder_prefers_full_frames_and_rejects_noise() -> None:
    partial = encode_timings(1, CODE[:10], 350)
    full = encode_timings(1, CODE, 350, repeats=2)
    assert summarize(decode(partial + full)).bits == CODE
    assert decode([120, -340, 95, -60, 300]) == []
    assert summarize([]) is None


def _transmitter(hass: HomeAssistant, node: str = "test_tx") -> list[dict]:
    sent: list[dict] = []

    async def send(call: ServiceCall) -> None:
        sent.append(dict(call.data))

    async def capture(call: ServiceCall) -> None:
        sent.append({"capture": call.data["seconds"]})

    hass.services.async_register("esphome", f"{node}_homemanager_rf_send", send)
    hass.services.async_register("esphome", f"{node}_homemanager_rf_capture", capture)
    return sent


async def _call(client, message: dict) -> dict:
    await client.send_json_auto_id(message)
    return await client.receive_json()


async def test_capture_test_save_and_press_without_exposing_codes(hass: HomeAssistant, setup_integration, hass_ws_client, monkeypatch) -> None:
    sent = _transmitter(hass)
    admin = await hass_ws_client(hass)

    transmitters = await _call(admin, {"type": "homemanager/rf/transmitters"})
    assert [item["id"] for item in transmitters["result"]["transmitters"]] == ["test_tx"]
    assert transmitters["result"]["transmitters"][0]["can_capture"] is True

    capture = await _call(admin, {"type": "homemanager/rf/capture", "transmitter": "test_tx", "seconds": 20})
    assert capture["success"]
    assert sent == [{"capture": 20}]

    # Two presses of the same button, more than a second apart.
    clock = {"now": 0.0}
    monkeypatch.setattr("custom_components.homemanager.rf._now", lambda: clock["now"])
    for seed, moment in ((1, 100.0), (2, 102.0)):
        clock["now"] = moment
        timings = _jitter(encode_timings(1, CODE, 400, repeats=4), seed)
        hass.bus.async_fire(RAW_EVENT, {"timings": ",".join(map(str, timings))})
        await hass.async_block_till_done()
    first = (await admin.receive_json())["event"]["candidate"]
    second = (await admin.receive_json())["event"]["candidate"]
    assert first["confirmed"] is False
    assert second["confirmed"] is True and second["bursts"] == 2
    assert second["pulse_us"] == 400 and second["nbits"] == 24 and second["protocol"] == 1
    assert CODE not in str(second)

    # Try it before saving anything, with the measured pulse length.
    tested = await _call(admin, {"type": "homemanager/rf/test", "candidate_id": second["candidate_id"], "repeats": 8})
    assert tested["result"]["pulse_us"] == 400
    assert sent[-1] == {"code": CODE, "protocol": 1, "pulse_length": 400, "repeats": 8, "wait_us": 0}

    remote = await _call(admin, {"type": "homemanager/rf/remote/save", "remote": {"name": "Ventilador estudio", "transmitter": "test_tx", "pulse_us": 400, "repeats": 8}})
    assert remote["result"]["id"] == "ventilador-estudio"
    button = await _call(
        admin,
        {"type": "homemanager/rf/button/save", "remote_id": "ventilador-estudio", "button": {"name": "Velocidad 3", "function": "speed_3"}, "candidate_id": second["candidate_id"]},
    )
    assert button["result"]["id"] == "velocidad-3"

    library = await _call(admin, {"type": "homemanager/rf/library"})
    assert CODE not in str(library["result"])
    assert library["result"]["remotes"][0]["buttons"][0]["function"] == "speed_3"

    pressed = await _call(admin, {"type": "homemanager/rf/press", "remote_id": "ventilador-estudio", "button_id": "velocidad-3"})
    assert pressed["result"] == {"result": "sent"}
    assert sent[-1] == {"code": CODE, "protocol": 1, "pulse_length": 400, "repeats": 8, "wait_us": 0}


async def test_permissions_and_validation(hass: HomeAssistant, setup_integration, hass_ws_client, hass_read_only_access_token) -> None:
    sent = _transmitter(hass)
    admin = await hass_ws_client(hass)
    await _call(admin, {"type": "homemanager/rf/remote/save", "remote_id": "luz", "remote": {"name": "Luz", "transmitter": "test_tx"}})
    imported = await _call(admin, {"type": "homemanager/rf/button/save", "remote_id": "luz", "button": {"name": "On"}, "code": CODE})
    assert imported["success"]

    reader = await hass_ws_client(hass, hass_read_only_access_token)
    # Operating a remote is open to every user; configuring it is not.
    assert (await _call(reader, {"type": "homemanager/rf/press", "remote_id": "luz", "button_id": "on"}))["success"]
    assert sent[-1]["code"] == CODE
    for message in (
        {"type": "homemanager/rf/transmitters"},
        {"type": "homemanager/rf/capture", "transmitter": "test_tx"},
        {"type": "homemanager/rf/remote/save", "remote": {"name": "X", "transmitter": "test_tx"}},
        {"type": "homemanager/rf/button/delete", "remote_id": "luz", "button_id": "on"},
    ):
        assert (await _call(reader, message))["error"]["code"] == "unauthorized"

    errors = [
        await _call(admin, {"type": "homemanager/rf/button/save", "remote_id": "luz", "button": {"name": "Corto"}, "code": "1010"}),
        await _call(admin, {"type": "homemanager/rf/button/save", "remote_id": "luz", "button": {"name": "Raro", "function": "explode"}, "code": OTHER}),
        # Changing the code length would orphan the stored codes.
        await _call(admin, {"type": "homemanager/rf/remote/save", "remote_id": "luz", "remote": {"name": "Luz", "nbits": 32}}),
        await _call(admin, {"type": "homemanager/rf/remote/save", "remote": {"name": "Sin equipo", "transmitter": "Not A Node"}}),
        await _call(admin, {"type": "homemanager/rf/press", "remote_id": "luz", "button_id": "missing"}),
        await _call(admin, {"type": "homemanager/rf/capture", "transmitter": "absent"}),
    ]
    assert [error["error"]["code"] for error in errors] == ["invalid_code", "invalid_rf", "invalid_code", "invalid_rf", "button_not_found", "transmitter_unavailable"]

    # A remote may be saved before its transmitter is online; pressing then says why it failed.
    await _call(admin, {"type": "homemanager/rf/remote/save", "remote_id": "sala", "remote": {"name": "Sala", "transmitter": "offline_tx"}})
    await _call(admin, {"type": "homemanager/rf/button/save", "remote_id": "sala", "button": {"name": "Off"}, "code": OTHER})
    assert (await _call(admin, {"type": "homemanager/rf/press", "remote_id": "sala", "button_id": "off"}))["error"]["code"] == "transmitter_unavailable"


async def test_library_survives_restart_and_failed_writes_roll_back(hass: HomeAssistant, setup_integration, hass_ws_client, hass_storage, monkeypatch) -> None:
    _transmitter(hass)
    admin = await hass_ws_client(hass)
    await _call(admin, {"type": "homemanager/rf/remote/save", "remote_id": "luz", "remote": {"name": "Luz", "transmitter": "test_tx", "wait_us": 0}})
    await _call(admin, {"type": "homemanager/rf/button/save", "remote_id": "luz", "button": {"name": "On", "function": "light_on"}, "code": CODE})
    await hass.async_block_till_done()
    stored = hass_storage["homemanager.rf"]["data"]["remotes"]["luz"]
    assert stored["buttons"]["on"] == {"name": "On", "code": CODE, "function": "light_on"}
    assert stored["wait_us"] == 0 and stored["pulse_us"] == 350

    entry = hass.config_entries.async_entries("homemanager")[0]
    assert await hass.config_entries.async_reload(entry.entry_id)
    library = await _call(admin, {"type": "homemanager/rf/library"})
    assert library["result"]["remotes"][0]["buttons"][0]["name"] == "On"

    async def failing_save(data):
        raise OSError("disk full")

    manager = hass.data["homemanager_rf"]
    monkeypatch.setattr(manager._store, "async_save", failing_save)
    try:
        await _call(admin, {"type": "homemanager/rf/button/save", "remote_id": "luz", "button": {"name": "Off"}, "code": OTHER})
    except Exception:  # The websocket reports an unknown error; the state must not change.
        pass
    assert list(manager.library.get("luz").buttons) == ["on"]


async def test_capture_counts_presses_from_single_frame_receptions(hass: HomeAssistant, setup_integration, hass_ws_client, monkeypatch) -> None:
    _transmitter(hass)
    admin = await hass_ws_client(hass)
    assert (await _call(admin, {"type": "homemanager/rf/capture", "transmitter": "test_tx", "seconds": 10}))["success"]
    # Two presses of five frames each; frames of one press arrive ~40 ms apart.
    moments = [10.0 + index * 0.04 for index in range(5)] + [13.0 + index * 0.04 for index in range(5)]
    clock = {"now": 0.0}
    monkeypatch.setattr("custom_components.homemanager.rf._now", lambda: clock["now"])
    for index in range(10):
        clock["now"] = moments[index]
        hass.bus.async_fire(RAW_EVENT, {"timings": ",".join(map(str, _jitter(_single_frame(CODE, 400), index)))})
        await hass.async_block_till_done()
    updates = [(await admin.receive_json())["event"]["candidate"] for _ in range(10)]
    assert [update["bursts"] for update in updates] == [1] * 5 + [2] * 5
    assert updates[-1]["frames"] == 10 and updates[-1]["pulse_us"] == 400 and updates[-1]["confirmed"] is True
