import { historyPoints } from '../integration/history.js';
import { iconPicker } from '../ui/icon-picker.js';
import { ControlDesigner } from '../ui/control-designer.js';
import { learningWorkspaceStyles } from '../ui/learning-components.js';
import { t } from '../i18n/index.js';
import { escapeHTML as e, type Hass } from '../card/types.js';
import { installPanelComponents, panelField, keepPanelFocus } from '../ui/panel-components.js';
import { rfManagerStyles, rfControlsStyles, rfTestStyles, rfText, rfEditedText } from '../ui/rf-components.js';
import { iconButton, miniWave, panelHead, panelLabel, sidePanelStyles, sourceTag } from '../ui/side-panel.js';
import { equipmentOf } from './equipment.js';
import {
  ROLES,
  rf,
  type PartKind,
  type RfAbout,
  type RfPart,
  type RfRemote,
  type RfTransmitter,
  type RfDevice,
} from '../integration/rf.js';
import { remotes as irApi, type IrDevice, type IrRemote } from '../integration/remotes.js';
import { icon, kindLabel, roleLabel } from './catalog.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { openSignal, type SignalTab } from '../ui/signal-workbench.js';
import './remote-view.js';
import './learn.js';
import './devices.js';
import './ir-manager.js';
import type { HomeManagerRfRemote } from './remote-view.js';
import type { HomeManagerRfLearn } from './learn.js';
import type { HomeManagerRfDevices } from './devices.js';
import type { HomeManagerIr } from './ir-manager.js';

/** Controls (0.13): one panel beside the plan for RF and IR remotes, administrators only
 * (the integration enforces it). The list shows the ESPHome devices that send and
 * listen, then every remote with its RF or IR tag. A remote opens with its drawing,
 * one row of icon tools and its learned buttons; its design takes the stage. What Home
 * Assistant gets (fans and lights) and the transmission settings each have their own
 * page in the same panel. Codes never reach this page. */

