import { openCardMenu } from '../browser/shell-helpers.mjs';
import { test, expect } from '@playwright/test';

// Synthetic stand-in for custom_components/homemanager. It mirrors the websocket
// contract exercised against real Home Assistant in tests/integration/test_init.py:
// revision checks, admin-only writes, home_not_found and revision events.
async function setup(page) {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(() => {
    const { hass, original } = window.testHarness;
    const homes = new Map(),
      listeners = new Map(),
      retained = new Set(['deleted-home']),
      calls = [];
    const v2 = configuration => ({
      ...structuredClone(configuration),
      schemaVersion: 2,
      rooms: [
        { id: 'living', label: 'Espacio A' },
        { id: 'kitchen', label: 'Espacio B' },
        { id: 'office', label: 'Espacio C' },
      ],
      catalog: { ...structuredClone(configuration.catalog), schemaVersion: 2 },
    });
    const summary = (id, home) => ({
      home_id: id,
      title: home.title,
      revision: home.revision,
      updated_at: '2026-10-29T00:00:00+00:00',
      plan_sha256: 'x',
      rooms: home.configuration.rooms.length,
      devices: home.configuration.catalog.devices.length,
    });
    const fail = (code, message) => Object.assign(new Error(message), { code, message });
    const notify = (id, revision) =>
      (listeners.get(id) ?? []).forEach(listener => listener({ home_id: id, revision, deleted: revision === null }));
    const server = {
      homes,
      calls,
      retained,
      /** The drawing file kept in the config folder, and the last version settled per home. */
      file: null,
      seen: new Map(),
      base: v2(original.configuration),
      put(id, configuration, title = null) {
        const revision = (homes.get(id)?.revision ?? 0) + 1;
        homes.set(id, { configuration: structuredClone(configuration), title, revision });
        notify(id, revision);
        return revision;
      },
    };
    const lovelace = hass.callWS.bind(hass);
    hass.config = { components: ['homemanager', 'lovelace'] };
    hass.callWS = async message => {
      if (!message.type.startsWith('homemanager/')) return lovelace(message);
      calls.push(structuredClone(message));
      const home = homes.get(message.home_id);
      switch (message.type) {
        case 'homemanager/storage/status':
          if (!hass.user.is_admin) throw fail('unauthorized', 'Unauthorized');
          return { bytes: 1024, retained_home_ids: [...retained] };
        case 'homemanager/history/purge':
          if (!hass.user.is_admin) throw fail('unauthorized', 'Unauthorized');
          if (message.confirm !== true || homes.has(message.home_id)) throw fail('home_in_use', 'Home is active');
          retained.delete(message.home_id);
          return {};
        case 'homemanager/plan/linked': {
          if (!hass.user.is_admin) throw fail('unauthorized', 'Unauthorized');
          const common = {
            path: `/config/homemanager/${message.home_id}.svg`,
            seen_sha256: server.seen.get(message.home_id) ?? null,
          };
          if (!server.file) return { ...common, state: 'missing' };
          const { content, ...about } = server.file;
          return { ...common, state: 'ready', ...about, ...(message.content ? { content } : {}) };
        }
        case 'homemanager/plan/linked/seen':
          if (!hass.user.is_admin) throw fail('unauthorized', 'Unauthorized');
          server.seen.set(message.home_id, message.sha256);
          return null;
        case 'homemanager/homes':
          return { homes: [...homes].map(([id, item]) => summary(id, item)) };
        case 'homemanager/home/get':
          if (!home) throw fail('home_not_found', 'unknown home');
          return { ...summary(message.home_id, home), configuration: structuredClone(home.configuration) };
        case 'homemanager/home/save': {
          if (!hass.user.is_admin) throw fail('unauthorized', 'Unauthorized');
          if ((home?.revision ?? null) !== message.expected_revision)
            throw fail('revision_conflict', `revision:${home?.revision ?? null}`);
          server.put(message.home_id, message.configuration, message.title ?? home?.title ?? null);
          return summary(message.home_id, homes.get(message.home_id));
        }
      }
      throw fail('unknown_command', message.type);
    };
    hass.connection.subscribeMessage = async (callback, message) => {
      const set = listeners.get(message.home_id) ?? new Set();
      set.add(callback);
      listeners.set(message.home_id, set);
      return () => set.delete(callback);
    };
    window.homeServer = server;
  });
}
const card = page => page.locator('homemanager-card').first();

