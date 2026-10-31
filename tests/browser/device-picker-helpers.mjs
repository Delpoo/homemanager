export const picker = page => page.locator('homemanager-device-picker');
export async function openDeviceSections(
  page,
  ids = ['device-category', 'device-binding', 'device-alerts', 'device-controls-section'],
) {
  const editor = page.locator('homemanager-editor');
  for (const id of ids) {
    const section = editor.locator('#' + id);
    if ((await section.isVisible()) && !(await section.evaluate(node => node.open)))
      await section.locator(':scope > summary').click();
  }
}
export async function chooseAnyEntity(page, entityId, { adding = false } = {}) {
  if (!(await picker(page).count())) {
    const disclosure = page.locator('homemanager-editor #device-binding');
    if ((await disclosure.count()) && !(await disclosure.evaluate(node => node.open)))
      await disclosure.locator(':scope > summary').click();
    if (adding)
      await page.getByRole('button', { name: 'Agregar dispositivo desde Home Assistant', exact: true }).click();
    else await page.getByRole('button', { name: /^(Vincular dispositivo|Cambiar dispositivo)$/ }).click();
  }
  const host = picker(page);
  const back = host.locator('.task-back');
  if (await host.locator('[name=primary],[data-advanced=true]').count()) await back.click();
  await host.getByRole('button', { name: 'Buscar cualquier entidad', exact: true }).click();
  await host.getByRole('searchbox').fill(entityId);
  await host.getByRole('button', { name: 'Usar esta entidad', exact: true }).click();
}
