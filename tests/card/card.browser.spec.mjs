import { openCardMenu } from '../browser/shell-helpers.mjs';
import { chooseAnyEntity } from '../browser/device-picker-helpers.mjs';
import { test, expect } from '../browser/local-test.mjs';
import { readFile } from 'node:fs/promises';

const fixture = '/tests/browser/fixtures/card.html';
const lightLabel = 'Luz de prueba';
const fanLabel = 'Ventilador de prueba';
const action = (page, label) =>
  page.getByRole('button', {
    name:
      label === 'Guardar dispositivo'
        ? /^(Guardar dispositivo|Listo)$/
        : label === 'Cerrar'
          ? /^(Cerrar|Volver)$/
          : label,
    exact: true,
  });
// The panel opens with a long press, a secondary click or Shift+Enter on the symbol.
const openPanel = (page, label) => action(page, label).click({ button: 'right' });
const save = page => page.getByRole('button', { name: 'Guardar cambios', exact: true });
async function draft(page) {
  return page.evaluate(() => window.testHarness.card.getDraftConfiguration());
}
async function backend(page) {
  return page.evaluate(() => window.testHarness.config.configuration);
}
async function begin(page) {
  await openCardMenu(page);
  await page.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await expect(save(page)).toBeVisible();
}
async function select(page, label = lightLabel) {
  await action(page, label).click();
  for (const id of ['device-binding', 'device-controls-section']) {
    const disclosure = page.locator(`homemanager-editor #${id}`);
    if ((await disclosure.isVisible()) && !(await disclosure.evaluate(node => node.open)))
      await disclosure.locator(':scope > summary').click();
  }
}
async function setX(page, x) {
  if (
    !(await page
      .locator('homemanager-editor')
      .locator('#device-options')
      .evaluate(el => el.open))
  )
    await page.getByText('Más opciones', { exact: true }).click();
  await page.getByLabel('Posición X', { exact: true }).fill(String(x));
  await page.getByRole('button', { name: /^(Guardar dispositivo|Listo)$/, exact: true }).click();
  // Saving closes the sheet.
  await expect(page.getByRole('button', { name: /^(Guardar dispositivo|Listo)$/, exact: true })).toHaveCount(0);
}
async function drag(page, locator, dx = 35, dy = 25) {
  await locator.hover();
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + dx, bounds.y + bounds.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('homemanager-synthetic-started')) {
      localStorage.removeItem('homemanager-synthetic-dashboard');
      sessionStorage.setItem('homemanager-synthetic-started', 'yes');
    }
  });
  await page.goto(fixture);
  await page.waitForFunction(() => window.testHarnessReady === true);
});

test('primary action and native detail are separate and accepted commands do not confirm physical state', async ({
  page,
}) => {
  await action(page, lightLabel).click();
  await expect.poll(() => page.evaluate(() => window.testHarness.calls.length)).toBe(1);
  await openPanel(page, lightLabel);
  await expect(page.locator('homemanager-task-screen[open]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Control sintético' })).toBeVisible();
  expect(await page.evaluate(() => window.testHarness.calls.length)).toBe(1);
  await page.getByRole('button', { name: 'Alternar luz de prueba', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.testHarness.calls.length)).toBe(2);
  expect((await backend(page)).catalog.devices[0].state).toEqual({ value: 'unknown', confidence: 'unknown' });
  await page.keyboard.press('Escape');
  await expect(page.locator('homemanager-task-screen[open]')).not.toBeVisible();
});

test('RF fan opens a native local panel and invokes only an explicit HA script', async ({ page }) => {
  await openPanel(page, fanLabel);
  await expect(page.getByRole('heading', { name: 'Ventilador sintético' })).toBeVisible();
  await page.getByRole('button', { name: 'Ejecutar script de prueba', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.testHarness.calls.length)).toBe(1);
  const call = await page.evaluate(() => window.testHarness.calls[0]);
  expect(call.domain).toBe('script');
  expect(call.service).toBe('turn_on');
  expect(call.target?.entity_id ?? call.data.entity_id).toEqual('script.synthetic_fan');
  expect((await backend(page)).catalog.devices[1].state.confidence).toBe('unknown');
});

