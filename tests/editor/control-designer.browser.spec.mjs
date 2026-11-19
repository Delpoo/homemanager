import { test, expect } from '../browser/local-test.mjs';
import { setup, ceiling, calls } from '../browser/rf-helpers.mjs';
import { openCardMenu } from '../browser/shell-helpers.mjs';

const pieces = page => page.evaluate(() => window.rfServer.library[0].layout ?? []);
const last = async page => (await pieces(page)).at(-1);
/** The draft the editor holds (0.14: nothing is saved until «Guardar»). */
const draft = designer => designer.evaluate(element => element.remote?.layout ?? []);
const lastDraft = async designer => (await draft(designer)).at(-1);
async function openDesigner(page, remote = ceiling()) {
  const rf = await setup(page, { remotes: [remote] });
  await rf.locator('[data-open=techo]').click();
  await rf.getByRole('button', { name: 'Editar', exact: true }).click();
  return { rf, designer: rf.locator('homemanager-control-designer') };
}
/** «Botón nuevo» → a tab of the catalogue → an entry. */
async function newPiece(designer, tab, entry) {
  await designer.locator('[data-command=new-piece]').click();
  await designer.locator(`[data-cat-tab=${tab}]`).click();
  await designer.locator(`[data-entry=${entry}]`).click();
}
/** Back to «Editar control», accepting what the button's steps changed. */
async function backToPanel(designer) {
  if (await designer.locator('[data-steps=accept]').count()) await designer.locator('[data-steps=accept]').click();
  await designer.locator('[data-command=piece-back]').click();
}

test('changes stay in a draft until «Guardar», and saving blocks the fields until it ends (0.14)', async ({ page }) => {
  const { designer } = await openDesigner(page);
  await expect(designer.locator('[data-draft=save]')).toBeDisabled();
  await newPiece(designer, 'levels', 'level');
  await expect.poll(async () => (await lastDraft(designer))?.type).toBe('updown');
  // Nothing reached the library yet.
  expect(await pieces(page)).toEqual([]);
  expect(await calls(page, 'homemanager/rf/layout/save')).toEqual([]);
  await expect(designer.locator('.dedit')).toContainText('Editando el control de Techo');
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
  await designer.locator('[data-draft=save]').click();
  await expect(designer).toHaveAttribute('aria-busy', 'true');
  await expect(designer.locator('[data-step-open=form]')).toBeDisabled();
  await page.evaluate(() => window.releaseDesignerSave());
  await expect.poll(async () => (await last(page))?.type).toBe('updown');
  await expect(designer).toHaveAttribute('aria-busy', 'false');
  await expect(designer.locator('[data-draft=save]')).toBeDisabled();
  expect((await calls(page, 'homemanager/rf/layout/save')).length).toBe(1);
});

test('leaving with changes asks: keep editing, discard or save (0.14)', async ({ page }) => {
  const { rf, designer } = await openDesigner(page);
  await newPiece(designer, 'info', 'title');
  await backToPanel(designer);
  await rf.locator('.dfoot [data-command=edit]').click();
  const ask = designer.locator('dialog[open]');
  await expect(ask).toContainText('¿Guardar los cambios?');
  await ask.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await expect(designer).toBeVisible();
  await rf.locator('.dfoot [data-command=edit]').click();
  await designer.locator('dialog[open]').getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(rf.locator('homemanager-control-designer')).toHaveCount(0);
  expect(await pieces(page)).toEqual([]);
});

