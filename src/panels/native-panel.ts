import { t } from '../i18n/index.js';
import {
  escapeHTML,
  type Configuration,
  type Device,
  type HassEntity,
  type NativePanel,
  type RuntimeDeviceState,
} from '../card/types.js';
import { tokens } from '../ui/theme.js';
import { commandFor, entityControls, humanize, type Command, type Control } from './controls.js';

export interface PanelAvailability {
  available: boolean;
  reason?: string;
}
export interface PanelOptions {
  /** Configured native panel; null shows only the controls derived from the entity. */
  panel: NativePanel | null;
  device: Device;
  state: RuntimeDeviceState;
  configuration: Configuration;
  availability: (actionId: string) => PanelAvailability;
  onAction: (actionId: string) => Promise<unknown>;
  returnFocus?: HTMLElement | null;
  roomLabel?: string | null;
  /** Live entity of the device binding (re-read on every update). */
  getEntity?: () => HassEntity | undefined;
  /** Live per-script field declarations (hass.services.script[name].fields). */
  getScriptFields?: () => unknown;
  entityAvailability?: (command: Command) => PanelAvailability;
  onEntityCommand?: (command: Command) => Promise<unknown>;
}
export interface PanelHandle {
  element: HomeManagerPanel;
  dialog: HTMLDialogElement;
  close(): void;
  update(state: RuntimeDeviceState): void;
}

const CONFIDENCE = (): Record<string, string> => ({
  confirmed: t('Confirmado'),
  estimated: t('Estimado'),
  sent: t('Comando enviado'),
  unknown: t('Desconocido'),
  error: t('Error'),
});
const HINT = (): Record<string, string> => ({
  confirmed: t('Lectura medida y verificada después del último comando.'),
  estimated: t('Lectura informada por Home Assistant, sin confirmación independiente.'),
  sent: t('Home Assistant aceptó el comando. El efecto físico no está confirmado.'),
  unknown: t('Sin una lectura válida.'),
  error: t('El último comando falló. Esto no describe el estado del equipo.'),
});
/** Adapter reason codes -> user language. Unknown codes stay generic. */
export function reasonText(reason?: string): string {
  const reasons: Record<string, string> = {
    'ha-unavailable': t('Home Assistant no está conectado.'),
    'action-in-flight': t('Esperando la respuesta del comando anterior.'),
    'device-busy': t('Esperando la respuesta del comando anterior.'),
    'unbound-action': t('Acción pendiente de configurar.'),
    'unbound-entity': t('Vinculá una entidad para usar estos controles.'),
    entity_missing: t('La entidad no existe en Home Assistant.'),
    entity_unavailable: t('La entidad no está disponible.'),
    service_missing: t('Home Assistant no ofrece este servicio.'),
    capability_missing: t('El dispositivo no admite esta función.'),
    unsupported_value: t('Valor no admitido por el dispositivo.'),
    unsupported_data: t('Valor no admitido por el dispositivo.'),
    script_signature_unverified: t('Script aún no verificado.'),
    script_signature_stale: t('El script cambió; recargá la página.'),
    script_data_invalid: t('Completá los campos del script.'),
    ha_service_error: t('Home Assistant rechazó el comando.'),
  };
  return (reason && reasons[reason]) ?? reason ?? t('Acción no disponible.');
}
const STATE_WORDS = (): Record<string, string> => ({
  on: t('Encendido'),
  off: t('Apagado'),
  open: t('Abierto'),
  closed: t('Cerrado'),
  opening: t('Abriendo'),
  closing: t('Cerrando'),
  unknown: t('Desconocido'),
  unavailable: t('No disponible'),
  heat: t('Calor'),
  cool: t('Frío'),
  auto: t('Automático'),
  dry: t('Deshumidificar'),
  fan_only: t('Ventilación'),
  heat_cool: t('Calor/frío'),
});
export function stateText(value: string): string {
  return STATE_WORDS()[value] ?? value;
}

