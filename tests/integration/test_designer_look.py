"""0.13 designer, second part: the same cases as tests/ha/designer-look.test.mjs."""
from copy import deepcopy
import json
from pathlib import Path

import pytest

from custom_components.homemanager.errors import ModelError
from custom_components.homemanager.rf_model import Button, remove_layout_button, validate_layout
from custom_components.homemanager.validation import validate_control_layout

CASES = json.loads((Path(__file__).parents[1] / "fixtures" / "designer-look.json").read_text(encoding="utf-8"))
BUTTONS = {ref: Button(ref, "Synthetic", "0" * 24) for ref in CASES["buttons"]}


def test_plan_symbols_and_the_remote_library_agree():
    for layout in CASES["valid"]:
        before = deepcopy(layout)
        validate_control_layout(layout)
        assert validate_layout(deepcopy(layout), BUTTONS) == layout
        assert layout == before
    for layout in CASES["invalid"]:
        with pytest.raises(ModelError):
            validate_control_layout(deepcopy(layout))
        with pytest.raises(ModelError):
            validate_layout(deepcopy(layout), BUTTONS)


def test_the_library_refuses_a_key_or_hold_button_that_was_never_learned():
    pad = {"id": "pad", "type": "dpad", "x": 0, "y": 0, "w": 3, "h": 3, "buttons": ["other"], "label": None, "icon": None, "slots": {"up": "other"}}
    with pytest.raises(ModelError):
        validate_layout([pad], BUTTONS)
    key = {"id": "k", "type": "button", "x": 0, "y": 0, "w": 1, "h": 1, "buttons": ["a-1"], "label": None, "icon": None, "hold": "other", "holdButton": "other"}
    with pytest.raises(ModelError):
        validate_layout([key], BUTTONS)


def test_deleting_a_learned_button_keeps_what_still_makes_sense():
    layout = validate_layout(deepcopy(CASES["valid"][0]), BUTTONS)
    kept = {widget["id"]: widget for widget in remove_layout_button(layout, "a-3")}
    # The block loses that key; the hold falls back to nothing; the mode loses its option.
    assert kept["pad"]["slots"] == {"up": "a-1", "down": "a-2"}
    assert "hold" not in kept["netflix"] and "holdButton" not in kept["netflix"]
    assert [option["label"] for option in kept["mode"]["options"]] == ["Frío", "Calor"]
    # One level per button: the level goes with its button.
    assert kept["fan"]["names"] == ["Apagado", "1", "3"]
    # A speed that only had that button cannot work any more.
    assert "speed" not in kept and "channel" not in kept
    assert "temp" in kept and "power" in kept