test('dragging an editable marker highlights Save and persists a shared unknown-state document', async ({ page }) => {
  await begin(page);
  const before = (await draft(page)).catalog.devices[0];
  await drag(page, action(page, lightLabel));
  await expect(save(page)).toHaveAttribute('data-dirty', 'true');
  await expect(save(page)).toBeEnabled();
  const after = (await draft(page)).catalog.devices[0];
  expect(after.position).not.toEqual(before.position);
  expect(after.bindings).toEqual(before.bindings);
  await save(page).click();
  await expect(save(page)).toHaveAttribute('data-dirty', 'false');
  expect((await backend(page)).catalog.devices[0].position).toEqual(after.position);
  expect(
    (await backend(page)).catalog.devices.every(d => d.state.value === 'unknown' && d.state.confidence === 'unknown'),
  ).toBe(true);
  expect(await page.evaluate(() => window.testHarness.dashboard.views[0].cards[1])).toEqual({
    type: 'markdown',
    content: 'Synthetic unrelated card',
  });
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady === true);
  expect((await page.evaluate(() => window.testHarness.card.getConfiguration())).catalog.devices[0].position).toEqual(
    after.position,
  );
});

test('fixed devices require the explicit correction action before dragging', async ({ page }) => {
  await begin(page);
  await select(page, fanLabel);
  const before = (await draft(page)).catalog.devices[1];
  await page
    .locator('homemanager-editor')
    .getByRole('button', { name: /^(Cerrar|Volver)$/, exact: true })
    .click();
  await drag(page, action(page, fanLabel), 25, 15);
  expect((await draft(page)).catalog.devices[1].position).toEqual(before.position);
  await select(page, fanLabel);
  await page.getByText('Más opciones', { exact: true }).click();
  await page.getByRole('button', { name: 'Corregir ubicación fija', exact: true }).click();
  await page
    .locator('homemanager-editor')
    .getByRole('button', { name: /^(Cerrar|Volver)$/, exact: true })
    .click();
  await drag(page, action(page, fanLabel), 25, 15);
  const after = (await draft(page)).catalog.devices[1];
  expect(after.position).not.toEqual(before.position);
  expect(after.id).toBe(before.id);
  expect(after.bindings).toEqual(before.bindings);
  expect(after.mobility).toBe('fixed');
});

test('numeric edits, undo, redo and discard preserve associations', async ({ page }) => {
  await begin(page);
  await select(page);
  const before = (await draft(page)).catalog.devices[0];
  await setX(page, 0.39);
  expect((await draft(page)).catalog.devices[0].position.x).toBe(0.39);
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  expect((await draft(page)).catalog.devices[0].position.x).toBe(before.position.x);
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click();
  expect((await draft(page)).catalog.devices[0].position.x).toBe(0.39);
  await page.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
  await page
    .getByRole('dialog', { name: '¿Descartar los cambios?' })
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click();
  await expect.poll(async () => (await draft(page)).catalog.devices[0]).toEqual(before);
  expect(await page.evaluate(() => window.testHarness.calls.length)).toBe(0);
});

