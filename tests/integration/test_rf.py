"""RF remote manager: decoding, library, permissions, sending and capture.

Codes and timings are synthetic; no household remote appears here.
"""

import random

from homeassistant.core import HomeAssistant, ServiceCall

from custom_components.homemanager.const import CONF_VIEWER_USER_IDS
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

    # One press whose reception holds four identical frames is enough.
    clock = {"now": 100.0}
    monkeypatch.setattr("custom_components.homemanager.rf._now", lambda: clock["now"])
    hass.bus.async_fire(RAW_EVENT, {"timings": ",".join(map(str, _jitter(encode_timings(1, CODE, 400, repeats=4))))})
    await hass.async_block_till_done()
    second = (await admin.receive_json())["event"]["candidate"]
    assert second["confirmed"] is True and second["confirmed_by"] == "frames" and second["bursts"] == 1
    assert second["pulse_us"] == 400 and second["nbits"] == 24 and second["protocol"] == 1
    assert CODE not in str(second)

    # Try it before saving anything, with the measured pulse length.
    tested = await _call(admin, {"type": "homemanager/rf/test", "candidate_id": second["candidate_id"], "repeats": 8})
    assert tested["result"]["pulse_us"] == 400
    assert sent[-1] == {"code": CODE, "protocol": 1, "pulse_length": 400, "repeats": 8, "wait_us": 0}

    remote = await _call(
        admin,
        {"type": "homemanager/rf/remote/save", "remote": {"name": "Ventilador estudio", "icon": "mdi:ceiling-fan", "transmitter": "test_tx", "pulse_us": 400, "measured_pulse_us": 400, "repeats": 8}},
    )
    assert remote["result"]["id"] == "ventilador-estudio"
    assert remote["result"]["measured_pulse_us"] == 400 and remote["result"]["layout"] is None
    button = await _call(
        admin,
        {"type": "homemanager/rf/button/save", "remote_id": "ventilador-estudio", "button": {"name": "Velocidad 3", "icon": "mdi:numeric-3"}, "candidate_id": second["candidate_id"]},
    )
    assert button["result"]["id"] == "velocidad-3"

    library = await _call(admin, {"type": "homemanager/rf/library"})
    assert CODE not in str(library["result"])
    assert library["result"]["remotes"][0]["buttons"][0]["icon"] == "mdi:numeric-3"

    pressed = await _call(admin, {"type": "homemanager/rf/press", "remote_id": "ventilador-estudio", "button_id": "velocidad-3"})
    assert pressed["result"] == {"result": "sent"}
    assert sent[-1] == {"code": CODE, "protocol": 1, "pulse_length": 400, "repeats": 8, "wait_us": 0}