test('New home can be cancelled or left through Plan without losing the previous home or its draft', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    window.homeServer.put('casa', window.homeServer.base, 'Casa de prueba');
    const app = document.createElement('homemanager-app');
    document.querySelector('#mount').replaceChildren(app);
    app.hass = window.testHarness.hass;
  });
  const app = page.locator('homemanager-app');
  const homeCard = app.locator('homemanager-card');
  await openCardMenu(page);
  await homeCard.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await homeCard.getByRole('button', { name: 'Luz de prueba', exact: true }).click();
  await homeCard.getByLabel('Nombre del dispositivo', { exact: true }).fill('Borrador conservado');
  await homeCard.getByRole('button', { name: 'Guardar dispositivo', exact: true }).click();
  await page.evaluate(() => {
    window.previousHomeCard = document.querySelector('homemanager-app').shadowRoot.querySelector('homemanager-card');
  });
  for (const exit of ['Cancelar', 'Plano']) {
    await openCardMenu(page);
    await app.getByRole('button', { name: 'Nuevo hogar', exact: true }).click();
    await expect(app.getByLabel('Nombre del hogar', { exact: true })).toBeVisible();
    await app.getByLabel('Nombre del hogar', { exact: true }).fill('sin-crear');
    await expect(homeCard).toBeHidden();
    if (exit === 'Plano') await openCardMenu(page);
    await app.getByRole('button', { name: exit, exact: true }).click();
    await expect(app.getByLabel('Nombre del hogar', { exact: true })).toBeHidden();
    await expect(homeCard).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.querySelector('homemanager-app').shadowRoot.querySelector('homemanager-card') ===
          window.previousHomeCard,
      ),
    ).toBe(true);
    expect(await homeCard.evaluate(el => el.getDraftConfiguration().catalog.devices[0].display.label)).toBe(
      'Borrador conservado',
    );
  }
  expect(await page.evaluate(() => window.homeServer.homes.has('sin-crear'))).toBe(false);
});

test("an integration-backed card loads its home and follows other editors' revisions", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    window.homeServer.put('casa', window.homeServer.base, 'Casa');
    window.testHarness.card.setConfig({ type: 'custom:homemanager-card', card_id: 'plano', home_id: 'casa' });
  });
  await expect(card(page).getByRole('button', { name: 'Luz de prueba', exact: true })).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Encuadrar Espacio B', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const next = structuredClone(window.homeServer.base);
    next.catalog.devices[0].display.label = 'Luz renombrada';
    window.homeServer.put('casa', next);
  });
  await expect(card(page).getByRole('button', { name: 'Luz renombrada', exact: true })).toBeVisible();
  // The dashboard never receives the plan: only the reference lives in Lovelace.
  expect(
    await page.evaluate(() => window.testHarness.wsCalls.filter(call => call.type === 'lovelace/config/save').length),
  ).toBe(0);
});

test('saving goes through the revision check and a conflict keeps the draft', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    window.homeServer.put('casa', window.homeServer.base);
    window.testHarness.card.setConfig({ type: 'custom:homemanager-card', card_id: 'plano', home_id: 'casa' });
  });
  await openCardMenu(page);
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card(page).getByRole('button', { name: 'Luz de prueba', exact: true }).click();
  await card(page).getByLabel('Nombre del dispositivo', { exact: true }).fill('Luz guardada');
  await card(page).getByRole('button', { name: 'Guardar dispositivo', exact: true }).click();
  await card(page).getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(card(page).locator('.shell > .status')).toContainText('Guardado en Home Assistant');
  const saved = await page.evaluate(() => ({
    revision: window.homeServer.homes.get('casa').revision,
    label: window.homeServer.homes.get('casa').configuration.catalog.devices[0].display.label,
    expected: window.homeServer.calls
      .filter(call => call.type === 'homemanager/home/save')
      .map(call => call.expected_revision),
  }));
  expect(saved).toEqual({ revision: 2, label: 'Luz guardada', expected: [1] });

  // Another editor saves while this draft is open (saving the sheet closed it).
  await card(page).getByRole('button', { name: 'Luz guardada', exact: true }).click();
  await card(page).getByLabel('Nombre del dispositivo', { exact: true }).fill('Mi versión');
  await card(page).getByRole('button', { name: 'Guardar dispositivo', exact: true }).click();
  await page.evaluate(() => {
    const other = structuredClone(window.homeServer.homes.get('casa').configuration);
    other.catalog.devices[0].display.label = 'Versión remota';
    window.homeServer.put('casa', other);
  });
  await expect(card(page).locator('.shell > .status')).toContainText('Otro editor guardó cambios');
  await card(page).getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(card(page).locator('.shell > .status')).toContainText('revisión 3');
  expect(
    await page.evaluate(() => window.homeServer.homes.get('casa').configuration.catalog.devices[0].display.label),
  ).toBe('Versión remota');
  expect(
    await page.evaluate(() => window.testHarness.card.getDraftConfiguration().catalog.devices[0].display.label),
  ).toBe('Mi versión');
});

