import test from 'node:test';
import assert from 'node:assert/strict';
import { searchEntities } from '../../.work/editor/entity-picker.js';

const state = value => ({ state: value, attributes: {}, last_updated: '2026-01-01T00:00:00Z' });

test('the picker offers devices first and hides what is never a device', () => {
  const hass = {
    states: {
      'update.terminal_update': state('off'),
      'media_player.tv': state('unavailable'),
      'sensor.tv_ip_address': state('192.0.2.1'),
      'sensor.plant_moisture': state('18'),
      'climate.living_ac': state('off'),
      'vacuum.robot': state('docked'),
      'automation.morning': state('on'),
    },
    entities: { 'sensor.tv_ip_address': { entity_category: 'diagnostic' } },
  };
  assert.deepEqual(
    searchEntities(hass, '').map(match => match.entityId),
    ['climate.living_ac', 'media_player.tv', 'vacuum.robot', 'sensor.plant_moisture', 'sensor.tv_ip_address'],
  );
  // Diagnostics stay reachable by searching, after the real device.
  assert.deepEqual(
    searchEntities(hass, 'tv').map(match => match.entityId),
    ['media_player.tv', 'sensor.tv_ip_address'],
  );
  // An explicit domain list still wins over the default exclusions.
  assert.deepEqual(
    searchEntities(hass, '', ['update']).map(match => match.entityId),
    ['update.terminal_update'],
  );
});