test('a new level: what it sends, its numbers, its look, steps to accept, undo, save and test (0.14)', async ({
  page,
}) => {
  const { rf, designer } = await openDesigner(page);
  const before = await page.evaluate(() => structuredClone(window.rfServer.library[0].buttons));
  // «Botón nuevo»: one catalogue in five tabs; a new button opens at «Forma y tamaño».
  await newPiece(designer, 'levels', 'level');
  await expect(designer.locator('.step.open [data-step-open=form]')).toBeVisible();
  // What it does: which learned button goes up and which goes down.
  await designer.locator('[data-step-open=does]').click();
  await designer.getByLabel('Subir', { exact: true }).selectOption('v1');
  await designer.getByLabel('Bajar', { exact: true }).selectOption('off');
  await expect.poll(async () => (await lastDraft(designer))?.buttons).toEqual(['off', 'v1']);
  // Numbers from 16 to 30 instead of «Sólo sube y baja».
  await designer.locator('[data-set=values][data-value=numbers]').click();
  await designer.getByLabel('Desde', { exact: true }).fill('16');
  await designer.getByLabel('Desde', { exact: true }).dispatchEvent('change');
  await designer.getByLabel('Hasta', { exact: true }).fill('30');
  await designer.getByLabel('Hasta', { exact: true }).dispatchEvent('change');
  await expect.poll(async () => (await lastDraft(designer))?.values).toEqual({ min: 16, max: 30, step: 1 });
  // The step with changes not accepted is yellow; «Aceptar» settles it.
  await expect(designer.locator('.step.pending')).toHaveCount(1);
  await designer.locator('[data-step-accept=does]').click();
  await expect(designer.locator('.step.pending')).toHaveCount(0);
  // Look: own text, a colour and bold.
  await designer.locator('[data-step-open=look]').click();
  const label = designer.locator('[name=widget-label]');
  await label.fill('Temperatura');
  await label.dispatchEvent('change');
  await expect.poll(async () => (await lastDraft(designer))?.label).toBe('Temperatura');
  await designer.getByRole('button', { name: 'Fondo #D0453A', exact: true }).click();
  await expect.poll(async () => (await lastDraft(designer))?.bg).toBe('#D0453A');
  await designer.getByRole('button', { name: 'Negrita', exact: true }).click();
  await expect.poll(async () => (await lastDraft(designer))?.fontWeight).toBe(700);
  // «Descartar» puts back only that step.
  await designer.locator('[data-step-discard=look]').click();
  await expect.poll(async () => (await lastDraft(designer))?.label).toBe('Nivel');
  expect((await lastDraft(designer)).values).toEqual({ min: 16, max: 30, step: 1 });
  await label.fill('Temperatura');
  await label.dispatchEvent('change');
  await designer.getByRole('button', { name: 'Negrita', exact: true }).click();
  // Undo and redo step through the changes; learned buttons are never touched.
  await designer.locator('.dbar [data-undo]').click();
  await expect.poll(async () => (await lastDraft(designer))?.fontWeight).toBeUndefined();
  await designer.locator('.dbar [data-redo]').click();
  await expect.poll(async () => (await lastDraft(designer))?.fontWeight).toBe(700);
  await designer.locator('[data-steps=accept]').click();
  await designer.locator('[data-draft=save]').click();
  await expect.poll(async () => (await last(page))?.label).toBe('Temperatura');
  expect(await last(page)).toMatchObject({ type: 'updown', buttons: ['off', 'v1'], fontWeight: 700 });
  expect(await page.evaluate(() => window.rfServer.library[0].buttons)).toEqual(before);
  expect(await calls(page, 'homemanager/rf/press')).toEqual([]);
  // Test mode: a tap sends for real, and the value in the middle follows.
  await designer.getByRole('button', { name: 'Probar', exact: true }).click();
  const remote = designer.locator('homemanager-rf-remote');
  await remote.getByRole('button', { name: 'Subir Temperatura', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'homemanager/rf/press')).at(-1)?.button_id).toBe('v1');
  await rf.locator('.dfoot [data-command=edit]').click();
});

test('a level takes the form of a thermostat and grows to fit it; the panel lists learned buttons (0.14)', async ({
  page,
}) => {
  const { designer } = await openDesigner(page);
  // Learned buttons say where each is used; «+» puts an unused one on the control.
  const learned = designer.locator('.mod.open').first();
  await expect(learned).toContainText('Botones aprendidos');
  await newPiece(designer, 'levels', 'level');
  const shapes = designer.locator('[data-shape]');
  await expect(shapes).toHaveCount(7);
  await designer.locator('[data-shape="f:thermo"]').click();
  await expect.poll(async () => (await lastDraft(designer))?.form).toBe('thermo');
  const piece = await lastDraft(designer);
  expect(piece.type).toBe('slider');
  expect(piece.w).toBeGreaterThanOrEqual(2);
  expect(piece.h).toBeGreaterThanOrEqual(2);
  await expect(designer.locator('homemanager-rf-remote').locator('svg[data-op=ring]')).toBeVisible();
  // Back to «Subir / bajar»: the form goes, the kind changes.
  await designer.locator('[data-shape="v:updown"]').click();
  await expect.poll(async () => (await lastDraft(designer))?.type).toBe('updown');
  expect((await lastDraft(designer)).form).toBeUndefined();
});

