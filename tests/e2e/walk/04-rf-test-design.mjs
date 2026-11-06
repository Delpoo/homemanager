// Continues 03: the second button without typing, then Test and Design.
export default async (page, { shot, app, check }) => {
  const rf = app.locator('homemanager-rf');
  const learn = rf.locator('homemanager-rf-learn');
  await shot('12a-after-first');
  const start = learn.getByRole('button', { name: 'Empezar', exact: true });
  check(!(await start.isDisabled()), 'the next RF button starts without typing a name');
  await start.click();
  await page.waitForTimeout(2800);
  await learn
    .getByRole('button', { name: /Probar/ })
    .first()
    .click();
  await page.waitForTimeout(700);
  await learn.getByRole('button', { name: 'Sí, guardar', exact: true }).click();
  await page.waitForTimeout(1200);
  await shot('12b-after-second');
  await learn.getByRole('button', { name: 'Listo', exact: true }).click();
  await page.waitForTimeout(1200);
  await shot('12c-test-step');
  const sends = rf.locator('.trow .ib.send');
  check((await sends.count()) === 2, 'Test lists both learned buttons');
  await sends.first().click();
  await page.waitForTimeout(600);
  await shot('12d-test-asked');
  await rf.getByRole('button', { name: 'Sí, reaccionó', exact: true }).click();
  await page.waitForTimeout(600);
  await rf.locator('.dfoot [data-command=edit]').click();
  await page.waitForTimeout(1500);
  check((await app.locator('homemanager-rf[data-stage]').count()) === 1, 'Design opens');
  await shot('12e-design');
};
