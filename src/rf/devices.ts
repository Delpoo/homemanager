import { t } from '../i18n/index.js';
import { escapeHTML as e, type Hass } from '../card/types.js';
import { installPanelComponents } from '../ui/panel-components.js';
import { uiIcon } from '../ui/components.js';
import { rfDeviceStyles, rfText } from '../ui/rf-components.js';
import { iconButton, sidePanelStyles } from '../ui/side-panel.js';
import { rf, type RfDevice, type RfDevices } from '../integration/rf.js';
import { remotes, type IrDevice } from '../integration/remotes.js';
import { equipmentOf, builderPath, type Equipment } from './equipment.js';

/** Devices (0.13): every ESPHome board once, with what it does for remotes (RF
 * and IR), as icons. Boards that do neither (an energy meter) and boards that are
 * not connected go in their own closed groups. HomeManager does not edit ESPHome
 * YAML (ESPHome Builder owns it): it shows where each line goes, with Copy, and
 * opens ESPHome Builder. Adding or removing a board happens in Home Assistant,
 * one tap away. */

const PROBE_SECONDS = 15;
/** Home Assistant's own pages. */
const ADD_ESPHOME = '/config/integrations/dashboard/add?domain=esphome';
const devicePage = (id: string) => `/config/devices/device/${encodeURIComponent(id)}`;

/** The lines to add, per section. Athom's RF IR Remote names its 433 MHz
 * components rf_transmitter and rf_receiver; other boards use their own ids. */
export function packageSections(
  device: Pick<RfDevice, 'manufacturer' | 'model'>,
  reference: string,
): { section: string; lines: string[] }[] {
  const athom = /athom/i.test(`${device.manufacturer ?? ''} ${device.model ?? ''}`);
  const note = athom ? '' : `   # ${t('cambiá por el id de tu componente')}`;
  return [
    {
      section: 'substitutions:',
      lines: [`  hm_rf_transmitter: rf_transmitter${note}`, `  hm_rf_receiver: rf_receiver${note}`],
    },
    { section: 'packages:', lines: [`  homemanager_rf: ${reference}`] },
  ];
}

/** Everything at once, for a file that has neither section. */
export function packageYaml(device: Pick<RfDevice, 'manufacturer' | 'model'>, reference: string): string {
  return packageSections(device, reference)
    .map(part => [part.section, ...part.lines].join('\n'))
    .join('\n\n');
}