test('groups, an app button, several pieces at once and a copy for another appliance (0.14)', async ({ page }) => {
  const remote = ceiling();
  remote.buttons.push(
    { id: 'arriba', name: 'Arriba', icon: null, fingerprint: 'a1' },
    { id: 'ok', name: 'OK', icon: null, fingerprint: 'a2' },
    { id: 'netflix', name: 'Netflix', icon: null, fingerprint: 'a3' },
  );
  const { designer } = await openDesigner(page, remote);
  // A d-pad finds its keys by name; the rest are chosen by hand.
  await newPiece(designer, 'groups', 'dpad');
  await expect.poll(async () => (await lastDraft(designer))?.slots).toEqual({ up: 'arriba', ok: 'ok' });
  await designer.locator('[data-step-open=does]').click();
  await designer.locator('.insp').getByLabel('Abajo', { exact: true }).selectOption('off');
  await expect.poll(async () => (await lastDraft(designer))?.buttons.sort()).toEqual(['arriba', 'off', 'ok']);
  await backToPanel(designer);
  // An app button: the brand is chosen in «Qué hace».
  await newPiece(designer, 'buttons', 'brand');
  await designer.locator('[data-step-open=does]').click();
  await designer.locator('[data-command=brands]').click();
  await designer.getByRole('searchbox', { name: 'Buscar marca' }).fill('netf');
  await designer.locator('.ipop').getByRole('button', { name: 'Netflix', exact: true }).click();
  await expect.poll(async () => (await lastDraft(designer))?.brand).toBe('Netflix');
  await designer.locator('[data-steps=accept]').click();
  // Ctrl+D duplicates what is chosen.
  const count = (await draft(designer)).length;
  await designer
    .locator('homemanager-rf-remote')
    .locator(`[data-widget="${(await lastDraft(designer)).id}"]`)
    .focus();
  await page.keyboard.press('Control+d');
  await expect.poll(async () => (await draft(designer)).length).toBe(count + 1);
  // A copy of the whole control for another fan: the draft is saved first.
  await designer.locator('[data-command=piece-back]').click();
  await designer.locator('[data-mod=more]').click();
  await designer.locator('[data-command=duplicate-remote]').click();
  await designer.locator('dialog[open]').getByRole('button', { name: 'Guardar', exact: true }).click();
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

test('a button not learned yet shows «!», sends nothing, and can be learned from the editor (0.14)', async ({
  page,
}) => {
  const layout = [
    {
      id: 'grid',
      type: 'canvas',
      x: 0,
      y: 0,
      w: 3,
      h: 4,
      buttons: [],
      label: null,
      icon: null,
      wanted: [{ id: 'w-turbo', name: 'Turbo', icon: 'mdi:flash' }],
    },
    { id: 'turbo', type: 'button', x: 0, y: 0, w: 1, h: 1, buttons: ['w-turbo'], label: null, icon: null },
    { id: 'off', type: 'button', x: 1, y: 0, w: 1, h: 1, buttons: ['off'], label: null, icon: null },
  ];
  const rf = await setup(page, { remotes: [ceiling({ layout })] });
  await rf.locator('[data-open=techo]').click();
  const player = rf.locator('homemanager-rf-remote');
  await expect(player.locator('[data-widget=turbo].waiting .kwant')).toBeVisible();
  await player.locator('[data-widget=turbo] button').first().click();
  await expect(player.locator('.live')).toContainText('todavía no tiene su botón aprendido');
  expect(await calls(page, 'homemanager/rf/press')).toEqual([]);
  // The remote page lists it to learn; the editor too, with «Aprender».
  await expect(rf.locator('.wrow')).toContainText('Turbo');
  await rf.getByRole('button', { name: 'Editar', exact: true }).click();
  const designer = rf.locator('homemanager-control-designer');
  await expect(designer.locator('.mrow.waiting')).toContainText('Turbo');
  await designer.locator('[data-learn-wanted=w-turbo]').click();
  await expect(rf.locator('homemanager-rf-learn').locator('[name=target]')).toHaveValue('Turbo');
});

test('a learned button with the name of a waited one takes its place (0.14)', async ({ page }) => {
  const remote = ceiling({
    layout: [
      {
        id: 'grid',
        type: 'canvas',
        x: 0,
        y: 0,
        w: 3,
        h: 4,
        buttons: [],
        label: null,
        icon: null,
        wanted: [{ id: 'w-turbo', name: 'Turbo' }],
      },
      { id: 'turbo', type: 'button', x: 0, y: 0, w: 1, h: 1, buttons: ['w-turbo'], label: null, icon: null },
    ],
  });
  remote.buttons.push({ id: 'turbo-1', name: 'Turbo', icon: null, fingerprint: 't1' });
  const { designer } = await openDesigner(page, remote);
  await expect
    .poll(async () => (await draft(designer)).find(piece => piece.id === 'turbo')?.buttons)
    .toEqual(['turbo-1']);
  expect((await draft(designer)).find(piece => piece.type === 'canvas').wanted).toBeUndefined();
  await expect(designer.locator('[data-draft=save]')).toBeEnabled();
});

test('HA uses the same editor, keeps the layout with «Guardar» and opens the designed control before folded extras', async ({
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
  await editor.getByRole('button', { name: 'Editar control', exact: true }).click();
  const designer = editor.locator('homemanager-control-designer');
  await expect(designer).toBeVisible();
  await newPiece(designer, 'info', 'title');
  await designer.locator('[data-step-open=look]').click();
  const label = designer.locator('[name=widget-label]');
  await label.fill('Mi control');
  await label.dispatchEvent('change');
  await expect(designer.locator('homemanager-rf-remote')).toContainText('Mi control');
  await designer.locator('[data-steps=accept]').click();
  await designer.locator('[data-draft=save]').click();
  await expect(designer.locator('[data-draft=save]')).toBeDisabled();
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

test('«En el plano» asks the app to pin the piece next to its symbol (0.14)', async ({ page }) => {
  const { designer } = await openDesigner(page);
  const asked = page.evaluate(
    () =>
      new Promise(resolve =>
        document.addEventListener('homemanager-shell-command', event => resolve(event.detail), { once: true }),
      ),
  );
  await newPiece(designer, 'levels', 'level');
  await designer.locator('[data-step-open=plan]').click();
  await designer.getByRole('button', { name: 'Pegar junto a su símbolo', exact: true }).click();
  const detail = await asked;
  expect(detail).toMatchObject({ command: 'pin', remoteId: 'techo' });
  expect(detail.pieceId).toBe((await lastDraft(designer)).id);
});

test('Copy this layout gives it to another learned remote, button by button name (0.14)', async ({ page }) => {
  const other = {
    ...ceiling(),
    id: 'dormitorio',
    name: 'Dormitorio',
    buttons: [
      { id: 'apagar-d', name: 'Apagar', icon: null, fingerprint: 'd1' },
      { id: 'vel1-d', name: 'Velocidad 1', icon: null, fingerprint: 'd2' },
    ],
  };
  const rf = await setup(page, { remotes: [ceiling(), other] });
  await rf.locator('[data-open=techo]').click();
  await rf.getByRole('button', { name: 'Editar', exact: true }).click();
  const designer = rf.locator('homemanager-control-designer');
  // «Estilo y lienzo»: a first change makes the current drawing a design of its own.
  await designer.locator('[data-mod=canvas]').click();
  await designer.getByRole('button', { name: 'Grafito', exact: true }).click();
  await designer.locator('[data-mod=more]').click();
  await designer.locator('[data-command=copy-design]').click();
  await designer.locator('dialog[open]').getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.rfServer.library[0].layout?.length ?? 0)).toBeGreaterThan(0);
  const sheet = designer.getByRole('dialog', { name: 'Duplicar control' });
  await sheet.getByLabel('Control que recibe el diseño').selectOption('dormitorio');
  await sheet.getByRole('button', { name: 'Copiar diseño', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.rfServer.library.find(item => item.id === 'dormitorio').layout))
    .not.toBeNull();
  const layout = await page.evaluate(() => window.rfServer.library.find(item => item.id === 'dormitorio').layout);
  const refs = layout.flatMap(piece => piece.buttons);
  expect(refs.sort()).toEqual(['apagar-d', 'vel1-d']);
  expect(layout.find(piece => piece.type === 'canvas')?.theme).toBe('grafito');
});
