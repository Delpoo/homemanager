import { t } from '../i18n/index.js';
import { escapeHTML as e, type Hass } from '../card/types.js';
import { tokens } from '../ui/theme.js';
import {
  rf,
  suggestedFunctions,
  type RfCandidate,
  type RfFunction,
  type RfRemote,
  type RfSettings,
  type RfTransmitter,
} from '../integration/rf.js';

/** RF remote manager: a guided wizard to capture a physical remote button by
 * button, find the transmission settings that work by trying them, and a
 * detail view to rename, re-test or tune a remote. Administrators only; the
 * integration enforces it. Codes never reach this page. */

type Kind = 'fan' | 'light' | 'other';
type Step = 'setup' | 'capture' | 'done';
interface Attempt {
  transmitter: string;
  pulse_us: number;
  repeats: number;
  worked: boolean | null;
}
interface Wizard {
  step: Step;
  name: string;
  kind: Kind;
  speeds: number;
  listen: string;
  remoteId: string | null;
  queue: RfFunction[];
  candidate: RfCandidate | null;
  buttonName: string;
  buttonFunction: RfFunction | '';
  attempts: Attempt[];
  trial: Attempt | null;
  listening: boolean;
}

export function functionLabel(value: RfFunction | null | ''): string {
  if (!value) return t('Sin función');
  const speed = /^speed_(\d+)$/.exec(value);
  if (speed) return t('Velocidad {level}', { level: speed[1] });
  const labels: Record<string, string> = {
    off: t('Apagar'),
    power: t('Encender / apagar'),
    light: t('Luz (alterna)'),
    light_on: t('Encender luz'),
    light_off: t('Apagar luz'),
    brightness_up: t('Más brillo'),
    brightness_down: t('Menos brillo'),
    color_temperature: t('Cambiar tono'),
    speed_up: t('Más velocidad'),
    speed_down: t('Menos velocidad'),
    direction: t('Dirección'),
    timer: t('Temporizador'),
    mode: t('Modo'),
    other: t('Otro'),
  };
  return labels[value] ?? value;
}
const ALL_FUNCTIONS: RfFunction[] = [
  'off',
  'power',
  ...Array.from({ length: 12 }, (_, index) => `speed_${index + 1}` as RfFunction),
  'speed_up',
  'speed_down',
  'direction',
  'light',
  'light_on',
  'light_off',
  'brightness_up',
  'brightness_down',
  'color_temperature',
  'timer',
  'mode',
  'other',
];

