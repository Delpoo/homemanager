// Entirely fictional devices and timestamps. No real HA installation is accessed.
export const now = Date.parse('2026-01-01T12:00:00.000Z');
export function fixture(kind = 'sensor', entityId = 'sensor.test_temperature', state = '23.4', attributes = {}) {
  const device = {
    id: 'test-device',
    roomId: 'test-room',
    kind,
    display: { label: 'Test device', icon: 'mdi:thermometer' },
    bindings: { entityId, primaryAction: null, advancedPopupId: null },
    state: { value: 'unknown', confidence: 'unknown' },
  };
  const hass = {
    states: { [entityId]: { state, attributes, last_changed: new Date(now - 1000).toISOString() } },
    locale: { language: 'es' },
  };
  return { device, hass, entity: hass.states[entityId] };
}
