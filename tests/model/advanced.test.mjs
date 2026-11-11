import test from 'node:test';
import assert from 'node:assert/strict';
import { homeStatus } from '../../.work/model/home-status.js';

test('an action nothing names any more shows in Home status, ready to be removed', () => {
  const configuration = {
    catalog: {
      devices: [
        {
          id: 'lamp',
          display: { label: 'Lámpara' },
          bindings: { entityId: 'light.synthetic', controls: [{ id: 'c', steps: [{ actionId: 'used-action' }] }] },
        },
      ],
    },
    actions: { 'used-action': {}, 'old-action': {} },
  };
  const issues = homeStatus(configuration, { states: { 'light.synthetic': { state: 'on' } } });
  assert.deepEqual(
    issues.filter(issue => issue.kind === 'unused-action').map(issue => issue.actionId),
    ['old-action'],
  );
});