test('entity, action, source and native panel bindings are edited as drafts without physical calls', async ({
  page,
}) => {
  await begin(page);
  await select(page);
  await page.getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
  await page.getByText('Acciones lógicas', { exact: true }).click();
  await page.getByLabel('ID de acción', { exact: true }).fill('synthetic-spare-toggle');
  await page.getByLabel('Dominio', { exact: true }).selectOption('light');
  await page.getByLabel('Servicio', { exact: true }).selectOption('toggle');
  await page.getByLabel('Destinos de la acción', { exact: true }).fill('light.synthetic_spare');
  await page.getByRole('button', { name: 'Aplicar acción', exact: true }).click();
  await page.getByText('Paneles nativos', { exact: true }).click();
  await page.getByRole('button', { name: 'Agregar control', exact: true }).click();
  await page.getByLabel('ID de panel', { exact: true }).fill('synthetic-spare-panel');
  await page.getByLabel('Título del panel', { exact: true }).fill('Panel de prueba adicional');
  await page.getByLabel('ID de control 1', { exact: true }).fill('spare-toggle');
  await page.getByLabel('Nombre de control 1', { exact: true }).fill('Alternar adicional');
  await page.getByLabel('Acción de control 1', { exact: true }).selectOption('synthetic-spare-toggle');
  await page.getByRole('button', { name: 'Aplicar panel', exact: true }).click();
  await page
    .getByRole('region', { name: 'Ajustes del plano' })
    .getByRole('button', { name: /^(Cerrar|Volver)$/, exact: true })
    .click();
  await select(page);
  await page.getByText('Más opciones', { exact: true }).click();
  await chooseAnyEntity(page, 'light.synthetic_spare');
  const sheet = page.locator('homemanager-editor');
  await sheet.getByRole('button', { name: 'Pulsador', exact: true }).click();
  await sheet.getByLabel('Acción de Pulsador', { exact: true }).selectOption('synthetic-spare-toggle');
  await sheet.getByLabel('Al tocar el símbolo', { exact: true }).selectOption({ label: 'Pulsador' });
  await page.getByLabel('Panel nativo', { exact: true }).selectOption('synthetic-spare-panel');
  await page.getByRole('button', { name: /^(Guardar dispositivo|Listo)$/, exact: true }).click();
  // Saving closed the sheet; "Más opciones" stays open when it is opened again.
  await select(page);
  await page.getByText('Fuente de estado', { exact: true }).click();
  await page.getByLabel('Entidad de estado', { exact: true }).fill('light.synthetic_spare');
  await page.getByLabel('Tipo de lectura', { exact: true }).selectOption('optimistic');
  await page.getByRole('button', { name: 'Aplicar fuente', exact: true }).click();
  const d = (await draft(page)).catalog.devices[0];
  expect(d.bindings.entityId).toBe('light.synthetic_spare');
  expect(d.bindings.primaryAction).toBe('synthetic-spare-toggle');
  expect(d.bindings.advancedPopupId).toBe('synthetic-spare-panel');
  expect((await draft(page)).actions[d.bindings.primaryAction].target.entity_id).toBe('light.synthetic_spare');
  expect((await draft(page)).stateSources[d.id].entityId).toBe('light.synthetic_spare');
  // Defining another action does not silently retarget the reusable original.
  expect((await draft(page)).actions['synthetic-light-toggle'].target.entity_id).toBe('light.synthetic_light');
  expect(await page.evaluate(() => window.testHarness.calls.length)).toBe(0);
  await save(page).click();
  await expect(save(page)).toHaveAttribute('data-dirty', 'false');
});

