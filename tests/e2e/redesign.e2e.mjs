import { chromium, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const credentials = JSON.parse(readFileSync(process.env.HM_E2E_CREDENTIALS, 'utf8'));
const base = credentials.hassUrl;
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):18139$/, 'Only the disposable CI instance is allowed');
const response = await fetch(base + '/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credentials.tokens.refresh_token,
    client_id: credentials.clientId,
  }),
});
assert.ok(response.ok);
Object.assign(credentials.tokens, await response.json());
const ws = message =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/websocket');
    const timer = setTimeout(() => {
      socket.close();
      reject(Error('Test websocket timed out'));
    }, 15000);
    socket.onmessage = event => {
      const data = JSON.parse(event.data);
      if (data.type === 'auth_required')
        socket.send(JSON.stringify({ type: 'auth', access_token: credentials.tokens.access_token }));
      if (data.type === 'auth_ok') socket.send(JSON.stringify({ id: 1, ...message }));
      if (data.id === 1) {
        clearTimeout(timer);
        socket.close();
        data.success ? resolve(data.result) : reject(Error(data.error?.message));
      }
    };
    socket.onerror = reject;
  });
const plan =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect id="room-living" width="100" height="100" fill="#ddeedd"/><rect id="room-office" x="100" width="100" height="100" fill="#eeeeff"/></svg>';
const config = {
  schemaVersion: 2,
  rooms: [
    { id: 'living', label: 'Living' },
    { id: 'office', label: 'Office' },
  ],
  catalog: {
    schemaVersion: 2,
    devices: [
      {
        id: 'lamp',
        roomId: 'living',
        kind: 'light',
        position: { x: 0.25, y: 0.5 },
        mobility: 'editable',
        display: { label: 'Lámpara E2E', icon: 'mdi:lamp' },
        bindings: { entityId: 'light.e2e_lamp', primaryAction: 'lamp-toggle', advancedPopupId: null },
        state: { value: 'unknown', confidence: 'unknown' },
      },
    ],
  },
  architecture: { format: 'svg', content: plan },
  actions: { 'lamp-toggle': { domain: 'light', service: 'toggle', target: { entity_id: 'light.e2e_lamp' } } },
  panels: {},
  stateSources: {},
};
await ws({ type: 'homemanager/home/save', home_id: 'e2e-redesign', expected_revision: null, configuration: config });
const state = await fetch(base + '/api/states/sensor.e2e_temperature', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + credentials.tokens.access_token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    state: '22',
    attributes: { friendly_name: 'Temperatura E2E', device_class: 'temperature', unit_of_measurement: '°C' },
  }),
});
assert.ok(state.ok);
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
);
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await context.addInitScript(
  ([tokens, hassUrl, clientId]) => {
    localStorage.setItem(
      'hassTokens',
      JSON.stringify({ ...tokens, hassUrl, clientId, expires: Date.now() + tokens.expires_in * 1000 }),
    );
    localStorage.setItem('homemanager-app-home', 'e2e-redesign');
  },
  [credentials.tokens, base, credentials.clientId],
);
const page = await context.newPage();
page.on('websocket', socket => {
  const commands = new Map();
  socket.on('framesent', ({ payload }) => {
    try {
      const message = JSON.parse(String(payload));
      if (message.id && message.type) commands.set(message.id, message.type);
    } catch {
      /* Non-JSON transport frames. */
    }
  });
  socket.on('framereceived', ({ payload }) => {
    try {
      const message = JSON.parse(String(payload));
      if (message.type === 'result' && message.success === false)
        console.log(
          'Frontend websocket error:',
          JSON.stringify({ command: commands.get(message.id), error: message.error }),
        );
    } catch {
      /* Non-JSON transport frames. */
    }
  });
});
const errors = [];
const frontendErrors = [];
page.on('pageerror', error => {
  frontendErrors.push(error.message);
  if (String(error.stack).includes('/homemanager_files/')) errors.push(error.message);
});
mkdirSync('.work/e2e-redesign', { recursive: true });
try {
  await page.goto(base + '/homemanager');
  await expect(page.locator('homemanager-app')).toBeVisible({ timeout: 60000 });
  const confirmation = page.getByRole('button', { name: 'Confirmar', exact: true });
  if (await confirmation.isVisible().catch(() => false)) await confirmation.click();
  const card = page.locator('homemanager-app homemanager-card');
  await expect(card.locator('[data-id=lamp] .primary')).toBeVisible({ timeout: 60000 });
  console.log('ok: legacy plan loads from actual persistent HA storage');
  await card.locator('.hm-menu>summary').click();
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card.locator('[data-command=settings]').click();
  const editor = card.locator('homemanager-editor');
  const views = editor.locator('homemanager-plan-views-editor');
  await views.getByRole('button', { name: 'Agregar alternativa', exact: true }).click();
  await views.getByLabel('Nombre', { exact: true }).fill('E2E alternative');
  await views
    .locator('[data-image]')
    .setInputFiles({ name: 'synthetic.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(plan) });
  await expect(views.locator('[data-preview]')).toBeVisible();
  await views.getByRole('button', { name: 'Guardar alternativa', exact: true }).click();
  await expect(views.getByText('E2E alternative', { exact: true })).toBeVisible();
  console.log('ok: authenticated upload, actual image storage and browser preview');
  await editor.locator('[data-settings=now-section]').click();
  const panel = editor.locator('homemanager-now-panel-editor');
  await panel.locator('[data-type]').selectOption('reading');
  await panel.getByRole('button', { name: 'Agregar bloque', exact: true }).click();
  await panel.locator('[data-field=readings]').selectOption('sensor.e2e_temperature');
  await expect(panel.locator('.preview')).toContainText('22');
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(card.locator('.shell>.status')).toContainText('Guardado en Home Assistant', { timeout: 30000 });
  const saved = await ws({ type: 'homemanager/home/get', home_id: 'e2e-redesign' });
  assert.equal(saved.configuration.planViews.length, 1);
  assert.equal(saved.configuration.nowPanels.home[0].readings[0], 'sensor.e2e_temperature');
  assert.deepEqual(saved.configuration.catalog.devices[0].position, { x: 0.25, y: 0.5 });
  console.log('ok: live reading, UI save, backend readback and geometry preservation');
  await card.getByRole('button', { name: 'Salir de edición', exact: true }).click();
  await page.reload();
  await expect(card.locator('[data-id=lamp] .primary')).toBeVisible({ timeout: 30000 });
  await card.getByLabel('Alternativa del plano', { exact: true }).selectOption(saved.configuration.planViews[0].id);
  await expect(card.locator('.plan-image')).toBeVisible();
  await expect(card.locator('homemanager-insights')).toContainText('22');
  const image = saved.configuration.planViews[0].light;
  assert.ok((await ws({ type: 'homemanager/image/get', scope: image.scope, sha256: image.sha256 })).content);
  console.log('ok: actual reload restores image bytes and configured Now panel');
  await card.locator('[data-id=lamp] .primary').click();
  await expect(card.locator('.sent-note')).toContainText('Enviado', { timeout: 15000 });
  assert.equal(await card.getByText('confirmado', { exact: true }).count(), 0);
  console.log('ok: a real HA service is sent without claiming physical confirmation');
  await card.getByRole('button', { name: 'Vista por espacio', exact: true }).click();
  const arrow = card.locator('.nav-arrow').first();
  await expect(arrow).toBeVisible();
  const room = await card.evaluate(c => c.currentRoom);
  await arrow.click();
  await expect.poll(() => card.evaluate(c => c.currentRoom)).not.toBe(room);
  console.log('ok: mouse room navigation on the actual HA frontend');
  await card.locator('.hm-menu>summary').click();
  await card.getByRole('button', { name: 'Modo pared', exact: true }).click();
  await expect(card).toHaveAttribute('data-wall', 'true');
  assert.ok(await page.evaluate(() => !!document.fullscreenElement));
  await card.getByRole('button', { name: 'Salir del modo pared', exact: true }).click();
  await expect(card).not.toHaveAttribute('data-wall', 'true');
  console.log('ok: actual fullscreen wall mode and exit');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    card.locator('homemanager-insights').getByRole('button', { name: 'Mostrar Ahora', exact: true }),
  ).toBeVisible();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  await page.screenshot({ path: '.work/e2e-redesign/mobile.png' });
  assert.deepEqual(errors, []);
  console.log('All disposable Home Assistant redesign end-to-end checks passed.');
} catch (error) {
  console.log(
    'Frontend diagnostics:',
    JSON.stringify({
      path: new URL(page.url()).pathname,
      appCount: await page.locator('homemanager-app').count(),
      cardCount: await page.locator('homemanager-card').count(),
      messages: await page.locator('.status, .error, .messages').allTextContents(),
      body: (await page.locator('body').innerText()).slice(0, 1600),
      frontendErrors,
    }),
  );
  await page.screenshot({ path: '.work/e2e-redesign/failure.png' }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
