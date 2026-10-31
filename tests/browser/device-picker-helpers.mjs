export const picker = page => page.locator('homemanager-device-picker');
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
  const back = host.getByRole('button', { name: 'Volver', exact: true });
  if (await host.locator('[name=primary],[data-advanced=true]').count()) await back.click();
  await host.getByRole('button', { name: 'Buscar cualquier entidad', exact: true }).click();
  await host.getByRole('searchbox').fill(entityId);
  await host.getByRole('button', { name: 'Usar esta entidad', exact: true }).click();
}
