import { showSection, openSettings } from '../browser/shell-helpers.mjs';
import { readFile } from 'node:fs/promises';
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

test('changing theme during upload keeps the image in its original mode', async ({ page }) => {
  const card = await setup(page);
  await page.evaluate(() => {
    const h = window.testHarness,
      original = h.hass.callWS;
    h.hass.callWS = async message => {
      if (message.type === 'homemanager/image/put')
        await new Promise(resolve => {
          window.finishUpload = resolve;
        });
      return original(message);
    };
    h.card.hass = { ...h.hass };
  });
  await openCardMenu(page);
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await openSettings(card);
  // Plan alternatives have their own Settings section (#70, #72).
  await showSection(card.locator('homemanager-editor'), 'views-section');
  const editor = card.locator('homemanager-plan-views-editor');
  await editor.getByRole('button', { name: '+ Agregar alternativa', exact: true }).click();
  await editor.getByLabel('Nombre', { exact: true }).fill('Original mode');
  const source = await card.evaluate(c => c.draft.architecture.content);
  await editor
    .locator('[data-image]')
    .setInputFiles({ name: 'mode.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(source) });
  await page.waitForFunction(() => window.finishUpload);
  await editor.locator('[data-mode-choice=dark]').click();
  await page.evaluate(() => window.finishUpload());
  await editor.getByRole('button', { name: 'Guardar alternativa', exact: true }).click();
  await expect.poll(() => card.evaluate(c => c.draft.planViews?.length)).toBe(1);
  expect(await card.evaluate(c => !!c.draft.planViews[0].light)).toBe(true);
  expect(await card.evaluate(c => c.draft.planViews[0].dark)).toBeUndefined();
});
test('alternative editor checks framing, keeps positions and supports duplicate/order/remove and discard', async ({
  page,
}) => {
  const card = await setup(page);
  const before = await card.evaluate(c => structuredClone(c.draft));
  await openCardMenu(page);
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await openSettings(card);
  // Plan alternatives have their own Settings section (#70, #72).
  await showSection(card.locator('homemanager-editor'), 'views-section');
  const editor = card.locator('homemanager-plan-views-editor');
  await editor.getByRole('button', { name: '+ Agregar alternativa', exact: true }).click();
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
  // Up, Down, Duplicate and Remove live in each card's menu (#72).
  await editor.locator('.card-menu > summary').first().click();
  await editor.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await expect.poll(() => card.evaluate(c => c.draft.planViews.length)).toBe(2);
  await editor.locator('.card-menu > summary').last().click();
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
        light: {
          scope: 'example',
          sha256: sha,
          format: 'svg',
          box: new DOMParser()
            .parseFromString(c.configuration.architecture.content, 'image/svg+xml')
            .documentElement.getAttribute('viewBox')
            .trim()
            .split(/[ ,]+/)
            .map(Number),
        },
        lightBackground: '#eeeeee',
        darkBackground: '#122334',
      },
    ];
    h.card.setConfig(c);
    h.card.hass = { ...h.hass };
  }, svg);
  const original = await card.evaluate(c => ({ box: c.box, positions: c.draft.catalog.devices.map(d => d.position) }));
  const choice = card.getByLabel('Alternativa del plano', { exact: true });
  await choice.dispatchEvent('pointerdown', {
    button: 0,
    pointerId: 91,
    pointerType: 'mouse',
    clientX: 80,
    clientY: 80,
  });
  expect(await card.evaluate(c => c.pointers.size)).toBe(0);
  await choice.selectOption('simple');
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

test('copy with images exports bytes and imports only after backing up the current draft', async ({ page }) => {
  const card = await setup(page);
  await page.evaluate(async svg => {
    const h = window.testHarness,
      config = { ...h.original, configuration: structuredClone(h.card.draft) };
    const bytes = new TextEncoder().encode(svg);
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    window.testImages[sha] = { format: 'svg', content: btoa(svg), sha256: sha };
    const box = new DOMParser()
      .parseFromString(config.configuration.architecture.content, 'image/svg+xml')
      .documentElement.getAttribute('viewBox')
      .trim()
      .split(/[ ,]+/)
      .map(Number);
    config.configuration.planViews = [
      { id: 'original', name: 'Copia de prueba', light: { scope: 'example', sha256: sha, format: 'svg', box } },
    ];
    h.mutateRemote(d => (d.views[0].cards[0] = config));
    h.card.setConfig(config);
    h.card.hass = { ...h.hass };
  }, svg);
  await openCardMenu(page);
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await openSettings(card);
  // Plan alternatives have their own Settings section (#70, #72).
  await showSection(card.locator('homemanager-editor'), 'views-section');
  const editor = card.locator('homemanager-plan-views-editor');
  const downloading = page.waitForEvent('download');
  await editor.getByRole('button', { name: 'Exportar copia con imágenes', exact: true }).click();
  const download = await downloading;
  const bundle = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(Object.keys(bundle.images)).toHaveLength(1);
  expect(Object.values(bundle.images)[0].content).toBe(Buffer.from(svg).toString('base64'));
  bundle.configuration.planViews[0].name = 'Restaurada';
  await editor
    .locator('[data-import]')
    .setInputFiles({ name: 'copy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) });
  const backup = page.waitForEvent('download');
  await editor.getByRole('button', { name: 'Importar', exact: true }).click();
  await backup;
  await expect(editor.getByText('Restaurada', { exact: true })).toBeVisible();
  expect(await card.evaluate(c => c.draft.catalog.devices.map(d => d.position))).toEqual(
    bundle.configuration.catalog.devices.map(d => d.position),
  );
});
