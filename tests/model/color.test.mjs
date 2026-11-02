import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_PALETTE, contrast, symbolTones, validColor } from '../../.work/model/color.js';
import { symbolSpec } from '../../.work/model/symbol-spec.js';
test('custom colors maintain foreground contrast in light and dark without using red defaults', () => {
  for (const color of [...COLOR_PALETTE, '#ffffff', '#000000', '#ffff00', '#ff0000', '#cccccc']) {
    const tones = symbolTones(color);
    assert.ok(contrast(tones.light, '#ffffff') >= 4.5);
    assert.ok(contrast(tones.dark, '#1b221e') >= 4.5);
  }
  assert.equal(COLOR_PALETTE.includes('#ff0000'), false);
  for (const bad of ['red', '#123', 'javascript:alert(1)', '#ffffff;display:none', null])
    assert.equal(validColor(bad), false);
});
test('colorless legacy symbols keep their spec; custom colors cannot erase alert and health badges', () => {
  const d = {
    id: 'leak',
    roomId: null,
    kind: 'sensor',
    display: { label: 'Leak', icon: 'mdi:water' },
    bindings: { entityId: 'binary_sensor.leak' },
  };
  const h = { states: { 'binary_sensor.leak': { state: 'on', attributes: { device_class: 'moisture' } } } };
  const old = symbolSpec(d, h, 0);
  assert.equal('color' in old, false);
  d.display.color = '#0000ff';
  const colored = symbolSpec(d, h, 0);
  assert.deepEqual(colored.badge, old.badge);
  assert.deepEqual(colored.health, old.health);
  assert.equal(colored.badge.level, 'critical');
  assert.ok(colored.color);
});
