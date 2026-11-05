"""Exercise manual IR learning with a synthetic proxy and HA WebSocket clients."""

import asyncio
from copy import deepcopy
from unittest.mock import AsyncMock, Mock

from homeassistant.helpers.storage import Store
from homeassistant.util.file import WriteError
import pytest

from custom_components.homemanager.const import CONF_VIEWER_USER_IDS
from custom_components.homemanager.ir_model import IrSignal
from custom_components.homemanager.ir_proxy import IrProxy
from custom_components.homemanager.remotes import DATA_REMOTES, IR_STORAGE_KEY


IR_API = "homemanager/remotes/ir"
RX = "esphome:11111111111111111111111111111111"
TX = "esphome:22222222222222222222222222222222"
OTHER_TX = "esphome:33333333333333333333333333333333"
TIMINGS = (1350, -479, 610, -32_100, 505, -8_040)
CARRIER = 37_963
RF_CODE = "010110010011101001010110"


@pytest.fixture
def proxy(monkeypatch):
    devices = {
        "receivers": [{"id": RX, "name": "Demo receiver"}],
        "emitters": [{"id": TX, "name": "Demo emitter"}, {"id": OTHER_TX, "name": "Other emitter"}],
    }
    receive = AsyncMock(return_value=TIMINGS)
    send = Mock()
    monkeypatch.setattr(IrProxy, "devices", lambda self: devices)
    monkeypatch.setattr(IrProxy, "async_capture", receive)
    monkeypatch.setattr(IrProxy, "send", send)
    return devices, receive, send


async def _call(client, message_type: str, **fields) -> dict:
    await client.send_json_auto_id({"type": message_type, **fields})
    return await client.receive_json()


async def _learn(client) -> str:
    subscription = await _call(client, f"{IR_API}/capture", receiver_id=RX)
    assert subscription["success"]
    message = await client.receive_json()
    assert message["id"] == subscription["id"]
    assert message["type"] == "event"
    event = message["event"]
    assert set(event) == {"candidate_id", "count", "duration_us"}
    assert event["count"] == len(TIMINGS)
    assert event["duration_us"] == sum(map(abs, TIMINGS))
    assert (await _call(client, "unsubscribe_events", subscription=subscription["id"]))["success"]
    return event["candidate_id"]


def _signal(candidate_id: str, emitter_id: str = TX, carrier_source: str = "known") -> dict:
    return {
        "candidate_id": candidate_id,
        "emitter_id": emitter_id,
        "carrier_hz": CARRIER,
        "carrier_source": carrier_source,
    }


async def test_learn_test_save_and_replay_private_ir_alongside_legacy_rf(
    hass, setup_integration, hass_ws_client, hass_storage, proxy,
) -> None:
    devices, receive, send = proxy
    admin = await hass_ws_client(hass)
    other_connection = await hass_ws_client(hass)
    rf = "homemanager/rf"
    created = await _call(admin, f"{rf}/remote/save", remote_id="demo-rf", remote={"name": "Demo RF", "transmitter": "demo_tx"})
    assert created["success"]
    added = await _call(admin, f"{rf}/button/save", remote_id="demo-rf", button={"name": "On"}, code=RF_CODE)
    assert added["success"]
    legacy = (await _call(admin, f"{rf}/library"))["result"]
    legacy_storage = deepcopy(hass_storage["homemanager.rf"])

    assert (await _call(admin, f"{IR_API}/devices"))["result"] == devices
    candidate = await _learn(admin)
    receive.assert_awaited_once_with(RX)
    payload = _signal(candidate)
    assert not (await _call(other_connection, f"{IR_API}/test", **payload))["success"]
    send.assert_not_called()
    assert (await _call(admin, f"{IR_API}/test", **payload))["result"] == {"result": "sent"}
    send.assert_called_once_with(TX, IrSignal(CARRIER, TIMINGS, "known"))
    assert IR_STORAGE_KEY not in hass_storage

    saved = await _call(admin, f"{IR_API}/save", **payload, remote_name="Demo IR", button_name="Power")
    remote_id = saved["result"]["id"]
    assert not (await _call(admin, f"{IR_API}/test", **payload))["success"]
    assert not (await _call(admin, f"{IR_API}/save", **payload, remote_id=remote_id, button_name="Duplicate"))["success"]

    # Append another button with its own emitter. The first keeps its explicit destination.
    second = _signal(await _learn(admin), OTHER_TX, "estimated")
    assert (await _call(admin, f"{IR_API}/save", **second, remote_id=remote_id, button_name="Input"))["result"]["id"] == remote_id
    assert send.call_count == 1

    stored = hass_storage[IR_STORAGE_KEY]["data"]["remotes"][remote_id]
    power, source = stored["buttons"]["power"], stored["buttons"]["input"]
    assert power["signal"] == IrSignal(CARRIER, TIMINGS, "known").as_dict()
    assert source["signal"] == IrSignal(CARRIER, TIMINGS, "estimated").as_dict()
    assert (power.get("emitter") or stored["emitter"]) == TX
    assert (source.get("emitter") or stored["emitter"]) == OTHER_TX

    assert await hass.config_entries.async_reload(setup_integration.entry_id)
    mixed = (await _call(admin, "homemanager/remotes/library"))["result"]["remotes"]
    [remote] = [item for item in mixed if item["source"] == "ir"]
    assert set(remote) == {"id", "source", "name", "icon", "description", "buttons", "layout"}
    assert remote["id"] == remote_id
    assert {button["id"] for button in remote["buttons"]} == {"power", "input"}
    assert all(set(button) == {"id", "name", "icon", "command_type", "fingerprint"} for button in remote["buttons"])
    assert (await _call(admin, f"{rf}/library"))["result"] == legacy
    assert hass_storage["homemanager.rf"] == legacy_storage
    assert (await _call(admin, f"{IR_API}/press", remote_id=remote_id, button_id="power"))["result"] == {"result": "sent"}
    assert (await _call(admin, f"{IR_API}/press", remote_id=remote_id, button_id="input"))["result"] == {"result": "sent"}
    assert send.call_count == 3
    assert send.call_args_list[1].args == (TX, IrSignal(CARRIER, TIMINGS, "known"))
    assert send.call_args_list[2].args == (OTHER_TX, IrSignal(CARRIER, TIMINGS, "estimated"))


