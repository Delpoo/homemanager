import test from 'node:test';
import assert from 'node:assert/strict';
import { backupKey, planFingerprint, writeBackup, readBackup, clearBackup } from '../../.work/model/draft-backup.js';

const memory = () => {
  const items = new Map();
  return {
    getItem: key => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key),
    items,
  };
};
const plan = (label = 'Luz ficticia', svg = '<svg/>') => ({
  schemaVersion: 1,
  architecture: { format: 'svg', content: svg },
  catalog: { schemaVersion: 1, devices: [{ id: 'd1', display: { label, icon: 'mdi:lightbulb' } }] },
  actions: {},
  panels: {},
  stateSources: {},
});

test('the key separates homes, cards and users', () => {
  assert.notEqual(backupKey({ homeId: 'a', userId: 'u' }), backupKey({ homeId: 'b', userId: 'u' }));
  assert.notEqual(backupKey({ homeId: 'a', userId: 'u' }), backupKey({ homeId: 'a', userId: 'v' }));
  assert.notEqual(backupKey({ cardId: 'c', dashboard: 'x' }), backupKey({ cardId: 'c', dashboard: 'y' }));
});

test('a copy round-trips, leaving out an unedited drawing', () => {
  const storage = memory();
  const saved = plan('Antes', '<svg>dibujo grande</svg>');
  const draft = plan('Después', '<svg>dibujo grande</svg>');
  assert.equal(writeBackup(storage, 'k', draft, saved, 1000), true);
  assert.equal(storage.items.get('k').includes('dibujo grande'), false);
  const back = readBackup(storage, 'k', saved);
  assert.equal(back.stale, false);
  assert.equal(back.savedAt, 1000);
  assert.deepEqual(back.draft, draft);
});

test('an edited drawing is kept, and a changed plan marks the copy as stale', () => {
  const storage = memory();
  const saved = plan('Antes', '<svg>a</svg>');
  writeBackup(storage, 'k', plan('Después', '<svg>b</svg>'), saved);
  const back = readBackup(storage, 'k', plan('Otro guardado', '<svg>a</svg>'));
  assert.equal(back.stale, true);
  assert.equal(back.draft.architecture.content, '<svg>b</svg>');
  assert.notEqual(planFingerprint(saved), planFingerprint(plan('Otro guardado', '<svg>a</svg>')));
});

test('broken, foreign or missing copies are ignored, and clearing removes them', () => {
  const storage = memory();
  storage.setItem('bad', '{not json');
  storage.setItem('old', JSON.stringify({ version: 0 }));
  assert.equal(readBackup(storage, 'bad', plan()), undefined);
  assert.equal(readBackup(storage, 'old', plan()), undefined);
  assert.equal(readBackup(storage, 'none', plan()), undefined);
  writeBackup(storage, 'k', plan('x'), plan());
  clearBackup(storage, 'k');
  assert.equal(storage.getItem('k'), null);
});

test('without storage, or when it is full, editing goes on without a copy', () => {
  assert.equal(writeBackup(undefined, 'k', plan(), plan()), false);
  assert.equal(readBackup(undefined, 'k', plan()), undefined);
  const full = {
    ...memory(),
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(writeBackup(full, 'k', plan(), plan()), false);
  assert.doesNotThrow(() =>
    clearBackup(
      {
        removeItem() {
          throw new Error('blocked');
        },
      },
      'k',
    ),
  );
});
