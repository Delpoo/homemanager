import {
  escapeHTML,
  type Configuration,
  type Device,
  type NativePanel,
  type RuntimeDeviceState,
} from '../card/types.js';

export interface PanelAvailability {
  available: boolean;
  reason?: string;
}
export interface PanelOptions {
  panel: NativePanel;
  device: Device;
  state: RuntimeDeviceState;
  configuration: Configuration;
  availability: (actionId: string) => PanelAvailability;
  onAction: (actionId: string) => Promise<unknown>;
  returnFocus?: HTMLElement | null;
}
export interface PanelHandle {
  element: HomeManagerPanel;
  dialog: HTMLDialogElement;
  close(): void;
  update(state: RuntimeDeviceState): void;
}
const CONFIDENCE = {
  confirmed: 'Confirmado',
  estimated: 'Estimado',
  sent: 'Comando enviado',
  unknown: 'Desconocido',
  error: 'Error',
} as const;
const COLOR = {
  confirmed: '#397551',
  estimated: '#a27832',
  sent: '#477eac',
  unknown: '#839087',
  error: '#a9453c',
} as const;
const css = `:host{font:14px system-ui,sans-serif;color:#213d32}*{box-sizing:border-box}dialog{color:inherit;background:#fffefa;border:1px solid #d9e2d7;border-radius:18px;padding:20px;width:min(450px,calc(100vw - 24px));max-height:82dvh;overflow:auto;box-shadow:0 22px 100px #142c2544}dialog::backdrop{background:#17312678;backdrop-filter:blur(4px)}header{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{font:650 19px/1.35 system-ui;margin:0;overflow-wrap:anywhere}button{font:inherit;color:inherit;border:1px solid #cfdbcc;background:#f9fbf5;border-radius:10px;padding:11px 14px;min-height:44px;cursor:pointer}button:hover{background:#e4eedf}button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:3px solid #3a7fb1;outline-offset:3px}.close{font-size:23px;line-height:1;padding:8px;min-width:44px;border-color:transparent;background:none}.device{font-size:12px;color:#6b7d6d;margin:8px 0 18px;overflow-wrap:anywhere}.state{padding:14px;background:#eff4e9;border-radius:12px;margin:16px 0}.value{font-size:23px;line-height:1.4;font-weight:550;overflow-wrap:anywhere}.confidence{font-size:12px;display:flex;align-items:center;gap:7px;margin-top:7px}.confidence:before{content:'';width:7px;height:7px;border-radius:50%;background:var(--state)}.controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:9px}.control{display:flex;align-items:center;justify-content:center;text-align:center;overflow-wrap:anywhere}.status{font-size:12px;color:#9b4135;line-height:1.6;margin:12px 0 0}.status:empty{display:none}.rf-label{font-size:10px;letter-spacing:1px;color:#667b6a;margin:0 0 10px}.empty{font-size:12px;color:#6b7d6d}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:380px){dialog{padding:16px}.controls{grid-template-columns:1fr 1fr}h2{font-size:17px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;
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
export class HomeManagerPanel extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  panel?: NativePanel;
  device?: Device;
  configuration?: Configuration;
  availability: (actionId: string) => PanelAvailability = () => ({ available: false, reason: 'Acción no disponible.' });
  execute: (actionId: string) => Promise<unknown> = async () => {
    throw new Error('Acción no configurada.');
  };
  private state?: RuntimeDeviceState;
  private returnFocus?: HTMLElement | null;
  private pending = false;
  private closed = false;
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
    this.panel = structuredClone(options.panel);
    this.device = structuredClone(options.device);
    this.configuration = structuredClone(options.configuration);
    this.availability = options.availability;
    this.execute = options.onAction;
    this.runtime = options.state;
    this.returnFocus = options.returnFocus ?? activeElement();
  }
  open(): void {
    if (!this.panel || !this.device || !this.configuration || !this.state)
      throw new Error('El panel requiere dispositivo, configuración y estado de sesión.');
    this.closed = false;
    this.pending = false;
    this.root.innerHTML = `<style>${css}</style><dialog aria-labelledby="panel-title" aria-describedby="panel-device"><header><h2 id="panel-title">${escapeHTML(this.panel.title)}</h2><button type="button" class="close" aria-label="Cerrar panel">×</button></header><p class="device" id="panel-device">${escapeHTML(this.device.display.label)}</p>${this.panel.kind === 'rf-fan' ? '<p class="rf-label">CONTROLES RF · SCRIPTS DE HOME ASSISTANT</p>' : ''}<div class="state"><div class="value"></div><div class="confidence"></div></div><div class="controls"></div><p class="status" role="status" aria-live="polite"></p></dialog>`;
    const ids = new Set<string>();
    for (const control of this.panel.controls) {
      if (ids.has(control.id)) throw new Error('Los controles del panel requieren IDs únicos.');
      ids.add(control.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'control';
      button.dataset.actionId = control.actionId;
      button.textContent = control.label;
      button.setAttribute('aria-label', control.label);
      button.addEventListener('click', () => void this.activate(control.actionId));
      this.root.querySelector('.controls')!.append(button);
    }
    if (!this.panel.controls.length) {
      const message = document.createElement('p');
      message.className = 'empty';
      message.textContent = 'Este panel todavía no tiene controles.';
      this.root.querySelector('.controls')!.append(message);
    }
    this.root.querySelector('.close')!.addEventListener('click', () => this.close());
    this.dialog.addEventListener('keydown', event => this.trapFocus(event));
    this.dialog.addEventListener('close', () => this.finish(), { once: true });
    this.renderState();
    this.refresh();
    this.dialog.showModal();
    this.root.querySelector<HTMLButtonElement>('.close')!.focus();
  }
  private trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    const buttons = [...this.dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(
      button => button.getClientRects().length > 0,
    );
    const first = buttons[0],
      last = buttons.at(-1),
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
      return { available: false, reason: 'La acción referenciada no existe.' };
    if (this.panel?.kind === 'rf-fan' && !rfAllowed(this.configuration, actionId))
      return { available: false, reason: 'Un panel RF solo puede ejecutar scripts explícitos de Home Assistant.' };
    try {
      return this.availability(actionId);
    } catch {
      return { available: false, reason: 'No se pudo verificar esta acción.' };
    }
  }
  refresh(): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-action-id]')) {
      const actionId = button.dataset.actionId!,
        availability = this.allowed(actionId);
      button.disabled = this.pending || !availability.available;
      button.title =
        availability.reason ?? (this.panel?.kind === 'rf-fan' ? this.targets(actionId) : 'Ejecutar acción');
    }
  }
  private targets(actionId: string): string {
    const ids = this.configuration?.actions[actionId]?.target.entity_id;
    return Array.isArray(ids) ? ids.join(', ') : (ids ?? '');
  }
  private renderState(): void {
    const value = this.root.querySelector<HTMLElement>('.value'),
      confidence = this.root.querySelector<HTMLElement>('.confidence');
    if (!value || !confidence || !this.state) return;
    const valid = Object.hasOwn(CONFIDENCE, this.state.confidence) ? this.state.confidence : 'unknown';
    value.textContent = this.state.value;
    confidence.textContent = CONFIDENCE[valid];
    confidence.style.setProperty('--state', COLOR[valid]);
  }
  update(state: RuntimeDeviceState): void {
    this.runtime = state;
    this.refresh();
  }
  private async activate(actionId: string): Promise<void> {
    if (this.pending || this.closed) return;
    const availability = this.allowed(actionId);
    if (!availability.available) {
      this.root.querySelector('.status')!.textContent = availability.reason ?? 'Acción no disponible.';
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
