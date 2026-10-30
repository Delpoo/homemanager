import { t } from '../i18n/index.js';
import { escapeHTML as e, type Hass } from '../card/types.js';
import { installPanelComponents } from '../ui/panel-components.js';
import { uiIcon } from '../ui/components.js';
import { rfDeviceStyles, rfText } from '../ui/rf-components.js';
import { rf, type RfDevice, type RfDevices } from '../integration/rf.js';

/** RF devices: every ESPHome device, whether it has the HomeManager RF
 * package, and how to add it. HomeManager does not edit ESPHome YAML (ESPHome
 * Builder owns it); it shows the exact lines with a Copy button and opens
 * ESPHome Builder when Supervisor runs it. A device with the package can be
 * the default receiver and can be checked by listening for a few seconds. */

const PROBE_SECONDS = 15;

/** The lines to add to a device's YAML. Athom's RF IR Remote names its 433 MHz
 * components rf_transmitter and rf_receiver; other boards use their own ids. */
export function packageYaml(device: Pick<RfDevice, 'manufacturer' | 'model'>, reference: string): string {
  const athom = /athom/i.test(`${device.manufacturer ?? ''} ${device.model ?? ''}`);
  const note = athom ? '' : `   # ${t('cambiá por el id de tu componente')}`;
  return [
    'substitutions:',
    `  hm_rf_transmitter: rf_transmitter${note}`,
    `  hm_rf_receiver: rf_receiver${note}`,
    '',
    'packages:',
    `  homemanager_rf: ${reference}`,
  ].join('\n');
}

