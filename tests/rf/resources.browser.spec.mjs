import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '../browser/local-test.mjs';

async function open(page) {
  await page.goto('/tests/browser/fixtures/remotes-demo.html');
  const app = page.locator('homemanager-app');
  await app.locator('.hm-tools [data-command=configuration]').click();
  await app.locator('[data-settings=controls-section]').click();
  const rf = app.locator('homemanager-rf');
  await expect(rf.getByRole('heading', { name: 'Controles', exact: true })).toBeVisible();
  return rf;
}

async function shot(page, info, name) {
  if (!process.env.HM_REMOTES_EVIDENCE) return;
  const directory = path.join(process.env.HM_REMOTES_EVIDENCE, info.project.name);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, name + '.png'), animations: 'disabled' });
}

test('absolute setpoints, the remote clock, and independent persistent schedule actions', async ({ page }, info) => {
  const rf = await open(page);
  await shot(page, info, 'controles');
  await rf.getByRole('button', { name: 'Controles de estado absoluto', exact: true }).click();
  const resources = rf.locator('homemanager-remote-resources');
  await shot(page, info, 'controles-absolutos');
  await resources.getByRole('button', { name: /Aire de prueba/ }).click();
  await resources.getByLabel(/Temperatura solicitada/).fill('25.5');
  await resources.getByLabel(/Temperatura solicitada/).press('Tab');
  expect(
    await resources.getByLabel(/Temperatura solicitada/).evaluate(input => {
      const inputBox = input.getBoundingClientRect();
      const tile = input.closest('.widget').getBoundingClientRect();
      return inputBox.bottom <= tile.bottom && inputBox.right <= tile.right;
    }),
  ).toBe(true);
  await resources.getByRole('button', { name: 'Enviar estado', exact: true }).last().click();
  await expect(
    resources.getByText('Emisión solicitada. Estado físico sin confirmación.', { exact: true }),
  ).toBeVisible();
  await expect(resources.locator('.requested')).toContainText('25.5');
  await shot(page, info, 'clima');
  await resources.getByRole('button', { name: 'Temporizadores', exact: true }).click();
  await resources.getByRole('button', { name: 'Agregar horario', exact: true }).click();
  const schedule = resources.locator('form[data-form=schedule]');
  await schedule.getByRole('combobox', { name: 'Acción', exact: true }).selectOption('off');
  await schedule.getByLabel('Hora', { exact: true }).fill('23:15');
  await resources.getByLabel('Reloj del mando', { exact: true }).fill('20:30');
  await resources.getByLabel('Reloj del mando', { exact: true }).press('Tab');
  await expect(schedule.getByLabel('Hora', { exact: true })).toHaveValue('23:15');
  await expect(schedule.getByRole('combobox', { name: 'Acción', exact: true })).toHaveValue('off');
  await shot(page, info, 'horario-pendiente');
  await schedule.getByRole('button', { name: 'Guardar horario', exact: true }).click();
  await expect(resources.locator('.schedule')).toContainText('Apagar · 23:15');
  await resources.getByRole('button', { name: 'Editar', exact: true }).click();
  await schedule.getByRole('combobox', { name: 'Acción', exact: true }).selectOption('on');
  await schedule.getByRole('button', { name: 'Guardar horario', exact: true }).click();
  await expect(resources.locator('.schedule')).toContainText('Encender · 23:15');
  await shot(page, info, 'horarios');
  await resources.getByRole('button', { name: 'Diseñar', exact: true }).click();
  const designer = resources.locator('homemanager-control-designer');
  await designer.getByRole('tab', { name: 'Elementos' }).click();
  await expect(designer.locator('[data-absolute-piece=temperature]')).toBeVisible();
  await designer.locator('[data-absolute-piece=temperature]').click();
  await expect
    .poll(
      async () =>
        await page.evaluate(() => window.remotesDemoCalls.filter(message => message.command === 'design').length),
    )
    .toBe(1);
  await shot(page, info, 'disenador-absoluto');
});

