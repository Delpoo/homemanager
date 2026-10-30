"""Integration setup, websocket API, permissions, persistence and frontend registration."""

import asyncio
from pathlib import Path
import pytest

from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL, DATA_PANELS
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homemanager.const import CONF_GLOBAL_FRONTEND, CONF_VIEWER_USER_IDS, DOMAIN, PLAN_STORAGE_KEY_PREFIX, STORAGE_KEY

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
    assert module_url not in hass.data[DATA_EXTRA_MODULE_URL].urls


async def test_missing_bundle_keeps_storage_working(hass: HomeAssistant, tmp_path, monkeypatch, hass_ws_client) -> None:
    monkeypatch.setattr("custom_components.homemanager.FRONTEND_DIR", tmp_path / "absent")
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    assert "homemanager" not in hass.data.get(DATA_PANELS, {})
    client = await hass_ws_client(hass)
    assert (await _save(client))["success"]


async def test_admin_saves_and_only_explicit_viewers_read(hass: HomeAssistant, setup_integration, hass_ws_client, hass_admin_user, hass_read_only_user, hass_read_only_access_token) -> None:
    admin = await hass_ws_client(hass)
    created = await _save(admin, title="Casa")
    assert created["success"] and created["result"]["revision"] == 1
    conflict = await _save(admin, expected=None)
    assert conflict["error"] == {"code": "revision_conflict", "message": "revision:1"}
    updated = await _save(admin, expected=1, value=configuration(label="Estudio"))
    assert updated["result"]["revision"] == 2

    reader = await hass_ws_client(hass, hass_read_only_access_token)
    for message in (
        {"type": "homemanager/homes"},
        {"type": "homemanager/home/get", "home_id": "home"},
        {"type": "homemanager/home/subscribe", "home_id": "home"},
    ):
        await reader.send_json_auto_id(message)
        assert (await reader.receive_json())["error"]["code"] == "unauthorized"
    hass.config_entries.async_update_entry(setup_integration, options={CONF_VIEWER_USER_IDS: [hass_read_only_user.id]})
    await hass.async_block_till_done()
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
    await _save(admin)
    await watcher.send_json_auto_id({"type": "homemanager/home/subscribe", "home_id": "home"})
    assert (await watcher.receive_json())["success"]
    await _save(admin, expected=1)
    event = await watcher.receive_json()
    assert event["event"] == {"home_id": "home", "revision": 2, "deleted": False}
    await admin.send_json_auto_id({"type": "homemanager/home/delete", "home_id": "home", "expected_revision": 2})
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


async def test_global_frontend_loading_is_explicit_and_revocable(hass, setup_integration) -> None:
    url = hass.data[DATA_PANELS]["homemanager"].config["_panel_custom"]["module_url"]
    hass.config_entries.async_update_entry(setup_integration, options={CONF_GLOBAL_FRONTEND: True})
    await hass.async_block_till_done()
    assert url in hass.data[DATA_EXTRA_MODULE_URL].urls
    hass.config_entries.async_update_entry(setup_integration, options={})
    await hass.async_block_till_done()
    assert url not in hass.data[DATA_EXTRA_MODULE_URL].urls


async def test_revoking_a_viewer_stops_existing_subscription_events(hass, setup_integration, hass_ws_client, hass_read_only_user, hass_read_only_access_token) -> None:
    admin = await hass_ws_client(hass)
    await _save(admin)
    hass.config_entries.async_update_entry(setup_integration, options={CONF_VIEWER_USER_IDS: [hass_read_only_user.id]})
    await hass.async_block_till_done()
    reader = await hass_ws_client(hass, hass_read_only_access_token)
    await reader.send_json_auto_id({"type": "homemanager/home/subscribe", "home_id": "home"})
    assert (await reader.receive_json())["success"]
    hass.config_entries.async_update_entry(setup_integration, options={})
    await hass.async_block_till_done()
    assert (await _save(admin, expected=1))["success"]
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(reader.receive_json(), 0.05)
    await reader.send_json_auto_id({"type": "homemanager/home/get", "home_id": "home"})
    assert (await reader.receive_json())["error"]["code"] == "unauthorized"


LINKED_SVG = "<svg xmlns='http://www.w3.org/2000/svg'><title>Plano</title></svg>"


