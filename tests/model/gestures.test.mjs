import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGesture } from '../../.work/model/gestures.js';
const d = () => ({
  id: 'sample',
  roomId: null,
  kind: 'light',
  display: { label: 'Sample', icon: 'mdi:lightbulb' },
  bindings: { entityId: 'light.sample', primaryAction: 'legacy', controls: [{ id: 'power', type: 'cycle' }] },
});
test('old primaryAction, null and absent hold keep their meaning without mutation', () => {
  const device = d(),
    before = structuredClone(device);
  assert.deepEqual(resolveGesture(device, 'tap'), { action: 'legacy', actionId: 'legacy' });
  assert.deepEqual(resolveGesture(device, 'hold'), { action: 'panel' });
  assert.deepEqual(device, before);
  device.bindings.tap = null;
  assert.deepEqual(resolveGesture(device, 'tap'), { action: 'panel' });
});
test('both gestures independently support screen, panel, native, none and controls', () => {
  for (const gesture of ['tap', 'hold']) {
    const device = d();
    for (const action of ['screen', 'panel', 'none']) {
      device.bindings[gesture] = { action };
      assert.deepEqual(resolveGesture(device, gesture), { action });
    }
    device.bindings[gesture] = 'power';
    assert.deepEqual(resolveGesture(device, gesture), { action: 'control', controlId: 'power' });
    device.bindings[gesture] = { action: 'native' };
    assert.deepEqual(resolveGesture(device, gesture), { action: 'screen', missing: true });
    device.bindings.advancedPopupId = 'panel';
    assert.deepEqual(resolveGesture(device, gesture), { action: 'native' });
  }
});
test('a deleted control opens a screen with a warning rather than throwing or calling a service', () => {
  const device = d();
  device.bindings.hold = { action: 'control', controlId: 'deleted' };
  assert.deepEqual(resolveGesture(device, 'hold'), { action: 'screen', missing: true });
  device.bindings.tap = 'deleted';
  assert.deepEqual(resolveGesture(device, 'tap'), { action: 'screen', missing: true });
});
