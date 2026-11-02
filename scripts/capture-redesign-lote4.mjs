import { chromium, expect } from '@playwright/test';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url))),
  folder = 'docs/evidence/rediseno-lote4';
await mkdir(path.join(root, folder), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['src/card/index.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: '.work/lote4-before.js',
  define: { __HOMEMANAGER_VERSION__: JSON.stringify('0.11.0-beta.1') },
  plugins: [
    {
      name: 'previous-room-view',
      setup(builder) {
        builder.onLoad({ filter: /src[\\/]card[\\/](room-view|styles)\.ts$/ }, args => ({
          contents: (() => {
            for (const ref of ['4cdb8477e53aea93d1476d5e96bfda3f9ee6c5bc', 'a88c8aa']) {
              try {
                return execFileSync('git', ['show', ref + ':src/card/' + path.basename(args.path)], {
                  encoding: 'utf8',
                  cwd: root,
                  stdio: ['ignore', 'pipe', 'ignore'],
                });
              } catch {}
            }
            throw Error('The validated batch 3 base is needed for before/after capture');
          })(),
          loader: 'ts',
        }));
      },
    },
  ],
});
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const origin = ['http:', '', 'fictional.invalid'].join('/');
const assets = [];
async function shot(page, prefix, name) {
  if (process.env.HM_CAPTURE_ONLY && !process.env.HM_CAPTURE_ONLY.split(',').includes(name)) return;
  const relative = `${folder}/${prefix}-${name}.png`;
  const bytes = await page.screenshot({ path: path.join(root, relative), scale: 'css', animations: 'disabled' });
  assets.push({
    path: relative,
    source: 'scripts/capture-redesign-lote4.mjs',
    review: 'fictional-only',
    reviewDate: '2026-11-03',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
async function routing(page, before = false) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    let rel = decodeURIComponent(url.pathname).slice(1);
    if (before && rel === 'dist/homemanager.js') rel = '.work/lote4-before.js';
    const file = path.resolve(root, rel);
    if (
      url.origin !== origin ||
      !file.startsWith(root + path.sep) ||
      !/^(tests\/browser\/fixtures\/|dist\/|\.work\/|docs\/vision-mockup\.html$|docs\/rediseno\/maqueta-modulos\.html$)/.test(
        rel,
      )
    )
      return route.abort();
    try {
      await route.fulfill({
        contentType:
          { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' }[
            path.extname(file)
          ] ?? 'application/octet-stream',
        body: await readFile(file),
      });
    } catch {
      await route.fulfill({ status: 404, body: 'Missing fictional fixture' });
    }
  });
}
async function setup(page, dark) {
  await page.goto(origin + '/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(dark => {
    const h = window.testHarness,
      c = h.card;
    const call = h.hass.callWS.bind(h.hass);
    const encode = s => btoa([...new TextEncoder().encode(s)].map(n => String.fromCharCode(n)).join(''));
    const data = encode(c.draft.architecture.content);
    h.hass.callWS = async m =>
      m.type === 'homemanager/image/get' ? { format: 'svg', content: data, sha256: m.sha256 } : call(m);
    const config = { ...h.original, configuration: structuredClone(c.draft) };
    const box = [c.box.x, c.box.y, c.box.width, c.box.height];
    config.configuration.planViews = [
      {
        id: 'detail',
        name: 'Detalle',
        light: { scope: 'example', sha256: 'a'.repeat(64), format: 'svg', box },
        dark: { scope: 'example', sha256: 'b'.repeat(64), format: 'svg', box },
        lightBackground: '#eef2ed',
        darkBackground: '#16211b',
      },
      {
        id: 'simple',
        name: 'Simplificado',
        light: { scope: 'example', sha256: 'a'.repeat(64), format: 'svg', box },
        dark: { scope: 'example', sha256: 'b'.repeat(64), format: 'svg', box },
      },
    ];
    config.configuration.nowPanels = {
      home: [
        { id: 'readings', type: 'readings', title: 'Ambiente', readings: ['sensor.synthetic_temperature'] },
        { id: 'active', type: 'active', title: 'Activos' },
      ],
      wall: [{ id: 'readings', type: 'reading', title: 'Ambiente', readings: ['sensor.synthetic_temperature'] }],
    };
    h.mutateRemote(dashboard => {
      dashboard.views[0].cards[0] = structuredClone(config);
    });
    c.setConfig(config);
    c.hass = { ...h.hass, themes: { darkMode: dark } };
  }, dark);
  return page.locator('homemanager-card');
}
async function edit(page, card) {
  await card.locator('.hm-menu>summary').click();
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card.locator('[data-command=settings]').click();
  return card.locator('homemanager-editor');
}
try {
  for (const [size, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ])
    for (const dark of [false, true]) {
      const prefix = `${size}-${dark ? 'dark' : 'light'}`,
        context = await browser.newContext({
          viewport,
          reducedMotion: 'reduce',
          ...(size === 'mobile' ? { isMobile: true, hasTouch: true } : {}),
        }),
        page = await context.newPage();
      await routing(page);
      await page.addInitScript(dark => {
        localStorage.setItem('homemanager-ui-theme', dark ? 'dark' : 'light');
      }, dark);
      let card = await setup(page, dark);
      let editor = await edit(page, card);
      const views = editor.locator('homemanager-plan-views-editor');
      await views.getByRole('button', { name: 'Editar', exact: true }).first().click();
      await expect(views.locator('[data-preview]')).toBeVisible();
      await views.locator('fieldset').evaluate(n => n.scrollIntoView({ block: 'start' }));
      await shot(page, prefix, 'alternatives');
      card = await setup(page, dark);
      editor = await edit(page, card);
      await editor.locator('[data-settings=now-section]').click();
      const panel = editor.locator('homemanager-now-panel-editor');
      await panel.getByRole('button', { name: 'Editar', exact: true }).first().click();
      await shot(page, prefix, 'now-list');
      await panel.locator('fieldset').evaluate(n => n.scrollIntoView({ block: 'start' }));
      await shot(page, prefix, 'now-editor');
      card = await setup(page, dark);
      await card.getByLabel('Alternativa del plano', { exact: true }).selectOption('simple');
      await expect(card.locator('.plan-image')).toBeVisible();
      if (size === 'mobile')
        await card.locator('homemanager-insights').getByRole('button', { name: 'Mostrar Ahora', exact: true }).click();
      await shot(page, prefix, 'now');
      card = await setup(page, dark);
      await card.getByRole('button', { name: 'Vista por espacio', exact: true }).click();
      await expect(card.locator('.nav-arrow').first()).toBeVisible();
      await shot(page, prefix, 'room');
      if (size === 'desktop') {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await shot(page, 'desktop-wide-' + (dark ? 'dark' : 'light'), 'room');
        await page.setViewportSize(viewport);
      }
      card = await setup(page, dark);
      await card.locator('.hm-menu>summary').click();
      await card.getByRole('button', { name: 'Modo pared', exact: true }).click();
      await expect(card).toHaveAttribute('data-wall', 'true');
      await expect(card.locator('.plan-image')).toBeVisible();
      await shot(page, prefix, 'wall');
      await card.getByRole('button', { name: 'Salir del modo pared', exact: true }).click();
      if (size === 'desktop') {
        for (const [url, selector, name] of [
          ['docs/rediseno/maqueta-modulos.html', '#alternativas', 'reference-alternatives'],
          ['docs/vision-mockup.html', '#s6', 'reference-components'],
          ['docs/vision-mockup.html', '#s13', 'reference-room'],
        ]) {
          await page.goto(origin + '/' + url);
          await page.locator(selector).scrollIntoViewIfNeeded();
          await shot(page, prefix, name);
        }
      }
      await context.close();
      console.log(prefix + ' captured');
    }
  for (const dark of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' }),
      page = await context.newPage();
    await routing(page, true);
    const card = await setup(page, dark);
    await card.getByRole('button', { name: 'Vista por espacio', exact: true }).click();
    const before = await card.evaluate(c => c.currentRoom);
    await card.getByRole('button', { name: 'Ir a Espacio B', exact: true }).click();
    expect(await card.evaluate(c => c.currentRoom)).toBe(before);
    await shot(page, `desktop-wide-${dark ? 'dark' : 'light'}`, 'before-room');
    await context.close();
  }
  const file = path.join(root, 'docs/public-assets.json'),
    manifest = JSON.parse(await readFile(file, 'utf8'));
  const replaced = new Set(assets.map(a => a.path));
  manifest.assets = [...manifest.assets.filter(a => !replaced.has(a.path)), ...assets];
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  console.log('Captures: ' + assets.length);
} finally {
  await browser.close();
}
