import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A single capture pass, with fictional fixtures and no external requests.
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const folder = 'docs/evidence/rediseno-lote1';
await mkdir(path.join(root, folder), { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(file => file && existsSync(file));
const browser = await chromium.launch({ executablePath });
const origin = ['http:', '', 'fictional.invalid'].join('/');
const assets = [];
const card = page => page.locator('homemanager-card');
const view = page => page.locator('homemanager-insights');
async function load(page, fixture, dark) {
  await page.goto(`${origin}/tests/browser/fixtures/${fixture}.html`);
  await page.waitForFunction(
    name => window[name],
    fixture === 'shell' ? 'shellHarnessReady' : 'deviceScreenHarnessReady',
  );
  await page.evaluate(dark => {
    const { card, hass } = window.testHarness;
    hass.themes.darkMode = dark;
    card.hass = { ...hass };
  }, dark);
}
async function shot(page, prefix, name) {
  const relative = `${folder}/${prefix}-${name}.png`;
  const overflow = await page.evaluate(() => {
    const host = document.querySelector('homemanager-card');
    if (!host) return false;
    const nodes = [
      host.shadowRoot.querySelector('.layers'),
      ...host.shadowRoot
        .querySelector('homemanager-insights')
        .shadowRoot.querySelectorAll('.device-footer,.device-channels'),
    ];
    return nodes
      .filter(node => node?.getClientRects().length)
      .some(node => {
        const box = node.getBoundingClientRect();
        return box.left < -1 || box.right > innerWidth + 1;
      });
  });
  if (overflow) throw new Error(`Overflow: ${relative}`);
  const bytes = await page.screenshot({ path: path.join(root, relative), scale: 'css', animations: 'disabled' });
  const size = page.viewportSize();
  if (bytes.readUInt32BE(16) !== size.width || bytes.readUInt32BE(20) !== size.height)
    throw new Error('Wrong capture size');
  assets.push({
    path: relative,
    source: 'scripts/capture-redesign-lote1.mjs',
    review: 'fictional-only',
    reviewDate: '2026-10-31',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
try {
  for (const [size, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    for (const dark of [false, true]) {
      const context = await browser.newContext({
        viewport,
        reducedMotion: 'reduce',
        ...(size === 'mobile' ? { isMobile: true, hasTouch: true } : {}),
      });
      const page = await context.newPage();
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        const relative = decodeURIComponent(url.pathname).slice(1);
        const file = path.resolve(root, relative);
        if (
          url.origin !== origin ||
          !file.startsWith(root + path.sep) ||
          !/^(tests\/browser\/fixtures\/|dist\/|\.work\/|docs\/vision-mockup\.html$)/.test(relative)
        )
          return route.abort();
        try {
          await route.fulfill({
            contentType:
              { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' }[
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
      await expect(card(page).locator('.alert-pill')).toHaveAttribute('data-active', 'false');
      await shot(page, prefix, 'plan');
      await page.evaluate(() =>
        window.testHarness.updateState('binary_sensor.synthetic_leak', 'on', { device_class: 'moisture' }),
      );
      await expect(card(page).locator('.alert-pill')).toHaveAttribute('data-active', 'true');
      await shot(page, prefix, 'alerts');
      await card(page).getByRole('button', { name: 'Minimizar capas', exact: true }).click();
      await shot(page, prefix, 'layers');
      await card(page).locator('.hm-menu > summary').click();
      await card(page).getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
      await expect(
        page
          .getByRole('region', { name: 'Ajustes del plano', exact: true })
          .getByRole('checkbox', { name: /Mostrar capas/ }),
      ).toBeVisible();
      await shot(page, prefix, 'settings');
      await load(page, 'device-screen', dark);
      const handle = view(page).getByRole('button', { name: 'Mostrar Ahora', exact: true });
      if (await handle.isVisible()) await handle.click();
      await view(page).locator('[data-action=device][data-key=power]').click();
      await expect(view(page).getByRole('rowheader')).toHaveCount(6);
      await expect(view(page).getByRole('button', { name: 'Editar', exact: true })).toBeVisible();
      await shot(page, prefix, 'meter');
      for (const label of ['Otras lecturas', 'Diagnóstico'])
        await view(page).locator('summary').filter({ hasText: label }).click();
      await shot(page, prefix, 'readings');
      await view(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
      await card(page).getByRole('button', { name: 'Sensor de ambiente', exact: true }).click();
      await expect(view(page).locator('.device-channels')).toHaveCount(0);
      await shot(page, prefix, 'sensor');
      await view(page).getByRole('button', { name: 'Cerrar', exact: true }).click();
      await card(page).getByRole('button', { name: 'Encuadrar Dormitorio', exact: true }).click();
      await card(page).getByRole('button', { name: 'Aire Dormitorio', exact: true }).click();
      await expect(view(page).locator('.device-stepper output')).toHaveText('22°C');
      await shot(page, prefix, 'climate');
      for (const section of ['shell', 'device']) {
        await page.goto(origin + '/docs/vision-mockup.html');
        await page.locator('body').evaluate((node, dark) => {
          for (const surface of node.querySelectorAll('.app,.phone')) surface.classList.toggle('dark', dark);
        }, dark);
        const target =
          section === 'shell'
            ? size === 'mobile'
              ? '#phone'
              : '#desk'
            : size === 'mobile'
              ? '#s8 ~ .phones .phone'
              : '#s8 + .note + .scroll .app';
        await page
          .locator(target)
          .first()
          .evaluate(node => node.scrollIntoView({ block: 'start', inline: 'start' }));
        await shot(page, prefix, `reference-${section}`);
      }
      console.log(`${prefix}: 8 changed screens + 2 references`);
      await context.close();
    }
  }
  const manifestPath = path.join(root, 'docs/public-assets.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.assets = [...manifest.assets.filter(asset => !asset.path.startsWith(folder + '/')), ...assets];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${assets.length} fictional captures registered`);
} finally {
  await browser.close();
}