const css = `${tokens}
:host{display:block}
.wrap{max-width:760px;margin:0 auto;display:grid;gap:14px}
.panel{background:var(--hm-bg);border-radius:var(--hm-radius);box-shadow:var(--hm-shadow);padding:18px;display:grid;gap:14px}
h2{margin:0;font-size:20px;font-weight:600}
h3{margin:0;font-size:15px;font-weight:600}
p{margin:0;line-height:1.5}
.muted{color:var(--hm-muted);font-size:13px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.row>*{flex:1 1 160px}
.row>button{flex:0 0 auto}
label{display:grid;gap:4px;font-size:13px;color:var(--hm-muted)}
.kinds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.kinds button{min-height:72px;display:grid;gap:2px;place-items:center;text-align:center;font-weight:600}
.kinds button span{font-size:12px;font-weight:400;color:var(--hm-muted)}
.kinds button[aria-pressed=true]{border-color:var(--hm-accent);box-shadow:var(--hm-focus)}
.kinds ha-icon{--mdc-icon-size:28px;color:var(--hm-accent)}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chips button{min-width:44px;padding:0;font-variant-numeric:tabular-nums}
.chips button[aria-pressed=true]{background:var(--hm-accent);border-color:var(--hm-accent);color:var(--hm-on-accent);font-weight:600}
.remote{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--hm-line);border-radius:14px}
.remote .info{flex:1;min-width:0}
.remote .name{font-weight:600}
.listen{display:flex;align-items:center;gap:12px;padding:14px;border-radius:14px;background:var(--hm-surface)}
.pulse{width:14px;height:14px;border-radius:50%;background:var(--hm-accent);flex:0 0 14px}
@media (prefers-reduced-motion:no-preference){.pulse.on{animation:hm-pulse 1.2s ease-in-out infinite}}
@keyframes hm-pulse{50%{opacity:.25;transform:scale(.7)}}
.prompt{font-size:18px;font-weight:600}
.code{padding:14px;border-radius:14px;border:1px solid var(--hm-line);display:grid;gap:10px}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;background:var(--hm-surface)}
.badge.ok{background:color-mix(in srgb,var(--hm-confirmed) 18%,transparent);color:var(--hm-confirmed)}
.badge.warn{background:color-mix(in srgb,var(--hm-estimated) 18%,transparent);color:var(--hm-estimated)}
.question{display:grid;gap:10px;padding:14px;border-radius:14px;background:color-mix(in srgb,var(--hm-accent) 8%,transparent)}
.buttons{display:grid;gap:8px}
.button-row{display:grid;grid-template-columns:1fr minmax(140px,190px) auto auto;gap:8px;align-items:center}
.attempts{display:grid;gap:4px;font-size:12px;color:var(--hm-muted)}
.status{font-size:13px;line-height:1.5}
.status.error{color:var(--hm-error)}
.status:empty{display:none}
details{border-top:1px solid var(--hm-line);padding-top:12px}
summary{cursor:pointer;font-weight:600;min-height:var(--hm-touch);display:flex;align-items:center}
.danger{color:var(--hm-error)}
@media(max-width:600px){.button-row{grid-template-columns:1fr 1fr}.panel{border-radius:0;box-shadow:none}.row>button{flex:1 1 auto}}
`;

