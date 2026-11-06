"""Verify native IR Proxy calls with synthetic devices and signed timings."""

import asyncio
from dataclasses import dataclass
from enum import IntFlag
import sys
from types import SimpleNamespace

import pytest

from custom_components.homemanager import ir_proxy
from custom_components.homemanager.errors import ModelError
from custom_components.homemanager.ir_model import IrSignal


class _Capability(IntFlag):
    TRANSMITTER = 1
    RECEIVER = 2


class _ApiError(Exception):
    pass


@dataclass
class _Info:
    object_id: str
    name: str
    key: int
    device_id: int
    capabilities: _Capability


class _Client:
    def __init__(self) -> None:
        self.callbacks = set()
        self.sent = []
        self.unavailable = False

    def subscribe_infrared_rf_receive(self, callback):
        if self.unavailable:
            raise _ApiError("unavailable upstream")
        self.callbacks.add(callback)
        return lambda: self.callbacks.discard(callback)

    def infrared_rf_transmit_raw_timings(self, key, **fields) -> None:
        if self.unavailable:
            raise _ApiError("unavailable upstream")
        self.sent.append({"key": key, **fields})

    def receive(self, key, device_id, timings) -> None:
        for callback in list(self.callbacks):
            callback(SimpleNamespace(key=key, device_id=device_id, timings=timings))


@pytest.fixture
def setup_proxy(monkeypatch):
    monkeypatch.setitem(sys.modules, "aioesphomeapi", SimpleNamespace(InfraredCapability=_Capability, InfraredInfo=_Info, APIConnectionError=_ApiError))
    monkeypatch.setitem(
        sys.modules,
        "homeassistant.components.esphome.entry_data",
        SimpleNamespace(build_device_unique_id=lambda mac, info: f"{mac}:{info.object_id}:{info.device_id}"),
    )
    transmitter = _Info("demo_emitter", "Emitter", 25, 2, _Capability.TRANSMITTER)
    receiver = _Info("demo_receiver", "Receiver", 31, 3, _Capability.RECEIVER)
    entry_id = "demo-entry"
    emitter = SimpleNamespace(entity_id="infrared.demo_emitter", id="a" * 32, device_id="d" * 32, disabled=False, config_entry_id=entry_id)
    registry = SimpleNamespace(
        async_get_entity_id=lambda domain, platform, identity: emitter.entity_id if identity.endswith(":demo_emitter:2") else None,
        async_get=lambda entity_id: emitter if entity_id == emitter.entity_id else None,
    )
    monkeypatch.setattr(ir_proxy.er, "async_get", lambda hass: registry)
    client = _Client()
    runtime = SimpleNamespace(
        available=True,
        device_info=SimpleNamespace(mac_address="synthetic", friendly_name="Demo proxy", name="demo-proxy"),
        info={_Info: {(2, 25): transmitter, (3, 31): receiver}},
        client=client,
        disconnect_callbacks=set(),
    )
    entries = [SimpleNamespace(entry_id=entry_id, runtime_data=runtime)]
    hass = SimpleNamespace(config_entries=SimpleNamespace(async_loaded_entries=lambda domain: entries if domain == "esphome" else []))
    return ir_proxy.IrProxy(hass), runtime, client, transmitter, receiver, emitter


def test_sends_signed_timings_to_explicit_target_with_current_key(setup_proxy, monkeypatch) -> None:
    proxy, runtime, client, transmitter, _, emitter = setup_proxy
    clock = 100.0
    monkeypatch.setattr(ir_proxy, "monotonic", lambda: clock)
    devices = proxy.devices()
    [receive] = devices["receivers"]
    [send] = devices["emitters"]
    assert receive["id"] != send["id"]
    assert all(set(device) == {"id", "name", "device", "device_name"} and device["id"].startswith("esphome:") for device in (receive, send))
    signal = IrSignal.from_dict({"carrier_hz": 37_963, "timings_us": [1200, -510, 503, -20_030]})

    transmitter.key = 77
    assert proxy.devices() == devices
    for target_id in (send["id"], emitter.entity_id, emitter.id):
        proxy.send(target_id, signal)
        clock += 1
    expected = {"key": 77, "carrier_frequency": 37_963, "timings": [1200, -510, 503, -20_030], "repeat_count": 1, "device_id": 2}
    assert client.sent == [expected] * 3

    for unavailable in (receive["id"], "infrared.missing"):
        with pytest.raises(ModelError) as error:
            proxy.send(unavailable, signal)
        assert error.value.code == "ir_emitter_unavailable"

    emitter.disabled = True
    assert proxy.devices()["emitters"] == []
    runtime.available = False
    assert proxy.devices() == {"receivers": [], "emitters": []}
    assert client.sent == [expected] * 3