test('a template previews on the named control, and a partial catalog import reaches the IR library', async ({
  page,
}, info) => {
  const rf = await open(page);
  await rf.locator('[data-open=techo]').click();
  const player = rf.locator('homemanager-rf-remote');
  await expect(player.locator('[data-spark=graph] svg')).toBeVisible();
  await expect(player.locator('[data-op=track]')).toHaveAttribute('aria-orientation', 'vertical');
  await expect(player.locator('[data-reading=graph]')).toContainText('W');
  await shot(page, info, 'grafica-severity');
  const slider = player.getByRole('slider', { name: 'Severity' });
  expect((await slider.boundingBox()).width).toBeGreaterThanOrEqual(24);
  await slider.press('ArrowUp');
  await expect(slider).toBeFocused();
  await rf.getByRole('button', { name: 'Diseñar', exact: true }).click();
  const designer = rf.locator('homemanager-control-designer');
  await designer.getByLabel('Vista previa de plantilla').selectOption('arena');
  await expect(designer.locator('.theme-arena.body')).toBeVisible();
  await expect(designer.getByRole('button', { name: 'Aplicar a Techo', exact: true })).toBeVisible();
  await shot(page, info, 'plantilla');
  await designer.getByRole('button', { name: 'Aplicar a Techo', exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          window.rfServer.library.find(remote => remote.id === 'techo').layout.find(piece => piece.type === 'canvas')
            ?.theme,
      ),
    )
    .toBe('arena');
  await rf.locator('.dh [data-command=back]').press('Enter');
  await rf.locator('.dh [data-command=back]').press('Enter');
  await rf.getByRole('button', { name: 'Biblioteca IR/RF', exact: true }).click();
  const resources = rf.locator('homemanager-remote-resources');
  await resources.locator('input[type=file]').setInputFiles({
    name: 'demo.ir',
    mimeType: 'text/plain',
    buffer: Buffer.from('synthetic fixture'),
  });
  await resources.getByRole('button', { name: 'Revisar señales', exact: true }).click();
  await resources.getByRole('button', { name: 'Seleccionar disponibles', exact: true }).click();
  for (const [field, value] of Object.entries({
    name: 'Televisor de prueba',
    brand: 'Ejemplo',
    model: 'Demo',
    revision: 'fixture',
  }))
    await resources.locator('input[name=' + field + ']').fill(value);
  await resources.locator('select[name=emitter]').selectOption('infrared.synthetic_emitter');
  await shot(page, info, 'biblioteca-parcial');
  await resources.getByRole('button', { name: 'Importar 1 señales disponibles', exact: true }).click();
  await expect(resources.getByText('Importación parcial', { exact: false })).toBeVisible();
  await resources.getByRole('button', { name: /Televisor de prueba/ }).click();
  const ir = rf.locator('homemanager-ir-manager');
  await ir.getByText('Pruebas e historial', { exact: true }).click();
  await expect(ir.getByText('Flipper-IRDB · demo.ir · fixture')).toBeVisible();
  await shot(page, info, 'biblioteca-importada');
  await ir.getByRole('button', { name: 'Ficha técnica de Apagar' }).click();
  const workbench = page.locator('homemanager-signal-workbench');
  await expect(workbench.getByRole('button', { name: 'Pruebas', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await shot(page, info, 'historial-senal');
});

test('a late recorder response cannot draw on a different sensor or time range', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/remotes-demo.html');
  await page.waitForFunction(() => window.testHarnessReady && customElements.get('homemanager-rf-remote'));
  const result = await page.evaluate(async () => {
    const player = document.createElement('homemanager-rf-remote');
    const requests = new Map();
    player.history = (id, period) => new Promise(resolve => requests.set(id + period, resolve));
    document.body.append(player);
    const set = (reading, period) => {
      player.remote = {
        id: 'demo',
        buttons: [],
        parts: [],
        layout: [
          {
            id: 'chart',
            type: 'graph',
            x: 0,
            y: 0,
            w: 4,
            h: 2,
            buttons: [],
            label: 'Lectura',
            icon: null,
            reading,
            period,
          },
        ],
      };
    };
    set('sensor.synthetic_a', '24h');
    set('sensor.synthetic_b', '1h');
    const from = Date.now() - 2_000,
      to = Date.now();
    requests.get('sensor.synthetic_b1h')({
      from,
      to,
      samples: [
        { at: from, value: 20 },
        { at: to, value: 24 },
      ],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const line = () => player.shadowRoot.querySelector('[data-spark=chart] .line').getAttribute('d');
    const before = line();
    requests.get('sensor.synthetic_a24h')({
      from,
      to,
      samples: [
        { at: from, value: 80 },
        { at: to, value: 5 },
      ],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    return { before, after: line() };
  });
  expect(result.after).toBe(result.before);
});

test('the demo captures the current RF and IR learning flows', async ({ page }, info) => {
  const rf = await open(page);
  await rf.locator('[data-open=techo]').click();
  await rf.getByRole('button', { name: 'Aprender botones', exact: true }).click();
  const learn = rf.locator('homemanager-rf-learn');
  await learn.getByLabel('Botón que querés aprender', { exact: true }).fill('Botón de prueba');
  await learn.getByRole('button', { name: 'Empezar', exact: true }).click();
  await page.evaluate(() => window.rfServer.heard({ confirmed: true, confirmed_by: 'presses', frames: 3, bursts: 2 }));
  await learn.getByRole('button', { name: 'Probar', exact: true }).click();
  await expect(learn.getByRole('button', { name: 'Guardar señal', exact: true })).toBeVisible();
  await shot(page, info, 'aprendizaje-rf');
  await rf.locator('.dh [data-command=back]').press('Enter');
  await rf.locator('.dh [data-command=back]').press('Enter');
  await rf.locator('[data-open-ir=demo-ir]').click();
  const ir = rf.locator('homemanager-ir-manager');
  await ir.getByRole('button', { name: 'Capturar botón IR', exact: true }).click();
  await ir.getByRole('button', { name: 'Probar', exact: true }).click();
  await expect(ir.getByRole('button', { name: 'Reaccionó', exact: true })).toBeVisible();
  await ir.getByRole('button', { name: 'Probar', exact: true }).click();
  await expect(ir.getByRole('button', { name: 'Guardar señal', exact: true })).toBeVisible();
  await shot(page, info, 'aprendizaje-ir');
  await page.evaluate(() => {
    window.demoWaitForIrTest = true;
  });
  await ir.getByRole('button', { name: 'Probar', exact: true }).click();
  await expect(ir.getByRole('button', { name: 'Probar', exact: true })).toBeDisabled();
  await ir.getByRole('button', { name: 'Guardar señal', exact: true }).click();
  await expect(ir.getByRole('button', { name: 'Capturar botón IR', exact: true })).toBeVisible();
  await page.evaluate(() => window.demoFinishIrTest());
  await expect(ir.getByRole('button', { name: 'Capturar botón IR', exact: true })).toBeEnabled();
});
