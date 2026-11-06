"""0.13: a space's own outline is validated like the card and the schema do."""
from copy import deepcopy
import json
from pathlib import Path
import pytest
from custom_components.homemanager.errors import ModelError
from custom_components.homemanager.validation import validate_configuration


def test_outline_shared_cases():
    cases = json.loads((Path(__file__).parents[1] / 'fixtures' / 'plan-outline.json').read_text(encoding='utf-8'))
    for expected, rooms in [(True, cases['valid']), (False, cases['invalid'])]:
        for room in rooms:
            configuration = {**deepcopy(cases['base']), 'rooms': [room]}
            before = deepcopy(configuration)
            if expected:
                validate_configuration(configuration)
            else:
                with pytest.raises(ModelError):
                    validate_configuration(configuration)
            assert configuration == before
