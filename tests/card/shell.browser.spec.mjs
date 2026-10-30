import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const card = page => page.locator('homemanager-card');
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/shell.html');
  await page.waitForFunction(() => window.shellHarnessReady);
});

test('shell is compact, branded, accessible, and reserves health marks for problems', async ({ page }, testInfo) => {
  const host = card(page);
  await expect(host.locator('.header')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Editar plano', exact: true })).toBeHidden();
  await expect(host.locator('[data-id=temperature] .value')).toHaveText('23,4°');
  await expect(host.locator('[data-id=lamp] .symbol-ring')).toHaveCount(1);
  await expect(host.locator('[data-id=lamp] .symbol-health')).toHaveCount(0);
  await expect(host.locator('.state-dot')).toHaveCount(0);
  await expect(host.locator('[data-id=hub]')).toHaveCount(0);
  const boxes = await host.evaluate(node => {
    const root = node.shadowRoot;
    return {
      header: root.querySelector('.header').getBoundingClientRect().height,
      rail: root.querySelector('.rooms').getBoundingClientRect().height,
      brand: getComputedStyle(node).getPropertyValue('--hm-brand').trim(),
    };
  });
  expect(boxes.brand.toLowerCase()).toBe('#4f7a5a');
  if (testInfo.project.name === 'mobile') expect(boxes.header + boxes.rail).toBeLessThanOrEqual(120);
  await host.locator('.hm-menu > summary').click();
  await expect(host.getByRole('button', { name: 'Editar plano', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(host.locator('.hm-menu')).not.toHaveAttribute('open', '');
  await page.evaluate(() => {
    const h = window.testHarness.hass;
    h.themes = { darkMode: true };
    h.user.is_admin = false;
    window.testHarness.card.hass = { ...h };
  });
  await expect(host).toHaveAttribute('data-theme', 'dark');
  await host.locator('.hm-menu > summary').click();
  await expect(host.getByRole('button', { name: 'Editar plano', exact: true })).toHaveCount(0);
});

test('the panel fits its window beside the HA sidebar, also while editing', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'desktop') {
    // A 1278 px window with the 256 px HA sidebar: wide window, narrow panel.
    await page.setViewportSize({ width: 1278, height: 900 });
    await page.evaluate(() => {
      document.getElementById('mount').style.width = '1012px';
    });
  }
  const fits = () =>
    card(page).evaluate(node => {
      const rect = selector => node.shadowRoot.querySelector(selector).getBoundingClientRect();
      return {
        shellBottom: rect('.shell').bottom,
        railBottom: rect('.rooms').bottom,
        pageHeight: document.documentElement.scrollHeight,
        window: innerHeight,
      };
    });
  const expectFit = async () => {
    await expect
      .poll(async () => (await fits()).pageHeight)
      .toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
    const box = await fits();
    expect(box.railBottom).toBeLessThanOrEqual(box.window);
    expect(box.shellBottom).toBeLessThanOrEqual(box.window);
  };
  await expectFit();
  await card(page).locator('.hm-menu > summary').click();
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await expect(card(page).locator('.editor-wrap')).toBeVisible();
  await expectFit();
  const overlap = await card(page).evaluate(node => {
    const a = node.shadowRoot.querySelector('.viewport > .layers').getBoundingClientRect();
    const b = node.shadowRoot.querySelector('.hm-fab').getBoundingClientRect();
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  });
  expect(overlap).toBe(false);
});

test('a height-only resize keeps a moved camera, and refits an untouched one', async ({ page }) => {
  const camera = () => card(page).evaluate(node => ({ ...node.camera, height: node.viewport.clientHeight }));
  const start = await camera();
  await card(page).evaluate(node => node.status('Mensaje de prueba'));
  await expect.poll(async () => (await camera()).height).toBeLessThan(start.height);
  await expect.poll(async () => (await camera()).y).not.toBe(start.y);
  await card(page).evaluate(node => node.status(''));
  await expect.poll(async () => (await camera()).height).toBe(start.height);
  const moved = await card(page).evaluate(node => {
    node.moveCamera({ ...node.camera, scale: node.camera.scale * 1.5 }, false);
    return node.camera.scale;
  });
  await card(page).evaluate(node => node.status('Mensaje de prueba'));
  await expect.poll(async () => (await camera()).height).toBeLessThan(start.height);
  await page.waitForTimeout(100);
  expect((await camera()).scale).toBe(moved);
});

test('capture activity and height evidence next to the mockup', async ({ page }, info) => {
  test.setTimeout(120000);
  const mobile = info.project.name === 'mobile';
  const folder = process.env.HM_CAPTURE_ACTIVITY_HEIGHTS
    ? 'docs/evidence/0.9-activity-heights'
    : info.outputPath('visuals');
  await mkdir(folder, { recursive: true });
  const size = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const shot = async (theme, name, expected = size) => {
    const path = `${folder}/${info.project.name}-${theme}-${name}.png`;
    await page.waitForTimeout(350);
    const bytes = await page.screenshot({ path, scale: 'css', animations: 'disabled' });
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([expected.width, expected.height]);
  };
  const open = async theme => {
    await page.setViewportSize(size);
    await page.goto('/tests/browser/fixtures/shell.html');
    await page.waitForFunction(() => window.shellHarnessReady);
    await page.evaluate(dark => {
      const harness = window.testHarness;
      harness.hass.themes = { darkMode: dark };
      harness.card.hass = { ...harness.hass };
    }, theme === 'dark');
    await expect(card(page)).toHaveAttribute('data-theme', theme);
  };
  for (const theme of ['light', 'dark']) {
    await open(theme);
    await shot(theme, 'plan');
    await card(page).getByRole('button', { name: 'Encuadrar Living', exact: true }).click();
    // A click during the camera's move would scroll the clipped viewport to reach the symbol.
    await page.waitForTimeout(500);
    await card(page).getByRole('button', { name: 'Ventilador Living', exact: true }).click();
    await expect(card(page).locator('.activity')).toContainText('Enviado');
    await page.evaluate(() => {
      for (const value of ['3.19994068145752', '3.26295804977417', '2.89073395729065'])
        window.testHarness.updateState('sensor.synthetic_power', value, {
          device_class: 'power',
          unit_of_measurement: 'kW',
        });
    });
    await expect(card(page).locator('.activity')).toContainText('Enviado');
    await shot(theme, 'activity');
    await open(theme);
    await card(page).locator('.hm-menu > summary').click();
    await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
    await expect(card(page).locator('.editor-wrap')).toBeVisible();
    await shot(theme, 'edit');
    await card(page).locator('[data-id=lamp] .primary').click();
    await expect(card(page).locator('.workspace > .editor')).toBeVisible();
    await shot(theme, 'inspector');
    if (!mobile) {
      const window1278 = { width: 1278, height: 900 };
      await open(theme);
      await page.setViewportSize(window1278);
      await page.evaluate(() => {
        document.getElementById('mount').style.width = '1022px';
      });
      await shot(theme, 'sidebar', window1278);
    }
  }
  await page.setViewportSize(size);
  await page.goto('/docs/vision-mockup.html');
  await page.locator(mobile ? '#phone' : 'div#desk').scrollIntoViewIfNeeded();
  await shot('light', 'reference-plan');
  await page.locator('.app.edit').first().scrollIntoViewIfNeeded();
  await shot('light', 'reference-edit');
});

test('critical alerts propagate to the symbol, room and pill, and the pill frames the sensor', async ({ page }) => {
  await page.evaluate(() =>
    window.testHarness.updateState('binary_sensor.synthetic_leak', 'on', { device_class: 'moisture' }),
  );
  await expect(card(page).locator('[data-id=leak] .symbol-badge')).toHaveText('1');
  await expect(card(page).locator('[data-room=kitchen] .room-alerts')).toHaveText('1');
  await expect(card(page).locator('.alert-pill')).toBeVisible();
  await card(page).getByRole('button', { name: 'Alertas', exact: true }).click();
  await expect(card(page).locator('[data-id=leak]')).toHaveClass(/selected/);
  await expect(card(page).locator('[data-id=leak] .primary')).toBeFocused();
  await page.evaluate(() =>
    window.testHarness.updateState('binary_sensor.synthetic_leak', 'off', { device_class: 'moisture' }),
  );
  await expect(card(page).locator('.alert-pill')).toBeHidden();
});

test('activity shows exact send/air/error vocabulary and retains one row per command', async ({ page }) => {
  await card(page).getByRole('button', { name: 'Encuadrar Living', exact: true }).click();
  await card(page).getByRole('button', { name: 'Ventilador Living', exact: true }).click();
  await expect(card(page).locator('.activity')).toContainText('Enviado');
  await page.evaluate(() =>
    window.testHarness.updateState('script.synthetic_fan', 'off', {
      homemanager_on_air: { at: new Date().toISOString(), result: 'heard' },
    }),
  );
  await expect(card(page).locator('.activity')).toContainText('en el aire');
  expect(
    await card(page).evaluate(node => node.activity.entries.filter(entry => entry.type === 'command').length),
  ).toBe(1);
  await card(page).getByRole('button', { name: 'Historial de actividad', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Historial de actividad', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(
    () =>
      (window.testHarness.hass.callService = async () => {
        throw new Error('synthetic failure');
      }),
  );
  await page.evaluate(() => (window.testHarness.card.hass = { ...window.testHarness.hass }));
  await card(page).getByRole('button', { name: 'Ventilador Living', exact: true }).click();
  await expect(card(page).locator('.activity')).toContainText('No se pudo enviar');
  await expect(card(page).locator('.activity')).toHaveAttribute('data-tone', 'alert');
});

test('capture the five requested visual scenarios and the import review', async ({ page }, testInfo) => {
  const size = testInfo.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const folder = process.env.HM_CAPTURE_VISUALS === '1' ? 'docs/evidence/0.7' : testInfo.outputPath('visuals');
  await mkdir(folder, { recursive: true });
  const shot = async label => {
    const bytes = await page.screenshot({ path: `${folder}/${testInfo.project.name}-${label}.png`, scale: 'css' });
    expect(bytes.readUInt32BE(16)).toBe(size.width);
    expect(bytes.readUInt32BE(20)).toBe(size.height);
  };
  await shot('plan');
  await card(page).getByRole('button', { name: 'Encuadrar Living', exact: true }).click();
  await expect(card(page).locator('.room-highlight')).toHaveCount(1);
  await shot('room');
  await card(page).getByRole('button', { name: 'Encuadrar todo', exact: true }).click();
  await page.evaluate(() =>
    window.testHarness.updateState('binary_sensor.synthetic_leak', 'on', { device_class: 'moisture' }),
  );
  await expect(card(page).locator('.alert-pill')).toBeVisible();
  await shot('alert');
  await card(page).getByRole('button', { name: 'Encuadrar Living', exact: true }).click();
  await card(page).getByRole('button', { name: 'Ventilador Living', exact: true }).click();
  await expect(card(page).locator('.activity')).toContainText('Enviado');
  await shot('activity');
  await card(page).locator('.hm-menu > summary').click();
  await shot('menu');
  await card(page).getByRole('button', { name: 'Editar plano', exact: true }).click();
  await card(page).getByRole('button', { name: 'Ajustes del plano', exact: true }).click();
  const editor = card(page).locator('homemanager-editor');
  await editor.locator('[data-settings="import-section"]').click();
  await editor.getByLabel('Importar JSON o SVG', { exact: true }).setInputFiles({
    name: 'joined.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><rect id="room-joined" width="600" height="400"><title>Casa reunida</title></rect></svg>',
    ),
  });
  await expect(page.getByRole('dialog', { name: 'Revisar cambios', exact: true })).toBeVisible();
  await shot('review');
});
