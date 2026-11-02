"""Shared optional designer layout contract and RF library compatibility."""
from copy import deepcopy
import json
from pathlib import Path
import pytest
from custom_components.homemanager.errors import ModelError
from custom_components.homemanager.validation import validate_control_layout
from custom_components.homemanager.rf_model import validate_layout, Button


def test_designer_shared_cases():
    cases = json.loads((Path(__file__).parents[1] / 'fixtures' / 'redesign-batch3.json').read_text())
    for expected, layouts in [(True, cases['valid']), (False, cases['invalid'])]:
        for layout in layouts:
            before = deepcopy(layout)
            if expected:
                validate_control_layout(layout)
            else:
                with pytest.raises(ModelError):
                    validate_control_layout(layout)
            assert layout == before


def test_rf_new_pieces_keep_the_old_layout_and_validate_references():
    button = Button('sample-action', 'Synthetic', '0' * 24)
    old = {'id': 'button', 'type': 'button', 'x': 0, 'y': 0, 'w': 1, 'h': 1,
           'buttons': ['sample-action'], 'label': None, 'icon': None}
    assert validate_layout([old], {'sample-action': button}) == [old]
    for kind, refs in [('indicator', []), ('title', []), ('separator', []), ('cycle', ['sample-action'] * 2), ('slider', ['sample-action'] * 2)]:
        piece = {**old, 'type': kind, 'buttons': refs, 'reading': 'sensor.synthetic', 'attribute': 'percentage'}
        assert validate_layout([piece], {'sample-action': button}) == [piece]
    with pytest.raises(ModelError):
        validate_layout([{**old, 'buttons': ['missing']}], {'sample-action': button})
