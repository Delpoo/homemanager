// End-to-end check against a REAL, disposable Home Assistant instance running
// the HomeManager integration. Never point it at a real installation: it
// creates a home, saves dashboards and toggles the `light.e2e_lamp` entity.
//
// Usage: HM_E2E_CREDENTIALS=path/to/TEST_CREDENTIALS.local.json node tests/e2e/local-ha.e2e.mjs
// The credentials file holds {hassUrl, clientId, tokens} of a TEST account
// (see docs/handoff-agent4.md for how the instance is prepared).
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const credentials = JSON.parse(readFileSync(process.env.HM_E2E_CREDENTIALS, 'utf8'));
const base = credentials.hassUrl;
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/, 'Only a local disposable instance is allowed');
const out = process.env.HM_E2E_OUTPUT ?? '.work/e2e';
mkdirSync(out, { recursive: true });
const headers = { Authorization: `Bearer ${credentials.tokens.access_token}`, 'Content-Type': 'application/json' };
const rest = async (path, body) => { const response = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body) }); assert.ok(response.ok, `${path}: ${response.status}`); return response.json(); };

/** One websocket command with the test token (Node 22+ has a global WebSocket). */
const ws = message => new Promise((resolve, reject) => {
  const socket = new WebSocket(`${base.replace(/^http/, 'ws')}/api/websocket`);
  socket.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === 'auth_required') socket.send(JSON.stringify({ type: 'auth', access_token: credentials.tokens.access_token }));
    else if (data.type === 'auth_ok') socket.send(JSON.stringify({ id: 1, ...message }));
    else if (data.type === 'auth_invalid') { socket.close(); reject(new Error('auth_invalid')); }
    else if (data.id === 1) { socket.close(); resolve(data); }
  };
  socket.onerror = reject;
});
// Re-runnable: remove the test home left by a previous run.
const previous = await ws({ type: 'homemanager/home/get', home_id: 'e2e-casa' });
if (previous.success) await ws({ type: 'homemanager/home/delete', home_id: 'e2e-casa', expected_revision: previous.result.revision });

const plan = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><rect id="room-salon" x="10" y="10" width="480" height="480" fill="#e7ece2" stroke="#3f5d50" stroke-width="4"><title>Salón</title></rect><rect id="room-cocina" x="500" y="10" width="290" height="480" fill="#efe6d3" stroke="#3f5d50" stroke-width="4"/></svg>';
const configuration = {
  schemaVersion: 2, rooms: [{ id: 'salon', label: 'Salón' }, { id: 'cocina', label: 'Cocina' }],
  catalog: { schemaVersion: 2, devices: [{ id: 'lampara', roomId: 'salon', kind: 'light', position: { x: .3, y: .5 }, mobility: 'editable', display: { label: 'Lámpara E2E', icon: 'mdi:lamp' }, bindings: { entityId: 'light.e2e_lamp', primaryAction: 'lampara-toggle', advancedPopupId: null }, state: { value: 'unknown', confidence: 'unknown' } }] },
  architecture: { format: 'svg', content: plan },
  actions: { 'lampara-toggle': { domain: 'light', service: 'toggle', target: { entity_id: 'light.e2e_lamp' } } },
  panels: {}, stateSources: {}, commandTtlSeconds: 30,
};

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
await context.addInitScript(([tokens, hassUrl, clientId]) => {
  localStorage.setItem('hassTokens', JSON.stringify({ ...tokens, hassUrl, clientId, expires: Date.now() + tokens.expires_in * 1000 }));
}, [credentials.tokens, base, credentials.clientId]);
const page = await context.newPage();
const errors = [];
// Only errors raised by HomeManager's bundle fail the run; HA's own frontend may
// log unrelated rejections on a minimal test instance (missing optional integrations).
const foreign = [];
page.on('pageerror', error => (String(error.stack).includes('/homemanager_files/') ? errors : foreign).push(`${error.message} @ ${String(error.stack).split('\n').slice(0, 3).join(' | ')}`));
const step = async (name, fn) => {
  process.stdout.write(`- ${name} … `);
  try { await fn(); } catch (error) {
    const messages = await page.locator('.status').allTextContents().catch(() => []);
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    console.log(`FAILED
  status messages: ${JSON.stringify(messages.filter(Boolean))}
  page errors: ${JSON.stringify(errors)}`);
    throw error;
  }
  console.log('ok');
};

const app = page.locator('homemanager-app');
const card = app.locator('homemanager-card');
const status = card.locator('.shell > .status');

