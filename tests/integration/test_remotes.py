"""Compatibility and privacy checks for the Remotes catalog using synthetic data."""

from copy import deepcopy
from hashlib import sha256

from homeassistant.core import HomeAssistant, ServiceCall
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homemanager.const import CONF_VIEWER_USER_IDS, DOMAIN
from custom_components.homemanager.ir_model import IrSignal
from custom_components.homemanager.model import ModelError


RF_CODE = "010110010011101001010110"
IR_SIGNAL = {"carrier_hz": 37_963, "timings_us": [1350, -479, 610, -32_100, 505, -8_040]}
LAYOUT = [{"id": "power-widget", "type": "button", "x": 1, "y": 2, "w": 1, "h": 1, "buttons": ["power"], "label": "Power", "icon": "mdi:power"}]


def _rf_storage(version: int) -> dict:
    remote = {
        "name": "Demo fan",
        "transmitter": "demo_tx",
        "protocol": 2,
        "nbits": 24,
        "pulse_us": 640,
        "repeats": 6,
        "wait_us": 1250,
        "buttons": {"power": {"name": "Power", "code": RF_CODE}},
    }
    data = {"remotes": {"demo-fan": remote}}
    if version == 1:
        remote["buttons"]["power"]["function"] = "power"
    else:
        remote["buttons"]["power"]["icon"] = "mdi:power"
        remote["measured_pulse_us"] = 650
        remote["parts"] = {"fan": {"name": "Demo fan", "kind": "fan", "roles": {"toggle": "power"}}}
        remote["layout"] = deepcopy(LAYOUT)
        data["default_receiver"] = "demo_rx"
    return {"version": version, "minor_version": 1, "key": "homemanager.rf", "data": data}


def _ir_storage() -> dict:
    ir = {
        "name": "Demo infrared",
        "emitter": "infrared.demo_emitter",
        "icon": "mdi:remote",
        "description": "Synthetic IR control",
        "buttons": {
            "power": {
                "name": "Power",
                "icon": "mdi:power",
                "emitter": "00000000000000000000000000000001",
                "signal": deepcopy(IR_SIGNAL),
            }
        },
        "layout": deepcopy(LAYOUT),
    }
    return {
        "version": 1,
        "minor_version": 1,
        "key": "homemanager.ir",
        "data": {
            "remotes": {
                "demo-fan": ir,
                "invalid-ir": {**ir, "buttons": {"power": {"name": "Power", "signal": {"carrier_hz": 38_000, "timings_us": [500, 0]}}}},
            }
        },
    }


async def _call(client, message_type: str, **fields) -> dict:
    await client.send_json_auto_id({"type": message_type, **fields})
    return await client.receive_json()


@pytest.mark.parametrize("version", [1, 2])
async def test_remotes_library_projects_existing_rf_and_isolates_ir(hass: HomeAssistant, hass_storage, bundle_dir, hass_ws_client, version: int) -> None:
    rf_storage = _rf_storage(version)
    ir_storage = _ir_storage()
    hass_storage["homemanager.rf"] = deepcopy(rf_storage)
    hass_storage["homemanager.ir"] = deepcopy(ir_storage)
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    # Version 1 can go through the existing HA Store migration during setup.
    # Opening the combined catalog must not perform a separate storage write.
    saved_rf = deepcopy(hass_storage["homemanager.rf"])
    if version == 2:
        assert saved_rf == rf_storage
    else:
        assert saved_rf["version"] == 2
        migrated = saved_rf["data"]["remotes"]["demo-fan"]
        assert migrated["buttons"]["power"]["code"] == RF_CODE
        assert migrated["parts"]["fan"]["roles"] == {"toggle": "power"}

    admin = await hass_ws_client(hass)
    legacy = (await _call(admin, "homemanager/rf/library"))["result"]
    assert len(legacy["remotes"]) == 1
    original = legacy["remotes"][0]
    assert original["id"] == "demo-fan"
    assert original["transmitter"] == "demo_tx"
    assert [original[key] for key in ("protocol", "nbits", "pulse_us", "repeats", "wait_us")] == [2, 24, 640, 6, 1250]
    assert original["parts"][0]["roles"] == {"toggle": "power"}
    assert original["layout"] == (LAYOUT if version == 2 else None)
    assert original["buttons"][0]["fingerprint"] == sha256(RF_CODE.encode()).hexdigest()[:8]
    assert hass.states.get("fan.demo_fan") is not None

    mixed = (await _call(admin, "homemanager/remotes/library"))["result"]
    assert set(mixed) == {"remotes"}
    assert len(mixed["remotes"]) == 2
    rf, ir = (next(item for item in mixed["remotes"] if item["source"] == source) for source in ("rf", "ir"))
    assert rf == {**original, "source": "rf", "buttons": [{**original["buttons"][0], "command_type": "rf_rcswitch"}]}
    assert set(ir) == {"id", "source", "name", "icon", "description", "buttons", "layout"}
    assert ir["id"] == original["id"]
    assert ir["name"] == "Demo infrared"
    assert ir["icon"] == "mdi:remote"
    assert ir["description"] == "Synthetic IR control"
    assert ir["layout"] == LAYOUT
    [ir_button] = ir["buttons"]
    assert set(ir_button) == {"id", "name", "icon", "fingerprint", "command_type"}
    assert (ir_button["id"], ir_button["name"], ir_button["icon"], ir_button["command_type"]) == ("power", "Power", "mdi:power", "ir_raw")
    assert ir_button["fingerprint"]
    assert RF_CODE not in str(mixed)
    assert (await _call(admin, "homemanager/rf/library"))["result"] == legacy

    sent = []

    async def send(call: ServiceCall) -> None:
        sent.append(dict(call.data))

    hass.services.async_register("esphome", "demo_tx_homemanager_rf_send", send)
    pressed = await _call(admin, "homemanager/rf/press", remote_id="demo-fan", button_id="power")
    assert pressed["result"] == {"result": "sent"}
    assert sent == [{"code": RF_CODE, "protocol": 2, "pulse_length": 640, "repeats": 6, "wait_us": 1250}]

    await hass.async_block_till_done()
    assert hass_storage["homemanager.rf"] == saved_rf
    assert hass_storage["homemanager.ir"] == ir_storage


