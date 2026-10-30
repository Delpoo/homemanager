import { test, expect } from '@playwright/test';

// Invented home: no household data. The registry is what Home Assistant's frontend exposes.
const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');
const button = (page, name) => card(page).getByRole('button', { name, exact: true });
const draft = page => page.evaluate(() => window.testHarness.card.getDraftConfiguration());
const area = (page, label) => editor(page).getByRole('combobox', { name: `Área de ${label}`, exact: true });

const open = async (page, { areas = true } = {}) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(() => {
    const configuration = window.testHarness.card.getDraftConfiguration();
    configuration.rooms = [
      { id: 'living', label: 'Sala' },
      { id: 'kitchen', label: 'Cocina' },
      { id: 'office', label: 'Baño Norte' },
      { id: 'south', label: 'Baño Sur', shape: { x: 0.8, y: 0.8, width: 0.2, height: 0.2 }, shapeSource: 'app' },
    ];
    window.testHarness.mutateRemote(dashboard => {
      dashboard.views[0].cards[0].configuration = configuration;
    });
  });
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(withAreas => {
    const { hass, card } = window.testHarness;
    const created = [];
    window.createdAreas = created;
    window.failArea = null;
    const previous = hass.callWS.bind(hass);
    hass.callWS = async message => {
      if (message.type !== 'config/area_registry/create') return previous(message);
      if (window.failArea === message.name)
        throw Object.assign(new Error('nope'), { code: 'invalid', message: 'nope' });
      const area_id = `new_${created.length}`;
      created.push(message.name);
      return { area_id, name: message.name };
    };
    if (withAreas) {
      hass.areas = {
        area_living: { name: 'Living' },
        area_bath: { name: 'Bathroom' },
        area_kitchen: { name: 'Kitchen' },
      };
      hass.devices = {
        lamp: { name: 'Lámpara nueva', area_id: 'area_living' },
        heater: { name: 'Estufa nueva', area_id: 'area_living' },
        elsewhere: { name: 'Sin vincular', area_id: 'area_bath' },
      };
      const entity = (id, device) => {
        hass.entities = { ...hass.entities, [id]: { device_id: device, platform: 'synthetic' } };
        hass.states = {
          ...hass.states,
          [id]: { state: 'off', attributes: { friendly_name: device }, last_updated: '2026-10-31T00:00:00Z' },
        };
      };
      entity('light.lamp_new', 'lamp');
      entity('switch.heater_new', 'heater');
      entity('light.elsewhere_new', 'elsewhere');
      // Placed in an area directly, with no device of its own.
      hass.entities = { ...hass.entities, 'light.loose_new': { area_id: 'area_living', platform: 'template' } };
      hass.states = {
        ...hass.states,
        'light.loose_new': {
          state: 'off',
          attributes: { friendly_name: 'Luz suelta' },
          last_updated: '2026-10-31T00:00:00Z',
        },
      };
    }
    card.hass = { ...hass };
  }, areas);
  await card(page).locator('.hm-menu > summary').click();
  await button(page, 'Editar plano').click();
  await button(page, 'Ajustes del plano').click();
  await editor(page).locator('[data-settings="connect-section"]').click();
};