await step('the sidebar panel is registered and served by the integration', async () => {
  await page.goto(`${base}/homemanager`);
  await app.getByText('Todavía no hay hogares').waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${out}/01-empty-panel.png` });
});
await step('an administrator creates a home from the editor', async () => {
  await app.getByLabel('ID del hogar', { exact: true }).fill('e2e-casa');
  await app.getByRole('button', { name: 'Crear hogar', exact: true }).click();
  await status.filter({ hasText: 'todavía no existe' }).waitFor();
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await status.filter({ hasText: 'se creará' }).waitFor();
  await card.locator('summary').filter({ hasText: 'Importar y exportar' }).click();
  await card.getByLabel('Importar JSON o SVG', { exact: true }).setInputFiles({ name: 'casa.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(configuration)) });
  const download = page.waitForEvent('download'); await card.getByRole('button', { name: 'Exportar copia actual', exact: true }).click(); await download;
  await card.getByRole('button', { name: 'Aplicar importación al borrador', exact: true }).click();
  await card.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await status.filter({ hasText: 'Guardado en Home Assistant' }).waitFor();
});
await step('the home persists in HA storage and survives a reload', async () => {
  await page.reload();
  await card.getByRole('button', { name: 'Acción principal de Lámpara E2E', exact: true }).waitFor({ timeout: 30000 });
  await card.getByRole('button', { name: 'Encuadrar Salón', exact: true }).waitFor();
  await page.waitForTimeout(800); // let HA's view transition finish
  await page.screenshot({ path: `${out}/02-home-in-panel.png` });
});
await step('the primary action calls the real HA service', async () => {
  const before = (await rest('/api/states/light.e2e_lamp')).state;
  await card.getByRole('button', { name: 'Acción principal de Lámpara E2E', exact: true }).click();
  for (let i = 0; i < 20 && (await rest('/api/states/light.e2e_lamp')).state === before; i++) await page.waitForTimeout(250);
  assert.notEqual((await rest('/api/states/light.e2e_lamp')).state, before);
});
await step('a Lovelace card references the home without embedding the plan', async () => {
  const ws = await page.evaluate(async () => {
    const hass = document.querySelector('home-assistant').hass;
    const dashboards = await hass.callWS({ type: 'lovelace/dashboards/list' });
    if (!dashboards.some(item => item.url_path === 'e2e-plano')) await hass.callWS({ type: 'lovelace/dashboards/create', url_path: 'e2e-plano', title: 'E2E plano', mode: 'storage', require_admin: false, show_in_sidebar: true });
    await hass.callWS({ type: 'lovelace/config/save', url_path: 'e2e-plano', config: { title: 'E2E', views: [{ title: 'Plano', cards: [{ type: 'custom:homemanager-card', card_id: 'plano', home_id: 'e2e-casa' }] }] } });
    return JSON.stringify(await hass.callWS({ type: 'lovelace/config', url_path: 'e2e-plano' }));
  });
  assert.ok(!ws.includes('<svg'), 'the dashboard must not contain the plan');
  await page.goto(`${base}/e2e-plano/0`);
  await page.locator('homemanager-card').getByRole('button', { name: 'Acción principal de Lámpara E2E', exact: true }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(800); // let HA's view transition finish
  await page.screenshot({ path: `${out}/03-lovelace-card.png` });
});
await step('a save with a stale revision is rejected by HA', async () => {
  const result = await page.evaluate(async configuration => {
    const hass = document.querySelector('home-assistant').hass;
    try { await hass.callWS({ type: 'homemanager/home/save', home_id: 'e2e-casa', expected_revision: 1, configuration: { ...configuration, rooms: [{ id: 'salon', label: 'Pisado' }] } }); return 'saved'; }
    catch (error) { return error.code; }
  }, configuration);
  // Revision 1 was the creation; nothing else saved, so this must succeed once…
  assert.equal(result, 'saved');
  const again = await page.evaluate(async configuration => {
    const hass = document.querySelector('home-assistant').hass;
    try { await hass.callWS({ type: 'homemanager/home/save', home_id: 'e2e-casa', expected_revision: 1, configuration }); return 'saved'; }
    catch (error) { return error.code; }
  }, configuration);
  // …and the second writer with the same base revision must lose.
  assert.equal(again, 'revision_conflict');
});
await step('the open card follows the other writer without reloading the page', async () => {
  await page.locator('homemanager-card').getByRole('button', { name: 'Encuadrar Pisado', exact: true }).waitFor({ timeout: 15000 });
});
await step('the bundle is public software; plans are only reachable over the authenticated websocket', async () => {
  const bundle = await fetch(`${base}/homemanager_files/homemanager.js`);
  assert.equal(bundle.status, 200);
  const anonymous = await fetch(`${base}/api/states`);
  assert.equal(anonymous.status, 401);
});
assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
await browser.close();
console.log(`All end-to-end checks passed. Screenshots in ${out}.${foreign.length ? ` Ignored ${foreign.length} page error(s) outside HomeManager: ${foreign.map(item => item.slice(0, 160)).join(' || ')}` : ''}`);
