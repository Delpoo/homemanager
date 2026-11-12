import { test, expect } from '../browser/local-test.mjs';
import { setup, ceiling, calls } from '../browser/rf-helpers.mjs';

test('editing exposes guided learning; evidence is real, one target is retained, free mode stays available', async ({
  page,
}) => {
  const rf = await setup(page, { remotes: [ceiling()] });
  await rf.locator('[data-open=techo]').click();
  await rf.getByRole('button', { name: 'Aprender botones', exact: true }).click();
  const learn = rf.locator('homemanager-rf-learn');
  await expect(learn).toBeVisible();
  expect(await calls(page, 'homemanager/rf/capture')).toEqual([]);
  await learn.getByLabel('Botón que querés aprender', { exact: true }).fill('Temporizador de prueba');
  await learn.getByRole('button', { name: 'Empezar', exact: true }).click();
  // Guided mode asks for that very button, never "any, in any order" (#64).
  await expect(learn.getByText('Pulsá «Temporizador de prueba» en el control', { exact: true })).toBeVisible();
  await expect(learn.getByText(/Apuntá a .+\. Mantené pulsado un momento\./)).toBeVisible();
  await expect(learn.getByText(/en el orden que quieras/)).toHaveCount(0);
  await page.evaluate(() => window.rfServer.heard({ burst_frames: 2, frames: 2, bursts: 1 }));
  await expect(learn.getByText('«Temporizador de prueba» recibido, falta repetir', { exact: true })).toBeVisible();
  await expect(learn.locator('progress').first()).toHaveAttribute('value', '2');
  await expect(learn.getByText(/Señales iguales en esta pulsación: 2/)).toBeVisible();
  await expect(learn.getByRole('button', { name: 'Probar', exact: true })).toHaveCount(0);
  await page.evaluate(() =>
    window.rfServer.heard({ burst_frames: 1, frames: 3, bursts: 2, confirmed: true, confirmed_by: 'presses' }),
  );
  await expect(learn.getByText(/La misma señal en 2 pulsaciones/)).toBeVisible();
  await expect(learn.getByText('«Temporizador de prueba» reconocido', { exact: true })).toBeVisible();
  await expect(learn.getByLabel('Nombre del botón')).toHaveValue('Temporizador de prueba');
  await page.evaluate(() => window.rfServer.heard({ candidate_id: 'other', confirmed: true, confirmed_by: 'frames' }));
  await expect(learn.getByLabel('Nombre del botón')).toHaveValue('Temporizador de prueba');
  await learn.getByRole('button', { name: 'Guardar sin probar', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'homemanager/rf/button/save')).at(-1)?.candidate_id).toBe('c1');
  expect(await calls(page, 'homemanager/rf/test')).toEqual([]);
  await learn.getByRole('button', { name: 'Modo libre', exact: true }).click();
  await expect(learn.getByRole('button', { name: 'Modo guiado', exact: true })).toBeVisible();
});

test('an offline receiver explains setup and does not start capture', async ({ page }) => {
  const rf = await setup(page, { remotes: [ceiling()] });
  await rf.evaluate(node => {
    node.rfDevices = [
      { id: 'tx_a', online: false },
      { id: 'tx_b', online: false },
    ];
  });
  await rf.locator('[data-open=techo]').click();
  await rf.getByRole('button', { name: 'Aprender botones', exact: true }).click();
  const learn = rf.locator('homemanager-rf-learn');
  await expect(learn).toContainText('No hay un receptor disponible');
  await learn.getByLabel('Botón que querés aprender').fill('Luz');
  await expect(learn.getByRole('button', { name: 'Empezar', exact: true })).toBeDisabled();
  expect(await calls(page, 'homemanager/rf/capture')).toEqual([]);
  await learn.getByRole('button', { name: 'Abrir Equipos RF', exact: true }).click();
  await expect(rf.getByRole('heading', { name: 'Equipos', exact: true })).toBeVisible();
});

test('without a configured receiver the visible panel explains setup without capture', async ({ page }) => {
  const rf = await setup(page, { remotes: [ceiling()] });
  await rf.evaluate(node => {
    node.transmitters = [];
    node.rfDevices = [];
  });
  await rf.locator('[data-open=techo]').click();
  await rf.getByRole('button', { name: 'Aprender botones', exact: true }).click();
  const learn = rf.locator('homemanager-rf-learn');
  await expect(learn).toContainText('No hay un receptor disponible');
  await learn.getByLabel('Botón que querés aprender').fill('Luz');
  await expect(learn.getByRole('button', { name: 'Empezar', exact: true })).toBeDisabled();
  expect(await calls(page, 'homemanager/rf/capture')).toEqual([]);
});

test('switching receivers ignores events and late subscription acknowledgements from the old receiver', async ({
  page,
}, testInfo) => {
  const rf = await setup(page, { remotes: [ceiling()] });
  await rf.locator('[data-open=techo]').click();
  await rf.getByRole('button', { name: 'Aprender botones', exact: true }).click();
  const learn = rf.locator('homemanager-rf-learn');
  await learn.evaluate(node => {
    const connection = node.hass.connection;
    const original = connection.subscribeMessage;
    window.captureSessions = [];
    connection.subscribeMessage = (callback, message) => {
      if (message.type !== 'homemanager/rf/capture') return original(callback, message);
      return new Promise(resolve => {
        const session = {
          callback,
          stopped: false,
          acknowledge: () =>
            resolve(() => {
              session.stopped = true;
            }),
        };
        window.captureSessions.push(session);
      });
    };
  });
  await learn.getByLabel('Botón que querés aprender').fill('Luz de prueba');
  await learn.getByRole('button', { name: 'Empezar', exact: true }).click();
  await learn.locator('[data-listen=tx_b]').click();
  await page.evaluate(() => {
    const [old, current] = window.captureSessions;
    current.acknowledge();
    old.acknowledge();
    old.callback({
      candidate: {
        candidate_id: 'old',
        transmitter: 'tx_a',
        protocol: 1,
        nbits: 24,
        pulse_us: 350,
        frames: 3,
        bursts: 1,
        burst_frames: 3,
        confirmed: true,
        confirmed_by: 'frames',
        known_as: [],
      },
    });
    current.callback({
      candidate: {
        candidate_id: 'current',
        transmitter: 'tx_b',
        protocol: 1,
        nbits: 24,
        pulse_us: 400,
        frames: 3,
        bursts: 1,
        burst_frames: 3,
        confirmed: true,
        confirmed_by: 'frames',
        known_as: [],
      },
    });
  });
  await learn.getByText('Detalles de la señal', { exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('rf-receiver-switch.png'), animations: 'disabled' });
  await expect(learn.getByText(/pulso medido de la señal: 400 µs/)).toBeVisible();
  expect(await page.evaluate(() => window.captureSessions[0].stopped)).toBe(true);
  await learn.getByRole('button', { name: 'Listo', exact: true }).click();
  expect(await page.evaluate(() => window.captureSessions[1].stopped)).toBe(true);
});