test('new unbound icons can be added and removed entirely through the editor', async ({ page }) => {
  await begin(page);
  await page.getByRole('button', { name: 'Agregar dispositivo', exact: true }).click();
  await page.getByRole('button', { name: 'Dispositivo vacío', exact: true }).click();
  await page.getByText('Más opciones', { exact: true }).click();
  await page.getByLabel('Nombre del dispositivo', { exact: true }).fill('Icono sintético adicional');
  await page.getByLabel('ID del dispositivo', { exact: true }).fill('synthetic-added');
  await page.getByRole('button', { name: /^(Guardar dispositivo|Listo)$/, exact: true }).click();
  await expect
    .poll(async () => Boolean((await draft(page)).catalog.devices.find(d => d.id === 'synthetic-added')))
    .toBe(true);
  const added = (await draft(page)).catalog.devices.find(d => d.id === 'synthetic-added');
  // Without controls a tap opens its panel, said explicitly by tap: null.
  expect(added.bindings).toEqual({ entityId: null, primaryAction: null, advancedPopupId: null, tap: null });
  expect(added.state).toEqual({ value: 'unknown', confidence: 'unknown' });
  await page.keyboard.press('Escape');
  await action(page, 'Icono sintético adicional').click();
  await page.getByRole('button', { name: 'Eliminar dispositivo', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect.poll(async () => (await draft(page)).catalog.devices.some(d => d.id === 'synthetic-added')).toBe(false);
  expect(await page.evaluate(() => window.testHarness.calls.length)).toBe(0);
});

test('a rejected HA save keeps the draft and does not report a shared success', async ({ page }) => {
  await begin(page);
  await select(page);
  await setX(page, 0.37);
  await page.evaluate(() => (window.testHarness.flags.failSave = true));
  await save(page).click();
  await expect
    .poll(() => page.evaluate(() => window.testHarness.wsCalls.filter(m => m.type === 'lovelace/config/save').length))
    .toBe(1);
  await expect(save(page)).toHaveAttribute('data-dirty', 'true');
  expect((await draft(page)).catalog.devices[0].position.x).toBe(0.37);
  expect((await backend(page)).catalog.devices[0].position.x).toBe(0.25);
});

test('remote changes are not overwritten or retried automatically', async ({ page }) => {
  await begin(page);
  await select(page);
  await setX(page, 0.38);
  await page.evaluate(() =>
    window.testHarness.mutateRemote(d => {
      d.views[0].cards[0].configuration.catalog.devices[0].position.x = 0.28;
    }),
  );
  await save(page).click();
  await expect(save(page)).toHaveAttribute('data-dirty', 'true');
  expect((await draft(page)).catalog.devices[0].position.x).toBe(0.38);
  expect((await backend(page)).catalog.devices[0].position.x).toBe(0.28);
  expect(
    await page.evaluate(() => window.testHarness.wsCalls.filter(m => m.type === 'lovelace/config/save').length),
  ).toBe(0);
});

test('nonadministrators cannot save through a local fallback', async ({ page }) => {
  await page.evaluate(() => window.testHarness.setAdmin(false));
  await openCardMenu(page);
  const edit = page.getByRole('button', { name: 'Editar plano', exact: true });
  await expect(edit).toHaveCount(0);
  await expect(save(page)).toBeHidden();
  expect(
    await page.evaluate(() => window.testHarness.wsCalls.filter(m => m.type === 'lovelace/config/save').length),
  ).toBe(0);
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter(k => k !== 'homemanager-synthetic-dashboard')),
  ).toEqual([]);
});

test('YAML dashboards remain read only', async ({ page }) => {
  await page.evaluate(() => window.testHarness.setMode('yaml'));
  await openCardMenu(page);
  const edit = page.getByRole('button', { name: 'Editar plano', exact: true });
  if (await edit.isEnabled()) {
    await edit.click();
    await expect(save(page)).toBeHidden();
    await expect(page.getByRole('status')).toContainText(/YAML/);
  } else await expect(edit).toBeDisabled();
  expect(
    await page.evaluate(() => window.testHarness.wsCalls.filter(m => m.type === 'lovelace/config/save').length),
  ).toBe(0);
});

test('room framing and layers work with a nonzero global viewBox', async ({ page }) => {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const before = await action(page, fanLabel).boundingBox();
  await page.getByRole('button', { name: 'Encuadrar Espacio B', exact: true }).click();
  await expect
    .poll(async () => {
      const after = await action(page, fanLabel).boundingBox();
      return after ? Math.hypot(after.x - before.x, after.y - before.y) : 0;
    })
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Encuadrar todo', exact: true }).click();
  const sensors = page.getByRole('button', { name: 'Sensores', exact: true });
  await sensors.click();
  await expect(action(page, 'Temperatura de prueba')).not.toBeVisible();
  await sensors.click();
  await expect(action(page, 'Temperatura de prueba')).toBeVisible();
});