def _linked_file(hass: HomeAssistant, home_id: str = "home"):
    return Path(hass.config.path("homemanager", f"{home_id}.svg"))


async def _linked(client, home_id="home", content=False):
    await client.send_json_auto_id({"type": "homemanager/plan/linked", "home_id": home_id, "content": content})
    return await client.receive_json()


async def test_setup_creates_the_linked_plan_folder(hass: HomeAssistant, setup_integration) -> None:
    assert await hass.async_add_executor_job(_linked_file(hass).parent.is_dir)


async def test_linked_plan_reports_the_file_without_touching_the_home(hass: HomeAssistant, setup_integration, hass_ws_client) -> None:
    client = await hass_ws_client(hass)
    await _save(client)
    missing = (await _linked(client))["result"]
    assert missing["state"] == "missing" and missing["seen_sha256"] is None
    assert missing["path"] == str(_linked_file(hass))
    path = _linked_file(hass)
    await hass.async_add_executor_job(path.write_text, LINKED_SVG, "utf-8")
    ready = (await _linked(client))["result"]
    assert ready["state"] == "ready" and len(ready["sha256"]) == 64 and "content" not in ready
    assert (await _linked(client, content=True))["result"]["content"] == LINKED_SVG
    # Looking never edits: the plan and the revision stay.
    await client.send_json_auto_id({"type": "homemanager/home/get", "home_id": "home"})
    home = (await client.receive_json())["result"]
    assert home["revision"] == 1 and home["configuration"]["architecture"]["content"] == PLAN


async def test_linked_plan_refuses_what_cannot_be_used(hass: HomeAssistant, setup_integration, hass_ws_client) -> None:
    client = await hass_ws_client(hass)
    await _save(client)
    path = _linked_file(hass)
    await hass.async_add_executor_job(path.write_bytes, b"\xff\xfe not text")
    assert (await _linked(client))["result"]["state"] == "unreadable"
    await hass.async_add_executor_job(path.write_bytes, b"x" * (3 * 1024 * 1024 + 1))
    assert (await _linked(client))["result"]["state"] == "too_large"
    outside = path.parent.parent / "outside.svg"
    await hass.async_add_executor_job(outside.write_text, LINKED_SVG, "utf-8")
    await hass.async_add_executor_job(path.unlink)
    await hass.async_add_executor_job(path.symlink_to, outside)
    result = (await _linked(client, content=True))["result"]
    assert result["state"] == "unreadable" and "content" not in result


async def test_linked_plan_needs_a_real_home_and_an_administrator(hass: HomeAssistant, setup_integration, hass_ws_client, hass_read_only_access_token) -> None:
    client = await hass_ws_client(hass)
    await _save(client)
    # A home ID never reaches the disk unchecked.
    for home_id in ("../secrets", "unknown"):
        response = await _linked(client, home_id=home_id)
        assert response["success"] is False
    reader = await hass_ws_client(hass, hass_read_only_access_token)
    assert (await _linked(reader))["error"]["code"] == "unauthorized"
    await reader.send_json_auto_id({"type": "homemanager/plan/linked/seen", "home_id": "home", "sha256": "a" * 64})
    assert (await reader.receive_json())["error"]["code"] == "unauthorized"
    await client.send_json_auto_id({"type": "homemanager/plan/linked/seen", "home_id": "home", "sha256": "not-a-digest"})
    assert (await client.receive_json())["success"] is False


async def test_a_settled_version_survives_saves_and_restarts_without_a_new_revision(hass: HomeAssistant, setup_integration, hass_ws_client, hass_storage) -> None:
    client = await hass_ws_client(hass)
    await _save(client)
    digest = "a" * 64
    await client.send_json_auto_id({"type": "homemanager/plan/linked/seen", "home_id": "home", "sha256": digest})
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "homemanager/home/get", "home_id": "home"})
    assert (await client.receive_json())["result"]["revision"] == 1
    assert (await _save(client, expected=1, value=configuration(label="Otra")))["success"]
    assert (await _linked(client))["result"]["seen_sha256"] == digest
    assert hass_storage[STORAGE_KEY]["data"]["homes"]["home"]["linked_seen"] == digest
    assert await hass.config_entries.async_unload(setup_integration.entry_id)
    assert await hass.config_entries.async_setup(setup_integration.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)
    assert (await _linked(client))["result"]["seen_sha256"] == digest
