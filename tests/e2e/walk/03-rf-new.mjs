// A new RF remote without typing a name: learn the first button, test it, 👍.
export default async (page, { shot, app, card, check }) => {
  await page.goto(page.url().replace(/\/homemanager.*/, '/homemanager'));
  await card.waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);
  await card.locator('.hm-tools [data-command=configuration]:visible').click();
  await card.locator('.nb-row[data-settings=controls-section]').click();
  await page.waitForTimeout(1500);
  const rf = app.locator('homemanager-rf');
  await rf.getByRole('button', { name: 'Nuevo control', exact: true }).click();
  await rf.getByRole('button', { name: 'Ventilador', exact: true }).click();
  await rf.getByRole('button', { name: 'RF', exact: true }).click();
  await page.waitForTimeout(400);
  await shot('11a-new-rf');
  const create = rf.getByRole('button', { name: 'Aprender botones', exact: true });
  check(!(await create.isDisabled()), 'Learn buttons works without typing a name (RF)');
  await create.click();
  await page.waitForTimeout(1200);
  await shot('11b-rf-learn');
  const learn = rf.locator('homemanager-rf-learn');
  const ring = learn.locator('button.ring').first();
  check(!(await ring.isDisabled()), 'the RF ring listens');
  await ring.click();
  await page.waitForTimeout(2800);
  await shot('11c-rf-heard');
  await learn.locator('[data-suggest]').first().click();
  await learn
    .getByRole('button', { name: /Probar/ })
    .first()
    .click();
  await page.waitForTimeout(800);
  await shot('11d-rf-asked');
  await learn.getByRole('button', { name: 'Guardar señal', exact: true }).click();
  await page.waitForTimeout(1500);
  check(await learn.getByText(/guardado/).isVisible(), 'the first RF button is saved');
  await shot('11e-rf-saved');
};