test('native panels support keyboard opening, Escape and return focus', async ({ page }) => {
  const button = action(page, lightLabel);
  await button.focus();
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('homemanager-task-screen[open]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('homemanager-task-screen[open]')).not.toBeVisible();
  await expect(button).toBeFocused();
});

test('a pending reference is disabled without making unrelated configured controls unusable', async ({ page }) => {
  await page.evaluate(() => {
    const config = window.testHarness.config;
    config.configuration.catalog.devices[1].bindings.primaryAction = 'pending-action';
    window.testHarness.card.setConfig(config);
    window.testHarness.card.hass = window.testHarness.hass;
  });
  await expect(action(page, fanLabel)).toBeDisabled();
  await expect(action(page, lightLabel)).toBeEnabled();
  await action(page, lightLabel).click();
  await expect.poll(() => page.evaluate(() => window.testHarness.calls.length)).toBe(1);
});

test('runtime source labels alone do not confirm feedback and commands expire without mutating configuration', async ({
  page,
}) => {
  await page.evaluate(() => {
    const c = window.testHarness.config;
    c.configuration.stateSources['synthetic-light'].feedback = 'measured';
    window.testHarness.card.setConfig(c);
    window.testHarness.card.hass = window.testHarness.hass;
  });
  const marker = page.locator('homemanager-card').locator('[data-id="synthetic-light"]');
  await expect(marker).toHaveAttribute('data-confidence', 'estimated');
  await action(page, lightLabel).click();
  await expect(marker).toHaveAttribute('data-confidence', 'sent');
  await expect(marker).toHaveAttribute('data-confidence', 'unknown', { timeout: 5000 });
  const configuration = await page.evaluate(() => window.testHarness.card.getConfiguration());
  expect(configuration.catalog.devices[0].state).toEqual({ value: 'unknown', confidence: 'unknown' });
  expect(Object.keys(configuration)).not.toContain('runtime');
  expect(JSON.stringify(configuration)).not.toContain('issuedAt');
  expect(JSON.stringify(configuration)).not.toContain('baselineLastUpdated');
});

test('keyboard movement stays normalized and undo restores the previous persistent draft', async ({ page }) => {
  await begin(page);
  const before = (await draft(page)).catalog.devices[0];
  await action(page, lightLabel).focus();
  await page.keyboard.press('ArrowRight');
  expect((await draft(page)).catalog.devices[0].position.x).toBeCloseTo(before.position.x + 0.002, 5);
  expect((await draft(page)).catalog.devices[0].bindings).toEqual(before.bindings);
  await page.keyboard.press('Control+z');
  expect((await draft(page)).catalog.devices[0].position).toEqual(before.position);
});

test('editor export contains durable configuration only and import waits for a review', async ({ page }) => {
  await begin(page);
  await page.getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
  await page.getByText('Importar y exportar', { exact: true }).click();
  await page.evaluate(() => {
    const create = URL.createObjectURL;
    URL.createObjectURL = blob => {
      window.exportedJson = blob.text();
      return create.call(URL, blob);
    };
  });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar JSON', exact: true }).click();
  const download = await downloading;
  // Verify the actual Blob given to the browser, including hosts that cancel
  // writing downloads to disk. The download event still has to occur.
  const content = JSON.parse(await page.evaluate(() => window.exportedJson));
  expect(content.catalog.devices.every(d => d.state.value === 'unknown' && d.state.confidence === 'unknown')).toBe(
    true,
  );
  expect(Object.keys(content)).toEqual(
    expect.arrayContaining(['schemaVersion', 'catalog', 'architecture', 'actions', 'panels', 'stateSources']),
  );
  expect(Object.hasOwn(content, 'runtime')).toBe(false);
  content.catalog.devices[0].display.label = 'Etiqueta importada sintética';
  await page.getByLabel('Importar JSON o SVG', { exact: true }).setInputFiles({
    name: 'synthetic-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(content)),
  });
  await expect(page.getByRole('heading', { name: 'Resumen de importación' })).toBeVisible();
  expect((await draft(page)).catalog.devices[0].display.label).toBe(lightLabel);
  // Nothing is lost by that file: it needs no warning and no copy first.
  await expect(page.locator('homemanager-editor .import-losses')).toHaveCount(0);
  await page.getByRole('button', { name: 'Aplicar importación al borrador', exact: true }).click();
  expect((await draft(page)).catalog.devices[0].display.label).toBe('Etiqueta importada sintética');
  expect((await backend(page)).catalog.devices[0].display.label).toBe(lightLabel);
  expect(await page.evaluate(() => window.testHarness.calls.length)).toBe(0);
});

test('normal and editing layouts fit the viewport without horizontal page overflow', async ({ page }) => {
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(await fits()).toBe(true);
  // Symbols are 44 px targets; their panel opens with a long press, a secondary
  // click or Shift+Enter, so no smaller badge is needed.
  const bounds = await action(page, lightLabel).boundingBox();
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  await begin(page);
  await select(page);
  await page.getByRole('button', { name: /^(Guardar dispositivo|Listo)$/, exact: true }).scrollIntoViewIfNeeded();
  expect(await fits()).toBe(true);
  const field = await page.getByRole('button', { name: 'Vincular dispositivo', exact: true }).boundingBox();
  expect(field.width).toBeGreaterThan(100);
  expect(field.x).toBeGreaterThanOrEqual(0);
  expect(field.x + field.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));
});

