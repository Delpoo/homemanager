"""Fan, light and button entities built from RF remotes. Synthetic codes only."""

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import entity_registry as er

CODES = {name: format(index, "024b") for index, name in enumerate(["off", "s1", "s2", "s3", "dir", "light", "timer", "up", "down", "power"], start=1)}


def _transmitter(hass: HomeAssistant) -> list[str]:
    sent: list[str] = []

    async def send(call: ServiceCall) -> None:
        sent.append(next(name for name, code in CODES.items() if code == call.data["code"]))

    hass.services.async_register("esphome", "test_tx_homemanager_rf_send", send)
    return sent


async def _call(client, message: dict) -> dict:
    await client.send_json_auto_id(message)
    return await client.receive_json()


async def _remote(client, remote_id: str, buttons: list[tuple[str, str, str | None]], **settings) -> None:
    assert (await _call(client, {"type": "homemanager/rf/remote/save", "remote_id": remote_id, "remote": {"name": remote_id.title(), "transmitter": "test_tx", **settings}}))["success"]
    for name, code, function in buttons:
        response = await _call(client, {"type": "homemanager/rf/button/save", "remote_id": remote_id, "button": {"name": name, "function": function}, "code": CODES[code]})
        assert response["success"], response


async def test_fan_light_and_buttons_follow_the_remote(hass: HomeAssistant, setup_integration, hass_ws_client) -> None:
    sent = _transmitter(hass)
    client = await hass_ws_client(hass)
    await _remote(
        client,
        "ventilador",
        [("Off", "off", "off"), ("V1", "s1", "speed_1"), ("V2", "s2", "speed_2"), ("V3", "s3", "speed_3"), ("F/R", "dir", "direction"), ("Luz", "light", "light"), ("1H", "timer", "timer")],
    )
    await hass.async_block_till_done()

    fan = hass.states.get("fan.ventilador")
    assert fan.attributes["assumed_state"] is True
    assert fan.attributes["percentage_step"] == 100 / 3
    assert fan.attributes["homemanager_remote"] == "ventilador"
    assert hass.states.get("light.ventilador_light") is not None
    assert hass.states.get("button.ventilador_1h") is not None
    # Speed, off and direction buttons live in the fan, the light button in the light.
    assert hass.states.get("button.ventilador_v2") is None

    await hass.services.async_call("fan", "set_percentage", {"entity_id": "fan.ventilador", "percentage": 66}, blocking=True)
    # The same speed again is sent again: that is how a user re-synchronizes.
    await hass.services.async_call("fan", "set_percentage", {"entity_id": "fan.ventilador", "percentage": 66}, blocking=True)
    assert sent == ["s2", "s2"]
    assert hass.states.get("fan.ventilador").state == "on"
    await hass.services.async_call("fan", "set_direction", {"entity_id": "fan.ventilador", "direction": "reverse"}, blocking=True)
    await hass.services.async_call("fan", "turn_off", {"entity_id": "fan.ventilador"}, blocking=True)
    await hass.services.async_call("fan", "turn_on", {"entity_id": "fan.ventilador"}, blocking=True)
    assert sent[2:] == ["dir", "off", "s2"]

    # A toggle code is only sent when the assumed state differs.
    await hass.services.async_call("light", "turn_on", {"entity_id": "light.ventilador_light"}, blocking=True)
    await hass.services.async_call("light", "turn_on", {"entity_id": "light.ventilador_light"}, blocking=True)
    assert sent[5:] == ["light"]
    # Someone switched it off with the physical remote: correct without sending.
    assert (await _call(client, {"type": "homemanager/rf/assume", "entity_id": "light.ventilador_light", "is_on": False}))["success"]
    assert hass.states.get("light.ventilador_light").state == "off"
    assert sent[5:] == ["light"]
    await hass.services.async_call("light", "turn_on", {"entity_id": "light.ventilador_light"}, blocking=True)
    assert sent[5:] == ["light", "light"]

    await hass.services.async_call("button", "press", {"entity_id": "button.ventilador_1h"}, blocking=True)
    assert sent[-1] == "timer"

    # Removing a button removes its entity.
    assert (await _call(client, {"type": "homemanager/rf/button/delete", "remote_id": "ventilador", "button_id": "1h"}))["success"]
    await hass.async_block_till_done()
    assert er.async_get(hass).async_get_entity_id("button", "homemanager", "rf_ventilador_button_1h") is None
    assert hass.states.get("button.ventilador_1h") is None


async def test_speed_by_steps_power_toggle_and_errors(hass: HomeAssistant, setup_integration, hass_ws_client, monkeypatch) -> None:
    monkeypatch.setattr("custom_components.homemanager.rf_entity.STEP_DELAY_SECONDS", 0)
    sent = _transmitter(hass)
    client = await hass_ws_client(hass)
    await _remote(client, "techo", [("Power", "power", "power"), ("Más", "up", "speed_up"), ("Menos", "down", "speed_down")], speeds=4)
    await hass.async_block_till_done()

    assert hass.states.get("fan.techo").attributes["percentage_step"] == 25
    await hass.services.async_call("fan", "set_percentage", {"entity_id": "fan.techo", "percentage": 75}, blocking=True)
    assert sent == ["up", "up", "up"]
    await hass.services.async_call("fan", "set_percentage", {"entity_id": "fan.techo", "percentage": 25}, blocking=True)
    assert sent[3:] == ["down", "down"]
    # Power toggles: off is sent once, a second off sends nothing.
    await hass.services.async_call("fan", "turn_off", {"entity_id": "fan.techo"}, blocking=True)
    await hass.services.async_call("fan", "turn_off", {"entity_id": "fan.techo"}, blocking=True)
    assert sent[5:] == ["power"]

    assert (await _call(client, {"type": "homemanager/rf/assume", "entity_id": "sensor.nope", "is_on": True}))["error"]["code"] == "entity_not_found"
