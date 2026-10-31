import { test, expect } from '../browser/local-test.mjs';

const fixture = '/tests/browser/fixtures/card.html';
async function openSynthetic(page, options = {}) {
  await page.evaluate(async options => {
    const { openPanel } = await import('/.work/panels/native-panel.js');
    const device = {
      id: 'synthetic-panel-device',
      roomId: 'living',
      kind: 'fan',
      position: { x: 0.5, y: 0.5 },
      mobility: 'editable',
      display: { label: 'Dispositivo sintético', icon: 'mdi:fan' },
      bindings: { entityId: null, primaryAction: null, advancedPopupId: null },
      state: { value: 'unknown', confidence: 'unknown' },
    };
    const configuration = {
      schemaVersion: 1,
      catalog: { schemaVersion: 1, devices: [device] },
      architecture: { format: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/>' },
      actions: {
        'synthetic-script': { domain: 'script', service: 'turn_on', target: { entity_id: 'script.synthetic_panel' } },
        'synthetic-light': { domain: 'light', service: 'toggle', target: { entity_id: 'light.synthetic_panel' } },
        ...(options.actions ?? {}),
      },
      panels: {},
      stateSources: {},
    };
    const state = { value: 'unknown', confidence: 'unknown', observedAt: null, sourceEntityId: null, command: null };
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.textContent = 'Abrir panel sintético';
    document.querySelector('#mount').replaceChildren(trigger);
    trigger.focus();
    window.syntheticPanelCalls = [];
    window.syntheticAvailability = {
      available: options.available !== false,
      reason: options.available === false ? 'Entidad sintética no disponible.' : undefined,
    };
    window.syntheticPanel = openPanel({
      panel: options.panel ?? {
        kind: 'device-controls',
        title: 'Panel sintético',
        controls: [{ id: 'run', label: 'Ejecutar control sintético', actionId: 'synthetic-script' }],
      },
      device,
      state,
      configuration,
      returnFocus: trigger,
      availability: () => window.syntheticAvailability,
      onAction: async actionId => {
        window.syntheticPanelCalls.push(actionId);
        if (options.reject) throw new Error('Fallo sintético de ejecución.');
        if (options.pending)
          await new Promise(resolve => {
            window.syntheticPanelResolve = resolve;
          });
      },
    });
  }, options);
}
test.beforeEach(async ({ page }) => {
  await page.goto(fixture);
});

test('unavailable and missing actions stay disabled and cannot execute even after a synthetic click', async ({
  page,
}) => {
  await openSynthetic(page, {
    available: false,
    panel: {
      kind: 'device-controls',
      title: 'Panel sintético',
      controls: [
        { id: 'offline', label: 'Control no disponible', actionId: 'synthetic-script' },
        { id: 'missing', label: 'Referencia pendiente', actionId: 'missing-action' },
      ],
    },
  });
  const unavailable = page.getByRole('button', { name: 'Control no disponible', exact: true }),
    missing = page.getByRole('button', { name: 'Referencia pendiente', exact: true });
  await expect(unavailable).toBeDisabled();
  await expect(unavailable).toHaveAttribute('title', 'Entidad sintética no disponible.');
  await expect(missing).toBeDisabled();
  await expect(missing).toHaveAttribute('title', 'La acción referenciada no existe.');
  await unavailable.dispatchEvent('click');
  await missing.dispatchEvent('click');
  expect(await page.evaluate(() => window.syntheticPanelCalls)).toEqual([]);
  await page.evaluate(() => {
    window.syntheticAvailability = { available: true };
    window.syntheticPanel.element.refresh();
  });
  await expect(unavailable).toBeEnabled();
  await expect(missing).toBeDisabled();
});

test('RF controls execute only explicit script.turn_on targets and require runtime availability', async ({ page }) => {
  await openSynthetic(page, {
    panel: {
      kind: 'rf-fan',
      title: 'Ventilador sintético RF',
      controls: [
        { id: 'safe', label: 'Script permitido', actionId: 'synthetic-script' },
        { id: 'wrong-domain', label: 'Dominio incorrecto', actionId: 'synthetic-light' },
        { id: 'wrong-service', label: 'Servicio incorrecto', actionId: 'wrong-service' },
        { id: 'all', label: 'Destino global', actionId: 'global-target' },
        { id: 'mixed', label: 'Destinos mezclados', actionId: 'mixed-target' },
        { id: 'empty', label: 'Sin destinos', actionId: 'empty-target' },
      ],
    },
    actions: {
      'wrong-service': { domain: 'script', service: 'toggle', target: { entity_id: 'script.synthetic_panel' } },
      'global-target': { domain: 'script', service: 'turn_on', target: { entity_id: 'script.all' } },
      'mixed-target': {
        domain: 'script',
        service: 'turn_on',
        target: { entity_id: ['script.synthetic_panel', 'light.synthetic_panel'] },
      },
      'empty-target': { domain: 'script', service: 'turn_on', target: { entity_id: [] } },
    },
  });
  const safe = page.getByRole('button', { name: 'Script permitido', exact: true });
  await expect(safe).toBeEnabled();
  await expect(safe).toHaveAttribute('title', 'script.synthetic_panel');
  for (const name of [
    'Dominio incorrecto',
    'Servicio incorrecto',
    'Destino global',
    'Destinos mezclados',
    'Sin destinos',
  ]) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeDisabled();
    await button.dispatchEvent('click');
  }
  expect(await page.evaluate(() => window.syntheticPanelCalls)).toEqual([]);
  await safe.click();
  expect(await page.evaluate(() => window.syntheticPanelCalls)).toEqual(['synthetic-script']);
  await page.evaluate(() => {
    window.syntheticAvailability = { available: false, reason: 'Script aún no verificado.' };
    window.syntheticPanel.element.refresh();
  });
  await expect(safe).toBeDisabled();
  await expect(safe).toHaveAttribute('title', 'Script aún no verificado.');
});

