import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup, ceiling } from '../tests/browser/rf-helpers.mjs';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const folder = 'docs/evidence/rediseno-lote2';
await mkdir(path.join(root, folder), { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(file => file && existsSync(file));
const browser = await chromium.launch({ executablePath });
const origin = ['http:', '', 'fictional.invalid'].join('/');
const assets = [],
  timings = [];
const card = page => page.locator('homemanager-card');
const editor = page => page.locator('homemanager-editor');
async function load(page, fixture, dark) {
  await page.goto(`${origin}/tests/browser/fixtures/${fixture}.html`);
  await page.waitForFunction(key => window[key], fixture === 'shell' ? 'shellHarnessReady' : 'alertHarnessReady');
  await page.evaluate(dark => {
    window.testHarness.hass.themes = { darkMode: dark };
    window.testHarness.card.hass = { ...window.testHarness.hass };
  }, dark);
}
async function shot(page, prefix, name) {
  const relative = `${folder}/${prefix}-${name}.png`;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize().width,
  );
  const bytes = await page.screenshot({ path: path.join(root, relative), scale: 'css', animations: 'disabled' });
  assets.push({
    path: relative,
    source: 'scripts/capture-redesign-lote2.mjs',
    review: 'fictional-only',
    reviewDate: '2026-11-02',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
try {
  for (const [size, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ])
    for (const dark of [false, true]) {
      const context = await browser.newContext({
        baseURL: origin,
        viewport,
        reducedMotion: 'reduce',
        ...(size === 'mobile' ? { isMobile: true, hasTouch: true } : {}),
      });
      const page = await context.newPage();
      await page.route('**/*', async route => {
        const url = new URL(route.request().url()),
          relative = decodeURIComponent(url.pathname).slice(1),
          file = path.resolve(root, relative);
        if (
          url.origin !== origin ||
          !file.startsWith(root + path.sep) ||
          !/^(tests\/browser\/fixtures\/|dist\/|\.work\/|docs\/rediseno\/)/.test(relative)
        )
          return route.abort();
        try {
          await route.fulfill({
            contentType:
              { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' }[
                path.extname(file)
              ] ?? 'application/octet-stream',
            body: await readFile(file),
          });
        } catch {
          await route.fulfill({ status: 404, body: 'Missing fictional fixture' });
        }
      });
      const prefix = `${size}-${dark ? 'dark' : 'light'}`;
      await load(page, 'shell', dark);
      await card(page).locator('.hm-menu > summary').click();
      await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
      await card(page).locator('[data-id=fan] .primary').click();
      await expect(editor(page).getByRole('button', { name: 'Listo', exact: true })).toBeInViewport();
      await shot(page, prefix, 'modules');
      if (size === 'mobile') await editor(page).getByRole('button', { name: 'Ampliar ficha' }).click();
      await editor(page).locator('#module-gestures > summary').click();
      await editor(page).locator('#module-gestures').scrollIntoViewIfNeeded();
      await shot(page, prefix, 'gestures');
      await editor(page).locator('.module-menu > summary').click();
      await editor(page).locator('.module-menu').scrollIntoViewIfNeeded();
      await shot(page, prefix, 'add');
      await editor(page).locator('.symbol-color > summary').click();
      await editor(page).getByLabel('Color libre', { exact: true }).fill('#7655a6');
      await editor(page).getByLabel('Color libre', { exact: true }).dispatchEvent('change');
      await editor(page).locator('.symbol-color').scrollIntoViewIfNeeded();
      await shot(page, prefix, 'color');
      const picker = editor(page).locator('[data-device-icon]');
      await picker.scrollIntoViewIfNeeded();
      const elapsed = await picker.evaluate(async element => {
        const start = performance.now();
        element.shadowRoot.querySelector('.trigger').click();
        await new Promise(requestAnimationFrame);
        return performance.now() - start;
      });
      timings.push({ prefix, openMs: Math.round(elapsed) });
      await picker.getByRole('searchbox').fill('cerradura');
      await expect(picker.getByRole('option', { name: 'lock', exact: true })).toBeVisible();
      await shot(page, prefix, 'icons');
      await page.keyboard.press('Escape');
      await load(page, 'alerts', dark);
      await card(page).locator('.hm-menu > summary').click();
      await card(page).getByRole('button', { name: 'Reglas', exact: true }).click();
      const rules = page.locator('homemanager-rules-editor');
      await rules.locator('[data-edit="legacy:plant:0"]').click();
      await shot(page, prefix, 'rules');
      await rules.getByRole('button', { name: '+ Nueva regla', exact: true }).click();
      await rules.getByLabel('Nombre de la regla', { exact: true }).fill('Condición elegida');
      await rules.getByLabel('Lecturas del grupo', { exact: true }).selectOption(['sensor.test_soil']);
      await shot(page, prefix, 'rule-new');
      const rf = await setup(page, { remotes: [ceiling()] });
      await rf.evaluate((node, dark) => node.setAttribute('data-theme', dark ? 'dark' : 'light'), dark);
      await rf.getByRole('button', { name: 'Nuevo control', exact: true }).click();
      const remoteIcon = rf.locator('[data-rf-icon=new]');
      await remoteIcon.locator('.trigger').click();
      await remoteIcon.getByRole('searchbox').fill('rocket');
      await shot(page, prefix, 'rf-icons');
      await page.goto(`${origin}/docs/rediseno/maqueta-modulos.html`);
      for (const [selector, name] of [
        ['#main', 'reference-modules'],
        ['#reglas', 'reference-rules'],
      ]) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        await shot(page, prefix, name);
      }
      console.log(`${prefix}: 8 changed surfaces + 2 references`);
      await context.close();
    }
  const file = path.join(root, 'docs/public-assets.json'),
    manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.assets = [...manifest.assets.filter(a => !a.path.startsWith(folder + '/')), ...assets];
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(root, '.work/lote2-icon-performance.json'), JSON.stringify(timings, null, 2) + '\n');
  console.log(JSON.stringify({ captures: assets.length, timings }));
} finally {
  await browser.close();
}
