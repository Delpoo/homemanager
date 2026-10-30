"""Pure model rules: envelope, limits and compare-and-swap."""

from datetime import UTC, datetime

import pytest

from custom_components.homemanager.const import MAX_PLAN_HISTORY
from custom_components.homemanager.model import Homes, ModelError, RevisionConflict, record_plan, validate_configuration

from .conftest import PLAN, configuration

NOW = datetime(2026, 10, 29, tzinfo=UTC)


def test_cp4_alert_rules_match_the_shared_contract_cases() -> None:
    from copy import deepcopy
    import json
    from pathlib import Path

    cases = json.loads((Path(__file__).parents[1] / "fixtures" / "alert-rules.json").read_text())
    for fields in cases["valid"]:
        value = presentation_configuration()
        value["catalog"]["devices"][0]["display"].update(fields)
        before = deepcopy(value)
        assert validate_configuration(value) == before == value
    for fields in cases["invalid"]:
        value = presentation_configuration()
        value["catalog"]["devices"][0]["display"].update(fields)
        with pytest.raises(ModelError):
            validate_configuration(value)
    for field in ("below", "above", "forMinutes"):
        for invalid in (float("nan"), float("inf"), float("-inf")):
            value = presentation_configuration()
            value["catalog"]["devices"][0]["display"]["alerts"] = [
                {"reading": "sensor.test", "level": "warning", field: invalid}
            ]
            with pytest.raises(ModelError):
                validate_configuration(value)


def presentation_configuration() -> dict:
    value = configuration()
    value["catalog"]["devices"] = [{
        "id": "sample-lamp", "roomId": "studio", "kind": "light",
        "position": {"x": 0.5, "y": 0.5}, "mobility": "editable",
        "display": {"label": "Sample lamp", "icon": "mdi:lightbulb"},
        "bindings": {"entityId": "light.sample", "primaryAction": None, "advancedPopupId": None},
        "state": {"value": "unknown", "confidence": "unknown"},
    }]
    return value


def test_08_registry_readings_round_trip_and_07_is_unchanged() -> None:
    from copy import deepcopy

    legacy = presentation_configuration()
    before = deepcopy(legacy)
    assert validate_configuration(legacy) == before == legacy
    for readings in ([], ["sensor.sample_temperature"], ["sensor.a", "sensor.b", "sensor.c"]):
        value = presentation_configuration()
        value["catalog"]["devices"][0]["bindings"].update(deviceId="0011aaBB-device_1", readings=readings)
        assert validate_configuration(value) == value


@pytest.mark.parametrize(("field", "invalid"), [
    *[("deviceId", value) for value in ("", None, False, 1, {}, [], "device.id", "device/id", " bad", "bad\n", "constructor", "x" * 241)],
    *[("readings", value) for value in (None, False, "sensor.a", {}, [None], ["sensor.all"], ["sensor.a\n"], ["sensor.a", "sensor.a"], ["sensor.a", "sensor.b", "sensor.c", "sensor.d"], ["light.sample"])],
])
def test_08_rejects_malformed_registry_readings(field, invalid) -> None:
    value = presentation_configuration()
    value["catalog"]["devices"][0]["bindings"].update(deviceId="registry-device")
    value["catalog"]["devices"][0]["bindings"][field] = invalid
    with pytest.raises(ModelError):
        validate_configuration(value)


def test_08_additional_readings_need_a_registry_device() -> None:
    value = presentation_configuration()
    value["catalog"]["devices"][0]["bindings"]["readings"] = ["sensor.other"]
    with pytest.raises(ModelError):
        validate_configuration(value)


def test_07_presentation_fields_are_optional_without_migrating_06_data() -> None:
    from copy import deepcopy

    legacy = presentation_configuration()
    before = deepcopy(legacy)
    result = validate_configuration(legacy)
    assert result == before == legacy
    assert result is not legacy
    assert "icon" not in result["rooms"][0]
    assert set(result["catalog"]["devices"][0]["display"]) == {"label", "icon"}


@pytest.mark.parametrize("icon", ["mdi:sofa", "mdi:flower-tulip-outline", "mdi:" + "a" * 236])
def test_07_space_icon_round_trips(icon: str) -> None:
    value = presentation_configuration()
    value["rooms"][0]["icon"] = icon
    assert validate_configuration(value) == value