test('an accepted service releases its action button without waiting for command expiry', async ({ page }) => {
  await page.evaluate(() => {
    const c = window.testHarness.config;
    c.configuration.commandTtlSeconds = 30;
    window.testHarness.card.setConfig(c);
    window.testHarness.card.hass = window.testHarness.hass;
  });
  const button = action(page, lightLabel);
  await button.click();
  await expect.poll(() => page.evaluate(() => window.testHarness.calls.length)).toBe(1);
  await expect(button).toBeEnabled({ timeout: 2000 });
  await button.click();
  await expect.poll(() => page.evaluate(() => window.testHarness.calls.length)).toBe(2);
});

test('space navigation comes from the instance configuration', async ({ page }) => {
  await page.goto(fixture);
  await page.waitForFunction(() => window.testHarnessReady);
  // The harness ships a V1 document; its legacy room_labels become V2 space names.
  await expect(page.getByRole('button', { name: 'Encuadrar Espacio A', exact: true })).toHaveAttribute(
    'title',
    'Espacio A',
  );
  await page.evaluate(() => {
    const config = structuredClone(window.testHarness.config);
    const v2 = {
      ...config.configuration,
      schemaVersion: 2,
      rooms: [
        { id: 'living', label: 'Comedor' },
        { id: 'kitchen', label: 'Cocina' },
        { id: 'office', label: 'Garage' },
      ],
      catalog: { ...config.configuration.catalog, schemaVersion: 2 },
    };
    delete config.room_labels;
    window.testHarness.card.setConfig({ ...config, configuration: v2 });
  });
  const nav = page.getByRole('navigation', { name: 'Espacios' });
  expect(
    await nav.getByRole('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))),
  ).toEqual(['Encuadrar todo', 'Encuadrar Comedor', 'Encuadrar Cocina', 'Encuadrar Garage']);
  await page.getByRole('button', { name: 'Encuadrar Garage', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Encuadrar Garage', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('an old JSON cannot silently take links away or bring spaces back', async ({ page }) => {
  await begin(page);
  const before = await draft(page);
  const linked = before.catalog.devices.find(item => item.bindings.entityId);
  await page.getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
  await page.getByText('Importar y exportar', { exact: true }).click();
  const old = structuredClone(before);
  old.catalog.devices.find(item => item.id === linked.id).bindings.entityId = null;
  old.rooms.push({ id: 'cuarto-viejo', label: 'Cuarto viejo' });
  await page.getByLabel('Importar JSON o SVG', { exact: true }).setInputFiles({
    name: 'old.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(old)),
  });
  const warning = page.locator('homemanager-editor .import-losses');
  await expect(warning).toContainText('reemplaza todo el hogar');
  await expect(warning).toContainText(linked.display.label);
  await expect(warning).toContainText('Cuarto viejo');
  const apply = page.getByRole('button', { name: 'Aplicar importación al borrador', exact: true });
  await expect(apply).toBeDisabled();
  // Only with a current copy in hand.
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar copia actual', exact: true }).click();
  await downloading;
  await expect(apply).toBeEnabled();
  expect(await draft(page)).toEqual(before);
  // Cancelling leaves everything as it was.
  await page.getByRole('button', { name: 'Cancelar importación', exact: true }).click();
  expect(await draft(page)).toEqual(before);
});
