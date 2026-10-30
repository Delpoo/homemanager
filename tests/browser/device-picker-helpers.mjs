export const picker = page => page.locator('homemanager-device-picker');
export async function chooseAnyEntity(page, entityId, { adding = false } = {}) {
  if (!(await picker(page).count())) {
    if (adding)
      await page.getByRole('button', { name: 'Agregar dispositivo desde Home Assistant', exact: true }).click();
    else await page.getByRole('button', { name: /^(Vincular dispositivo|Cambiar dispositivo)$/ }).click();
  }
  const host = picker(page);
  const back = host.getByRole('button', { name: 'Volver', exact: true });
  if (await back.isVisible()) await back.click();
  await host.getByRole('button', { name: 'Buscar cualquier entidad', exact: true }).click();
  await host.getByRole('searchbox').fill(entityId);
  await host.getByRole('button', { name: 'Usar esta entidad', exact: true }).click();
}
