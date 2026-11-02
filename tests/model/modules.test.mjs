import test from 'node:test';
import assert from 'node:assert/strict';
import { modulesOf, moduleChoices, MODULES } from '../../.work/model/modules.js';
import { presentationOf } from '../../.work/model/archetype.js';
import { symbolSpec } from '../../.work/model/symbol-spec.js';
import { assertConfiguration } from '../../src/ha/validation.mjs';
const device = category => ({
  id: 'sample',
  roomId: null,
  kind: 'light',
  position: { x: 0.5, y: 0.5 },
  mobility: 'editable',
  display: { label: 'Sample', icon: 'mdi:lightbulb', category, archetype: 'equipment' },
  bindings: { entityId: 'light.sample', primaryAction: null, advancedPopupId: null },
  state: { value: 'unknown', confidence: 'unknown' },
});
test('all eight legacy categories derive modules without changing presentation or stored data', () => {
  for (const category of ['switch', 'equipment', 'remote', 'meter', 'plant', 'alert', 'presence', 'infrastructure']) {
    const d = device(category),
      before = structuredClone(d);
    const spec = symbolSpec(d, { states: { 'light.sample': { state: 'off', attributes: {} } } }, 0);
    assert.ok(modulesOf(d).includes('gestures'));
    assert.deepEqual(d, before);
    assert.deepEqual(symbolSpec(d, { states: { 'light.sample': { state: 'off', attributes: {} } } }, 0), spec);
    d.display.modules = [...MODULES];
    assert.deepEqual(modulesOf(d), MODULES);
    assert.equal(d.display.category, category);
    assert.equal(d.display.archetype, 'equipment');
  }
});
test('module dependencies explain missing controls; chosen layers override suggestions independently', () => {
  const d = device('meter');
  assert.equal(moduleChoices(d).find(m => m.id === 'pinned').reason, 'Necesita un control');
  d.bindings.controls = [{ id: 'button', type: 'button' }];
  assert.equal(moduleChoices(d).find(m => m.id === 'pinned').reason, null);
  d.display.layer = 'controls';
  assert.equal(presentationOf(d).layer, 'controls');
});
test('optional module and layer fields round trip and reject malformed variants', () => {
  const d = device('plant');
  d.display.modules = ['gestures', 'control'];
  d.display.layer = 'energy';
  const c = {
    schemaVersion: 2,
    rooms: [],
    catalog: { schemaVersion: 2, devices: [d] },
    architecture: { format: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>' },
    actions: {},
    panels: {},
    stateSources: {},
  };
  assert.deepEqual(assertConfiguration(c).catalog.devices[0].display, d.display);
  for (const modules of [['device', 'device'], ['made-up'], null, [{}]]) {
    const bad = structuredClone(c);
    bad.catalog.devices[0].display.modules = modules;
    assert.throws(() => assertConfiguration(bad));
  }
});
