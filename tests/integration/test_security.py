"""Regression cases from the independent audit; all documents are synthetic."""

from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from custom_components.homemanager.const import MAX_PLAN_STORES, MAX_SUBSCRIPTIONS_PER_CONNECTION, MAX_SUBSCRIPTIONS_TOTAL, MAX_TOTAL_STORAGE_BYTES, STORAGE_KEY
from custom_components.homemanager.model import ModelError, validate_configuration
from custom_components.homemanager.store import HomeManagerStore

from .conftest import PLAN, configuration


@pytest.mark.parametrize("body", [
    '<s:script xmlns:s="http://www.w3.org/2000/svg">alert(1)</s:script>',
    '<s:foreignObject xmlns:s="http://www.w3.org/2000/svg"/>',
    '<use href="&#106;avascript:alert(1)"/>',
    '<rect onload="alert(1)"/>', '<rect style="fill:red"/>',
    '<use href="#missing"/>', '<g id="a"><use href="#a"/></g>',
])
def test_server_rejects_active_and_unresolved_svg(body) -> None:
    with pytest.raises(ModelError, match="static SVG"):
        validate_configuration(configuration(PLAN.replace('<rect id="room-studio" width="50" height="80"/>', body)))


def test_server_rejects_malformed_xml_and_entity_declarations() -> None:
    for plan in ('<svg not-xml', '<!DOCTYPE svg [<!ENTITY x "bad">]>' + PLAN):
        with pytest.raises(ModelError):
            validate_configuration(configuration(plan))


def doubling_plan(levels=16):
    groups = '<g id="n0"><rect width="1" height="1"/></g>'
    for level in range(1, levels + 1):
        groups += f'<g id="n{level}"><use href="#n{level-1}"/><use href="#n{level-1}"/></g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs>{groups}</defs><use href="#n{levels}"/></svg>'


def test_acyclic_svg_expansion_is_bounded_before_storage() -> None:
    assert len(doubling_plan().encode()) < 2000
    with pytest.raises(ModelError):
        validate_configuration(configuration(doubling_plan()))
    validate_configuration(configuration(doubling_plan(3)))


@pytest.mark.parametrize("mutate", [
    lambda c: c["catalog"].update(devices=None),
    lambda c: c["catalog"].update(schemaVersion=True),
    lambda c: c["rooms"].extend(deepcopy(c["rooms"])),
    lambda c: c.update(commandTtlSeconds=True),
    lambda c: c["rooms"][0].update(label="\ud800"),
    lambda c: c.update(commandTtlSeconds=10**1000),
    lambda c: c["actions"].update(bad={"domain": "homeassistant", "service": "restart", "target": {"entity_id": "switch.one"}}),
    lambda c: c["actions"].update(bad={"domain": "light", "service": "turn_on", "target": {"entity_id": "light.all"}}),
    lambda c: c["actions"].update(bad={"domain": "light", "service": "turn_on", "target": {"entity_id": "light.one"}, "data": {"brightness_pct": 101}}),
    lambda c: c["actions"].update(bad={"domain": "script", "service": "turn_on", "target": {"entity_id": "script.one"}, "data": {"variables": {"value": "{{ secret }}"}}}),
    lambda c: c["stateSources"].update(missing={"entityId": "sensor.one", "attribute": None, "feedback": "measured"}),
])
def test_server_validates_complete_contract(mutate) -> None:
    value = configuration()
    mutate(value)
    with pytest.raises(ModelError):
        validate_configuration(value)