async def test_permissions_and_validation(hass: HomeAssistant, setup_integration, hass_ws_client, hass_read_only_user, hass_read_only_access_token) -> None:
    sent = _transmitter(hass)
    admin = await hass_ws_client(hass)
    await _call(admin, {"type": "homemanager/rf/remote/save", "remote_id": "luz", "remote": {"name": "Luz", "transmitter": "test_tx"}})
    imported = await _call(admin, {"type": "homemanager/rf/button/save", "remote_id": "luz", "button": {"name": "On"}, "code": CODE})
    assert imported["success"]

    reader = await hass_ws_client(hass, hass_read_only_access_token)
    # Private by default, like the homes: a non-admin needs to be a selected viewer.
    for message in (
        {"type": "homemanager/rf/library"},
        {"type": "homemanager/rf/subscribe"},
        {"type": "homemanager/rf/press", "remote_id": "luz", "button_id": "on"},
        {"type": "homemanager/rf/assume", "entity_id": "light.luz", "is_on": True},
    ):
        assert (await _call(reader, message))["error"]["code"] == "unauthorized"
    assert sent == []
    hass.config_entries.async_update_entry(setup_integration, options={CONF_VIEWER_USER_IDS: [hass_read_only_user.id]})
    await hass.async_block_till_done()
    # A viewer operates remotes; configuring them stays with administrators.
    assert (await _call(reader, {"type": "homemanager/rf/press", "remote_id": "luz", "button_id": "on"}))["success"]
    assert sent[-1]["code"] == CODE
    assert (await _call(reader, {"type": "homemanager/rf/library"}))["success"]
    for message in (
        {"type": "homemanager/rf/transmitters"},
        {"type": "homemanager/rf/capture", "transmitter": "test_tx"},
        {"type": "homemanager/rf/remote/save", "remote": {"name": "X", "transmitter": "test_tx"}},
        {"type": "homemanager/rf/button/delete", "remote_id": "luz", "button_id": "on"},
    ):
        assert (await _call(reader, message))["error"]["code"] == "unauthorized"

    errors = [
        await _call(admin, {"type": "homemanager/rf/button/save", "remote_id": "luz", "button": {"name": "Corto"}, "code": "1010"}),
        await _call(admin, {"type": "homemanager/rf/button/save", "remote_id": "luz", "button": {"name": "Raro", "icon": "explode"}, "code": OTHER}),
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
    await _call(admin, {"type": "homemanager/rf/button/save", "remote_id": "luz", "button": {"name": "On", "icon": "mdi:lightbulb-on"}, "code": CODE})
    await hass.async_block_till_done()
    assert hass_storage["homemanager.rf"]["version"] == 2
    stored = hass_storage["homemanager.rf"]["data"]["remotes"]["luz"]
    assert stored["buttons"]["on"] == {"name": "On", "code": CODE, "icon": "mdi:lightbulb-on"}
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


async def _receive(hass: HomeAssistant, client, moments: list[float], monkeypatch, bits: str = CODE) -> list[dict]:
    """Single-frame receptions (one event per frame, as the Athom receiver
    delivers them) at the given moments; returns the pushed events."""
    clock = {"now": 0.0}
    monkeypatch.setattr("custom_components.homemanager.rf._now", lambda: clock["now"])
    for index, moment in enumerate(moments):
        clock["now"] = moment
        hass.bus.async_fire(RAW_EVENT, {"timings": ",".join(map(str, _jitter(_single_frame(bits, 400), index)))})
        await hass.async_block_till_done()
    return [(await client.receive_json())["event"] for _ in moments]


async def test_capture_confirms_three_frames_of_one_press(hass: HomeAssistant, setup_integration, hass_ws_client, monkeypatch) -> None:
    _transmitter(hass)
    admin = await hass_ws_client(hass)
    assert (await _call(admin, {"type": "homemanager/rf/capture", "transmitter": "test_tx", "seconds": 10}))["success"]
    # Frames of one press arrive ~50 ms apart: the third one confirms the code.
    updates = [event["candidate"] for event in await _receive(hass, admin, [10.0, 10.05, 10.1, 10.15], monkeypatch)]
    assert [update["confirmed"] for update in updates] == [False, False, True, True]
    assert updates[2]["confirmed_by"] == "frames" and updates[2]["bursts"] == 1 and updates[2]["burst_frames"] == 3
    assert updates[-1]["frames"] == 4 and abs(updates[-1]["pulse_us"] - 400) <= 20


async def test_capture_confirms_two_quick_presses_and_reports_noise(hass: HomeAssistant, setup_integration, hass_ws_client, monkeypatch) -> None:
    _transmitter(hass)
    admin = await hass_ws_client(hass)
    assert (await _call(admin, {"type": "homemanager/rf/capture", "transmitter": "test_tx", "seconds": 10}))["success"]
    # A weak signal: one frame per press, presses half a second apart. Before
    # 0.5 two presses closer than a second counted as one and never confirmed.
    updates = [event["candidate"] for event in await _receive(hass, admin, [20.0, 20.5], monkeypatch)]
    assert [(update["bursts"], update["confirmed"]) for update in updates] == [(1, False), (2, True)]
    assert updates[-1]["confirmed_by"] == "presses"

    # Signals that no supported protocol explains are reported, throttled.
    for moment in (30.0, 30.1, 30.7):
        monkeypatch.setattr("custom_components.homemanager.rf._now", lambda moment=moment: moment)
        hass.bus.async_fire(RAW_EVENT, {"timings": ",".join(["300", "-300"] * 20)})
        await hass.async_block_till_done()
    assert [(await admin.receive_json())["event"] for _ in range(2)] == [{"noise": 1}, {"noise": 3}]


async def test_parts_layout_and_button_deletion(hass: HomeAssistant, setup_integration, hass_ws_client) -> None:
    _transmitter(hass)
    admin = await hass_ws_client(hass)
    await _call(admin, {"type": "homemanager/rf/remote/save", "remote_id": "sala", "remote": {"name": "Sala", "transmitter": "test_tx"}})
    for name, code in (("Off", CODE), ("Luz", OTHER)):
        assert (await _call(admin, {"type": "homemanager/rf/button/save", "remote_id": "sala", "button": {"name": name}, "code": code}))["success"]
    parts = await _call(admin, {"type": "homemanager/rf/parts/save", "remote_id": "sala", "parts": [{"name": "Luz", "kind": "light", "roles": {"toggle": "luz"}}]})
    assert parts["result"]["parts"] == [{"id": "luz", "name": "Luz", "kind": "light", "speeds": None, "roles": {"toggle": "luz"}}]
    # A role for a light can only be a light role, and must point at a button.
    for bad in ({"name": "Luz", "kind": "light", "roles": {"speed_1": "off"}}, {"name": "Luz", "kind": "light", "roles": {"on": "missing"}}, {"name": "X", "kind": "tv"}):
        assert (await _call(admin, {"type": "homemanager/rf/parts/save", "remote_id": "sala", "parts": [bad]}))["error"]["code"] == "invalid_rf"
    # Learning a button straight into a role.
    added = await _call(admin, {"type": "homemanager/rf/button/save", "remote_id": "sala", "button": {"name": "Luz on"}, "code": "1" * 24, "role": {"part": "luz", "role": "on"}})
    assert added["success"]
    assert (await _call(admin, {"type": "homemanager/rf/library"}))["result"]["remotes"][0]["parts"][0]["roles"] == {"toggle": "luz", "on": "luz-on"}

    layout = [
        {"id": "power", "type": "toggle", "x": 0, "y": 0, "w": 2, "h": 1, "buttons": ["luz-on", "off"], "label": "Luz"},
        {"id": "off", "type": "button", "x": 2, "y": 0, "w": 2, "h": 1, "buttons": ["off"], "icon": "mdi:power"},
    ]
    saved = await _call(admin, {"type": "homemanager/rf/layout/save", "remote_id": "sala", "layout": layout})
    assert saved["success"], saved
    assert [widget["id"] for widget in saved["result"]["layout"]] == ["power", "off"]
    for bad in (
        [{**layout[0], "x": 3}],  # wider than the grid
        [{**layout[0], "buttons": ["missing"]}],
        [{**layout[1], "type": "updown"}],  # needs two buttons
        [layout[1], layout[1]],
    ):
        assert (await _call(admin, {"type": "homemanager/rf/layout/save", "remote_id": "sala", "layout": bad}))["error"]["code"] == "invalid_layout"

    # A new button joins a designed remote at the bottom.
    await _call(admin, {"type": "homemanager/rf/button/save", "remote_id": "sala", "button": {"name": "Timer"}, "code": "0" * 23 + "1"})
    remote = (await _call(admin, {"type": "homemanager/rf/library"}))["result"]["remotes"][0]
    assert remote["layout"][-1] == {"id": "b-timer", "type": "button", "x": 0, "y": 1, "w": 1, "h": 1, "buttons": ["timer"], "label": None, "icon": None}
    # Deleting a button removes it from roles and widgets; a toggle keeps working with one.
    assert (await _call(admin, {"type": "homemanager/rf/button/delete", "remote_id": "sala", "button_id": "off"}))["success"]
    remote = (await _call(admin, {"type": "homemanager/rf/library"}))["result"]["remotes"][0]
    assert [(widget["id"], widget["buttons"]) for widget in remote["layout"]] == [("power", ["luz-on"]), ("b-timer", ["timer"])]
    assert (await _call(admin, {"type": "homemanager/rf/layout/save", "remote_id": "sala", "layout": None}))["result"]["layout"] is None


async def test_devices_list_every_esphome_device_and_default_receiver(hass: HomeAssistant, setup_integration, hass_ws_client) -> None:
    from homeassistant.helpers import device_registry as dr
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    _transmitter(hass, "athom_a")
    registry = dr.async_get(hass)
    for node, title in (("athom-a", "Athom A"), ("bedroom-sensor", "Bedroom sensor")):
        entry = MockConfigEntry(domain="esphome", title=title, data={"device_name": node, "host": "192.0.2.1"})
        entry.add_to_hass(hass)
        registry.async_get_or_create(config_entry_id=entry.entry_id, identifiers={("esphome", node)}, name=title, manufacturer="Example", model="RF bridge")
    admin = await hass_ws_client(hass)
    devices = (await _call(admin, {"type": "homemanager/rf/devices"}))["result"]
    assert [(item["id"], item["name"], item["has_package"], item["can_capture"]) for item in devices["devices"]] == [
        ("athom_a", "Athom A", True, True),
        ("bedroom_sensor", "Bedroom sensor", False, False),
    ]
    assert devices["package"].startswith("github://Delpoo/homemanager/esphome/homemanager-rf.yaml@v")
    assert devices["default_receiver"] is None and devices["builder_url"] is None

    assert (await _call(admin, {"type": "homemanager/rf/default_receiver", "receiver": "athom_a"}))["success"]
    assert (await _call(admin, {"type": "homemanager/rf/devices"}))["result"]["default_receiver"] == "athom_a"
    assert (await _call(admin, {"type": "homemanager/rf/default_receiver", "receiver": "Not A Node"}))["error"]["code"] == "invalid_rf"


async def test_remotes_from_0_4_are_migrated_with_the_same_entities(hass: HomeAssistant, hass_storage, bundle_dir) -> None:
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    from custom_components.homemanager.const import DOMAIN

    codes = {name: format(index, "024b") for index, name in enumerate(["off", "s1", "s2", "light", "timer"], start=1)}
    hass_storage["homemanager.rf"] = {
        "version": 1,
        "key": "homemanager.rf",
        "data": {
            "remotes": {
                "techo": {
                    "name": "Techo",
                    "transmitter": "test_tx",
                    "protocol": 1,
                    "nbits": 24,
                    "pulse_us": 400,
                    "repeats": 5,
                    "wait_us": 0,
                    "speeds": None,
                    "buttons": {
                        "off": {"name": "Off", "code": codes["off"], "function": "off"},
                        "v1": {"name": "V1", "code": codes["s1"], "function": "speed_1"},
                        "v2": {"name": "V2", "code": codes["s2"], "function": "speed_2"},
                        "luz": {"name": "Luz", "code": codes["light"], "function": "light"},
                        "1h": {"name": "1H", "code": codes["timer"], "function": "timer"},
                    },
                }
            }
        },
    }
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    remote = hass.data["homemanager_rf"].library.get("techo")
    assert {key: (part.kind, part.roles) for key, part in remote.parts.items()} == {
        "fan": ("fan", {"off": "off", "speed_1": "v1", "speed_2": "v2"}),
        "light": ("light", {"toggle": "luz"}),
    }
    assert remote.buttons["1h"].icon == "mdi:timer-outline" and remote.icon == "mdi:ceiling-fan-light"
    # Same unique ids as 0.4: the fan keeps the device name, the light its own.
    assert hass.states.get("fan.techo").attributes["percentage_step"] == 50
    assert hass.states.get("light.techo_light") is not None
    assert hass.states.get("button.techo_1h") is not None
