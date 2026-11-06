// The whole Controls walk, as the owner does it, with a picture of each screen.
export default async (page, { shot, app, card, check }) => {
  await page.evaluate(() => {
    localStorage.setItem('selectedTheme', JSON.stringify({ theme: 'default', dark: true }));
    localStorage.setItem('homemanager-ui-theme', 'light');
  });
  await page.goto(page.url().replace(/\/homemanager.*/, '/homemanager'));
  await card.waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);
  if (
    !(await app
      .getByText('Casa de prueba')
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await app.locator('button:has-text("HomeManager")').first().click();
    await app.getByRole('menuitemradio', { name: /Casa de prueba/ }).click();
    await page.waitForTimeout(2000);
  }
  await card.locator('[data-command=nav-menu]:visible').click();
  await card.locator('.nav-drawer .nav-item', { hasText: 'Controles' }).click();
  await page.waitForTimeout(1500);
  const rf = app.locator('homemanager-rf');
  await shot('10a-controls');

  // Devices: each board once; the meter and the old board apart.
  await rf.locator('.nodes .ib[data-view=devices]').click();
  await page.waitForTimeout(1500);
  await shot('10b-devices');
  const devices = rf.locator('homemanager-rf-devices');
  await devices.locator('details.dgroup[data-group=other] summary').click();
  await devices.locator('details.dgroup[data-group=offline] summary').click();
  await page.waitForTimeout(400);
  await shot('10c-devices-groups');
  await devices.locator('[data-device=athom_b]').getByRole('button', { name: 'Agregar RF a este equipo' }).click();
  await page.waitForTimeout(500);
  await shot('10d-add-rf-steps');
  await rf.getByRole('button', { name: 'Volver', exact: true }).click();
  await page.waitForTimeout(800);

  // New IR remote without typing a name.
  await rf.getByRole('button', { name: 'Nuevo control', exact: true }).click();
  await rf.getByRole('button', { name: 'IR', exact: true }).click();
  await page.waitForTimeout(400);
  await shot('10e-new-ir');
  const learn = rf.getByRole('button', { name: 'Aprender botones', exact: true });
  check(!(await learn.isDisabled()), 'Learn buttons works without typing a name');
  await learn.click();
  await page.waitForTimeout(1500);
  const ir = rf.locator('homemanager-ir-manager');
  await shot('10f-ir-ring');
  const ring = ir.getByRole('button', { name: 'Capturar botón IR' });
  check(!(await ring.isDisabled()), 'the IR ring listens without choosing a receiver again');
  await ring.click();
  await page.waitForTimeout(2800);
  await shot('10g-ir-heard');
  await ir.locator('[data-suggest]').first().click();
  await ir.getByRole('button', { name: 'Probar', exact: true }).click();
  await page.waitForTimeout(800);
  await shot('10h-ir-asked');
  await ir.getByRole('button', { name: 'Sí, guardar', exact: true }).click();
  await page.waitForTimeout(1500);
  check(await ir.getByText('Guardado en Home Assistant.').isVisible(), 'the IR button is saved');
  await shot('10i-ir-saved');
};
