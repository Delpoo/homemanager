import { test, expect } from '../browser/local-test.mjs';
import { setup, ceiling, calls } from '../browser/rf-helpers.mjs';
import { openCardMenu } from '../browser/shell-helpers.mjs';

const pieces = page => page.evaluate(() => window.rfServer.library[0].layout ?? []);
const last = async page => (await pieces(page)).at(-1);
async function openDesigner(page, remote = ceiling()) {
  const rf = await setup(page, { remotes: [remote] });
  await rf.locator('[data-open=techo]').click();
  await rf.getByRole('button', { name: 'Diseñar', exact: true }).click();
  return { rf, designer: rf.locator('homemanager-control-designer') };
}

test('a pending designer save blocks fields until the next edit can be preserved', async ({ page }) => {
  const { designer } = await openDesigner(page);
  await designer.getByRole('button', { name: 'Escalones', exact: true }).click();
  await expect(designer).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => {
    const hass = window.testHarness.hass;
    const original = hass.callWS.bind(hass);
    let delayed = false;
    hass.callWS = async message => {
      if (message.type === 'homemanager/rf/layout/save' && !delayed) {
        delayed = true;
        await new Promise(resolve => {
          window.releaseDesignerSave = resolve;
        });
      }
      return original(message);
    };
  });
  await designer.getByRole('button', { name: 'Uno por nivel', exact: true }).click();
  await expect(designer).toHaveAttribute('aria-busy', 'true');
  const maximum = designer.getByLabel('Hasta', { exact: true });
  await expect(maximum).toBeDisabled();
  const filling = maximum.fill('3');
  await page.evaluate(() => window.releaseDesignerSave());
  await filling;
  await maximum.dispatchEvent('change');
  await expect.poll(async () => (await last(page))?.values?.max).toBe(3);
  await expect(designer).toHaveAttribute('aria-busy', 'false');
  await expect(maximum).toBeEnabled();
});

test('the designer adds a level, chooses what it sends, styles it, undoes and tests it (0.13)', async ({ page }) => {
  const { rf, designer } = await openDesigner(page);
  const before = await page.evaluate(() => structuredClone(window.rfServer.library[0].buttons));
  // Elements are grouped by what they do; a tap adds one where there is room.
  await designer.locator('[data-left=elements]').click();
  await designer.getByRole('button', { name: 'Subir / bajar', exact: true }).click();
  await expect.poll(async () => (await last(page))?.type).toBe('updown');
  expect((await last(page)).sendBy).toBe('updown');
  // Function: which learned button goes up and which goes down.
  await expect(designer.getByRole('tab', { name: 'Función', exact: true })).toHaveAttribute('aria-selected', 'true');
  await designer.getByLabel('Subir', { exact: true }).selectOption('v1');
  await designer.getByLabel('Bajar', { exact: true }).selectOption('off');
  await expect.poll(async () => (await last(page))?.buttons).toEqual(['off', 'v1']);
  // Its values: from 16 to 30 degrees, stopping at the ends.
  await designer.getByLabel('Desde', { exact: true }).fill('16');
  await designer.getByLabel('Desde', { exact: true }).dispatchEvent('change');
  await designer.getByLabel('Hasta', { exact: true }).fill('30');
  await designer.getByLabel('Hasta', { exact: true }).dispatchEvent('change');
  await expect.poll(async () => (await last(page))?.values).toEqual({ min: 16, max: 30, step: 1 });
  // Look: own text, a colour and a pill shape; the canvas shows it at once.
  await designer.getByRole('tab', { name: 'Aspecto', exact: true }).click();
  const label = designer.locator('[name=widget-label]');
  await label.fill('Temperatura');
  await label.dispatchEvent('change');
  await expect.poll(async () => (await last(page))?.label).toBe('Temperatura');
  await designer.getByRole('button', { name: 'Fondo #D0453A', exact: true }).click();
  await expect.poll(async () => (await last(page))?.bg).toBe('#D0453A');
  await designer.getByRole('button', { name: 'Negrita', exact: true }).click();
  await expect.poll(async () => (await last(page))?.fontWeight).toBe(700);
  // Undo and redo step through the changes; learned buttons are never touched.
  await designer.getByRole('button', { name: /^Deshacer/ }).click();
  await expect.poll(async () => (await last(page))?.fontWeight).toBeUndefined();
  await designer.getByRole('button', { name: /^Rehacer/ }).click();
  await expect.poll(async () => (await last(page))?.fontWeight).toBe(700);
  expect(await page.evaluate(() => window.rfServer.library[0].buttons)).toEqual(before);
  expect(await calls(page, 'homemanager/rf/press')).toEqual([]);
  // Test mode: a tap sends for real, and the value in the middle follows.
  await designer.getByRole('button', { name: 'Probar', exact: true }).click();
  const remote = designer.locator('homemanager-rf-remote');
  await remote.getByRole('button', { name: 'Subir Temperatura', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'homemanager/rf/press')).at(-1)?.button_id).toBe('v1');
  await rf.locator('.dfoot [data-command=edit]').click();
});

