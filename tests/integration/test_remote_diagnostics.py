"""Integrated learning, persistence, isolated observations and HA entities."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from homeassistant.helpers import entity_registry as er

from custom_components.homemanager.const import CONF_VIEWER_USER_IDS, DOMAIN
from custom_components.homemanager.diagnostics import STORAGE_KEY
from custom_components.homemanager.ir_model import IrSignal
from custom_components.homemanager.ir_proxy import IrProxy
from custom_components.homemanager.rf import RAW_EVENT, RfManager
from custom_components.homemanager.rf_codec import encode_timings
from custom_components.homemanager.signals import sample
from custom_components.homemanager.validation import validate_configuration

from .conftest import configuration


IR = "homemanager/remotes/ir"
DIAG = "homemanager/remotes/diagnostics"
RF = "homemanager/rf"
TX = "esphome:" + "a" * 32
OWN = "esphome:" + "b" * 32
EXT = "esphome:" + "c" * 32
RAW = (650, -225, 100, -340, 340, -14_000)


async def call(client, route: str, **fields):
    await client.send_json_auto_id({"type": route, **fields})
    return await client.receive_json()


async def test_ir_datasheet_batch_layout_ha_button_and_camera_history(hass, setup_integration, hass_ws_client,
                                                                hass_storage, hass_read_only_user,
                                                                hass_read_only_access_token, monkeypatch):
    monkeypatch.setattr(IrProxy, "devices", lambda self: {"emitters": [{"id": TX, "name": "Demo emitter"}],
                        "receivers": [{"id": key, "name": key[-1]} for key in (OWN, EXT)]})
    monkeypatch.setattr(IrProxy, "same_node", lambda self, emitter, receiver: emitter == TX and receiver == OWN)
    sending = asyncio.Event()
    sent = []

    async def receive(receiver, ready, accepting, seconds, *, limit=4, distinct=False):
        ready.set()
        if distinct:
            assert limit == 8
            return [sample(RAW, receiver), sample((280, -405, 570), receiver)]
        assert not accepting()
        await sending.wait()
        assert accepting()
        return [] if receiver == OWN else [sample((650, -220, 300, -340, 340, -14_000), receiver)]

    def send(self, emitter, signal, **options):
        sent.append((emitter, signal, options))
        sending.set()

    monkeypatch.setattr(IrProxy, "async_observe", AsyncMock(side_effect=receive))
    monkeypatch.setattr(IrProxy, "send", send)
    admin = await hass_ws_client(hass)
    reader = await hass_ws_client(hass, hass_read_only_access_token)
    hass.config_entries.async_update_entry(setup_integration, options={CONF_VIEWER_USER_IDS: [hass_read_only_user.id]})
    await hass.async_block_till_done()
    capture = await call(admin, f"{IR}/capture", receiver_id=EXT, batch=True)
    assert capture["success"]
    candidates = (await admin.receive_json())["event"]["candidates"]
    assert len(candidates) == 2 and "timings_us" not in str(candidates)
    await call(admin, "unsubscribe_events", subscription=capture["id"])
    candidate = {"source": "ir", "candidate_id": candidates[0]["candidate_id"]}
    compact = (await call(admin, f"{DIAG}/candidate", **candidate))["result"]
    assert compact["count"] == len(RAW) and "timings_us" not in compact
    assert (await call(reader, f"{DIAG}/candidate", **candidate, advanced=True))["success"] is False
    evidence = (await call(admin, f"{DIAG}/candidate", **candidate, advanced=True))["result"]
    assert evidence["original"]["timings_us"] == list(RAW) and evidence["prepared"] is None

    signal = {"emitter_id": TX, "carrier_hz": 37_960, "carrier_source": "known"}
    assert (await call(admin, f"{IR}/test", **signal, candidate_id=candidates[0]["candidate_id"]))["success"]
    evidence = (await call(admin, f"{DIAG}/candidate", **candidate, advanced=True))["result"]
    assert evidence["prepared"]["timings_us"] == list(RAW) and evidence["comparison"]["different"] == 0
    assert evidence["prepared"]["settings"]["carrier_hz"] == 37_960
    sending.clear()
    new = (await call(admin, f"{IR}/save", **signal, candidate_id=candidates[0]["candidate_id"], remote_name="Demo IR", button_name="Power"))["result"]
    target = {"source": "ir", "remote_id": new["id"], "button_id": "power"}
    layout = [{"id": "key", "type": "button", "x": 0, "y": 0, "w": 2, "h": 1, "buttons": ["power"], "icon": None, "label": "Power"}]
    assert (await call(admin, f"{IR}/remote/edit", remote_id=new["id"], changes={"layout": layout}))["result"]["layout"] == layout
    assert (await call(admin, f"{IR}/save", **signal, candidate_id=candidates[1]["candidate_id"], remote_id=new["id"], button_name="Input"))["success"]
    assert (await call(admin, f"{IR}/button/edit", remote_id=new["id"], button_id="power", changes={"name": "Power renamed"}))["success"]
    await hass.async_block_till_done()
    registry = er.async_get(hass)
    entity_id = registry.async_get_entity_id("button", DOMAIN, f"ir:{new['id']}:power")
    assert entity_id and hass.states.get(entity_id).attributes["homemanager_ir_remote"] == new["id"]
    assert (await call(reader, f"{DIAG}/sheet", **target))["success"] is False
    assert (await call(reader, f"{DIAG}/note", **target, camera="visible"))["success"] is False
    assert (await call(admin, f"{DIAG}/run", **target, emitter=TX, external=OWN))["error"]["code"] == "invalid_receiver"

    trial = (await call(admin, f"{DIAG}/run", **target, emitter=TX, self=OWN, external=EXT))["result"]
    assert trial["saved"] and trial["status"] == "sent"
    assert sent == [(TX, IrSignal(37_960, RAW, "known"), {}), (TX, IrSignal(37_960, RAW, "known"), {"reserve_seconds": 2.5})]
    assert (await call(admin, f"{DIAG}/note", **target, trial_id=trial["id"], camera="visible", response="no_response", note="Synthetic observation"))["success"]
    assert STORAGE_KEY in hass_storage

    assert await hass.config_entries.async_reload(setup_integration.entry_id)
    sheet = (await call(admin, f"{DIAG}/sheet", **target, trial_id=trial["id"]))["result"]
    assert sheet["identity"]["button_name"] == "Power renamed"
    assert sheet["original"]["node"] == EXT and sheet["original"]["timings_us"] == list(RAW)
    assert sheet["prepared"]["settings"]["carrier_hz"] == 37_960
    assert sheet["observed"]["self"]["status"] == "not_observed"
    assert sheet["observed"]["external"]["comparisons"][0]["different"] == 1
    assert sheet["history"][0]["camera"] == "visible" and sheet["history"][0]["response"] == "no_response"
    assert sheet["history"][0]["trial_id"] == trial["id"]
    library = (await call(reader, "homemanager/remotes/library"))["result"]
    assert "timings_us" not in str(library) and TX not in str(library) and "Synthetic observation" not in str(library)
    assert registry.async_get_entity_id("button", DOMAIN, f"ir:{new['id']}:power") == entity_id
    await hass.services.async_call("button", "press", {"entity_id": entity_id}, blocking=True)
    assert sent[-1] == (TX, IrSignal(37_960, RAW, "known"), {})
    after_delete = (await call(admin, f"{IR}/button/edit", remote_id=new["id"], button_id="power", changes=None))["result"]
    assert [widget["buttons"] for widget in after_delete["layout"]] == [["input"]]
    await hass.async_block_till_done()
    assert registry.async_get_entity_id("button", DOMAIN, f"ir:{new['id']}:power") is None


async def test_rf_diagnostics_keeps_legacy_rf_and_rejects_unattributed_echo(hass, setup_integration, hass_ws_client,
                                                                         hass_storage, monkeypatch):
    monkeypatch.setattr(RfManager, "_device", lambda self, node: SimpleNamespace(id=f"reg-{node}", name_by_user=None, name=node))
    monkeypatch.setattr("custom_components.homemanager.rf.ECHO_WAIT_SECONDS", 0.01)
    code = "011001000110100100101100"
    raw = encode_timings(1, code, 350, repeats=4)
    sends = []

    async def capture(_call):
        pass

    async def send(service):
        sends.append(dict(service.data))
        hass.bus.async_fire(RAW_EVENT, {"device_id": "reg-tx_b", "timings": ",".join(map(str, raw))})
        hass.bus.async_fire(RAW_EVENT, {"timings": "99,-100,99"})
        hass.bus.async_fire(RAW_EVENT, {"device_id": "unrelated", "timings": "100,-150,100"})

    for node in ("tx_a", "tx_b"):
        hass.services.async_register("esphome", f"{node}_homemanager_rf_capture", capture)
        hass.services.async_register("esphome", f"{node}_homemanager_rf_send", send)
    admin = await hass_ws_client(hass)
    subscription = await call(admin, f"{RF}/capture", transmitter="tx_a", diagnostics=True)
    hass.bus.async_fire(RAW_EVENT, {"device_id": "reg-tx_a", "timings": "130,-120,130,-100"})
    noise = (await admin.receive_json())["event"]
    raw_unknown = (await call(admin, f"{DIAG}/candidate", source="rf", candidate_id=noise["signal_id"], advanced=True))["result"]["original"]
    assert raw_unknown["analysis"]["decoded"] is None and raw_unknown["timings_us"] == [130, -120, 130, -100]
    hass.bus.async_fire(RAW_EVENT, {"device_id": "reg-tx_a", "timings": ",".join(map(str, raw))})
    candidate = (await admin.receive_json())["event"]["candidate"]
    await call(admin, "unsubscribe_events", subscription=subscription["id"])
    remote = (await call(admin, f"{RF}/remote/save", remote={"name": "Demo RF", "transmitter": "tx_a"}))["result"]
    button = (await call(admin, f"{RF}/button/save", remote_id=remote["id"], candidate_id=candidate["candidate_id"], button={"name": "Power"}))["result"]
    await hass.async_block_till_done()
    target = {"source": "rf", "remote_id": remote["id"], "button_id": button["id"]}
    trial = (await call(admin, f"{DIAG}/run", **target, emitter="tx_a", external="tx_b", self="tx_a"))["result"]
    sheet = (await call(admin, f"{DIAG}/sheet", **target, trial_id=trial["id"]))["result"]
    assert sheet["original"]["node"] == "tx_a" and sheet["original"]["timings_us"] == raw
    assert sheet["prepared"]["settings"]["pulse_us"] == 350
    assert sheet["observed"]["self"]["status"] == "not_observed"
    assert [item["timings_us"] for item in sheet["observed"]["external"]["blocks"]] == [raw]
    assert sends == [{"code": code, "protocol": 1, "pulse_length": 350, "repeats": 5, "wait_us": 0}]
    assert code not in str((await call(admin, f"{RF}/library"))["result"])
    assert "original" not in str(hass_storage["homemanager.rf"])


def test_plan_can_bind_an_existing_ir_identifier_alongside_rf():
    config = configuration()
    config["catalog"]["devices"] = [{"id": "screen", "roomId": "studio", "kind": "light", "mobility": "editable",
        "position": {"x": 0.5, "y": 0.5}, "display": {"label": "Example", "icon": "mdi:television"},
        "bindings": {"entityId": None, "primaryAction": None, "advancedPopupId": None, "remoteId": "fan", "irRemoteId": "old_remote"},
        "state": {"value": "unknown", "confidence": "unknown"}}]
    validate_configuration(config)
