import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only fictional fixtures. This script never connects to Home Assistant.
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.join(root, 'docs/evidence/rediseno-e02');
await mkdir(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(candidate => candidate && existsSync(candidate));
const browser = await chromium.launch({ executablePath });
const origin = ['http:', '', 'fictional.invalid'].join('/');
const card = page => page.locator('homemanager-card');
const screen = (page, name) => page.getByRole('region', { name, exact: true });
async function begin(page, dark, empty = false) {
  await page.goto(origin + '/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(
    ({ dark, empty }) => {
      const { card, hass } = window.testHarness;
      hass.themes = { darkMode: dark };
      card.hass = { ...hass };
      if (empty) {
        const configuration = card.getDraftConfiguration();
        configuration.architecture.content =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700"><rect x="20" y="20" width="960" height="660" fill="#eee" stroke="#456"/></svg>';
        configuration.rooms = [];
        for (const device of configuration.catalog.devices) device.roomId = null;
        window.testHarness.mutateRemote(dashboard => {
          dashboard.views[0].cards[0].configuration = configuration;
        });
      }
    },
    { dark, empty },
  );
  await card(page).locator('.hm-menu > summary').click();
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
}
async function capture(page, prefix, name) {
  // Check the CSS viewport, including shadow roots; PNG uses one pixel per CSS pixel.
  const overflow = await page.evaluate(() => {
    const failures = [];
    const visit = root => {
      for (const node of root.querySelectorAll('*')) {
        if (node.shadowRoot) visit(node.shadowRoot);
        if (node.matches('.zones-bar, .zones-row') && node.getClientRects().length) {
          if (node.scrollWidth > node.clientWidth + 1) failures.push('zone-toolbar');
        }
        if (node.localName !== 'homemanager-task-screen' || !node.hasAttribute('open')) continue;
        if (getComputedStyle(node).visibility === 'hidden') continue;
        const box = node.getBoundingClientRect();
        if (box.left < -1 || box.right > innerWidth + 1 || node.scrollWidth > node.clientWidth + 1)
          failures.push(node.getAttribute('aria-label'));
        const body = node.querySelector('.task-body');
        if (body && body.scrollWidth > body.clientWidth + 1) failures.push('body');
      }
    };
    visit(document);
    return failures;
  });
  if (overflow.length) throw new Error('Horizontal overflow: ' + overflow.join(', '));
  const target = path.join(output, `${prefix}-${name}.png`);
  const only = process.argv
    .find(argument => argument.startsWith('--only='))
    ?.slice(7)
    .split(',');
  if (only && !only.includes(`${prefix}-${name}`)) return;
  if (!process.argv.includes('--resume') || !existsSync(target)) await page.screenshot({ path: target });
}
try {
  for (const [size, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    for (const dark of [false, true]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.addInitScript(() => localStorage.clear());
      await page.route('**/*', async route => {
        const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
        const file = path.resolve(root, relative);
        if (!file.startsWith(root + path.sep) || !/^(tests\/browser\/fixtures\/|dist\/)/.test(relative))
          return route.abort();
        try {
          await route.fulfill({
            body: await readFile(file),
            contentType: { '.html': 'text/html', '.js': 'text/javascript' }[path.extname(file)] ?? 'text/plain',
          });
        } catch {
          await route.fulfill({ status: 404, body: 'Missing fictional fixture' });
        }
      });
      const prefix = `${size}-${dark ? 'dark' : 'light'}`;
      await begin(page, dark, true);
      await screen(page, 'Este plano no tiene zonas').waitFor();
      await capture(page, prefix, 'first-space');
      await screen(page, 'Este plano no tiene zonas')
        .getByRole('button', { name: 'Dibujar el primero', exact: true })
        .click();
      await card(page).locator('.zones-draw').waitFor();
      await capture(page, prefix, 'zones');

      await begin(page, dark);
      await card(page).getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
      await card(page).locator('homemanager-editor').getByRole('button', { name: 'Editar zonas', exact: true }).click();
      await card(page).getByRole('combobox', { name: 'Zona', exact: true }).selectOption('office');
      await card(page).getByRole('button', { name: 'Agregar rectángulo', exact: true }).click();
      const points = await card(page).evaluate(node => {
        const box = node.viewport.getBoundingClientRect();
        const point = (x, y) => ({
          x: box.left + node.camera.x + (node.box.x + x * node.box.width) * node.camera.scale,
          y: box.top + node.camera.y + (node.box.y + y * node.box.height) * node.camera.scale,
        });
        return [point(0.2, 0.28), point(0.3, 0.38)];
      });
      await page.mouse.move(points[0].x, points[0].y);
      await page.mouse.down();
      await page.mouse.move(points[1].x, points[1].y, { steps: 5 });
      await page.mouse.up();
      await card(page).getByRole('button', { name: 'Aplicar', exact: true }).click();
      await screen(page, 'Dispositivos que cambian de espacio').waitFor();
      await capture(page, prefix, 'zone-moves');

      await page.goto(origin + '/tests/browser/fixtures/card.html');
      await page.waitForFunction(() => window.testHarnessReady);
      await page.evaluate(dark => {
        const { hass } = window.testHarness;
        hass.themes = { darkMode: dark };
        const prior = hass.callWS.bind(hass);
        hass.callWS = async message =>
          message.type === 'homemanager/homes'
            ? { homes: [] }
            : message.type === 'homemanager/storage/status'
              ? { bytes: 1024, retained_home_ids: ['fictional-deleted'] }
              : prior(message);
        const app = document.createElement('homemanager-app');
        document.querySelector('#mount').replaceChildren(app);
        app.hass = hass;
        void app.openStorage();
      }, dark);
      await screen(page, 'Almacenamiento').getByText('fictional-deleted', { exact: false }).waitFor();
      await capture(page, prefix, 'storage');
      console.log(prefix + ': four fictional screens captured');
      await context.close();
    }
  }
} finally {
  await browser.close();
}
