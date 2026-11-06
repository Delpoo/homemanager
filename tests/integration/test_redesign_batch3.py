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


def test_free_designer_fields_are_kept_and_checked_by_the_library():
    """0.13: a canvas sets the grid; look, orientation and preset steps are stored."""
    buttons = {ref: Button(ref, 'Synthetic', '0' * 24) for ref in ('a-1', 'a-2')}
    base = {'x': 0, 'y': 0, 'w': 1, 'h': 1, 'label': None, 'icon': None}
    layout = [
        {**base, 'id': 'grid', 'type': 'canvas', 'w': 8, 'h': 10, 'buttons': []},
        {**base, 'id': 'power', 'type': 'button', 'x': 6, 'w': 2, 'buttons': ['a-1'], 'bg': '#4F7A5A', 'fg': '#FFFFFF', 'shape': 'round', 'hideLabel': True},
        {**base, 'id': 'night', 'type': 'preset', 'buttons': ['a-1', 'a-2'], 'sequence': [{'button': 'a-1'}, {'wait': 300}, {'button': 'a-2', 'times': 2}]},
        {**base, 'id': 'fins', 'type': 'updown', 'h': 3, 'buttons': ['a-1', 'a-2'], 'orientation': 'vertical'},
        {**base, 'id': 'speed', 'type': 'knob', 'w': 2, 'h': 2, 'buttons': ['a-1', 'a-2']},
    ]
    assert validate_layout(deepcopy(layout), buttons) == layout
    for broken in [
        [layout[0], layout[0] | {'id': 'grid-2'}],
        [layout[1]],  # x=6 needs the eight-column canvas
        [layout[2] | {'sequence': [{'button': 'other'}]}],
        [layout[2] | {'sequence': []}],
        [layout[1] | {'orientation': 'vertical'}],
        [layout[1] | {'bg': 'red'}],
    ]:
        with pytest.raises(ModelError):
            validate_layout(deepcopy(broken), buttons)
