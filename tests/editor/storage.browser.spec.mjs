import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(async () => {
    const { LovelaceConfigurationStore } = await import('/.work/editor/storage.js');
    let dashboard = {
      title: 'Storage test',
      views: [
        {
          title: 'Section view',
          sections: [
            {
              type: 'grid',
              cards: [
                {
                  type: 'vertical-stack',
                  cards: [structuredClone(window.testHarness.original), { type: 'markdown', content: 'Keep me' }],
                },
              ],
            },
          ],
        },
      ],
      extra: { keep: true },
    };
    const calls = [],
      flags = { failSave: false, wrongReadback: false, holdRead: false, readHook: null };
    let release;
    const hass = {
      states: {},
      user: { id: 'test-admin', is_admin: true },
      connection: { connected: true },
      panels: { lovelace: { config: { mode: 'storage' } }, 'test-dashboard': { config: { mode: 'storage' } } },
      async callWS(message) {
        calls.push(structuredClone(message));
        if (message.type === 'lovelace/config') {
          if (flags.holdRead) {
            flags.holdRead = false;
            await new Promise(resolve => {
              release = resolve;
            });
          }
          flags.readHook?.(dashboard, calls.filter(call => call.type === 'lovelace/config').length);
          return structuredClone(dashboard);
        }
        if (message.type === 'lovelace/config/save') {
          if (flags.failSave) throw new Error('Synthetic save failed');
          dashboard = structuredClone(message.config);
          if (flags.wrongReadback)
            dashboard.views[0].sections[0].cards[0].cards[0].configuration.catalog.devices[0].display.label =
              'Unexpected readback';
          return null;
        }
        throw new Error('Unexpected request');
      },
    };
    const api = {
      calls,
      flags,
      hass,
      get dashboard() {
        return dashboard;
      },
      set dashboard(value) {
        dashboard = value;
      },
      get config() {
        return dashboard.views[0].sections[0].cards[0].cards[0].configuration;
      },
      release: () => release?.(),
      create(options = {}) {
        return new LovelaceConfigurationStore(() => api.hass, { cardId: 'synthetic-card', ...options });
      },
    };
    api.store = api.create();
    window.editorStorage = api;
  });
});

