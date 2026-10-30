import './harness.js';
import { mountRfFixture, ceiling } from './rf-server.js';
window.testHarness.hass.themes = { darkMode: new URL(location.href).searchParams.get('theme') === 'dark' };
await mountRfFixture([
  ceiling({ name: 'Ventilador_Living' }),
  ceiling({
    id: 'luz-balcon',
    name: 'Luz_del_balcón',
    icon: 'mdi:lightbulb',
    buttons: [
      { id: 'on', name: 'Encender', icon: 'mdi:power' },
      { id: 'off', name: 'Apagar', icon: 'mdi:power-off' },
    ],
  }),
  ceiling({ id: 'cortina', name: 'Cortina_Dormitorio', icon: 'mdi:blinds' }),
]);
const { hass } = window.testHarness,
  prior = hass.callWS.bind(hass);
hass.callWS = async message => {
  if (message.type === 'homemanager/homes') return { homes: [] };
  const result = await prior(message);
  // Deliberately awkward registry names must never leak into visible RF copy.
  if (message.type === 'homemanager/rf/transmitters')
    return {
      ...result,
      transmitters: result.transmitters.map(item => ({ ...item, name: item.name.replaceAll(' ', '_') })),
    };
  if (message.type === 'homemanager/rf/devices')
    return { ...result, devices: result.devices.map(item => ({ ...item, name: item.name.replaceAll(' ', '_') })) };
  return result;
};
const app = document.createElement('homemanager-app');
document.querySelector('#mount').replaceChildren(app);
app.hass = hass;
await new Promise(requestAnimationFrame);
await new Promise(requestAnimationFrame);
app.shadowRoot.querySelector('[data-app-command=rf]').click();
window.cp6Ready = true;
