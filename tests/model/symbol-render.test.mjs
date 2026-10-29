import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSymbol } from '../../.work/card/markers.js';
import { symbolSpec } from '../../.work/model/symbol-spec.js';

test('marker renderer draws only SymbolSpec semantics and escapes body values', () => {
  const device = {
    id: 'meter',
    roomId: null,
    kind: 'sensor',
    display: { label: 'Test', icon: 'mdi:thermometer' },
    bindings: { entityId: 'sensor.synthetic' },
  };
  const spec = symbolSpec(
    device,
    {
      states: {
        'sensor.synthetic': { state: '23.4', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
      },
    },
    0,
  );
  const html = renderSymbol(spec);
  assert.match(html, /23,4/);
  assert.doesNotMatch(html, /state-dot|thermometer|symbol-ring/);
  assert.match(
    renderSymbol({ ...spec, body: { show: 'both', icon: 'mdi:test', value: '<x>', fullValue: '"x"' } }),
    /&lt;x&gt;/,
  );
});
