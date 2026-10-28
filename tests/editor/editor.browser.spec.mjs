import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const editor = page => page.locator('homemanager-editor');
const field = (page, label) => editor(page).getByLabel(label, { exact: true });
const button = (page, label) => editor(page).getByRole('button', { name: label, exact: true });
async function current(page) {
  return page.evaluate(() => window.editorTest.editor.getConfiguration());
}
async function section(page, title) {
  await editor(page).locator('summary').filter({ hasText: title }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(async () => {
    await import('/.work/editor/index.js');
    const component = document.createElement('homemanager-editor'),
      events = [],
      calls = [];
    const config = structuredClone(window.testHarness.original);
    component.setConfig(config);
    component.hass = {
      ...window.testHarness.hass,
      callService(...args) {
        calls.push(args);
        throw Error('An editor may not call services');
      },
    };
    const mount = document.querySelector('#mount');
    mount.replaceChildren(component);
    mount.addEventListener('config-changed', event =>
      events.push({ bubbles: event.bubbles, composed: event.composed, config: structuredClone(event.detail.config) }),
    );
    window.editorTest = { editor: component, events, calls, original: config };
  });
});

test('add/edit a complete device emits a persistent draft without calling HA', async ({ page }) => {
  await button(page, 'Agregar icono').click();
  await field(page, 'Nombre del dispositivo').fill('Test portátil');
  await field(page, 'Tipo de dispositivo').selectOption('purifier');
  await field(page, 'Icono del dispositivo').fill('mdi:air-purifier');
  await field(page, 'Habitación del dispositivo').selectOption('office');
  await field(page, 'Movilidad del dispositivo').selectOption('portable');
  await field(page, 'Posición X').fill('0.61');
  await field(page, 'Posición Y').fill('0.73');
  await field(page, 'Entidad del dispositivo').fill('fan.not_configured_yet');
  await button(page, 'Aplicar dispositivo').click();
  const first = (await current(page)).catalog.devices.find(device => device.id === 'test-portatil');
  expect(first).toMatchObject({
    roomId: 'office',
    kind: 'purifier',
    mobility: 'portable',
    position: { x: 0.61, y: 0.73 },
    bindings: { entityId: 'fan.not_configured_yet', primaryAction: null, advancedPopupId: null },
    state: { value: 'unknown', confidence: 'unknown' },
  });
  await expect(field(page, 'ID del dispositivo')).toHaveAttribute('readonly', '');
  await field(page, 'Habitación del dispositivo').selectOption('kitchen');
  await field(page, 'Nombre del dispositivo').fill('Test cambiado');
  await button(page, 'Aplicar dispositivo').click();
  const result = await page.evaluate(() => ({ events: window.editorTest.events, calls: window.editorTest.calls }));
  expect(result.events).toHaveLength(2);
  expect(result.events.every(event => event.bubbles && event.composed)).toBe(true);
  expect(result.calls).toEqual([]);
  expect(
    result.events[1].config.configuration.catalog.devices.find(device => device.id === 'test-portatil').bindings
      .entityId,
  ).toBe('fan.not_configured_yet');
});
test('live hass updates preserve unsubmitted form values and expose actual entities', async ({ page }) => {
  await field(page, 'Nombre del dispositivo').fill('Unsubmitted label');
  await page.evaluate(() => {
    const e = window.editorTest.editor;
    e.hass = {
      ...e.hass,
      states: {
        ...e.hass.states,
        'light.new_actual_entity': { state: 'on', attributes: { friendly_name: 'New actual entity' } },
      },
    };
  });
  await expect(field(page, 'Nombre del dispositivo')).toHaveValue('Unsubmitted label');
  expect(await editor(page).locator('#entity-options option[value="light.new_actual_entity"]').count()).toBe(1);
  expect(await page.evaluate(() => window.editorTest.events.length)).toBe(0);
});
test('fixed location stays locked until explicit correction and bindings survive room correction', async ({ page }) => {
  await field(page, 'Dispositivo').selectOption('synthetic-fan');
  await expect(field(page, 'Posición X')).toBeDisabled();
  await expect(field(page, 'Habitación del dispositivo')).toBeDisabled();
  await field(page, 'Movilidad del dispositivo').selectOption('portable');
  await expect(field(page, 'Posición X')).toBeDisabled();
  await button(page, 'Corregir ubicación fija').click();
  await field(page, 'Habitación del dispositivo').selectOption('living');
  await field(page, 'Posición X').fill('0.45');
  await button(page, 'Aplicar dispositivo').click();
  const device = (await current(page)).catalog.devices.find(device => device.id === 'synthetic-fan');
  expect(device.roomId).toBe('living');
  expect(device.position.x).toBe(0.45);
  expect(device.bindings).toEqual({
    entityId: null,
    primaryAction: 'synthetic-fan-command',
    advancedPopupId: 'synthetic-fan-panel',
  });
});
test('action editor defines explicit service targets and rejects raw command data', async ({ page }) => {
  await section(page, 'Acciones lógicas');
  await field(page, 'ID de acción').fill('test-set-speed');
  await field(page, 'Dominio').selectOption('fan');
  await field(page, 'Servicio').selectOption('set_percentage');
  await field(page, 'Destinos de la acción').fill('fan.test_unit');
  await field(page, 'Datos de la acción').fill('{"percentage":30}');
  await button(page, 'Aplicar acción').click();
  expect((await current(page)).actions['test-set-speed']).toEqual({
    domain: 'fan',
    service: 'set_percentage',
    target: { entity_id: 'fan.test_unit' },
    data: { percentage: 30 },
  });
  await field(page, 'Datos de la acción').fill('{"rf_code":123}');
  await button(page, 'Aplicar acción').click();
  await expect(editor(page).getByRole('status')).toContainText('no permitido');
  expect((await current(page)).actions['test-set-speed'].data).toEqual({ percentage: 30 });
  expect(await page.evaluate(() => window.editorTest.calls)).toEqual([]);
});
test('native panel rows preserve typed metadata when adding/removing controls', async ({ page }) => {
  await section(page, 'Paneles nativos');
  await field(page, 'ID de panel').fill('test-new-panel');
  await field(page, 'Título del panel').fill('Controls typed before adding rows');
  await button(page, 'Agregar control').click();
  await expect(field(page, 'ID de panel')).toHaveValue('test-new-panel');
  await expect(field(page, 'Título del panel')).toHaveValue('Controls typed before adding rows');
  await field(page, 'Nombre de control 1').fill('Toggle test');
  await field(page, 'Acción de control 1').selectOption('synthetic-light-toggle');
  await button(page, 'Agregar control').click();
  await field(page, 'Nombre de control 2').fill('Run script');
  await field(page, 'Acción de control 2').selectOption('synthetic-fan-command');
  await button(page, 'Quitar control 2').click();
  await expect(field(page, 'Nombre de control 1')).toHaveValue('Toggle test');
  await button(page, 'Aplicar panel').click();
  expect((await current(page)).panels['test-new-panel']).toEqual({
    kind: 'device-controls',
    title: 'Controls typed before adding rows',
    controls: [{ id: 'control-1', label: 'Toggle test', actionId: 'synthetic-light-toggle' }],
  });
});
test('measured feedback requires explicit independent-source acknowledgment and stays configuration only', async ({
  page,
}) => {
  await section(page, 'Fuente de estado');
  await field(page, 'Entidad de estado').fill('sensor.test_feedback');
  await field(page, 'Tipo de feedback').selectOption('measured');
  await button(page, 'Aplicar fuente').click();
  await expect(editor(page).getByRole('status')).toContainText('fuente independiente');
  expect(await page.evaluate(() => window.editorTest.events.length)).toBe(0);
  await field(page, 'Revisé la fuente independiente').check();
  await button(page, 'Aplicar fuente').click();
  expect((await current(page)).stateSources['synthetic-light']).toEqual({
    entityId: 'sensor.test_feedback',
    attribute: null,
    feedback: 'measured',
  });
  expect((await current(page)).catalog.devices[0].state).toEqual({ value: 'unknown', confidence: 'unknown' });
});
test('deletion requires confirmation and keeps reusable panels/actions', async ({ page }) => {
  await button(page, 'Eliminar icono').click();
  expect((await current(page)).catalog.devices).toHaveLength(3);
  await button(page, 'Confirmar eliminación').click();
  const config = await current(page);
  expect(config.catalog.devices).toHaveLength(2);
  expect(config.stateSources['synthetic-light']).toBeUndefined();
  expect(config.actions['synthetic-light-toggle']).toBeDefined();
  expect(config.panels['synthetic-light-panel']).toBeDefined();
  expect(await page.evaluate(() => window.editorTest.calls)).toEqual([]);
});
test('JSON import shows summary before mutation; export contains configuration and unknown states only', async ({
  page,
}) => {
  await section(page, 'Importar y exportar');
  const config = await current(page);
  config.catalog.devices[0].display.label = 'Imported test label';
  config.catalog.devices[0].state = { value: 'on', confidence: 'confirmed' };
  await field(page, 'Importar JSON o SVG').setInputFiles({
    name: 'test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(editor(page).getByText('Resumen de importación', { exact: true })).toBeVisible();
  expect((await current(page)).catalog.devices[0].display.label).toBe('Luz de prueba');
  expect(await page.evaluate(() => window.editorTest.events.length)).toBe(0);
  await button(page, 'Aplicar importación al borrador').click();
  expect((await current(page)).catalog.devices[0].display.label).toBe('Imported test label');
  const downloading = page.waitForEvent('download');
  await button(page, 'Exportar JSON').click();
  const download = await downloading;
  const output = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(output.schemaVersion).toBe(2);
  expect(
    output.catalog.devices.every(device => device.state.value === 'unknown' && device.state.confidence === 'unknown'),
  ).toBe(true);
  expect(Object.keys(output).sort()).toEqual(
    [
      'actions',
      'architecture',
      'catalog',
      'commandTtlSeconds',
      'panels',
      'rooms',
      'schemaVersion',
      'stateSources',
    ].sort(),
  );
});
test('SVG import sanitizes dangerous content and changed viewBox requires a backup before apply', async ({ page }) => {
  await section(page, 'Importar y exportar');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><script>window.bad=true</script><rect id="room-living" width="200" height="100" onclick="alert(1)"/></svg>';
  await field(page, 'Importar JSON o SVG').setInputFiles({
    name: 'test.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svg),
  });
  await expect(button(page, 'Aplicar importación al borrador')).toBeDisabled();
  const downloading = page.waitForEvent('download');
  await button(page, 'Exportar copia actual').click();
  await downloading;
  await expect(button(page, 'Aplicar importación al borrador')).toBeEnabled();
  await button(page, 'Aplicar importación al borrador').click();
  const content = (await current(page)).architecture.content;
  expect(content).not.toContain('<script');
  expect(content).not.toContain('onclick');
  expect(content).toContain('viewBox="0 0 200 100"');
  expect(await page.evaluate(() => window.bad)).toBeUndefined();
});
test('a slower earlier file cannot replace the latest import preview', async ({ page }) => {
  await section(page, 'Importar y exportar');
  await page.evaluate(() => {
    const editor = window.editorTest.editor,
      input = editor.shadowRoot.querySelector('#import-file');
    const earlier = editor.getConfiguration(),
      latest = editor.getConfiguration();
    earlier.catalog.devices[0].display.label = 'Earlier slow file';
    latest.catalog.devices[0].display.label = 'Latest selected file';
    const slow = new File([JSON.stringify(earlier)], 'earlier.json', { type: 'application/json' }),
      fast = new File([JSON.stringify(latest)], 'latest.json', { type: 'application/json' });
    let release;
    slow.text = () =>
      new Promise(resolve => {
        release = () => resolve(JSON.stringify(earlier));
      });
    const selection = new DataTransfer();
    selection.items.add(slow);
    input.files = selection.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const second = new DataTransfer();
    second.items.add(fast);
    input.files = second.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    window.editorTest.releaseEarlierImport = release;
  });
  await expect(button(page, 'Aplicar importación al borrador')).toBeVisible();
  await page.evaluate(() => window.editorTest.releaseEarlierImport());
  await button(page, 'Aplicar importación al borrador').click();
  expect((await current(page)).catalog.devices[0].display.label).toBe('Latest selected file');
});
test('editor stays inside the mobile/desktop viewport and primary controls have touch targets', async ({ page }) => {
  await section(page, 'Paneles nativos');
  await button(page, 'Agregar control').click();
  const result = await editor(page).evaluate(element => {
    const root = element.shadowRoot;
    return {
      width: root.querySelector('.editor').getBoundingClientRect().width,
      viewport: innerWidth,
      scroll: document.documentElement.scrollWidth,
      buttons: [...root.querySelectorAll('button')]
        .filter(button => button.getBoundingClientRect().height > 0)
        .map(button => button.getBoundingClientRect().height),
    };
  });
  expect(result.width).toBeLessThanOrEqual(result.viewport);
  expect(result.scroll).toBeLessThanOrEqual(result.viewport);
  expect(result.buttons.every(height => height >= 44)).toBe(true);
});
test('spaces come from the instance: legacy labels migrate, zones are detected and edits never delete devices', async ({
  page,
}) => {
  await section(page, 'Espacios');
  expect((await current(page)).rooms).toEqual([
    { id: 'living', label: 'Espacio A' },
    { id: 'kitchen', label: 'Espacio B' },
    { id: 'office', label: 'Espacio C' },
  ]);
  await field(page, 'Nombre del espacio living').fill('Estar');
  await button(page, 'Aplicar nombres').click();
  expect((await current(page)).rooms[0]).toEqual({ id: 'living', label: 'Estar' });
  await field(page, 'ID del nuevo espacio').fill('garage');
  await field(page, 'Nombre del nuevo espacio').fill('Garage');
  await button(page, 'Agregar espacio').click();
  expect((await current(page)).rooms.map(room => room.id)).toEqual(['living', 'kitchen', 'office', 'garage']);
  await expect(editor(page).getByText('sin zona en el plano').first()).toBeVisible();
  await button(page, 'Quitar Espacio B').click();
  const config = await current(page);
  expect(config.rooms.map(room => room.id)).toEqual(['living', 'office', 'garage']);
  expect(config.catalog.devices.find(device => device.id === 'synthetic-fan')).toMatchObject({
    roomId: null,
    bindings: { primaryAction: 'synthetic-fan-command' },
  });
  await expect(editor(page).getByRole('status')).toContainText('sin espacio asignado');
  // The device form offers exactly the instance spaces plus the explicit unassigned option.
  await field(page, 'Dispositivo').selectOption('synthetic-light');
  expect(await field(page, 'Habitación del dispositivo').locator('option').allTextContents()).toEqual([
    'Sin espacio asignado',
    'Estar',
    'Espacio C',
    'Garage',
  ]);
  expect(await page.evaluate(() => window.editorTest.calls)).toEqual([]);
});
test('replacing the plan detects zones and keeps devices on the same drawing point', async ({ page }) => {
  await section(page, 'Importar y exportar');
  // Same drawing extended 500 units to the right: viewBox origin is unchanged, width doubles.
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 2000 700"><rect id="room-living" x="30" y="40" width="440" height="620"/><g id="room-studio"><title>Estudio</title><rect x="1100" y="40" width="400" height="400"/></g></svg>';
  await field(page, 'Importar JSON o SVG').setInputFiles({
    name: 'plan.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svg),
  });
  await expect(editor(page).getByText('Espacios sin zona en el nuevo plano: kitchen, office')).toBeVisible();
  await expect(editor(page).getByText('Zonas nuevas detectadas: studio')).toBeVisible();
  await expect(editor(page).getByLabel('Mismo punto del dibujo (el plano se recortó o amplió)')).toBeChecked();
  const downloading = page.waitForEvent('download');
  await button(page, 'Exportar copia actual').click();
  await downloading;
  await button(page, 'Aplicar importación al borrador').click();
  const light = (await current(page)).catalog.devices.find(device => device.id === 'synthetic-light');
  // Before: x=.25 of width 1000 -> SVG x=260. After: (260-10)/2000 = .125.
  expect(light.position).toEqual({ x: 0.125, y: 0.33 });
  expect(light.bindings.entityId).toBe('light.synthetic_light');
  await section(page, 'Espacios');
  await button(page, 'Agregar Estudio').click();
  expect((await current(page)).rooms.at(-1)).toEqual({ id: 'studio', label: 'Estudio' });
});
