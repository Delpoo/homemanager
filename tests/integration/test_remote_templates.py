"""0.14 stage 3: every starting design of a new remote is accepted by the remote library as it is."""

from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path

from custom_components.homemanager.rf_model import validate_layout

TEMPLATES = json.loads((Path(__file__).parents[1] / "fixtures" / "remote-templates.json").read_text(encoding="utf-8"))


def test_starting_designs_wait_for_their_buttons_and_validate_unchanged():
    assert len(TEMPLATES) == 15
    for name, layout in TEMPLATES.items():
        # No button is learned yet: every piece points at a button the canvas waits for.
        assert validate_layout(deepcopy(layout), set()) == layout, name