async def test_remotes_library_uses_existing_viewer_permissions(hass: HomeAssistant, setup_integration, hass_ws_client, hass_read_only_user, hass_read_only_access_token) -> None:
    reader = await hass_ws_client(hass, hass_read_only_access_token)
    endpoint = "homemanager/remotes/library"
    assert (await _call(reader, endpoint))["error"]["code"] == "unauthorized"

    hass.config_entries.async_update_entry(setup_integration, options={CONF_VIEWER_USER_IDS: [hass_read_only_user.id]})
    await hass.async_block_till_done()
    assert (await _call(reader, endpoint))["result"] == {"remotes": []}


async def test_remotes_library_tracks_live_rf_changes_and_entry_lifecycle(hass: HomeAssistant, setup_integration, hass_ws_client) -> None:
    admin = await hass_ws_client(hass)
    endpoint = "homemanager/remotes/library"
    assert (await _call(admin, endpoint))["result"] == {"remotes": []}
    created = await _call(admin, "homemanager/rf/remote/save", remote={"name": "Demo RF", "transmitter": "demo_tx"})
    assert created["success"]
    expected = {"remotes": [{**created["result"], "source": "rf"}]}
    assert (await _call(admin, endpoint))["result"] == expected

    entry_id = setup_integration.entry_id
    assert await hass.config_entries.async_unload(entry_id)
    assert (await _call(admin, endpoint))["error"]["code"] == "not_loaded"
    assert await hass.config_entries.async_setup(entry_id)
    await hass.async_block_till_done()
    assert (await _call(admin, endpoint))["result"] == expected


@pytest.mark.parametrize(
    ("raw", "carrier_source"),
    [
        (IR_SIGNAL, "known"),
        ({"carrier_hz": 1_000_000, "carrier_source": "estimated", "timings_us": [808, -404, 202]}, "estimated"),
        ({"carrier_hz": None, "carrier_source": "unknown", "timings_us": [808, -404]}, "unknown"),
        ({"carrier_hz": 0, "timings_us": [100, -100] * 2048}, "known"),
        ({"carrier_hz": 38_000, "timings_us": [100_000, -100_000] * 10}, "known"),
    ],
)
def test_ir_signal_preserves_raw_durations_and_carrier(raw: dict, carrier_source: str) -> None:
    result = IrSignal.from_dict(raw).as_dict()
    assert result == {**raw, "carrier_source": carrier_source}
    assert IrSignal.from_dict(result).as_dict() == result


@pytest.mark.parametrize(
    "invalid",
    [
        {"timings_us": []},
        {"timings_us": [-500, 500]},
        {"timings_us": [500, -400, -300]},
        {"timings_us": [500, 0]},
        {"timings_us": [True, -500]},
        {"timings_us": [500, -100.5]},
        {"timings_us": [100, -100] * 2048 + [100]},
        {"timings_us": [100_000, -100_000] * 10 + [1]},
        {"carrier_hz": True},
        {"carrier_hz": 38_000.0},
        {"carrier_hz": -1},
        {"carrier_hz": 1_000_001},
        {"carrier_hz": None},
        {"carrier_hz": None, "carrier_source": "known"},
        {"carrier_source": "unknown"},
        {"carrier_source": "guessed"},
    ],
)
def test_ir_signal_rejects_invalid_waveforms_and_carriers(invalid: dict) -> None:
    with pytest.raises(ModelError):
        IrSignal.from_dict({**IR_SIGNAL, **invalid})
