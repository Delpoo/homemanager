"""Integration setup, websocket API, permissions, persistence and frontend registration."""

import asyncio

from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL, DATA_PANELS
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homemanager.const import DOMAIN, PLAN_STORAGE_KEY_PREFIX, STORAGE_KEY

from .conftest import PLAN, configuration


async def _save(client, home_id="home", expected=None, value=None, title=None):
    message = {"type": "homemanager/home/save", "home_id": home_id, "expected_revision": expected, "configuration": value or configuration()}
    if title is not None:
        message["title"] = title
    await client.send_json_auto_id(message)
    return await client.receive_json()


async def test_setup_registers_panel_and_bundle(hass: HomeAssistant, setup_integration) -> None:
    panel = hass.data[DATA_PANELS]["homemanager"]
    assert panel.sidebar_title == "HomeManager"
    assert panel.require_admin is False
    module_url = panel.config["_panel_custom"]["module_url"]
    assert module_url.startswith("/homemanager_files/homemanager.js?v=")
    assert module_url in hass.data[DATA_EXTRA_MODULE_URL].urls


async def test_missing_bundle_keeps_storage_working(hass: HomeAssistant, tmp_path, monkeypatch, hass_ws_client) -> None:
    monkeypatch.setattr("custom_components.homemanager.FRONTEND_DIR", tmp_path / "absent")
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    assert "homemanager" not in hass.data.get(DATA_PANELS, {})
    client = await hass_ws_client(hass)
    assert (await _save(client))["success"]


async def test_admin_saves_with_revision_check_and_everyone_reads(hass: HomeAssistant, setup_integration, hass_ws_client, hass_admin_user, hass_read_only_access_token) -> None:
    admin = await hass_ws_client(hass)
    created = await _save(admin, title="Casa")
    assert created["success"] and created["result"]["revision"] == 1
    conflict = await _save(admin, expected=None)
    assert conflict["error"] == {"code": "revision_conflict", "message": "revision:1"}
    updated = await _save(admin, expected=1, value=configuration(label="Estudio"))
    assert updated["result"]["revision"] == 2

    reader = await hass_ws_client(hass, hass_read_only_access_token)
    await reader.send_json_auto_id({"type": "homemanager/home/get", "home_id": "home"})
    response = await reader.receive_json()
    assert response["result"]["revision"] == 2
    assert response["result"]["title"] == "Casa"
    assert response["result"]["configuration"]["rooms"] == [{"id": "studio", "label": "Estudio"}]
    await reader.send_json_auto_id({"type": "homemanager/homes"})
    assert [home["home_id"] for home in (await reader.receive_json())["result"]["homes"]] == ["home"]

    # Writes and plan history are administrator-only.
    for message in (
        {"type": "homemanager/home/save", "home_id": "home", "expected_revision": 2, "configuration": configuration()},
        {"type": "homemanager/home/delete", "home_id": "home", "expected_revision": 2},
        {"type": "homemanager/plans", "home_id": "home"},
    ):
        await reader.send_json_auto_id(message)
        assert (await reader.receive_json())["error"]["code"] == "unauthorized"


async def test_invalid_configuration_and_unknown_home_are_errors(hass: HomeAssistant, setup_integration, hass_ws_client) -> None:
    client = await hass_ws_client(hass)
    legacy = configuration()
    legacy["schemaVersion"] = 1
    assert (await _save(client, value=legacy))["error"]["code"] == "unsupported_schema"
    assert (await _save(client, home_id="Bad Id"))["error"]["code"] == "invalid_home_id"
    await client.send_json_auto_id({"type": "homemanager/home/get", "home_id": "missing"})
    assert (await client.receive_json())["error"]["code"] == "home_not_found"


async def test_concurrent_saves_with_the_same_revision_cannot_both_win(hass: HomeAssistant, setup_integration, hass_ws_client) -> None:
    first, second = await hass_ws_client(hass), await hass_ws_client(hass)
    assert (await _save(first))["success"]
    await first.send_json_auto_id({"type": "homemanager/home/save", "home_id": "home", "expected_revision": 1, "configuration": configuration(label="A")})
    await second.send_json_auto_id({"type": "homemanager/home/save", "home_id": "home", "expected_revision": 1, "configuration": configuration(label="B")})
    results = await asyncio.gather(first.receive_json(), second.receive_json())
    assert sorted(result["success"] for result in results) == [False, True]
    assert [result["error"]["code"] for result in results if not result["success"]] == ["revision_conflict"]


async def test_subscribers_receive_revisions_only(hass: HomeAssistant, setup_integration, hass_ws_client) -> None:
    admin = await hass_ws_client(hass)
    watcher = await hass_ws_client(hass)
    await watcher.send_json_auto_id({"type": "homemanager/home/subscribe", "home_id": "home"})
    assert (await watcher.receive_json())["success"]
    await _save(admin)
    event = await watcher.receive_json()
    assert event["event"] == {"home_id": "home", "revision": 1, "deleted": False}
    await admin.send_json_auto_id({"type": "homemanager/home/delete", "home_id": "home", "expected_revision": 1})
    assert (await admin.receive_json())["success"]
    assert (await watcher.receive_json())["event"] == {"home_id": "home", "revision": None, "deleted": True}


async def test_plan_history_and_restore_source(hass: HomeAssistant, setup_integration, hass_ws_client) -> None:
    client = await hass_ws_client(hass)
    await _save(client)
    await _save(client, expected=1, value=configuration(label="Only labels changed"))
    replacement = PLAN.replace("viewBox=\"0 0 100 80\"", "viewBox=\"0 0 200 80\"")
    await _save(client, expected=2, value=configuration(replacement))
    await client.send_json_auto_id({"type": "homemanager/plans", "home_id": "home"})
    plans = (await client.receive_json())["result"]["plans"]
    assert [plan["revision"] for plan in plans] == [3, 1]
    await client.send_json_auto_id({"type": "homemanager/plan/get", "home_id": "home", "plan_id": plans[1]["plan_id"]})
    assert (await client.receive_json())["result"]["content"] == PLAN


async def test_state_survives_restart(hass: HomeAssistant, setup_integration, hass_ws_client, hass_storage) -> None:
    client = await hass_ws_client(hass)
    await _save(client, title="Casa")
    stored = hass_storage[STORAGE_KEY]["data"]["homes"]["home"]
    assert stored["revision"] == 1 and stored["configuration"]["architecture"]["content"] == PLAN
    assert hass_storage[f"{PLAN_STORAGE_KEY_PREFIX}home"]["data"]["plans"][0]["content"] == PLAN

    assert await hass.config_entries.async_unload(setup_integration.entry_id)
    assert "homemanager" not in hass.data[DATA_PANELS]
    assert await hass.config_entries.async_setup(setup_integration.entry_id)
    await hass.async_block_till_done()
    reloaded = await hass_ws_client(hass)
    await reloaded.send_json_auto_id({"type": "homemanager/home/get", "home_id": "home"})
    assert (await reloaded.receive_json())["result"]["revision"] == 1


async def test_config_flow_allows_a_single_instance(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] == "form"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] == "create_entry"
    again = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert again["type"] == "abort"