async def test_subscriptions_require_existing_home_and_release_all_bookkeeping(hass) -> None:
    store = HomeManagerStore(hass)
    await store.async_load()
    with pytest.raises(ModelError):
        store.async_subscribe("missing", lambda *_: None)
    await store.async_save("home", None, configuration(), None, None)
    for _ in range(1000):
        unsubscribe = store.async_subscribe("home", lambda *_: None, 1)
        unsubscribe()
        unsubscribe()
    assert store._listeners == {}
    assert store._connection_counts == {}
    listeners = [store.async_subscribe("home", lambda *_: None, 1) for _ in range(MAX_SUBSCRIPTIONS_PER_CONNECTION)]
    with pytest.raises(ModelError) as error:
        store.async_subscribe("home", lambda *_: None, 1)
    assert error.value.code == "subscription_limit"
    for unsubscribe in listeners:
        unsubscribe()
    listeners = [store.async_subscribe("home", lambda *_: None, index // MAX_SUBSCRIPTIONS_PER_CONNECTION) for index in range(MAX_SUBSCRIPTIONS_TOTAL)]
    with pytest.raises(ModelError) as error:
        store.async_subscribe("home", lambda *_: None, -1)
    assert error.value.code == "subscription_limit"
    for unsubscribe in listeners:
        unsubscribe()
    assert store._listeners == {} and store._connection_counts == {}


async def test_deleted_home_histories_have_a_global_quota_and_explicit_purge(hass) -> None:
    store = HomeManagerStore(hass)
    await store.async_load()
    for index in range(MAX_PLAN_STORES):
        home_id = f"home-{index}"
        await store.async_save(home_id, None, configuration(), None, None)
        await store.async_delete(home_id, 1)
    assert not store.state.homes
    with pytest.raises(ModelError) as error:
        await store.async_save("overflow", None, configuration(), None, None)
    assert error.value.code == "storage_quota"
    await store.async_purge_history("home-0")
    await store.async_save("replacement", None, configuration(), None, None)
    with pytest.raises(ModelError) as error:
        await store.async_purge_history("replacement")
    assert error.value.code == "home_in_use"


async def test_byte_quota_covers_other_retained_files(hass) -> None:
    store = HomeManagerStore(hass)
    await store.async_load()
    store._sizes["homemanager.plans.retained"] = MAX_TOTAL_STORAGE_BYTES
    with pytest.raises(ModelError) as error:
        await store.async_save("home", None, configuration(), None, None)
    assert error.value.code == "storage_quota"
    assert not store.state.homes


async def test_failed_main_save_rolls_back_history_and_does_not_publish_state(hass, monkeypatch) -> None:
    store = HomeManagerStore(hass)
    await store.async_load()
    await store.async_save("home", None, configuration(), None, None)
    previous = await store.async_plans("home")
    monkeypatch.setattr(store._store, "async_save", AsyncMock(side_effect=OSError("synthetic failure")))
    with pytest.raises(ModelError) as error:
        await store.async_save("home", 1, configuration(PLAN.replace("100", "101")), None, None)
    assert error.value.code == "storage_error"
    assert store.state.get("home").revision == 1
    assert await store.async_plans("home") == previous
    with pytest.raises(ModelError):
        await store.async_delete("home", 1)
    assert store.state.get("home").revision == 1


async def test_quarantined_home_is_not_listed_or_silently_deleted(hass, hass_storage) -> None:
    broken = {"title": None, "revision": 1, "updated_at": "2026-10-29T00:00:00+00:00", "configuration": configuration()}
    broken["configuration"]["catalog"]["devices"] = None
    hass_storage[STORAGE_KEY] = {"version": 1, "minor_version": 1, "key": STORAGE_KEY, "data": {"homes": {"broken": broken}}}
    store = HomeManagerStore(hass)
    await store.async_load()
    assert "broken" not in store.state.homes
    await store.async_save("valid", None, configuration(), None, None)
    assert hass_storage[STORAGE_KEY]["data"]["homes"]["broken"] == broken
    with pytest.raises(ModelError):
        await store.async_save("broken", None, configuration(), None, None)


async def test_observer_failure_does_not_invalidate_a_committed_save(hass) -> None:
    store = HomeManagerStore(hass)
    await store.async_load()
    await store.async_save("home", None, configuration(), None, None)
    events = []
    def broken(*_):
        raise RuntimeError("synthetic observer")
    store.async_subscribe("home", broken)
    store.async_subscribe("home", lambda *event: events.append(event))
    saved = await store.async_save("home", 1, configuration(label="Renamed"), None, None)
    assert saved.revision == 2
    assert events == [("home", 2)]
