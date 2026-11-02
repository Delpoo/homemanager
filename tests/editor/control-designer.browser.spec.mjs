import { test, expect } from '../browser/local-test.mjs';
import { setup, ceiling, calls } from '../browser/rf-helpers.mjs';
import { openCardMenu } from '../browser/shell-helpers.mjs';

test('RF combines minus, estimated value and plus; preview is the runtime grid, undo preserves buttons', async ({
  page,
}) => {
  const rf = await setup(page, { remotes: [ceiling()] });
  await rf.locator('[data-open=techo]').click();
  await rf.getByRole('button', { name: 'Editar', exact: true }).click();
  const designer = rf.locator('homemanager-control-designer');
  const before = await page.evaluate(() => structuredClone(window.rfServer.library[0].buttons));
  for (const [type, label, ref] of [
    ['button', '−', 'off'],
    ['indicator', 'Velocidad', null],
    ['button', '+', 'v1'],
  ]) {
    await designer.getByRole('button', { name: 'Agregar elemento', exact: true }).click();
    const form = designer.locator('homemanager-task-screen.editor');
    await form.locator(`[data-type=${type}]`).click();
    await form.locator('[name=widget-label]').fill(label);
    if (ref) await form.locator('[name=slot-0]').selectOption(ref);
    await form.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(form).toHaveCount(0);
  }
  const layout = await page.evaluate(() => window.rfServer.library[0].layout);
  expect(layout.slice(-3).map(p => p.label)).toEqual(['−', 'Velocidad', '+']);
  await designer.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(designer.locator('[data-reading]')).toHaveText('—');
  await expect(designer).toContainText('Estimado');
  const geometry = await designer
    .locator('homemanager-rf-remote')
    .evaluate(v =>
      [...v.shadowRoot.querySelectorAll('[data-widget]')].map(n => [
        n.dataset.widget,
        n.style.gridColumn,
        n.style.gridRow,
      ]),
    );
  await designer.getByRole('button', { name: 'Deshacer diseño', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.rfServer.library[0].layout.length)).toBe(layout.length - 1);
  expect(await page.evaluate(() => window.rfServer.library[0].buttons)).toEqual(before);
  await rf.getByRole('button', { name: 'Terminar edición', exact: true }).click();
  const actual = await rf
    .locator('homemanager-rf-remote')
    .evaluate(v =>
      [...v.shadowRoot.querySelectorAll('[data-widget]')].map(n => [
        n.dataset.widget,
        n.style.gridColumn,
        n.style.gridRow,
      ]),
    );
  expect(actual).toEqual(geometry.slice(0, -1));
  expect(await calls(page, 'homemanager/rf/press')).toEqual([]);
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
  await designer.getByRole('button', { name: 'Agregar elemento', exact: true }).click();
  const form = designer.locator('homemanager-task-screen.editor');
  await form.locator('[data-type=title]').click();
  await form.locator('[name=widget-label]').fill('Mi control');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toHaveCount(0);
  await editor.getByRole('button', { name: 'Volver', exact: true }).click();
  await card.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
  await card.locator('[data-id=synthetic-light] .primary').click({ button: 'right' });
  const panel = page.locator('homemanager-panel');
  await expect(panel.locator('homemanager-rf-remote')).toContainText('Mi control');
  await expect(panel.locator('.additional-controls')).not.toHaveAttribute('open', '');
  await panel.getByText('Lecturas y más controles', { exact: true }).click();
  await expect(panel.locator('.auto')).toBeVisible();
  expect(await page.evaluate(() => window.testHarness.calls)).toEqual([]);
});