const css = `${tokens}
dialog{color:var(--hm-text);background:var(--hm-bg);border:1px solid var(--hm-line);border-radius:22px;padding:0;width:min(460px,calc(100vw - 24px));max-height:86dvh;overflow:auto;box-shadow:0 24px 80px rgba(0,0,0,.28)}
dialog::backdrop{background:rgba(10,20,15,.42);backdrop-filter:blur(3px)}
.head{display:flex;align-items:center;gap:12px;padding:18px 18px 6px}
.glyph{width:44px;height:44px;flex:0 0 44px;border-radius:14px;display:grid;place-items:center;background:var(--hm-surface);color:var(--hm-accent);font-size:22px}
.glyph ha-icon{--mdc-icon-size:24px}
.titles{flex:1;min-width:0}
h2{font-size:18px;line-height:1.3;font-weight:600;margin:0;overflow-wrap:anywhere}
.device{font-size:13px;color:var(--hm-muted);margin:2px 0 0;overflow-wrap:anywhere}
.close{border:0;background:none;font-size:24px;line-height:1;min-width:var(--hm-touch);padding:0}
.body{padding:8px 18px 18px;display:grid;gap:14px}
.state{padding:14px 16px;background:var(--hm-surface);border-radius:16px}
.value{font-size:26px;line-height:1.25;font-weight:600;overflow-wrap:anywhere}
.confidence{font-size:13px;display:flex;align-items:center;gap:8px;margin-top:6px;font-weight:600}
.confidence:before{content:'';width:9px;height:9px;border-radius:50%;background:var(--state,var(--hm-unknown))}
.hint{font-size:12px;color:var(--hm-muted);margin:4px 0 0;line-height:1.45}
.group{display:grid;gap:10px}
.group-title,.rf-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--hm-muted);margin:0;font-weight:600}
.control{display:grid;gap:8px;padding:12px 14px;border:1px solid var(--hm-line);border-radius:14px}
.control-head{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:14px;font-weight:500}
.control-head output{color:var(--hm-muted);font-variant-numeric:tabular-nums}
.switch{min-width:64px;height:36px;min-height:36px;border-radius:18px;padding:0;position:relative;background:var(--hm-surface);border-color:var(--hm-line)}
.switch:after{content:'';position:absolute;top:3px;left:3px;width:28px;height:28px;border-radius:50%;background:var(--hm-bg);box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s}
.switch[aria-checked=true]{background:var(--hm-accent);border-color:var(--hm-accent)}
.switch[aria-checked=true]:after{left:31px}
.segmented{display:flex;flex-wrap:wrap;gap:6px}
.segmented button{flex:1 1 auto;min-width:64px}
.segmented button[aria-pressed=true]{background:var(--hm-accent);border-color:var(--hm-accent);color:var(--hm-on-accent)}
.stepper{display:flex;align-items:center;justify-content:space-between;gap:10px}
.stepper output{font-size:24px;font-weight:600;font-variant-numeric:tabular-nums}
.stepper button{min-width:56px;font-size:22px}
.fields{display:grid;gap:8px}
.fields label{display:grid;gap:4px;font-size:13px;color:var(--hm-muted)}
.controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:9px}
.controls .control-button{display:flex;align-items:center;justify-content:center;text-align:center;overflow-wrap:anywhere}
.reading{font-size:20px;font-weight:600}
.status{font-size:13px;color:var(--hm-error);line-height:1.5;margin:0}
.status:empty{display:none}
.empty{font-size:13px;color:var(--hm-muted);margin:0}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
@media (max-width:600px){
  dialog{width:100vw;max-width:100vw;margin:auto 0 0;border-radius:22px 22px 0 0;max-height:88dvh;border-bottom:0}
  .head:before{content:'';position:absolute;top:8px;left:50%;width:40px;height:4px;margin-left:-20px;border-radius:2px;background:var(--hm-line)}
  .head{position:relative;padding-top:22px}
}
@media (prefers-reduced-motion:no-preference){dialog[open]{animation:rise .2s ease-out}@keyframes rise{from{transform:translateY(16px);opacity:.4}to{transform:none;opacity:1}}}
`;
function activeElement(): HTMLElement | null {
  let element: Element | null = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element instanceof HTMLElement ? element : null;
}
function rfAllowed(configuration: Configuration, actionId: string): boolean {
  const action = configuration.actions[actionId];
  if (!action || action.domain !== 'script' || action.service !== 'turn_on') return false;
  const ids = typeof action.target?.entity_id === 'string' ? [action.target.entity_id] : action.target?.entity_id;
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= 20 &&
    ids.every(id => typeof id === 'string' && /^script\.[a-z0-9_]+$/.test(id) && id !== 'script.all')
  );
}
const fmt = (value: number | null, unit: string) =>
  value === null
    ? '—'
    : `${Number.isInteger(value) ? value : value.toFixed(1)}${unit === '%' ? ' %' : unit ? ` ${unit}` : ''}`;

