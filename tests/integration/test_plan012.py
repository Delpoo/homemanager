"""Plan 0.12 contract (#91-#97): the same fictional cases as tests/ha/plan012.test.mjs."""
import json
from copy import deepcopy
from pathlib import Path
import pytest
from custom_components.homemanager.errors import ModelError
from custom_components.homemanager.validation import validate_configuration

CASES = json.loads((Path(__file__).parents[1] / "fixtures" / "plan012.json").read_text(encoding="utf-8"))


def _configuration(patch):
    device = {
        "id": "sample", "roomId": None, "kind": "light", "position": {"x": 0.5, "y": 0.5}, "mobility": "editable",
        "display": {"label": "Sample", "icon": "mdi:lightbulb", **patch.get("display", {})},
        "bindings": {"entityId": "light.sample", "primaryAction": None, "advancedPopupId": None, **patch.get("bindings", {})},
        "state": {"value": "unknown", "confidence": "unknown"},
    }
    return {
        "schemaVersion": 2, "rooms": [], "catalog": {"schemaVersion": 2, "devices": [device]},
        "architecture": {"format": "svg", "content": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"/>'},
        "actions": {}, "panels": {}, "stateSources": {}, **deepcopy(patch.get("config", {})),
    }


@pytest.mark.parametrize("patch", CASES["valid"])
def test_plan012_valid(patch):
    validate_configuration(_configuration(patch))


@pytest.mark.parametrize("patch", CASES["invalid"])
def test_plan012_invalid(patch):
    with pytest.raises(ModelError):
        validate_configuration(_configuration(patch))


def test_plan012_device_actions():
    base = _configuration({})
    base["actions"] = {
        "robot-casa": {"domain": "vacuum", "service": "return_to_base", "target": {"entity_id": "vacuum.ficticio"}},
        "modo": {"domain": "select", "service": "select_option", "target": {"entity_id": "select.ficticio"}, "data": {"option": "alto"}},
    }
    validate_configuration(base)
    bad = deepcopy(base)
    del bad["actions"]["modo"]["data"]
    with pytest.raises(ModelError):
        validate_configuration(bad)


# --- #75: storage breakdown and explicit cleanups ---------------------------
import base64

from custom_components.homemanager.images import put_image
from custom_components.homemanager.store import HomeManagerStore

_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><rect width="10" height="10"/></svg>'


def _image(source=_SVG):
    return {"format": "svg", "content": base64.b64encode(source.encode()).decode()}


async def test_storage_status_breaks_down_by_kind(hass):
    store = HomeManagerStore(hass)
    await store.async_load()
    await store.async_save("casa-ficticia", None, _configuration({}), None, None)
    await put_image(store, "example", _image())
    status = await store.async_storage_status()
    breakdown = status["breakdown"]
    assert set(breakdown) == {"homes", "plans", "images", "retained", "rf"}
    assert breakdown["homes"] > 0 and breakdown["plans"] > 0 and breakdown["images"] > 0
    assert status["limit"] == 64 * 1024 * 1024


async def test_explicit_image_cleanup_also_removes_recent_unsaved_uploads(hass):
    store = HomeManagerStore(hass)
    await store.async_load()
    await put_image(store, "example", _image())
    assert await store.async_prune_images_now() == 1
    assert "homemanager.images.example" not in store._sizes


async def test_history_trim_keeps_the_newest_versions(hass):
    store = HomeManagerStore(hass)
    await store.async_load()
    home = None
    for index in range(4):
        configuration = _configuration({})
        configuration["architecture"]["content"] = _SVG.replace("10", str(10 + index))
        home = await store.async_save("casa-ficticia", home.revision if home else None, configuration, None, None)
    assert len(await store.async_plans("casa-ficticia")) == 4
    assert await store.async_trim_history("casa-ficticia", 2) == 2
    plans = await store.async_plans("casa-ficticia")
    assert len(plans) == 2 and plans[-1].revision == home.revision
    with pytest.raises(ModelError):
        await store.async_trim_history("casa-ficticia", 1)


@pytest.mark.parametrize("indicators", [
    [{"type": "ring", "entity": "cover.sample"}, {"type": "ring", "entity": "cover.other"}],
    [{"type": "ring", "entity": "cover.sample", "min": 50, "max": 10}],
    [{"type": "border", "entity": "sensor.sample", "ranges": [{"from": 5, "to": 1, "color": "#000000"}]}],
])
def test_indicator_semantic_checks(indicators):
    """0.13: one of each type, min below max and ranges in order."""
    with pytest.raises(ModelError):
        validate_configuration(_configuration({"display": {"indicators": indicators}}))
