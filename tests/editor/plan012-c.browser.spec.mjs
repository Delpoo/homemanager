// Plan 0.12, lote C: the symbol's sheet and what it shows.
import { test, expect } from '../browser/local-test.mjs';

const card = page => page.locator('homemanager-card');
const editor = page => card(page).locator('homemanager-editor');

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await card(page).locator('.hm-tools [data-command=edit]').click();
  await page.waitForTimeout(500);
  await card(page).locator('[data-id="synthetic-light"] .primary').click();
});

test('the sheet has Base and Modules, and each module says what it does without opening it (#71)', async ({
  page,
}, testInfo) => {
  // 0.13: no Base / Modules headings; the head holds icon, name and space.
  await expect(editor(page).locator('.sheet-group')).toHaveCount(0);
  await expect(editor(page).locator('.symhead [name=label]')).toBeVisible();
  const gestures = editor(page).locator('#module-gestures > summary');
  await expect(gestures.locator('.module-name')).toHaveText('Gestos');
  await expect(gestures.locator('.module-sum')).toContainText('Tocar:');
  await expect(editor(page).locator('#device-binding > summary .module-sum')).toContainText('lectura');
  // No entity_id or keyboard shortcut in sight outside Más opciones.
  const visible = await editor(page).evaluate(node =>
    [...node.shadowRoot.querySelectorAll('.sheet-body *')]
      .filter(el => el.checkVisibility() && !el.closest('#device-options'))
      .map(el =>
        [...el.childNodes]
          .filter(n => n.nodeType === 3)
          .map(n => n.textContent)
          .join(''),
      )
      .join(' '),
  );
  expect(visible).not.toMatch(/\b(?:light|sensor|switch|script)\.[a-z0-9_]+/);
  expect(visible).not.toContain('Mayús+Enter');
  // + Agregar is a list with one sentence per module.
  // 0.13: chips; what each module does is its tooltip.
  const rows = editor(page).locator('.module-add-row');
  await expect(rows.first()).toHaveAttribute('title', /.+/);
  await expect(rows.filter({ hasText: 'Indicadores' })).toHaveAttribute('title', /Muestra valores/);
  if (testInfo.project.name === 'mobile') await expect(card(page).locator('nav.rooms')).toBeHidden();
});

test('free size, opacity and shape are saved and drawn; a hidden layer is faded while editing (#93)', async ({
  page,
}) => {
  await editor(page).locator('[data-command=shape-pick][data-shape-value=pill]').click();
  const slider = editor(page).locator('#device-form [name=scale]');
  await slider.fill('1.5');
  await slider.dispatchEvent('change');
  await editor(page)
    .getByRole('button', { name: /^(Listo|Guardar dispositivo)$/ })
    .click();
  const light = (await page.evaluate(() => window.testHarness.card.getDraftConfiguration())).catalog.devices.find(
    d => d.id === 'synthetic-light',
  );
  expect(light.display).toMatchObject({ shape: 'pill', scale: 1.5 });
  const marker = card(page).locator('[data-id="synthetic-light"]');
  await expect(marker).toHaveAttribute('data-shape', 'pill');
  await expect(marker).toHaveAttribute('data-scaled', '');
  // Untouched symbols keep their old look.
  const sensor = (await page.evaluate(() => window.testHarness.card.getDraftConfiguration())).catalog.devices.find(
    d => d.id === 'synthetic-sensor',
  );
  expect(sensor.display.scale).toBeUndefined();
  expect(sensor.display.shape).toBeUndefined();
});

test('every symbol shows its link state while editing, and the mark opens the Device module (#95)', async ({
  page,
}) => {
  await card(page).locator('[data-id="synthetic-fan"] .symbol-link').waitFor();
  await expect(card(page).locator('[data-id="synthetic-fan"]')).toHaveAttribute('data-link', 'unlinked');
  await expect(card(page).locator('[data-id="synthetic-light"]')).toHaveAttribute('data-link', 'linked');
  await expect(card(page).locator('.marker .symbol-link:visible')).toHaveCount(3);
});

test('outside editing the link mark follows Show link: unlinked by default, always, never (#95)', async ({ page }) => {
  await card(page).getByRole('button', { name: 'Salir de edición', exact: true }).click();
  const visible = () => card(page).locator('.marker .symbol-link:visible');
  await expect(visible()).toHaveCount(1);
  for (const [value, count] of [
    ['always', 3],
    ['never', 0],
  ]) {
    await page.evaluate(v => {
      localStorage.setItem('homemanager:show-link', v);
      document.dispatchEvent(new CustomEvent('homemanager-show-link'));
    }, value);
    await expect(visible()).toHaveCount(count);
  }
});

test('the initial view is saved, ⌂ returns to it and it opens after a reload (#94)', async ({ page }) => {
  await card(page).getByRole('button', { name: 'Salir de edición', exact: true }).click();
  // Leaving edit mode gives the plan its room back; zoom once it has settled.
  await page.waitForTimeout(600);
  await card(page).getByRole('button', { name: 'Acercar', exact: true }).click();
  await card(page).getByRole('button', { name: 'Acercar', exact: true }).click();
  await page.waitForTimeout(500);
  const fitted = await page.evaluate(() => window.testHarness.card.baseScale);
  await card(page).locator('.hm-tools [data-command=configuration]').click();
  const settings = card(page).locator('homemanager-editor');
  await settings.locator('[data-settings="view-section"]').click();
  await settings.getByRole('button', { name: 'Sólo en este equipo', exact: true }).click();
  await settings.locator('homemanager-task-screen.settings-dialog .task-back').click();
  await card(page).getByRole('button', { name: 'Encuadrar todo', exact: true }).click();
  await page.waitForTimeout(500);
  await card(page).getByRole('button', { name: 'Vista inicial', exact: true }).click();
  // 0.13: Settings sits beside the plan, so what is saved is what that narrower plan showed.
  await expect.poll(() => page.evaluate(() => window.testHarness.card.camera.scale)).toBeGreaterThan(fitted * 1.2);
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => ({ ...window.testHarness.card.camera }));
  await page.reload();
  await page.waitForFunction(() => window.testHarnessReady);
  await expect.poll(() => page.evaluate(() => window.testHarness.card.camera.scale)).toBeCloseTo(saved.scale, 3);
});
