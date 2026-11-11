import test from 'node:test';
import assert from 'node:assert/strict';
import {
  automationActionIds,
  checkPasses,
  emptyAutomation,
  fromHaConfig,
  newAutomationId,
  parseFailure,
  toHaConfig,
  triggerChips,
} from '../../.work/model/automations.js';

const actions = {
  'aire-off': { domain: 'switch', service: 'turn_off', target: { entity_id: 'switch.aire_demo' } },
  'tv-power': { domain: 'button', service: 'press', target: { entity_id: 'button.tv_demo_power' } },
};

function sleep() {
  return {
    ...emptyAutomation('homemanager_dormir', 'Dormir'),
    icon: 'mdi:weather-night',
    triggers: [{ kind: 'time', at: '23:30' }],
    steps: [
      { deviceId: 'aire', actionId: 'aire-off', sensor: 'sensor.aire_demo_power' },
      { deviceId: 'luz', entity: 'light.techo_demo', service: 'turn_off' },
    ],
    check: { compare: 'below', watts: 30, seconds: 60, retries: 3 },
    fail: { message: 'Aire sigue prendido' },
  };
}

test('an automation becomes a Home Assistant automation that keeps what HomeManager edits', () => {
  const config = toHaConfig(sleep(), actions);
  assert.equal(config.id, 'homemanager_dormir');
  assert.equal(config.alias, 'Dormir');
  assert.deepEqual(config.triggers, [{ trigger: 'time', at: '23:30:00' }]);
  // The light is not checked: it is sent once.
  const light = config.actions.at(-1);
  assert.deepEqual(light, {
    action: 'homeassistant.turn_off',
    target: { entity_id: 'light.techo_demo' },
    continue_on_error: true,
  });
  // The air conditioner is sent, waited for, and sent again up to 3 more times.
  const [repeat, verdict] = config.actions;
  assert.equal(repeat.repeat.sequence[0].action, 'switch.turn_off');
  assert.deepEqual(repeat.repeat.sequence[1].timeout, { seconds: 60 });
  assert.match(repeat.repeat.until, /repeat\.index > 3/);
  assert.match(repeat.repeat.until, /unavailable/, 'a meter without data stops resending');
  // Still on with data → the alert; otherwise the old alert goes.
  assert.equal(verdict.then[0].action, 'persistent_notification.create');
  assert.equal(verdict.then[0].data.notification_id, 'homemanager:fail:homemanager_dormir:aire');
  assert.equal(verdict.else[0].action, 'persistent_notification.dismiss');
  assert.match(verdict.if[0].value_template, /not in \['unavailable'/);
  // Read back as it was.
  assert.deepEqual(fromHaConfig(JSON.parse(JSON.stringify(config))), sleep());
});

test('a missing action is skipped, and other automations are not HomeManager ones', () => {
  const broken = { ...sleep(), steps: [{ actionId: 'gone' }] };
  assert.deepEqual(toHaConfig(broken, actions).actions, []);
  assert.equal(fromHaConfig({ id: '1699', alias: 'Mine', triggers: [], actions: [] }), null);
  assert.equal(fromHaConfig({ id: 'homemanager_x', alias: 'x' }), null);
});

test('Check reads above or below, and quotes the meter', () => {
  assert.equal(
    checkPasses("sensor.o'k", { compare: 'above', watts: 5, seconds: 10, retries: 0 }),
    "states('sensor.o\\'k') not in ['unavailable','unknown','none',''] and states('sensor.o\\'k')|float(0) > 5",
  );
});

test('ids, failures, chips and the actions automations use', () => {
  assert.equal(newAutomationId('Salir de casa'), 'homemanager_salir_de_casa');
  assert.equal(newAutomationId('Ñandú', ['homemanager_nandu']), 'homemanager_nandu_2');
  assert.equal(newAutomationId('!!!'), 'homemanager_automation');
  assert.deepEqual(
    parseFailure({ notification_id: 'homemanager:fail:homemanager_dormir:aire', title: 'Dormir', message: 'x' }),
    {
      notificationId: 'homemanager:fail:homemanager_dormir:aire',
      automationId: 'homemanager_dormir',
      deviceId: 'aire',
      title: 'Dormir',
      message: 'x',
    },
  );
  assert.equal(parseFailure({ notification_id: 'homemanager:fail:homemanager_dormir:step0' }).deviceId, null);
  assert.equal(parseFailure({ notification_id: 'other' }), null);
  const chips = triggerChips(
    { ...sleep(), triggers: [...sleep().triggers, { kind: 'below', entity: 'zone.home', value: 1 }] },
    true,
    id => (id === 'zone.home' ? 'Casa' : id),
  );
  assert.deepEqual(
    chips.map(chip => chip.text),
    ['Botón en Ahora', '23:30', 'Casa < 1'],
  );
  assert.deepEqual([...automationActionIds([sleep()])], ['aire-off']);
});
