import { historyPoints } from '../integration/history.js';
import { escapeHTML as e, type Hass } from '../card/types.js';
import { t } from '../i18n/index.js';
import {
  drawIr,
  remotes,
  type IrCaptureEvent,
  type IrCaptured,
  type IrDevice,
  type IrRemote,
  type IrReplay,
  type IrSettings,
} from '../integration/remotes.js';
import { installPanelComponents, keepPanelFocus } from '../ui/panel-components.js';
import { iconButton, miniWave, sidePanelStyles } from '../ui/side-panel.js';
import { rfLearnRingStyles, irManagerStyles } from '../ui/rf-components.js';
import { ControlDesigner } from '../ui/control-designer.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { SignalPreview, openSignal } from '../ui/signal-workbench.js';
import { HomeManagerRfRemote } from './remote-view.js';
import { buttonSuggestions } from './catalog.js';
import { emitterFor } from './equipment.js';

type Candidate = Extract<IrCaptureEvent, { candidate_id: string }>;
type Capture = { batch: boolean; unsubscribe?: () => void; timeout?: ReturnType<typeof setTimeout> };
const SENT = 'Solicitud IR enviada. Confirmá la reacción en el equipo.';
const glyph = (name: string) => `<ha-icon icon="${name}" aria-hidden="true"></ha-icon>`;