test('shared store verifies save by readback, preserves unrelated fields and advances baseline', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.editorStorage,
      loaded = await h.store.load();
    h.dashboard.views[0].sections[0].cards[0].cards[1].content = 'Latest unrelated edit';
    loaded.catalog.devices[0].display.label = 'Saved label';
    await h.store.save(loaded);
    loaded.catalog.devices[0].display.label = 'Saved again';
    await h.store.save(loaded);
    return {
      label: h.config.catalog.devices[0].display.label,
      unrelated: h.dashboard.views[0].sections[0].cards[0].cards[1].content,
      extra: h.dashboard.extra,
      calls: h.calls,
    };
  });
  expect(result.label).toBe('Saved again');
  expect(result.unrelated).toBe('Latest unrelated edit');
  expect(result.extra).toEqual({ keep: true });
  expect(result.calls.map(call => call.type)).toEqual([
    'lovelace/config',
    'lovelace/config',
    'lovelace/config',
    'lovelace/config/save',
    'lovelace/config',
    'lovelace/config',
    'lovelace/config',
    'lovelace/config/save',
    'lovelace/config',
  ]);
  expect(result.calls[0]).toEqual({ type: 'lovelace/config', url_path: null, force: true });
});
test('a named storage dashboard uses its exact URL path', async ({ page }) => {
  const paths = await page.evaluate(async () => {
    const h = window.editorStorage,
      s = h.create({ dashboardPath: 'test-dashboard' }),
      c = await s.load();
    await s.save(c);
    return h.calls.map(call => call.url_path);
  });
  expect(paths).toEqual(Array(5).fill('test-dashboard'));
});
test('remote changes to this card are not overwritten, including after a failed prior save', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.editorStorage,
      c = await h.store.load();
    c.catalog.devices[0].display.label = 'My draft';
    h.flags.failSave = true;
    let failure;
    try {
      await h.store.save(c);
    } catch (error) {
      failure = error.message;
    }
    h.flags.failSave = false;
    h.config.catalog.devices[0].display.label = 'Another editor';
    let conflict;
    try {
      await h.store.save(c);
    } catch (error) {
      conflict = error.message;
    }
    return {
      failure,
      conflict,
      label: h.config.catalog.devices[0].display.label,
      writes: h.calls.filter(call => call.type === 'lovelace/config/save').length,
      draft: c.catalog.devices[0].display.label,
    };
  });
  expect(result.failure).toContain('Synthetic save failed');
  expect(result.conflict).toContain('otro editor');
  expect(result.label).toBe('Another editor');
  expect(result.writes).toBe(1);
  expect(result.draft).toBe('My draft');
});
test('changes between the two fresh dashboard reads stop the write', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.editorStorage,
      c = await h.store.load();
    h.flags.readHook = (dashboard, count) => {
      if (count === 3) dashboard.extra.keep = 'changed between reads';
    };
    let error;
    try {
      await h.store.save(c);
    } catch (e) {
      error = e.message;
    }
    return { error, writes: h.calls.filter(call => call.type === 'lovelace/config/save').length };
  });
  expect(result.error).toContain('mientras se preparaba');
  expect(result.writes).toBe(0);
});
test('administrator, verified storage mode, connection and prior load are required', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const h = window.editorStorage,
      result = [];
    async function rejected(operation) {
      try {
        await operation();
        result.push('UNEXPECTED SUCCESS');
      } catch (error) {
        result.push(error.message);
      }
    }
    await rejected(() => h.store.save(h.config));
    await h.store.load();
    h.hass.user.is_admin = false;
    await rejected(() => h.store.save(h.config));
    h.hass.user.is_admin = true;
    h.hass.panels.lovelace.config.mode = 'yaml';
    await rejected(() => h.store.save(h.config));
    h.hass.panels.lovelace.config.mode = 'unknown';
    await rejected(() => h.store.save(h.config));
    h.hass.panels.lovelace.config.mode = 'storage';
    h.hass.connection.connected = false;
    await rejected(() => h.store.save(h.config));
    return { result, writes: h.calls.filter(call => call.type === 'lovelace/config/save').length };
  });
  expect(results.result[0]).toContain('primero');
  expect(results.result[1]).toContain('administradora');
  expect(results.result[2]).toContain('YAML');
  expect(results.result[3]).toContain('comprobar');
  expect(results.result[4]).toContain('conectada');
  expect(results.writes).toBe(0);
});
test('explicit YAML mode cannot be bypassed by a storage panel declaration', async ({ page }) => {
  const error = await page.evaluate(async () => {
    const h = window.editorStorage,
      s = h.create({ dashboardMode: 'yaml' });
    await s.load();
    try {
      await s.save(h.config);
    } catch (error) {
      return error.message;
    }
  });
  expect(error).toContain('YAML');
});
test('failed disconnected load releases the busy guard and reconnect can load', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.editorStorage;
    h.hass.connection.connected = false;
    let message;
    try {
      await h.store.load();
    } catch (error) {
      message = error.message;
    }
    h.hass.connection.connected = true;
    const c = await h.store.load();
    return { message, count: c.catalog.devices.length };
  });
  expect(result.message).toContain('conectada');
  expect(result.count).toBe(3);
});
test('overlapping load and save operations are blocked while a read is pending', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.editorStorage;
    await h.store.load();
    h.flags.holdRead = true;
    const loading = h.store.load(),
      messages = [];
    for (const operation of [() => h.store.load(), () => h.store.save(h.config)])
      try {
        await operation();
      } catch (error) {
        messages.push(error.message);
      }
    h.release();
    await loading;
    return messages;
  });
  expect(result).toHaveLength(2);
  expect(result.every(message => message.includes('operación en curso'))).toBe(true);
});
test('duplicate card IDs and missing cards fail without writes; arbitrary data is not traversed', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.editorStorage,
      card = h.dashboard.views[0].sections[0].cards[0].cards[0];
    h.dashboard.extra.fakeCard = structuredClone(card);
    await h.store.load();
    h.dashboard.views[0].sections[0].cards.push(structuredClone(card));
    let duplicate;
    try {
      await h.store.load();
    } catch (error) {
      duplicate = error.message;
    }
    h.dashboard.views = [];
    let missing;
    try {
      await h.store.load();
    } catch (error) {
      missing = error.message;
    }
    return { duplicate, missing, writes: h.calls.filter(call => call.type === 'lovelace/config/save').length };
  });
  expect(result.duplicate).toContain('varias tarjetas');
  expect(result.missing).toContain('única');
  expect(result.writes).toBe(0);
});
test('changed user identity is detected even if the same hass object is mutated', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.editorStorage;
    const c = await h.store.load();
    h.hass.user.id = 'different-admin';
    let message;
    try {
      await h.store.save(c);
    } catch (error) {
      message = error.message;
    }
    return { message, writes: h.calls.filter(call => call.type === 'lovelace/config/save').length };
  });
  expect(result.message).toContain('sesión cambió');
  expect(result.writes).toBe(0);
});
test('changed session during a read prevents baseline establishment', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.editorStorage;
    h.flags.holdRead = true;
    const pending = h.store.load();
    h.hass.connection = { connected: true };
    h.release();
    let message;
    try {
      await pending;
    } catch (error) {
      message = error.message;
    }
    let saveMessage;
    try {
      await h.store.save(h.config);
    } catch (error) {
      saveMessage = error.message;
    }
    return { message, saveMessage };
  });
  expect(result.message).toContain('sesión cambió');
  expect(result.saveMessage).toContain('primero');
});
test('unexpected readback fails and does not advance the old baseline', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.editorStorage,
      c = await h.store.load();
    c.catalog.devices[0].display.label = 'Expected';
    h.flags.wrongReadback = true;
    let first, second;
    try {
      await h.store.save(c);
    } catch (error) {
      first = error.message;
    }
    h.flags.wrongReadback = false;
    try {
      await h.store.save(c);
    } catch (error) {
      second = error.message;
    }
    return { first, second, writes: h.calls.filter(call => call.type === 'lovelace/config/save').length };
  });
  expect(result.first).toContain('no confirmó');
  expect(result.second).toContain('otro editor');
  expect(result.writes).toBe(1);
});
test('pending logical references can be loaded but cannot be saved', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.editorStorage;
    h.config.catalog.devices[0].bindings.primaryAction = 'missing-action';
    const c = await h.store.load();
    let message;
    try {
      await h.store.save(c);
    } catch (error) {
      message = error.message;
    }
    return {
      message,
      ref: c.catalog.devices[0].bindings.primaryAction,
      writes: h.calls.filter(call => call.type === 'lovelace/config/save').length,
    };
  });
  expect(result.ref).toBe('missing-action');
  expect(result.message).toContain('pendiente');
  expect(result.writes).toBe(0);
});
test('a dashboard that would exceed the HA websocket frame is refused before sending', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.editorStorage;
    // Unrelated content in the same dashboard counts: Lovelace saves the whole document.
    h.dashboard.views[0].sections[0].cards[0].cards[1].content = 'x'.repeat(4 * 1024 * 1024);
    const loaded = await h.store.load();
    loaded.catalog.devices[0].display.label = 'Too big to send';
    let message = '';
    try {
      await h.store.save(loaded);
    } catch (error) {
      message = error.message;
    }
    return {
      message,
      saves: h.calls.filter(call => call.type === 'lovelace/config/save').length,
      label: h.config.catalog.devices[0].display.label,
    };
  });
  expect(result.message).toContain('4 MiB');
  expect(result.saves).toBe(0);
  expect(result.label).not.toBe('Too big to send');
});