export class HomeManagerRfDevices extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private _hass?: Hass;
  private data: RfDevices | null = null;
  private open = new Set<string>();
  private probe: { id: string; text: string; stop: (() => void) | null } | null = null;
  private message = '';
  private failed = false;
  /** Called when the default receiver changes. */
  onChange?: () => void;

  constructor() {
    super();
    installPanelComponents(this.root, 'rf-devices', rfDeviceStyles, false);
  }

  set hass(hass: Hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) void this.load();
  }

  /** Closes a running reception check. Detaching (a re-render of the host)
   * does not: the host calls this when the page is left. */
  stop(): void {
    this.endProbe();
  }

  async load(): Promise<void> {
    if (!this._hass) return;
    try {
      this.data = await rf.devices(this._hass);
      this.failed = false;
    } catch (error) {
      this.failed = true;
      this.message = t('Home Assistant rechazó la operación: {message}', {
        message: (error as { message?: string })?.message ?? '',
      });
    }
    this.render();
  }

  private render(): void {
    const data = this.data;
    const status = `<p class="status${this.failed ? ' error' : ''}" role="status">${e(this.message)}</p>`;
    if (!data) {
      this.root.innerHTML = `<div class="wrap"><p>${e(t('Cargando…'))}</p>${status}</div>`;
      return;
    }
    const intro = `<p class="muted">${e(t('Un equipo RF es un dispositivo ESPHome con transmisor y receptor de 433 MHz, como el Athom RF IR Remote. HomeManager lo usa cuando tiene el paquete HomeManager RF.'))}</p>`;
    const list = data.devices.length
      ? data.devices.map(device => this.renderDevice(device, data)).join('')
      : `<p>${e(t('No hay dispositivos ESPHome en Home Assistant. Agregá tu equipo RF desde Ajustes → Dispositivos y servicios → ESPHome.'))}</p>`;
    this.root.innerHTML = `<div class="wrap">${intro}${list}<div class="row"><button type="button" data-command="refresh">${e(t('Actualizar'))}</button></div>${status}</div>`;
    this.bind();
  }

  private renderDevice(device: RfDevice, data: RfDevices): string {
    const id = e(device.id);
    const badge = !device.online
      ? `<span class="badge off">${e(t('Desconectado'))}</span>`
      : device.has_package
        ? `<span class="badge ok">✓ ${e(t('Listo'))}</span>`
        : `<span class="badge">${e(t('Falta el paquete'))}</span>`;
    const model = [device.manufacturer, device.model].filter(Boolean).join(' · ');
    const isDefault = data.default_receiver === device.id;
    const actions = device.has_package
      ? `<div class="row">${device.can_capture ? `<button type="button" data-probe="${id}">${e(t('Probar recepción'))}</button><details class="device-options"><summary aria-label="${e(t('Más opciones'))}">⋮</summary><div class="device-options-body"><button type="button" data-default="${id}" aria-pressed="${isDefault}">${e(isDefault ? t('Receptor por defecto') : t('Usar para aprender'))}</button><button type="button" data-toggle="${id}" aria-expanded="${this.open.has(device.id)}">${e(t('Ver YAML'))}</button></div></details>` : `<button type="button" data-toggle="${id}" aria-expanded="${this.open.has(device.id)}">${e(t('Ver YAML'))}</button>`}</div>`
      : `<div class="row"><button type="button" data-toggle="${id}" aria-expanded="${this.open.has(device.id)}">${e(t('Cómo agregarlo'))}</button></div>`;
    const probe = this.probe?.id === device.id ? `<p class="probe" role="status">${e(this.probe.text)}</p>` : '';
    const yaml = packageYaml(device, data.package);
    const builder = data.builder_url
      ? `<a class="link" href="${e(data.builder_url)}" target="_top">${e(t('Abrir ESPHome Builder'))}</a>`
      : e(t('Abrí ESPHome Builder (la app ESPHome de Home Assistant).'));
    const steps = this.open.has(device.id)
      ? `<ol><li>${builder}</li><li>${e(t('En {name}, tocá Edit y agregá estas líneas. Si esas secciones ya existen, agregá sólo las líneas de adentro.', { name: rfText(device.name) }))}<pre data-yaml="${id}">${e(yaml)}</pre><div class="row"><button type="button" data-copy="${id}">${e(t('Copiar'))}</button></div></li><li>${e(t('Save → Install → Wirelessly. Cuando termine, tocá Actualizar.'))}</li></ol>`
      : '';
    return `<div class="device" data-device="${id}"><div class="top">${uiIcon('mdi:chip')}<div class="info"><div class="name">${e(rfText(device.name))}</div>${model ? `<div class="muted">${e(rfText(model))}</div>` : ''}</div>${badge}</div>${actions}${probe}${steps}</div>`;
  }

  private bind(): void {
    const root = this.root;
    root.querySelector('[data-command=refresh]')?.addEventListener('click', () => void this.load());
    root.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach(button =>
      button.addEventListener('click', () => {
        const id = button.dataset.toggle!;
        if (!this.open.delete(id)) this.open.add(id);
        this.render();
      }),
    );
    root
      .querySelectorAll<HTMLButtonElement>('[data-copy]')
      .forEach(button => button.addEventListener('click', () => void this.copy(button.dataset.copy!)));
    root
      .querySelectorAll<HTMLButtonElement>('[data-default]')
      .forEach(button => button.addEventListener('click', () => void this.setDefault(button.dataset.default!)));
    root
      .querySelectorAll<HTMLButtonElement>('[data-probe]')
      .forEach(button => button.addEventListener('click', () => void this.startProbe(button.dataset.probe!)));
  }

  private async copy(id: string): Promise<void> {
    const block = this.root.querySelector<HTMLElement>(`[data-yaml="${CSS.escape(id)}"]`);
    if (!block) return;
    try {
      await navigator.clipboard.writeText(block.textContent ?? '');
      this.message = t('Copiado.');
    } catch {
      // Without clipboard access (plain http), select it for Ctrl+C.
      const range = document.createRange();
      range.selectNodeContents(block);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      this.message = t('Seleccionado: copialo con Ctrl+C.');
    }
    this.failed = false;
    const status = this.root.querySelector('.status');
    if (status) status.textContent = this.message;
  }

  private async setDefault(id: string): Promise<void> {
    const current = this.data?.default_receiver;
    try {
      await rf.setDefaultReceiver(this._hass!, current === id ? null : id);
      this.message = '';
      await this.load();
      this.onChange?.();
    } catch (error) {
      this.failed = true;
      this.message = (error as { message?: string })?.message ?? t('Algo falló.');
      this.render();
    }
  }

  private async startProbe(id: string): Promise<void> {
    this.endProbe();
    const probe: { id: string; text: string; stop: (() => void) | null } = {
      id,
      text: t('Escuchando {seconds} s: pulsá cualquier botón de un control.', { seconds: PROBE_SECONDS }),
      stop: null,
    };
    this.probe = probe;
    this.render();
    let heard: 'nothing' | 'noise' | 'code' = 'nothing';
    try {
      probe.stop = await rf.capture(this._hass!, id, PROBE_SECONDS, event => {
        if (this.probe !== probe) return;
        if (event.candidate) {
          heard = 'code';
          probe.text = t('✓ Recibe bien: tipo {protocol}, tamaño {bits}, pulso {pulse} µs.', {
            protocol: event.candidate.protocol,
            bits: event.candidate.nbits,
            pulse: event.candidate.pulse_us,
          });
        } else if (event.noise && heard === 'nothing') {
          heard = 'noise';
          probe.text = t('Llega señal, pero no se reconoce: acercá el control o probá otro.');
        } else if (event.done) {
          probe.stop = null;
          if (heard === 'nothing')
            probe.text = t('No llegó ninguna señal. Revisá que el equipo esté encendido y cerca.');
        }
        this.render();
      });
    } catch (error) {
      probe.text = (error as { message?: string })?.message ?? t('Algo falló.');
      this.render();
    }
  }

  private endProbe(): void {
    const stop = this.probe?.stop;
    if (this.probe) this.probe.stop = null;
    try {
      stop?.();
    } catch {
      /* already closed */
    }
  }
}

if (!customElements.get('homemanager-rf-devices'))
  customElements.define('homemanager-rf-devices', HomeManagerRfDevices);
