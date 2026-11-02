import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup, ceiling } from '../tests/browser/rf-helpers.mjs';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const folder = 'docs/evidence/rediseno-lote3';
await mkdir(path.join(root, folder), { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => p && existsSync(p));
const browser = await chromium.launch({ executablePath });
const origin = ['http:', '', 'fictional.invalid'].join('/');
const assets = [];
async function shot(page, prefix, name, reference = false) {
  if (!reference)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize().width,
    );
  const relative = `${folder}/${prefix}-${name}.png`;
  const bytes = await page.screenshot({ path: path.join(root, relative), scale: 'css', animations: 'disabled' });
  assets.push({
    path: relative,
    source: 'scripts/capture-redesign-lote3.mjs',
    review: 'fictional-only',
    reviewDate: '2026-11-02',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const layout = [
  { id: 'minus', type: 'button', x: 0, y: 0, w: 1, h: 1, buttons: ['off'], label: '−', icon: null },
  {
    id: 'value',
    type: 'indicator',
    x: 1,
    y: 0,
    w: 2,
    h: 1,
    buttons: [],
    label: 'Nivel',
    icon: null,
    reading: 'sensor.synthetic_level',
  },
  { id: 'plus', type: 'button', x: 3, y: 0, w: 1, h: 1, buttons: ['v1'], label: '+', icon: null },
  { id: 'speed', type: 'slider', x: 0, y: 1, w: 4, h: 1, buttons: ['v1', 'v2', 'v3'], label: 'Velocidad', icon: null },
  { id: 'title', type: 'title', x: 0, y: 2, w: 4, h: 1, buttons: [], label: 'Control de prueba', icon: null },
];
try {
  for (const [size, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
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
          !/^(tests\/browser\/fixtures\/|dist\/|\.work\/|docs\/vision-mockup\.html$)/.test(relative)
        )
          return route.abort();
        try {
          await route.fulfill({
            contentType:
              {
                '.html': 'text/html',
                '.js': 'text/javascript',
                '.mjs': 'text/javascript',
                '.json': 'application/json',
                '.svg': 'image/svg+xml',
              }[path.extname(file)] ?? 'application/octet-stream',
            body: await readFile(file),
          });
        } catch {
          await route.fulfill({ status: 404, body: 'Missing fictional fixture' });
        }
      });
      const prefix = `${size}-${dark ? 'dark' : 'light'}`;
      const rf = await setup(page, { remotes: [ceiling({ layout })] });
      await page.evaluate(dark => {
        window.testHarness.hass.states['sensor.synthetic_level'] = {
          state: '2',
          attributes: { friendly_name: 'Nivel de prueba' },
        };
        window.testHarness.hass.themes = { darkMode: dark };
        document.querySelector('homemanager-rf').hass = { ...window.testHarness.hass };
      }, dark);
      await rf.locator('[data-open=techo]').click();
      await rf.getByRole('button', { name: 'Editar', exact: true }).click();
      const designer = rf.locator('homemanager-control-designer');
      await designer.scrollIntoViewIfNeeded();
      await shot(page, prefix, 'rf-designer');
      await designer.getByRole('button', { name: 'Agregar elemento', exact: true }).click();
      const inspector = designer.locator('homemanager-task-screen.editor');
      await inspector.locator('[data-type=indicator]').click();
      await shot(page, prefix, 'piece');
      await inspector.locator('.task-back').click();
      const learn = rf.locator('.rf-learning homemanager-rf-learn');
      await learn.scrollIntoViewIfNeeded();
      await shot(page, prefix, 'learning-idle');
      await learn.getByLabel('Botón que querés aprender', { exact: true }).fill('Temporizador');
      await learn.getByRole('button', { name: 'Empezar', exact: true }).click();
      await page.evaluate(() => window.rfServer.heard({ frames: 2, burst_frames: 2, bursts: 1 }));
      await expect(learn.locator('progress').first()).toHaveAttribute('value', '2');
      await learn.scrollIntoViewIfNeeded();
      await shot(page, prefix, 'learning-progress');
      await learn.getByRole('button', { name: 'Modo libre', exact: true }).click();
      await shot(page, prefix, 'learning-free');
      await rf.evaluate(node => {
        node.transmitters = [];
        node.rfDevices = [];
        node.learn.guided = true;
        node.learn.stop();
        node.inlineOwner = null;
        node.render();
      });
      await learn.scrollIntoViewIfNeeded();
      await shot(page, prefix, 'learning-offline');

      await page.goto(`${origin}/tests/browser/fixtures/card.html`);
      await page.waitForFunction(() => window.testHarnessReady);
      await page.evaluate(dark => {
        window.testHarness.hass.themes = { darkMode: dark };
        window.testHarness.card.hass = { ...window.testHarness.hass };
      }, dark);
      const card = page.locator('homemanager-card'),
        editor = card.locator('homemanager-editor');
      await card.locator('.hm-menu > summary').click();
      await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
      await card.locator('[data-id=synthetic-light] .primary').click();
      if (!(await editor.locator('#device-controls-section').evaluate(n => n.open)))
        await editor.locator('#device-controls-section > summary').click();
      await editor.getByRole('button', { name: 'Diseñar control', exact: true }).click();
      const haDesigner = editor.locator('homemanager-control-designer');
      await haDesigner.getByRole('button', { name: 'Agregar elemento', exact: true }).click();
      const form = haDesigner.locator('homemanager-task-screen.editor');
      await form.locator('[data-type=title]').click();
      await form.locator('[name=widget-label]').fill('Mi control');
      await form.getByRole('button', { name: 'Guardar', exact: true }).click();
      await expect(form).toHaveCount(0);
      await shot(page, prefix, 'ha-designer');
      await editor.getByRole('button', { name: 'Volver', exact: true }).click();
      await card.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
      await expect(card.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
      await page.reload();
      await page.waitForFunction(() => window.testHarnessReady);
      await page.evaluate(dark => {
        window.testHarness.hass.themes = { darkMode: dark };
        window.testHarness.card.hass = { ...window.testHarness.hass };
      }, dark);
      await card.locator('[data-id=synthetic-light] .primary').click({ button: 'right' });
      await expect(page.locator('homemanager-panel homemanager-rf-remote')).toContainText('Mi control');
      await shot(page, prefix, 'control');

      await page.goto(`${origin}/docs/vision-mockup.html`);
      for (const [selector, name] of [
        ['#s6', 'reference-components'],
        ['#s10', 'reference-learning'],
      ]) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        await shot(page, prefix, name, true);
      }
      await context.close();
      console.log(prefix + ': 8 changed surfaces + 2 references');
    }
  }
  const file = path.join(root, 'docs/public-assets.json'),
    manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.assets = [...manifest.assets.filter(a => !a.path.startsWith(folder + '/')), ...assets];
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ captures: assets.length }));
} finally {
  await browser.close();
}
