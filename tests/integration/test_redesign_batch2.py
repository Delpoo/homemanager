"""Shared E05–E08 contract cases, using the actual Python validator."""
from copy import deepcopy
import json
from pathlib import Path

import pytest

from custom_components.homemanager.errors import ModelError
from custom_components.homemanager.validation import validate_configuration
from .test_model import presentation_configuration


def test_redesign_batch2_shared_cases() -> None:
    cases = json.loads((Path(__file__).parents[1] / "fixtures" / "redesign-batch2.json").read_text())
    for expected, patches in ((True, cases["valid"]), (False, cases["invalid"])):
        for patch in patches:
            value = presentation_configuration()
            device = value["catalog"]["devices"][0]
            device["display"].update(patch.get("display", {}))
            device["bindings"].update(patch.get("bindings", {}))
            if "rules" in patch:
                value["rules"] = patch["rules"]
            if expected:
                before = deepcopy(value)
                assert validate_configuration(value) == before == value
            else:
                with pytest.raises(ModelError):
                    validate_configuration(value)
