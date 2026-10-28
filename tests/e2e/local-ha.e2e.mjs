// End-to-end check against a REAL, DISPOSABLE Home Assistant running the
// HomeManager integration. Never point it at a real installation: it creates a
// home, saves dashboards and switches the `light.e2e_*` test entities.
//
// Prepare the instance with tests/e2e/prepare_local_ha.py (see docs/testing.md),
// then: HM_E2E_CREDENTIALS=path/to/TEST_CREDENTIALS.local.json node tests/e2e/local-ha.e2e.mjs
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const credentials = JSON.parse(readFileSync(process.env.HM_E2E_CREDENTIALS, 'utf8'));
const base = credentials.hassUrl;
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/, 'Only a local disposable instance is allowed');
// Access tokens live 30 minutes: always start from a fresh one.
{
  const response = await fetch(`${base}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.tokens.refresh_token,
      client_id: credentials.clientId,
    }),
  });
  assert.ok(response.ok, `token refresh failed: ${response.status}`);
  Object.assign(credentials.tokens, await response.json());
}
const out = process.env.HM_E2E_OUTPUT ?? '.work/e2e';
mkdirSync(out, { recursive: true });
const headers = { Authorization: `Bearer ${credentials.tokens.access_token}`, 'Content-Type': 'application/json' };
const rest = async path => {
  const response = await fetch(`${base}${path}`, { headers });
  assert.ok(response.ok, `${path}: ${response.status}`);
  return response.json();
};
/** One websocket command with the test token (Node 22+ has a global WebSocket). */
const ws = message =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`${base.replace(/^http/, 'ws')}/api/websocket`);
    socket.onmessage = event => {
      const data = JSON.parse(event.data);
      if (data.type === 'auth_required')
        socket.send(JSON.stringify({ type: 'auth', access_token: credentials.tokens.access_token }));
      else if (data.type === 'auth_ok') socket.send(JSON.stringify({ id: 1, ...message }));
      else if (data.type === 'auth_invalid') {
        socket.close();
        reject(new Error('auth_invalid'));
      } else if (data.id === 1) {
        socket.close();
        resolve(data);
      }
    };
    socket.onerror = reject;
  });
// Re-runnable: remove the test home left by a previous run.
for (const homeId of ['e2e-casa', 'home']) {
  const previous = await ws({ type: 'homemanager/home/get', home_id: homeId });
  if (previous.success)
    await ws({ type: 'homemanager/home/delete', home_id: homeId, expected_revision: previous.result.revision });
}
const stored = async () => (await ws({ type: 'homemanager/home/get', home_id: 'e2e-casa' })).result;

const planA =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><rect id="room-salon" x="10" y="10" width="480" height="480" fill="#e7ece2" stroke="#3f5d50" stroke-width="4"><title>Salón</title></rect><rect id="room-cocina" x="500" y="10" width="290" height="480" fill="#efe6d3" stroke="#3f5d50" stroke-width="4"/></svg>';
// The same drawing extended to the right: positions must stay on the same point.
const planB = planA
  .replace('viewBox="0 0 800 500"', 'viewBox="0 0 1100 500"')
  .replace('</svg>', '<rect id="room-terraza" x="800" y="10" width="290" height="480" fill="#dfe9ef"/></svg>');
const configuration = {
  schemaVersion: 2,
  rooms: [
    { id: 'salon', label: 'Salón' },
    { id: 'cocina', label: 'Cocina' },
  ],
  catalog: {
    schemaVersion: 2,
    devices: [
      {
        id: 'lampara',
        roomId: 'salon',
        kind: 'light',
        position: { x: 0.3, y: 0.5 },
        mobility: 'editable',
        display: { label: 'Lámpara E2E', icon: 'mdi:lamp' },
        bindings: { entityId: 'light.e2e_lamp', primaryAction: 'lampara-toggle', advancedPopupId: null },
        state: { value: 'unknown', confidence: 'unknown' },
      },
    ],
  },
  architecture: { format: 'svg', content: planA },
  actions: { 'lampara-toggle': { domain: 'light', service: 'toggle', target: { entity_id: 'light.e2e_lamp' } } },
  panels: {},
  stateSources: {},
  commandTtlSeconds: 30,
};

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const context = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
await context.addInitScript(
  ([tokens, hassUrl, clientId]) => {
    localStorage.setItem(
      'hassTokens',
      JSON.stringify({ ...tokens, hassUrl, clientId, expires: Date.now() + tokens.expires_in * 1000 }),
    );
  },
  [credentials.tokens, base, credentials.clientId],
);
const page = await context.newPage();
// Only errors raised by HomeManager's bundle fail the run; HA's own frontend may
// log unrelated rejections on a minimal test instance (missing optional integrations).
const errors = [],
  foreign = [];
page.on('pageerror', error =>
  (String(error.stack).includes('/homemanager_files/') ? errors : foreign).push(
    `${error.message} @ ${String(error.stack).split('\n').slice(0, 3).join(' | ')}`,
  ),
);
const app = page.locator('homemanager-app');
const card = app.locator('homemanager-card');
const status = card.locator('.shell > .status');
const step = async (name, fn) => {
  process.stdout.write(`- ${name} … `);
  try {
    await fn();
  } catch (error) {
    const messages = await page
      .locator('.status')
      .allTextContents()
      .catch(() => []);
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    console.log(
      `FAILED\n  status messages: ${JSON.stringify(messages.filter(Boolean))}\n  page errors: ${JSON.stringify(errors)}`,
    );
    throw error;
  }
  console.log('ok');
};
const settle = () => page.waitForTimeout(800); // HA view transitions
async function applyImport() {
  const apply = card.getByRole('button', { name: 'Aplicar importación al borrador', exact: true });
  await apply.waitFor();
  if (await apply.isDisabled()) {
    // A changed viewBox requires a backup of the current version first.
    const download = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Exportar copia actual', exact: true }).click();
    await download;
  }
  await apply.click();
}
async function importFile(name, content, type) {
  await card
    .getByLabel('Importar JSON o SVG', { exact: true })
    .setInputFiles({ name, mimeType: type, buffer: Buffer.from(content) });
  await applyImport();
}
async function save() {
  await card.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await status.filter({ hasText: 'Guardado en Home Assistant' }).waitFor();
}
async function openImport() {
  if (!(await card.locator('details#import-section').evaluate(node => node.open)))
    await card.locator('summary').filter({ hasText: 'Importar y exportar' }).click();
}

await step('the sidebar panel is registered and served by the integration', async () => {
  await page.goto(`${base}/homemanager`);
  await app.getByText('Todavía no hay hogares').waitFor({ timeout: 30000 });
  // HA 2026.10+ asks to confirm a non-default HTTP port on a fresh instance (its
  // own dialog, reverted after 90 s if ignored). Confirm it on this test instance.
  const httpConfirm = page.getByRole('button', { name: 'Confirmar', exact: true });
  if (await httpConfirm.isVisible({ timeout: 4000 }).catch(() => false)) {
    await httpConfirm.click();
    await page.waitForTimeout(1500);
    await page.goto(`${base}/homemanager`);
    await app.getByText('Todavía no hay hogares').waitFor({ timeout: 30000 });
  }
  await page.screenshot({ path: `${out}/01-empty-panel.png` });
});
await step('an administrator creates a home and imports a plan with its devices', async () => {
  await app.getByLabel('ID del hogar', { exact: true }).fill('e2e-casa');
  await app.getByRole('button', { name: 'Crear hogar', exact: true }).click();
  await status.filter({ hasText: 'todavía no existe' }).waitFor();
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await status.filter({ hasText: 'se creará' }).waitFor();
  await openImport();
  await importFile('casa.json', JSON.stringify(configuration), 'application/json');
  await save();
  assert.equal((await stored()).revision, 1);
});
await step('the home persists in HA storage and survives a reload', async () => {
  await page.reload();
  await card.getByRole('button', { name: 'Acción principal de Lámpara E2E', exact: true }).waitFor({ timeout: 30000 });
  await card.getByRole('button', { name: 'Encuadrar Salón', exact: true }).waitFor();
  await settle();
  await page.screenshot({ path: `${out}/02-home-in-panel.png` });
});
await step('a tap runs the primary action on an assumed-state (unknown) entity', async () => {
  const before = (await rest('/api/states/light.e2e_lamp')).state;
  await card.getByRole('button', { name: 'Acción principal de Lámpara E2E', exact: true }).click();
  for (let i = 0; i < 20 && (await rest('/api/states/light.e2e_lamp')).state === before; i++)
    await page.waitForTimeout(250);
  assert.notEqual((await rest('/api/states/light.e2e_lamp')).state, before);
});
await step('the native panel offers brightness and sends it to HA without claiming confirmation', async () => {
  await card.getByRole('button', { name: 'Detalles de Lámpara E2E', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const brightness = dialog.getByRole('slider', { name: 'Brillo' });
  await brightness.fill('60');
  for (let i = 0; i < 20 && (await rest('/api/states/light.e2e_lamp')).attributes.brightness !== 153; i++)
    await page.waitForTimeout(250);
  assert.equal((await rest('/api/states/light.e2e_lamp')).attributes.brightness, 153);
  // assumed_state:true can never be shown as confirmed.
  assert.notEqual(await dialog.locator('.confidence').textContent(), 'Confirmado');
  await page.screenshot({ path: `${out}/03-native-panel.png` });
  await dialog.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
});
await step('a real entity is added by name and placed by tapping its space', async () => {
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  const quick = card.getByLabel('Agregar dispositivo desde Home Assistant', { exact: true });
  await quick.click();
  await quick.pressSequentially('spot');
  await card.locator('.quick [role=option]', { hasText: 'E2E spot' }).click();
  await card.locator('.placing-hint').filter({ hasText: 'Tocá el plano' }).waitFor();
  const zone = await card.locator('#room-cocina').boundingBox();
  await page.mouse.click(zone.x + zone.width * 0.5, zone.y + zone.height * 0.7);
  await save();
  const device = (await stored()).configuration.catalog.devices.find(
    item => item.bindings.entityId === 'light.e2e_spot',
  );
  assert.equal(device.roomId, 'cocina');
  assert.equal(device.bindings.primaryAction, 'e2e-spot-toggle');
});
await step(
  'replacing the plan keeps devices on the same drawing point and a previous plan can be restored',
  async () => {
    await openImport();
    await importFile('plano-b.svg', planB, 'image/svg+xml');
    await save();
    const replaced = (await stored()).configuration;
    assert.match(replaced.architecture.content, /viewBox="0 0 1100 500"/);
    assert.equal(
      replaced.catalog.devices.find(d => d.id === 'lampara').position.x,
      Math.round(((0.3 * 800) / 1100) * 1e6) / 1e6,
    );
    await openImport();
    await card.getByRole('button', { name: 'Planos anteriores', exact: true }).click();
    // Newest first: the last entry is the original plan.
    await card.getByRole('button', { name: 'Restaurar', exact: true }).last().click();
    await applyImport();
    await save();
    const restored = (await stored()).configuration;
    assert.match(restored.architecture.content, /viewBox="0 0 800 500"/);
    assert.ok(Math.abs(restored.catalog.devices.find(d => d.id === 'lampara').position.x - 0.3) < 1e-5);
    await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  },
);
await step('a Lovelace card references the home without embedding the plan', async () => {
  const dashboard = await page.evaluate(async () => {
    const hass = document.querySelector('home-assistant').hass;
    const dashboards = await hass.callWS({ type: 'lovelace/dashboards/list' });
    if (!dashboards.some(item => item.url_path === 'e2e-plano'))
      await hass.callWS({
        type: 'lovelace/dashboards/create',
        url_path: 'e2e-plano',
        title: 'E2E plano',
        mode: 'storage',
        require_admin: false,
        show_in_sidebar: true,
      });
    await hass.callWS({
      type: 'lovelace/config/save',
      url_path: 'e2e-plano',
      config: {
        title: 'E2E',
        views: [
          { title: 'Plano', cards: [{ type: 'custom:homemanager-card', card_id: 'plano', home_id: 'e2e-casa' }] },
        ],
      },
    });
    return JSON.stringify(await hass.callWS({ type: 'lovelace/config', url_path: 'e2e-plano' }));
  });
  assert.ok(!dashboard.includes('<svg'), 'the dashboard must not contain the plan');
  await page.goto(`${base}/e2e-plano/0`);
  await page
    .locator('homemanager-card')
    .getByRole('button', { name: 'Acción principal de Lámpara E2E', exact: true })
    .waitFor({ timeout: 30000 });
  await settle();
  await page.screenshot({ path: `${out}/04-lovelace-card.png` });
});
await step('HA rejects a stale revision and the open card follows the winning writer live', async () => {
  const current = await stored();
  const renamed = {
    ...current.configuration,
    rooms: current.configuration.rooms.map(room => (room.id === 'salon' ? { ...room, label: 'Estar' } : room)),
  };
  assert.equal(
    (
      await ws({
        type: 'homemanager/home/save',
        home_id: 'e2e-casa',
        expected_revision: current.revision,
        configuration: renamed,
      })
    ).success,
    true,
  );
  const stale = await ws({
    type: 'homemanager/home/save',
    home_id: 'e2e-casa',
    expected_revision: current.revision,
    configuration: current.configuration,
  });
  assert.equal(stale.error?.code, 'revision_conflict');
  await page
    .locator('homemanager-card')
    .getByRole('button', { name: 'Encuadrar Estar', exact: true })
    .waitFor({ timeout: 15000 });
});
await step(
  'the bundle is public; plans travel only over the authenticated websocket; active content is refused',
  async () => {
    assert.equal((await fetch(`${base}/homemanager_files/homemanager.js`)).status, 200);
    assert.equal((await fetch(`${base}/api/states`)).status, 401);
    const unsafe = await ws({
      type: 'homemanager/home/save',
      home_id: 'e2e-unsafe',
      expected_revision: null,
      configuration: {
        ...configuration,
        architecture: { format: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>' },
      },
    });
    assert.equal(unsafe.error?.code, 'unsafe_plan');
  },
);
await step('the phone layout keeps the plan usable without horizontal scrolling', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/homemanager`);
  await card.getByRole('button', { name: 'Acción principal de Lámpara E2E', exact: true }).waitFor({ timeout: 30000 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await settle();
  await page.screenshot({ path: `${out}/05-mobile.png` });
});
assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
await browser.close();
console.log(
  `All end-to-end checks passed. Screenshots in ${out}.${foreign.length ? ` Ignored ${foreign.length} page error(s) outside HomeManager.` : ''}`,
);