test('each space is offered its area, and only the named areas are created', async ({ page }) => {
  await open(page);
  // Same place in another language; two bathrooms for one area stay undecided.
  await expect(area(page, 'Sala')).toHaveValue('area_living');
  await expect(area(page, 'Cocina')).toHaveValue('area_kitchen');
  await expect(area(page, 'Baño Norte')).toHaveValue('create');
  await expect(area(page, 'Baño Sur')).toHaveValue('create');
  const connect = editor(page).locator('.connect');
  await expect(connect).toContainText('Se crean en Home Assistant al tocar el botón: Baño Norte, Baño Sur');
  // Nothing has been written yet.
  expect(await page.evaluate(() => window.createdAreas)).toEqual([]);
  expect((await draft(page)).rooms.some(room => room.areaId)).toBe(false);
  await area(page, 'Baño Sur').selectOption('');
  await expect(connect).not.toContainText('Baño Norte, Baño Sur');
  await connect.getByRole('button', { name: 'Crear un área y vincular', exact: true }).click();
  await expect(area(page, 'Baño Norte')).toHaveValue('new_0');
  expect(await page.evaluate(() => window.createdAreas)).toEqual(['Baño Norte']);
  const rooms = (await draft(page)).rooms;
  expect(rooms.map(room => [room.id, room.areaId])).toEqual([
    ['living', 'area_living'],
    ['kitchen', 'area_kitchen'],
    ['office', 'new_0'],
    ['south', undefined],
  ]);
  // A linked space keeps its own shape, and the draft saves.
  expect(rooms[3].shape).toEqual({ x: 0.8, y: 0.8, width: 0.2, height: 0.2 });
  await editor(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await button(page, 'Guardar cambios').click();
  await expect(card(page).locator('.shell > .status')).toContainText('Guardado');
  // Applying again creates nothing: the button has nothing to do.
  await button(page, 'Ajustes del plano').click();
  await editor(page).locator('[data-settings="connect-section"]').click();
  await expect(editor(page).locator('.connect').getByRole('button', { name: 'Vincular', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.createdAreas)).toEqual(['Baño Norte']);
});

test('the devices of a linked area are offered, and the chosen ones land inside their space', async ({ page }) => {
  await open(page);
  const connect = editor(page).locator('.connect');
  await area(page, 'Baño Norte').selectOption('');
  await area(page, 'Baño Sur').selectOption('');
  // Before linking, nothing is proposed.
  await expect(connect.locator('[data-connect-device]')).toHaveCount(0);
  await connect.getByRole('button', { name: 'Vincular', exact: true }).click();
  await expect(connect.locator('[data-connect-device]')).toHaveCount(3);
  // A device in an area no space has is not offered.
  await expect(connect).not.toContainText('Sin vincular');
  await connect.getByRole('button', { name: 'Agregar seleccionados', exact: true }).click();
  await expect(editor(page).locator('.status')).toContainText('Marcá primero');
  const before = (await draft(page)).catalog.devices.length;
  await connect.getByRole('checkbox', { name: 'Lámpara nueva', exact: true }).check();
  await connect.getByRole('checkbox', { name: 'Estufa nueva', exact: true }).check();
  await connect.getByRole('checkbox', { name: 'Luz suelta', exact: true }).check();
  await connect.getByRole('button', { name: 'Agregar seleccionados', exact: true }).click();
  const after = await draft(page);
  expect(after.catalog.devices.length).toBe(before + 3);
  const added = after.catalog.devices.slice(-3);
  expect(added.map(device => device.roomId)).toEqual(['living', 'living', 'living']);
  expect(added.map(device => device.bindings.entityId).sort()).toEqual([
    'light.lamp_new',
    'light.loose_new',
    'switch.heater_new',
  ]);
  expect(added.find(device => device.bindings.entityId === 'light.loose_new').bindings.deviceId).toBeUndefined();
  expect(added[0].position).not.toEqual(added[1].position);
  // Both fall in their space on the drawing, and they are no longer offered.
  const inSpace = await page.evaluate(
    ids => {
      const { card } = window.testHarness;
      return ids.map(id => card.getDraftConfiguration().catalog.devices.find(item => item.id === id).position);
    },
    added.map(device => device.id),
  );
  for (const spot of inSpace) expect(spot.x).toBeLessThan(0.5);
  await expect(connect.locator('[data-connect-device]')).toHaveCount(0);
});

test('two spaces cannot take one area, and a failed creation keeps what is done and says why', async ({ page }) => {
  await open(page);
  const connect = editor(page).locator('.connect');
  await area(page, 'Baño Norte').selectOption('area_bath');
  await area(page, 'Baño Sur').selectOption('area_bath');
  await connect.getByRole('button', { name: 'Vincular', exact: true }).click();
  await expect(editor(page).locator('.status')).toContainText('no pueden compartir un área');
  expect((await draft(page)).rooms.some(room => room.areaId)).toBe(false);
  await area(page, 'Baño Norte').selectOption('create');
  await area(page, 'Baño Sur').selectOption('create');
  await page.evaluate(() => {
    window.failArea = 'Baño Sur';
  });
  await connect.getByRole('button', { name: 'Crear 2 áreas y vincular', exact: true }).click();
  await expect(editor(page).locator('.status')).toContainText('No se pudo crear el área «Baño Sur»');
  const rooms = (await draft(page)).rooms;
  expect(rooms.find(room => room.id === 'office').areaId).toBe('new_0');
  expect(rooms.find(room => room.id === 'south').areaId).toBeUndefined();
  // Trying again creates only the one that is missing.
  await page.evaluate(() => {
    window.failArea = null;
  });
  await connect.getByRole('button', { name: 'Crear un área y vincular', exact: true }).click();
  await expect(area(page, 'Baño Sur')).toHaveValue('new_1');
  expect(await page.evaluate(() => window.createdAreas)).toEqual(['Baño Norte', 'Baño Sur']);
});

test('without areas from Home Assistant it says so and offers nothing', async ({ page }) => {
  await open(page, { areas: false });
  await expect(editor(page).getByText('no informó sus áreas', { exact: false })).toBeVisible();
  await expect(editor(page).locator('[data-connect-room]')).toHaveCount(0);
});
