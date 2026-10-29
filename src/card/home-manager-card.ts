import { t, setLanguage, languageFromHass, getLanguage } from '../i18n/index.js';
import { HomeAssistantAdapter } from '../ha/index.js';
import { HomeManagerEditor, LovelaceConfigurationStore, type ConfigurationStore } from '../editor/index.js';
import { openPanel, stateText, reasonText } from '../panels/native-panel.js';
import { isActiveValue } from '../panels/controls.js';
import { clusterPoints, boundsOf, interpolateCamera } from './markers.js';
import {
  describeError,
  IntegrationConfigurationStore,
  integrationAvailable,
  subscribeHome,
} from '../integration/store.js';
import { rf } from '../integration/rf.js';
import { validateCardConfig, validateConfiguration, emptyConfiguration } from './configuration.js';
import {
  sanitizeArchitecture,
  fitCamera,
  zoomCamera,
  roomBounds,
  roomAt,
  type Camera,
  type ViewBox,
} from './geometry.js';
import {
  clone,
  escapeHTML as e,
  type Configuration,
  type CardConfig,
  type Device,
  type Hass,
  type RuntimeState,
  type RoomId,
} from './types.js';
import { styles } from './styles.js';
import { iconButton } from '../ui/icon-button.js';
import { fab } from '../ui/fab.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { VERSION } from '../version.js';

const KIND_ICONS: Record<string, string> = {
  light: '☼',
  fan: '✣',
  curtain: '▥',
  ac: '❄',
  sensor: '◌',
  switch: '⏻',
  robot: '◉',
  purifier: '≋',
  plant: '♧',
  infra: '⚙',
  energy: 'ϟ',
};
const confidenceLabel = (confidence: string) =>
  (
    ({
      confirmed: t('Confirmado'),
      estimated: t('Estimado'),
      sent: t('Comando aceptado'),
      unknown: t('Desconocido'),
      error: t('Error'),
    }) as Record<string, string>
  )[confidence] ?? t('Desconocido');
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Screen distance under which two markers would overlap: they are grouped instead. */
// 44 px marker + its detail badge overhang (7 px) + a little air.
const GROUP_DISTANCE = 54;
const LONG_PRESS_MS = 480;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** The dashboard this card is shown in, from the URL, when it is a Lovelace panel.
 * An explicit dashboard_path still wins; undefined means the default dashboard. */
function currentDashboardPath(hass: Hass): string | undefined {
  const segment = location.pathname.split('/').filter(Boolean)[0];
  if (!segment || segment === 'lovelace') return undefined;
  const panel = hass.panels?.[segment];
  return panel &&
    (panel.component_name === undefined || panel.component_name === 'lovelace') &&
    /^[a-z0-9][a-z0-9_-]{0,239}$/.test(segment)
    ? segment
    : undefined;
}
const layer = (d: Device) =>
  d.kind === 'infra'
    ? 'infrastructure'
    : d.kind === 'energy'
      ? 'energy'
      : d.kind === 'sensor' || d.kind === 'plant'
        ? 'sensors'
        : 'controls';