export class HomeManagerPanel extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  panel?: NativePanel | null;
  device?: Device;
  configuration?: Configuration;
  availability: (actionId: string) => PanelAvailability = () => ({
    available: false,
    reason: t('Acción no disponible.'),
  });
  execute: (actionId: string) => Promise<unknown> = async () => {
    throw new Error(t('Acción no configurada.'));
  };
  private options?: PanelOptions;
  private state?: RuntimeDeviceState;
  private returnFocus?: HTMLElement | null;
  private pending = false;
  private closed = false;
  private controls: Control[] = [];
  private scriptValues: Record<string, unknown> = {};
  get dialog(): HTMLDialogElement {
    return this.root.querySelector('dialog')!;
  }
  get runtime(): RuntimeDeviceState | undefined {
    return this.state;
  }
  set runtime(value: RuntimeDeviceState | undefined) {
    this.state = value ? structuredClone(value) : undefined;
    this.renderState();
  }
  configure(options: PanelOptions): void {
    this.options = options;
    this.panel = options.panel ? structuredClone(options.panel) : null;
    this.device = structuredClone(options.device);
    this.configuration = structuredClone(options.configuration);
    this.availability = options.availability;
    this.execute = options.onAction;
    this.runtime = options.state;
    this.returnFocus = options.returnFocus ?? activeElement();
  }
  open(): void {
    if (!this.device || !this.configuration || !this.state)
      throw new Error(t('El panel requiere dispositivo, configuración y estado de sesión.'));
    this.closed = false;
    this.pending = false;
    const title = this.panel?.title ?? this.device.display.label;
    const subtitle = [this.panel ? this.device.display.label : null, this.options?.roomLabel]
      .filter(Boolean)
      .join(' · ');
    const glyph = customElements.get('ha-icon')
      ? `<ha-icon icon="${escapeHTML(this.device.display.icon)}"></ha-icon>`
      : '◉';
    this.root.innerHTML = `<style>${css}</style><dialog aria-labelledby="panel-title" aria-describedby="panel-device"><div class="head"><span class="glyph" aria-hidden="true">${glyph}</span><div class="titles"><h2 id="panel-title">${escapeHTML(title)}</h2><p class="device" id="panel-device">${escapeHTML(subtitle || this.device.display.label)}</p></div><button type="button" class="close" aria-label="${escapeHTML(t('Cerrar panel'))}">×</button></div><div class="body"><div class="state"><div class="value"></div><div class="confidence"></div><p class="hint"></p></div><div class="auto group" hidden></div><div class="custom group" hidden></div><p class="status" role="status" aria-live="polite"></p></div></dialog>`;
    this.renderCustom();
    this.renderAuto(true);
    this.root.querySelector('.close')!.addEventListener('click', () => this.close());
    this.dialog.addEventListener('click', event => {
      // A tap on the backdrop (outside the sheet) closes it, like native sheets.
      if (event.target === this.dialog) {
        const r = this.dialog.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
          this.close();
      }
    });
    this.dialog.addEventListener('keydown', event => this.trapFocus(event));
    this.dialog.addEventListener('close', () => this.finish(), { once: true });
    this.renderState();
    this.refresh();
    this.dialog.showModal();
    this.root.querySelector<HTMLButtonElement>('.close')!.focus();
  }
  private renderCustom(): void {
    const host = this.root.querySelector<HTMLElement>('.custom')!;
    if (!this.panel) return;
    host.hidden = false;
    host.innerHTML = `${this.panel.kind === 'rf-fan' ? `<p class="rf-label">${escapeHTML(t('CONTROLES RF · SCRIPTS DE HOME ASSISTANT'))}</p>` : `<p class="group-title">${escapeHTML(t('Acciones'))}</p>`}<div class="controls"></div>`;
    const list = host.querySelector('.controls')!;
    const ids = new Set<string>();
    for (const control of this.panel.controls) {
      if (ids.has(control.id)) throw new Error(t('Los controles del panel requieren IDs únicos.'));
      ids.add(control.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'control-button';
      button.dataset.actionId = control.actionId;
      button.textContent = control.label;
      button.setAttribute('aria-label', control.label);
      button.addEventListener('click', () => void this.activate(control.actionId));
      list.append(button);
    }
    if (!this.panel.controls.length) {
      const message = document.createElement('p');
      message.className = 'empty';
      message.textContent = t('Este panel todavía no tiene controles.');
      list.append(message);
    }
  }
  /** Controls derived from the live entity. Rebuilt only when their shape changes,
   * otherwise values update in place so focus and an ongoing drag survive. */
  private renderAuto(force = false): void {
    const host = this.root.querySelector<HTMLElement>('.auto');
    const entityId = this.device?.bindings.entityId;
    if (!host || !entityId || !this.options?.getEntity) return;
    const next = entityControls(entityId, this.options.getEntity(), this.options.getScriptFields?.());
    const shape = (list: Control[]) =>
      list
        .map(
          control =>
            `${control.kind}:${control.id}:${'options' in control ? control.options.length : ''}:${'fields' in control ? control.fields.length : ''}`,
        )
        .join('|');
    const same = !force && shape(next) === shape(this.controls);
    this.controls = next;
    host.hidden = !next.length;
    if (same) return this.updateAutoValues();
    host.innerHTML = next.length ? `<p class="group-title">${escapeHTML(t('Controles'))}</p>` : '';
    for (const control of next) host.append(this.renderControl(control));
    this.updateAutoValues();
  }
  private renderControl(control: Control): HTMLElement {
    const box = document.createElement('div');
    box.className = 'control';
    box.dataset.controlId = control.id;
    const head = `<div class="control-head"><span id="label-${escapeHTML(control.id)}">${escapeHTML(control.label)}</span>`;
    if (control.kind === 'toggle') {
      box.innerHTML = `${head}<button type="button" class="switch" role="switch" aria-labelledby="label-${escapeHTML(control.id)}"></button></div>`;
      box.querySelector('button')!.addEventListener('click', () => {
        const current = this.controls.find(item => item.id === control.id);
        if (current?.kind === 'toggle') void this.send(commandFor(current, !current.value));
      });
    } else if (control.kind === 'range') {
      box.innerHTML = `${head}<output></output></div><input type="range" min="${control.min}" max="${control.max}" step="${control.step}" aria-labelledby="label-${escapeHTML(control.id)}">`;
      const input = box.querySelector('input')!,
        output = box.querySelector('output')!;
      input.addEventListener('input', () => (output.textContent = fmt(Number(input.value), control.unit)));
      // Commit on release only: one service call per gesture, not per pixel.
      input.addEventListener('change', () => void this.send(commandFor(control, Number(input.value))));
    } else if (control.kind === 'stepper') {
      box.innerHTML = `${head}</div><div class="stepper"><button type="button" data-step="-1" aria-label="${escapeHTML(t('Bajar {label}', { label: control.label }))}">−</button><output aria-live="polite"></output><button type="button" data-step="1" aria-label="${escapeHTML(t('Subir {label}', { label: control.label }))}">+</button></div>`;
      for (const button of box.querySelectorAll<HTMLButtonElement>('[data-step]'))
        button.addEventListener('click', () => {
          const current = this.controls.find(item => item.id === control.id);
          if (current?.kind !== 'stepper') return;
          const base = current.value ?? (current.min + current.max) / 2;
          void this.send(commandFor(current, base + Number(button.dataset.step) * current.step));
        });
    } else if (control.kind === 'select') {
      box.innerHTML =
        control.options.length <= 5
          ? `${head}</div><div class="segmented" role="group" aria-labelledby="label-${escapeHTML(control.id)}">${control.options.map(option => `<button type="button" data-value="${escapeHTML(option.value)}">${escapeHTML(option.label)}</button>`).join('')}</div>`
          : `${head}</div><select aria-labelledby="label-${escapeHTML(control.id)}">${control.options.map(option => `<option value="${escapeHTML(option.value)}">${escapeHTML(option.label)}</option>`).join('')}</select>`;
      for (const button of box.querySelectorAll<HTMLButtonElement>('[data-value]'))
        button.addEventListener('click', () => void this.send(commandFor(control, button.dataset.value)));
      box
        .querySelector('select')
        ?.addEventListener(
          'change',
          event => void this.send(commandFor(control, (event.target as HTMLSelectElement).value)),
        );
    } else if (control.kind === 'buttons') {
      box.innerHTML = `${head}</div><div class="segmented">${control.buttons.map(button => `<button type="button" data-button="${escapeHTML(button.id)}"><span aria-hidden="true">${escapeHTML(button.icon)}</span> ${escapeHTML(button.label)}</button>`).join('')}</div>`;
      for (const element of box.querySelectorAll<HTMLButtonElement>('[data-button]')) {
        const button = control.buttons.find(item => item.id === element.dataset.button)!;
        element.addEventListener('click', () => void this.send(button.command));
      }
    } else if (control.kind === 'script') {
      this.scriptValues = Object.fromEntries(
        control.fields.filter(field => field.default !== undefined).map(field => [field.name, field.default]),
      );
      const inputs = control.fields
        .map(field => {
          const label = escapeHTML(field.label);
          if (field.type === 'select')
            return `<label>${label}<select data-field="${escapeHTML(field.name)}">${field.required ? '' : `<option value="">${escapeHTML(t('Sin valor'))}</option>`}${(field.options ?? []).map(option => `<option value="${escapeHTML(option)}"${this.scriptValues[field.name] === option ? ' selected' : ''}>${escapeHTML(humanize(option))}</option>`).join('')}</select></label>`;
          if (field.type === 'number')
            return `<label>${label}<input type="number" data-field="${escapeHTML(field.name)}"${field.min !== undefined ? ` min="${field.min}"` : ''}${field.max !== undefined ? ` max="${field.max}"` : ''} step="${field.step ?? 1}"></label>`;
          if (field.type === 'boolean')
            return `<label><span><input type="checkbox" data-field="${escapeHTML(field.name)}"> ${label}</span></label>`;
          return `<label>${label}<input type="text" maxlength="200" data-field="${escapeHTML(field.name)}"></label>`;
        })
        .join('');
      box.innerHTML = `${head}</div>${inputs ? `<div class="fields">${inputs}</div>` : ''}<button type="button" data-variant="primary" class="run">${escapeHTML(t('Ejecutar'))}</button>`;
      box.querySelector('.run')!.addEventListener('click', () => {
        const variables: Record<string, unknown> = {};
        for (const input of box.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]')) {
          const name = input.dataset.field!;
          if (input instanceof HTMLInputElement && input.type === 'checkbox') variables[name] = input.checked;
          else if (input instanceof HTMLInputElement && input.type === 'number') {
            if (input.value !== '') variables[name] = Number(input.value);
          } else if (input.value !== '') variables[name] = input.value;
        }
        void this.send(commandFor(control, variables));
      });
    } else {
      box.innerHTML = `${head}</div><div class="reading"></div>`;
    }
    return box;
  }
  private updateAutoValues(): void {
    for (const control of this.controls) {
      const box = this.root.querySelector<HTMLElement>(`.auto [data-control-id="${CSS.escape(control.id)}"]`);
      if (!box) continue;
      if (control.kind === 'toggle')
        box.querySelector('[role=switch]')!.setAttribute('aria-checked', String(control.value === true));
      else if (control.kind === 'range') {
        const input = box.querySelector('input')!;
        // Never move the thumb under the user's finger.
        if (this.root.activeElement !== input && control.value !== null) input.value = String(control.value);
        box.querySelector('output')!.textContent = fmt(control.value, control.unit);
      } else if (control.kind === 'stepper')
        box.querySelector('output')!.textContent = fmt(control.value, control.unit);
      else if (control.kind === 'select') {
        for (const button of box.querySelectorAll<HTMLButtonElement>('[data-value]'))
          button.setAttribute('aria-pressed', String(button.dataset.value === control.value));
        const select = box.querySelector('select');
        if (select && control.value !== null && this.root.activeElement !== select) select.value = control.value;
      } else if (control.kind === 'reading')
        box.querySelector('.reading')!.textContent =
          `${stateText(control.value)}${control.unit ? ` ${control.unit}` : ''}`;
    }
  }
  private trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    const focusable = [
      ...this.dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'),
    ].filter(element => element.getClientRects().length > 0);
    const first = focusable[0],
      last = focusable.at(-1),
      active = this.root.activeElement;
    if (!first || !last) return;
    // Native dialogs provide modal containment, but reverse tab traversal from
    // a shadow-root boundary can still reach the document in Chromium.
    if (event.shiftKey && (active === first || !active || !this.dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !active || !this.dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }
  private allowed(actionId: string): PanelAvailability {
    if (!this.configuration?.actions[actionId])
      return { available: false, reason: t('La acción referenciada no existe.') };
    if (this.panel?.kind === 'rf-fan' && !rfAllowed(this.configuration, actionId))
      return { available: false, reason: t('Un panel RF solo puede ejecutar scripts explícitos de Home Assistant.') };
    try {
      return this.availability(actionId);
    } catch {
      return { available: false, reason: t('No se pudo verificar esta acción.') };
    }
  }
  refresh(): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('.custom [data-action-id]')) {
      const actionId = button.dataset.actionId!,
        availability = this.allowed(actionId);
      button.disabled = this.pending || !availability.available;
      button.title = availability.reason
        ? reasonText(availability.reason)
        : this.panel?.kind === 'rf-fan'
          ? this.targets(actionId)
          : t('Ejecutar acción');
    }
    // Entity controls are enabled by the same live checks the adapter runs before calling HA.
    const check = this.options?.entityAvailability;
    for (const control of this.controls) {
      const box = this.root.querySelector<HTMLElement>(`.auto [data-control-id="${CSS.escape(control.id)}"]`);
      if (!box || control.kind === 'reading') continue;
      let availability: PanelAvailability = { available: !!check };
      if (check) {
        const probe = probeCommand(control);
        availability = probe ? check(probe) : { available: true };
      }
      for (const element of box.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
        'button,input,select',
      )) {
        element.disabled = this.pending || !availability.available;
        if (availability.reason) element.title = reasonText(availability.reason);
        else element.removeAttribute('title');
      }
    }
  }
  private targets(actionId: string): string {
    const ids = this.configuration?.actions[actionId]?.target.entity_id;
    return Array.isArray(ids) ? ids.join(', ') : (ids ?? '');
  }
  private renderState(): void {
    const value = this.root.querySelector<HTMLElement>('.value'),
      confidence = this.root.querySelector<HTMLElement>('.confidence'),
      hint = this.root.querySelector<HTMLElement>('.hint');
    if (!value || !confidence || !this.state) return;
    const labels = CONFIDENCE();
    const valid = Object.hasOwn(labels, this.state.confidence) ? this.state.confidence : 'unknown';
    value.textContent = stateText(this.state.value);
    confidence.textContent = labels[valid];
    confidence.style.setProperty('--state', `var(--hm-${valid})`);
    if (hint) hint.textContent = HINT()[valid];
  }
  update(state: RuntimeDeviceState): void {
    this.runtime = state;
    this.renderAuto();
    this.refresh();
  }
  private async send(command: Command): Promise<void> {
    if (this.pending || this.closed || !this.options?.onEntityCommand) return;
    const status = this.root.querySelector('.status')!;
    status.textContent = '';
    this.pending = true;
    this.refresh();
    try {
      const result = (await this.options.onEntityCommand(command)) as { ok?: boolean; reason?: string } | undefined;
      if (result && result.ok === false && !this.closed) status.textContent = reasonText(result.reason);
    } catch (error) {
      if (!this.closed) status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      this.pending = false;
      if (!this.closed) this.refresh();
    }
  }
  private async activate(actionId: string): Promise<void> {
    if (this.pending || this.closed) return;
    const availability = this.allowed(actionId);
    if (!availability.available) {
      this.root.querySelector('.status')!.textContent = reasonText(availability.reason);
      return;
    }
    this.pending = true;
    this.refresh();
    this.root.querySelector('.status')!.textContent = '';
    try {
      await this.execute(actionId);
    } catch (error) {
      if (!this.closed)
        this.root.querySelector('.status')!.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      this.pending = false;
      if (!this.closed) this.refresh();
    }
    // Runtime confidence is owned by the session state layer, never inferred
    // from a panel label, successful promise, RF button or presumed toggle.
  }
  close(): void {
    if (this.dialog?.open) this.dialog.close();
    else this.finish();
  }
  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.remove();
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
  }
  disconnectedCallback(): void {
    if (!this.closed) {
      this.closed = true;
      if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
    }
  }
}
/** A representative command used only to ask the adapter whether a control can work. */
function probeCommand(control: Control): Command | null {
  switch (control.kind) {
    case 'toggle':
      return control.on;
    case 'range':
    case 'stepper':
      return commandFor(control, control.value ?? control.min);
    case 'select':
      return control.options[0] ? commandFor(control, control.value ?? control.options[0].value) : null;
    case 'buttons':
      return control.buttons[0]?.command ?? null;
    case 'script':
      // Script fields are verified when the user runs it, with the chosen values.
      return null;
    default:
      return null;
  }
}
if (!customElements.get('homemanager-panel')) customElements.define('homemanager-panel', HomeManagerPanel);
export function openPanel(options: PanelOptions): PanelHandle {
  const element = document.createElement('homemanager-panel') as HomeManagerPanel;
  element.configure(options);
  document.body.append(element);
  try {
    element.open();
  } catch (error) {
    element.remove();
    throw error;
  }
  return { element, dialog: element.dialog, close: () => element.close(), update: state => element.update(state) };
}
