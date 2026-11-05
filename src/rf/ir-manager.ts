import { escapeHTML as e, type Hass } from '../card/types.js';
import { t } from '../i18n/index.js';
import { remotes, type IrCaptureEvent, type IrDevice, type IrRemote, type IrReplay } from '../integration/remotes.js';
import { installPanelComponents, keepPanelFocus } from '../ui/panel-components.js';

type Candidate = Extract<IrCaptureEvent, { candidate_id: string }>;
type Capture = { unsubscribe?: () => void; timeout?: ReturnType<typeof setTimeout> };
const SENT = 'Solicitud IR enviada. Confirmá la reacción en el equipo.';

/** Manual capture and replay. The browser only sees opaque candidate and button IDs. */
export class HomeManagerIr extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private _hass?: Hass;
  private offline = false;
  private requested = false;
  private receivers: IrDevice[] = [];
  private emitters: IrDevice[] = [];
  private saved: IrRemote[] = [];
  private receiver = '';
  private emitter = '';
  private remoteId = '';
  private remoteName = '';
  private buttonName = '';
  private carrierHz = '38000';
  private carrierSource: IrReplay['carrier_source'] = 'estimated';
  private capture?: Capture;
  private candidate?: Candidate;
  private busy = false;
  private failed = false;
  private message = '';

  constructor() {
    super();
    installPanelComponents(
      this.root,
      'ir-manager',
      `:host{display:block}section{display:grid;gap:10px;margin:12px 0}h2,h3,h4,p{margin:0}
      .fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:10px}
      label{display:grid;gap:4px;min-width:0}input,select{box-sizing:border-box;width:100%;min-width:0}
      .actions{justify-content:flex-start}`,
    );
  }

  set hass(hass: Hass | undefined) {
    const offline = hass?.connected === false || hass?.connection?.connected === false;
    const changed = this._hass && this._hass.connection !== hass?.connection;
    this._hass = hass;
    if (changed || (offline && !this.offline)) {
      this.requested = false;
      this.closeCapture();
      this.candidate = undefined;
      this.receivers = [];
      this.emitters = [];
      this.saved = [];
      this.message = '';
      this.failed = false;
      this.render();
    }
    this.offline = offline;
    this.loadOnOpen();
  }

  connectedCallback(): void {
    this.render();
    this.loadOnOpen();
  }

  disconnectedCallback(): void {
    queueMicrotask(() => {
      if (!this.isConnected) this.closeCapture();
    });
  }

  stopCapture(): void {
    if (!this.capture) return;
    this.closeCapture();
    this.render();
  }

  private loadOnOpen(): void {
    if (!this.isConnected || !this._hass || this.requested || this.busy || this.offline) return;
    this.requested = true;
    void this.refresh();
  }

  private refresh(): Promise<void> {
    return this.run(async hass => {
      const [devices, library] = await Promise.all([remotes.devices(hass), remotes.library(hass)]);
      if (!this.isCurrent(hass)) return;
      this.receivers = devices.receivers;
      this.emitters = devices.emitters;
      this.saved = library;
      if (!this.receivers.some(device => device.id === this.receiver))
        this.receiver = this.receivers.length === 1 ? this.receivers[0].id : '';
      if (!this.emitters.some(device => device.id === this.emitter))
        this.emitter = this.emitters.length === 1 ? this.emitters[0].id : '';
      if (!this.saved.some(remote => remote.id === this.remoteId)) this.remoteId = '';
    });
  }

  private async run(work: (hass: Hass) => Promise<void>): Promise<void> {
    const hass = this._hass;
    if (this.busy || !hass || this.offline) return;
    this.busy = true;
    this.message = '';
    this.failed = false;
    this.render();
    try {
      await work(hass);
    } catch (error) {
      if (this.isCurrent(hass)) this.report(error);
    } finally {
      this.busy = false;
      this.render();
      this.loadOnOpen();
    }
  }

  private isCurrent(hass: Hass): boolean {
    return !this.offline && this._hass?.connection === hass.connection;
  }

  private report(error: unknown): void {
    const message = (error as { message?: string })?.message;
    this.message = message ? t('Home Assistant rechazó la operación: {message}', { message }) : t('Algo falló.');
    this.failed = true;
  }

  private release(unsubscribe: () => void): void {
    // HA may already have closed the connection or removed the subscription.
    void Promise.resolve()
      .then(unsubscribe)
      .catch(() => undefined);
  }

  private closeCapture(): void {
    const capture = this.capture;
    this.capture = undefined;
    clearTimeout(capture?.timeout);
    if (capture?.unsubscribe) this.release(capture.unsubscribe);
  }

  private async learn(): Promise<void> {
    if (!this._hass || !this.receiver || this.capture || this.busy || this.offline) return;
    this.candidate = undefined;
    this.carrierHz = '38000';
    this.carrierSource = 'estimated';
    this.message = '';
    this.failed = false;
    const capture: Capture = {};
    this.capture = capture;
    this.render();
    const stillListening = () => this.capture === capture;
    const finish = (event: IrCaptureEvent) => {
      if (!stillListening()) return;
      this.closeCapture();
      if ('candidate_id' in event) this.candidate = event;
      else if (event.status === 'error') {
        this.message = t('Se interrumpió la captura IR. Volvé a intentarlo.');
        this.failed = true;
      } else this.message = t('No se recibió ninguna señal IR.');
      this.render();
    };
    capture.timeout = setTimeout(() => finish({ status: 'timeout' }), 17_000);
    try {
      const unsubscribe = await remotes.capture(this._hass, this.receiver, finish, stillListening);
      if (this.capture === capture) capture.unsubscribe = unsubscribe;
      else this.release(unsubscribe);
    } catch (error) {
      if (this.capture !== capture) return;
      this.closeCapture();
      this.report(error);
      this.render();
    }
  }

  private replay(): IrReplay | undefined {
    const carrier = Number(this.carrierHz);
    if (
      !this.candidate ||
      !this.emitter ||
      !this.carrierHz.trim() ||
      !Number.isInteger(carrier) ||
      carrier < 0 ||
      carrier > 1_000_000
    )
      return undefined;
    return {
      candidate_id: this.candidate.candidate_id,
      emitter_id: this.emitter,
      carrier_hz: carrier,
      carrier_source: this.carrierSource,
    };
  }

  private updateActions(): void {
    const test = this.root.querySelector<HTMLButtonElement>('[data-test]');
    const save = this.root.querySelector<HTMLButtonElement>('[data-save]');
    const canReplay = Boolean(this.replay()) && !this.busy;
    if (test) test.disabled = !canReplay;
    if (save) save.disabled = !canReplay || !this.buttonName.trim() || !(this.remoteId || this.remoteName.trim());
  }

  private async save(hass: Hass, replay: IrReplay): Promise<void> {
    const target = this.remoteId ? { remote_id: this.remoteId } : { remote_name: this.remoteName.trim() };
    const saved = await remotes.save(hass, replay, this.buttonName.trim(), target);
    if (!this.isCurrent(hass)) return;
    this.candidate = undefined;
    this.buttonName = '';
    this.remoteName = '';
    this.remoteId = saved.id;
    const library = await remotes.library(hass);
    if (!this.isCurrent(hass)) return;
    this.saved = library;
    this.message = t('Guardado en Home Assistant.');
  }

  private render(): void {
    const restoreFocus = keepPanelFocus(this.root);
    const disabled = this.busy || this.offline ? ' disabled' : '';
    const option = (id: string, label: string, selected: string) =>
      `<option value="${e(id)}"${id === selected ? ' selected' : ''}>${e(label)}</option>`;
    const devices = (items: IrDevice[], selected: string) => {
      if (!items.length) return option('', t('Sin equipos disponibles'), selected);
      const placeholder = items.length > 1 ? option('', t('Elegí un equipo'), selected) : '';
      return placeholder + items.map(device => option(device.id, device.name, selected)).join('');
    };
    const capture = this.capture
      ? `<span>${e(t('Pulsá un botón del control físico.'))}</span><button type="button" data-stop>${e(t('Cancelar'))}</button>`
      : `<button type="button" data-learn${this.busy || this.offline || !this.receiver ? ' disabled' : ''}>${e(t('Capturar botón IR'))}</button>`;
    const candidate = this.candidate;
    const learn = candidate
      ? `
      <p>${e(t('Señal capturada: {count} duraciones, {ms} ms.', { count: candidate.count, ms: Math.round(candidate.duration_us / 1000) }))}</p>
      <div class="fields">
        <label>${e(t('Emisor IR'))}<select name="emitter"${disabled}>${devices(this.emitters, this.emitter)}</select></label>
        <label>${e(t('Portadora (Hz)'))}<input name="carrier" type="number" min="0" max="1000000" step="1" value="${e(this.carrierHz)}"${disabled}></label>
        <label>${e(t('Origen de la portadora'))}<select name="carrier-source"${disabled}>${option('estimated', t('Estimada'), this.carrierSource)}${option('known', t('Conocida'), this.carrierSource)}</select></label>
        <label>${e(t('Guardar en'))}<select name="remote"${disabled}>${option('', t('Nuevo control'), this.remoteId)}${this.saved.map(remote => option(remote.id, remote.name, this.remoteId)).join('')}</select></label>
        ${this.remoteId ? '' : `<label>${e(t('Nombre del control'))}<input name="remote-name" maxlength="80" value="${e(this.remoteName)}"${disabled}></label>`}
        <label>${e(t('Nombre del botón'))}<input name="button-name" maxlength="80" value="${e(this.buttonName)}"${disabled}></label>
      </div>
      <p>${e(t('La portadora inicial de 38000 Hz es una estimación. Ajustala si conocés la frecuencia del mando.'))}</p>
      ${this.emitters.length ? '' : `<p>${e(t('No hay un emisor IR disponible para probar o guardar.'))}</p>`}
      <div class="actions"><button type="button" data-test disabled>${e(t('Probar'))}</button><button type="button" data-save disabled>${e(t('Guardar'))}</button></div>`
      : '';
    const library = this.saved
      .map(
        remote =>
          `<section><h4>${e(remote.name)}</h4><div class="actions">${remote.buttons
            .map(
              button =>
                `<button type="button" data-remote-id="${e(remote.id)}" data-button-id="${e(button.id)}"${this.capture ? ' disabled' : disabled}>${e(button.name)}</button>`,
            )
            .join('')}</div></section>`,
      )
      .join('');
    this.root.innerHTML = `<h2>${e(t('Infrarrojos'))}</h2><section aria-labelledby="ir-learn-heading">
      <h3 id="ir-learn-heading">${e(t('Aprender un botón IR'))}</h3>
      <div class="fields"><label>${e(t('Receptor IR'))}<select name="receiver"${this.capture ? ' disabled' : disabled}>${devices(this.receivers, this.receiver)}</select></label></div>
      ${this.requested && !this.busy && !this.failed && !this.receivers.length ? `<p>${e(t('No hay un receptor IR disponible.'))}</p>` : ''}
      <div class="actions">${capture}<button type="button" data-refresh${this.capture ? ' disabled' : disabled}>${e(t('Actualizar'))}</button></div>
      ${learn}</section><section aria-labelledby="ir-saved-heading"><h3 id="ir-saved-heading">${e(t('Controles IR guardados'))}</h3>
      ${library || `<p>${e(t('Todavía no hay controles IR guardados.'))}</p>`}</section>
      <p role="status" class="status${this.failed ? ' error' : ''}">${e(this.message || (this.busy ? t('Cargando…') : ''))}</p>`;
    this.bind();
    this.updateActions();
    restoreFocus();
  }

  private bind(): void {
    const value = (name: string, event: 'input' | 'change', change: (text: string) => void) => {
      const field = this.root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
      field?.addEventListener(event, () => {
        change(field.value);
        this.updateActions();
      });
    };
    const click = (selector: string, work: () => void) =>
      this.root.querySelector(selector)?.addEventListener('click', work);
    value('receiver', 'change', receiver => {
      this.receiver = receiver;
      this.render();
    });
    value('emitter', 'change', emitter => {
      this.emitter = emitter;
    });
    value('carrier', 'input', carrier => {
      this.carrierHz = carrier;
    });
    value('carrier-source', 'change', source => {
      this.carrierSource = source === 'known' ? 'known' : 'estimated';
    });
    value('button-name', 'input', name => {
      this.buttonName = name;
    });
    value('remote-name', 'input', name => {
      this.remoteName = name;
    });
    value('remote', 'change', id => {
      this.remoteId = id;
      this.render();
    });
    click('[data-refresh]', () => void this.refresh());
    click('[data-learn]', () => void this.learn());
    click('[data-stop]', () => this.stopCapture());
    click('[data-test]', () => {
      const replay = this.replay();
      if (replay)
        void this.run(async hass => {
          await remotes.test(hass, replay);
          if (this.isCurrent(hass)) this.message = t(SENT);
        });
    });
    click('[data-save]', () => {
      const replay = this.replay();
      if (replay && this.buttonName.trim() && (this.remoteId || this.remoteName.trim()))
        void this.run(hass => this.save(hass, replay));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-button-id]').forEach(button => {
      button.addEventListener(
        'click',
        () =>
          void this.run(async hass => {
            await remotes.press(hass, button.dataset.remoteId!, button.dataset.buttonId!);
          if (this.isCurrent(hass)) this.message = t(SENT);
          }),
      );
    });
  }
}

if (!customElements.get('homemanager-ir-manager')) customElements.define('homemanager-ir-manager', HomeManagerIr);