export class HomeManagerRf extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private _hass?: Hass;
  private remotes: RfRemote[] = [];
  private transmitters: RfTransmitter[] = [];
  private view: 'list' | 'wizard' | 'remote' = 'list';
  private selected: string | null = null;
  private wizard: Wizard | null = null;
  private message = '';
  private failed = false;
  private stopCapture: (() => void) | null = null;
  private loaded = false;

  set hass(hass: Hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) void this.load();
  }
  get hass(): Hass | undefined {
    return this._hass;
  }

  disconnectedCallback(): void {
    this.endCapture();
  }

  private async load(): Promise<void> {
    if (!this._hass) return;
    try {
      const [library, transmitters] = await Promise.all([rf.library(this._hass), rf.transmitters(this._hass)]);
      this.remotes = library.remotes;
      this.transmitters = transmitters;
      this.loaded = true;
    } catch (error) {
      this.report(error);
    }
    this.render();
  }

  private report(error: unknown): void {
    const message = (error as { message?: string })?.message;
    this.failed = true;
    this.message = message ? t('Home Assistant rechazó la operación: {message}', { message }) : t('Algo falló.');
  }
  private say(message: string): void {
    this.failed = false;
    this.message = message;
  }

  private transmitterName(id: string): string {
    return this.transmitters.find(item => item.id === id)?.name ?? id;
  }

  // Rendering -------------------------------------------------------------

  private render(): void {
    const status = `<p class="status${this.failed ? ' error' : ''}" role="status">${e(this.message)}</p>`;
    let body = '';
    if (!this.loaded) body = `<div class="panel"><p>${e(t('Cargando…'))}</p>${status}</div>`;
    else if (this.view === 'wizard' && this.wizard) body = this.renderWizard(status);
    else if (this.view === 'remote' && this.remote()) body = this.renderRemote(status);
    else body = this.renderList(status);
    // A capture event can repaint while someone types a name: keep their caret.
    const active = this.root.activeElement as HTMLInputElement | null;
    const name = active?.name,
      row = active?.closest<HTMLElement>('[data-button]')?.dataset.button,
      caret = active?.selectionStart ?? null;
    this.root.innerHTML = `<style>${css}</style><div class="wrap">${body}</div>`;
    this.bind();
    if (name) {
      const scope = row ? this.root.querySelector(`[data-button="${CSS.escape(row)}"]`) : this.root;
      const field = scope?.querySelector<HTMLInputElement>(`[name="${CSS.escape(name)}"]`);
      field?.focus();
      if (field && caret !== null && 'setSelectionRange' in field && field.type === 'text')
        field.setSelectionRange(caret, caret);
    }
  }

  private renderList(status: string): string {
    const noTransmitter = !this.transmitters.length
      ? `<p class="muted">${e(t('No hay transmisores con el paquete HomeManager RF. Agregalo en ESPHome a tu emisor de 433 MHz (ver docs/rf-manager.md) y volvé a abrir esta página.'))}</p>`
      : '';
    const remotes = this.remotes.length
      ? this.remotes
          .map(
            remote =>
              `<div class="remote"><div class="info"><div class="name">${e(remote.name)}</div><div class="muted">${e(t('{count} botones · {transmitter} · {pulse} µs', { count: remote.buttons.length, transmitter: this.transmitterName(remote.transmitter), pulse: remote.pulse_us }))}</div></div><button type="button" data-open="${e(remote.id)}">${e(t('Abrir'))}</button></div>`,
          )
          .join('')
      : `<p class="muted">${e(t('Todavía no hay controles. Agregá el primero: HomeManager te guía botón por botón.'))}</p>`;
    return `<div class="panel"><div class="row"><h2>${e(t('Controles RF'))}</h2><button type="button" data-variant="primary" data-command="new"${this.transmitters.length ? '' : ' disabled'}>${e(t('Agregar control'))}</button></div>${noTransmitter}${remotes}${status}</div>`;
  }

  private renderWizard(status: string): string {
    const w = this.wizard!;
    if (w.step === 'setup') {
      const kinds: [Kind, string, string, string][] = [
        ['fan', t('Ventilador'), t('con o sin luz'), 'mdi:ceiling-fan-light'],
        ['light', t('Luz'), t('encender, apagar, brillo'), 'mdi:lightbulb-outline'],
        ['other', t('Otro equipo'), t('botones con nombre'), 'mdi:remote'],
      ];
      const icon = (name: string) =>
        customElements.get('ha-icon') ? `<ha-icon icon="${name}" aria-hidden="true"></ha-icon>` : '';
      const listeners = this.transmitters.filter(item => item.can_capture);
      return `<div class="panel"><h2>${e(t('Nuevo control'))}</h2>
<label>${e(t('Nombre del equipo'))}<input name="name" maxlength="80" value="${e(w.name)}" placeholder="${e(t('p. ej. Ventilador sala'))}"></label>
<div><p class="muted">${e(t('¿Qué controla?'))}</p><div class="kinds">${kinds.map(([kind, label, detail, glyph]) => `<button type="button" data-kind="${kind}" aria-pressed="${w.kind === kind}">${icon(glyph)}${e(label)}<span>${e(detail)}</span></button>`).join('')}</div></div>
${
  w.kind === 'fan'
    ? `<div><p class="muted" id="speeds-label">${e(t('¿Cuántas velocidades tiene el control?'))}</p><div class="chips" role="group" aria-labelledby="speeds-label">${Array.from(
        { length: 12 },
        (_, index) => index + 1,
      )
        .map(
          count =>
            `<button type="button" data-speeds="${count}" aria-pressed="${count === w.speeds}">${count}</button>`,
        )
        .join('')}</div></div>`
    : ''
}
<label>${e(t('Receptor que escucha el control (el más cercano)'))}<select name="listen">${listeners.map(item => `<option value="${e(item.id)}"${item.id === w.listen ? ' selected' : ''}>${e(item.name)}</option>`).join('')}</select></label>
<div class="row"><button type="button" data-command="cancel">${e(t('Cancelar'))}</button><button type="button" data-variant="primary" data-command="start"${w.name.trim() && listeners.length ? '' : ' disabled'}>${e(t('Empezar a capturar'))}</button></div>${status}</div>`;
    }
    if (w.step === 'done') {
      const remote = this.remotes.find(item => item.id === w.remoteId);
      return `<div class="panel"><h2>${e(t('Listo'))}</h2><p>${e(t('{name} quedó guardado con {count} botones.', { name: remote?.name ?? w.name, count: remote?.buttons.length ?? 0 }))}</p>${this.entitiesNote(w.remoteId)}<div class="row"><button type="button" data-open="${e(w.remoteId ?? '')}">${e(t('Ver el control'))}</button><button type="button" data-command="list">${e(t('Volver a la lista'))}</button></div>${status}</div>`;
    }
    return this.renderCapture(status);
  }

  private renderCapture(status: string): string {
    const w = this.wizard!;
    const remote = this.remotes.find(item => item.id === w.remoteId);
    const next = w.queue[0];
    const prompt = next
      ? t('Presioná en tu control: {button}', { button: functionLabel(next) })
      : t('Presioná otro botón de tu control');
    const listening = `<div class="listen"><span class="pulse${w.listening ? ' on' : ''}" aria-hidden="true"></span><div><div class="prompt">${e(prompt)}</div><div class="muted">${e(w.listening ? t('Escuchando con {receiver}…', { receiver: this.transmitterName(w.listen) }) : t('El receptor dejó de escuchar.'))}</div></div>${w.listening ? '' : `<button type="button" data-command="listen">${e(t('Seguir escuchando'))}</button>`}</div>`;
    const saved = remote?.buttons.length
      ? `<p class="muted">${e(t('Guardados: {names}', { names: remote.buttons.map(button => button.name).join(' · ') }))}</p>`
      : '';
    const skip = next
      ? `<button type="button" data-command="skip">${e(t('Mi control no tiene este botón'))}</button>`
      : '';
    return `<div class="panel"><h2>${e(remote?.name ?? w.name)}</h2>${listening}${w.candidate ? this.renderCandidate() : ''}${saved}<div class="row">${skip}<button type="button" data-command="finish"${remote?.buttons.length ? '' : ' disabled'}>${e(t('Terminar'))}</button><button type="button" data-command="cancel">${e(t('Cancelar'))}</button></div>${status}</div>`;
  }

  private renderCandidate(): string {
    const w = this.wizard!,
      c = w.candidate!;
    const badge = c.confirmed
      ? `<span class="badge ok">✓ ${e(t('Confirmado en {count} pulsaciones', { count: c.bursts }))}</span>`
      : `<span class="badge warn">${e(t('Presioná el mismo botón otra vez para confirmarlo'))}</span>`;
    const known = c.known_as.length
      ? `<p class="muted">${e(t('Este código ya está guardado como: {names}', { names: c.known_as.join(', ') }))}</p>`
      : '';
    const details = `<p class="muted">${e(t('Protocolo {protocol} · {bits} bits · pulso medido {pulse} µs', { protocol: c.protocol, bits: c.nbits, pulse: c.pulse_us }))}</p>`;
    const form = `<div class="row"><label>${e(t('Nombre del botón'))}<input name="buttonName" maxlength="80" value="${e(w.buttonName)}"></label><label>${e(t('Qué hace'))}<select name="buttonFunction"><option value="">${e(t('Sin función'))}</option>${ALL_FUNCTIONS.map(value => `<option value="${value}"${value === w.buttonFunction ? ' selected' : ''}>${e(functionLabel(value))}</option>`).join('')}</select></label></div>`;
    const firstButton = !w.remoteId;
    let action = '';
    if (c.confirmed && w.trial) {
      action = `<div class="question"><p><strong>${e(t('¿El equipo reaccionó?'))}</strong></p><p class="muted">${e(t('Enviado por {transmitter} · {pulse} µs · {repeats} repeticiones', { transmitter: this.transmitterName(w.trial.transmitter), pulse: w.trial.pulse_us, repeats: w.trial.repeats }))}</p><div class="row"><button type="button" data-variant="primary" data-command="worked">${e(firstButton ? t('Sí, funcionó') : t('Sí, guardar'))}</button><button type="button" data-command="failed">${e(t('No reaccionó'))}</button></div></div>`;
    } else if (c.confirmed) {
      action = `<div class="row"><button type="button" data-variant="primary" data-command="try">${e(t('Probar este botón'))}</button>${firstButton ? '' : `<button type="button" data-command="save">${e(t('Guardar sin probar'))}</button>`}</div>`;
    }
    const attempts = w.attempts.length
      ? `<div class="attempts">${w.attempts.map(item => `<span>${item.worked ? '✓' : '✗'} ${e(t('{transmitter} · {pulse} µs · {repeats} repeticiones', { transmitter: this.transmitterName(item.transmitter), pulse: item.pulse_us, repeats: item.repeats }))}</span>`).join('')}</div>`
      : '';
    return `<div class="code"><div class="row">${badge}</div>${details}${known}${form}${action}${attempts}</div>`;
  }

  private entitiesNote(remoteId: string | null): string {
    const entities = Object.entries(this._hass?.states ?? {})
      .filter(([, state]) => state.attributes?.homemanager_remote === remoteId)
      .map(([entityId]) => entityId);
    return entities.length
      ? `<p class="muted">${e(t('En Home Assistant: {entities}. Para verlo en el plano: Editar plano → elegí el dispositivo → Entidad del dispositivo.', { entities: entities.join(', ') }))}</p>`
      : '';
  }

  private remote(): RfRemote | undefined {
    return this.remotes.find(item => item.id === this.selected);
  }

  private renderRemote(status: string): string {
    const remote = this.remote()!;
    const rows = remote.buttons
      .map(
        button =>
          `<div class="button-row" data-button="${e(button.id)}"><input name="name" maxlength="80" value="${e(button.name)}" aria-label="${e(t('Nombre del botón'))}"><select name="function" aria-label="${e(t('Qué hace'))}"><option value="">${e(t('Sin función'))}</option>${ALL_FUNCTIONS.map(value => `<option value="${value}"${value === button.function ? ' selected' : ''}>${e(functionLabel(value))}</option>`).join('')}</select><button type="button" data-press="${e(button.id)}">${e(t('Probar'))}</button><button type="button" class="danger" data-delete-button="${e(button.id)}" aria-label="${e(t('Eliminar {name}', { name: button.name }))}">✕</button></div>`,
      )
      .join('');
    const transmitters = this.transmitters
      .map(
        item =>
          `<option value="${e(item.id)}"${item.id === remote.transmitter ? ' selected' : ''}>${e(item.name)}</option>`,
      )
      .join('');
    const advanced = `<details><summary>${e(t('Ajustes avanzados'))}</summary><p class="muted">${e(t('Protocolo {protocol} · {bits} bits · {pulse} µs · {repeats} repeticiones · espera {wait} µs', { protocol: remote.protocol, bits: remote.nbits, pulse: remote.pulse_us, repeats: remote.repeats, wait: remote.wait_us }))}</p><form class="settings"><div class="row"><label>${e(t('Transmisor'))}<select name="transmitter">${transmitters}</select></label><label>${e(t('Pulso (µs)'))}<input name="pulse_us" type="number" min="50" max="2000" value="${remote.pulse_us}"></label><label>${e(t('Repeticiones'))}<input name="repeats" type="number" min="1" max="20" value="${remote.repeats}"></label><label>${e(t('Espera entre tramas (µs)'))}<input name="wait_us" type="number" min="0" max="100000" value="${remote.wait_us}"></label></div><p class="muted">${e(t('Guardá y usá Probar en cualquier botón. La espera suele ser 0: la pausa de sincronización ya va en cada trama.'))}</p><button type="submit">${e(t('Guardar ajustes'))}</button></form></details>`;
    return `<div class="panel"><div class="row"><h2>${e(remote.name)}</h2><button type="button" data-command="list">${e(t('Volver'))}</button></div><p class="muted">${e(t('Envía por {transmitter}', { transmitter: this.transmitterName(remote.transmitter) }))}</p>${this.entitiesNote(remote.id)}<h3>${e(t('Botones'))}</h3><div class="buttons">${rows}</div><div class="row"><button type="button" data-command="more">${e(t('Agregar botones'))}</button><button type="button" data-command="save-buttons">${e(t('Guardar nombres y funciones'))}</button></div>${advanced}<details><summary class="danger">${e(t('Eliminar control'))}</summary><p class="muted">${e(t('Se borran sus botones y sus entidades de Home Assistant. El equipo físico no cambia.'))}</p><button type="button" class="danger" data-command="delete-remote">${e(t('Eliminar {name}', { name: remote.name }))}</button></details>${status}</div>`;
  }

  // Events --------------------------------------------------------------

  private bind(): void {
    const root = this.root;
    root
      .querySelectorAll<HTMLButtonElement>('[data-command]')
      .forEach(button => button.addEventListener('click', () => void this.command(button.dataset.command!)));
    root.querySelectorAll<HTMLButtonElement>('[data-open]').forEach(button =>
      button.addEventListener('click', () => {
        this.endCapture();
        this.selected = button.dataset.open!;
        this.view = 'remote';
        this.wizard = null;
        this.say('');
        this.render();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button =>
      button.addEventListener('click', () => {
        this.wizard!.kind = button.dataset.kind as Kind;
        this.render();
      }),
    );
    root
      .querySelectorAll<HTMLButtonElement>('[data-press]')
      .forEach(button => button.addEventListener('click', () => void this.press(button.dataset.press!)));
    root
      .querySelectorAll<HTMLButtonElement>('[data-delete-button]')
      .forEach(button => button.addEventListener('click', () => void this.deleteButton(button.dataset.deleteButton!)));
    const w = this.wizard;
    if (w) {
      root.querySelector<HTMLInputElement>('input[name=name]')?.addEventListener('input', event => {
        w.name = (event.target as HTMLInputElement).value;
        const start = root.querySelector<HTMLButtonElement>('[data-command=start]');
        if (start) start.disabled = !w.name.trim();
      });
      root.querySelectorAll<HTMLButtonElement>('[data-speeds]').forEach(button =>
        button.addEventListener('click', () => {
          w.speeds = Number(button.dataset.speeds);
          this.render();
        }),
      );
      root
        .querySelector<HTMLSelectElement>('select[name=listen]')
        ?.addEventListener('change', event => (w.listen = (event.target as HTMLSelectElement).value));
      root
        .querySelector<HTMLInputElement>('input[name=buttonName]')
        ?.addEventListener('input', event => (w.buttonName = (event.target as HTMLInputElement).value));
      root.querySelector<HTMLSelectElement>('select[name=buttonFunction]')?.addEventListener('change', event => {
        w.buttonFunction = (event.target as HTMLSelectElement).value as RfFunction | '';
      });
    }
    root.querySelector<HTMLFormElement>('form.settings')?.addEventListener('submit', event => {
      event.preventDefault();
      void this.saveSettings(new FormData(event.target as HTMLFormElement));
    });
  }

  private async command(name: string): Promise<void> {
    const hass = this._hass;
    if (!hass) return;
    try {
      switch (name) {
        case 'new': {
          const listen = this.transmitters.find(item => item.can_capture)?.id ?? '';
          this.wizard = {
            step: 'setup',
            name: '',
            kind: 'fan',
            speeds: 6,
            listen,
            remoteId: null,
            queue: [],
            candidate: null,
            buttonName: '',
            buttonFunction: '',
            attempts: [],
            trial: null,
            listening: false,
          };
          this.view = 'wizard';
          this.say('');
          break;
        }
        case 'cancel':
        case 'list':
          this.endCapture();
          this.wizard = null;
          this.view = 'list';
          this.say('');
          await this.reload();
          break;
        case 'start': {
          const w = this.wizard!;
          w.queue = suggestedFunctions(w.kind, w.speeds);
          w.step = 'capture';
          this.prepareNext();
          await this.listen();
          break;
        }
        case 'listen':
          await this.listen();
          break;
        case 'skip':
          this.wizard!.queue.shift();
          this.prepareNext();
          break;
        case 'try':
          await this.tryCandidate(this.firstTrial());
          break;
        case 'worked':
          await this.confirmWorked();
          break;
        case 'failed':
          await this.tryNextVariant();
          break;
        case 'save':
          await this.saveCandidate();
          break;
        case 'finish':
          this.endCapture();
          this.wizard!.step = 'done';
          await this.reload();
          break;
        case 'more': {
          const remote = this.remote()!;
          this.wizard = {
            step: 'capture',
            name: remote.name,
            kind: 'other',
            speeds: remote.speeds ?? 6,
            listen: this.transmitters.find(item => item.can_capture)?.id ?? remote.transmitter,
            remoteId: remote.id,
            queue: [],
            candidate: null,
            buttonName: '',
            buttonFunction: '',
            attempts: [],
            trial: null,
            listening: false,
          };
          this.view = 'wizard';
          this.prepareNext();
          await this.listen();
          break;
        }
        case 'save-buttons':
          await this.saveButtons();
          break;
        case 'delete-remote':
          await rf.deleteRemote(hass, this.selected!);
          this.view = 'list';
          this.say(t('Control eliminado.'));
          await this.reload();
          break;
      }
    } catch (error) {
      this.report(error);
    }
    this.render();
  }

  private async reload(): Promise<void> {
    if (!this._hass) return;
    this.remotes = (await rf.library(this._hass)).remotes;
  }

  /** Prefills the name and function of the next expected button. */
  private prepareNext(): void {
    const w = this.wizard!;
    w.candidate = null;
    w.trial = null;
    w.attempts = [];
    w.buttonFunction = w.queue[0] ?? '';
    w.buttonName = w.queue[0] ? functionLabel(w.queue[0]) : '';
  }

  private async listen(): Promise<void> {
    const w = this.wizard;
    if (!w || !this._hass || !w.listen) return;
    this.endCapture();
    w.listening = true;
    this.stopCapture = await rf.capture(this._hass, w.listen, 60, event => {
      if (!this.wizard) return;
      if (event.done) {
        this.wizard.listening = false;
        this.stopCapture = null;
      } else if (event.candidate) {
        // Keep the current candidate while it is being tested.
        if (this.wizard.trial && this.wizard.candidate?.candidate_id !== event.candidate.candidate_id) return;
        this.wizard.candidate = event.candidate;
      }
      this.render();
    });
  }
  private endCapture(): void {
    const stop = this.stopCapture;
    this.stopCapture = null;
    if (this.wizard) this.wizard.listening = false;
    try {
      stop?.();
    } catch {
      /* the window may already be closed */
    }
  }

  /** The first trial uses what was measured; later buttons use the remote's settings. */
  private firstTrial(): Attempt {
    const w = this.wizard!,
      c = w.candidate!;
    const remote = this.remotes.find(item => item.id === w.remoteId);
    return remote
      ? { transmitter: remote.transmitter, pulse_us: remote.pulse_us, repeats: remote.repeats, worked: null }
      : { transmitter: w.listen, pulse_us: c.pulse_us, repeats: 5, worked: null };
  }

  private async tryCandidate(trial: Attempt): Promise<void> {
    const w = this.wizard!;
    const remote = this.remotes.find(item => item.id === w.remoteId);
    await rf.test(this._hass!, w.candidate!.candidate_id, {
      transmitter: trial.transmitter,
      pulse_us: trial.pulse_us,
      repeats: trial.repeats,
      wait_us: remote?.wait_us ?? 0,
    });
    w.trial = trial;
    this.say(t('Señal enviada. Mirá el equipo.'));
  }

  /** One change at a time: other transmitters, then the neighbouring pulse
   * lengths, then more repeats. Combinations already tried are skipped. */
  private async tryNextVariant(): Promise<void> {
    const w = this.wizard!;
    if (w.trial) w.attempts.push({ ...w.trial, worked: false });
    const base = this.firstTrial();
    const tried = (item: Attempt) =>
      w.attempts.some(
        done =>
          done.transmitter === item.transmitter && done.pulse_us === item.pulse_us && done.repeats === item.repeats,
      );
    const candidates: Attempt[] = [
      ...this.transmitters.map(item => ({ ...base, transmitter: item.id })),
      { ...base, pulse_us: base.pulse_us + 50 },
      { ...base, pulse_us: Math.max(50, base.pulse_us - 50) },
      { ...base, repeats: 10 },
      ...this.transmitters.map(item => ({ ...base, transmitter: item.id, repeats: 10 })),
    ];
    const next = candidates.find(item => !tried(item));
    w.trial = null;
    if (!next) {
      this.failed = true;
      this.message = t(
        'Ninguna combinación funcionó. Acercá el transmisor al equipo o capturá el botón de nuevo con el control cerca del receptor.',
      );
      return;
    }
    await this.tryCandidate(next);
  }

  private async confirmWorked(): Promise<void> {
    const w = this.wizard!;
    const hass = this._hass!;
    if (!w.remoteId) {
      // The first button that works fixes the settings of the whole remote.
      const trial = w.trial!;
      const settings: Partial<RfSettings> & { name: string } = {
        name: w.name.trim(),
        transmitter: trial.transmitter,
        protocol: w.candidate!.protocol,
        nbits: w.candidate!.nbits,
        pulse_us: trial.pulse_us,
        repeats: trial.repeats,
        wait_us: 0,
      };
      if (w.kind === 'fan') settings.speeds = w.speeds;
      w.remoteId = (await rf.saveRemote(hass, settings)).id;
    }
    await this.saveCandidate();
  }

  private async saveCandidate(): Promise<void> {
    const w = this.wizard!;
    const name = w.buttonName.trim() || functionLabel(w.buttonFunction);
    await rf.saveButton(
      this._hass!,
      w.remoteId!,
      { name, function: w.buttonFunction || null },
      { candidateId: w.candidate!.candidate_id },
    );
    if (w.queue[0] && w.queue[0] === w.buttonFunction) w.queue.shift();
    else w.queue = w.queue.filter(item => item !== w.buttonFunction);
    await this.reload();
    this.say(t('Botón «{name}» guardado.', { name }));
    this.prepareNext();
  }

  private async press(buttonId: string): Promise<void> {
    try {
      await rf.press(this._hass!, this.selected!, buttonId);
      this.say(t('Señal enviada. Mirá el equipo.'));
    } catch (error) {
      this.report(error);
    }
    this.render();
  }

  private async deleteButton(buttonId: string): Promise<void> {
    try {
      await rf.deleteButton(this._hass!, this.selected!, buttonId);
      await this.reload();
      this.say(t('Botón eliminado.'));
    } catch (error) {
      this.report(error);
    }
    this.render();
  }

  private async saveButtons(): Promise<void> {
    const remote = this.remote()!;
    for (const row of this.root.querySelectorAll<HTMLElement>('.button-row')) {
      const id = row.dataset.button!;
      const name = row.querySelector<HTMLInputElement>('input[name=name]')!.value.trim();
      const value = row.querySelector<HTMLSelectElement>('select[name=function]')!.value as RfFunction | '';
      const current = remote.buttons.find(button => button.id === id);
      if (!current || !name || (current.name === name && (current.function ?? '') === value)) continue;
      await rf.saveButton(this._hass!, remote.id, { name, function: value || null }, { buttonId: id });
    }
    await this.reload();
    this.say(t('Cambios guardados.'));
  }

  private async saveSettings(data: FormData): Promise<void> {
    const remote = this.remote()!;
    try {
      await rf.saveRemote(
        this._hass!,
        {
          name: remote.name,
          transmitter: String(data.get('transmitter')),
          pulse_us: Number(data.get('pulse_us')),
          repeats: Number(data.get('repeats')),
          wait_us: Number(data.get('wait_us')),
        },
        remote.id,
      );
      await this.reload();
      this.say(t('Ajustes guardados. Probá un botón.'));
    } catch (error) {
      this.report(error);
    }
    this.render();
  }
}

if (!customElements.get('homemanager-rf')) customElements.define('homemanager-rf', HomeManagerRf);