type View = 'list' | 'new' | 'remote' | 'devices' | 'ir' | 'entities' | 'settings' | 'learn' | 'test';
type Trial = 'sent' | 'ok' | 'no';
type Source = 'rf' | 'ir';
/** What kind of appliance a new remote is for: only its icon follows from it. */
const KINDS: [string, string][] = [
  ['mdi:air-conditioner', 'Aire'],
  ['mdi:ceiling-fan', 'Ventilador'],
  ['mdi:television', 'TV'],
  ['mdi:lightbulb-outline', 'Luz'],
  ['mdi:projector', 'Proyector'],
  ['mdi:remote', 'Otro'],
];
export class HomeManagerRf extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private _hass?: Hass;
  private remotes: RfRemote[] = [];
  private irRemotes: IrRemote[] = [];
  private irReceivers: IrDevice[] = [];
  private irEmitters: IrDevice[] = [];
  private transmitters: RfTransmitter[] = [];
  private defaultReceiver: string | null = null;
  private view: View = 'list';
  private selected: string | null = null;
  /** A new remote that is stored with its first learned button. */
  private draft: RfAbout | null = null;
  private newRemote: RfAbout = { name: '', icon: 'mdi:air-conditioner', description: null };
  private newSource: Source = 'rf';
  private newReceiver = '';
  private irTitle = '';
  /** New remote: Learn › Test › Design follow each other (0.13). */
  private wizard = false;
  private trials = new Map<string, Trial>();
  private editing = false;
  private learning = false;
  private readonly designer = new ControlDesigner();
  private rfDevices: RfDevice[] = [];
  private learnSuspended = false;
  private learnOwner: string | null = null;
  private message = '';
  private failed = false;
  private loaded = false;
  // Kept across renders: they hold a live capture, a drag or a probe.
  private readonly remoteView = document.createElement('homemanager-rf-remote') as HomeManagerRfRemote;
  private readonly learn = document.createElement('homemanager-rf-learn') as HomeManagerRfLearn;
  private readonly devices = document.createElement('homemanager-rf-devices') as HomeManagerRfDevices;
  private readonly infrared = document.createElement('homemanager-ir-manager') as HomeManagerIr;

  constructor() {
    super();
    installPanelComponents(
      this.root,
      'rf-manager',
      rfManagerStyles + learningWorkspaceStyles + sidePanelStyles + rfControlsStyles + rfTestStyles,
      true,
    );
    this.remoteView.onPress = buttonId => rf.press(this._hass!, this.selected!, buttonId);
    this.learn.onSaved = id => void this.learned(id);
    this.learn.onClose = () => this.closeLearn();
    this.learn.receiverOnline = id => this.rfDevices.find(d => d.id === id)?.online !== false;
    this.root.addEventListener('homemanager-rf-open-devices', () => {
      this.learn.stop();
      this.show('devices');
    });
    this.devices.onChange = () => void this.reload();
  }

  set hass(hass: Hass) {
    if (typeof hass.themes?.darkMode === 'boolean') this.dataset.theme = hass.themes.darkMode ? 'dark' : 'light';
    const first = !this._hass;
    this._hass = hass;
    this.learn.hass = hass;
    this.remoteView.updateIndicators();
    this.designer.refreshIndicators();
    if (this.view === 'devices') this.devices.hass = hass;
    if (this.view === 'ir') this.infrared.hass = hass;
    if (first) void this.load();
  }
  get hass(): Hass | undefined {
    return this._hass;
  }

  disconnectedCallback(): void {
    this.learn.stop();
    this.devices.stop();
  }

  stopIrCapture(): void {
    this.infrared.stopCapture();
  }

  openIrRemote(remoteId: string): void {
    this.irTitle = this.irRemotes.find(remote => remote.id === remoteId)?.name ?? '';
    this.show('ir');
    this.infrared.openRemote(remoteId);
  }

  private async load(): Promise<void> {
    try {
      await this.reload();
      this.loaded = true;
    } catch (error) {
      this.report(error);
    }
    this.render();
  }

  private async reload(): Promise<void> {
    const hass = this._hass;
    if (!hass) return;
    const [library, transmitters, devices, irLibrary, irDevices] = await Promise.all([
      rf.library(hass),
      rf.transmitters(hass),
      rf.devices(hass).catch(() => null),
      // IR needs a Home Assistant whose ESPHome exposes IR Proxy: without it, RF only.
      irApi.library(hass).catch(() => [] as IrRemote[]),
      irApi.devices(hass).catch(() => ({ receivers: [] as IrDevice[], emitters: [] as IrDevice[] })),
    ]);
    this.remotes = library.remotes;
    this.transmitters = transmitters;
    this.defaultReceiver = devices?.default_receiver ?? null;
    this.rfDevices = devices?.devices ?? [];
    this.irRemotes = irLibrary;
    this.irReceivers = irDevices.receivers;
    this.irEmitters = irDevices.emitters;
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

  private remote(): RfRemote | undefined {
    return this.remotes.find(item => item.id === this.selected);
  }

  /** The IR receiver for a new remote: the one tapped, else the first. */
  private irReceiver(): string {
    return this.irReceivers.some(item => item.id === this.newReceiver)
      ? this.newReceiver
      : (this.irReceivers[0]?.id ?? '');
  }

  /** A new remote without a typed name takes its kind's name. */
  private newName(): string {
    return t(KINDS.find(([glyph]) => glyph === this.newRemote.icon)?.[1] ?? 'Control');
  }

  private receiver(): string {
    const usable = (id: string | null | undefined) =>
      !!id && this.transmitters.some(item => item.id === id && item.can_capture);
    if (usable(this.newReceiver) && !this.remote()) return this.newReceiver;
    if (usable(this.defaultReceiver)) return this.defaultReceiver!;
    const remote = this.remote();
    if (usable(remote?.transmitter)) return remote!.transmitter;
    return this.transmitters.find(item => item.can_capture)?.id ?? '';
  }

  // Rendering -------------------------------------------------------------

  private render(): void {
    const restoreFocus = keepPanelFocus(this.root, '[data-button],[data-part]');
    const status = `<p class="status${this.failed ? ' error' : ''}" role="status">${e(this.message)}</p>`;
    const designing = this.view === 'remote' && this.editing && !!this.remote();
    // The design takes the stage; everything else is a panel beside the plan.
    this.toggleAttribute('data-stage', designing);
    let page: string;
    if (!this.loaded && this.view !== 'ir')
      page = this.panel(panelHead(e(t('Controles')), { close: t('Cerrar') }), `<p>${e(t('Cargando…'))}</p>${status}`);
    else if (this.view === 'ir')
      page = this.panel(
        panelHead(e(this.irTitle || t('Infrarrojos')), { back: t('Volver'), close: t('Cerrar') }),
        '<div data-slot="infrared"></div>',
      );
    else if (this.view === 'devices')
      page = this.panel(
        panelHead(e(t('Equipos')), { back: t('Volver'), close: t('Cerrar') }),
        `<div data-slot="devices"></div>${status}`,
      );
    else if (this.view === 'new') page = this.renderNew(status);
    else if (this.view === 'test' && this.remote()) page = this.renderTest(this.remote()!, status);
    else if (this.view === 'learn' && (this.remote() || this.draft))
      page = this.panel(
        panelHead(`${e(t('Aprender'))} · ${e(rfText((this.remote() ?? this.draft)!.name))}`, {
          back: t('Volver'),
          close: t('Cerrar'),
        }),
        `${this.wizard || !this.remote() ? this.stepper(1) : ''}<div data-slot="learn"></div>${status}`,
      );
    else if (this.view === 'entities' && this.remote()) page = this.renderEntities(this.remote()!, status);
    else if (this.view === 'settings' && this.remote()) page = this.renderSettings(this.remote()!, status);
    else if (this.view === 'remote' && (this.remote() || this.draft)) page = this.renderRemote(status);
    else page = this.renderList(status);
    this.root.innerHTML = page;
    for (const [slot, element] of [
      ['remote', designing ? this.designer : this.remoteView],
      ['learn', this.learn],
      ['devices', this.devices],
      ['infrared', this.infrared],
    ] as const)
      this.root.querySelector(`[data-slot=${slot}]`)?.replaceWith(element);
    this.bind();
    restoreFocus();
  }

  private panel(head: string, body: string, foot = ''): string {
    return `<div class="panel">${head}<div class="dbody">${body}</div>${foot ? `<div class="dfoot">${foot}</div>` : ''}</div>`;
  }

  /** The boards that send or listen, as chips, each once with what it does (RF,
   * IR). An energy meter or an offline board is listed in Devices only. */
  private renderNodes(): string {
    const chips = equipmentOf(this.rfDevices, this.transmitters, this.irReceivers, this.irEmitters)
      .filter(item => item.group === 'remote')
      .map(
        item =>
          `<button type="button" class="node" data-view="devices" title="${e(t('Equipos'))}"><span class="dot ok"></span><b>${e(rfText(item.name))}</b><span class="caps">${item.rfReady ? sourceTag('rf') : ''}${item.irReceiver || item.irEmitter ? sourceTag('ir') : ''}</span></button>`,
      )
      .join('');
    return `<div class="nodes" role="group" aria-label="${e(t('Equipos'))}">${chips}${iconButton(t('Equipos'), 'mdi:chip', 'data-view="devices"')}</div>`;
  }

  private renderList(status: string): string {
    const canCreate = this.transmitters.length > 0 || this.irReceivers.length > 0;
    const head = panelHead(e(t('Controles')), {
      ...(this.fromSettings ? { back: t('Volver') } : {}),
      extra: iconButton(t('Nuevo control'), 'mdi:plus', `data-command="new"${canCreate ? '' : ' disabled'}`),
      close: t('Cerrar'),
    });
    const row = (
      source: Source,
      id: string,
      name: string,
      glyph: string | null,
      count: number,
      description: string | null,
    ) =>
      `<div class="li open"><span class="ico-tile">${icon(glyph ?? 'mdi:remote')}</span><button type="button" class="t" data-open${source === 'ir' ? '-ir' : ''}="${e(id)}"><b>${e(rfText(name))}</b><span>${e(description ? rfText(description) : t('{count} botones', { count }))}</span></button>${sourceTag(source)}<span class="acts">${source === 'rf' ? iconButton(t('Diseñar {name}', { name: rfText(name) }), 'mdi:pencil-ruler', `data-design="${e(id)}"`) + iconButton(t('Aprender más botones de {name}', { name: rfText(name) }), 'mdi:access-point', `data-learn-more="${e(id)}"`) : ''}</span></div>`;
    const items = [
      ...this.remotes.map(remote =>
        row('rf', remote.id, remote.name, remote.icon, remote.buttons.length, remote.description),
      ),
      ...this.irRemotes.map(remote =>
        row('ir', remote.id, remote.name, remote.icon, remote.buttons.length, remote.description),
      ),
    ].join('');
    const empty = canCreate
      ? `<div class="empty-state">${icon('mdi:remote')}</div>`
      : `<div class="empty-state">${icon('mdi:chip')}<span>${e(t('Ningún equipo envía ni escucha controles todavía.'))}</span><button type="button" class="next" data-view="devices">${icon('mdi:chip')}${e(t('Equipos'))}</button></div>`;
    return this.panel(head, `${this.renderNodes()}${items ? `<div class="list">${items}</div>` : empty}${status}`);
  }

  private iconPicker(name: string, selected: string | null): string {
    return iconPicker(selected ?? '', t('Icono'), `wide clearable data-rf-icon="${name}"`);
  }

  private stepper(current: 0 | 1 | 2 | 3): string {
    const steps: [string, string][] = [
      ['mdi:remote', t('Nuevo')],
      ['mdi:access-point', t('Aprender')],
      ['mdi:play-circle-outline', t('Probar')],
      ['mdi:pencil-ruler', t('Diseñar')],
    ];
    return `<ol class="stepper" aria-label="${e(t('Pasos'))}">${steps
      .map(
        ([glyph, label], index) =>
          `<li class="st${index < current ? ' done' : index === current ? ' cur' : ''}"${index === current ? ' aria-current="step"' : ''}><span>${icon(index < current ? 'mdi:check' : glyph)}</span><em>${e(label)}</em></li>`,
      )
      .join('<li class="bar" aria-hidden="true"></li>')}</ol>`;
  }

  private renderNew(status: string): string {
    const draft = this.newRemote;
    const kinds = KINDS.map(
      ([glyph, label]) =>
        `<button type="button" class="kind" data-kind="${glyph}" aria-pressed="${draft.icon === glyph}">${icon(glyph)}<span>${e(t(label))}</span></button>`,
    ).join('');
    const sources = (['ir', 'rf'] as Source[])
      .map(
        source =>
          `<button type="button" class="ib" data-source="${source}" aria-pressed="${this.newSource === source}" title="${e(source === 'ir' ? t('Infrarrojo') : t('Radio 433 MHz'))}">${icon(source === 'ir' ? 'mdi:remote-tv' : 'mdi:access-point')}<span>${source.toUpperCase()}</span></button>`,
      )
      .join('');
    const listeners: { id: string; name: string }[] =
      this.newSource === 'rf'
        ? this.transmitters.filter(item => item.can_capture)
        : this.irReceivers.map(item => ({ id: item.id, name: item.name }));
    const chosen = this.newSource === 'rf' ? this.receiver() : this.irReceiver();
    const chips = listeners
      .map(
        item =>
          `<button type="button" class="chip" data-receiver="${e(item.id)}" aria-pressed="${item.id === chosen}" title="${e(t('Escucha'))}">${icon('mdi:chip')}${e(rfText(item.name))}</button>`,
      )
      .join('');
    const body = `${this.stepper(0)}<input class="title-in" name="new-name" maxlength="80" value="${e(draft.name)}" placeholder="${e(this.newName())}" aria-label="${e(t('Nombre'))}"><div class="kinds" role="group" aria-label="${e(t('Icono'))}">${kinds}</div>${panelLabel(t('Señal'))}<div class="seg big2" role="group" aria-label="${e(t('Señal'))}">${sources}</div>${chips ? `<div class="row-icon">${icon('mdi:ear-hearing')}<div class="chips">${chips}</div></div>` : this.newSource === 'rf' ? `<div class="row-icon">${icon('mdi:ear-off')}<div class="chips"><button type="button" class="chip" data-view="devices">${icon('mdi:chip')}${e(t('Equipos'))}</button></div></div>` : ''}${status}`;
    // The name is optional (the kind's name is used). IR looks for its receivers on
    // the next page; RF needs one that listens, else the way to Devices is right here.
    const ready = this.newSource === 'ir' || !!chosen;
    return this.panel(
      panelHead(e(t('Nuevo control')), { back: t('Volver'), close: t('Cerrar') }),
      body,
      `<span class="grow"></span><button type="button" class="next" data-command="create"${ready ? '' : ' disabled'}>${icon('mdi:access-point')}${e(t('Aprender botones'))}</button>`,
    );
  }

  private renderRemote(status: string): string {
    const remote = this.remote();
    const about: RfAbout = remote ?? this.draft!;
    if (!remote)
      return this.panel(
        panelHead(e(rfText(about.name)), { back: t('Volver'), close: t('Cerrar') }),
        `<p class="muted">${e(t('Todavía no está guardado: se guarda con el primer botón que aprendas.'))}</p>${status}`,
      );
    if (this.editing)
      return this.panel(
        panelHead(`${e(t('Diseño'))} · ${e(rfText(remote.name))}`, { back: t('Volver'), close: t('Cerrar') }),
        `<div class="stage-host"><div data-slot="remote"></div></div>${status}`,
        `<span class="grow"></span>${iconButton(t('Listo'), 'mdi:check', 'data-command="edit"', 'primary')}`,
      );
    const tools = `<div class="tools">${iconButton(t('Aprender botones'), 'mdi:access-point', 'data-command="learn"')}${iconButton(t('Probar botones'), 'mdi:play-circle-outline', 'data-command="test"')}${iconButton(t('Diseñar'), 'mdi:pencil-ruler', 'data-command="edit"')}${iconButton(t('En Home Assistant'), 'mdi:home-assistant', 'data-view="entities"')}${iconButton(t('Emisor y ajustes'), 'mdi:tune', 'data-view="settings"')}<span class="grow"></span>${iconButton(t('Eliminar control'), 'mdi:trash-can-outline', 'data-command="delete-remote"', 'danger')}</div>`;
    const buttons = remote.buttons.length
      ? `<div class="list">${remote.buttons
          .map(
            button =>
              `<div class="li btn-row" data-button="${e(button.id)}">${iconPicker(button.icon ?? '', t('Icono de {name}', { name: rfText(button.name) }), 'name="button-icon" clearable')}<span class="t"><input class="name-in" name="button-name" maxlength="80" value="${e(rfText(button.name))}" aria-label="${e(t('Nombre de {name}', { name: button.name }))}">${miniWave(button.fingerprint || button.id)}</span><span class="acts">${iconButton(t('Enviar {name}', { name: rfText(button.name) }), 'mdi:play', `data-press="${e(button.id)}"`, 'send')}${iconButton(t('Ficha técnica de {name}', { name: rfText(button.name) }), 'mdi:waveform', `data-signal="${e(button.id)}"`)}${iconButton(t('Eliminar {name}', { name: rfText(button.name) }), 'mdi:close', `data-delete-button="${e(button.id)}"`)}</span></div>`,
          )
          .join('')}</div>`
      : `<p class="muted">${e(t('Todavía no hay botones.'))}</p>`;
    return this.panel(
      panelHead(`${icon(about.icon ?? 'mdi:remote')}<span>${e(rfText(about.name))}</span>${sourceTag('rf')}`, {
        back: t('Volver'),
        close: t('Cerrar'),
      }),
      `<div class="rprev" data-slot="remote"></div>${tools}${panelLabel(t('Botones'))}${buttons}${status}`,
    );
  }

  private entities(remoteId: string): string[] {
    return Object.entries(this._hass?.states ?? {})
      .filter(([, state]) => state.attributes?.homemanager_remote === remoteId)
      .map(([entityId]) => entityId);
  }

  private buttonOptions(remote: RfRemote, selected: string | undefined, empty: string): string {
    return `<option value="">${e(empty)}</option>${remote.buttons
      .map(
        button =>
          `<option value="${e(button.id)}"${button.id === selected ? ' selected' : ''}>${e(rfText(button.name))}</option>`,
      )
      .join('')}`;
  }

  /** Test (0.13): every button sends; the person says whether the appliance reacted.
   * When it did not, the transmission is adjusted one step at a time and sent again.
   * Checking that the signal left (echo, a second receiver, a camera) is optional. */
  private renderTest(remote: RfRemote, status: string): string {
    const rows = remote.buttons
      .map(button => {
        const trial = this.trials.get(button.id);
        const name = rfText(button.name);
        const said =
          trial === 'ok'
            ? t('Funcionó')
            : trial === 'no'
              ? t('No reaccionó')
              : trial === 'sent'
                ? t('Enviado · ¿reaccionó?')
                : t('Sin probar');
        const answer =
          trial === 'sent'
            ? iconButton(t('Sí, reaccionó'), 'mdi:thumb-up-outline', `data-trial-ok="${e(button.id)}"`) +
              iconButton(t('No reaccionó'), 'mdi:thumb-down-outline', `data-trial-no="${e(button.id)}"`)
            : trial === 'ok'
              ? `<span class="ok-mark" title="${e(t('Funcionó'))}">${icon('mdi:check-circle')}</span>`
              : '';
        const tune =
          trial === 'no'
            ? `<div class="tune">${icon('mdi:tune')}<span class="pill">${iconButton(t('Pulso más corto'), 'mdi:minus', 'data-tune="pulse:-1"')}<b>${remote.pulse_us} µs</b>${iconButton(t('Pulso más largo'), 'mdi:plus', 'data-tune="pulse:1"')}</span><span class="pill">${iconButton(t('Menos repeticiones'), 'mdi:minus', 'data-tune="repeats:-1"')}<b>${icon('mdi:repeat')}${remote.repeats}</b>${iconButton(t('Más repeticiones'), 'mdi:plus', 'data-tune="repeats:1"')}</span>${this.transmitters
                .map(
                  item =>
                    `<button type="button" class="chip" data-tune-transmitter="${e(item.id)}" aria-pressed="${item.id === remote.transmitter}">${icon('mdi:broadcast')}${e(rfText(item.name))}</button>`,
                )
                .join(
                  '',
                )}${iconButton(t('Probar otra vez'), 'mdi:play', `data-trial-send="${e(button.id)}"`, 'send')}</div>`
            : '';
        return `<div class="trow"><div class="li">${miniWave(button.fingerprint || button.id)}<span class="t"><b>${e(name)}</b><span>${e(said)}</span></span>${iconButton(t('Enviar {name}', { name }), 'mdi:play', `data-trial-send="${e(button.id)}"`, `send${trial === 'sent' ? ' pulse' : ''}`)}${answer}</div>${tune}</div>`;
      })
      .join('');
    const checks: [SignalTab, string, string, string][] = [
      ['emission', 'mdi:sine-wave', t('Auto-eco'), t('El mismo equipo escucha lo que envía')],
      ['emission', 'mdi:access-point-network', t('Receptor B'), t('Otro equipo escucha')],
      ['tests', 'mdi:camera-outline', t('Cámara'), t('Ver el destello del LED')],
    ];
    const check = checks
      .map(
        ([tab, glyph, label, tip]) =>
          `<button type="button" class="check" data-check="${tab}" title="${e(tip)}"${remote.buttons.length ? '' : ' disabled'}>${icon(glyph)}<b>${e(label)}</b></button>`,
      )
      .join('');
    return this.panel(
      panelHead(`${e(t('Probar'))} · ${e(rfText(remote.name))}`, { back: t('Volver'), close: t('Cerrar') }),
      `${this.wizard ? this.stepper(2) : ''}<div class="list">${rows}</div>${panelLabel(t('Comprobar (opcional)'))}<div class="checks">${check}</div>${status}`,
      `${iconButton(t('Guardar sin diseñar'), 'mdi:content-save-outline', 'data-command="finish"')}<span class="grow"></span><button type="button" class="next" data-command="edit">${icon('mdi:pencil-ruler')}${e(t('Diseñar'))}</button>`,
    );
  }

  /** What Home Assistant gets: a fan or a light whose roles name the buttons. */
  private renderEntities(remote: RfRemote, status: string): string {
    const parts = remote.parts.map(part => this.renderPart(remote, part)).join('');
    const entities = this.entities(remote.id);
    const linked = entities.length
      ? `<div class="chips">${entities.map(id => `<span class="chip">${icon('mdi:link-variant')}${e(rfText(this._hass?.states[id]?.attributes.friendly_name, t('Dispositivo')))}</span>`).join('')}</div>`
      : '';
    return this.panel(
      panelHead(e(t('En Home Assistant')), { back: t('Volver'), close: t('Cerrar') }),
      `${parts}<div class="chips">${iconButton(t('Agregar ventilador'), 'mdi:fan-plus', 'data-add-part="fan"')}${iconButton(t('Agregar luz'), 'mdi:lightbulb-on-outline', 'data-add-part="light"')}</div>${linked}${status}`,
    );
  }

  /** Name, icon and how it transmits. */
  private renderSettings(remote: RfRemote, status: string): string {
    const transmitters = this.transmitters
      .map(
        item =>
          `<option value="${e(item.id)}"${item.id === remote.transmitter ? ' selected' : ''}>${e(rfText(item.name))}</option>`,
      )
      .join('');
    const measured =
      remote.measured_pulse_us === null
        ? t('No hay una medición guardada.')
        : remote.measured_pulse_us === remote.pulse_us
          ? t('Medido de la señal: {pulse} µs.', { pulse: remote.measured_pulse_us })
          : t('Medido de la señal: {measured} µs; ahora usa {pulse} µs.', {
              measured: remote.measured_pulse_us,
              pulse: remote.pulse_us,
            });
    const about = `<input class="title-in" name="remote-name" maxlength="80" value="${e(rfText(remote.name))}" aria-label="${e(t('Nombre'))}">${panelField(t('Descripción (opcional)'), `<input name="remote-description" maxlength="200" value="${e(rfText(remote.description))}">`)}${this.iconPicker('remote', remote.icon)}`;
    const form = `<form class="settings">${panelLabel(t('Emisión'))}<p class="muted">${e(t('Tipo {protocol} · tamaño {bits}.', { protocol: remote.protocol, bits: remote.nbits }))}</p>${panelField(t('Transmisor'), `<select name="transmitter">${transmitters}</select>`)}${panelField(t('Pulso (µs)'), `<input name="pulse_us" type="number" min="50" max="2000" value="${remote.pulse_us}">`, measured)}${panelField(t('Repeticiones'), `<input name="repeats" type="number" min="1" max="20" value="${remote.repeats}">`)}${panelField(t('Pausa entre señales (µs)'), `<input name="wait_us" type="number" min="0" max="100000" value="${remote.wait_us}">`)}<div class="form-foot"><span class="grow"></span>${iconButton(t('Guardar ajustes'), 'mdi:check', 'type="submit"', 'primary').replace('type="button" ', '')}</div></form>`;
    return this.panel(
      panelHead(e(t('Emisor y ajustes')), { back: t('Volver'), close: t('Cerrar') }),
      `${about}${form}${status}`,
    );
  }

  private renderPart(remote: RfRemote, part: RfPart): string {
    const highest = Object.keys(part.roles).reduce(
      (max, role) => Math.max(max, Number(/^speed_(\d+)$/.exec(role)?.[1] ?? 0)),
      0,
    );
    const roles = ROLES[part.kind].filter(role => {
      const level = Number(/^speed_(\d+)$/.exec(role)?.[1] ?? 0);
      return !level || level <= Math.min(12, Math.max(3, highest + 1));
    });
    const selects = roles
      .map(
        role =>
          `<label>${e(roleLabel(role))}<select data-role="${e(role)}" aria-label="${e(roleLabel(role))}">${this.buttonOptions(remote, part.roles[role], '—')}</select></label>`,
      )
      .join('');
    const speeds =
      part.kind === 'fan'
        ? `<label>${e(t('Velocidades (si sólo tiene más/menos)'))}<select name="part-speeds"><option value="">—</option>${Array.from(
            { length: 12 },
            (_, index) =>
              `<option value="${index + 1}"${part.speeds === index + 1 ? ' selected' : ''}>${index + 1}</option>`,
          ).join('')}</select></label>`
        : '';
    return `<div class="part" data-part="${e(part.id)}" data-kind="${part.kind}"><div class="row"><span class="badge">${e(kindLabel(part.kind))}</span><input name="part-name" maxlength="80" value="${e(rfText(part.name))}" aria-label="${e(t('Nombre en Home Assistant'))}">${iconButton(t('Quitar {name}', { name: part.name }), 'mdi:close', `data-remove-part="${e(part.id)}"`, 'danger')}</div><div class="roles">${selects}${speeds}</div></div>`;
  }

  private bind(): void {
    const root = this.root;
    const remote = this.remote();
    root
      .querySelectorAll<HTMLButtonElement>('[data-command]')
      .forEach(button => button.addEventListener('click', () => void this.command(button.dataset.command!)));
    root
      .querySelectorAll<HTMLButtonElement>('[data-view]')
      .forEach(button => button.addEventListener('click', () => this.show(button.dataset.view as View)));
    root
      .querySelectorAll<HTMLButtonElement>('[data-open]')
      .forEach(button => button.addEventListener('click', () => this.open(button.dataset.open!)));
    root
      .querySelectorAll<HTMLButtonElement>('[data-open-ir]')
      .forEach(button => button.addEventListener('click', () => this.openIrRemote(button.dataset.openIr!)));
    root.querySelectorAll<HTMLButtonElement>('[data-design]').forEach(button =>
      button.addEventListener('click', () => {
        this.open(button.dataset.design!);
        void this.command('edit');
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-learn-more]').forEach(button =>
      button.addEventListener('click', () => {
        this.open(button.dataset.learnMore!);
        void this.command('learn');
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-signal]').forEach(button =>
      button.addEventListener('click', () => {
        if (remote && this._hass)
          openSignal(this._hass, { source: 'rf', remote_id: remote.id, button_id: button.dataset.signal! });
      }),
    );
    root.querySelectorAll<HTMLInputElement>('[data-rf-icon]').forEach(picker =>
      picker.addEventListener('change', () => {
        if (picker.dataset.rfIcon === 'new') this.newRemote.icon = picker.value || null;
        else void this.saveAbout({ icon: picker.value || null });
      }),
    );
    if (this.view === 'new') this.bindNew();
    if (this.view === 'test' && remote) this.bindTest(remote);
    if (remote && (this.view === 'remote' || this.view === 'entities' || this.view === 'settings')) {
      this.remoteView.readValues = () => this._hass?.states ?? {};
      this.remoteView.history = (entity, period, attribute) => historyPoints(this._hass, entity, period, attribute);
      this.designer.configure({
        key: remote.id,
        remote,
        name: remote.name,
        estimated: true,
        pinTo: pieceId =>
          this.dispatchEvent(
            new CustomEvent('homemanager-shell-command', {
              detail: { command: 'pin', remoteId: remote.id, pieceId },
              bubbles: true,
              composed: true,
            }),
          ),
        // 0.13: the same remote for another fan or light, on this or another transmitter.
        duplicate: {
          emitters: this.transmitters.map(item => ({ id: item.id, name: item.name })),
          current: remote.transmitter,
          run: async (name, transmitter) => {
            const copy = await rf.duplicateRemote(this._hass!, remote.id, name, transmitter);
            this.remotes = [...this.remotes, copy];
            this.open(copy.id);
          },
        },
        readValues: () => this._hass?.states ?? {},
        history: (entity, period, attribute) => historyPoints(this._hass, entity, period, attribute),
        save: async layout => {
          const saved = await rf.saveLayout(this._hass!, remote.id, layout);
          this.remotes = this.remotes.map(r => (r.id === saved.id ? saved : r));
          this.render();
        },
        press: buttonId => rf.press(this._hass!, remote.id, buttonId),
        learn: () => {
          this.editing = false;
          this.startLearn();
          this.render();
        },
      });
      this.remoteView.remote = remote;
      this.remoteView.editing = this.editing;
      this.bindEditSections(remote);
    }
    if (this.view === 'devices') this.devices.hass = this._hass!;
    if (this.view === 'ir') this.infrared.hass = this._hass;
  }

  private bindTest(remote: RfRemote): void {
    const root = this.root;
    const last = () => [...this.trials.keys()].at(-1) ?? remote.buttons[0]?.id;
    root.querySelectorAll<HTMLButtonElement>('[data-trial-send]').forEach(button =>
      button.addEventListener(
        'click',
        () =>
          void this.run(async () => {
            const id = button.dataset.trialSend!;
            await rf.press(this._hass!, remote.id, id);
            this.trials.delete(id);
            this.trials.set(id, 'sent');
          }),
      ),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-trial-ok],[data-trial-no]').forEach(button =>
      button.addEventListener('click', () => {
        const id = button.dataset.trialOk ?? button.dataset.trialNo!;
        this.trials.set(id, button.dataset.trialOk ? 'ok' : 'no');
        this.render();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-tune]').forEach(button =>
      button.addEventListener('click', () => {
        const [field, step] = button.dataset.tune!.split(':');
        const pulse = Math.min(2000, Math.max(50, remote.pulse_us + (field === 'pulse' ? Number(step) * 25 : 0)));
        const repeats = Math.min(20, Math.max(1, remote.repeats + (field === 'repeats' ? Number(step) : 0)));
        void this.tune(remote, { pulse_us: pulse, repeats });
      }),
    );
    root
      .querySelectorAll<HTMLButtonElement>('[data-tune-transmitter]')
      .forEach(button =>
        button.addEventListener(
          'click',
          () => void this.tune(remote, { transmitter: button.dataset.tuneTransmitter! }),
        ),
      );
    root.querySelectorAll<HTMLButtonElement>('[data-check]').forEach(button =>
      button.addEventListener('click', () => {
        const id = last();
        if (id && this._hass)
          openSignal(
            this._hass,
            { source: 'rf', remote_id: remote.id, button_id: id },
            button.dataset.check as SignalTab,
          );
      }),
    );
  }

  /** One transmission setting at a time; the next send uses it. */
  private async tune(
    remote: RfRemote,
    change: Partial<Pick<RfRemote, 'pulse_us' | 'repeats' | 'transmitter'>>,
  ): Promise<void> {
    await this.run(async () => {
      await rf.saveRemote(
        this._hass!,
        {
          name: remote.name,
          transmitter: change.transmitter ?? remote.transmitter,
          pulse_us: change.pulse_us ?? remote.pulse_us,
          repeats: change.repeats ?? remote.repeats,
          wait_us: remote.wait_us,
        },
        remote.id,
      );
      await this.reload();
      this.say(t('Ajustes guardados. Probá un botón.'));
    });
  }

  private bindNew(): void {
    const root = this.root;
    const refresh = () => {
      const create = root.querySelector<HTMLButtonElement>('[data-command=create]');
      if (create) create.disabled = this.newSource === 'rf' && !this.receiver();
    };
    root.querySelector<HTMLInputElement>('input[name=new-name]')?.addEventListener('input', event => {
      this.newRemote.name = (event.target as HTMLInputElement).value;
      refresh();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button =>
      button.addEventListener('click', () => {
        this.newRemote.icon = button.dataset.kind!;
        root
          .querySelectorAll<HTMLButtonElement>('[data-kind]')
          .forEach(other => other.setAttribute('aria-pressed', String(other === button)));
        root.querySelector<HTMLInputElement>('input[name=new-name]')?.setAttribute('placeholder', this.newName());
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-source]').forEach(button =>
      button.addEventListener('click', () => {
        this.newSource = button.dataset.source as Source;
        this.render();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-receiver]').forEach(button =>
      button.addEventListener('click', () => {
        this.newReceiver = button.dataset.receiver!;
        root
          .querySelectorAll<HTMLButtonElement>('[data-receiver]')
          .forEach(other => other.setAttribute('aria-pressed', String(other === button)));
        refresh();
      }),
    );
  }

  private bindEditSections(remote: RfRemote): void {
    const root = this.root;
    root
      .querySelector<HTMLInputElement>('input[name=remote-name]')
      ?.addEventListener('change', event => void this.saveAbout({ name: (event.target as HTMLInputElement).value }));
    root
      .querySelector<HTMLInputElement>('input[name=remote-description]')
      ?.addEventListener(
        'change',
        event => void this.saveAbout({ description: (event.target as HTMLInputElement).value || null }),
      );
    root.querySelectorAll<HTMLElement>('.btn-row').forEach(row => {
      const save = () =>
        void this.run(async () => {
          const button = remote.buttons.find(item => item.id === row.dataset.button);
          const name = rfEditedText(
            row.querySelector<HTMLInputElement>('[name=button-name]')!.value.trim(),
            button?.name,
          );
          const glyph = row.querySelector<HTMLInputElement>('[name=button-icon]')?.value || null;
          if (!name) return;
          await rf.saveButton(this._hass!, remote.id, { name, icon: glyph }, { buttonId: row.dataset.button });
          await this.reload();
          this.say(t('Cambios guardados.'));
        });
      row.querySelector('[name=button-name]')?.addEventListener('change', save);
      row.querySelector('[name=button-icon]')?.addEventListener('change', save);
    });
    root.querySelectorAll<HTMLButtonElement>('[data-press]').forEach(button =>
      button.addEventListener(
        'click',
        () =>
          void this.run(async () => {
            await rf.press(this._hass!, remote.id, button.dataset.press!);
            this.say(t('Señal enviada. Mirá el equipo.'));
          }),
      ),
    );
    root
      .querySelectorAll<HTMLButtonElement>('[data-delete-button]')
      .forEach(button => button.addEventListener('click', () => void this.deleteButton(button.dataset.deleteButton!)));
    root.querySelectorAll<HTMLElement>('.part').forEach(element => {
      element
        .querySelectorAll('select, input')
        .forEach(field => field.addEventListener('change', () => void this.saveParts()));
    });
    root
      .querySelectorAll<HTMLButtonElement>('[data-add-part]')
      .forEach(button => button.addEventListener('click', () => void this.addPart(button.dataset.addPart as PartKind)));
    root
      .querySelectorAll<HTMLButtonElement>('[data-remove-part]')
      .forEach(button => button.addEventListener('click', () => void this.removePart(button.dataset.removePart!)));
    root.querySelector<HTMLFormElement>('form.settings')?.addEventListener('submit', event => {
      event.preventDefault();
      void this.saveSettings(new FormData(event.target as HTMLFormElement));
    });
  }

  private show(view: View): void {
    if (view !== 'learn' && view !== 'remote') this.closeLearn(false);
    if (view !== 'devices') this.devices.stop();
    if (view !== 'ir') this.infrared.stopCapture();
    this.view = view;
    this.editing = false;
    this.say('');
    this.render();
  }

  /** Opens one remote's page, for example from a symbol that uses it (#73). */
  openRemote(remoteId: string): void {
    this.open(remoteId);
  }
  private open(remoteId: string): void {
    if (this.selected !== remoteId) this.closeLearn(false);
    this.selected = remoteId;
    this.draft = null;
    this.show('remote');
  }

  private async run(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.report(error);
    }
    this.render();
  }

  /** ✕ goes back to the plan; ← one level up. */
  private leave(to: 'plan' | 'settings' = 'plan'): void {
    this.learn.stop();
    this.infrared.stopCapture();
    this.fromSettings = false;
    this.dispatchEvent(
      new CustomEvent('homemanager-shell-command', { detail: { command: to }, bubbles: true, composed: true }),
    );
  }
  /** Opened from the ⚙ menu: the list has ← back to it (0.13 notebook). */
  set fromSettings(value: boolean) {
    if (this._fromSettings === value) return;
    this._fromSettings = value;
    if (this.view === 'list') this.render();
  }
  get fromSettings(): boolean {
    return this._fromSettings;
  }
  private _fromSettings = false;

  private async command(name: string): Promise<void> {
    const hass = this._hass;
    if (!hass) return;
    if (name === 'close') return this.leave();
    if (name === 'back' && this.view === 'list') return this.leave('settings');
    if (name === 'back') {
      if (this.view === 'remote' && this.editing) return void this.command('edit');
      if (this.view === 'learn' && this.remote()) {
        // Back keeps the capture and the typed name: Learn picks up where it was.
        this.learn.stop();
        this.learning = false;
        this.learnSuspended = true;
        this.view = 'remote';
        this.say('');
        return this.render();
      }
      if ((this.view === 'entities' || this.view === 'settings' || this.view === 'test') && this.remote())
        return this.show('remote');
      return void this.command('list');
    }
    await this.run(async () => {
      switch (name) {
        case 'new':
          this.newRemote = { name: '', icon: 'mdi:air-conditioner', description: null };
          this.newSource = this.transmitters.length ? 'rf' : 'ir';
          this.newReceiver = '';
          this.show('new');
          break;
        case 'list':
          this.wizard = false;
          this.closeLearn(false);
          this.draft = null;
          this.selected = null;
          await this.reload();
          this.show('list');
          break;
        case 'create': {
          const name = this.newRemote.name.trim() || this.newName();
          if (this.newSource === 'ir') {
            this.irTitle = `${t('Aprender')} · ${name}`;
            this.show('ir');
            this.infrared.startNew(name, this.irReceiver());
            break;
          }
          this.draft = {
            name,
            icon: this.newRemote.icon,
            description: this.newRemote.description?.trim() || null,
          };
          this.selected = null;
          this.wizard = true;
          this.startLearn();
          break;
        }
        case 'learn':
          this.editing = false;
          this.startLearn();
          break;
        case 'test':
          this.trials = new Map();
          this.show('test');
          break;
        case 'finish':
          this.wizard = false;
          this.show('remote');
          break;
        case 'edit':
          if (this.view === 'test') {
            this.wizard = false;
            this.view = 'remote';
          }
          this.editing = !this.editing;
          if (this.editing) this.closeLearn(false);
          this.say('');
          break;
        case 'delete-remote': {
          const remote = this.remote()!;
          const ok = await confirmDialog(this.root, {
            title: t('¿Eliminar «{name}»?', { name: rfText(remote.name) }),
            message: t('Se borran sus botones y sus entidades de Home Assistant. El equipo físico no cambia.'),
            confirm: t('Eliminar'),
          });
          if (!ok) break;
          await rf.deleteRemote(hass, remote.id);
          this.selected = null;
          await this.reload();
          this.show('list');
          this.say(t('Control eliminado.'));
          break;
        }
      }
    });
  }

  // Learning ------------------------------------------------------------

  /** Learning is a page of the panel (0.13). A saved remote waits for the person to
   * name the button they will press (guided); a new one starts listening at once. */
  private startLearn(): void {
    const learn = this.learn;
    this.view = 'learn';
    this.say('');
    if (this.learnSuspended && this.learnOwner === this.selected) {
      this.learnSuspended = false;
      this.learning = true;
      learn.resume();
      return;
    }
    learn.hass = this._hass;
    this.learnOwner = this.selected;
    learn.inline = true;
    learn.transmitters = this.transmitters;
    learn.remote = this.remote() ?? null;
    learn.draft = learn.remote ? null : this.draft;
    this.learning = true;
    if (learn.remote) learn.prepare(this.receiver());
    else learn.start(this.receiver());
  }

  private closeLearn(render = true): void {
    if (!this.learning && !this.learnSuspended) return;
    this.learnSuspended = false;
    this.learn.stop();
    this.learning = false;
    if (this.draft && !this.remote()) {
      // Nothing was learned: the draft is not kept.
      this.draft = null;
      this.view = 'list';
      this.say(t('No se guardó: el control necesita al menos un botón.'));
    } else if (this.view === 'learn') {
      this.view = this.remote() ? (this.wizard ? 'test' : 'remote') : 'list';
      this.trials = new Map();
    }
    if (render) this.render();
  }

  private async learned(remoteId: string): Promise<void> {
    await this.run(async () => {
      await this.reload();
      this.selected = remoteId;
      this.draft = null;
      this.learn.remote = this.remote() ?? null;
      this.say('');
    });
  }

  // Saving --------------------------------------------------------------

  private async saveAbout(change: Partial<RfAbout>): Promise<void> {
    const remote = this.remote();
    if (!remote) return;
    await this.run(async () => {
      const name = (change.name ?? remote.name).trim();
      if (!name) return;
      await rf.saveRemote(
        this._hass!,
        {
          name,
          icon: change.icon ?? remote.icon,
          description: 'description' in change ? change.description : remote.description,
        },
        remote.id,
      );
      await this.reload();
      this.say(t('Cambios guardados.'));
    });
  }

  private async saveSettings(data: FormData): Promise<void> {
    const remote = this.remote()!;
    await this.run(async () => {
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
    });
  }

  private async deleteButton(buttonId: string): Promise<void> {
    const remote = this.remote()!;
    const button = remote.buttons.find(item => item.id === buttonId);
    const ok = await confirmDialog(this.root, {
      title: t('¿Eliminar «{name}»?', { name: rfText(button?.name, t('Botón')) }),
      message: t('Se olvida el código. Si lo necesitás, lo podés aprender de nuevo.'),
      confirm: t('Eliminar'),
    });
    if (!ok) return;
    await this.run(async () => {
      await rf.deleteButton(this._hass!, remote.id, buttonId);
      await this.reload();
      this.say(t('Botón eliminado.'));
    });
  }

  /** Reads the parts as they are on screen, with optional changes. */
  private partsOnScreen(): (Omit<RfPart, 'id'> & { id?: string })[] {
    return [...this.root.querySelectorAll<HTMLElement>('.part')].map(element => {
      const roles: Record<string, string> = {};
      element.querySelectorAll<HTMLSelectElement>('[data-role]').forEach(select => {
        if (select.value) roles[select.dataset.role!] = select.value;
      });
      const speeds = element.querySelector<HTMLSelectElement>('[name=part-speeds]')?.value;
      return {
        id: element.dataset.part!,
        name:
          rfEditedText(
            element.querySelector<HTMLInputElement>('[name=part-name]')!.value.trim(),
            this.remote()?.parts.find(part => part.id === element.dataset.part)?.name,
          ) || kindLabel(element.dataset.kind as PartKind),
        kind: element.dataset.kind as PartKind,
        speeds: speeds ? Number(speeds) : null,
        roles,
      };
    });
  }

  private async saveParts(parts = this.partsOnScreen()): Promise<void> {
    const remote = this.remote();
    if (!remote) return;
    await this.run(async () => {
      await rf.saveParts(this._hass!, remote.id, parts);
      await this.reload();
      this.say(t('Cambios guardados.'));
    });
  }

  private async addPart(kind: PartKind): Promise<void> {
    await this.saveParts([...this.partsOnScreen(), { name: kindLabel(kind), kind, speeds: null, roles: {} }]);
  }

  private async removePart(partId: string): Promise<void> {
    const parts = this.partsOnScreen();
    const part = parts.find(item => item.id === partId);
    const ok = await confirmDialog(this.root, {
      title: t('¿Quitar «{name}» de Home Assistant?', { name: rfText(part?.name, t('Dispositivo')) }),
      message: t('Se borra esa entidad. Los botones no se borran.'),
      confirm: t('Quitar'),
    });
    if (ok) await this.saveParts(parts.filter(item => item.id !== partId));
  }
}

if (!customElements.get('homemanager-rf')) customElements.define('homemanager-rf', HomeManagerRf);