@pytest.mark.parametrize("archetype", [None, "actuator", "equipment", "sensor", "meter", "remote", "infrastructure"])
@pytest.mark.parametrize("show", [None, "icon", "value", "both"])
def test_07_presentation_fields_round_trip_independently(archetype: str | None, show: str | None) -> None:
    value = presentation_configuration()
    display = value["catalog"]["devices"][0]["display"]
    if archetype is not None:
        display["archetype"] = archetype
    if show is not None:
        display["show"] = show
    assert validate_configuration(value) == value


@pytest.mark.parametrize("category", ["switch", "equipment", "remote", "meter", "plant", "alert", "presence", "infrastructure"])
def test_09_category_round_trips(category: str) -> None:
    value = presentation_configuration()
    value["catalog"]["devices"][0]["display"]["category"] = category
    assert validate_configuration(value) == value


@pytest.mark.parametrize("room", [
    {"shape": {"x": 0, "y": 0, "width": 1, "height": 1}},
    {"shape": {"x": 0.25, "y": 0.5, "width": 0.5, "height": 0.25}, "shapeSource": "svg"},
    {"shape": {"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.3}, "shapeSource": "app"},
])
def test_09_room_shape_round_trips(room: dict) -> None:
    value = presentation_configuration()
    value["rooms"][0].update(room)
    assert validate_configuration(value) == value


@pytest.mark.parametrize("room", [
    {"shape": None},
    {"shape": {"x": 0, "y": 0, "width": 0, "height": 0.5}},
    {"shape": {"x": 0.6, "y": 0, "width": 0.5, "height": 0.5}},
    {"shape": {"x": -0.1, "y": 0, "width": 0.5, "height": 0.5}},
    {"shape": {"x": 0, "y": 0, "width": 0.5, "height": 0.5, "kind": "rect"}},
    {"shape": {"x": 0, "y": 0, "width": True, "height": 0.5}},
    {"shapeSource": "svg"},
    {"shape": {"x": 0, "y": 0, "width": 0.5, "height": 0.5}, "shapeSource": "user"},
])
def test_09_room_shape_rejects_invalid_values(room: dict) -> None:
    value = presentation_configuration()
    value["rooms"][0].update(room)
    with pytest.raises(ModelError) as error:
        validate_configuration(value)
    assert error.value.code == "invalid_configuration"


@pytest.mark.parametrize("room", [{"frame": "tight"}, {"frame": "wide", "nav": {"skip": True}}, {"nav": {"hidden": ["kitchen", "office"]}}])
def test_09_room_view_fields_round_trip(room: dict) -> None:
    value = presentation_configuration()
    value["rooms"][0].update(room)
    assert validate_configuration(value) == value


@pytest.mark.parametrize("room", [
    {"frame": "huge"}, {"frame": None}, {"nav": []}, {"nav": {"skip": 1}}, {"nav": {"hidden": "kitchen"}},
    {"nav": {"hidden": ["kitchen", "kitchen"]}}, {"nav": {"hidden": ["Bad Id"]}}, {"nav": {"other": True}},
])
def test_09_room_view_fields_reject_invalid_values(room: dict) -> None:
    value = presentation_configuration()
    value["rooms"][0].update(room)
    with pytest.raises(ModelError) as error:
        validate_configuration(value)
    assert error.value.code == "invalid_configuration"


@pytest.mark.parametrize("category", [None, False, 1, [], {}, "", "Switch", "actuator", "planta", "plant\n"])
def test_09_category_rejects_unknown_values(category) -> None:
    value = presentation_configuration()
    value["catalog"]["devices"][0]["display"]["category"] = category
    with pytest.raises(ModelError) as error:
        validate_configuration(value)
    assert error.value.code == "invalid_configuration"


@pytest.mark.parametrize("icon", [
    None, False, 1, [], {}, "", "mdi:", "mdi:Bad", "lightbulb", "mdi:sofa ",
    "mdi:sofa\n", "mdi:sofa\r\n", "mdi:sofa\u2028", "mdi:sofa--outline", "mdi:sofa-",
    "mdi:<svg>", 'mdi:sofa" onload="x', "https://example.test/icon.svg", "mdi:" + "a" * 237,
])
def test_07_space_icon_rejects_wrong_types_and_unsafe_values(icon) -> None:
    value = presentation_configuration()
    value["rooms"][0]["icon"] = icon
    with pytest.raises(ModelError) as error:
        validate_configuration(value)
    assert error.value.code == "invalid_configuration"


@pytest.mark.parametrize(("field", "invalid"), [
    *[("archetype", value) for value in (None, False, 1, [], {}, "", "Actuator", "actuador", "dimmer", "actuator\n")],
    *[("show", value) for value in (None, False, 1, [], {}, "", "Icon", "all", "value\n")],
])
def test_07_presentation_fields_reject_unknown_values_and_types(field: str, invalid) -> None:
    value = presentation_configuration()
    value["catalog"]["devices"][0]["display"][field] = invalid
    with pytest.raises(ModelError) as error:
        validate_configuration(value)
    assert error.value.code == "invalid_configuration"


@pytest.mark.parametrize(("location", "field", "invalid"), [
    ("room", "archetype", "sensor"),
    ("display", "iconUrl", "https://example.test/icon.svg"),
    ("bindings", "alerts", {}),
])
def test_07_only_adds_the_three_approved_optional_fields(location: str, field: str, invalid) -> None:
    value = presentation_configuration()
    target = value["rooms"][0] if location == "room" else value["catalog"]["devices"][0][location]
    target[field] = invalid
    with pytest.raises(ModelError) as error:
        validate_configuration(value)
    assert error.value.code == "invalid_configuration"


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



def test_device_controls_tap_pins_and_size_are_optional_and_bounded() -> None:
    valid = configuration()
    step = {"actionId": "lamp-on"}
    device = {
        "id": "lamp",
        "roomId": "studio",
        "kind": "light",
        "position": {"x": 0.5, "y": 0.5},
        "mobility": "editable",
        "display": {"label": "Lamp", "icon": "mdi:lightbulb", "size": "s", "pinned": ["level"]},
        "bindings": {
            "entityId": "light.lamp",
            "primaryAction": None,
            "advancedPopupId": None,
            "controls": [
                {"id": "power", "type": "cycle", "label": "On / off", "steps": [{**step, "label": "On", "icon": "mdi:lightbulb"}, {"actionId": "lamp-off"}]},
                {"id": "level", "type": "slider", "label": "Level", "steps": [], "entityId": "light.lamp", "orientation": "horizontal"},
            ],
            "tap": "power",
        },
        "state": {"value": "unknown", "confidence": "unknown"},
    }
    valid["catalog"]["devices"] = [device]
    validate_configuration(valid)

    def control(kind: str, steps: list, **extra) -> dict:
        return {"id": "c", "type": kind, "label": "C", "steps": steps, **extra}

    for bindings, display in (
        ({"controls": [control("button", [step, step])]}, {}),
        ({"controls": [control("cycle", [step])]}, {}),
        ({"controls": [control("cycle", [step] * 5)]}, {}),
        ({"controls": [control("select", [step] * 9)]}, {}),
        ({"controls": [control("slider", [step])]}, {}),
        ({"controls": [control("slider", [step] * 13)]}, {}),
        ({"controls": [control("dimmer", [])]}, {}),
        ({"controls": [control(["button"], [step])]}, {}),
        ({"controls": [control("button", [step], entityId="light.lamp")]}, {}),
        ({"controls": [control("slider", [step, step], entityId="light.lamp")]}, {}),
        ({"controls": [control("cycle", [step, step], orientation="vertical")]}, {}),
        ({"controls": [control("button", [{**step, "code": "1010"}])]}, {}),
        ({"controls": [control("button", [step]), control("button", [step])]}, {}),
        ({"controls": [{**control("button", [step]), "id": f"c{index}"} for index in range(9)]}, {}),
        ({"controls": [control("slider", [])], "tap": "c"}, {}),
        ({"tap": "missing"}, {}),
        ({"tap": {"id": "power"}}, {}),
        ({"controls": [control("button", [step])]}, {"pinned": ["missing"]}),
        ({"controls": [control("button", [step])]}, {"pinned": ["c", "c"]}),
        ({"controls": [control("button", [step])]}, {"pinned": [["c"]]}),
        ({}, {"size": "xl"}),
    ):
        bad = configuration()
        changed = {**device["bindings"], **bindings}
        if "controls" in bindings and "tap" not in bindings:
            changed["tap"] = None
        bad["catalog"]["devices"] = [{**device, "display": {"label": "Lamp", "icon": "mdi:lightbulb", **display}, "bindings": changed}]
        with pytest.raises(ModelError):
            validate_configuration(bad)
