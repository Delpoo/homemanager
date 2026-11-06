export default async (page, { shot, card, check }) => {
  const sheet = card.locator('.module-card', { hasText: 'Sin controles' }).first();
  await sheet.locator('summary').click();
  await page.waitForTimeout(800);
  await shot('08a-control-open');
  const add = card.locator('[data-command=ctl-add]').first();
  await add.scrollIntoViewIfNeeded();
  await add.click();
  await page.waitForTimeout(800);
  await card.locator('.ctl').first().scrollIntoViewIfNeeded();
  const summary = await card.locator('[data-module=control] .module-sum').textContent();
  check(!summary.includes('Sin controles'), 'the Control summary counts the new control');
  await shot('08b-control-added');
};
