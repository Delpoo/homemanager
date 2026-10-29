import { HomeManagerEditor, type ConfigurationStore } from '../editor/index.js';
import { getLanguage, languageFromHass, setLanguage, t } from '../i18n/index.js';
import { IntegrationConfigurationStore, integrationAvailable } from '../integration/store.js';
import { openPanel } from '../panels/native-panel.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { ControlView } from '../ui/control-view.js';
import { fab } from '../ui/fab.js';
import { iconButton } from '../ui/icon-button.js';
import { emptyConfiguration, validateCardConfig } from './configuration.js';
import { tapControl } from './device-controls.js';
import { type Camera, type ViewBox } from './geometry.js';
import { styles } from './styles.js';
import {
  clone,
  escapeHTML as e,
  type CardConfig,
  type Configuration,
  type Hass,
  type RoomId,
  type RuntimeState,
} from './types.js';

import { iconButtonMarkup, layerItems, renderLayers } from '../shell/layers.js';
import { renderRoomRail } from '../shell/room-rail.js';
import { bindTopBar, renderTopBar, updateTopBar, type AppShellContext } from '../shell/top-bar.js';
import { layer, same, type Adapter } from './card-helpers.js';
import * as commands from './commands.js';
import * as editing from './editing.js';
import * as gestures from './gestures.js';
import * as planView from './plan-view.js';
import * as session from './session.js';
export class HomeManagerCard extends HTMLElement {
  /** Internal controller state is shared by the typed card responsibilities. */
  shellContext?: AppShellContext;
  shellUnsubscribe?: () => void;
  setShellContext(context: AppShellContext): void {
    this.shellContext = context;
    this.updateShell();
  }
  updateShell(): void {
    updateTopBar(this.root, {
      title:
        this.shellContext?.homes.find(home => home.home_id === this.shellContext?.selected)?.title ??
        this.config?.title ??
        t('HomeManager'),
      admin: this._hass?.user?.is_admin === true,
      app: this.shellContext,
    });
  }
  config?: CardConfig;
  draft?: Configuration;
  saved?: Configuration;
  _hass?: Hass;
  adapter?: Adapter;
  unsubscribe?: () => void;
  runtime: RuntimeState = { schemaVersion: 1, states: {} };
  editor?: HomeManagerEditor;
  editorFocus?: HTMLElement;
  store?: ConfigurationStore;
  // Integration storage (card config with home_id): loaded over the websocket.
  home?: IntegrationConfigurationStore;
  homeState: 'idle' | 'loading' | 'ready' | 'missing' | 'error' = 'idle';
  homeUnsubscribe?: Promise<() => void>;
  editing = false;
  loading = false;
  saving = false;
  selected: string | null = null;
  fixedPermit: string | null = null;
  history: Configuration[] = [];
  future: Configuration[] = [];
  box: ViewBox = { x: 0, y: 0, width: 1000, height: 700 };
  camera: Camera = { x: 0, y: 0, scale: 1 };
  baseScale = 1;
  svg?: SVGSVGElement;
  currentRoom: RoomId | null = null;
  enabledLayers = new Set(['controls', 'sensors', 'energy']);
  pointers = new Map<number, { x: number; y: number }>();
  gesture?:
    | { kind: 'pan'; x: number; y: number; camera: Camera }
    | { kind: 'pinch'; distance: number; camera: Camera; center: { x: number; y: number } }
    | {
        kind: 'device';
        id: string;
        start: { x: number; y: number };
        position: { x: number; y: number };
        before: Configuration;
        moved: boolean;
      };
  observer?: ResizeObserver;
  frame = 0;
  generation = 0;
  panel?: ReturnType<typeof openPanel>;
  verifiedFeedbackEntities = new Set<string>();
  /** Device waiting for a tap on the plan to receive its position (edit mode). */
  placing: string | null = null;
  groupsKey = '';
  animation = 0;
  longPress?: { timer: ReturnType<typeof setTimeout>; id: string; x: number; y: number };
  /** The click that ends a long press (which already opened the panel). Only
   * that one: a later tap must never be swallowed if that click never came. */
  suppressClick: { id: string; until: number } | null = null;
  lastTap?: { time: number; x: number; y: number };
  language = '';
  readonly root = this.attachShadow({ mode: 'open' });
  static getConfigElement(): HTMLElement {
    return document.createElement('homemanager-editor');
  }
  static getStubConfig(hass?: Hass): CardConfig {
    if (integrationAvailable(hass))
      return { type: 'custom:homemanager-card', card_id: 'plano', home_id: 'home' } as CardConfig;
    return {
      type: 'custom:homemanager-card',
      card_id:
        typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      dashboard_mode: 'storage',
      configuration: emptyConfiguration(),
    };
  }
  getCardSize(): number {
    return 10;
  }
  getGridOptions() {
    return { columns: 24, rows: 12, min_columns: 6, min_rows: 6 };
  }
  getConfiguration(): Configuration {
    return clone(this.saved ?? emptyConfiguration());
  }
  getDraftConfiguration(): Configuration {
    return clone(this.draft ?? emptyConfiguration());
  }
  /** Integration/session evidence only. Never serialized or inferred from the configured feedback label. */
  setVerifiedFeedbackEntities(ids: Iterable<string>): void {
    this.verifiedFeedbackEntities = new Set(ids);
    if (this.saved) this.setupAdapter(this.saved);
  }
  // The adapter republishes (and thus refreshes markers) only when an entity this
  // plan reads changes; unrelated HA churn costs a fingerprint comparison.
  set hass(value: Hass) {
    this._hass = value;
    if (typeof value.themes?.darkMode === 'boolean') this.dataset.theme = value.themes.darkMode ? 'dark' : 'light';
    setLanguage(languageFromHass(value));
    if (this.language && this.language !== getLanguage() && this.config && !this.editing) {
      this.language = getLanguage();
      this.render();
    }
    this.language = getLanguage();
    this.adapter?.setHass(value);
    if (this.editor) this.editor.hass = value;
    if (!this.adapter) this.refreshState();
    this.updateControls();
    this.updateShell();
    if (this.home && this.homeState === 'idle' && this.isConnected) void this.loadHome();
  }
  get hass(): Hass | undefined {
    return this._hass;
  }
  setConfig(value: unknown): void {
    const next = validateCardConfig(value);
    if (next.home_id) {
      // Same home already loaded: keep it (HA calls setConfig on every dashboard refresh).
      if (this.home?.homeId === next.home_id && this.config?.home_id === next.home_id) {
        this.config = { ...next, configuration: this.config.configuration };
        return;
      }
      this.detachHome();
      this.generation++;
      this.home = new IntegrationConfigurationStore(() => this._hass, next.home_id);
      this.homeState = 'idle';
    } else {
      if (this.editing && this.dirty) {
        if (!same(next.configuration, this.saved))
          this.status(
            t('La configuración cambió fuera de esta edición. Tu borrador se conserva; exportalo antes de recargar.'),
          );
        return;
      }
      this.detachHome();
      this.generation++;
    }
    this.config = next;
    this.saved = clone(next.configuration);
    this.draft = clone(next.configuration);
    this.editing = false;
    this.history = [];
    this.future = [];
    this.selected = null;
    this.fixedPermit = null;
    this.setupAdapter(next.configuration);
    this.render();
    if (this.home) {
      this.status(t('Cargando el hogar desde Home Assistant…'));
      if (this._hass && this.isConnected) void this.loadHome();
    }
  }
  // Reconnected: the revision subscription was dropped, so re-read once (not while editing).
  connectedCallback() {
    if (this.root.childElementCount && !this.shellUnsubscribe) this.shellUnsubscribe = bindTopBar(this.root);
    if (this.home && this.homeState !== 'loading' && !this.editing) {
      this.homeState = 'idle';
      if (this._hass) void this.loadHome();
    }
    if (this.config) {
      if (!this.adapter) this.setupAdapter(this.saved!);
      if (!this.root.childElementCount) this.render();
      else {
        this.observer?.observe(this.viewport);
        this.queuePosition();
      }
    }
  }
  disconnectedCallback() {
    this.shellUnsubscribe?.();
    this.shellUnsubscribe = undefined;
    this.homeUnsubscribe?.then(unsubscribe => unsubscribe()).catch(() => {});
    this.homeUnsubscribe = undefined;
    this.generation++;
    this.observer?.disconnect();
    this.unsubscribe?.();
    this.adapter?.dispose();
    this.adapter = undefined;
    this.panel?.close();
    cancelAnimationFrame(this.frame);
    this.pointers.clear();
    this.gesture = undefined;
  }
  get dirty() {
    return !same(this.draft, this.saved);
  }
  detachHome: OmitThisParameter<typeof session.detachHome> = session.detachHome.bind(this);
  watchHome: OmitThisParameter<typeof session.watchHome> = session.watchHome.bind(this);
  /** Loads the home and keeps it current: other editors' saves arrive as revisions. */
  loadHome: OmitThisParameter<typeof session.loadHome> = session.loadHome.bind(this);
  onHomeRevision: OmitThisParameter<typeof session.onHomeRevision> = session.onHomeRevision.bind(this);
  setupAdapter: OmitThisParameter<typeof session.setupAdapter> = session.setupAdapter.bind(this);
  icon(command: string, label: string, symbol: string, extra = '') {
    return `<button class="icon" type="button" data-command="${command}" title="${e(label)}" aria-label="${e(label)}" ${extra}>${symbol}</button>`;
  }
  render() {
    if (!this.config || !this.draft) return;
    this.observer?.disconnect();
    this.panel?.close();
    this.shellUnsubscribe?.();
    const layers = layerItems().filter(({ id }) => this.draft!.catalog.devices.some(d => layer(d) === id));
    this.root.innerHTML = `<style>${styles}</style><section class="shell">${renderTopBar({ title: this.config.title ?? t('HomeManager'), admin: this._hass?.user?.is_admin === true, app: this.shellContext })}
      <div class="editor-wrap" hidden><div class="editbar">${iconButton('undo', t('Deshacer'), 'undo')}${iconButton('redo', t('Rehacer'), 'redo')}${iconButton('settings', t('Ajustes del plano'), 'settings')}<span class="space"></span>${iconButton('discard', t('Descartar cambios'), 'discard')}${iconButton('save', t('Guardar cambios'), 'save', 'data-dirty="false"')}${iconButton('exit', t('Salir de edición'), 'close')}</div></div>
      ${renderRoomRail([])}
      <div class="workspace"><div class="viewport" tabindex="0" role="group" aria-label="${e(t('Plano interactivo'))}"><div class="architecture"></div><div class="overlay"></div><div class="empty" hidden>${e(t('Agregá una arquitectura SVG desde el editor.'))}</div><div class="placing-hint" hidden></div>${renderLayers(layers, this.enabledLayers)}<div class="zoom">${iconButtonMarkup('in', t('Acercar'), 'mdi:plus')}${iconButtonMarkup('out', t('Alejar'), 'mdi:minus')}</div><div class="edit-add" hidden>${fab('add-device', t('Agregar dispositivo'))}</div></div><div class="editor" hidden></div></div><div class="selection" hidden></div><div class="status" role="status" aria-live="polite"></div></section>`;
    this.shellUnsubscribe = bindTopBar(this.root);
    this.groupsKey = '';
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('keydown', this.key as EventListener);
    const viewport = this.viewport;
    viewport.addEventListener('pointerdown', this.pointerDown);
    viewport.addEventListener('pointermove', this.pointerMove);
    viewport.addEventListener('pointerup', this.pointerUp);
    viewport.addEventListener('pointercancel', this.pointerCancel);
    viewport.addEventListener('wheel', this.wheel, { passive: false });
    viewport.addEventListener('contextmenu', this.contextMenu);
    this.mountArchitecture();
    this.renderMarkers();
    this.observer = new ResizeObserver(() => {
      if (!this.gesture) this.fit(this.currentRoom, false);
    });
    this.observer.observe(viewport);
    this.fit(null, false);
    this.updateControls();
  }
  get viewport() {
    return this.root.querySelector('.viewport') as HTMLDivElement;
  }
  mountArchitecture: OmitThisParameter<typeof planView.mountArchitecture> = planView.mountArchitecture.bind(this);
  fit: OmitThisParameter<typeof planView.fit> = planView.fit.bind(this);
  /** Eased camera transition; instant when the user prefers reduced motion. */
  moveCamera: OmitThisParameter<typeof planView.moveCamera> = planView.moveCamera.bind(this);
  /** Zooms just enough to separate a tapped group of markers, centred on it. */
  frameDevices: OmitThisParameter<typeof planView.frameDevices> = planView.frameDevices.bind(this);
  chooseDevice: OmitThisParameter<typeof planView.chooseDevice> = planView.chooseDevice.bind(this);
  renderMarkers: OmitThisParameter<typeof planView.renderMarkers> = planView.renderMarkers.bind(this);
  queuePosition: OmitThisParameter<typeof planView.queuePosition> = planView.queuePosition.bind(this);
  screen: OmitThisParameter<typeof planView.screen> = planView.screen.bind(this);
  positionMarkers: OmitThisParameter<typeof planView.positionMarkers> = planView.positionMarkers.bind(this);
  refreshState: OmitThisParameter<typeof planView.refreshState> = planView.refreshState.bind(this);
  onClick = (event: Event) => {
    const target = (event.target as Element).closest<HTMLElement>('button');
    if (!target) return;
    if (target.classList.contains('cluster')) {
      this.frameDevices(target.dataset.ids!.split(' '));
      return;
    }
    const marker = target.closest<HTMLElement>('.marker');
    if (marker) {
      const id = marker.dataset.id!;
      const held = this.suppressClick;
      if (held && held.id === id && Date.now() < held.until) {
        // The long press already opened the panel.
        this.suppressClick = null;
        return;
      }
      if (this.editing) {
        this.select(id);
        return;
      }
      if (target.closest('.pins')) return;
      const d = this.draft?.catalog.devices.find(item => item.id === id);
      if (!d) return;
      const tap = tapControl(d);
      if (!tap) this.showDetails(id, target);
      else void this.runStep(d, tap, this.tapStep(d, tap), target);
      return;
    }
    const room = target.dataset.room as RoomId | undefined;
    if (room) {
      this.fit(room);
      return;
    }
    const command = target.dataset.command;
    if (!command) return;
    if (command.startsWith('layer-')) {
      const id = command.slice(6);
      if (this.enabledLayers.has(id)) this.enabledLayers.delete(id);
      else this.enabledLayers.add(id);
      target.setAttribute('aria-pressed', String(this.enabledLayers.has(id)));
      this.renderMarkers();
      return;
    }
    switch (command) {
      case 'plan-settings':
        void (async () => {
          if (!this.editing) await this.toggleEdit();
          if (this.editing) this.editor?.openSettings();
        })();
        break;
      case 'add-device':
        this.editorFocus = target;
        this.editor?.openAdd();
        this.positionEditor();
        break;
      case 'settings':
        this.editorFocus = target;
        this.editor?.openSettings();
        break;
      case 'exit':
      case 'edit':
        void this.toggleEdit();
        break;
      case 'all':
        this.fit(null);
        break;
      case 'in':
        this.zoom(1.3);
        break;
      case 'out':
        this.zoom(1 / 1.3);
        break;
      case 'fullscreen':
        void (this.root.querySelector('.shell') as HTMLElement)
          .requestFullscreen?.()
          .catch(() => this.status(t('El navegador no permite pantalla completa.')));
        break;
      case 'info':
        this.info();
        break;
      case 'save-info':
        this.info(true);
        break;
      case 'save':
        void this.save();
        break;
      case 'discard':
        void confirmDialog(this.root, {
          title: t('¿Descartar los cambios?'),
          message: t('Se recupera la última versión guardada.'),
          confirm: t('Descartar cambios'),
          trigger: target,
        }).then(confirmed => {
          if (confirmed) this.discard();
        });
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'fixed':
        this.fixedPermit = this.selected;
        this.renderMarkers();
        this.status(t('Reubicación explícita habilitada para este dispositivo fijo durante esta edición.'));
        break;
    }
  };
  executeAction: OmitThisParameter<typeof commands.executeAction> = commands.executeAction.bind(this);
  /** Remembered steps of cycles, selectors and stepped sliders, per device and
   * control, in this browser (a cycle prefers the live state when it has one). */
  steps = new Map<string, number>();
  stepsLoaded = false;
  stepKey: OmitThisParameter<typeof commands.stepKey> = commands.stepKey.bind(this);
  remembered: OmitThisParameter<typeof commands.remembered> = commands.remembered.bind(this);
  remember: OmitThisParameter<typeof commands.remember> = commands.remember.bind(this);
  cycleCurrent: OmitThisParameter<typeof commands.cycleCurrent> = commands.cycleCurrent.bind(this);
  /** Step a tap sends: the next one of a cycle, the only one of a button. */
  tapStep: OmitThisParameter<typeof commands.tapStep> = commands.tapStep.bind(this);
  /** Sends one step of a device control through the adapter and says what was
   * sent next to the symbol. "Enviado" never claims the device changed. */
  runStep: OmitThisParameter<typeof commands.runStep> = commands.runStep.bind(this);
  notes = new Map<string, HTMLElement>();
  /** A short note above the symbol. For an RF action it later adds whether the
   * signal was heard on air by a receiver: evidence of emission, not of state. */
  sentNote: OmitThisParameter<typeof commands.sentNote> = commands.sentNote.bind(this);
  /** Compact views of the controls pinned next to each symbol. */
  pins = new Map<string, ControlView[]>();
  mountPins: OmitThisParameter<typeof commands.mountPins> = commands.mountPins.bind(this);
  controlHost: OmitThisParameter<typeof commands.controlHost> = commands.controlHost.bind(this);
  /** The RF remote to draw in a device's panel: chosen in the editor, or the
   * remote behind an RF entity of HomeManager. */
  remoteOf: OmitThisParameter<typeof commands.remoteOf> = commands.remoteOf.bind(this);
  showDetails: OmitThisParameter<typeof commands.showDetails> = commands.showDetails.bind(this);
  toggleEdit: OmitThisParameter<typeof editing.toggleEdit> = editing.toggleEdit.bind(this);
  mountEditor: OmitThisParameter<typeof editing.mountEditor> = editing.mountEditor.bind(this);
  select: OmitThisParameter<typeof editing.select> = editing.select.bind(this);
  frameAboveSheet: OmitThisParameter<typeof editing.frameAboveSheet> = editing.frameAboveSheet.bind(this);
  /** A sheet on phones, a clamped card beside the selected marker on desktop. */
  positionEditor: OmitThisParameter<typeof editing.positionEditor> = editing.positionEditor.bind(this);
  updateSelection: OmitThisParameter<typeof editing.updateSelection> = editing.updateSelection.bind(this);
  change: OmitThisParameter<typeof editing.change> = editing.change.bind(this);
  discard: OmitThisParameter<typeof editing.discard> = editing.discard.bind(this);
  undo: OmitThisParameter<typeof editing.undo> = editing.undo.bind(this);
  redo: OmitThisParameter<typeof editing.redo> = editing.redo.bind(this);
  syncDraft: OmitThisParameter<typeof editing.syncDraft> = editing.syncDraft.bind(this);
  save: OmitThisParameter<typeof editing.save> = editing.save.bind(this);
  updateControls: OmitThisParameter<typeof editing.updateControls> = editing.updateControls.bind(this);
  status: OmitThisParameter<typeof editing.status> = editing.status.bind(this);
  info: OmitThisParameter<typeof editing.info> = editing.info.bind(this);
  dialog: OmitThisParameter<typeof editing.dialog> = editing.dialog.bind(this);
  point: OmitThisParameter<typeof gestures.point> = gestures.point.bind(this);
  pointerDown: OmitThisParameter<typeof gestures.pointerDown> = gestures.pointerDown.bind(this);
  beginPinch: OmitThisParameter<typeof gestures.beginPinch> = gestures.beginPinch.bind(this);
  pointerMove: OmitThisParameter<typeof gestures.pointerMove> = gestures.pointerMove.bind(this);
  pointerUp: OmitThisParameter<typeof gestures.pointerUp> = gestures.pointerUp.bind(this);
  contextMenu: OmitThisParameter<typeof gestures.contextMenu> = gestures.contextMenu.bind(this);
  /** Edit mode: the next tap on the plan positions a newly added device. */
  startPlacing: OmitThisParameter<typeof gestures.startPlacing> = gestures.startPlacing.bind(this);
  stopPlacing: OmitThisParameter<typeof gestures.stopPlacing> = gestures.stopPlacing.bind(this);
  place: OmitThisParameter<typeof gestures.place> = gestures.place.bind(this);
  pointerCancel: OmitThisParameter<typeof gestures.pointerCancel> = gestures.pointerCancel.bind(this);
  wheel: OmitThisParameter<typeof gestures.wheel> = gestures.wheel.bind(this);
  zoom: OmitThisParameter<typeof gestures.zoom> = gestures.zoom.bind(this);
  key: OmitThisParameter<typeof gestures.key> = gestures.key.bind(this);
}