test('accepted actions never infer physical state and state updates preserve focus', async ({ page }) => {
  await openSynthetic(page);
  const button = page.getByRole('button', { name: 'Ejecutar control sintético', exact: true });
  await button.click();
  await expect(page.locator('homemanager-panel').locator('.confidence')).toHaveText('Desconocido');
  expect(await page.evaluate(() => window.syntheticPanel.element.runtime)).toEqual({
    value: 'unknown',
    confidence: 'unknown',
    observedAt: null,
    sourceEntityId: null,
    command: null,
  });
  await button.focus();
  await page.evaluate(() =>
    window.syntheticPanel.update({
      value: 'Pendiente',
      confidence: 'sent',
      observedAt: null,
      sourceEntityId: null,
      command: null,
    }),
  );
  await expect(button).toBeFocused();
  await expect(page.locator('homemanager-panel').locator('.confidence')).toHaveText('Comando enviado');
  await page.evaluate(() =>
    window.syntheticPanel.update({
      value: 'Resultado medido sintético',
      confidence: 'confirmed',
      observedAt: '2026-01-01T00:00:00Z',
      sourceEntityId: 'sensor.synthetic_feedback',
      command: null,
    }),
  );
  await expect(page.locator('homemanager-panel').locator('.confidence')).toHaveText('Confirmado');
  await expect(page.locator('homemanager-panel').locator('.value')).toHaveText('Resultado medido sintético');
});

test('pending actions block repeated execution and display an execution error without a false confirmation', async ({
  page,
}) => {
  await openSynthetic(page, { pending: true });
  const button = page.getByRole('button', { name: 'Ejecutar control sintético', exact: true });
  await button.click();
  await expect(button).toBeDisabled();
  await button.dispatchEvent('click');
  expect(await page.evaluate(() => window.syntheticPanelCalls)).toEqual(['synthetic-script']);
  await page.evaluate(() => window.syntheticPanelResolve());
  await expect(button).toBeEnabled();
  await page.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
  await expect(page.locator('homemanager-task-screen[open]')).not.toBeVisible();
  await openSynthetic(page, { reject: true });
  await page.getByRole('button', { name: 'Ejecutar control sintético', exact: true }).click();
  await expect(page.locator('homemanager-panel').getByRole('status')).toHaveText('Fallo sintético de ejecución.');
  await expect(page.locator('homemanager-panel').locator('.confidence')).toHaveText('Desconocido');
});

test('native dialog traps keyboard focus, closes locally with Escape and restores the invoking button', async ({
  page,
}) => {
  await openSynthetic(page);
  const close = page.getByRole('button', { name: 'Cerrar panel', exact: true }),
    control = page.getByRole('button', { name: 'Ejecutar control sintético', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(control).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('homemanager-task-screen[open]')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir panel sintético', exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.syntheticPanelCalls)).toEqual([]);
  await expect(page.locator('homemanager-panel')).toHaveCount(0);
});

test('button close and programmatic close affect only the local dialog', async ({ page }) => {
  await openSynthetic(page);
  await page.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
  await expect(page.locator('homemanager-task-screen[open]')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir panel sintético', exact: true })).toBeFocused();
  await openSynthetic(page);
  await page.evaluate(() => window.syntheticPanel.close());
  await expect(page.locator('homemanager-task-screen[open]')).not.toBeVisible();
  expect(await page.evaluate(() => window.syntheticPanelCalls)).toEqual([]);
  expect(await page.evaluate(() => window.testHarness?.calls ?? [])).toEqual([]);
});

test('panel labels are text only and controls fit mobile with accessible touch targets', async ({ page }) => {
  await openSynthetic(page, {
    panel: {
      kind: 'device-controls',
      title: '<img src=x onerror=alert(1)>',
      controls: [{ id: 'text', label: '<script>synthetic</script>', actionId: 'synthetic-script' }],
    },
  });
  await expect(page.getByRole('heading', { name: '<img src=x onerror=alert(1)>', exact: true })).toBeVisible();
  const button = page.getByRole('button', { name: '<script>synthetic</script>', exact: true });
  await expect(button).toBeVisible();
  expect(await page.locator('homemanager-panel').locator('img,script').count()).toBe(0);
  const bounds = await page.locator('homemanager-task-screen[open]').boundingBox(),
    touch = await button.boundingBox(),
    viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(touch.height).toBeGreaterThanOrEqual(44);
});