/** Manual capture and replay. The browser only sees opaque candidate and button IDs. */
export class HomeManagerIr extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private _hass?: Hass;
  private offline = false;
  private requested = false;
  private receivers: IrDevice[] = [];
  private emitters: IrDevice[] = [];
  private saved: IrRemote[] = [];
  private selected = '';
  private editing: 'buttons' | 'layout' | '' = '';
  private settings?: IrSettings;
  private replaceButton = '';
  private readonly preview = new SignalPreview();
  private readonly designer = new ControlDesigner();
  private readonly player = new HomeManagerRfRemote();
  private receiver = '';
  private emitter = '';
  private remoteId = '';
  private remoteName = '';
  private buttonName = '';
  private carrierHz = '38000';
  private carrierSource: IrReplay['carrier_source'] = 'estimated';
  /** Sent once with Test: now the person says whether it worked. */
  private tried = false;
  private advanced = false;
  private capture?: Capture;
  private candidate?: Candidate;
  private batch: IrCaptured[] = [];
  private busy = false;
  private failed = false;
  private message = '';

  constructor() {
    super();
    installPanelComponents(this.root, 'ir-manager', sidePanelStyles + rfLearnRingStyles + irManagerStyles);
    this.player.estimated = false;
    this.player.readValues = () => this._hass?.states ?? {};
    this.player.onPress = async buttonId => {
      if (!this._hass || this.offline || this.capture) throw new Error(t('Esperá a que termine la captura.'));
      const result = await remotes.press(this._hass, this.selected, buttonId);
      const status = this.root.querySelector<HTMLElement>('[data-ir-status]');
      if (status) status.textContent = t(SENT);
      return result;
    };
  }

  set hass(hass: Hass | undefined) {
    const offline = hass?.connected === false || hass?.connection?.connected === false;
    const changed = this._hass && this._hass.connection !== hass?.connection;
    this._hass = hass;
    if (changed || (offline && !this.offline)) {
      this.requested = false;
      this.closeCapture();
      this.candidate = undefined;
      this.batch = [];
      this.receivers = [];
      this.emitters = [];
      this.saved = [];
      this.settings = undefined;
      this.editing = '';
      this.replaceButton = '';
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

  /** A new IR remote from Controls › New: its name and receiver are already chosen. */
  startNew(name: string, receiver = ''): void {
    this.remoteId = '';
    this.remoteName = name;
    if (receiver) this.receiver = receiver;
    this.pickEmitter(true);
    this.render();
  }

  /** The emitter on the receiver's board, unless one was chosen. */
  private pickEmitter(force = false): void {
    if (!force && this.emitters.some(device => device.id === this.emitter)) return;
    this.emitter =
      emitterFor(
        this.receivers.find(device => device.id === this.receiver),
        this.emitters,
      )?.id ?? '';
  }

  openRemote(remoteId: string): void {
    this.selected = remoteId;
    this.editing = '';
    this.render();
    if (this.requested && !this.saved.some(item => item.id === remoteId)) void this.refresh();
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
      if (!this.saved.some(remote => remote.id === this.selected)) this.selected = this.saved[0]?.id ?? '';
      // Never a dead end: the first receiver listens unless another is tapped.
      if (!this.receivers.some(device => device.id === this.receiver)) this.receiver = this.receivers[0]?.id ?? '';
      this.pickEmitter();
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

  private async learn(batch = false): Promise<void> {
    if (!this._hass || !this.receiver || this.capture || this.busy || this.offline) return;
    this.candidate = undefined;
    this.batch = [];
    if (batch) this.replaceButton = '';
    this.carrierHz = '38000';
    this.carrierSource = 'estimated';
    this.tried = false;
    this.message = '';
    this.failed = false;
    const capture: Capture = { batch };
    this.capture = capture;
    this.render();
    const stillListening = () => this.capture === capture;
    const finish = (event: IrCaptureEvent) => {
      if (!stillListening()) return;
      this.closeCapture();
      if ('candidate_id' in event) this.candidate = event;
      else if ('candidates' in event) {
        this.batch = event.candidates;
        this.candidate = this.batch[0];
      } else if (event.status === 'error') {
        this.message = t('Se interrumpió la captura IR. Volvé a intentarlo.');
        this.failed = true;
      } else this.message = t('No se recibió ninguna señal IR.');
      this.render();
    };
    capture.timeout = setTimeout(() => finish({ status: 'timeout' }), 17_000);
    try {
      const unsubscribe = await remotes.capture(this._hass, this.receiver, finish, stillListening, batch);
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
    if (save) save.disabled = !canReplay;
  }

  private async save(hass: Hass, replay: IrReplay): Promise<void> {
    const target = this.remoteId
      ? { remote_id: this.remoteId, ...(this.replaceButton ? { button_id: this.replaceButton } : {}) }
      : { remote_name: this.remoteName.trim() || t('Control') };
    const saved = await remotes.save(hass, replay, this.buttonName.trim() || this.defaultButtonName(), target);
    if (!this.isCurrent(hass)) return;
    this.batch = this.batch.filter(item => item.candidate_id !== replay.candidate_id);
    this.candidate = this.batch[0];
    this.buttonName = '';
    this.tried = false;
    this.remoteName = '';
    this.remoteId = saved.id;
    this.selected = saved.id;
    this.replaceButton = '';
    const library = await remotes.library(hass);
    if (!this.isCurrent(hass)) return;
    this.saved = library;
    if (this.editing === 'buttons') this.settings = await remotes.settings(hass, saved.id);
    this.message = t('Guardado en Home Assistant.');
  }

  /** "Botón 3" when no name is typed. */
  private defaultButtonName(): string {
    const count = this.saved.find(item => item.id === this.remoteId)?.buttons.length ?? 0;
    return t('Botón {n}', { n: count + 1 });
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
    // 0.13: the receiver is a ring to tap; one button or several in a row.
    const blocked = this.busy || this.offline || !this.receiver;
    const listening = !!this.capture;
    const ring = `<div class="listen${listening ? ' on' : this.candidate ? ' ok' : ''}"><button type="button" class="ring${listening ? ' on' : ''}" ${listening ? 'data-stop' : 'data-learn'} aria-label="${e(listening ? t('Cancelar') : t('Capturar botón IR'))}" title="${e(listening ? t('Cancelar') : t('Capturar botón IR'))}"${!listening && blocked ? ' disabled' : ''}><span class="waves" aria-hidden="true"><i></i><i></i><i></i></span><span class="core">${glyph(this.candidate && !listening ? 'mdi:check' : 'mdi:remote-tv')}</span></button><div class="text"><strong>${e(listening ? t(this.capture!.batch ? 'Pulsá y soltá cada botón del mando, uno por vez.' : 'Pulsá un botón del control físico.') : t('Tocá para escuchar'))}</strong></div></div>`;
    const tools = `<div class="tools">${iconButton(t('Capturar varios botones'), 'mdi:layers-triple-outline', `data-batch${listening || blocked ? ' disabled' : ''}`)}${iconButton(t('Actualizar'), 'mdi:refresh', `data-refresh${listening ? ' disabled' : disabled}`)}</div>`;
    const receivers = this.receivers
      .map(
        device =>
          `<button type="button" class="chip" data-receiver="${e(device.id)}" aria-pressed="${device.id === this.receiver}"${listening ? ' disabled' : ''}>${glyph('mdi:chip')}${e(device.name)}</button>`,
      )
      .join('');
    const candidate = this.candidate;
    // 0.13: like RF — a name (five suggestions), Test, then 👍 saves or 👎 opens the
    // settings; the emitter is the receiver's own board, and the technical fields wait in ⚙.
    const target = this.saved.find(item => item.id === this.remoteId);
    const used = new Set((target?.buttons ?? []).map(button => button.name));
    const suggestions = buttonSuggestions()
      .filter(([label]) => !used.has(label) || label === this.buttonName)
      .slice(0, 5)
      .map(
        ([label]) =>
          `<button type="button" class="chip" data-suggest="${e(label)}" aria-pressed="${label === this.buttonName}">${e(label)}</button>`,
      )
      .join('');
    const action = this.tried
      ? `<div class="question"><strong>${e(t('¿El equipo reaccionó?'))}</strong><div class="row">${iconButton(t('Sí, guardar'), 'mdi:thumb-up-outline', `data-save${disabled}`, 'send')}${iconButton(t('No reaccionó'), 'mdi:thumb-down-outline', `data-failed${disabled}`)}</div></div>`
      : `<div class="row"><button type="button" class="next" data-test disabled>${glyph('mdi:play')}${e(t('Probar'))}</button><span class="grow"></span>${iconButton(t('Guardar sin probar'), 'mdi:content-save-outline', 'data-save disabled')}</div>`;
    const learn = candidate
      ? `<div class="code"><div class="cap-head"><span class="dot ok"></span>${miniWave(candidate.candidate_id, 72)}<span class="muted">${e(t('Señal capturada · {ms} ms', { ms: Math.round(candidate.duration_us / 1000) }))}</span></div><div data-preview></div>
      ${this.batch.length ? `<div class="fields"><label>${e(t('Capturas pendientes'))}<select name="batch">${this.batch.map((item, index) => option(item.candidate_id, t('Captura {count} · {ms} ms', { count: index + 1, ms: Math.round(item.duration_us / 1000) }), candidate.candidate_id)).join('')}</select></label>${iconButton(t('Descartar captura'), 'mdi:close', 'data-discard')}</div>` : ''}
      ${this.replaceButton ? `<p class="muted">${e(t('Se reemplazará la señal del botón guardado.'))}</p>` : ''}
      <input class="title-in" name="button-name" maxlength="80" value="${e(this.buttonName)}" placeholder="${e(this.defaultButtonName())}" aria-label="${e(t('Nombre del botón'))}"${disabled}>
      <div class="chips" role="group" aria-label="${e(t('Sugerencias de nombre'))}">${suggestions}</div>
      ${this.emitters.length ? '' : `<p class="muted">${e(t('No hay un emisor IR disponible para probar o guardar.'))}</p>`}
      ${action}
      <details class="adv"${this.advanced ? ' open' : ''}><summary>${glyph('mdi:tune')}<span>${e(t('Ajustes'))}</span></summary><div class="fields">
        <label>${e(t('Emisor IR'))}<select name="emitter"${disabled}>${devices(this.emitters, this.emitter)}</select></label>
        <label>${e(t('Guardar en'))}<select name="remote"${disabled}>${option('', t('Nuevo control'), this.remoteId)}${this.saved.map(remote => option(remote.id, remote.name, this.remoteId)).join('')}</select></label>
        ${this.remoteId ? '' : `<label>${e(t('Nombre del control'))}<input name="remote-name" maxlength="80" value="${e(this.remoteName)}" placeholder="${e(t('Control'))}"${disabled}></label>`}
        <label>${e(t('Portadora (Hz)'))}<input name="carrier" type="number" min="0" max="1000000" step="1" value="${e(this.carrierHz)}"${disabled}></label>
        <label>${e(t('Origen de la portadora'))}<select name="carrier-source"${disabled}>${option('estimated', t('Estimada'), this.carrierSource)}${option('known', t('Conocida'), this.carrierSource)}</select></label>
      </div></details></div>`
      : '';
    const remote = this.saved.find(item => item.id === this.selected);
    const library = remote
      ? `<div class="shelf">${this.saved.length > 1 ? `<label>${e(t('Control remoto'))}<select name="selected-remote">${this.saved.map(item => option(item.id, item.name, this.selected)).join('')}</select></label>` : ''}
      <div class="title">${glyph(remote.icon ?? 'mdi:remote-tv')}<h4>${e(remote.name)}</h4><span class="cap ir">IR</span><span class="grow"></span>${iconButton(this.editing === 'buttons' ? t('Listo') : t('Editar control'), this.editing === 'buttons' ? 'mdi:check' : 'mdi:tune', `data-edit aria-pressed="${this.editing === 'buttons'}"`)}${iconButton(this.editing === 'layout' ? t('Listo') : t('Editar diseño'), this.editing === 'layout' ? 'mdi:check' : 'mdi:pencil-ruler', `data-design aria-pressed="${this.editing === 'layout'}"`)}</div>
      ${this.editing === 'buttons' ? this.renderEdit(remote) : `<div class="controls" data-player></div>`}
      </div>`
      : '';
    this.root.innerHTML = `<section class="learn" aria-label="${e(t('Aprender un botón IR'))}">${ring}${tools}
      ${receivers ? `<div class="row-icon" role="group" aria-label="${e(t('Receptor IR'))}">${glyph('mdi:ear-hearing')}<div class="chips">${receivers}</div></div>` : ''}
      ${this.requested && !this.busy && !this.failed && !this.receivers.length ? `<p class="muted">${e(t('No hay un receptor IR disponible.'))}</p>` : ''}
      ${learn}</section>${library ? `<section aria-label="${e(t('Controles IR guardados'))}">${library}</section>` : ''}
      <p role="status" data-ir-status class="status${this.failed ? ' error' : ''}">${e(this.message || (this.busy ? t('Cargando…') : ''))}</p>`;
    this.bind();
    if (candidate && this._hass) {
      this.root.querySelector('[data-preview]')?.append(this.preview);
      this.preview.configure(this._hass, { source: 'ir', candidate_id: candidate.candidate_id });
    }
    if (remote && this.editing !== 'buttons') this.mountPlayer(remote);
    this.updateActions();
    restoreFocus();
  }

  private renderEdit(remote: IrRemote): string {
    const options = (selected: string, inherit: boolean) => {
      const current =
        selected && !this.emitters.some(item => item.id === selected)
          ? `<option selected value="${e(selected)}">${e(selected)}</option>`
          : '';
      return `${inherit ? `<option value="">${e(t('Emisor del control'))}</option>` : ''}${current}${this.emitters.map(item => `<option value="${e(item.id)}"${selected === item.id ? ' selected' : ''}>${e(item.name)}</option>`).join('')}`;
    };
    const disabled = this.busy || this.offline ? ' disabled' : '';
    return `<div class="editor"><form data-edit-remote class="item"><div class="fields"><label>${e(t('Nombre del control'))}<input name="name" required maxlength="80" value="${e(remote.name)}"></label><label>${e(t('Icono'))}<input name="icon" maxlength="72" placeholder="mdi:remote" value="${e(remote.icon ?? '')}"></label><label>${e(t('Descripción (opcional)'))}<input name="description" maxlength="200" value="${e(remote.description ?? '')}"></label>${this.settings ? `<label>${e(t('Emisor IR'))}<select name="emitter">${options(this.settings.emitter, false)}</select></label>` : ''}</div><div class="actions"><button type="submit"${disabled}>${e(t('Guardar ajustes'))}</button><button type="button" class="danger" data-remove-remote>${e(t('Eliminar control'))}</button></div></form>
      ${remote.buttons
        .map(button => {
          const settings = this.settings?.buttons[button.id];
          return `<form data-edit-button="${e(button.id)}" class="item"><div class="fields"><label>${e(t('Nombre del botón'))}<input name="name" required maxlength="80" value="${e(button.name)}"></label><label>${e(t('Icono'))}<input name="icon" maxlength="72" placeholder="mdi:power" value="${e(button.icon ?? '')}"></label>${settings ? `<label>${e(t('Emisor IR'))}<select name="emitter">${options(settings.emitter ?? '', true)}</select></label><label>${e(t('Portadora (Hz)'))}<input name="carrier" type="number" min="0" max="1000000" step="1" value="${e(String(settings.carrier_hz ?? ''))}"></label><label>${e(t('Origen de la portadora'))}<select name="carrier-source"><option value="estimated">${e(t('Estimada'))}</option><option value="known"${settings.carrier_source === 'known' ? ' selected' : ''}>${e(t('Conocida'))}</option></select></label>` : ''}</div><div class="actions"><button type="submit"${disabled}>${e(t('Guardar'))}</button><button type="button" data-relearn="${e(button.id)}">${e(t('Volver a aprender'))}</button><button type="button" data-signal="${e(button.id)}">${e(t('Ficha técnica'))}</button><button type="button" class="danger" data-remove-button="${e(button.id)}">${e(t('Eliminar botón'))}</button></div></form>`;
        })
        .join('')}</div>`;
  }

  private mountPlayer(remote: IrRemote): void {
    const host = this.root.querySelector('[data-player]');
    if (this.editing === 'layout') {
      host?.append(this.designer);
      this.designer.configure({
        key: `ir:${remote.id}`,
        remote: drawIr(remote),
        name: remote.name,
        estimated: false,
        pinTo: pieceId =>
          this.dispatchEvent(
            new CustomEvent('homemanager-shell-command', {
              detail: { command: 'pin', irRemoteId: remote.id, pieceId },
              bubbles: true,
              composed: true,
            }),
          ),
        // Test mode sends for real, as the control in use does.
        press: buttonId => remotes.press(this._hass!, remote.id, buttonId),
        duplicate: {
          emitters: this.emitters.map(item => ({ id: item.id, name: item.name })),
          current: this.settings?.emitter,
          run: async (name, emitter) => {
            const copy = await remotes.duplicate(this._hass!, remote.id, name, emitter);
            this.saved = [...this.saved.filter(item => item.id !== copy.id), copy];
            this.selected = copy.id;
            this.render();
          },
        },
        readValues: () => this._hass?.states ?? {},
        history: (entity, period, attribute) => historyPoints(this._hass, entity, period, attribute),
        save: async layout => {
          if (!this._hass) throw new Error(t('Algo falló.'));
          const updated = await remotes.editRemote(this._hass, remote.id, { layout });
          if (updated) this.updateRemote(updated);
        },
      });
    } else {
      host?.append(this.player);
      this.player.readValues = () => this._hass?.states ?? {};
      this.player.history = (entity, period, attribute) => historyPoints(this._hass, entity, period, attribute);
      this.player.remote = drawIr(remote);
    }
  }

  private updateRemote(remote: IrRemote): void {
    this.saved = this.saved.map(item => (item.id === remote.id ? remote : item));
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
    this.root.querySelectorAll<HTMLButtonElement>('[data-receiver]').forEach(chip =>
      chip.addEventListener('click', () => {
        this.receiver = chip.dataset.receiver!;
        this.pickEmitter(true);
        this.render();
      }),
    );
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
      this.replaceButton = '';
      this.render();
    });
    value('selected-remote', 'change', id => {
      this.selected = id;
      this.settings = undefined;
      this.editing = '';
      this.render();
    });
    value('batch', 'change', id => {
      this.candidate = this.batch.find(item => item.candidate_id === id);
      this.buttonName = '';
      this.render();
    });
    click('[data-refresh]', () => void this.refresh());
    click('[data-learn]', () => void this.learn());
    click('[data-batch]', () => void this.learn(true));
    click('[data-discard]', () => {
      this.batch = this.batch.filter(item => item.candidate_id !== this.candidate?.candidate_id);
      this.candidate = this.batch[0];
      this.buttonName = '';
      this.render();
    });
    click('[data-stop]', () => this.stopCapture());
    click('[data-test]', () => {
      const replay = this.replay();
      if (replay)
        void this.run(async hass => {
          await remotes.test(hass, replay);
          if (!this.isCurrent(hass)) return;
          this.message = t(SENT);
          this.tried = true;
        });
    });
    click('[data-failed]', () => {
      this.tried = false;
      this.advanced = true;
      this.message = t('Probá con otro emisor o acercalo al equipo, y volvé a probar.');
      this.render();
    });
    click('[data-save]', () => {
      const replay = this.replay();
      if (replay) void this.run(hass => this.save(hass, replay));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-suggest]').forEach(chip =>
      chip.addEventListener('click', () => {
        this.buttonName = chip.dataset.suggest!;
        this.render();
      }),
    );
    this.root.querySelector<HTMLDetailsElement>('details.adv')?.addEventListener('toggle', event => {
      this.advanced = (event.target as HTMLDetailsElement).open;
    });
    this.bindLibrary();
  }

  private bindLibrary(): void {
    const remote = this.saved.find(item => item.id === this.selected);
    if (!remote) return;
    const click = (selector: string, work: () => void) =>
      this.root.querySelector(selector)?.addEventListener('click', work);
    click('[data-edit]', () => {
      this.editing = this.editing === 'buttons' ? '' : 'buttons';
      this.render();
      if (this.editing === 'buttons')
        void this.run(async hass => {
          this.settings = await remotes.settings(hass, remote.id);
        });
    });
    click('[data-design]', () => {
      this.editing = this.editing === 'layout' ? '' : 'layout';
      this.render();
    });
    const remove = async (id?: string) => {
      if (
        !(await confirmDialog(this.root, {
          title: t(id ? '¿Eliminar este botón?' : '¿Eliminar este control?'),
          message: t('Se quitarán sus accesos en Home Assistant.'),
          confirm: t('Eliminar'),
        }))
      )
        return;
      await this.run(async hass => {
        if (id) this.updateRemote(await remotes.editButton(hass, remote.id, id, null));
        else {
          await remotes.editRemote(hass, remote.id, null);
          this.saved = this.saved.filter(item => item.id !== remote.id);
          this.selected = this.saved[0]?.id ?? '';
          if (this.remoteId === remote.id) this.remoteId = '';
          this.editing = '';
          this.settings = undefined;
        }
      });
    };
    click('[data-remove-remote]', () => void remove());
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-remove-button]')
      .forEach(button => button.addEventListener('click', () => void remove(button.dataset.removeButton)));
    this.root.querySelectorAll<HTMLButtonElement>('[data-signal]').forEach(button =>
      button.addEventListener('click', () => {
        if (this._hass)
          openSignal(this._hass, { source: 'ir', remote_id: remote.id, button_id: button.dataset.signal! });
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-relearn]').forEach(button =>
      button.addEventListener('click', () => {
        const id = button.dataset.relearn!;
        this.remoteId = remote.id;
        this.replaceButton = id;
        this.buttonName = remote.buttons.find(item => item.id === id)?.name ?? '';
        this.editing = '';
        this.render();
        void this.learn();
      }),
    );
    this.root.querySelectorAll<HTMLFormElement>('[data-edit-remote],[data-edit-button]').forEach(form =>
      form.addEventListener('submit', event => {
        event.preventDefault();
        const data = new FormData(form);
        const name = String(data.get('name') ?? '').trim();
        const icon = String(data.get('icon') ?? '').trim() || null;
        const emitter = data.get('emitter');
        const button = form.dataset.editButton;
        void this.run(async hass => {
          if (button) {
            const carrier = data.get('carrier');
            this.updateRemote(
              await remotes.editButton(hass, remote.id, button, {
                name,
                icon,
                ...(typeof emitter === 'string' ? { emitter: emitter || null } : {}),
                ...(carrier
                  ? {
                      carrier_hz: Number(carrier),
                      carrier_source: data.get('carrier-source') === 'known' ? 'known' : 'estimated',
                    }
                  : {}),
              }),
            );
          } else {
            const updated = await remotes.editRemote(hass, remote.id, {
              name,
              icon,
              description: String(data.get('description') ?? '').trim() || null,
              ...(typeof emitter === 'string' && emitter ? { emitter } : {}),
            });
            if (updated) this.updateRemote(updated);
          }
          this.settings = await remotes.settings(hass, remote.id);
          this.message = t('Guardado en Home Assistant.');
        });
      }),
    );
  }
}

if (!customElements.get('homemanager-ir-manager')) customElements.define('homemanager-ir-manager', HomeManagerIr);