async def test_ir_learning_requires_admin_and_only_selected_viewer_can_press(
    hass, setup_integration, hass_ws_client, hass_read_only_user, hass_read_only_access_token, proxy,
) -> None:
    _, receive, send = proxy
    admin = await hass_ws_client(hass)
    reader = await hass_ws_client(hass, hass_read_only_access_token)
    learned = _signal(await _learn(admin))
    saved = await _call(admin, f"{IR_API}/save", **learned, remote_name="Demo IR", button_name="Power")
    press = {"remote_id": saved["result"]["id"], "button_id": "power"}

    assert (await _call(reader, f"{IR_API}/press", **press))["error"]["code"] == "unauthorized"
    send.assert_not_called()
    hass.config_entries.async_update_entry(setup_integration, options={CONF_VIEWER_USER_IDS: [hass_read_only_user.id]})
    await hass.async_block_till_done()
    for route, fields in (
        ("devices", {}),
        ("capture", {"receiver_id": RX}),
        ("test", learned),
        ("save", {**learned, "remote_name": "Forbidden", "button_name": "Power"}),
    ):
        assert (await _call(reader, f"{IR_API}/{route}", **fields))["error"]["code"] == "unauthorized"
    receive.assert_awaited_once_with(RX)
    send.assert_not_called()
    assert (await _call(reader, f"{IR_API}/press", **press))["result"] == {"result": "sent"}
    send.assert_called_once_with(TX, IrSignal(CARRIER, TIMINGS, "known"))


async def test_failed_ir_write_keeps_the_candidate_for_a_single_successful_retry(
    hass, setup_integration, hass_ws_client, hass_storage, monkeypatch, proxy,
) -> None:
    admin = await hass_ws_client(hass)
    fields = {**_signal(await _learn(admin)), "remote_name": "Demo IR", "button_name": "Power"}

    write = Store._async_write_data

    async def fail_write(store, data):
        if store.key == IR_STORAGE_KEY:
            raise WriteError("synthetic write failure")
        await write(store, data)

    with monkeypatch.context() as patch:
        patch.setattr(Store, "_async_write_data", fail_write)
        failed = await _call(admin, f"{IR_API}/save", **fields)
        assert failed["error"]["code"] == "ir_save_failed"
        assert (await _call(admin, "homemanager/remotes/library"))["result"] == {"remotes": []}
        assert IR_STORAGE_KEY not in hass_storage

    store = hass.data[DATA_REMOTES]._ir_store
    save = store.async_save

    async def yielding_save(data):
        await asyncio.sleep(0)
        await save(data)

    monkeypatch.setattr(store, "async_save", yielding_save)
    message = {"type": f"{IR_API}/save", **fields}
    await admin.send_json_auto_id(message.copy())
    await admin.send_json_auto_id(message.copy())
    responses = [await admin.receive_json(), await admin.receive_json()]
    assert sorted(response["success"] for response in responses) == [False, True]
    assert len(hass_storage[IR_STORAGE_KEY]["data"]["remotes"]) == 1


async def test_websocket_disconnect_cancels_pending_ir_receive(
    hass, setup_integration, hass_ws_client, proxy,
) -> None:
    _, receive, _ = proxy
    started = asyncio.Event()
    stopped = asyncio.Event()

    async def blocked_receive(_receiver_id):
        started.set()
        try:
            await asyncio.Future()
        finally:
            stopped.set()

    receive.side_effect = blocked_receive
    admin = await hass_ws_client(hass)
    assert (await _call(admin, f"{IR_API}/capture", receiver_id=RX))["success"]
    await asyncio.wait_for(started.wait(), timeout=5)
    await admin.close()
    await asyncio.wait_for(stopped.wait(), timeout=5)

    # A new socket can immediately use that receiver again.
    receive.side_effect = None
    assert await _learn(await hass_ws_client(hass))


async def test_ir_capture_timeout_reports_without_creating_a_candidate(
    hass, setup_integration, hass_ws_client, monkeypatch, proxy,
) -> None:
    _, receive, _ = proxy

    async def wait_for_signal(_receiver_id):
        await asyncio.Future()

    receive.side_effect = wait_for_signal
    monkeypatch.setattr("custom_components.homemanager.ir.CAPTURE_SECONDS", 0)
    admin = await hass_ws_client(hass)
    subscription = await _call(admin, f"{IR_API}/capture", receiver_id=RX)
    assert subscription["success"]
    event = await admin.receive_json()
    assert event["id"] == subscription["id"]
    assert event["event"] == {"status": "timeout"}
    assert (await _call(admin, "unsubscribe_events", subscription=subscription["id"]))["success"]
    receive.side_effect = None
    assert await _learn(admin)
