import { test, expect } from '../browser/local-test.mjs';
import { setup, ceiling, calls } from '../browser/rf-helpers.mjs';
import { openCardMenu } from '../browser/shell-helpers.mjs';

test('RF free designer: pieces from the panel, explicit learned buttons, look, undo and test mode (0.13)', async ({
  page,
}) => {
  const rf = await setup(page, { remotes: [ceiling()] });
  await rf.locator('[data-open=techo]').click();
  await rf.getByRole('button', { name: 'Diseñar', exact: true }).click();
  const designer = rf.locator('homemanager-control-designer');
  const before = await page.evaluate(() => structuredClone(window.rfServer.library[0].buttons));
  const last = () => page.evaluate(() => window.rfServer.library[0].layout?.at(-1));
  // A pair takes two learned buttons; each slot says which one it sends.
  await designer.getByRole('button', { name: 'Subir / bajar', exact: true }).click();
  await expect.poll(async () => (await last())?.type).toBe('updown');
  await designer.getByLabel('Menos', { exact: true }).selectOption('off');
  await designer.getByLabel('Más', { exact: true }).selectOption('v1');
  await expect.poll(async () => (await last())?.buttons).toEqual(['off', 'v1']);
  const label = designer.locator('[name=widget-label]');
  await label.fill('Velocidad');
  await label.dispatchEvent('change');
  await expect.poll(async () => (await last())?.label).toBe('Velocidad');
  // Look: a colour from the palette and a shape, saved with the piece.
  await designer.getByRole('button', { name: 'Fondo #D0453A', exact: true }).click();
  await expect.poll(async () => (await last())?.bg).toBe('#D0453A');
  await designer.getByRole('button', { name: 'Redondo', exact: true }).click();
  await expect.poll(async () => (await last())?.shape).toBe('round');
  // A reading needs no button.
  await designer.getByRole('button', { name: 'Indicador de valor', exact: true }).click();
  await expect.poll(async () => (await last())?.type).toBe('indicator');
  await expect(designer.locator('[data-reading]')).toHaveText('—');
  // Undo goes back one change; learned buttons are never touched.
  const count = (await page.evaluate(() => window.rfServer.library[0].layout)).length;
  await designer.getByRole('button', { name: 'Deshacer diseño', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.rfServer.library[0].layout.length)).toBe(count - 1);
  expect(await page.evaluate(() => window.rfServer.library[0].buttons)).toEqual(before);
  expect(await calls(page, 'homemanager/rf/press')).toEqual([]);
  // Test mode: a tap on the designed remote sends for real.
  await designer.getByRole('button', { name: 'Modo prueba: tocar envía', exact: true }).click();
  await designer.locator('homemanager-rf-remote').getByRole('button', { name: 'Velocidad 2' }).first().click();
  await expect.poll(async () => (await calls(page, 'homemanager/rf/press')).at(-1)?.button_id).toBe('v2');
  await rf.locator('.dfoot [data-command=edit]').click();
});

test('a preset sends its steps in order, with its pauses (0.13)', async ({ page }) => {
  const layout = [
    {
      id: 'night',
      type: 'preset',
      x: 0,
      y: 0,
      w: 2,
      h: 1,
      buttons: ['off', 'v1'],
      label: 'Noche',
      icon: null,
      sequence: [{ button: 'off' }, { wait: 50 }, { button: 'v1', times: 2 }],
    },
  ];
  const rf = await setup(page, { remotes: [ceiling({ layout })] });
  await rf.locator('[data-open=techo]').click();
  await rf.locator('homemanager-rf-remote').getByRole('button', { name: 'Noche', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'homemanager/rf/press')).map(call => call.button_id))
    .toEqual(['off', 'v1', 'v1']);
});

test('HA uses the same designer, persists layout and opens the designed control before folded extras', async ({
  page,
}) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  const card = page.locator('homemanager-card');
  await openCardMenu(page);
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card.locator('[data-id=synthetic-light] .primary').click();
  const editor = card.locator('homemanager-editor');
  const control = editor.locator('#device-controls-section');
  if (!(await control.evaluate(n => n.open))) await control.locator('summary').click();
  await editor.getByRole('button', { name: 'Diseñar control', exact: true }).click();
  const designer = editor.locator('homemanager-control-designer');
  await expect(designer).toBeVisible();
  await designer.getByRole('button', { name: 'Título', exact: true }).click();
  const label = designer.locator('[name=widget-label]');
  await label.fill('Mi control');
  await label.dispatchEvent('change');
  await expect(designer.locator('homemanager-rf-remote')).toContainText('Mi control');
  await editor.getByRole('button', { name: 'Volver', exact: true }).click();
  await card.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
  await card.locator('[data-id=synthetic-light] .primary').click({ button: 'right' });
  const panel = page.locator('homemanager-panel');
  await expect(panel.locator('homemanager-rf-remote')).toContainText('Mi control');
  await expect(panel.getByRole('button', { name: 'Alternar', exact: true })).toBeVisible();
  await expect(panel.locator('.additional-controls')).not.toHaveAttribute('open', '');
  await panel.getByText('Lecturas y más controles', { exact: true }).click();
  await expect(panel.locator('.auto')).toBeVisible();
  expect(await page.evaluate(() => window.testHarness.calls)).toEqual([]);
});