test('blocks, brands, several pieces at once and a copy for another appliance (0.13)', async ({ page }) => {
  const remote = ceiling();
  remote.buttons.push(
    { id: 'arriba', name: 'Arriba', icon: null, fingerprint: 'a1' },
    { id: 'ok', name: 'OK', icon: null, fingerprint: 'a2' },
    { id: 'netflix', name: 'Netflix', icon: null, fingerprint: 'a3' },
  );
  const { designer } = await openDesigner(page, remote);
  // A d-pad finds its keys by name; the rest are chosen by hand.
  await designer.locator('[data-left=blocks]').click();
  await designer.getByRole('button', { name: 'Cruceta', exact: true }).click();
  await expect.poll(async () => (await last(page))?.slots).toEqual({ up: 'arriba', ok: 'ok' });
  await designer.getByRole('tab', { name: 'Función', exact: true }).click();
  await designer
    .getByRole('complementary', { name: 'Inspector' })
    .getByLabel('Abajo', { exact: true })
    .selectOption('off');
  await expect.poll(async () => (await last(page))?.buttons.sort()).toEqual(['arriba', 'off', 'ok']);
  // A brand key takes the learned button with its name.
  await designer.locator('[data-left=brands]').click();
  await designer.getByRole('searchbox', { name: 'Buscar marca' }).fill('netf');
  await designer
    .getByRole('complementary', { name: 'Recursos' })
    .getByRole('button', { name: 'Netflix', exact: true })
    .click();
  await expect.poll(async () => (await last(page))?.brand).toBe('Netflix');
  expect((await last(page)).buttons).toEqual(['netflix']);
  // Ctrl+D duplicates what is chosen; Shift adds to the choice; the inspector styles both.
  const count = (await pieces(page)).length;
  await designer
    .locator('homemanager-rf-remote')
    .locator(`[data-widget="${(await last(page)).id}"]`)
    .focus();
  await page.keyboard.press('Control+d');
  await expect.poll(async () => (await pieces(page)).length).toBe(count + 1);
  // A copy of the whole control for another fan, with its own transmitter.
  await designer.getByRole('button', { name: 'Duplicar este control para otro aparato', exact: true }).click();
  const sheet = designer.getByRole('dialog', { name: 'Duplicar control' });
  await sheet.getByLabel('Nombre', { exact: true }).fill('Techo dormitorio');
  await sheet.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.rfServer.library.map(item => item.id)))
    .toEqual(['techo', 'techo-dormitorio']);
  const copy = await page.evaluate(() => window.rfServer.library[1]);
  expect(copy.layout).toEqual(await pieces(page));
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
  await editor.locator('homemanager-task-screen.settings-dialog .task-close').click();
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

test('Shows › On the plan asks the app to pin the piece next to its symbol (0.13)', async ({ page }) => {
  const { rf, designer } = await openDesigner(page);
  const asked = page.evaluate(
    () =>
      new Promise(resolve =>
        document.addEventListener('homemanager-shell-command', event => resolve(event.detail), { once: true }),
      ),
  );
  await designer.getByRole('button', { name: 'Subir / bajar', exact: true }).click();
  await designer.getByRole('tab', { name: 'Muestra', exact: true }).click();
  await designer.getByRole('button', { name: 'Pegar junto a su símbolo', exact: true }).click();
  const detail = await asked;
  expect(detail).toMatchObject({ command: 'pin', remoteId: 'techo' });
  expect(detail.pieceId).toBe((await last(page)).id);
  await rf.locator('.dfoot [data-command=edit]').click();
});