def test_paces_a_physical_node_and_does_not_record_failed_transmission(setup_proxy, monkeypatch) -> None:
    proxy, runtime, client, _, _, emitter = setup_proxy
    extra = _Info("other_emitter", "Other emitter", 44, 4, _Capability.TRANSMITTER)
    runtime.info[_Info][(4, 44)] = extra
    first, second = proxy.devices()["emitters"]
    clock = 100.0
    monkeypatch.setattr(ir_proxy, "monotonic", lambda: clock)
    signal = IrSignal.from_dict({"carrier_hz": 38_000, "timings_us": [1000, -250_000]})

    client.unavailable = True
    with pytest.raises(ModelError) as error:
        proxy.send(first["id"], signal)
    assert error.value.code == "ir_emitter_unavailable"
    assert "upstream" not in str(error.value)

    client.unavailable = False
    proxy.send(first["id"], signal)
    clock += 0.2
    for target_id in (emitter.id, second["id"]):
        with pytest.raises(ModelError) as error:
            proxy.send(target_id, signal)
        assert error.value.code == "ir_transmitter_busy"
    clock += 0.06
    proxy.send(second["id"], signal)
    assert [request["key"] for request in client.sent] == [25, 44]


async def test_capture_filters_native_events_and_unsubscribes_only_its_callback(setup_proxy) -> None:
    proxy, runtime, client, transmitter, receiver, _ = setup_proxy
    client.callbacks.add(existing := lambda event: None)
    [device] = proxy.devices()["receivers"]
    capture = asyncio.create_task(proxy.async_capture(device["id"]))
    await asyncio.sleep(0)

    client.receive(transmitter.key, receiver.device_id, [100, -100])
    client.receive(receiver.key, transmitter.device_id, [100, -100])
    client.receive(receiver.key, receiver.device_id, [100, 0])
    client.receive(receiver.key, receiver.device_id, [-100, 100])
    assert not capture.done()

    timings = [1350, -479, 610, -32_100, 505, -8_040]
    client.receive(receiver.key, receiver.device_id, tuple(timings))
    assert await capture == tuple(timings)
    assert client.callbacks == {existing}
    assert not runtime.disconnect_callbacks


async def test_capture_cleans_up_on_cancel_disconnect_and_native_error(setup_proxy) -> None:
    proxy, runtime, client, _, _, _ = setup_proxy
    [device] = proxy.devices()["receivers"]
    receiver_id = device["id"]
    capture = asyncio.create_task(proxy.async_capture(receiver_id))
    await asyncio.sleep(0)
    capture.cancel()
    with pytest.raises(asyncio.CancelledError):
        await capture
    assert not client.callbacks and not runtime.disconnect_callbacks

    capture = asyncio.create_task(proxy.async_capture(receiver_id))
    await asyncio.sleep(0)
    for disconnected in runtime.disconnect_callbacks.copy():
        disconnected()
    with pytest.raises(ModelError) as error:
        await capture
    assert error.value.code == "ir_receiver_unavailable"
    assert not client.callbacks and not runtime.disconnect_callbacks

    client.unavailable = True
    with pytest.raises(ModelError) as error:
        await proxy.async_capture(receiver_id)
    assert error.value.code == "ir_receiver_unavailable"
    assert "upstream" not in str(error.value)


async def test_diagnostic_observes_invalid_signs_without_making_them_learnable(setup_proxy) -> None:
    proxy, runtime, client, _, receiver, _ = setup_proxy
    [device] = proxy.devices()["receivers"]
    ready = asyncio.Event()
    armed = False
    observe = asyncio.create_task(proxy.async_observe(device["id"], ready, lambda: armed, 0.5, limit=1))
    await ready.wait()
    client.receive(receiver.key, receiver.device_id, [120, -100])
    assert not observe.done()
    armed = True
    client.receive(receiver.key, receiver.device_id, [500, 300, -800])
    [observed] = await observe
    assert observed["timings_us"] == [500, 300, -800]
    assert observed["integrity"] == "suspect"
    assert not client.callbacks and not runtime.disconnect_callbacks
