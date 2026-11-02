import { test, expect } from '../browser/local-test.mjs';
import { openCardMenu } from '../browser/shell-helpers.mjs';
async function setup(page) {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(() => {
    const h = window.testHarness;
    window.testImages = {};
    const callWS = h.hass.callWS.bind(h.hass);
    h.hass.callWS = async m => {
      if (m.type === 'homemanager/image/put') {
        const bytes = Uint8Array.from(atob(m.image.content), c => c.charCodeAt(0));
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        window.testImages[hash] = { ...m.image, sha256: hash };
        return { sha256: hash, format: m.image.format };
      }
      if (m.type === 'homemanager/image/get') return window.testImages[m.sha256];
      return callWS(m);
    };
    h.card.hass = { ...h.hass };
  });
  return page.locator('homemanager-card');
}
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><rect width="100" height="80" fill="#335577"/></svg>';
test('alternative editor checks framing, keeps positions and supports duplicate/order/remove and discard', async ({
  page,
}) => {
  const card = await setup(page);
  const before = await card.evaluate(c => structuredClone(c.draft));
  await openCardMenu(page);
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card.locator('[data-command=settings]').click();
  const editor = card.locator('homemanager-plan-views-editor');
  await editor.getByRole('button', { name: 'Agregar alternativa', exact: true }).click();
  await editor.getByLabel('Nombre', { exact: true }).fill('Simplificado');
  await editor
    .locator('[data-image]')
    .setInputFiles({ name: 'fictional.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await expect(editor.getByRole('status')).toContainText('encuadre');
  await editor.getByRole('button', { name: 'Guardar alternativa', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('alineá');
  await editor.getByRole('button', { name: 'Alinear al plano', exact: true }).click();
  await editor.getByRole('button', { name: 'Guardar alternativa', exact: true }).click();
  await expect(editor.getByText('Simplificado', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await expect.poll(() => card.evaluate(c => c.draft.planViews.length)).toBe(2);
  await editor.getByRole('button', { name: 'Subir', exact: true }).last().click();
  await expect.poll(() => card.evaluate(c => c.draft.planViews[0].name)).toContain('Copia');
  expect(await card.evaluate(c => c.draft.catalog.devices.map(d => d.position))).toEqual(
    before.catalog.devices.map(d => d.position),
  );
  expect(await card.evaluate(c => c.draft.architecture)).toEqual(before.architecture);
});
test('theme fallback and per-screen alternative selection never change geometry', async ({ page }) => {
  const card = await setup(page);
  await page.evaluate(svg => {
    const h = window.testHarness;
    const sha = 'a'.repeat(64);
    window.testImages[sha] = { format: 'svg', content: btoa(svg), sha256: sha };
    const c = structuredClone(h.original);
    c.configuration.planViews = [
      {
        id: 'simple',
        name: 'Simple',
        light: { scope: 'example', sha256: sha, format: 'svg', box: [0, 0, 100, 80] },
        lightBackground: '#eeeeee',
        darkBackground: '#122334',
      },
    ];
    h.card.setConfig(c);
    h.card.hass = { ...h.hass };
  }, svg);
  const original = await card.evaluate(c => ({ box: c.box, positions: c.draft.catalog.devices.map(d => d.position) }));
  await card.getByLabel('Alternativa del plano', { exact: true }).selectOption('simple');
  await expect(card.locator('.plan-image')).toBeVisible();
  await card.evaluate(c => {
    c.hass = { ...c.hass, themes: { darkMode: true } };
  });
  await expect(card.locator('.plan-choices')).toContainText('Falta la imagen');
  expect(await card.evaluate(c => ({ box: c.box, positions: c.draft.catalog.devices.map(d => d.position) }))).toEqual(
    original,
  );
  await card.getByLabel('Alternativa del plano', { exact: true }).selectOption('');
  await expect(card.locator('.plan-image')).toHaveCount(0);
});
