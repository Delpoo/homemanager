// HA in dark mode, HomeManager in light (its own ☀ choice): the owner's case.
export default async (page, { shot, card, check }) => {
  await page.evaluate(() => {
    localStorage.setItem('selectedTheme', JSON.stringify({ theme: 'default', dark: true }));
    localStorage.setItem('homemanager-ui-theme', 'light');
  });
  await page.reload();
  await card.waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await page
    .getByRole('button', { name: /Editar/ })
    .first()
    .click();
  await page.waitForTimeout(2500);
  await card.locator('[data-id=fan]').first().click();
  await page.waitForTimeout(1500);
  await shot('07a-dark-ha-sheet');
  const colors = await page.evaluate(() => {
    const out = {};
    const find = (root, sel) => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of root.querySelectorAll('*'))
        if (el.shadowRoot) {
          const inner = find(el.shadowRoot, sel);
          if (inner) return inner;
        }
      return null;
    };
    for (const sel of ['select[name=roomId]', '.lbl', 'summary', 'select']) {
      const el = find(document, sel);
      if (el) out[sel] = getComputedStyle(el).color;
    }
    return out;
  });
  // Home Assistant's light text colour must not reach HomeManager's light sheet.
  check(colors.summary !== 'rgb(225, 225, 225)', 'the sheet keeps its own text colour with HA in dark mode');
};
