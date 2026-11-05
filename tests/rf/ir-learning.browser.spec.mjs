import { test, expect } from '../browser/local-test.mjs';
import { setup, ceiling } from '../browser/rf-helpers.mjs';

test('manual IR capture, test, save and press coexist with the RF workspace', async ({ page }) => {
  const rf = await setup(page, { remotes: [ceiling()] });
  await page.evaluate(() => {
    const { hass } = window.testHarness;
    const call = hass.callWS.bind(hass);
    const subscribe = hass.connection.subscribeMessage.bind(hass.connection);
    const calls = [];
    const library = [{ id: 'rf-only', source: 'rf', name: 'RF only', buttons: [] }];
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
            buttons: [{ id: 'power', name: message.button_name }],
          });
          return { id: 'demo' };
        case 'homemanager/remotes/ir/test':
        case 'homemanager/remotes/ir/press':
          return { result: 'sent' };
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
  await expect.poll(() => page.evaluate(() => window.irFixture.active())).toBe(false);
  await expect(ir.getByLabel('Portadora (Hz)')).toHaveValue('38000');
  await expect(ir.getByLabel('Origen de la portadora')).toHaveValue('estimated');
  await expect(ir.getByRole('button', { name: 'Probar', exact: true })).toBeDisabled();
  await ir.getByLabel('Emisor IR').selectOption('infrared.send_demo');
  await ir.getByLabel('Portadora (Hz)').fill('37963');
  await ir.getByLabel('Origen de la portadora').selectOption('known');
  await ir.getByRole('button', { name: 'Probar', exact: true }).click();
  await expect(ir.getByRole('status')).toContainText('Solicitud IR enviada');
  await ir.getByLabel('Nombre del control').fill('Control de prueba');
  await ir.getByLabel('Nombre del botón').fill('Encendido demo');
  await ir.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(ir.getByRole('status')).toContainText('Guardado en Home Assistant');
  await ir.getByRole('button', { name: 'Encendido demo' }).click();
  await expect(ir.getByRole('status')).toContainText('Solicitud IR enviada');
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

  await capture.click();
  await expect.poll(() => page.evaluate(() => window.irFixture.active())).toBe(true);
  await rf.getByRole('tab', { name: 'Controles', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.irFixture.active())).toBe(false);
  await rf.getByRole('button', { name: /Techo/ }).click();
  await expect(rf.locator('homemanager-rf-remote')).toBeVisible();
});
