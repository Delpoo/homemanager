"""0.13: pieces of a device's control attached to its symbol (same cases as tests/ha/attached.test.mjs)."""
import json
from pathlib import Path

import pytest

from custom_components.homemanager.errors import ModelError
from custom_components.homemanager.validation import _attached

CASES = json.loads((Path(__file__).parents[1] / "fixtures" / "attached.json").read_text(encoding="utf-8"))


def test_attached_pieces_follow_the_shared_contract():
    for items in CASES["valid"]:
        _attached(items)
    for items in CASES["invalid"]:
        with pytest.raises(ModelError):
            _attached(items)