interface Adapter {
  configure(c: Configuration): void;
  setHass(h: Hass | null): void;
  subscribe(fn: (s: RuntimeState) => void): () => void;
  getSnapshot(): RuntimeState;
  executeAction(id: string, deviceId?: string): Promise<unknown>;
  executePrimary(id: string): Promise<unknown>;
  getActionAvailability(id: string): { available: boolean; reason?: string };
  getEntityCommandAvailability(
    deviceId: string,
    command: { service: string; data?: Record<string, unknown> },
  ): { available: boolean; reason?: string };
  executeEntityCommand(
    deviceId: string,
    command: { service: string; data?: Record<string, unknown> },
  ): Promise<unknown>;
  dispose(): void;
}
export class HomeManagerCard extends HTMLElement {
  private config?: CardConfig;
  private draft?: Configuration;
  private saved?: Configuration;
  private _hass?: Hass;
  private adapter?: Adapter;
  private unsubscribe?: () => void;
  private runtime: RuntimeState = { schemaVersion: 1, states: {} };
  private editor?: HomeManagerEditor;
  private editorFocus?: HTMLElement;
  private store?: ConfigurationStore;
  // Integration storage (card config with home_id): loaded over the websocket.
  private home?: IntegrationConfigurationStore;
  private homeState: 'idle' | 'loading' | 'ready' | 'missing' | 'error' = 'idle';
  private homeUnsubscribe?: Promise<() => void>;
  private editing = false;
  private loading = false;
  private saving = false;
  private selected: string | null = null;
  private fixedPermit: string | null = null;
  private history: Configuration[] = [];
  private future: Configuration[] = [];
  private box: ViewBox = { x: 0, y: 0, width: 1000, height: 700 };
  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private baseScale = 1;
  private svg?: SVGSVGElement;
  private currentRoom: RoomId | null = null;
  private enabledLayers = new Set(['controls', 'sensors', 'infrastructure', 'energy']);
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture?:
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
  private observer?: ResizeObserver;
  private frame = 0;
  private generation = 0;
  private panel?: ReturnType<typeof openPanel>;
  private verifiedFeedbackEntities = new Set<string>();
  /** Device waiting for a tap on the plan to receive its position (edit mode). */
  private placing: string | null = null;
  private groupsKey = '';
  private animation = 0;
  private longPress?: { timer: ReturnType<typeof setTimeout>; id: string; x: number; y: number };
  private suppressClick: string | null = null;
  private lastTap?: { time: number; x: number; y: number };
  private language = '';
  private readonly root = this.attachShadow({ mode: 'open' });
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
  private get dirty() {
    return !same(this.draft, this.saved);
  }
  private detachHome() {
    this.homeUnsubscribe?.then(unsubscribe => unsubscribe()).catch(() => {});
    this.homeUnsubscribe = undefined;
    this.home = undefined;
    this.homeState = 'idle';
  }
  private watchHome(home: IntegrationConfigurationStore): void {
    if (!this._hass || home.revision === null) return;
    this.homeUnsubscribe = subscribeHome(
      this._hass,
      home.homeId,
      event => this.onHomeRevision(event.revision),
      error => {
        if (this.home !== home) return;
        this.homeUnsubscribe = undefined;
        this.status(describeError(error));
      },
    );
  }
  /** Loads the home and keeps it current: other editors' saves arrive as revisions. */
  private async loadHome() {
    const home = this.home;
    if (!home || !this._hass || this.homeState === 'loading') return;
    this.homeState = 'loading';
    const generation = this.generation;
    try {
      const configuration = await home.load();
      if (home !== this.home || generation !== this.generation) return;
      this.homeState = home.revision === null ? 'missing' : 'ready';
      if (!this.editing) {
        this.saved = clone(configuration);
        this.draft = clone(configuration);
        this.config!.configuration = clone(configuration);
        this.setupAdapter(configuration);
        this.render();
      }
      // Only replace our own loading/missing notices; never wipe e.g. "Guardado en Home Assistant".
      if (home.revision === null)
        this.status(
          this._hass?.user?.is_admin
            ? `El hogar «${home.homeId}» todavía no existe. Pulsá Editar plano para crearlo.`
            : `El hogar «${home.homeId}» todavía no existe. Pedile a un administrador que lo cree.`,
        );
      else if (/^Cargando el hogar|todavía no existe/.test(this.root.querySelector('.status')?.textContent ?? ''))
        this.status('');
      if (!this.homeUnsubscribe && this._hass && home.revision !== null) this.watchHome(home);
    } catch (error) {
      if (home === this.home) {
        this.homeState = 'error';
        this.status(error instanceof Error ? error.message : t('No se pudo cargar el hogar.'));
      }
    }
  }
  private onHomeRevision(revision: number | null) {
    // Our own save also produces an event; it may arrive before save() resolves.
    if (!this.home || this.saving || revision === this.home.revision) return;
    if (this.editing && this.dirty) {
      this.status(
        t('Otro editor guardó cambios en este hogar. Tu borrador se conserva; al guardar se detectará el conflicto.'),
      );
      return;
    }
    if (this.editing) {
      this.status(
        t('Otro editor guardó cambios: salí y volvé a entrar en edición para continuar sobre la versión nueva.'),
      );
      return;
    }
    this.homeState = 'idle';
    void this.loadHome();
  }
  private setupAdapter(configuration: Configuration) {
    this.unsubscribe?.();
    this.adapter?.dispose();
    this.adapter = undefined;
    this.runtime = { schemaVersion: 1, states: {} };
    try {
      const validated = validateConfiguration(configuration, { allowPending: true });
      this.adapter = new HomeAssistantAdapter({
        configuration: validated,
        verifiedFeedbackEntities: this.verifiedFeedbackEntities,
      }) as unknown as Adapter;
      this.unsubscribe = this.adapter.subscribe(s => {
        this.runtime = s;
        this.refreshState();
      });
      this.adapter.setHass(this._hass ?? null);
      this.runtime = this.adapter.getSnapshot();
    } catch {
      /* Pending references remain visible and disabled until completed in the editor. */
    }
  }
  private icon(command: string, label: string, symbol: string, extra = '') {
    return `<button class="icon" type="button" data-command="${command}" title="${e(label)}" aria-label="${e(label)}" ${extra}>${symbol}</button>`;
  }
  private render() {
    if (!this.config || !this.draft) return;
    this.observer?.disconnect();
    this.panel?.close();
    const layers = [
      ['controls', t('Controles'), '⏻'],
      ['sensors', t('Sensores'), '◌'],
      ['infrastructure', t('Infraestructura'), '⚙'],
      ['energy', t('Energía'), 'ϟ'],
    ].filter(([id]) => this.draft!.catalog.devices.some(d => layer(d) === id));
    this.root.innerHTML = `<style>${styles}</style><section class="shell"><header class="header"><span class="logo" aria-hidden="true">⌂</span><h1>${e(this.config.title ?? t('HomeManager'))}</h1>${this.icon('info', t('Información'), '?')}${this.icon('edit', t('Editar plano'), '✎', 'aria-pressed="false"')}${this.icon('fullscreen', t('Pantalla completa'), '⛶')}</header>
      <div class="editor-wrap" hidden><div class="editbar">${iconButton('undo', t('Deshacer'), 'undo')}${iconButton('redo', t('Rehacer'), 'redo')}${iconButton('settings', t('Ajustes del plano'), 'settings')}<span class="space"></span>${iconButton('discard', t('Descartar cambios'), 'discard')}${iconButton('save', t('Guardar cambios'), 'save', 'data-dirty="false"')}${iconButton('exit', t('Salir de edición'), 'close')}</div></div>
      <nav class="rooms" aria-label="${e(t('Espacios'))}"><button type="button" class="all" data-command="all" aria-label="${e(t('Encuadrar todo'))}" title="${e(t('Encuadrar todo'))}">${e(t('Todo'))}</button></nav>
      <div class="workspace"><div class="viewport" tabindex="0" role="group" aria-label="${e(t('Plano interactivo'))}"><div class="architecture"></div><div class="overlay"></div><div class="empty" hidden>${e(t('Agregá una arquitectura SVG desde el editor.'))}</div><div class="placing-hint" hidden></div><nav class="layers" aria-label="${e(t('Capas'))}">${layers.length > 1 ? layers.map(([id, label, icon]) => this.icon(`layer-${id}`, label, icon, `aria-pressed="${this.enabledLayers.has(id)}"`)).join('') : ''}</nav><div class="zoom">${this.icon('in', t('Acercar'), '+')}${this.icon('out', t('Alejar'), '−')}</div><div class="edit-add" hidden>${fab('add-device', t('Agregar dispositivo'))}</div></div><div class="editor" hidden></div></div><div class="selection" hidden></div><div class="status" role="status" aria-live="polite"></div></section>`;
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
  private get viewport() {
    return this.root.querySelector('.viewport') as HTMLDivElement;
  }
  private mountArchitecture() {
    if (!this.draft) return;
    const result = sanitizeArchitecture(this.draft.architecture.content);
    this.box = result.box;
    this.svg = result.svg;
    const host = this.root.querySelector('.architecture') as HTMLElement;
    host.style.left = `${this.box.x}px`;
    host.style.top = `${this.box.y}px`;
    host.style.width = `${this.box.width}px`;
    host.style.height = `${this.box.height}px`;
    const inner = document.createElement('div');
    inner.attachShadow({ mode: 'open' }).append(this.svg);
    host.replaceChildren(inner);
    this.svg.setAttribute('width', String(this.box.width));
    this.svg.setAttribute('height', String(this.box.height));
    const nav = this.root.querySelector('.rooms')!;
    nav.querySelectorAll('[data-room]').forEach(n => n.remove());
    const shown = this.draft.rooms.filter(
      room =>
        !!this.svg!.querySelector(`[id="room-${room.id}"]`) ||
        this.draft!.catalog.devices.some(d => d.roomId === room.id),
    );
    for (const room of shown) {
      const b = document.createElement('button');
      b.className = 'room';
      b.type = 'button';
      b.dataset.room = room.id;
      b.title = t('Encuadrar {label}', { label: room.label });
      b.setAttribute('aria-label', t('Encuadrar {label}', { label: room.label }));
      b.textContent = room.label;
      nav.append(b);
    }
    (this.root.querySelector('.empty') as HTMLElement).hidden = this.svg.children.length > 0;
  }
  private fit(room: RoomId | null, animate = true) {
    if (!this.svg || !this.viewport) return;
    const r = this.viewport.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const bounds = room ? roomBounds(this.svg, room) : this.box;
    if (!bounds) {
      this.status(t('Esta habitación no tiene una zona SVG válida. Revisá su ID en el editor de arquitectura.'));
      return;
    }
    this.currentRoom = room;
    this.baseScale = fitCamera(this.box, { width: r.width, height: r.height }, 24).scale;
    this.moveCamera(fitCamera(bounds, { width: r.width, height: r.height }, room ? 34 : 24), animate);
    this.root
      .querySelectorAll('[data-room]')
      .forEach(b => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.room === room)));
    this.root.querySelector('.rooms .all')?.setAttribute('aria-pressed', String(room === null));
  }
  /** Eased camera transition; instant when the user prefers reduced motion. */
  private moveCamera(target: Camera, animate = true) {
    cancelAnimationFrame(this.animation);
    if (!animate || reducedMotion()) {
      this.camera = target;
      this.queuePosition();
      return;
    }
    const from = { ...this.camera },
      started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 260);
      this.camera = interpolateCamera(from, target, progress);
      this.positionMarkers();
      if (progress < 1) this.animation = requestAnimationFrame(step);
    };
    this.animation = requestAnimationFrame(step);
  }
  /** Zooms just enough to separate a tapped group of markers, centred on it. */
  private frameDevices(ids: string[]) {
    const r = this.viewport.getBoundingClientRect();
    const devices = this.draft!.catalog.devices.filter(d => ids.includes(d.id));
    if (!devices.length || !r.width || !r.height) return;
    const points = devices.map(d => ({
      x: this.box.x + d.position.x * this.box.width,
      y: this.box.y + d.position.y * this.box.height,
    }));
    let closest = Infinity;
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++)
        closest = Math.min(closest, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
    const max = this.baseScale * 16;
    // Scale at which the closest pair is a full touch target apart (plus margin).
    const needed = closest > 0 ? (GROUP_DISTANCE * 1.25) / closest : Infinity;
    if (needed > max) {
      // Devices at (nearly) the same spot cannot be separated by zooming: list them.
      this.chooseDevice(devices.map(d => d.id));
      return;
    }
    const bounds = boundsOf(
      devices.map(d => d.position),
      this.box,
      1,
    );
    const fit = fitCamera(bounds, { width: r.width, height: r.height }, 70).scale;
    const scale = Math.min(max, Math.max(needed, Math.min(fit, needed * 2), this.camera.scale * 1.2));
    const cx = bounds.x + bounds.width / 2,
      cy = bounds.y + bounds.height / 2;
    this.currentRoom = null;
    this.moveCamera({ scale, x: r.width / 2 - cx * scale, y: r.height / 2 - cy * scale });
  }
  private chooseDevice(ids: string[]) {
    const devices = this.draft!.catalog.devices.filter(d => ids.includes(d.id));
    this.dialog(
      t('Dispositivos en este lugar'),
      `<div class="choices">${devices.map(d => `<button type="button" data-choose="${e(d.id)}">${e(d.display.label)} · ${e(stateText(this.runtime.states[d.id]?.value ?? 'unknown'))}</button>`).join('')}</div>`,
      [{ label: t('Cerrar'), action: () => {} }],
    );
    const dialog = this.root.querySelector('dialog:last-of-type')!;
    dialog.querySelectorAll<HTMLButtonElement>('[data-choose]').forEach(button =>
      button.addEventListener('click', () => {
        (dialog as HTMLDialogElement).close();
        this.showDetails(button.dataset.choose!, this.viewport);
      }),
    );
  }
  private renderMarkers() {
    const overlay = this.root.querySelector('.overlay');
    if (!overlay || !this.draft) return;
    overlay.innerHTML = this.draft.catalog.devices
      .filter(d => this.editing || this.enabledLayers.has(layer(d)))
      .map(
        d =>
          `<div class="marker ${d.id === this.selected ? 'selected' : ''} ${this.editing && (d.mobility !== 'fixed' || this.fixedPermit === d.id) ? 'editable' : ''}" data-id="${e(d.id)}" data-kind="${e(d.kind)}"><button type="button" class="primary" aria-label="${e(t('Acción principal de {label}', { label: d.display.label }))}" title="${e(d.display.label)}">${customElements.get('ha-icon') ? `<ha-icon icon="${e(d.display.icon)}"></ha-icon>` : (KIND_ICONS[d.kind] ?? '◉')}</button><span class="state-dot" aria-hidden="true"></span><button class="detail" type="button" aria-label="${e(t('Detalles de {label}', { label: d.display.label }))}" title="${e(t('Detalles de {label}', { label: d.display.label }))}">⋯</button></div>`,
      )
      .join('');
    this.groupsKey = '';
    // New buttons must receive their current position before becoming interactive.
    this.refreshState();
    this.positionMarkers();
    this.updateSelection();
  }
  private queuePosition() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.positionMarkers());
  }
  private screen(position: { x: number; y: number }) {
    return {
      x: this.camera.x + (this.box.x + position.x * this.box.width) * this.camera.scale,
      y: this.camera.y + (this.box.y + position.y * this.box.height) * this.camera.scale,
    };
  }
  private positionMarkers() {
    const architecture = this.root.querySelector('.architecture') as HTMLElement | null;
    if (architecture)
      architecture.style.transform = `translate(${this.camera.x + this.box.x * this.camera.scale - this.box.x}px,${this.camera.y + this.box.y * this.camera.scale - this.box.y}px) scale(${this.camera.scale})`;
    const overlay = this.root.querySelector<HTMLElement>('.overlay');
    if (!overlay || !this.draft) return;
    const byId = new Map(this.draft.catalog.devices.map(d => [d.id, d]));
    const markers = [...overlay.querySelectorAll<HTMLElement>('.marker')];
    // Groups depend only on the zoom level, not on panning: recompute when it changes.
    const key = `${this.editing}|${this.camera.scale.toFixed(5)}|${markers.map(m => m.dataset.id).join(',')}`;
    if (key !== this.groupsKey) {
      this.groupsKey = key;
      overlay.querySelectorAll('.cluster').forEach(node => node.remove());
      for (const marker of markers) marker.hidden = false;
      // In edit mode every device stays individually draggable.
      if (!this.editing) {
        const points = markers.flatMap(m => {
          const d = byId.get(m.dataset.id!);
          return d ? [{ id: d.id, ...this.screen(d.position) }] : [];
        });
        for (const group of clusterPoints(points, GROUP_DISTANCE)) {
          if (group.ids.length < 2) continue;
          for (const id of group.ids)
            overlay.querySelector<HTMLElement>(`.marker[data-id="${CSS.escape(id)}"]`)!.hidden = true;
          const names = group.ids.map(id => byId.get(id)!.display.label);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'cluster';
          button.dataset.ids = group.ids.join(' ');
          button.dataset.active = String(group.ids.some(id => isActiveValue(this.runtime.states[id]?.value)));
          button.setAttribute(
            'aria-label',
            t('{count} dispositivos: {names}. Acercar para verlos.', {
              count: group.ids.length,
              names: names.join(', '),
            }),
          );
          button.title = names.join('\n');
          button.textContent = String(group.ids.length);
          overlay.append(button);
        }
      }
    }
    for (const marker of markers) {
      const d = byId.get(marker.dataset.id!);
      if (!d) continue;
      const point = this.screen(d.position);
      marker.style.left = `${point.x}px`;
      marker.style.top = `${point.y}px`;
    }
    for (const cluster of overlay.querySelectorAll<HTMLElement>('.cluster')) {
      const ids = cluster.dataset.ids!.split(' ');
      const points = ids.map(id => this.screen(byId.get(id)!.position));
      cluster.style.left = `${points.reduce((sum, p) => sum + p.x, 0) / points.length}px`;
      cluster.style.top = `${points.reduce((sum, p) => sum + p.y, 0) / points.length}px`;
    }
    let highlight = overlay.querySelector<HTMLElement>('.room-highlight');
    const bounds = this.currentRoom && this.svg ? roomBounds(this.svg, this.currentRoom) : null;
    if (!bounds) highlight?.remove();
    else {
      if (!highlight) {
        highlight = document.createElement('div');
        highlight.className = 'room-highlight';
        overlay.prepend(highlight);
      }
      const a = this.screen({
        x: (bounds.x - this.box.x) / this.box.width,
        y: (bounds.y - this.box.y) / this.box.height,
      });
      highlight.style.left = `${a.x}px`;
      highlight.style.top = `${a.y}px`;
      highlight.style.width = `${bounds.width * this.camera.scale}px`;
      highlight.style.height = `${bounds.height * this.camera.scale}px`;
    }
    this.positionEditor();
  }
  private refreshState() {
    this.root.querySelectorAll<HTMLElement>('.marker').forEach(m => {
      const d = this.draft?.catalog.devices.find(d => d.id === m.dataset.id);
      if (!d) return;
      const state = this.runtime.states[d.id];
      const confidence = state?.confidence ?? 'unknown';
      m.dataset.confidence = confidence;
      m.dataset.active = String(isActiveValue(state?.value));
      const main = m.querySelector('button.primary')!;
      const availability = d.bindings.primaryAction
        ? this.adapter?.getActionAvailability(d.bindings.primaryAction)
        : undefined;
      // Without a primary action, a tap opens the device's panel instead.
      const opensPanel = !d.bindings.primaryAction && (!!d.bindings.entityId || !!d.bindings.advancedPopupId);
      main.setAttribute(
        'title',
        `${d.display.label} · ${stateText(state?.value ?? 'unknown')} · ${confidenceLabel(confidence)}${!this.editing && !opensPanel && !availability?.available ? ` · ${t('Acción pendiente o no disponible')}` : ''}`,
      );
      main.setAttribute('aria-description', `${confidenceLabel(confidence)}: ${stateText(state?.value ?? 'unknown')}`);
      // Keep selection reachable in edit mode; normal unavailable controls cannot dispatch.
      (main as HTMLButtonElement).disabled = !this.editing && !opensPanel && !availability?.available;
    });
    const d = this.draft?.catalog.devices.find(d => d.id === this.selected);
    if (d && this.panel) {
      const s = this.runtime.states[d.id];
      if (s) this.panel.update(s);
    }
  }
  private onClick = (event: Event) => {
    const target = (event.target as Element).closest<HTMLElement>('button');
    if (!target) return;
    if (target.classList.contains('cluster')) {
      this.frameDevices(target.dataset.ids!.split(' '));
      return;
    }
    const marker = target.closest<HTMLElement>('.marker');
    if (marker) {
      const id = marker.dataset.id!;
      if (this.suppressClick === id) {
        // The long press already opened the panel.
        this.suppressClick = null;
        return;
      }
      if (this.editing) {
        this.select(id);
        return;
      }
      const d = this.draft?.catalog.devices.find(item => item.id === id);
      if (target.classList.contains('detail') || (d && !d.bindings.primaryAction)) this.showDetails(id, target);
      else void this.act(id);
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
  private async executeAction(action: string, id: string) {
    const result = await this.adapter?.executeAction(action, id);
    if (result && typeof result === 'object' && 'ok' in result && result.ok === false)
      throw new Error(reasonText(String('reason' in result ? result.reason : '')));
  }
  private async act(id: string) {
    const d = this.draft?.catalog.devices.find(d => d.id === id);
    if (!d || this.editing || !this.adapter) return;
    const action = d.bindings.primaryAction;
    if (!action) return;
    try {
      await this.executeAction(action, id);
    } catch (error) {
      this.status(error instanceof Error ? error.message : t('No se pudo ejecutar la acción.'));
    } finally {
      this.refreshState();
    }
  }
  private showDetails(id: string, returnFocus: HTMLElement) {
    const d = this.draft?.catalog.devices.find(d => d.id === id);
    if (!d || !this.draft) return;
    this.selected = id;
    this.panel?.close();
    const panel = d.bindings.advancedPopupId ? this.draft.panels[d.bindings.advancedPopupId] : undefined;
    const entityId = d.bindings.entityId;
    if (!panel && !entityId) {
      this.dialog(
        t('Detalles del dispositivo'),
        `<p>${e(d.display.label)}</p><p>${e(confidenceLabel(this.runtime.states[id]?.confidence ?? 'unknown'))}</p><p>${d.bindings.advancedPopupId ? e(t('Panel nativo pendiente: {id}', { id: d.bindings.advancedPopupId })) : e(t('Vinculá una entidad o un panel en el editor para controlar este dispositivo.'))}</p>`,
        [{ label: t('Cerrar'), action: () => {} }],
      );
      return;
    }
    const scriptName = entityId?.startsWith('script.') ? entityId.slice('script.'.length) : null;
    this.panel = openPanel({
      panel: panel ?? null,
      device: d,
      state: this.runtime.states[id] ?? {
        value: 'unknown',
        confidence: 'unknown',
        observedAt: null,
        sourceEntityId: null,
        command: null,
      },
      configuration: this.draft,
      roomLabel: this.draft.rooms.find(room => room.id === d.roomId)?.label ?? null,
      availability: (actionId: string) =>
        this.adapter?.getActionAvailability(actionId) ?? { available: false, reason: t('Acción pendiente.') },
      onAction: async (actionId: string) => {
        if (!this.editing) await this.executeAction(actionId, id);
      },
      getEntity: entityId ? () => this._hass?.states[entityId] : undefined,
      getScriptFields: scriptName
        ? () => (this._hass?.services?.script?.[scriptName] as { fields?: unknown } | undefined)?.fields
        : undefined,
      entityAvailability: entityId
        ? command =>
            this.editing
              ? { available: false, reason: t('Salí del modo edición para controlar dispositivos.') }
              : (this.adapter?.getEntityCommandAvailability(id, command) ?? {
                  available: false,
                  reason: 'ha-unavailable',
                })
        : undefined,
      onEntityCommand: entityId
        ? async command => (this.editing ? { ok: false } : this.adapter?.executeEntityCommand(id, command))
        : undefined,
      onAssume:
        entityId && this._hass?.states[entityId]?.attributes?.homemanager_remote
          ? isOn => (this._hass ? rf.assume(this._hass, entityId, isOn) : Promise.resolve(null))
          : undefined,
      returnFocus,
    });
  }
  private async toggleEdit() {
    if (this.loading || this.saving) return;
    if (this.editing) {
      if (this.dirty) {
        this.status(t('Guardá o descartá los cambios antes de salir del editor.'));
        return;
      }
      this.editing = false;
      this.stopPlacing();
      this.editor?.closeSurface();
      this.updateControls();
      this.renderMarkers();
      return;
    }
    if (!this.config || this._hass?.user?.is_admin !== true) {
      this.status(t('La edición compartida requiere una cuenta administradora de Home Assistant.'));
      return;
    }
    const dashboardPath = this.config.dashboard_path ?? currentDashboardPath(this._hass);
    if (!this.home) {
      const mode = this._hass.panels?.[dashboardPath ?? 'lovelace']?.config?.mode ?? this.config.dashboard_mode;
      if (mode !== 'storage') {
        this.status(
          mode === 'yaml'
            ? t('Este dashboard usa YAML y es de sólo lectura.')
            : t('No se pudo confirmar el modo storage del dashboard.'),
        );
        return;
      }
    }
    this.loading = true;
    this.updateControls();
    const generation = this.generation;
    try {
      this.store =
        this.home ??
        new LovelaceConfigurationStore(() => this._hass, {
          cardId: this.config.card_id,
          dashboardPath,
          dashboardMode: this.config.dashboard_mode,
        });
      const current = await this.store.load();
      if (generation !== this.generation || !this.isConnected) return;
      this.saved = clone(current);
      this.draft = clone(current);
      this.config.configuration = clone(current);
      this.editing = true;
      this.selected = null;
      this.fixedPermit = null;
      this.history = [];
      this.future = [];
      this.mountEditor();
      this.mountArchitecture();
      this.fit(null);
      this.renderMarkers();
      this.status(
        this.home?.revision === null
          ? `Hogar nuevo: «${this.home.homeId}» se creará en la integración al guardar.`
          : '',
      );
    } catch (error) {
      this.status(error instanceof Error ? error.message : t('No se pudo cargar el editor.'));
    } finally {
      this.loading = false;
      this.updateControls();
    }
  }
  private mountEditor() {
    const host = this.root.querySelector('.editor')!;
    this.editor = document.createElement('homemanager-editor') as HomeManagerEditor;
    this.editor.embedded = true;
    this.editor.homeId = this.home?.homeId;
    if (this._hass) this.editor.hass = this._hass;
    this.editor.setConfig({ ...this.config!, configuration: this.draft! });
    this.editor.selectedDeviceId = this.selected;
    // "Add device" in the editor asks the card for a tap on the plan.
    this.editor.addEventListener('homemanager-place', (event: Event) => {
      event.stopPropagation();
      const id = (event as CustomEvent<{ deviceId: string }>).detail.deviceId;
      this.fixedPermit = id;
      this.selected = id;
      this.startPlacing(id);
    });
    this.editor.addEventListener('homemanager-fixed', (event: Event) => {
      this.fixedPermit = (event as CustomEvent<{ deviceId: string }>).detail.deviceId;
      this.renderMarkers();
    });
    this.editor.addEventListener('homemanager-editor-close', () => {
      const marker =
        this.selected && this.root.querySelector<HTMLElement>(`[data-id="${CSS.escape(this.selected)}"] .primary`);
      (this.editorFocus?.isConnected
        ? this.editorFocus
        : marker || this.root.querySelector<HTMLElement>('[data-command=add-device]')
      )?.focus();
    });
    this.editor.addEventListener('config-changed', (event: Event) => {
      event.stopPropagation();
      if (!this.editing || this.saving) return;
      const next = (event as CustomEvent<{ config: CardConfig }>).detail.config.configuration;
      this.change(next, false);
    });
    host.replaceChildren(this.editor);
  }
  private select(id: string) {
    this.editorFocus = undefined;
    this.selected = id;
    if (this.editor) this.editor.selectedDeviceId = id;
    this.renderMarkers();
    this.positionEditor();
    this.frameAboveSheet();
  }
  private frameAboveSheet() {
    if (!matchMedia('(max-width:650px)').matches || !this.editor || this.editor.hidden) return;
    const device = this.draft?.catalog.devices.find(item => item.id === this.selected);
    const host = this.root.querySelector<HTMLElement>('.workspace > .editor');
    if (!device || !host) return;
    const visibleHeight = this.viewport.clientHeight - host.clientHeight;
    if (visibleHeight < 60) return;
    cancelAnimationFrame(this.animation);
    this.animation = 0;
    this.camera.y += visibleHeight / 2 - this.screen(device.position).y;
    this.queuePosition();
  }
  /** A sheet on phones, a clamped card beside the selected marker on desktop. */
  private positionEditor() {
    const host = this.root.querySelector<HTMLElement>('.editor');
    if (!host || !this.editing || matchMedia('(max-width:650px)').matches) return;
    const device = this.draft?.catalog.devices.find(item => item.id === this.selected);
    const point = device ? this.screen(device.position) : { x: 16, y: 16 };
    const width = Math.min(340, this.viewport.clientWidth - 24);
    const left = device && point.x + width + 40 > this.viewport.clientWidth ? point.x - width - 34 : point.x + 34;
    host.style.left = `${Math.max(12, Math.min(this.viewport.clientWidth - width - 12, left))}px`;
    host.style.top = `${Math.max(12, Math.min(this.viewport.clientHeight - Math.min(this.editor?.offsetHeight ?? 0, this.viewport.clientHeight - 24) - 12, point.y - 24))}px`;
  }
  private updateSelection() {
    const host = this.root.querySelector('.selection');
    if (!host) return;
    const d = this.draft?.catalog.devices.find(d => d.id === this.selected);
    host.innerHTML = d
      ? `<span>${e(d.display.label)}</span>${d.mobility === 'fixed' && this.fixedPermit !== d.id ? '<button type="button" data-command="fixed">Reubicar dispositivo fijo</button>' : ''}`
      : '';
  }
  private change(next: Configuration, syncEditor = true) {
    try {
      const valid = validateConfiguration(next, { allowPending: true });
      if (same(valid, this.draft)) return;
      this.history.push(clone(this.draft!));
      if (this.history.length > 40) this.history.shift();
      this.future = [];
      const architectureChanged = valid.architecture.content !== this.draft?.architecture.content;
      this.draft = valid;
      if (this.selected && !valid.catalog.devices.some(device => device.id === this.selected)) this.selected = null;
      this.fixedPermit = null;
      if (architectureChanged) {
        this.mountArchitecture();
        this.fit(null);
      }
      if (syncEditor && this.editor) {
        this.editor.setConfig({ ...this.config!, configuration: this.draft });
        this.editor.selectedDeviceId = this.selected;
      }
      this.renderMarkers();
      this.updateControls();
    } catch (error) {
      this.status(error instanceof Error ? error.message : t('Borrador no válido.'));
    }
  }
  private discard() {
    if (!this.saved || this.saving) return;
    this.draft = clone(this.saved);
    this.history = [];
    this.future = [];
    this.fixedPermit = null;
    this.mountEditor();
    this.mountArchitecture();
    this.renderMarkers();
    this.updateControls();
    this.status(t('Cambios descartados.'));
  }
  private undo() {
    if (!this.history.length || this.saving) return;
    this.future.push(clone(this.draft!));
    this.draft = this.history.pop()!;
    this.syncDraft();
  }
  private redo() {
    if (!this.future.length || this.saving) return;
    this.history.push(clone(this.draft!));
    this.draft = this.future.pop()!;
    this.syncDraft();
  }
  private syncDraft() {
    this.fixedPermit = null;
    this.mountEditor();
    this.mountArchitecture();
    this.renderMarkers();
    this.updateControls();
  }
  private async save(reviewed = false) {
    if (!this.editing || !this.dirty || this.saving || !this.store) return;
    const changes = this.draft!.catalog.devices.filter(d =>
      this.saved!.catalog.devices.some(old => old.id === d.id && old.roomId !== d.roomId),
    );
    if (changes.length && !reviewed) {
      this.dialog(
        t('Revisar cambios de habitación'),
        `<p>${changes.map(d => e(d.display.label)).join(', ')}</p><p>Se guarda la ubicación visual. Las entidades, áreas de Home Assistant, scripts y rutas de control conservan sus asociaciones.</p>`,
        [
          { label: t('Volver a editar'), action: () => {} },
          {
            label: t('Guardar ubicación visual'),
            action: () => {
              void this.save(true);
            },
          },
        ],
      );
      return;
    }
    try {
      const next = validateConfiguration(this.draft);
      this.saving = true;
      this.updateControls();
      const generation = this.generation;
      await this.store.save(next);
      if (generation !== this.generation || !this.isConnected) return;
      this.saved = clone(next);
      this.draft = clone(next);
      this.config!.configuration = clone(next);
      this.history = [];
      this.future = [];
      this.fixedPermit = null;
      this.setupAdapter(next);
      if (this.home) {
        this.homeState = 'ready';
        if (!this.homeUnsubscribe && this._hass) this.watchHome(this.home);
      }
      this.status(t('Guardado en Home Assistant.'));
      this.dispatchEvent(
        new CustomEvent('homemanager-saved', { detail: { configuration: clone(next) }, bubbles: true, composed: true }),
      );
    } catch (error) {
      this.status(`${error instanceof Error ? error.message : t('No se pudo guardar.')} El borrador sigue pendiente.`);
    } finally {
      this.saving = false;
      this.refreshState();
      this.updateControls();
    }
  }
  private updateControls() {
    const edit = this.root.querySelector<HTMLButtonElement>('[data-command=edit]');
    if (edit) {
      edit.setAttribute('aria-pressed', String(this.editing));
      edit.disabled = this.loading || this.saving;
    }
    const wrap = this.root.querySelector<HTMLElement>('.editor-wrap');
    if (wrap) wrap.hidden = !this.editing;
    for (const item of this.root.querySelectorAll<HTMLElement>('.edit-add, .workspace > .editor'))
      item.hidden = !this.editing;
    this.root.querySelector('.shell')?.classList.toggle('is-editing', this.editing);
    for (const item of this.root.querySelectorAll<HTMLButtonElement>(
      '[data-command=add-device], [data-command=settings], [data-command=exit]',
    ))
      item.disabled = this.loading || this.saving;
    const save = this.root.querySelector<HTMLButtonElement>('[data-command=save]');
    if (save) {
      save.dataset.dirty = String(this.dirty);
      save.disabled = !this.dirty || this.loading || this.saving || this._hass?.user?.is_admin !== true;
      save.setAttribute('aria-label', this.saving ? t('Guardando…') : t('Guardar cambios'));
      save.title = save.getAttribute('aria-label')!;
    }
    const undo = this.root.querySelector<HTMLButtonElement>('[data-command=undo]');
    if (undo) undo.disabled = !this.history.length || this.saving;
    const redo = this.root.querySelector<HTMLButtonElement>('[data-command=redo]');
    if (redo) redo.disabled = !this.future.length || this.saving;
    const discard = this.root.querySelector<HTMLButtonElement>('[data-command=discard]');
    if (discard) discard.disabled = this.saving || !this.dirty;
    this.updateSelection();
    this.positionEditor();
  }
  private status(message: string) {
    const host = this.root.querySelector('.status');
    if (host) host.textContent = message;
  }
  private info(storage = false) {
    const p = (text: string) => `<p>${e(text)}</p>`;
    this.dialog(
      storage ? t('Guardado compartido') : t('HomeManager'),
      storage
        ? this.home
          ? p(
              t(
                'Este plano se guarda en la integración HomeManager. Cada guardado comprueba la revisión: si otra persona guardó antes, tus cambios no la pisan y el borrador se conserva.',
              ),
            ) + p(t('Los planos anteriores quedan en el historial y se pueden restaurar desde Importar y exportar.'))
          : p(
              t(
                'El guardado requiere administrador y dashboard Lovelace storage. Sólo se anuncia guardado después de leer la configuración confirmada por HA.',
              ),
            ) +
            p(
              t(
                'Usá un único editor activo. La API guarda el dashboard completo y no ofrece una revisión atómica entre clientes. Ante conflicto se conserva el borrador para exportarlo.',
              ),
            )
        : p(
            t(
              'Tocá un dispositivo para su acción principal. Mantenelo pulsado, hacé clic derecho o usá el botón ⋯ para abrir sus controles.',
            ),
          ) +
            p(
              t(
                'Arrastrá para desplazarte, pellizcá o usá la rueda para acercar, y tocá dos veces para ampliar. Los números agrupan dispositivos cercanos: tocalos para acercarte.',
              ),
            ) +
            p(t('Versión {version}', { version: VERSION })) +
            `<dl class="confidence-list"><dt>${e(t('Confirmado'))}</dt><dd>${e(t('Feedback medido y verificado.'))}</dd><dt>${e(t('Estimado'))}</dt><dd>${e(t('Lectura sin confirmación independiente.'))}</dd><dt>${e(t('Comando aceptado'))}</dt><dd>${e(t('HA aceptó la llamada; el efecto físico no está confirmado.'))}</dd><dt>${e(t('Desconocido / error'))}</dt><dd>${e(t('Sin evidencia válida o llamada fallida.'))}</dd></dl>`,
      [{ label: t('Cerrar'), action: () => {} }],
    );
  }
  private dialog(title: string, body: string, actions: { label: string; action: () => void }[]) {
    const previous = this.root.activeElement as HTMLElement | null;
    const dialog = document.createElement('dialog');
    dialog.innerHTML = `<h2>${e(title)}</h2>${body}<div class="actions"></div>`;
    const heading = dialog.querySelector('h2')!;
    heading.id = 'hm-dialog-title';
    dialog.setAttribute('aria-labelledby', heading.id);
    const actionHost = dialog.querySelector('.actions')!;
    actions.forEach(item => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = item.label;
      b.addEventListener('click', () => {
        dialog.close();
        item.action();
      });
      actionHost.append(b);
    });
    dialog.addEventListener(
      'close',
      () => {
        dialog.remove();
        previous?.focus();
      },
      { once: true },
    );
    this.root.append(dialog);
    dialog.showModal();
  }
  private point(event: { clientX: number; clientY: number }) {
    const r = this.viewport.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }
  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.saving) return;
    const target = event.target as Element;
    // Floating controls inside the plan keep their own clicks (no pan capture).
    if (target.closest('.zoom, .layers, .cluster, .edit-add')) return;
    const p = this.point(event);
    this.pointers.set(event.pointerId, p);
    const marker = target.closest<HTMLElement>('.marker');
    if (marker) {
      if (!this.editing) {
        this.pointers.delete(event.pointerId);
        const id = marker.dataset.id!;
        clearTimeout(this.longPress?.timer);
        this.longPress = {
          id,
          x: event.clientX,
          y: event.clientY,
          timer: setTimeout(() => {
            this.longPress = undefined;
            this.suppressClick = id;
            this.showDetails(id, marker.querySelector('button.primary') ?? this.viewport);
          }, LONG_PRESS_MS),
        };
        return;
      }
      const d = this.draft?.catalog.devices.find(d => d.id === marker.dataset.id);
      if (!d) return;
      this.selected = d.id;
      this.updateSelection();
      if (d.mobility === 'fixed' && this.fixedPermit !== d.id) {
        this.pointers.delete(event.pointerId);
        return;
      }
      this.gesture = {
        kind: 'device',
        id: d.id,
        start: p,
        position: { ...d.position },
        before: clone(this.draft!),
        moved: false,
      };
      marker.classList.add('dragging');
    } else if (this.pointers.size === 2) {
      this.beginPinch();
    } else this.gesture = { kind: 'pan', x: p.x, y: p.y, camera: { ...this.camera } };
    this.viewport.setPointerCapture(event.pointerId);
  };
  private beginPinch() {
    const pts = [...this.pointers.values()];
    this.gesture = {
      kind: 'pinch',
      distance: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
      center: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      camera: { ...this.camera },
    };
  }
  private pointerMove = (event: PointerEvent) => {
    if (this.longPress && Math.hypot(event.clientX - this.longPress.x, event.clientY - this.longPress.y) > 8) {
      clearTimeout(this.longPress.timer);
      this.longPress = undefined;
    }
    if (!this.pointers.has(event.pointerId) || !this.gesture) return;
    const p = this.point(event);
    this.pointers.set(event.pointerId, p);
    const g = this.gesture;
    if (g.kind === 'device') {
      const d = this.draft?.catalog.devices.find(d => d.id === g.id);
      if (!d) return;
      const dx = p.x - g.start.x,
        dy = p.y - g.start.y;
      if (Math.hypot(dx, dy) > 3) g.moved = true;
      d.position = {
        x: Math.min(1, Math.max(0, g.position.x + dx / this.camera.scale / this.box.width)),
        y: Math.min(1, Math.max(0, g.position.y + dy / this.camera.scale / this.box.height)),
      };
      this.updateControls();
    } else if (g.kind === 'pan') this.camera = { ...g.camera, x: g.camera.x + p.x - g.x, y: g.camera.y + p.y - g.y };
    else if (this.pointers.size >= 2 && g.distance > 0) {
      const pts = [...this.pointers.values()];
      const center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      this.camera = zoomCamera(
        g.camera,
        Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / g.distance,
        g.center,
        this.baseScale * 0.5,
        this.baseScale * 16,
      );
      this.camera.x += center.x - g.center.x;
      this.camera.y += center.y - g.center.y;
    }
    this.queuePosition();
  };
  private pointerUp = (event: PointerEvent) => {
    if (this.longPress) {
      clearTimeout(this.longPress.timer);
      this.longPress = undefined;
    }
    const g = this.gesture;
    if (g?.kind === 'pan' && this.pointers.size === 1) {
      const p = this.point(event);
      const still = Math.hypot(p.x - g.x, p.y - g.y) < 6;
      if (still && this.placing) this.place(this.placing, p);
      else if (still) {
        const now = performance.now();
        if (
          this.lastTap &&
          now - this.lastTap.time < 320 &&
          Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 30
        ) {
          this.lastTap = undefined;
          this.currentRoom = null;
          this.moveCamera(zoomCamera(this.camera, 1.8, p, this.baseScale * 0.5, this.baseScale * 16));
        } else this.lastTap = { time: now, x: p.x, y: p.y };
      }
    }
    this.pointers.delete(event.pointerId);
    if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
    if (g?.kind === 'device') {
      if (g.moved) {
        this.history.push(g.before);
        if (this.history.length > 40) this.history.shift();
        this.future = [];
        const d = this.draft!.catalog.devices.find(d => d.id === g.id)!;
        const detected = this.svg
          ? roomAt(
              this.svg,
              d.position,
              this.box,
              this.draft!.rooms.map(room => room.id),
            )
          : null;
        if (detected) d.roomId = detected;
        if (this.editor) {
          this.editor.setConfig({ ...this.config!, configuration: this.draft! });
          this.editor.selectedDeviceId = g.id;
        }
        this.fixedPermit = null;
      }
      if (!g.moved && this.editor) this.editor.selectedDeviceId = g.id;
      this.renderMarkers();
      this.updateControls();
    }
    this.gesture = undefined;
    if (g?.kind === 'device') this.frameAboveSheet();
    if (this.pointers.size === 1) {
      const p = [...this.pointers.values()][0];
      this.gesture = { kind: 'pan', x: p.x, y: p.y, camera: { ...this.camera } };
    }
  };
  private contextMenu = (event: MouseEvent) => {
    const marker = (event.target as Element).closest<HTMLElement>('.marker');
    if (!marker || this.editing) return;
    event.preventDefault();
    this.showDetails(marker.dataset.id!, marker.querySelector('button.primary') ?? this.viewport);
  };
  /** Edit mode: the next tap on the plan positions a newly added device. */
  private startPlacing(id: string) {
    const d = this.draft?.catalog.devices.find(item => item.id === id);
    if (!d) return;
    this.placing = id;
    this.editor?.closeSurface();
    this.viewport.focus();
    // The editor sits below the plan: bring the plan back into view for the tap.
    this.viewport.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    const hint = this.root.querySelector<HTMLElement>('.placing-hint');
    if (hint) {
      hint.hidden = false;
      hint.textContent = t('Tocá el plano para ubicar «{label}». Esc para cancelar.', { label: d.display.label });
    }
  }
  private stopPlacing() {
    this.placing = null;
    const hint = this.root.querySelector<HTMLElement>('.placing-hint');
    if (hint) hint.hidden = true;
  }
  private place(id: string, point: { x: number; y: number }) {
    const nx = ((point.x - this.camera.x) / this.camera.scale - this.box.x) / this.box.width,
      ny = ((point.y - this.camera.y) / this.camera.scale - this.box.y) / this.box.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
      // A tap beside the drawing is a miss, not a request to pin the device to its edge.
      const hint = this.root.querySelector<HTMLElement>('.placing-hint');
      if (hint) hint.textContent = t('Tocá dentro del plano para ubicar el dispositivo. Esc para cancelar.');
      return;
    }
    this.stopPlacing();
    const next = clone(this.draft!);
    const device = next.catalog.devices.find(item => item.id === id);
    if (!device) return;
    device.position = {
      x:
        Math.round(
          Math.min(1, Math.max(0, ((point.x - this.camera.x) / this.camera.scale - this.box.x) / this.box.width)) * 1e6,
        ) / 1e6,
      y:
        Math.round(
          Math.min(1, Math.max(0, ((point.y - this.camera.y) / this.camera.scale - this.box.y) / this.box.height)) *
            1e6,
        ) / 1e6,
    };
    const detected = this.svg
      ? roomAt(
          this.svg,
          device.position,
          this.box,
          next.rooms.map(room => room.id),
        )
      : null;
    if (detected) device.roomId = detected;
    this.selected = id;
    this.change(next);
    this.frameAboveSheet();
    this.status(
      detected
        ? t('Ubicado en {room}.', { room: next.rooms.find(room => room.id === detected)?.label ?? detected })
        : t('Ubicado. Elegí su espacio en el editor si hace falta.'),
    );
  }
  private pointerCancel = (event: PointerEvent) => {
    if (this.longPress) {
      clearTimeout(this.longPress.timer);
      this.longPress = undefined;
    }
    if (this.gesture?.kind === 'device') {
      this.draft = this.gesture.before;
      this.renderMarkers();
      this.updateControls();
    }
    this.pointers.delete(event.pointerId);
    this.gesture = undefined;
  };
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    if (this.gesture?.kind === 'device') return;
    this.currentRoom = null;
    this.camera = zoomCamera(
      this.camera,
      Math.exp(-event.deltaY * 0.0015),
      this.point(event),
      this.baseScale * 0.5,
      this.baseScale * 16,
    );
    this.queuePosition();
  };
  private zoom(factor: number) {
    const r = this.viewport.getBoundingClientRect();
    this.currentRoom = null;
    this.camera = zoomCamera(
      this.camera,
      factor,
      { x: r.width / 2, y: r.height / 2 },
      this.baseScale * 0.5,
      this.baseScale * 16,
    );
    this.queuePosition();
  }
  private key = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.placing) {
      event.preventDefault();
      this.stopPlacing();
      return;
    }
    const target = event.composedPath()[0] as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
    if (this.editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
      return;
    }
    if (this.editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }
    if (
      target.closest?.('.marker') &&
      this.editing &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      const d = this.draft?.catalog.devices.find(d => d.id === target.closest<HTMLElement>('.marker')!.dataset.id);
      if (!d || (d.mobility === 'fixed' && this.fixedPermit !== d.id)) return;
      event.preventDefault();
      const next = clone(this.draft!);
      const device = next.catalog.devices.find(x => x.id === d.id)!;
      const step = event.shiftKey ? 0.01 : 0.002;
      device.position.x = Math.min(
        1,
        Math.max(0, d.position.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0)),
      );
      device.position.y = Math.min(
        1,
        Math.max(0, d.position.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)),
      );
      this.selected = d.id;
      this.change(next);
      (this.root.querySelector(`[data-id="${d.id}"] .primary`) as HTMLElement)?.focus();
      return;
    }
    if (target !== this.viewport) return;
    const shift = event.shiftKey ? 60 : 25;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      this.zoom(1.2);
    } else if (event.key === '-') {
      event.preventDefault();
      this.zoom(1 / 1.2);
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.fit(null);
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      this.camera.x += event.key === 'ArrowLeft' ? shift : event.key === 'ArrowRight' ? -shift : 0;
      this.camera.y += event.key === 'ArrowUp' ? shift : event.key === 'ArrowDown' ? -shift : 0;
      this.queuePosition();
    }
  };
}
