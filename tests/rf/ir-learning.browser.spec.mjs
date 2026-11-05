import { test, expect } from '../browser/local-test.mjs';
import { setup, ceiling } from '../browser/rf-helpers.mjs';

test('IR learning, design, plan replay and camera diagnostics coexist with the RF workspace', async ({ page }) => {
  const rf = await setup(page, { remotes: [ceiling()] });
  await page.evaluate(() => {
    const { hass } = window.testHarness;
    const call = hass.callWS.bind(hass);
    const subscribe = hass.connection.subscribeMessage.bind(hass.connection);
    const calls = [];
    const library = [{ id: 'rf-only', source: 'rf', name: 'RF only', buttons: [] }];
    const history = [];
    const timing = {
      node: 'infrared.learn_demo',
      at: '2026-01-01T12:00:00Z',
      integrity: 'received',
      format: 'signed_us',
      timings_us: [650, -225, 340, -1400],
      analysis: {
        duration_us: 2615,
        count: 4,
        transitions: 3,
        base_us: 280,
        spread_us: 55,
        frames: [{ start: 0, end: 4, gap_us: 0 }],
        histogram: [{ low_us: 128, high_us: 255, marks: 0, spaces: 1 }],
        decoded: null,
        discontinuities: [],
        leading_pause: false,
      },
    };
    let receive;
    hass.callWS = async message => {
      if (!message.type.startsWith('homemanager/remotes/')) return call(message);
      calls.push(structuredClone(message));
      switch (message.type) {
        case 'homemanager/remotes/library':
          return { remotes: structuredClone(library) };
        case 'homemanager/remotes/ir/devices':
          return {
            receivers: [{ id: 'infrared.learn_demo', name: 'Receptor de prueba' }],
            emitters: [
              { id: 'infrared.other_demo', name: 'Otro emisor' },
              { id: 'infrared.send_demo', name: 'Emisor de prueba' },
            ],
          };
        case 'homemanager/remotes/ir/save':
          library.push({
            source: 'ir',
            id: 'demo',
            name: message.remote_name,
            icon: null,
            description: null,
            layout: null,
            buttons: [{ id: 'power', name: message.button_name, icon: 'mdi:power', fingerprint: 'abcd1234' }],
          });
          return { id: 'demo' };
        case 'homemanager/remotes/ir/test':
        case 'homemanager/remotes/ir/press':
          return { result: 'sent' };
        case 'homemanager/remotes/ir/settings':
          return {
            emitter: 'infrared.send_demo',
            buttons: { power: { emitter: null, carrier_hz: 37963, carrier_source: 'known' } },
          };
        case 'homemanager/remotes/ir/remote/edit': {
          const remote = library.find(item => item.id === message.remote_id);
          Object.assign(remote, message.changes);
          return structuredClone(remote);
        }
        case 'homemanager/remotes/diagnostics/candidate':
          return message.advanced
            ? { original: timing, prepared: { ...timing, integrity: 'prepared' }, comparison: null }
            : { count: 4, duration_us: 2615, levels: [0, 1, 0, 1], integrity: 'received', protocol: null };
        case 'homemanager/remotes/diagnostics/devices':
          return {
            emitters: [{ id: 'infrared.send_demo', name: 'Emisor de prueba' }],
            receivers: [{ id: 'infrared.other_receiver', name: 'Receptor B de prueba' }],
          };
        case 'homemanager/remotes/diagnostics/sheet':
          return {
            identity: { source: 'ir', remote_name: 'Control de prueba', button_name: 'Encendido demo' },
            emitter: 'infrared.send_demo',
            original: timing,
            prepared: { ...timing, integrity: 'prepared', settings: { carrier_hz: 37963, carrier_source: 'known' } },
            comparison: null,
            history: structuredClone(history),
            observed: message.trial_id
              ? {
                  external: {
                    receiver: 'infrared.other_receiver',
                    status: 'observed',
                    blocks: [timing],
                    comparisons: [],
                  },
                }
              : {},
          };
        case 'homemanager/remotes/diagnostics/run':
          history.unshift({ id: 'trial-1', at: timing.at, kind: 'send', status: 'sent', snapshot: true });
          return { id: 'trial-1', saved: true, status: 'sent' };
        case 'homemanager/remotes/diagnostics/note':
          history.unshift({
            id: 'observation-1',
            at: timing.at,
            kind: 'observation',
            camera: message.camera,
            response: message.response,
          });
          return { id: 'observation-1' };
        default:
          throw new Error(`Unexpected request: ${message.type}`);
      }
    };
    hass.connection.subscribeMessage = async (callback, message, options) => {
      if (message.type !== 'homemanager/remotes/ir/capture') return subscribe(callback, message);
      if (options?.resubscribe !== false || !options.preCheck?.()) throw new Error('IR capture must be one-shot');
      calls.push(structuredClone(message));
      receive = callback;
      return () => {
        receive = undefined;
      };
    };
    window.irFixture = { calls, active: () => Boolean(receive), emit: event => receive?.(event) };
  });

  await expect(rf.getByRole('button', { name: /Techo/ })).toBeVisible();
  expect(await page.evaluate(() => window.irFixture.calls)).toEqual([]);
  await rf.getByRole('tab', { name: 'Infrarrojos' }).click();
  const ir = rf.locator('homemanager-ir-manager');
  await expect(ir.getByText('RF only')).toHaveCount(0);
  const capture = ir.getByRole('button', { name: 'Capturar botón IR' });
  await capture.click();
  await page.evaluate(() =>
    window.irFixture.emit({ candidate_id: 'demo-candidate', count: 380, duration_us: 153_000 }),
  );
  await expect(ir.getByText(/Señal capturada: 380 duraciones/)).toBeVisible();
  await expect(ir.getByRole('button', { name: 'Abrir diagnóstico avanzado' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.irFixture.active())).toBe(false);
  await expect(ir.getByLabel('Portadora (Hz)')).toHaveValue('38000');
  await expect(ir.getByLabel('Origen de la portadora')).toHaveValue('estimated');
  await expect(ir.getByRole('button', { name: 'Probar', exact: true })).toBeDisabled();
  await ir.getByLabel('Emisor IR').selectOption('infrared.send_demo');
  await ir.getByLabel('Portadora (Hz)').fill('37963');
  await ir.getByLabel('Origen de la portadora').selectOption('known');
  await ir.getByRole('button', { name: 'Probar', exact: true }).click();
  await expect(ir.locator('[data-ir-status]')).toContainText('Solicitud IR enviada');
  const sheet = page.locator('homemanager-signal-workbench');
  await ir.getByRole('button', { name: 'Abrir diagnóstico avanzado' }).click();
  await sheet.getByRole('button', { name: 'Señal', exact: true }).click();
  await expect(sheet.locator('.signal-chart')).toContainText('Preparada');
  await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await ir.getByLabel('Nombre del control').fill('Control de prueba');
  await ir.getByLabel('Nombre del botón').fill('Encendido demo');
  await ir.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(ir.locator('[data-ir-status]')).toContainText('Guardado en Home Assistant');
  await ir.getByRole('button', { name: 'Encendido demo' }).click();
  await expect(ir.locator('[data-ir-status]')).toContainText('Solicitud IR enviada');
  const writes = await page.evaluate(() =>
    window.irFixture.calls.filter(item => /ir\/(capture|test|save|press)$/.test(item.type)),
  );
  const replay = {
    candidate_id: 'demo-candidate',
    emitter_id: 'infrared.send_demo',
    carrier_hz: 37963,
    carrier_source: 'known',
  };
  expect(writes).toEqual([
    { type: 'homemanager/remotes/ir/capture', receiver_id: 'infrared.learn_demo' },
    { type: 'homemanager/remotes/ir/test', ...replay },
    { type: 'homemanager/remotes/ir/save', ...replay, remote_name: 'Control de prueba', button_name: 'Encendido demo' },
    { type: 'homemanager/remotes/ir/press', remote_id: 'demo', button_id: 'power' },
  ]);

  await ir.getByRole('button', { name: 'Editar diseño', exact: true }).click();
  const designer = ir.locator('homemanager-control-designer');
  await designer.getByRole('button', { name: 'Agregar elemento', exact: true }).click();
  const piece = designer.locator('homemanager-task-screen.editor');
  await piece.locator('[data-type=title]').click();
  await piece.locator('[name=widget-label]').fill('IR del plano');
  await piece.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(piece).toHaveCount(0);
  await ir.getByRole('button', { name: 'Editar control', exact: true }).click();
  await ir.getByRole('button', { name: 'Ficha técnica', exact: true }).click();
  await sheet.getByRole('button', { name: 'Emisión', exact: true }).click();
  await sheet.getByLabel('Receptor independiente B').selectOption('infrared.other_receiver');
  await sheet.getByRole('button', { name: 'Solicitar emisión de prueba' }).click();
  await expect(sheet.locator('.signal-chart')).toContainText('Observada por B');
  for (const format of ['SVG', 'PNG']) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      sheet.getByRole('button', { name: `Exportar ${format}`, exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`homemanager-senal.${format.toLowerCase()}`);
  }
  await sheet.getByRole('button', { name: 'Pruebas', exact: true }).click();
  await sheet.getByText('Comprobar con la cámara del teléfono', { exact: true }).click();
  await sheet.getByLabel('Resultado de cámara').selectOption('visible');
  await sheet.getByLabel('Respuesta del aparato').selectOption('no_response');
  await sheet.getByRole('button', { name: 'Guardar observación' }).click();
  await expect(sheet.getByRole('status')).toHaveText('Observación guardada');
  await expect(sheet.getByText('Emisión visible', { exact: true }).last()).toBeVisible();
  expect(
    await page.evaluate(() => window.irFixture.calls.find(item => item.type.endsWith('/diagnostics/note'))),
  ).toMatchObject({ camera: 'visible', response: 'no_response', trial_id: 'trial-1' });
  await sheet.getByRole('button', { name: 'Cerrar', exact: true }).click();

  await capture.click();
  await expect.poll(() => page.evaluate(() => window.irFixture.active())).toBe(true);
  await rf.getByRole('tab', { name: 'Controles', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.irFixture.active())).toBe(false);
  await rf.getByRole('button', { name: /Techo/ }).click();
  await expect(rf.locator('homemanager-rf-remote')).toBeVisible();

  await page.evaluate(() => {
    const h = window.testHarness;
    h.card.hass = { ...h.hass };
    document.querySelector('#mount').replaceChildren(h.card);
  });
  const card = page.locator('homemanager-card');
  const marker = card.locator('[data-id=synthetic-light] .primary');
  await card.getByRole('button', { name: 'Editar plano', exact: true }).click();
  await marker.click();
  const editor = card.locator('homemanager-editor');
  const controls = editor.locator('#device-controls-section');
  if (!(await controls.evaluate(node => node.open))) await controls.locator('summary').click();
  await editor.getByText('Más opciones', { exact: true }).click();
  await editor.getByRole('combobox', { name: 'Control IR en el panel' }).selectOption('demo');
  await editor.getByRole('button', { name: /^(Guardar dispositivo|Listo)$/, exact: true }).click();
  const save = card.getByRole('button', { name: 'Guardar cambios', exact: true });
  await save.click();
  await expect(save).toBeDisabled();
  await card.getByRole('button', { name: 'Salir de edición', exact: true }).click();
  await marker.click({ button: 'right' });
  const panel = page.locator('homemanager-panel .remote homemanager-rf-remote');
  await expect(panel).toContainText('IR del plano');
  await panel.getByRole('button', { name: 'Encendido demo' }).click();
  expect(await page.evaluate(() => window.irFixture.calls.filter(item => item.type.endsWith('/ir/press')).length)).toBe(
    2,
  );
});
