"""Echo of RF presses: whether a receiver heard the transmission on air.

Hearing the code back is evidence that it was emitted, never that the device
received it. Codes, nodes and names are synthetic.
"""

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import device_registry as dr
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homemanager.rf import RAW_EVENT
from custom_components.homemanager.rf_codec import encode_timings

CODE = "101101011001011001110101"
OTHER = "010010100110100110001010"


def _node(hass: HomeAssistant, node: str, title: str, *, capture: bool = True, echo: str | None = None) -> list[dict]:
    """An ESPHome node with the package. `echo` is the code its receiver hears while it sends."""
    calls: list[dict] = []
    entry = MockConfigEntry(domain="esphome", title=title, data={"device_name": node.replace("_", "-"), "host": "192.0.2.1"})
    entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(config_entry_id=entry.entry_id, identifiers={("esphome", node)}, name=title)

    async def send(call: ServiceCall) -> None:
        calls.append({"send": call.data["code"]})
        if echo:
            hass.bus.async_fire(RAW_EVENT, {"device_id": device.id, "timings": ",".join(map(str, encode_timings(1, echo, 400, repeats=4)))})

    async def listen(call: ServiceCall) -> None:
        calls.append({"capture": call.data["seconds"]})

    hass.services.async_register("esphome", f"{node}_homemanager_rf_send", send)
    if capture:
        hass.services.async_register("esphome", f"{node}_homemanager_rf_capture", listen)
    return calls


async def _call(client, message: dict) -> dict:
    await client.send_json_auto_id(message)
    return await client.receive_json()


async def _remote(client) -> None:
    assert (await _call(client, {"type": "homemanager/rf/remote/save", "remote_id": "techo", "remote": {"name": "Techo", "transmitter": "athom_a"}}))["success"]
    assert (await _call(client, {"type": "homemanager/rf/button/save", "remote_id": "techo", "button": {"name": "1H"}, "code": CODE}))["success"]


async def _press(hass: HomeAssistant, client) -> dict:
    assert (await _call(client, {"type": "homemanager/rf/press", "remote_id": "techo", "button_id": "1h"}))["result"] == {"result": "sent"}
    await hass.async_block_till_done(wait_background_tasks=True)
    return hass.states.get("button.techo_1h").attributes["homemanager_on_air"]


async def test_the_transmitter_hearing_its_own_code_reports_it_on_air(hass: HomeAssistant, setup_integration, hass_ws_client) -> None:
    calls = _node(hass, "athom_a", "Athom A", echo=CODE)
    client = await hass_ws_client(hass)
    await _remote(client)
    await hass.async_block_till_done()
    assert "homemanager_on_air" not in hass.states.get("button.techo_1h").attributes

    on_air = await _press(hass, client)
    assert on_air["result"] == "heard" and on_air["by"] == "Athom A" and on_air["at"]
    # The receive window opens before the transmission, so the echo is not missed.
    assert calls == [{"capture": 3}, {"send": CODE}]
    # Evidence of emission only: the button keeps its own state, and nothing is confirmed.
    assert hass.states.get("button.techo_1h").attributes["homemanager_remote_button"] == "techo"


async def test_another_receiver_or_another_code_and_no_receivers(hass: HomeAssistant, setup_integration, hass_ws_client, monkeypatch) -> None:
    monkeypatch.setattr("custom_components.homemanager.rf.ECHO_WAIT_SECONDS", 0.05)
    # The transmitter hears something else; a second node with the package hears nothing.
    _node(hass, "athom_a", "Athom A", echo=OTHER)
    other = _node(hass, "athom_b", "Athom B")
    client = await hass_ws_client(hass)
    await _remote(client)
    first = await _press(hass, client)
    assert first["result"] == "not_heard" and first["by"] is None
    assert other == [{"capture": 3}]

    # A second press replaces the report (a new stamp the frontend waits for).
    second = await _press(hass, client)
    assert second["at"] != first["at"]

    # Without a receiver able to listen, it is unverified, not "not heard".
    hass.services.async_remove("esphome", "athom_a_homemanager_rf_capture")
    hass.services.async_remove("esphome", "athom_b_homemanager_rf_capture")
    assert (await _press(hass, client))["result"] == "unverified"


async def test_an_echo_never_shortens_a_learning_window_or_fails_a_press(hass: HomeAssistant, setup_integration, hass_ws_client, monkeypatch) -> None:
    monkeypatch.setattr("custom_components.homemanager.rf.ECHO_WAIT_SECONDS", 0.05)
    calls = _node(hass, "athom_a", "Athom A")
    client = await hass_ws_client(hass)
    await _remote(client)
    learning = await _hass_ws_capture(hass, hass_ws_client)
    assert calls == [{"capture": 20}]
    await _press(hass, client)
    # The learning window stays as it was: no 3 s window replaces it.
    assert calls == [{"capture": 20}, {"send": CODE}]
    await learning.close()

    # A receiver that fails to open its window does not fail the press.
    async def broken(call: ServiceCall) -> None:
        raise RuntimeError("offline")

    hass.services.async_register("esphome", "athom_a_homemanager_rf_capture", broken)
    assert (await _press(hass, client))["result"] == "unverified"
    assert calls[-1] == {"send": CODE}


async def _hass_ws_capture(hass: HomeAssistant, hass_ws_client):
    """A second connection that keeps a learning capture open on athom_a."""
    learning = await hass_ws_client(hass)
    assert (await _call(learning, {"type": "homemanager/rf/capture", "transmitter": "athom_a", "seconds": 20}))["success"]
    return learning
