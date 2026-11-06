// Fictional home, like a typical one: plan, spaces and a few symbols.
export default async (page, { shot, app, hass }) => {
  await page.waitForFunction(() => document.querySelector('home-assistant')?.hass?.connection, null, {
    timeout: 30000,
  });
  const confirm = page.getByRole('button', { name: 'Confirmar', exact: true });
  if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
  for (const id of ['casa-walk']) {
    const previous = await hass({ type: 'homemanager/home/get', home_id: id }).catch(() => null);
    if (previous) await hass({ type: 'homemanager/home/delete', home_id: id, expected_revision: previous.revision });
  }
  const rooms = [
    ['living', 'Living', 'mdi:sofa', 'M20 20H290V190H200V380H20Z', '#EFEBDD'],
    ['office', 'Oficina', 'mdi:desk', 'M290 20H440V170H290Z', '#E4D3B4'],
    ['bedroom', 'Dormitorio', 'mdi:bed', 'M440 20H580V230H440Z', '#E4D3B4'],
    ['bath', 'Baño', 'mdi:shower', 'M290 170H440V280H290Z', '#D9E0D9'],
    ['kitchen', 'Cocina', 'mdi:pot-steam', 'M290 280H580V380H290Z', '#EFEBDD'],
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><g stroke="#55665B" stroke-width="6" stroke-linejoin="round">${rooms.map(([id, label, , d, fill]) => `<path id="room-${id}" d="${d}" fill="${fill}"><title>${label}</title></path>`).join('')}</g></svg>`;
  const symbol = (id, roomId, kind, x, y, label, icon, entityId, extra = {}) => ({
    id,
    roomId,
    kind,
    position: { x: x / 600, y: y / 400 },
    mobility: 'editable',
    display: { label, icon },
    bindings: { entityId, primaryAction: null, advancedPopupId: null },
    state: { value: 'unknown', confidence: 'unknown' },
    ...extra,
  });
  const configuration = {
    schemaVersion: 2,
    rooms: rooms.map(([id, label, icon]) => ({ id, label, icon })),
    catalog: {
      schemaVersion: 2,
      devices: [
        symbol('lamp', 'living', 'light', 95, 70, 'Lámpara', 'mdi:lamp', 'light.e2e_lamp'),
        symbol('fan', 'living', 'fan', 150, 150, 'Ventilador living', 'mdi:ceiling-fan', null),
        symbol('ac', 'bedroom', 'ac', 510, 120, 'Aire dormitorio', 'mdi:air-conditioner', null),
        symbol('spot', 'office', 'light', 360, 80, 'Spot', 'mdi:spotlight', 'light.e2e_spot'),
      ],
    },
    architecture: { format: 'svg', content: svg },
    actions: {},
    panels: {},
    stateSources: {},
    commandTtlSeconds: 30,
  };
  await hass({
    type: 'homemanager/home/save',
    home_id: 'casa-walk',
    expected_revision: null,
    configuration,
    title: 'Casa de prueba',
  });
  await page.reload();
  await app.locator('homemanager-card').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot('01-panel');
};