test('a missing home is created by the first administrator save', async ({ page }) => {
  await setup(page);
  await page.evaluate(() =>
    window.testHarness.card.setConfig({ type: 'custom:homemanager-card', card_id: 'plano', home_id: 'nueva' }),
  );
  await expect(card(page).locator('.shell > .status')).toContainText('todavía no existe');
  await openCardMenu(page);
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await expect(card(page).locator('.shell > .status')).toContainText('se creará');
  await card(page).getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
  await card(page).getByText('Importar y exportar', { exact: true }).click();
  await page.evaluate(async () => {
    const editor = window.testHarness.card.shadowRoot.querySelector('homemanager-editor');
    const input = editor.shadowRoot.querySelector('#import-file'),
      file = new File([JSON.stringify(window.homeServer.base)], 'casa.json', { type: 'application/json' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // The empty document's viewBox differs from the imported one: a backup comes first.
  const download = page.waitForEvent('download');
  await card(page).getByRole('button', { name: 'Exportar copia actual', exact: true }).click();
  await download;
  await card(page).getByRole('button', { name: 'Aplicar importación al borrador', exact: true }).click();
  await card(page)
    .getByRole('dialog', { name: 'Ajustes del plano' })
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click();
  await card(page).getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(card(page).locator('.shell > .status')).toContainText('Guardado en Home Assistant');
  expect(
    await page.evaluate(() => ({
      revision: window.homeServer.homes.get('nueva').revision,
      expected: window.homeServer.calls.find(call => call.type === 'homemanager/home/save').expected_revision,
    })),
  ).toEqual({ revision: 1, expected: null });
});

test('the card editor moves an inline plan into the integration and keeps only the reference', async ({ page }) => {
  await setup(page);
  const events = await page.evaluate(async () => {
    await import('/.work/editor/index.js');
    const editor = document.createElement('homemanager-editor'),
      events = [];
    editor.setConfig(structuredClone(window.testHarness.original));
    editor.hass = window.testHarness.hass;
    editor.addEventListener('config-changed', event => events.push(structuredClone(event.detail.config)));
    document.querySelector('#mount').replaceChildren(editor);
    window.migrationEvents = events;
    return events.length;
  });
  expect(events).toBe(0);
  const editor = page.locator('homemanager-editor');
  await editor.getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
  await editor.locator('summary').filter({ hasText: 'Mover a la integración HomeManager' }).click();
  await editor.getByLabel('ID del hogar', { exact: true }).fill('casa');
  await editor.getByRole('button', { name: 'Mover a la integración', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('Pulsá Guardar');
  const result = await page.evaluate(() => ({
    events: window.migrationEvents,
    home: window.homeServer.homes.get('casa'),
  }));
  expect(result.events.at(-1)).toEqual({
    type: 'custom:homemanager-card',
    card_id: 'synthetic-card',
    home_id: 'casa',
    title: 'HomeManager',
  });
  expect(result.home.revision).toBe(1);
  expect(result.home.configuration.schemaVersion).toBe(2);
  expect(result.home.configuration.rooms[0]).toEqual({ id: 'living', label: 'Espacio A' });
  // The compact editor now shows the reference, not the plan.
  await expect(editor.getByLabel('Hogar', { exact: true })).toHaveValue('casa');
  // An existing home is never overwritten by a migration.
  await page.evaluate(() => {
    const editor = document.querySelector('homemanager-editor');
    editor.setConfig(structuredClone(window.testHarness.original));
  });
  // The section stays open across re-renders.
  await editor.getByLabel('ID del hogar', { exact: true }).fill('casa');
  await editor.getByRole('button', { name: 'Mover a la integración', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('Ya existe un hogar');
  expect(await page.evaluate(() => window.homeServer.homes.get('casa').revision)).toBe(1);
});

test('the sidebar panel lists homes, lets an administrator start one and hosts the card', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    await customElements.whenDefined('homemanager-app');
    const app = document.createElement('homemanager-app');
    app.narrow = true;
    document.querySelector('#mount').replaceChildren(app);
    app.hass = window.testHarness.hass;
    window.app = app;
  });
  const app = page.locator('homemanager-app');
  await expect(app.getByText('Todavía no hay hogares')).toBeVisible();
  await app.getByLabel('Nombre del hogar', { exact: true }).fill('mi-casa');
  await app.getByRole('button', { name: 'Crear hogar', exact: true }).click();
  await expect(app.locator('homemanager-card').locator('.shell > .status')).toContainText(
    '«mi-casa» todavía no existe',
  );
  // A home created elsewhere appears after a refresh, with the remembered choice.
  await page.evaluate(() => {
    window.homeServer.put('mi-casa', window.homeServer.base, 'Mi casa');
    window.homeServer.put('otra', window.homeServer.base, 'Otra');
    const app = document.createElement('homemanager-app');
    document.querySelector('#mount').replaceChildren(app);
    app.hass = window.testHarness.hass;
  });
  await expect(app.locator('homemanager-card').locator('h1')).toHaveText('Mi casa');
  await openCardMenu(page);
  await expect(app.getByLabel('Hogar', { exact: true })).toHaveValue('mi-casa');
  await expect(
    app.locator('homemanager-card').getByRole('button', { name: 'Luz de prueba', exact: true }),
  ).toBeVisible();
  const toggled = page.evaluate(
    () => new Promise(resolve => document.addEventListener('hass-toggle-menu', () => resolve(true), { once: true })),
  );
  await page.evaluate(() => {
    document.querySelector('homemanager-app').narrow = true;
  });
  await openCardMenu(page);
  await app.getByRole('button', { name: 'Menú de Home Assistant', exact: true }).click();
  expect(await toggled).toBe(true);
});

test('storage maintenance requires explicit confirmation before purging retained history', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const app = document.createElement('homemanager-app');
    document.querySelector('#mount').replaceChildren(app);
    app.hass = window.testHarness.hass;
  });
  const app = page.locator('homemanager-app');
  await openCardMenu(page);
  await app.getByRole('button', { name: 'Almacenamiento', exact: true }).click();
  const dialog = app.getByRole('dialog');
  await expect(dialog.getByText('deleted-home', { exact: false })).toBeVisible();
  page.once('dialog', confirmation => confirmation.dismiss());
  await dialog.getByRole('button', { name: 'Eliminar historial', exact: true }).click();
  expect(await page.evaluate(() => window.homeServer.retained.has('deleted-home'))).toBe(true);
  page.once('dialog', confirmation => confirmation.accept());
  await dialog.getByRole('button', { name: 'Eliminar historial', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Eliminar historial', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.homeServer.retained.has('deleted-home'))).toBe(false);
});

// Synthetic drawings: the same plan with a mark that changes no zone, and without a zone.
const decorated = () =>
  window.homeServer.base.architecture.content.replace(
    '</svg>',
    '<rect x="1" y="1" width="2" height="2" fill="#abcdef"/></svg>',
  );
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const openHome = async page => {
  await setup(page);
  await page.evaluate(() => {
    window.homeServer.put('casa', window.homeServer.base, 'Casa');
    window.testHarness.card.setConfig({ type: 'custom:homemanager-card', card_id: 'plano', home_id: 'casa' });
  });
  await expect(card(page).getByRole('button', { name: 'Luz de prueba', exact: true })).toBeVisible();
};
/** The panel looks once a minute; a test does not wait for it. */
const look = page => page.evaluate(() => window.testHarness.card.checkLinkedPlan(true));
const putFile = (page, sha, change) =>
  page.evaluate(
    ([sha, change]) => {
      const content = new Function('plan', change)(window.homeServer.base.architecture.content);
      window.homeServer.file = {
        content,
        sha256: sha,
        bytes: content.length,
        modified_at: '2026-10-31T00:00:00+00:00',
      };
    },
    [sha, change],
  );
const stored = page => page.evaluate(() => window.homeServer.homes.get('casa'));
const seen = page => page.evaluate(() => window.homeServer.seen.get('casa') ?? null);
const note = page => card(page).locator('.linked-note');
const DECORATE = `return plan.replace('</svg>', '<rect x="1" y="1" width="2" height="2" fill="#abcdef"/></svg>');`;
const NO_ZONE = `return plan.replace(/id="room-office"/, 'id="part-office"');`;
const BIGGER = `return plan.replace(/viewBox="[^"]+"/, 'viewBox="0 0 3000 3000"');`;

test('a new drawing that changes no space applies by itself, once, and one tap undoes it', async ({ page }) => {
  await openHome(page);
  const before = (await stored(page)).configuration;
  await look(page);
  await expect(note(page)).toBeHidden();
  await putFile(page, SHA_A, DECORATE);
  await look(page);
  await expect(note(page)).toContainText('se actualizó desde su archivo');
  const applied = await stored(page);
  expect(applied.revision).toBe(2);
  expect(applied.configuration.architecture.content).toContain('abcdef');
  expect(applied.configuration.catalog.devices).toEqual(before.catalog.devices);
  expect(await seen(page)).toBe(SHA_A);
  await expect(card(page).locator('.architecture')).toBeVisible();
  // The same file is not applied again.
  await look(page);
  expect((await stored(page)).revision).toBe(2);
  await note(page).getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(note(page)).toBeHidden();
  expect((await stored(page)).configuration.architecture.content).not.toContain('abcdef');
  expect((await stored(page)).revision).toBe(3);
  // Undone means undone: the file stays there, and is not applied over it.
  await look(page);
  expect((await stored(page)).revision).toBe(3);
  await expect(note(page)).toBeHidden();
});

for (const [name, change] of [
  ['takes a space away', NO_ZONE],
  ['changes the coordinates', BIGGER],
]) {
  test(`a drawing that ${name} asks first, and nothing changes until it is saved`, async ({ page }) => {
    await openHome(page);
    const before = await stored(page);
    await putFile(page, SHA_A, change);
    await look(page);
    await expect(note(page)).toContainText('afecta espacios o dispositivos');
    expect(await stored(page)).toEqual(before);
    expect(await seen(page)).toBe(null);
    // Asked once per version, not once a minute.
    await look(page);
    await expect(note(page)).toHaveCount(1);
    await note(page).getByRole('button', { name: 'Ignorar esta versión', exact: true }).click();
    await expect(note(page)).toBeHidden();
    expect(await stored(page)).toEqual(before);
    expect(await seen(page)).toBe(SHA_A);
    await look(page);
    await expect(note(page)).toBeHidden();
    // A later version asks again.
    await putFile(page, SHA_B, change);
    await look(page);
    await expect(note(page)).toBeVisible();
  });
}

test('Revisar takes a conflicting drawing through the import review, and saving settles it', async ({ page }) => {
  await openHome(page);
  await putFile(page, SHA_A, NO_ZONE);
  await look(page);
  await note(page).getByRole('button', { name: 'Revisar', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Revisar cambios', exact: true });
  await expect(review).toBeVisible();
  await expect(note(page)).toBeHidden();
  await review.getByRole('button', { name: 'Importar sólo el plano', exact: true }).click();
  // Reviewed but not saved: the version is still open.
  expect(await seen(page)).toBe(null);
  await card(page).locator('homemanager-editor').getByRole('button', { name: 'Cerrar', exact: true }).click();
  await card(page).getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(card(page).locator('.shell > .status')).toContainText('Guardado');
  expect((await stored(page)).configuration.architecture.content).toContain('part-office');
  await expect.poll(() => seen(page)).toBe(SHA_A);
});

test('a file that is not a drawing changes nothing, says so, and stays closed', async ({ page }) => {
  await openHome(page);
  const before = await stored(page);
  await putFile(page, SHA_A, `return 'esto no es un dibujo';`);
  await look(page);
  await expect(note(page)).toContainText('no se pudo usar');
  expect(await stored(page)).toEqual(before);
  await note(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await look(page);
  await expect(note(page)).toBeHidden();
});

test('nobody but an administrator looks at the file, and never while editing', async ({ page }) => {
  await openHome(page);
  await putFile(page, SHA_A, DECORATE);
  await page.evaluate(() => {
    window.homeServer.calls.length = 0;
    window.testHarness.hass.user.is_admin = false;
  });
  await look(page);
  const linkedCalls = () =>
    page.evaluate(() => window.homeServer.calls.filter(call => call.type.startsWith('homemanager/plan/linked')).length);
  expect(await linkedCalls()).toBe(0);
  await page.evaluate(() => {
    window.testHarness.hass.user.is_admin = true;
  });
  await card(page).locator('.hm-menu > summary').click();
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card(page).getByRole('button', { name: 'Guardar cambios', exact: true }).waitFor();
  await look(page);
  expect(await linkedCalls()).toBe(0);
  expect((await stored(page)).revision).toBe(1);
});

test('plan settings say where the file goes and offer a version that is still open', async ({ page }) => {
  await openHome(page);
  await card(page).locator('.hm-menu > summary').click();
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card(page).getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
  const editor = card(page).locator('homemanager-editor');
  await editor.locator('[data-settings="import-section"]').click();
  const box = editor.locator('.linked-box');
  await expect(box).toContainText('/config/homemanager/casa.svg');
  await expect(box).toContainText('Todavía no hay ningún archivo');
  await putFile(page, SHA_A, NO_ZONE);
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await card(page).getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
  await editor.locator('[data-settings="import-section"]').click();
  await expect(box).toContainText('sin aplicar');
  await box.getByRole('button', { name: 'Revisar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Revisar cambios', exact: true })).toBeVisible();
});