export class HomeManagerRfDevices extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private _hass?: Hass;
  private data: RfDevices | null = null;
  private ir: { receivers: IrDevice[]; emitters: IrDevice[] } = { receivers: [], emitters: [] };
  private open = new Set<string>();
  private probe: { id: string; text: string; stop: (() => void) | null } | null = null;
  private message = '';
  private failed = false;
  /** Called when the default receiver changes. */
  onChange?: () => void;

  constructor() {
    super();
    installPanelComponents(this.root, 'rf-devices', sidePanelStyles + rfDeviceStyles, false);
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
      const [devices, ir] = await Promise.all([
        rf.devices(this._hass),
        remotes.devices(this._hass).catch(() => ({ receivers: [], emitters: [] })),
      ]);
      this.data = devices;
      this.ir = ir;
      this.failed = false;
    } catch (error) {
      this.failed = true;
      this.message = t('Home Assistant rechazó la operación: {message}', {
        message: (error as { message?: string })?.message ?? '',
      });
    }
    this.render();
  }

  private builder(): string | null {
    const panels = (this._hass as unknown as { panels?: Parameters<typeof builderPath>[0] })?.panels;
    return builderPath(panels, this.data?.builder_url ?? null);
  }

  private render(): void {
    const data = this.data;
    const status = `<p class="status${this.failed ? ' error' : ''}" role="status">${e(this.message)}</p>`;
    if (!data) {
      this.root.innerHTML = `<div class="wrap"><p>${e(t('Cargando…'))}</p>${status}</div>`;
      return;
    }
    const builder = this.builder();
    const tools = `<div class="dtools">${iconButton(t('Agregar equipo ESPHome'), 'mdi:plus', `data-go="${e(ADD_ESPHOME)}"`)}${builder ? iconButton(t('Abrir ESPHome Builder'), 'mdi:code-braces-box', `data-go="${e(builder)}"`) : ''}<span class="grow"></span>${iconButton(t('Actualizar'), 'mdi:refresh', 'data-command="refresh"')}</div>`;
    const all = equipmentOf(data.devices, [], this.ir.receivers, this.ir.emitters);
    const group = (name: Equipment['group']) => all.filter(item => item.group === name);
    const cards = (items: Equipment[]) => items.map(item => this.renderDevice(item, data)).join('');
    const closed = (name: Equipment['group'], title: string, glyph: string) => {
      const items = group(name);
      return items.length
        ? `<details class="dgroup" data-group="${name}"><summary>${uiIcon(glyph)}<span>${e(title)}</span><b>${items.length}</b></summary><div class="dlist">${cards(items)}</div></details>`
        : '';
    };
    const main = group('remote');
    const list = all.length
      ? `${main.length ? `<div class="dlist">${cards(main)}</div>` : `<p class="muted">${e(t('Ningún equipo envía ni escucha controles todavía.'))}</p>`}${closed('other', t('Otros equipos ESPHome'), 'mdi:chip')}${closed('offline', t('Sin conexión'), 'mdi:lan-disconnect')}`
      : `<div class="empty-state">${uiIcon('mdi:chip')}<span>${e(t('No hay equipos ESPHome en Home Assistant.'))}</span><button type="button" class="next" data-go="${e(ADD_ESPHOME)}">${uiIcon('mdi:plus')}${e(t('Agregar equipo ESPHome'))}</button></div>`;
    this.root.innerHTML = `<div class="wrap">${tools}${list}${status}</div>`;
    // A group with an open card stays open.
    for (const details of this.root.querySelectorAll<HTMLDetailsElement>('details.dgroup'))
      if (details.querySelector('.steps')) details.open = true;
    this.bind();
  }

  private renderDevice(item: Equipment, data: RfDevices): string {
    const id = e(item.key);
    const device = item.rf;
    const model = device ? [device.manufacturer, device.model].filter(Boolean).join(' · ') : '';
    const cap = (on: boolean, glyph: string, label: string, title: string) =>
      `<span class="cap${on ? ' on' : ''}" title="${e(title)}">${uiIcon(glyph)}<span>${e(label)}</span></span>`;
    const caps = [
      item.rfReady ? cap(true, 'mdi:access-point', 'RF', item.rfListens ? t('Envía y escucha RF') : t('Envía RF')) : '',
      item.irEmitter || item.irReceiver
        ? cap(
            true,
            'mdi:remote-tv',
            'IR',
            item.irEmitter && item.irReceiver
              ? t('Envía y escucha IR')
              : item.irEmitter
                ? t('Envía IR')
                : t('Escucha IR'),
          )
        : '',
    ].join('');
    const isDefault = data.default_receiver === item.key;
    const acts = [
      item.rfListens ? iconButton(t('Probar recepción RF'), 'mdi:ear-hearing', `data-probe="${id}"`) : '',
      item.rfListens
        ? iconButton(
            isDefault ? t('Receptor RF por defecto') : t('Usar para aprender RF'),
            isDefault ? 'mdi:star' : 'mdi:star-outline',
            `data-default="${id}" aria-pressed="${isDefault}"`,
          )
        : '',
      device && item.online
        ? iconButton(
            item.rfReady ? t('Líneas de RF en ESPHome') : t('Agregar RF a este equipo'),
            item.rfReady ? 'mdi:code-tags' : 'mdi:access-point-plus',
            `data-toggle="${id}" aria-expanded="${this.open.has(item.key)}"`,
          )
        : '',
      item.deviceId
        ? iconButton(
            item.online ? t('Abrir en Home Assistant') : t('Abrir en Home Assistant para quitarlo'),
            item.online ? 'mdi:open-in-new' : 'mdi:delete-outline',
            `data-go="${e(devicePage(item.deviceId))}"`,
          )
        : '',
    ].join('');
    const dot = `<span class="dot ${item.online ? 'ok' : 'alert'}" title="${e(item.online ? t('En línea') : t('Sin conexión'))}"></span>`;
    const probe = this.probe?.id === item.key ? `<p class="probe" role="status">${e(this.probe.text)}</p>` : '';
    const steps = device && this.open.has(item.key) ? this.steps(item, device, data) : '';
    return `<div class="device" data-device="${id}"><div class="top">${uiIcon('mdi:chip')}<div class="info"><div class="name">${e(rfText(item.name))}</div>${model ? `<div class="muted">${e(rfText(model))}</div>` : ''}</div>${dot}</div>${caps || acts ? `<div class="drow"><div class="caps">${caps}</div><div class="acts">${acts}</div></div>` : ''}${probe}${steps}</div>`;
  }

  /** Where each line goes: the section title (grey, already in the file) and the
   * lines to add under it (green). One Copy per section, plus the whole block for a
   * file that has neither section. */
  private steps(item: Equipment, device: RfDevice, data: RfDevices): string {
    const id = e(item.key);
    const builder = this.builder();
    const sections = packageSections(device, data.package)
      .map(
        (part, index) =>
          `<figure class="yaml"><pre data-yaml="${id}:${index}"><span class="ctx">${e(part.section)}</span>\n<span class="ctx">  …</span>\n${part.lines.map(line => `<span class="add">${e(line)}</span>`).join('\n')}</pre><button type="button" class="copy" data-copy="${id}" data-part="${index}">${uiIcon('mdi:content-copy')}${e(part.lines.length === 1 ? t('Copiar la línea') : t('Copiar {n} líneas', { n: part.lines.length }))}</button></figure>`,
      )
      .join('');
    return `<ol class="steps"><li><span class="n">1</span><div>${builder ? `<button type="button" class="link" data-go="${e(builder)}">${uiIcon('mdi:code-braces-box')}${e(t('Abrir ESPHome Builder'))}</button>` : e(t('Abrí ESPHome Builder (la app ESPHome de Home Assistant).'))} → <b>${e(rfText(item.name))}</b> → EDIT</div></li><li><span class="n">2</span><div><p>${e(t('Buscá cada sección y pegá las líneas verdes debajo de lo que ya tiene. No borres nada ni repitas la sección.'))}</p>${sections}<details class="nosec"><summary>${e(t('¿El archivo no tiene esas secciones?'))}</summary><p>${e(t('Pegá todo esto al final del archivo:'))}</p><pre data-yaml="${id}">${e(packageYaml(device, data.package))}</pre><button type="button" class="copy" data-copy="${id}" data-part="all">${uiIcon('mdi:content-copy')}${e(t('Copiar todo'))}</button></details></div></li><li><span class="n">3</span><div>SAVE → INSTALL → Wirelessly → ${iconButton(t('Actualizar'), 'mdi:refresh', 'data-command="refresh"')}</div></li></ol>`;
  }

  private bind(): void {
    const root = this.root;
    root
      .querySelectorAll('[data-command=refresh]')
      .forEach(button => button.addEventListener('click', () => void this.load()));
    root.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach(button =>
      button.addEventListener('click', () => {
        const id = button.dataset.toggle!;
        if (!this.open.delete(id)) this.open.add(id);
        this.render();
      }),
    );
    root
      .querySelectorAll<HTMLButtonElement>('[data-copy]')
      .forEach(button =>
        button.addEventListener('click', () => void this.copy(button.dataset.copy!, button.dataset.part!, button)),
      );
    root
      .querySelectorAll<HTMLButtonElement>('[data-default]')
      .forEach(button => button.addEventListener('click', () => void this.setDefault(button.dataset.default!)));
    root
      .querySelectorAll<HTMLButtonElement>('[data-probe]')
      .forEach(button => button.addEventListener('click', () => void this.startProbe(button.dataset.probe!)));
    root
      .querySelectorAll<HTMLElement>('[data-go]')
      .forEach(button => button.addEventListener('click', () => this.go(button.dataset.go!)));
  }

  /** A Home Assistant page: navigate inside the app, without reloading it. */
  private go(path: string): void {
    this.endProbe();
    history.pushState(null, '', path);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  }

  private async copy(id: string, part: string, button: HTMLElement): Promise<void> {
    const device = this.data?.devices.find(item => item.id === id);
    if (!device || !this.data) return;
    const text =
      part === 'all'
        ? packageYaml(device, this.data.package)
        : (packageSections(device, this.data.package)[Number(part)]?.lines.join('\n') ?? '');
    try {
      await navigator.clipboard.writeText(text);
      this.message = t('Copiado.');
    } catch {
      // Without clipboard access (plain http), select it for Ctrl+C.
      const block = button.closest('figure, details')?.querySelector('pre');
      if (block) {
        const range = document.createRange();
        range.selectNodeContents(block);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
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
