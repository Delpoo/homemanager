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
  await homeCard.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await homeCard.getByRole('button', { name: 'Luz de prueba', exact: true }).click();
  await homeCard.getByLabel('Nombre del dispositivo', { exact: true }).fill('Borrador conservado');
  await homeCard.getByRole('button', { name: 'Guardar dispositivo', exact: true }).click();
  await page.evaluate(() => {
    window.previousHomeCard = document.querySelector('homemanager-app').shadowRoot.querySelector('homemanager-card');
  });
  for (const exit of ['Cancelar', 'Plano']) {
    await app.getByRole('button', { name: 'Nuevo hogar', exact: true }).click();
    await expect(app.getByLabel('ID del hogar', { exact: true })).toBeVisible();
    await app.getByLabel('ID del hogar', { exact: true }).fill('sin-crear');
    await expect(homeCard).toBeHidden();
    await app.getByRole('button', { name: exit, exact: true }).click();
    await expect(app.getByLabel('ID del hogar', { exact: true })).toBeHidden();
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
  await app.getByLabel('ID del hogar', { exact: true }).fill('mi-casa');
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
  await expect(app.getByRole('heading', { name: 'Mi casa' })).toBeVisible();
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
  await app.getByRole('button', { name: 'Menú', exact: true }).click();
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
