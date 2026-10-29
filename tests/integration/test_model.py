"""Pure model rules: envelope, limits and compare-and-swap."""

from datetime import UTC, datetime

import pytest

from custom_components.homemanager.const import MAX_PLAN_HISTORY
from custom_components.homemanager.model import Homes, ModelError, RevisionConflict, record_plan, validate_configuration

from .conftest import PLAN, configuration

NOW = datetime(2026, 10, 29, tzinfo=UTC)


def test_create_requires_null_revision_and_updates_require_the_current_one() -> None:
    homes = Homes()
    home, plan_changed = homes.save("home", None, configuration(), "Casa", "admin", NOW)
    assert (home.revision, plan_changed, home.title) == (1, True, "Casa")
    with pytest.raises(RevisionConflict) as conflict:
        homes.save("home", None, configuration(), None, "admin", NOW)
    assert conflict.value.current == 1
    updated, plan_changed = homes.save("home", 1, configuration(label="Renamed"), None, "admin", NOW)
    assert (updated.revision, plan_changed, updated.title) == (2, False, "Casa")
    with pytest.raises(RevisionConflict):
        homes.save("home", 1, configuration(), None, "admin", NOW)
    assert homes.get("home").configuration["rooms"][0]["label"] == "Renamed"


@pytest.mark.parametrize(
    ("mutate", "code"),
    [
        (lambda c: c.update(schemaVersion=1), "unsupported_schema"),
        (lambda c: c.update(token="x"), "invalid_configuration"),
        (lambda c: c.pop("rooms"), "invalid_configuration"),
        (lambda c: c["architecture"].update(format="png"), "invalid_configuration"),
        (lambda c: c["architecture"].update(content="x" * (1024 * 1024 + 1)), "plan_too_large"),
        (lambda c: c["actions"].update({"__proto__": {}}), "invalid_configuration"),
        (lambda c: c["actions"].update({f"a{i}": {"data": "y" * 8000} for i in range(400)}), "configuration_too_large"),
        (lambda c: c["catalog"].update(devices=[float("nan")]), "invalid_configuration"),
    ],
)
def test_invalid_envelopes_are_rejected(mutate, code: str) -> None:
    value = configuration()
    mutate(value)
    with pytest.raises(ModelError) as error:
        validate_configuration(value)
    assert error.value.code == code


@pytest.mark.parametrize("home_id", ["", "Home", "a b", "__proto__", "x" * 65, "-x"])
def test_home_ids_are_kebab_case(home_id: str) -> None:
    with pytest.raises(ModelError):
        Homes().save(home_id, None, configuration(), None, None, NOW)


def test_delete_checks_revision() -> None:
    homes = Homes()
    homes.save("home", None, configuration(), None, None, NOW)
    with pytest.raises(RevisionConflict):
        homes.delete("home", 7)
    homes.delete("home", 1)
    with pytest.raises(ModelError):
        homes.get("home")


def test_plan_history_skips_duplicates_and_keeps_the_newest() -> None:
    homes = Homes()
    history = []
    for index in range(MAX_PLAN_HISTORY + 3):
        plan = PLAN.replace("100", str(100 + index))
        home, _ = homes.save("home", index or None, configuration(plan), None, "admin", NOW)
        history = record_plan(history, home, NOW)
        history = record_plan(history, home, NOW)  # same plan again: no new entry
    assert len(history) == MAX_PLAN_HISTORY
    assert history[-1].revision == MAX_PLAN_HISTORY + 3
    assert len({plan.plan_id for plan in history}) == MAX_PLAN_HISTORY


@pytest.mark.parametrize(
    "plan",
    [
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
        '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><use href="javascript:alert(1)"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://x.test/a.svg#p)"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><use href="data:image/svg+xml,abc"/></svg>',
        '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>',
        '<html><svg xmlns="http://www.w3.org/2000/svg"/></html>',
    ],
)
def test_server_refuses_plans_no_sanitized_svg_can_contain(plan: str) -> None:
    with pytest.raises(ModelError) as error:
        validate_configuration(configuration(plan))
    assert error.value.code == "unsafe_plan"


def test_sanitized_plans_with_namespaces_gradients_and_text_are_accepted() -> None:
    plan = (
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">'
        '<desc>Source: https://example.test/plan (text is never executed)</desc>'
        '<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>'
        '<rect id="room-a" width="5" height="5" fill="url(#g)"/><use xlink:href="#room-a"/></svg>'
    )
    assert validate_configuration(configuration(plan))["architecture"]["content"] == plan


def test_quick_actions_and_rf_remote_are_optional_bindings() -> None:
    valid = configuration()
    device = {
        "id": "lamp",
        "roomId": "studio",
        "kind": "light",
        "position": {"x": 0.5, "y": 0.5},
        "mobility": "editable",
        "display": {"label": "Lamp", "icon": "mdi:lightbulb"},
        "bindings": {
            "entityId": "light.lamp",
            "primaryAction": None,
            "advancedPopupId": None,
            "quickActions": [{"id": "quick-1", "label": "On", "actionId": "lamp-on"}],
            "remoteId": "techo",
        },
        "state": {"value": "unknown", "confidence": "unknown"},
    }
    valid["catalog"]["devices"] = [device]
    validate_configuration(valid)
    for change in (
        {"quickActions": [{"id": f"q{i}", "label": "x", "actionId": "a"} for i in range(5)]},
        {"quickActions": [{"id": "q", "label": "x", "actionId": "a"}, {"id": "q", "label": "y", "actionId": "a"}]},
        {"quickActions": [{"id": "q", "label": "x" * 81, "actionId": "a"}]},
        {"quickActions": [{"id": "q", "label": "x", "actionId": "a", "code": "1010"}]},
        {"remoteId": "Not An Id"},
    ):
        bad = configuration()
        bad["catalog"]["devices"] = [{**device, "bindings": {**device["bindings"], **change}}]
        with pytest.raises(ModelError):
            validate_configuration(bad)

