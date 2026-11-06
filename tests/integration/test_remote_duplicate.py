"""0.13: a control is duplicated for another appliance (synthetic data)."""

from copy import deepcopy

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homemanager.const import DOMAIN

RF_CODE = "010110010011101001010110"
LAYOUT = [
    {"id": "grid", "type": "canvas", "x": 0, "y": 0, "w": 3, "h": 4, "buttons": [], "label": None, "icon": None, "theme": "grafito"},
    {"id": "power-widget", "type": "button", "x": 0, "y": 0, "w": 1, "h": 1, "buttons": ["power"], "label": "Power", "icon": "mdi:power", "radius": 999},
]


def _storage(hass_storage) -> None:
    hass_storage["homemanager.rf"] = {"version": 2, "minor_version": 1, "key": "homemanager.rf", "data": {"remotes": {"demo-fan": {
        "name": "Demo fan", "transmitter": "demo_tx", "protocol": 1, "nbits": 24, "pulse_us": 350, "repeats": 5, "wait_us": 0,
        "buttons": {"power": {"name": "Power", "code": RF_CODE, "icon": "mdi:power"}}, "parts": {}, "layout": deepcopy(LAYOUT)}}}}
    hass_storage["homemanager.ir"] = {"version": 1, "minor_version": 1, "key": "homemanager.ir", "data": {"remotes": {"demo-air": {
        "name": "Demo air", "emitter": "infrared.demo_a", "buttons": {"power": {"name": "Power", "emitter": "infrared.demo_c",
        "signal": {"carrier_hz": 38_000, "timings_us": [9000, -4500, 560, -560]}}}, "layout": deepcopy(LAYOUT)}}}}


async def _call(client, message_type: str, **fields) -> dict:
    await client.send_json_auto_id({"type": message_type, **fields})
    return await client.receive_json()


async def test_a_control_is_copied_with_its_design_for_another_appliance(hass: HomeAssistant, hass_storage, bundle_dir, hass_ws_client) -> None:
    _storage(hass_storage)
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    admin = await hass_ws_client(hass)

    rf = (await _call(admin, "homemanager/rf/remote/duplicate", remote_id="demo-fan", name="Demo fan bedroom", transmitter="other_tx"))["result"]
    assert rf["id"] == "demo-fan-bedroom" and rf["name"] == "Demo fan bedroom"
    assert rf["transmitter"] == "other_tx"
    assert rf["layout"] == LAYOUT
    assert [button["id"] for button in rf["buttons"]] == ["power"]
    library = (await _call(admin, "homemanager/rf/library"))["result"]["remotes"]
    assert {remote["id"] for remote in library} == {"demo-fan", "demo-fan-bedroom"}

    ir = (await _call(admin, "homemanager/remotes/ir/remote/duplicate", remote_id="demo-air", name="Demo air bedroom", emitter="infrared.demo_b"))["result"]
    assert ir["id"] == "demo-air-bedroom" and ir["layout"] == LAYOUT
    settings = (await _call(admin, "homemanager/remotes/ir/settings", remote_id="demo-air-bedroom"))["result"]
    # A new emitter is used for every button of the copy.
    assert settings["emitter"] == "infrared.demo_b"
    assert settings["buttons"]["power"]["emitter"] is None
    original = (await _call(admin, "homemanager/remotes/ir/settings", remote_id="demo-air"))["result"]
    assert original["buttons"]["power"]["emitter"] == "infrared.demo_c"

    missing = await _call(admin, "homemanager/rf/remote/duplicate", remote_id="nope", name="X")
    assert missing["success"] is False and missing["error"]["code"] == "remote_not_found"
