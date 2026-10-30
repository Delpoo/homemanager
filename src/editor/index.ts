import { t, getLanguage, setLanguage, languageFromHass } from '../i18n/index.js';
import { validateConfiguration } from '../card/configuration.js';
import { migrateConfiguration } from '../ha/migration.mjs';
import {
  IntegrationConfigurationStore,
  describeError,
  integrationAvailable,
  listHomes,
  type HomeSummary,
  fetchLinkedPlan,
  type LinkedPlanStatus,
} from '../integration/store.js';
import { detectZones, sanitizeArchitecture } from '../card/geometry.js';
import {
  KINDS,
  SERVICES,
  clone,
  escapeHTML as esc,
  type Action,
  type CardConfig,
  type Configuration,
  type Device,
  type Hass,
  type NativePanel,
} from '../card/types.js';
import { rf, type RfRemote } from '../integration/rf.js';
import { serviceLabel, suggestControls } from '../card/device-controls.js';
import {
  moveRoom,
  newDeviceId,
  pendingReferences,
  persistentConfiguration,
  remapPositions,
  removeDevice,
  removeRoom,
  summarizeImport,
  importLosses,
  losesData,
  upsertAction,
  upsertDevice,
  upsertPanel,
  upsertRoom,
  upsertStateSource,
  type PositionMode,
} from './model.js';
type Box = { x: number; y: number; width: number; height: number };
export { LovelaceConfigurationStore, type ConfigurationStore } from './storage.js';
import { enhanceEntityInput, friendlyName, areaOf, pickerStyles } from './entity-picker.js';
import { openDevicePicker, type DevicePicker } from './device-picker.js';
import { deviceName, entityAreaId, readingName, personName } from '../model/names.js';
import {
  CREATE_AREA,
  areaProposals,
  isLooseEntity,
  looseEntities,
  sharedAreas,
  spreadInRoom,
  suggestAreas,
  withAreaLinks,
} from '../model/connect-home.js';
import { connectBody, connectStyles } from './connect-home.js';
import { bindingIssues, deviceCatalog, pickerReadings, type DeviceSelection } from '../model/device-catalog.js';
import { uiBinding, uiButton, uiChoices, uiNotice, uiSegmented, useBindingComponents } from '../ui/components.js';
import { CATEGORIES, categoryOf, sectionsOf } from '../model/category.js';
import { snapToGrid } from '../model/room-shapes.js';
import { alertSettingsDraft, alertSettingsDisplay, type AlertSettingsDraft } from '../model/alert-settings.js';
import type { AlertEditor } from '../ui/alert-editor.js';
import '../ui/alert-editor.js';
import type { Category } from '../model/types.js';
import { domainOf, suggestPresentation } from '../panels/controls.js';
import { tokens } from '../ui/theme.js';
import { editorSheetStyles } from '../ui/editor-components.js';
import { restoreEditedDevice } from '../model/editor-session.js';
import { iconButton, iconButtonStyles, submitIconButton } from '../ui/icon-button.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { helpTip } from '../ui/help-tip.js';
import { iconPicker } from '../ui/icon-picker.js';
import { suggestRoomIcon } from '../shell/room-rail.js';
import {
  healthOfPlan,
  reportForPlan,
  hasPlanChanges,
  openPlanReview,
  spaceRects,
  withPlanShapes,
} from './plan-review.js';
import { applyFixes, canFix, isSafeFix, type HealthIssue, type PlanHealth } from '../model/plan-health.js';
import { openRoomActions, type RoomViewChoices } from './room-actions.js';
import {
  healthBody,
  planCard,
  settingsPage,
  settingsPageStyles,
  spacesList,
  type SettingsSection,
} from './settings-page.js';
import { SERVICES as ALLOWED } from '../card/types.js';
import {
  actionName,
  actionOptionsHtml,
  controlsEditorStyles,
  placeAction,
  editCommand,
  editField,
  renderControlsEditor,
  renderSymbolSize,
  resolveSheet,
  sheetFromDevice,
  suggestedSheet,
  type SheetModel,
  type Suggestion,
} from './controls-editor.js';
export * from './model.js';

const cssBase = `${tokens}${pickerStyles}${iconButtonStyles}${controlsEditorStyles}${settingsPageStyles}${connectStyles}
:host([embedded]){width:372px;max-width:100%;background:var(--hm-bg);border:1px solid var(--hm-line);border-radius:18px;box-shadow:var(--hm-shadow)}.sheet-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}.sheet-header h2{flex:1;margin:0;overflow-wrap:anywhere}.basic{display:grid;gap:12px}.field-title{display:flex;align-items:center;justify-content:flex-start;gap:2px;min-height:32px}.icon-field{display:flex;gap:8px;align-items:center}.icon-field ha-icon{flex:0 0 28px}.sheet-tools{display:flex;align-items:center;gap:8px;position:sticky;bottom:0;margin:12px 0 0;padding:10px 0;background:var(--hm-bg);border-top:1px solid var(--hm-line);z-index:2}.sheet-tools .spacer{flex:1}.sheet-tools .primary{padding:8px 12px}.sheet-header{position:sticky;top:-14px;background:var(--hm-bg);z-index:3}.add-menu{display:grid;gap:10px}.settings-dialog{width:min(820px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 32px);overflow:auto;padding:18px;border:1px solid var(--hm-line);border-radius:20px;background:var(--hm-bg);color:var(--hm-text)}.settings-dialog::backdrop{background:#10251d77}.advanced{margin-top:14px}.advanced>summary{min-height:44px;cursor:pointer;line-height:44px}.editor{overflow-wrap:anywhere}.icon-field input{min-width:0}.sheet-header .hm-icon-button{flex-shrink:0}

.quick{margin:12px 0 4px;padding:12px;border-radius:14px;background:var(--hm-surface)}.quick .note{margin:6px 0 0}.plans{display:grid;gap:6px;margin-top:10px}.plans .plan{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid var(--hm-line);border-radius:10px}
:host{display:block;font:14px var(--hm-font);color:var(--primary-text-color,var(--hm-text))}*{box-sizing:border-box}[hidden]{display:none!important}button,input,select,textarea{font:inherit;color:inherit}button{cursor:pointer;background:var(--hm-bg);border:1px solid var(--hm-line);border-radius:9px;padding:9px 12px;min-height:44px}button:hover{background:var(--hm-surface-2)}button:disabled{opacity:.5;cursor:default}input,select,textarea{width:100%;min-height:44px;border:1px solid var(--hm-line);border-radius:8px;background:var(--hm-bg);padding:8px}input[type=checkbox]{width:20px;min-height:20px}textarea{font:12px ui-monospace,monospace;min-height:85px;resize:vertical}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--hm-accent);outline-offset:2px}.editor{padding:14px;max-width:980px;margin:auto}h2{font-size:18px;margin:0 0 15px}h3{font-size:14px;margin:0}.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.toolbar select{flex:1;min-width:160px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.field{display:flex;flex-direction:column;gap:6px;font-size:12px}.full{grid-column:1/-1}.actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:14px}.primary{background:var(--hm-accent);color:var(--hm-on-accent);border-color:var(--hm-accent)}.danger{color:var(--hm-error)}.section{margin-top:15px;border:1px solid var(--hm-line);border-radius:10px;padding:12px}.section>summary{cursor:pointer;font-weight:600;min-height:30px;line-height:30px}.section-body{margin-top:10px}.note{font-size:12px;line-height:1.6;color:var(--hm-muted)}.pending{color:var(--hm-estimated)}.plan-conflicts{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border:1px solid color-mix(in srgb,var(--hm-estimated) 45%,var(--hm-line));border-radius:10px}.status{font-size:12px;line-height:1.6;padding:10px;margin-top:10px;background:color-mix(in srgb,var(--hm-estimated) 14%,var(--hm-bg));border-radius:9px}.status:empty{display:none}.check{display:flex;align-items:flex-start;gap:9px;font-size:12px;line-height:1.6;margin-top:10px}.controls{display:flex;flex-direction:column;gap:9px;margin-top:10px}.control-row{display:grid;grid-template-columns:1fr 1fr 1.2fr auto;gap:7px;align-items:end;padding:9px;background:var(--hm-surface);border-radius:8px}.room-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto auto;gap:7px;align-items:end;padding:9px;background:var(--hm-surface);border-radius:8px;margin-bottom:6px}.room-row .note{align-self:center}fieldset.mode{border:1px solid var(--hm-line);border-radius:8px;margin:10px 0;padding:8px 12px}.control-row button{padding:8px}.preview{padding:12px;margin-top:12px;border:1px solid var(--hm-line);border-radius:9px;background:var(--hm-surface)}.preview ul{padding-left:20px;font-size:12px;line-height:1.7}.file{font-size:12px}.readonly{font-size:11px;color:var(--hm-muted)}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:580px){.editor{padding:10px}.grid{grid-template-columns:1fr}.full{grid-column:auto}.control-row{grid-template-columns:1fr 1fr}.room-row{grid-template-columns:1fr auto auto auto}.room-row .note{grid-column:1/-1}.control-row label:nth-child(3){grid-column:1/-1}.control-row button{grid-column:2;justify-self:end}.toolbar button{flex:1}.actions button{flex:1}.section{padding:10px}}`;
const css = cssBase + editorSheetStyles;
const option = (value: string, text: string, selected: string) =>
  `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(text)}</option>`;
const input = (name: string, label: string, value: unknown, extra = '') =>
  `<label class="field">${label}<input name="${name}" aria-label="${label}" value="${esc(value)}" ${extra}></label>`;
/** Services a step can call without extra data, with their label. */
const SIMPLE_SERVICES = (): Record<string, string> => ({
  turn_on: t('Encender'),
  turn_off: t('Apagar'),
  toggle: t('Alternar'),
  press: t('Pulsar'),
  open_cover: t('Abrir'),
  close_cover: t('Cerrar'),
  stop_cover: t('Detener'),
});
function value(form: FormData, name: string): string {
  const item = form.get(name);
  if (item !== null && typeof item !== 'string') throw new Error(t('El formulario debe contener texto.'));
  return (item ?? '').trim();
}

/** A whole-home JSON replaces what is saved; say what would go before it can be applied. */
function importLossNote(losses: ReturnType<typeof importLosses>): string {
  if (!losesData(losses)) return '';
  const line = (text: string, names: readonly string[]) =>
    names.length ? `<li>${esc(text)}: ${names.map(esc).join(', ')}</li>` : '';
  const count = (text: string, value: number) => (value ? `<li>${esc(text)}: ${value}</li>` : '');
  return `<div class="note pending import-losses"><strong>${esc(t('Este archivo reemplaza todo el hogar, no sólo el dibujo.'))}</strong><ul>${line(t('Perderían su vínculo con Home Assistant'), losses.unlinked)}${line(t('Perderían sus avisos'), losses.alerts)}${count(t('Acciones que se pierden'), losses.actions)}${count(t('Paneles que se pierden'), losses.panels)}${line(t('Espacios que aparecen'), losses.roomsBack)}</ul><p>${esc(t('Para cambiar sólo el dibujo, importá el SVG. Para aplicar este archivo, exportá antes una copia actual.'))}</p></div>`;
}

/** Configuration-only editor. It never calls an HA action or interprets an imported command. */
/** New devices without an entity get a kind that matches their category. */
const CATEGORY_KIND: Record<Category, Device['kind']> = {
  switch: 'switch',
  equipment: 'appliance',
  remote: 'other',
  meter: 'sensor',
  plant: 'plant',
  alert: 'sensor',
  presence: 'sensor',
  infrastructure: 'infra',
};
function categoryInfo(category: Category): { label: string; icon: string } {
  return {
    switch: { label: t('Interruptor'), icon: 'mdi:lightbulb-outline' },
    equipment: { label: t('Equipo'), icon: 'mdi:air-conditioner' },
    remote: { label: t('Control remoto'), icon: 'mdi:remote' },
    meter: { label: t('Medidor'), icon: 'mdi:gauge' },
    plant: { label: t('Planta'), icon: 'mdi:sprout-outline' },
    alert: { label: t('Alerta'), icon: 'mdi:alert-outline' },
    presence: { label: t('Presencia'), icon: 'mdi:motion-sensor' },
    infrastructure: { label: t('Infraestructura'), icon: 'mdi:router-network' },
  }[category];
}

export class HomeManagerEditor extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private config?: CardConfig;
  private _hass?: Hass;
  private _selectedDeviceId: string | null = null;
  private _embedded = false;
  private adding = false;
  private allowFixedPosition = false;
  private openedConfiguration?: Configuration;
  private previewQueued = false;
  private previewFingerprint = '';
  private expanded = false;
  private handleDrag?: { id: number; y: number };
  private skipHandleClick = false;
  private actionId = '';
  private panelId = '';
  private panelRows: NativePanel['controls'] = [];
  private surface: 'device' | 'add' | 'settings' | null = null;
  private fromEntity = false;
  private importGeneration = 0;
  private imported?: {
    configuration: Configuration;
    summary: ReturnType<typeof summarizeImport>;
    losses: ReturnType<typeof importLosses>;
    viewBoxChanged: boolean;
    backedUp: boolean;
    from: Box;
    to: Box;
    missingZones: string[];
    newZones: string[];
    positionMode: PositionMode;
    spatial?: boolean;
  };
  private openSections = new Set<string>();
  /** The plan settings page section in view (CP9b). */
  private settingsSection: SettingsSection = 'rooms-section';
  /** Set by the card: what a space's window shows about its geometry, and drawing a new space. */
  roomView?: (id: string) => RoomViewChoices | undefined;
  editZones?: () => void;
  /** Conectar mi casa: what each space was given, and the devices ticked to add. */
  private connectChoices: Record<string, string> = {};
  private connectPicked = new Set<string>();
  /** Areas created here, until the registry reports them. */
  private connectCreated: Record<string, { name?: string }> = {};
  private connectBusy = false;
  /** Set by the card: reviews the home's linked drawing. */
  linkedReview?: () => void;
  private linked?: LinkedPlanStatus | null;
  /** Card config that points at an integration home: {type, card_id, home_id, title?}. */
  private homeConfig?: { type: string; card_id: string; home_id: string; title?: string };
  private homes?: HomeSummary[];
  private migrating = false;
  /** Survives the asynchronous re-render that follows the homes list refresh. */
  private homeMessage = '';
  /** Integration home this editor belongs to (set by the card): enables plan history. */
  homeId?: string;
  private plans?: { plan_id: string; created_at: string; bytes: number; revision: number }[];
  constructor() {
    super();
    useBindingComponents(this.root);
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('click', event => {
      const target = (event.target as Element).closest<HTMLElement>('[data-settings]');
      if (!target) return;
      this.settingsSection = target.dataset.settings as SettingsSection;
      this.render();
      this.root.querySelector<HTMLElement>(`[data-settings="${this.settingsSection}"]`)?.focus();
    });
    this.root.addEventListener('pointerdown', event => this.dragRoom(event as PointerEvent));
    this.root.addEventListener('change', this.onChange);
    this.root.addEventListener('submit', this.onSubmit);
    this.root.addEventListener('input', event => {
      const target = event.target as HTMLElement;
      if (target.dataset.ctl !== undefined || target.dataset.sheet) this.onChange(event);
      this.schedulePreview();
    });
    this.root.addEventListener('change', () => this.schedulePreview());
    this.root.addEventListener('click', () => this.schedulePreview());
    this.root.addEventListener('pointerdown', event => {
      if (!(event instanceof PointerEvent)) return;
      const handle = (event.target as Element).closest<HTMLElement>('.sheet-handle');
      if (!handle) return;
      this.handleDrag = { id: event.pointerId, y: event.clientY };
      handle.setPointerCapture(event.pointerId);
    });
    this.root.addEventListener('pointerup', event => {
      if (!(event instanceof PointerEvent) || !this.handleDrag || this.handleDrag.id !== event.pointerId) return;
      const distance = event.clientY - this.handleDrag.y;
      this.handleDrag = undefined;
      if (Math.abs(distance) > 24) {
        this.skipHandleClick = true;
        this.setExpanded(distance < 0);
      }
    });
    this.root.addEventListener('pointercancel', () => (this.handleDrag = undefined));
    this.root.addEventListener('keydown', event => {
      const grip = (event.target as Element).closest?.<HTMLElement>('[data-room-grip]');
      const key = (event as KeyboardEvent).key;
      if (grip && (key === 'ArrowUp' || key === 'ArrowDown')) {
        event.preventDefault();
        this.reorderRoom(grip.dataset.roomGrip!, key === 'ArrowUp' ? -1 : 1);
        return;
      }
      // Esc first closes an open help or icon chooser, not the sheet.
      const helpOpen =
        [...this.root.querySelectorAll('homemanager-help-tip, homemanager-icon-picker')].some(tip =>
          tip.shadowRoot?.querySelector(':popover-open'),
        ) || event.composedPath().some(node => (node as Element).localName === 'homemanager-icon-picker');
      if (
        (event as KeyboardEvent).key === 'Escape' &&
        !helpOpen &&
        !this.root.querySelector('dialog[open]') &&
        this.surface
      ) {
        event.stopPropagation();
        this.closeSurface();
      }
    });
    this.root.addEventListener(
      'toggle',
      event => {
        const target = event.target as HTMLDetailsElement;
        if (!target.isConnected) return;
        if (target.id) target.open ? this.openSections.add(target.id) : this.openSections.delete(target.id);
      },
      true,
    );
  }
  setConfig(config: CardConfig): void {
    if (config.home_id && config.configuration === undefined) {
      // HA's card editor dialog for an integration-backed card: the plan is edited
      // in the card or the HomeManager panel, never copied into the dashboard.
      this.homeConfig = {
        type: config.type,
        card_id: config.card_id,
        home_id: config.home_id,
        ...(config.title ? { title: config.title } : {}),
      };
      this.config = undefined;
      this.render();
      void this.refreshHomes();
      return;
    }
    this.homeConfig = undefined;
    this.homeMessage = '';
    // A V1 document is upgraded in the draft; its legacy card-level room_labels seed the space names.
    const next = {
      ...clone(config),
      configuration: validateConfiguration(
        persistentConfiguration(
          migrateConfiguration<Configuration>(config.configuration, { roomLabels: config.room_labels }),
        ),
        { allowPending: true },
      ),
    };
    if (this.config && JSON.stringify(this.config) === JSON.stringify(next)) return;
    this.config = next;
    this.openedConfiguration = undefined;
    if (
      !this._embedded &&
      (!this._selectedDeviceId ||
        !next.configuration.catalog.devices.some(device => device.id === this._selectedDeviceId))
    )
      this._selectedDeviceId = next.configuration.catalog.devices[0]?.id ?? null;
    this.render();
  }
  set hass(hass: Hass) {
    if (typeof hass.themes?.darkMode === 'boolean') this.dataset.theme = hass.themes.darkMode ? 'dark' : 'light';
    setLanguage(languageFromHass(hass));
    const first = !this._hass;
    this._hass = hass;
    const picker = this.root.querySelector<DevicePicker>('homemanager-device-picker');
    if (picker) picker.hass = hass;
    const form = this.root.querySelector<HTMLFormElement>('#device-form');
    const summary = this.root.querySelector('[data-binding-summary]');
    if (form && summary) {
      const data = new FormData(form),
        entityId = value(data, 'entityId') || null,
        deviceId = value(data, 'deviceId'),
        readings = value(data, 'readings');
      const nextSummary = this.bindingSummary({
        entityId,
        ...(deviceId ? { deviceId } : {}),
        ...(readings ? { readings: JSON.parse(readings) } : {}),
      } as Device['bindings']);
      if (summary.innerHTML !== nextSummary) {
        summary.innerHTML = nextSummary;
        this.wirePickers();
      }
    }
    if (first) this.loadRemotes();
    for (const picker of this.root.querySelectorAll<HTMLElement>('homemanager-icon-picker'))
      picker.dataset.theme = this.dataset.theme ?? '';
    if (first && (this.homeConfig || integrationAvailable(hass))) {
      void this.refreshHomes();
      if (this.config && !this._embedded) this.render();
    }
  }
  get hass(): Hass | undefined {
    return this._hass;
  }
  set selectedDeviceId(id: string | null) {
    this.selectDevice(id);
  }
  /** A different symbol cannot silently discard an invalid field. */
  selectDevice(id: string | null): boolean {
    if (id === this._selectedDeviceId && (id === null || this.surface === 'device')) return true;
    if (id !== this._selectedDeviceId && !this.flushDevice()) return false;
    this.surface = id ? 'device' : null;
    this._selectedDeviceId = id;
    this.adding = false;
    this.allowFixedPosition = false;
    this.sheet = undefined;
    this.openedConfiguration = this.config ? clone(this.configuration) : undefined;

    this.render();
    return true;
  }
  get selectedDeviceId(): string | null {
    return this._selectedDeviceId;
  }
  set embedded(value: boolean) {
    if (this._embedded === value) return;
    this._embedded = value;
    this.toggleAttribute('embedded', value);
    this.render();
  }
  get embedded(): boolean {
    return this._embedded;
  }
  get surfaceMode(): 'device' | 'add' | 'settings' | null {
    return this.surface;
  }
  get sheetExpanded(): boolean {
    return this.expanded;
  }
  setNarrow(narrow: boolean): void {
    this.dataset.narrow = String(narrow);
  }
  focusFirstField(): void {
    this.root.querySelector<HTMLInputElement>('#device-form [name=label]')?.focus({ preventScroll: true });
  }
  private notifySurface(): void {
    this.dispatchEvent(new CustomEvent('homemanager-editor-surface', { bubbles: true, composed: true }));
  }
  private setExpanded(value: boolean): void {
    this.expanded = value;
    const handle = this.root.querySelector<HTMLElement>('.sheet-handle');
    handle?.setAttribute('aria-expanded', String(value));
    handle?.setAttribute('aria-label', value ? t('Reducir ficha') : t('Ampliar ficha'));
    this.notifySurface();
  }
  private schedulePreview(): void {
    if (this.previewQueued || !this._embedded || this.surface !== 'device' || this.adding) return;
    this.previewQueued = true;
    queueMicrotask(() => {
      this.previewQueued = false;
      if (!this.isConnected || this.surface !== 'device' || this.adding) return;
      const form = this.root.querySelector<HTMLFormElement>('#device-form');
      if (!form?.checkValidity()) return;
      const fingerprint = this.deviceFingerprint();
      if (fingerprint === this.previewFingerprint) return;
      try {
        const { next, device } = this.deviceChange(form);
        const clean = validateConfiguration(persistentConfiguration(next), { allowPending: true });
        if (JSON.stringify(clean) === JSON.stringify(this.configuration)) return;
        this.config = { ...this.config!, configuration: clean };
        this.previewFingerprint = fingerprint;
        const title = this.root.querySelector('.sheet-header h2');
        if (title) title.textContent = device.display.label;
        this.root.querySelector('.sheet-glyph ha-icon')?.setAttribute('icon', device.display.icon);
        this.dispatchEvent(
          new CustomEvent('homemanager-device-preview', {
            bubbles: true,
            composed: true,
            detail: { configuration: clone(clean) },
          }),
        );
      } catch {
        // Incomplete fields stay in the sheet. Never apply or persist an invalid preview.
      }
    });
  }
  /** Explicit confirmation uses the same validation as preview, before a global save or navigation. */
  flushDevice(close = false): boolean {
    if (!this._embedded || this.surface !== 'device') return true;
    const form = this.root.querySelector<HTMLFormElement>('#device-form');
    if (!form) return true;
    if (!form.reportValidity()) return false;
    try {
      if (!this.adding && this.deviceFingerprint() === this.previewFingerprint) {
        this.dispatchEvent(new CustomEvent('homemanager-preview-finish', { bubbles: true, composed: true }));
        if (close) this.closeSurface(false);
        return true;
      }
      this.applyDeviceForm(form, close);
      return true;
    } catch (error) {
      this.notice(error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  private deviceFingerprint(): string {
    const form = this.root.querySelector<HTMLFormElement>('#device-form');
    return JSON.stringify({ fields: form ? [...new FormData(form)] : [], sheet: this.sheet, alerts: this.alertDraft });
  }
  private revertDevice(): void {
    if (!this.openedConfiguration || !this._selectedDeviceId) return;
    const next = restoreEditedDevice(this.configuration, this.openedConfiguration, this._selectedDeviceId);
    this.config = { ...this.config!, configuration: next };
    this.sheet = undefined;
    this.alertDraft = alertSettingsDraft(this.device());
    this.allowFixedPosition = false;
    this.render();
    this.dispatchEvent(
      new CustomEvent('homemanager-device-preview', {
        bubbles: true,
        composed: true,
        detail: { configuration: clone(next) },
      }),
    );
    this.focusFirstField();
  }
  getConfiguration(): Configuration | undefined {
    return this.config ? persistentConfiguration(this.config.configuration) : undefined;
  }
  private get configuration(): Configuration {
    if (!this.config) throw new Error(t('Falta la configuración de HomeManager.'));
    return this.config.configuration;
  }
  private device(): Device | undefined {
    return this.configuration.catalog.devices.find(device => device.id === this._selectedDeviceId);
  }
  private notice(message: string): void {
    const status = this.root.querySelector('.status');
    if (status) status.textContent = message;
  }
  private emit(configuration: Configuration): void {
    const clean = validateConfiguration(persistentConfiguration(configuration), { allowPending: true });
    this.config = { ...this.config!, configuration: clean };
    this.dispatchEvent(
      new CustomEvent('config-changed', { bubbles: true, composed: true, detail: { config: clone(this.config) } }),
    );
    this.render();
    this.notice(t('Borrador actualizado. Guardá los cambios para conservarlo.'));
  }
  private section(id: string, title: string, body: string): string {
    return `<details class="section" id="${id}"${this.openSections.has(id) ? ' open' : ''}><summary>${title}</summary><div class="section-body">${body}</div></details>`;
  }
  private async refreshHomes(): Promise<void> {
    if (!this._hass || !integrationAvailable(this._hass)) return;
    try {
      this.homes = await listHomes(this._hass);
    } catch {
      this.homes = undefined;
    }
    if (this.homeConfig) this.render();
  }
  private emitCard(config: Record<string, unknown>): void {
    this.dispatchEvent(new CustomEvent('config-changed', { bubbles: true, composed: true, detail: { config } }));
  }
  private homeForm(): string {
    const home = this.homeConfig!,
      homes = this.homes ?? [];
    const options = [
      ...homes.map(item =>
        option(item.home_id, item.title ? `${item.title} (${item.home_id})` : item.home_id, home.home_id),
      ),
      ...(homes.some(item => item.home_id === home.home_id)
        ? []
        : [option(home.home_id, t('{id} · todavía no existe', { id: home.home_id }), home.home_id)]),
    ].join('');
    return `<style>${css}</style><div class="editor"><h2>HomeManager</h2><p class="note">${esc(t('Esta tarjeta muestra un hogar guardado en la integración HomeManager. El plano, los espacios y los dispositivos se editan con'))} <strong>${esc(t('Editar plano'))}</strong> ${esc(t('en la tarjeta o desde el panel HomeManager; el dashboard sólo guarda la referencia.'))}</p><form id="home-card-form"><div class="grid"><label class="field">${esc(t('Hogar'))}<select name="home_id" aria-label="${esc(t('Hogar'))}">${options}</select></label>${input('title', t('Título de la tarjeta'), home.title ?? '', `maxlength="240" placeholder="${esc(t('HomeManager'))}"`)}</div><div class="actions"><button type="submit" class="primary">${esc(t('Aplicar'))}</button></div></form><div class="status" role="status" aria-live="polite">${esc(this.homeMessage)}</div></div>`;
  }
  private migrationForm(): string {
    if (this._embedded || !integrationAvailable(this._hass) || !this.config) return '';
    const suggested = this.config.card_id.slice(0, 64).replace(/-+$/, '') || 'home';
    return this.section(
      'migrate-section',
      t('Mover a la integración HomeManager'),
      `<p class="note">${esc(t('Guarda este plano en la integración (fuera del dashboard, con control de versiones e historial de planos) y deja en la tarjeta sólo la referencia. Después pulsá'))} <strong>${esc(t('Guardar'))}</strong> ${esc(t('en el editor de Home Assistant.'))}</p><form id="migrate-form"><div class="grid">${input('homeId', t('ID del hogar'), suggested, 'required maxlength="64" pattern="[a-z0-9]+(-[a-z0-9]+)*"')}</div><div class="actions"><button type="submit" class="primary"${this.migrating ? ' disabled' : ''}>${esc(t('Mover a la integración'))}</button></div></form>`,
    );
  }
  private async migrate(homeId: string): Promise<void> {
    if (!this.config || this.migrating) return;
    this.migrating = true;
    try {
      const store = new IntegrationConfigurationStore(() => this._hass, homeId);
      await store.load();
      if (store.revision !== null)
        throw new Error(
          t('Ya existe un hogar «{id}». Elegí otro ID; para mostrar ese hogar, cambiá la tarjeta a home_id: {id}.', {
            id: homeId,
          }),
        );
      // Pending references move as they are: the draft keeps the same semantics.
      await store.save(persistentConfiguration(this.config.configuration), { allowPending: true });
      const card: Record<string, unknown> = { type: this.config.type, card_id: this.config.card_id, home_id: homeId };
      if (this.config.title) card.title = this.config.title;
      this.migrating = false;
      this.homeMessage = t(
        'Plano guardado en la integración. Pulsá Guardar en el editor de Home Assistant para que la tarjeta use el hogar.',
      );
      this.emitCard(card);
      this.setConfig(card as unknown as CardConfig);
    } catch (error) {
      this.migrating = false;
      this.render();
      this.notice(error instanceof Error ? error.message : describeError(error));
    }
  }
  /** Called by the map toolbar; all surfaces edit the same draft. */
  openAdd(): void {
    if (!this.flushDevice()) return;
    this.surface = 'add';
    this.openedConfiguration = undefined;
    this.fromEntity = false;
    this.render();
    this.root.querySelector<HTMLButtonElement>('[data-command=from-entity]')?.focus();
  }
  openSettings(): void {
    if (!this.flushDevice()) return;
    this.surface = 'settings';
    this.linked = undefined;
    this.render();
  }
  openRoom(id: string, view?: RoomViewChoices): void {
    this.openSettings();
    openRoomActions(
      this.root,
      this.configuration,
      id,
      next => {
        this.emit(next);
        this.closeSurface();
      },
      view,
    );
  }
  private reviewCandidate(candidate: Configuration): void {
    const report = reportForPlan(candidate);
    const positionsChanged = candidate.catalog.devices.some(device => {
      const old = this.configuration.catalog.devices.find(item => item.id === device.id);
      return old && JSON.stringify(old.position) !== JSON.stringify(device.position);
    });
    if (!hasPlanChanges(report) && !positionsChanged) {
      this.emit(withPlanShapes(candidate));
      return;
    }
    openPlanReview(
      this.root,
      candidate,
      report,
      (next, planOnly) => {
        this.emit(withPlanShapes(next));
        this.notice(
          planOnly
            ? t(
                'Se importó sólo el plano. Los espacios y dispositivos conservan su asignación; revisá los conflictos pendientes.',
              )
            : t('Cambios aplicados al borrador. Guardá para persistirlos.'),
        );
      },
      this.configuration,
    );
  }
  closeSurface(commit = true): void {
    if (commit && !this.flushDevice()) return;
    this.surface = null;
    this.sheet = undefined;
    this.openedConfiguration = undefined;
    this.render();
    this.dispatchEvent(new CustomEvent('homemanager-editor-close', { bubbles: true, composed: true }));
  }
  /** Moves a space up or down the list and keeps its grip focused. */
  private reorderRoom(id: string, delta: -1 | 1): void {
    const index = this.configuration.rooms.findIndex(room => room.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= this.configuration.rooms.length) return;
    this.emit(moveRoom(this.configuration, id, delta));
    this.root.querySelector<HTMLElement>(`[data-room-grip="${CSS.escape(id)}"]`)?.focus();
  }
  /** Dragging a grip moves the row with the pointer; on release the space lands where it was dropped. */
  private dragRoom(event: PointerEvent): void {
    const grip = (event.target as Element).closest<HTMLElement>('[data-room-grip]');
    if (!grip || event.button !== 0) return;
    const id = grip.dataset.roomGrip!;
    const row = grip.closest<HTMLElement>('[data-room-item]')!;
    const rows = [...this.root.querySelectorAll<HTMLElement>('[data-room-item]')];
    const from = rows.indexOf(row);
    const middles = rows.map(item => {
      const box = item.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    const startY = event.clientY;
    grip.setPointerCapture(event.pointerId);
    row.classList.add('dragging');
    const move = (next: PointerEvent) => (row.style.transform = `translateY(${next.clientY - startY}px)`);
    const up = (last: PointerEvent) => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      row.classList.remove('dragging');
      row.style.transform = '';
      const y = middles[from] + (last.clientY - startY);
      const to = middles.filter((middle, index) => index !== from && middle < y).length;
      if (to === from) return;
      let next = this.configuration;
      for (let step = 0; step < Math.abs(to - from); step++) next = moveRoom(next, id, to > from ? 1 : -1);
      this.emit(next);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  }
  /** Measured once per drawing of the page; a plan that cannot be read has no diagnosis. */
  private planHealth(): PlanHealth | null {
    try {
      const states = this._hass?.states;
      return healthOfPlan(this.configuration, states ? new Set(Object.keys(states)) : undefined);
    } catch {
      return null;
    }
  }
  /** A row's button: a one-tap fix when it decides nothing else, otherwise opens what needs a decision. */
  private healthAction(issue: HealthIssue): void {
    if (canFix(issue)) {
      this.emit(applyFixes(this.configuration, [issue]));
      this.render();
      return;
    }
    if (issue.kind === 'no-geometry') this.openRoom(issue.roomId, this.roomView?.(issue.roomId));
    else if (issue.kind === 'same-name') this.openRoom(issue.rooms[0], this.roomView?.(issue.rooms[0]));
    else if (issue.kind === 'outside' || issue.kind === 'missing-entity') {
      this.closeSurface();
      this.selectedDeviceId = issue.deviceId;
    }
  }
  private settingsForm(): string {
    const pending = pendingReferences(this.configuration, this._hass?.states);
    // Conflicts with the plan are shown above every section, where they cannot be missed.
    const zoneIds = new Set(this.zones().map(zone => zone.id));
    // A space with its own shape (D22) has geometry even without a zone.
    const zoneless = this.configuration.rooms.filter(room => !zoneIds.has(room.id) && !room.shape).length;
    const unclaimed = [...zoneIds].filter(id => !this.configuration.rooms.some(room => room.id === id)).length;
    const conflicts = zoneIds.size && (zoneless || unclaimed);
    const health = this.planHealth();
    return settingsPage({
      section: this.settingsSection,
      problems: conflicts ? zoneless + unclaimed : 0,
      health: health?.issues.length ?? 0,
      pending: pending.length,
      // Moving an inline plan into the integration is offered on top too, when it applies.
      notice:
        this.migrationForm() +
        (conflicts
          ? `<div class="plan-conflicts note pending"><span>${esc(t('{rooms} espacios sin zona y {zones} zonas sin espacio', { rooms: zoneless, zones: unclaimed }))}</span><button type="button" data-command="review-spaces">${esc(t('Revisar'))}</button></div>`
          : ''),
      bodies: {
        'rooms-section': this.roomsForm(),
        'connect-section': this.connectForm(),
        'health-section': health
          ? healthBody(
              health,
              id => this.configuration.rooms.find(room => room.id === id)?.label ?? t('ningún espacio'),
            )
          : `<p class="note">${esc(t('No se pudo leer el plano.'))}</p>`,
        'actions-section': this.actionForm(),
        'panels-section': this.panelForm(),
        'pending-section': pending.length
          ? `<ul class="note pending">${pending.map(text => `<li>${esc(text)}</li>`).join('')}</ul>`
          : `<p class="note">${esc(t('No hay referencias pendientes.'))}</p>`,
        'import-section': this.importForm(),
      },
    });
  }
  private render(): void {
    const review = this.root.querySelector<HTMLDialogElement>('dialog.plan-review');
    // Native toggle events can arrive after a change event has already repainted
    // the editor. Read the current DOM before replacing it so disclosures keep
    // their actual state even when a device is changed immediately after opening.
    for (const section of this.root.querySelectorAll<HTMLDetailsElement>('details[id]'))
      section.open ? this.openSections.add(section.id) : this.openSections.delete(section.id);
    this.hidden = this._embedded && this.surface === null;
    if (this.homeConfig) {
      this.root.innerHTML = this.homeForm();
      return;
    }
    if (!this.config) {
      this.root.innerHTML = `<style>${css}</style><div class="editor">${esc(t('Configuración pendiente.'))}</div>`;
      return;
    }
    const configuration = this.configuration,
      selected = this.adding ? undefined : this.device();
    if (selected && this.surface === 'device') this.openedConfiguration ??= clone(configuration);
    const key = selected?.id ?? '';
    if (!this.sheet || this.sheet.key !== key) {
      this.sheet = sheetFromDevice(selected, key, configuration);
      this.alertDraft = alertSettingsDraft(selected);
    }
    const quick = uiButton(t('Agregar dispositivo desde Home Assistant'), 'pick-new', 'secondary', 'mdi:plus');
    const toolbar = this._embedded
      ? ''
      : `<div class="toolbar"><select id="device-select" aria-label="${esc(t('Dispositivo'))}"><option value="">${esc(t('Seleccionar icono'))}</option>${configuration.catalog.devices.map(device => option(device.id, device.display.label, selected?.id ?? '')).join('')}</select>${iconButton('add', t('Agregar dispositivo'), 'plus')}${iconButton('settings', t('Ajustes del plano'), 'settings')}</div>`;
    const header = (title: string, glyph?: string) =>
      `<div class="sheet-header">${glyph ? `<span class="sheet-glyph" aria-hidden="true"><ha-icon icon="${esc(glyph)}"></ha-icon></span>` : ''}<h2>${esc(title)}</h2>${iconButton('close', t('Cerrar'), 'close')}</div>`;
    const handle = this._embedded
      ? `<button class="sheet-handle" type="button" data-command="sheet-expand" aria-label="${esc(this.expanded ? t('Reducir ficha') : t('Ampliar ficha'))}" aria-expanded="${this.expanded}"><span aria-hidden="true"></span></button>`
      : '';
    const device = `${handle}${header(selected?.display.label ?? t('Dispositivo vacío'), selected?.display.icon ?? 'mdi:circle-outline')}<div class="sheet-body">${this.deviceForm(selected)}</div><div class="sheet-tools">${selected ? `${iconButton('delete', t('Eliminar dispositivo'), 'trash', 'data-danger="true"')}${iconButton('move', t('Mover en el plano'), 'move')}${iconButton('revert-device', t('Deshacer cambios de este dispositivo'), 'undo')}` : ''}<span class="spacer"></span>${submitIconButton('device-form', this._embedded ? t('Listo') : t('Guardar dispositivo'), 'check')}</div>`;
    const add = `${handle}${header(t('Agregar dispositivo'))}<div class="sheet-body"><div class="add-menu"><button type="button" data-command="from-entity">${esc(t('Desde Home Assistant'))}</button><button type="button" data-command="add">${esc(t('Dispositivo vacío'))}</button></div>${this.fromEntity ? quick : ''}</div>`;
    const settings =
      this.surface === 'settings'
        ? `<dialog class="settings-dialog" aria-label="${esc(t('Ajustes del plano'))}">${header(t('Ajustes del plano'))}${this.settingsForm()}<div class="status" role="status" aria-live="polite"></div></dialog>`
        : '';
    this.root.innerHTML = `<style>${css}</style><div class="editor">${toolbar}${this.surface === 'settings' ? '' : this.surface === 'add' ? add : (!this._embedded || this.surface === 'device') && (selected || this.adding || !configuration.catalog.devices.length) ? device : ''}${!this._embedded && this.surface !== 'add' && this.surface !== 'settings' ? quick : ''}${settings}${this.surface === 'settings' ? '' : '<div class="status" role="status" aria-live="polite"></div>'}</div>`;
    for (const field of this.root.querySelectorAll<HTMLInputElement>('input[data-entity-picker]'))
      enhanceEntityInput(field, () => this._hass);
    this.wirePickers();
    const dialog = this.root.querySelector<HTMLDialogElement>('.settings-dialog');
    if (dialog) {
      dialog.addEventListener('cancel', event => {
        event.preventDefault();
        this.closeSurface();
      });
      dialog.showModal();
    }
    // A repaint, such as the list of homes arriving, must not lose a review in progress.
    if (review) {
      review.removeAttribute('open');
      this.root.append(review);
      review.showModal();
    }
    this.setAttribute('role', 'region');
    this.setAttribute('aria-label', t('Ficha de edición'));
    this.previewFingerprint = this.deviceFingerprint();
    this.notifySurface();
  }
  private roomOptions(selected: string): string {
    return (
      option('', t('Sin espacio asignado'), selected) +
      this.configuration.rooms.map(room => option(room.id, room.label, selected)).join('')
    );
  }
  private zones(): { id: string; label: string | null }[] {
    try {
      return detectZones(sanitizeArchitecture(this.configuration.architecture.content).svg);
    } catch {
      return [];
    }
  }
  private roomsForm(): string {
    const rooms = this.configuration.rooms,
      zones = this.zones(),
      zoneIds = new Set(zones.map(zone => zone.id));
    const candidates = zones.filter(zone => !rooms.some(room => room.id === zone.id));
    let content = '';
    try {
      content = sanitizeArchitecture(this.configuration.architecture.content).content;
    } catch {
      /* No thumbnail for a plan that cannot be drawn. */
    }
    return `${planCard(content, zones.length, rooms.length)}<div class="rooms-actions">${this.editZones ? `<button type="button" class="primary" data-command="zones-edit"><ha-icon icon="mdi:vector-square-edit" aria-hidden="true"></ha-icon>${esc(t('Editar zonas'))}</button>` : ''}<button type="button" data-command="review-spaces">${esc(t('Revisar espacios con el plano'))}</button></div>${spacesList(this.configuration, zoneIds)}
      ${candidates.length ? `<h4>${esc(t('Zonas detectadas en el plano'))}</h4><div class="toolbar">${candidates.map(zone => `<button type="button" data-command="room-add-zone" data-room="${esc(zone.id)}" data-label="${esc(zone.label ?? '')}">${esc(t('Agregar {room}', { room: zone.label ?? zone.id }))}</button>`).join('')}<button type="button" data-command="room-add-all">${esc(t('Agregar todas ({count})', { count: candidates.length }))}</button></div>` : ''}
      <details class="section" id="room-add-section"${this.openSections.has('room-add-section') ? ' open' : ''}><summary>${esc(t('Agregar un espacio sin dibujarlo'))}</summary><div class="section-body"><form id="room-add-form"><div class="grid">${input('roomId', t('ID del nuevo espacio'), '', `placeholder="${esc(t('kebab-case, p. ej. estudio'))}" pattern="[a-z0-9]+(-[a-z0-9]+)*"`)}${input('roomLabel', t('Nombre del nuevo espacio'), '', 'maxlength="240"')}</div><div class="actions"><button type="submit">${esc(t('Agregar espacio'))}</button></div></form></div></details>`;
  }
  private deviceForm(device?: Device): string {
    const fixed = device?.mobility === 'fixed' && !this.allowFixedPosition;
    const panels = Object.keys(this.configuration.panels);
    const panelId = device?.bindings.advancedPopupId ?? '';
    const remoteId = device?.bindings.remoteId ?? '';
    const help = (label: string, text: string) =>
      `<span class="field-title">${esc(label)}${helpTip(label, text)}</span>`;
    const icon = device?.display.icon ?? 'mdi:lightbulb-outline';
    const remotes = this.remotes.length
      ? `<div class="field">${help(t('Control RF en el panel'), t('El control diseñado en Controles RF que se dibuja en el panel de este dispositivo. Automático usa el de su entidad.'))}<select form="device-form" name="remoteId" aria-label="${esc(t('Control RF en el panel'))}">${option('', t('Automático'), remoteId)}${this.remotes.map(remote => option(remote.id, remote.name, remoteId)).join('')}</select></div>`
      : '';
    const advanced = `${input('id', t('ID del dispositivo'), device?.id ?? '', device ? 'readonly form="device-form"' : `form="device-form" placeholder="${esc(t('Automático si se deja vacío'))}"`)}
      <div class="field">${help(t('Movilidad del dispositivo'), t('Fijo bloquea la ubicación. Editable permite moverlo; portátil representa un equipo que cambia de lugar.'))}<select form="device-form" name="mobility" aria-label="${esc(t('Movilidad del dispositivo'))}">${['fixed', 'editable', 'portable'].map(mobility => option(mobility, mobility, device?.mobility ?? 'editable')).join('')}</select></div>
      ${input('x', t('Posición X'), snapToGrid(device?.position.x ?? 0.5), `form="device-form" type="number" min="0" max="1" step="any" required data-location${fixed ? ' disabled' : ''}`)}${input('y', t('Posición Y'), snapToGrid(device?.position.y ?? 0.5), `form="device-form" type="number" min="0" max="1" step="any" required data-location${fixed ? ' disabled' : ''}`)}
      <div class="field">${help(t('Panel nativo'), t('Un panel con acciones fijas definido en Ajustes del plano. Se muestra junto a los controles.'))}<select form="device-form" name="panelId" aria-label="${esc(t('Panel nativo'))}">${option('', t('Sin panel'), panelId)}${panelId && !panels.includes(panelId) ? option(panelId, panelId, panelId) : ''}${panels.map(key => option(key, key, panelId)).join('')}</select></div>`;
    const category = this.sheetCategory(device);
    const sections = sectionsOf(category);
    const show = `<div data-section="show"${sections.show ? '' : ' hidden'}>${uiSegmented(
      t('Qué muestra el símbolo'),
      'show',
      [
        { value: 'icon', label: t('Icono') },
        { value: 'value', label: t('Valor') },
        { value: 'both', label: t('Los dos') },
      ],
      device?.display.show ?? 'value',
    )}</div>`;
    const categoryBody = uiChoices(
      t('Categoría'),
      'category',
      CATEGORIES.map(value => ({ value, ...categoryInfo(value) })),
      category,
    );
    const binding = `<div class="field">${help(t('Dispositivo de Home Assistant'), t('Elegí el dispositivo y las lecturas que querés mostrar. Los controles actuales se conservan.'))}<div data-binding-summary>${this.bindingSummary(device?.bindings)}</div><input type="hidden" name="entityId" value="${esc(device?.bindings.entityId ?? '')}"><input type="hidden" name="deviceId" value="${esc(device?.bindings.deviceId ?? '')}"><input type="hidden" name="readings" value="${esc(device?.bindings.readings ? JSON.stringify(device.bindings.readings) : '')}"></div>`;
    return `<form id="device-form"><div class="basic"><input type="hidden" name="kind" value="${esc(device?.kind ?? '')}">${input('label', t('Nombre del dispositivo'), device?.display.label ?? '', 'required maxlength="240"')}
      <div class="base-row"><div class="field"><span class="field-title">${esc(t('Icono del dispositivo'))}</span>${iconPicker(icon, t('Icono del dispositivo'), 'wide data-device-icon')}<input type="hidden" name="icon" value="${esc(icon)}"></div><div class="field">${help(t('Habitación del dispositivo'), t('Agrupa el dispositivo en un espacio del plano. No cambia su área en Home Assistant.'))}<select name="roomId" aria-label="${esc(t('Habitación del dispositivo'))}">${this.roomOptions(device ? (device.roomId ?? '') : '')}</select></div></div>
      <div class="size-host">${renderSymbolSize(this.sheet!.size)}</div>${show}</div>
      <details class="section sheet-category" id="device-category"${this.openSections.has('device-category') ? ' open' : ''}><summary>${esc(t('Categoría'))}<small>${esc(categoryInfo(category).label)}</small></summary><div class="section-body">${categoryBody}</div></details>
      ${this.section('device-binding', t('Dispositivo de Home Assistant'), binding)}${this.section('device-alerts', t('Avisos'), '<homemanager-alert-editor></homemanager-alert-editor>')}${remotes ? `<div data-section="remote"${sections.remote ? '' : ' hidden'}>${this.section('device-remote', t('Control RF en el panel'), remotes)}</div>` : ''}</form>
      <div data-section="controls"${sections.controls ? '' : ' hidden'}>${this.section('device-controls-section', t('Controles'), `<div class="ctl-host">${this.controlsSection()}</div>`)}</div>
      <details class="advanced" id="device-options"${this.openSections.has('device-options') ? ' open' : ''}><summary>${esc(t('Más opciones'))}</summary><div class="grid">${advanced}</div>${fixed ? `<button type="button" data-command="correct-fixed">${esc(t('Corregir ubicación fija'))}</button>` : ''}${device ? this.section('state-section', t('Fuente de estado'), this.stateForm(device)) : ''}${iconButton('reset', t('Restablecer valores sugeridos'), 'reset')}</details>`;
  }
  /** The category the sheet starts with: stored, else suggested by the device and its entity. */
  private sheetCategory(device?: Device): Category {
    if (device) return categoryOf(device, this._hass);
    const entityId = this.sheetEntity();
    if (!entityId) return 'switch';
    const kind = suggestPresentation(entityId, this._hass?.states[entityId]).kind;
    return categoryOf(
      { id: 'new', roomId: null, kind, display: { label: '', icon: '' }, bindings: { entityId } },
      this._hass,
    );
  }
  /** Linking another entity proposes its category, unless the person already chose one. */
  private proposeCategory(entityId: string): void {
    const choices = this.root.querySelector<HTMLFieldSetElement>('#device-form .k-choices');
    if (!choices || choices.hasAttribute('data-chosen') || !entityId) return;
    const kind = suggestPresentation(entityId, this._hass?.states[entityId]).kind;
    const category = categoryOf(
      { id: 'new', roomId: null, kind, display: { label: '', icon: '' }, bindings: { entityId } },
      this._hass,
    );
    const radio = choices.querySelector<HTMLInputElement>(`input[value="${category}"]`);
    if (radio) radio.checked = true;
    this.applySections(category);
  }
  /** Shows only the chosen category's sections; hidden ones keep their data until saved. */
  private applySections(category: Category): void {
    const sections = sectionsOf(category);
    for (const [name, visible] of Object.entries(sections))
      for (const node of this.root.querySelectorAll<HTMLElement>(`[data-section="${name}"]`)) node.hidden = !visible;
    this.configureAlerts(category);
  }
  private alertDraft?: AlertSettingsDraft;
  private configureAlerts(category?: Category): void {
    const editor = this.root.querySelector<AlertEditor>('homemanager-alert-editor');
    if (!editor || !this.alertDraft) return;
    const get = (name: string) =>
      this.root.querySelector<HTMLInputElement>(`#device-form [name="${name}"]`)?.value ?? '';
    const chosen =
      category ??
      (this.root.querySelector<HTMLInputElement>('#device-form [name="category"]:checked')?.value as Category);
    editor.configure(
      this.alertDraft,
      {
        id: this.device()?.id ?? 'new',
        roomId: get('roomId') || null,
        kind: get('kind'),
        display: { label: get('label'), icon: get('icon'), category: chosen },
        bindings: { entityId: get('entityId') || null, ...(get('deviceId') ? { deviceId: get('deviceId') } : {}) },
      },
      chosen,
      this._hass,
    );
  }
  /** Sheet model of the device being edited (controls, tap, pins, size). */
  private sheet?: SheetModel;
  private controlsSection(): string {
    return renderControlsEditor(this.sheet!, this.suggestions(), this.actionChoices());
  }
  /** New suggestions for the action selects, without replacing anything else:
   * this runs on a field's change, often in the middle of a click elsewhere. */
  private refreshSuggestions(): void {
    if (!this.sheet) return;
    const suggestions = this.suggestions();
    const actions = this.actionChoices();
    for (const select of this.root.querySelectorAll<HTMLSelectElement>('.ctl-host select[data-field=action]')) {
      const control = this.sheet.controls[Number(select.dataset.ctl)];
      const step = control?.steps[Number(select.dataset.step)];
      if (step) select.innerHTML = actionOptionsHtml(step.actionId, suggestions, actions);
    }
  }
  private actionChoices(): { id: string; label: string }[] {
    const name = (entityId: string) => friendlyName(this._hass, entityId);
    return Object.entries(this.configuration.actions).map(([id, action]) => ({ id, label: actionName(action, name) }));
  }
  private paintControls(): void {
    const host = this.root.querySelector<HTMLElement>('.ctl-host');
    if (!host || !this.sheet) return;
    host.innerHTML = this.controlsSection();
    const sizes = this.root.querySelector('.size-host');
    if (sizes) sizes.innerHTML = renderSymbolSize(this.sheet.size);
    this.wirePickers();
  }
  private wirePickers(): void {
    this.configureAlerts();
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-action=binding],[data-action=pick-new]'))
      button.onclick = () => this.pickDevice(button.dataset.action === 'pick-new');
    for (const field of this.root.querySelectorAll<HTMLInputElement>('input[data-entity-picker]'))
      enhanceEntityInput(field, () => this._hass);
    // Icons of the session's entities join the built-in suggestions.
    const extra = [
      ...new Set(
        Object.values(this._hass?.states ?? {})
          .map(entity => entity.attributes?.icon)
          .filter((icon): icon is string => typeof icon === 'string'),
      ),
    ].slice(0, 300);
    for (const picker of this.root.querySelectorAll<HTMLElement & { extra: string[] }>('homemanager-icon-picker')) {
      picker.extra = extra;
      picker.dataset.theme = this.dataset.theme ?? '';
    }
  }
  private bindingSummary(bindings?: Device['bindings'] | DeviceSelection): string {
    const entityId = bindings?.entityId,
      deviceId = bindings?.deviceId;
    const registry = deviceId ? this._hass?.devices?.[deviceId] : undefined;
    const name = registry
      ? deviceName(registry, this._hass)
      : entityId
        ? personName(this._hass?.states[entityId]?.attributes?.friendly_name, readingName(entityId, this._hass))
        : t('Sin vincular');
    const detail =
      deviceId && entityId
        ? readingName(entityId, this._hass)
        : entityId
          ? t('Vínculo de lectura conservado')
          : t('Elegí qué querés ver en el plano.');
    return (
      uiBinding(name, detail, deviceId ? t('Cambiar dispositivo') : t('Vincular dispositivo')) +
      (bindings && bindingIssues(bindings, this._hass).length
        ? uiNotice(t('Una lectura falta o ya no pertenece a este dispositivo. Revisá el vínculo.'), 'alert')
        : '')
    );
  }
  private pickDevice(adding = false): void {
    const form = this.root.querySelector<HTMLFormElement>('#device-form');
    const get = (name: string) => form?.querySelector<HTMLInputElement>(`[name=${name}]`)?.value ?? '';
    const entityId = get('entityId');
    const binding =
      !adding && entityId
        ? {
            entityId,
            ...(get('deviceId') ? { deviceId: get('deviceId') } : {}),
            readings: get('readings') ? JSON.parse(get('readings')) : [],
          }
        : undefined;
    const preferred = this.configuration.rooms.find(room => room.id === get('roomId'))?.label;
    const trigger = this.root.activeElement as HTMLElement | null;
    openDevicePicker(this.root, this._hass, this.configuration.catalog.devices, binding, preferred, selection => {
      if (!selection) {
        trigger?.focus();
        return;
      }
      if (adding) {
        this.addFromEntity(selection.entityId, selection);
        return;
      }
      if (!form?.isConnected) return;
      for (const [name, value] of Object.entries({
        entityId: selection.entityId,
        deviceId: selection.deviceId ?? '',
        readings: selection.deviceId ? JSON.stringify(selection.readings) : '',
      }))
        form.querySelector<HTMLInputElement>(`[name=${name}]`)!.value = value;
      this.root.querySelector('[data-binding-summary]')!.innerHTML = this.bindingSummary(selection);
      form.querySelector<HTMLInputElement>('[name=entityId]')!.dispatchEvent(new Event('change', { bubbles: true }));
      this.wirePickers();
      this.root.querySelector<HTMLButtonElement>('[data-action=binding]')?.focus();
    });
  }
  /** Entity of the sheet: the field as typed, else the saved binding. */
  private sheetEntity(): string | null {
    const typed = this.root.querySelector<HTMLInputElement>('#device-form [name=entityId]')?.value.trim();
    if (typed !== undefined) return typed && this._hass?.states[typed] ? typed : null;
    return this.device()?.bindings.entityId ?? null;
  }
  /** RF remotes, to choose the one a device's panel draws. Admins only, like
   * the editor itself; without the RF manager the list stays empty. */
  private remotes: RfRemote[] = [];
  private loadRemotes(): void {
    const hass = this._hass;
    if (!hass?.callWS || hass.user?.is_admin !== true) return;
    rf.library(hass)
      .then(library => {
        this.remotes = library.remotes;
        if (library.remotes.length && this.surface === 'device') this.render();
      })
      .catch(() => undefined);
  }
  private remoteOf(entityId: string | null): string | null {
    const entity = entityId ? this._hass?.states[entityId] : undefined;
    const fromEntity = entity?.attributes?.homemanager_remote ?? entity?.attributes?.homemanager_remote_button;
    const chosen = this.root.querySelector<HTMLSelectElement>('#device-form [name=remoteId], [name=remoteId]')?.value;
    return chosen || this.device()?.bindings.remoteId || (typeof fromEntity === 'string' ? fromEntity : null);
  }
  /** What a step can do without writing an action by hand: the simple services
   * of the device's entity, and for an RF remote also its other parts (a light
   * of the same remote, say) and its loose buttons. Picking one creates the action. */
  private suggestions(): Suggestion[] {
    const names = SIMPLE_SERVICES();
    const found: Suggestion[] = [];
    const entityId = this.sheetEntity();
    const add = (id: string) => {
      const domain = id.split('.')[0];
      const group = friendlyName(this._hass, id);
      for (const service of ALLOWED[domain] ?? [])
        if (names[service] && this.canSuggest(id, domain, service))
          found.push({ value: `new:${domain}.${service}:${id}`, label: serviceLabel(service, domain), group });
    };
    if (entityId) add(entityId);
    const remote = this.remoteOf(entityId);
    if (remote) {
      const remoteName = this.remotes.find(item => item.id === remote)?.name ?? '';
      const buttons: Suggestion[] = [];
      for (const [id, state] of Object.entries(this._hass?.states ?? {})) {
        if (id === entityId) continue;
        if (state.attributes?.homemanager_remote === remote) add(id);
        else if (state.attributes?.homemanager_remote_button === remote)
          buttons.push({
            value: `new:button.press:${id}`,
            label:
              String(state.attributes?.friendly_name ?? id)
                .replace(remoteName, '')
                .trim() || id,
            group: t('Botones de {remote}', { remote: remoteName || remote }),
          });
      }
      found.push(...buttons);
    }
    return found;
  }
  private stateForm(device?: Device): string {
    if (!device) return `<p class="note">${esc(t('Seleccioná un icono para declarar su fuente.'))}</p>`;
    const source = this.configuration.stateSources[device.id];
    const kinds: [string, string][] = [
      ['optimistic', t('Lo que informa Home Assistant')],
      ['measured', t('Medido por un sensor independiente')],
      ['transmitter', t('Solo envío (sin lectura)')],
    ];
    return `<form id="state-form"><div class="grid">${input('entityId', t('Entidad de estado'), source?.entityId ?? device.bindings.entityId ?? '', `data-entity-picker="" placeholder="${esc(t('Sin fuente'))}"`)}${input('attribute', t('Atributo de estado'), source?.attribute ?? '', `placeholder="${esc(t('Estado principal si se deja vacío'))}"`)}<div class="field"><span class="field-title">${esc(t('Tipo de lectura'))}${helpTip(t('Tipo de lectura'), t('Medido sólo si la entidad es un sensor que observa el equipo por su cuenta (por ejemplo un medidor de consumo), no el mismo control que envía el comando. Ninguna opción convierte un comando enviado en un estado confirmado.'))}</span><select name="feedback" aria-label="${esc(t('Tipo de lectura'))}">${kinds.map(([kind, label]) => option(kind, label, source?.feedback ?? 'optimistic')).join('')}</select></div></div><div class="actions"><button type="submit" class="primary">${esc(t('Aplicar fuente'))}</button></div></form>`;
  }
  private actionForm(): string {
    const action = this.configuration.actions[this.actionId],
      domain = action?.domain ?? 'light';
    const targets = action
      ? Array.isArray(action.target.entity_id)
        ? action.target.entity_id.join(', ')
        : action.target.entity_id
      : '';
    return `<label class="field">${esc(t('Acción a editar'))}<select aria-label="${esc(t('Acción a editar'))}" id="action-select">${option('', t('Nueva acción'), this.actionId)}${Object.keys(
      this.configuration.actions,
    )
      .map(key => option(key, key, this.actionId))
      .join(
        '',
      )}</select></label><form id="action-form"><div class="grid">${input('actionId', t('ID de acción'), this.actionId, this.actionId ? 'required readonly' : 'required')}<label class="field">${esc(t('Dominio'))}<select name="domain" aria-label="${esc(t('Dominio'))}">${Object.keys(
      SERVICES,
    )
      .map(key => option(key, key, domain))
      .join(
        '',
      )}</select></label><label class="field">${esc(t('Servicio'))}<select name="service" aria-label="${esc(t('Servicio'))}">${SERVICES[domain].map(service => option(service, service, action?.service ?? SERVICES[domain][0])).join('')}</select></label>${input('targets', t('Destinos de la acción'), targets, `required placeholder="${esc(t('dominio.entidad; separá varios con comas'))}"`)}<label class="field full">${esc(t('Datos de la acción'))}<textarea name="data" aria-label="${esc(t('Datos de la acción'))}" maxlength="8192">${esc(JSON.stringify(action?.data ?? {}, null, 2))}</textarea></label></div><p class="note">${esc(t('Destinos explícitos; sin códigos de radio ni plantillas. Los scripts requieren comprobar sus parámetros y firma en HA.'))}</p><div class="actions"><button type="submit" class="primary">${esc(t('Aplicar acción'))}</button></div></form>`;
  }
  private controlRows(): string {
    return this.panelRows
      .map(
        (control, index) =>
          `<div class="control-row">${input(`control-id-${index}`, t('ID de control {n}', { n: index + 1 }), control.id, 'required')}${input(`control-label-${index}`, t('Nombre de control {n}', { n: index + 1 }), control.label, 'required')}<label class="field">Acción de control ${index + 1}<select name="control-action-${index}" aria-label="Acción de control ${index + 1}">${option('', t('Elegir acción'), control.actionId)}${control.actionId && !Object.hasOwn(this.configuration.actions, control.actionId) ? option(control.actionId, `${control.actionId} · pendiente`, control.actionId) : ''}${Object.keys(
            this.configuration.actions,
          )
            .map(key => option(key, key, control.actionId))
            .join(
              '',
            )}</select></label><button type="button" data-command="remove-control" data-index="${index}" aria-label="Quitar control ${index + 1}">×</button></div>`,
      )
      .join('');
  }
  private updateControlRows(): void {
    // Keep the other form values intact while adding/removing a row.
    const group = this.root.querySelector('#panel-form .controls');
    if (group) group.innerHTML = this.controlRows();
  }
  private panelForm(): string {
    const panel = this.configuration.panels[this.panelId];
    return `<label class="field">${esc(t('Panel a editar'))}<select id="panel-select" aria-label="${esc(t('Panel a editar'))}">${option('', t('Nuevo panel'), this.panelId)}${Object.keys(
      this.configuration.panels,
    )
      .map(key => option(key, key, this.panelId))
      .join(
        '',
      )}</select></label><form id="panel-form"><div class="grid">${input('panelId', t('ID de panel'), this.panelId, this.panelId ? 'required readonly' : 'required')}${input('title', t('Título del panel'), panel?.title ?? '', 'required')}<label class="field">${esc(t('Tipo de panel'))}<select name="kind" aria-label="${esc(t('Tipo de panel'))}">${option('device-controls', t('Controles de dispositivo'), panel?.kind ?? 'device-controls')}${option('rf-fan', t('Ventilador RF mediante scripts HA'), panel?.kind ?? 'device-controls')}</select></label></div><div class="controls" role="group" aria-label="${esc(t('Controles del panel'))}">${this.controlRows()}</div><button type="button" data-command="add-control">${esc(t('Agregar control'))}</button><div class="actions"><button type="submit" class="primary">${esc(t('Aplicar panel'))}</button></div></form>`;
  }
  /** Where to keep the drawing so it updates by itself (stage 4 of 0.10). */
  private linkedBox(): string {
    if (!this.homeId || !this.linkedReview || !integrationAvailable(this._hass) || this._hass?.user?.is_admin !== true)
      return '';
    if (this.linked === undefined) {
      this.linked = null;
      void this.loadLinked();
    }
    const linked = this.linked;
    if (!linked) return '';
    const pending = linked.state === 'ready' && linked.sha256 !== linked.seen_sha256;
    const text =
      linked.state === 'missing'
        ? t('Todavía no hay ningún archivo ahí.')
        : linked.state === 'too_large'
          ? t('El archivo es demasiado grande: admite hasta 3 MiB.')
          : linked.state === 'unreadable'
            ? t('El archivo no se pudo leer.')
            : pending
              ? t('Hay una versión del archivo sin aplicar.')
              : t('La última versión del archivo ya se aplicó o se ignoró.');
    return `<div class="linked-box"><h3>${esc(t('Plano vinculado'))}</h3><p>${esc(t('Guardá el dibujo en este archivo de Home Assistant. Si no afecta espacios ni dispositivos se aplica solo, y si los afecta te pregunta.'))}</p><code>${esc(linked.path)}</code><p class="note">${esc(text)}</p>${pending ? `<button type="button" data-command="linked-review">${esc(t('Revisar'))}</button>` : ''}</div>`;
  }
  private async loadLinked(): Promise<void> {
    if (!this._hass || !this.homeId) return;
    try {
      this.linked = await fetchLinkedPlan(this._hass, this.homeId);
      this.render();
    } catch {
      // An older integration simply has no linked plan to show.
    }
  }
  /** A drawing that did not come from a file input: same preview as any import. */
  importPlanSource(source: string): void {
    this.surface = 'settings';
    this.settingsSection = 'import-section';
    // First: rendering would take away the review dialog the preview may open.
    this.render();
    try {
      this.previewImport(source, true);
    } catch (error) {
      this.notice(error instanceof Error ? error.message : String(error));
    }
  }
  private connectAreas(): Record<string, { name?: string }> {
    return { ...this.connectCreated, ...this._hass?.areas };
  }
  private connectCatalog() {
    const devices = this.configuration.catalog.devices;
    return [...deviceCatalog(this._hass, devices), ...looseEntities(this._hass, devices)];
  }
  private connectForm(): string {
    const rooms = this.configuration.rooms;
    const areas = this.connectAreas();
    this.connectChoices = { ...suggestAreas(rooms, areas), ...this.connectChoices };
    return connectBody({
      rooms,
      areas,
      known: !!this._hass?.areas,
      choices: this.connectChoices,
      proposals: areaProposals(rooms, this.connectCatalog()),
      picked: this.connectPicked,
      busy: this.connectBusy,
    });
  }
  /** The only step that writes to Home Assistant, and only for the areas the button names. */
  private async connectApply(): Promise<void> {
    const hass = this._hass;
    if (!hass?.callWS || this.connectBusy) return;
    if (sharedAreas(this.connectChoices).length) {
      this.notice(t('Dos espacios no pueden compartir un área: sus dispositivos no sabrían a cuál ir.'));
      return;
    }
    this.connectBusy = true;
    this.render();
    const links: Record<string, string | null> = {};
    let failure = '';
    for (const room of this.configuration.rooms) {
      const choice = this.connectChoices[room.id];
      if (choice !== CREATE_AREA) {
        links[room.id] = choice || null;
        continue;
      }
      try {
        const area = await hass.callWS<{ area_id: string }>({ type: 'config/area_registry/create', name: room.label });
        this.connectCreated[area.area_id] = { name: room.label };
        this.connectChoices[room.id] = area.area_id;
        links[room.id] = area.area_id;
      } catch (error) {
        // What was created stays linked; this one can be retried or chosen by hand.
        failure = t('No se pudo crear el área «{room}»: {reason}', { room: room.label, reason: describeError(error) });
        break;
      }
    }
    this.connectBusy = false;
    this.emit(withAreaLinks(this.configuration, links));
    this.notice(failure || t('Espacios vinculados en el borrador. Guardá el plano para conservarlo.'));
  }
  private connectAdd(): void {
    const hass = this._hass;
    if (!hass) return;
    const rooms = this.configuration.rooms;
    const catalog = deviceCatalog(hass, this.configuration.catalog.devices);
    const proposals = areaProposals(rooms, this.connectCatalog());
    const rects = spaceRects(this.configuration);
    let next = this.configuration,
      added = 0;
    for (const proposal of proposals) {
      const devices = proposal.devices.filter(device => this.connectPicked.has(device.deviceId));
      const spots = spreadInRoom(rects[proposal.roomId] ?? [], devices.length);
      devices.forEach((device, index) => {
        const full = catalog.find(item => item.deviceId === device.deviceId);
        next = this.deviceFromEntity(
          next,
          device.primaryEntityId,
          isLooseEntity(device.deviceId) || !full
            ? undefined
            : {
                deviceId: device.deviceId,
                entityId: device.primaryEntityId,
                readings: pickerReadings(full)
                  .primary.slice(1)
                  .map(reading => reading.entityId),
              },
          { roomId: proposal.roomId, position: spots[index] },
        ).next;
        added++;
      });
    }
    if (!added) {
      this.notice(t('Marcá primero los dispositivos que querés agregar.'));
      return;
    }
    this.connectPicked.clear();
    this.emit(next);
    this.notice(
      t('{count} dispositivos agregados al borrador. Movelos a su lugar y guardá el plano.', { count: added }),
    );
  }
  private importForm(): string {
    const imported = this.imported;
    const history =
      this.homeId && integrationAvailable(this._hass)
        ? `<div class="plans-box">${this.plans ? (this.plans.length ? `<div class="plans">${this.plans.map(plan => `<div class="plan"><span>${esc(new Date(plan.created_at).toLocaleString(getLanguage()))} · ${esc(t('revisión {n}', { n: plan.revision }))} · ${Math.ceil(plan.bytes / 1024)} KiB</span><button type="button" data-command="restore-plan" data-plan="${esc(plan.plan_id)}">${esc(t('Restaurar'))}</button></div>`).join('')}</div>` : `<p class="note">${esc(t('Todavía no hay planos anteriores.'))}</p>`) : `<button type="button" data-command="plans">${esc(t('Planos anteriores'))}</button>`}</div>`
        : '';
    return `${this.linkedBox()}${history}<div class="toolbar"><button type="button" data-command="export">${esc(t('Exportar JSON'))}</button><label class="file">${esc(t('Importar JSON o SVG'))}<input type="file" aria-label="${esc(t('Importar JSON o SVG'))}" accept=".json,.svg,application/json,image/svg+xml" id="import-file"></label></div>${imported ? `<div class="preview"><h3>${esc(t('Resumen de importación'))}</h3><ul><li>Iconos nuevos: ${imported.summary.added.length}</li><li>Iconos eliminados: ${imported.summary.removed.length}</li><li>Iconos modificados: ${imported.summary.changed.length}</li><li>Acciones: ${imported.summary.actions}; paneles: ${imported.summary.panels}</li><li>Arquitectura: ${imported.summary.architectureChanged ? 'se reemplaza' : 'se conserva'}</li><li>Espacios nuevos: ${imported.summary.roomsAdded.length}; quitados: ${imported.summary.roomsRemoved.length}</li></ul>${importLossNote(imported.losses)}${imported.missingZones.length ? `<p class="note pending">Espacios sin zona en el nuevo plano: ${imported.missingZones.map(esc).join(', ')}. Sus dispositivos se conservan; el encuadre de esos espacios queda deshabilitado hasta agregar la zona.</p>` : ''}${imported.newZones.length ? `<p class="note">Zonas nuevas detectadas: ${imported.newZones.map(esc).join(', ')}. Podés agregarlas desde Espacios.</p>` : ''}${imported.viewBoxChanged ? `<fieldset class="mode"><legend>${esc(t('El viewBox cambió. ¿Cómo conservar las posiciones?'))}</legend><label class="check"><input type="radio" name="position-mode" value="drawing"${imported.positionMode === 'drawing' ? ' checked' : ''}><span>${esc(t('Mismo punto del dibujo (el plano se recortó o amplió)'))}</span></label><label class="check"><input type="radio" name="position-mode" value="relative"${imported.positionMode === 'relative' ? ' checked' : ''}><span>${esc(t('Misma proporción (el plano completo se reescaló)'))}</span></label></fieldset><p class="note pending">${esc(t('Exportá una copia actual antes de aplicar.'))}</p>` : ''}<div class="actions"><button type="button" data-command="cancel-import">${esc(t('Cancelar importación'))}</button><button type="button" data-command="backup">${esc(t('Exportar copia actual'))}</button><button type="button" class="primary" data-command="apply-import"${(imported.viewBoxChanged || losesData(imported.losses)) && !imported.backedUp ? ' disabled' : ''}>${esc(t('Aplicar importación al borrador'))}</button></div></div>` : ''}`;
  }
  private captureRows(): NativePanel['controls'] {
    const form = this.root.querySelector<HTMLFormElement>('#panel-form');
    if (!form) return this.panelRows;
    const data = new FormData(form);
    return this.panelRows.map((_, index) => ({
      id: value(data, `control-id-${index}`),
      label: value(data, `control-label-${index}`),
      actionId: value(data, `control-action-${index}`),
    }));
  }
  private onClick = (event: Event): void => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-command]');
    if (!button || button.disabled || !this.config) return;
    if (this.sheet && button.closest('.ctl-host, .size-host')) {
      const icon = this.root.querySelector<HTMLInputElement>('#device-form [name=icon]')?.value ?? 'mdi:shape';
      if (editCommand(this.sheet, button, this.suggestions(), icon)) {
        this.paintControls();
        const again = button.dataset.ctl
          ? this.root.querySelector<HTMLElement>(
              `.ctl-host [data-command="${button.dataset.command}"][data-ctl="${button.dataset.ctl}"]`,
            )
          : this.root.querySelector<HTMLElement>(
              button.dataset.size
                ? `.size-host [data-size="${button.dataset.size}"]`
                : `.ctl-host [data-command="${button.dataset.command}"]`,
            );
        (again ?? this.root.querySelector<HTMLElement>('.ctl-host .ctl:last-of-type input'))?.focus();
      }
      return;
    }
    try {
      switch (button.dataset.command) {
        case 'health-action': {
          const issue = this.planHealth()?.issues[Number(button.dataset.issue)];
          if (issue) this.healthAction(issue);
          break;
        }
        case 'health-fix-safe': {
          const safe = this.planHealth()?.issues.filter(isSafeFix) ?? [];
          if (safe.length) this.emit(applyFixes(this.configuration, safe));
          this.render();
          break;
        }
        case 'room-open': {
          const id = button.dataset.room!;
          this.openRoom(id, this.roomView?.(id));
          break;
        }
        case 'connect-apply':
          void this.connectApply();
          break;
        case 'connect-add':
          this.connectAdd();
          break;
        case 'linked-review':
          this.linkedReview?.();
          break;
        case 'zones-edit':
          this.closeSurface();
          this.editZones?.();
          break;
        case 'settings-import':
          this.settingsSection = 'import-section';
          this.render();
          this.root.querySelector<HTMLElement>('[data-settings="import-section"]')?.focus();
          break;
        case 'sheet-expand':
          if (this.skipHandleClick) this.skipHandleClick = false;
          else this.setExpanded(!this.expanded);
          break;
        case 'revert-device':
          this.revertDevice();
          break;
        case 'reset':
          void confirmDialog(this.root, {
            title: t('¿Restablecer los valores sugeridos?'),
            message: t(
              'El nombre, el icono y los controles vuelven a lo que sugiere su entidad. No se guarda hasta tocar Guardar.',
            ),
            confirm: t('Restablecer'),
            trigger: button,
          }).then(confirmed => {
            if (confirmed) this.resetSheet();
          });
          break;
        case 'settings':
          this.openSettings();
          break;
        case 'close':
          this.closeSurface();
          break;
        case 'from-entity':
          this.pickDevice(true);
          break;
        case 'add':
          this.adding = true;
          this.surface = 'device';
          this._selectedDeviceId = null;
          this.sheet = undefined;
          this.allowFixedPosition = false;
          this.render();
          this.root.querySelector<HTMLInputElement>('[name=label]')?.focus();
          break;
        case 'move':
          if (this._selectedDeviceId) {
            if (!this.flushDevice()) break;
            this.dispatchEvent(
              new CustomEvent('homemanager-place', {
                bubbles: true,
                composed: true,
                detail: { deviceId: this._selectedDeviceId },
              }),
            );
            this.closeSurface();
          }
          break;
        case 'delete': {
          const device = this.device();
          if (!device) break;
          void confirmDialog(this.root, {
            title: t('¿Eliminar «{name}»?', { name: device.display.label }),
            message: t('Se quita del plano. La entidad de Home Assistant no se borra.'),
            trigger: button,
          }).then(confirmed => {
            if (!confirmed || !this.configuration.catalog.devices.some(item => item.id === device.id)) return;
            const next = removeDevice(this.configuration, device.id);
            this._selectedDeviceId = null;
            this.emit(next);
            this.closeSurface();
          });
          break;
        }
        case 'correct-fixed':
          this.allowFixedPosition = true;
          for (const field of this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-location]'))
            field.disabled = false;
          button.disabled = true;
          this.dispatchEvent(
            new CustomEvent('homemanager-fixed', {
              bubbles: true,
              composed: true,
              detail: { deviceId: this._selectedDeviceId },
            }),
          );
          this.root.querySelector<HTMLInputElement>('[name=x]')?.focus();
          break;
        case 'add-control': {
          const rows = this.captureRows();
          let index = rows.length + 1;
          while (rows.some(row => row.id === `control-${index}`)) index++;
          this.panelRows = [...rows, { id: `control-${index}`, label: '', actionId: '' }];
          this.updateControlRows();
          this.root.querySelector<HTMLInputElement>(`[name="control-label-${this.panelRows.length - 1}"]`)?.focus();
          break;
        }
        case 'remove-control':
          this.panelRows = this.captureRows().filter((_, index) => index !== Number(button.dataset.index));
          this.updateControlRows();
          break;
        case 'export':
          this.download();
          break;
        case 'backup':
          this.download();
          if (this.imported) this.imported.backedUp = true;
          this.render();
          break;
        case 'cancel-import':
          this.imported = undefined;
          this.render();
          break;
        case 'apply-import':
          if (this.imported) {
            const imported = this.imported;
            let next = imported.configuration,
              note = '';
            if (imported.viewBoxChanged) {
              const remapped = remapPositions(next, imported.from, imported.to, imported.positionMode);
              next = remapped.configuration;
              if (remapped.clamped.length)
                note = ` ${remapped.clamped.length} dispositivo(s) quedaron fuera del nuevo plano y se ubicaron en su borde: revisalos.`;
            }
            this.imported = undefined;
            if (imported.spatial) this.reviewCandidate(next);
            else this.emit(next);
            if (note) this.notice(t('Importación aplicada al borrador.') + note);
          }
          break;
        case 'review-spaces':
          this.reviewCandidate(this.configuration);
          break;
        case 'plans':
          void this.loadPlans();
          break;
        case 'restore-plan':
          void this.restorePlan(button.dataset.plan!);
          break;
        case 'room-add-zone':
          this.emit(
            upsertRoom(this.configuration, {
              id: button.dataset.room!,
              label: button.dataset.label || button.dataset.room!,
            }),
          );
          break;
        case 'room-add-all': {
          let next = this.configuration;
          for (const zone of this.zones())
            if (!next.rooms.some(room => room.id === zone.id))
              next = upsertRoom(next, { id: zone.id, label: zone.label ?? zone.id });
          this.emit(next);
          break;
        }
        case 'room-up':
        case 'room-down':
          this.emit(moveRoom(this.configuration, button.dataset.room!, button.dataset.command === 'room-up' ? -1 : 1));
          break;
        case 'room-remove': {
          const roomId = button.dataset.room!;
          const room = this.configuration.rooms.find(item => item.id === roomId);
          if (!room) break;
          void confirmDialog(this.root, {
            title: t('¿Eliminar «{name}»?', { name: room.label }),
            message: t('Sus dispositivos quedan en el plano sin espacio asignado.'),
            trigger: button,
          }).then(confirmed => {
            if (!confirmed) return;
            const result = removeRoom(this.configuration, roomId);
            this.emit(result.configuration);
            this.notice(t('Espacio eliminado. Los dispositivos siguen en el plano sin espacio asignado.'));
          });
          break;
        }
      }
    } catch (error) {
      this.notice(error instanceof Error ? error.message : String(error));
    }
  };
  private onChange = (event: Event): void => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (!this.config) return;
    if (target.getAttribute('name') === 'category' && target.closest('#device-form')) {
      // Chosen by the person: a new entity no longer proposes another one.
      target.closest('fieldset')?.setAttribute('data-chosen', '');
      this.applySections(target.value as Category);
      const label = this.root.querySelector('#device-category summary small');
      if (label) label.textContent = categoryInfo(target.value as Category).label;
      return;
    }
    if (target.hasAttribute('data-room-icon')) {
      const index = target.dataset.roomIcon!;
      const hidden = this.root.querySelector<HTMLInputElement>(`[name="room-icon-${index}"]`);
      if (hidden) hidden.value = target.value;
      return;
    }
    if (this.sheet && (target.dataset.ctl !== undefined || target.dataset.sheet)) {
      if (editField(this.sheet, target)) this.paintControls();
      return;
    }
    if (target.hasAttribute('data-device-icon')) {
      const hidden = this.root.querySelector<HTMLInputElement>('#device-form [name=icon]');
      if (hidden) hidden.value = target.value;
      return;
    }
    if (target.getAttribute('name') === 'entityId' && target.closest('#device-form')) {
      // A device that has no controls yet gets the ones its new entity suggests, visibly.
      if (this.sheet && !this.sheet.controls.length) this.resetSheet(false);
      else this.refreshSuggestions();
      this.proposeCategory(target.value);
      return;
    }
    if (target.getAttribute('name') === 'remoteId') {
      this.refreshSuggestions();
      return;
    }
    if (target.id === 'device-select') {
      this._selectedDeviceId = target.value || null;
      this.adding = false;
      this.allowFixedPosition = false;

      this.render();
    } else if (target.id === 'action-select') {
      this.actionId = target.value;
      this.render();
    } else if (target.id === 'panel-select') {
      this.panelId = target.value;
      this.panelRows = clone(this.configuration.panels[this.panelId]?.controls ?? []);
      this.render();
    } else if (target.name === 'domain') {
      const service = this.root.querySelector<HTMLSelectElement>('[name=service]'),
        services = SERVICES[target.value] ?? [];
      if (service) service.innerHTML = services.map(value => option(value, value, services[0])).join('');
    } else if (target.id === 'import-file') void this.importFile((target as HTMLInputElement).files?.[0]);
    else if (target.dataset.connectRoom) {
      this.connectChoices[target.dataset.connectRoom] = (target as HTMLSelectElement).value;
      this.render();
    } else if (target.dataset.connectDevice) {
      if ((target as HTMLInputElement).checked) this.connectPicked.add(target.dataset.connectDevice);
      else this.connectPicked.delete(target.dataset.connectDevice);
    } else if (target.id === 'quick-add') this.addFromEntity((target as HTMLInputElement).value.trim());
    else if (target.getAttribute('name') === 'position-mode' && this.imported)
      this.imported.positionMode = target.value === 'relative' ? 'relative' : 'drawing';
  };
  /** Validated configuration from the same fields for preview and explicit confirmation. */
  private deviceChange(form: HTMLFormElement): { next: Configuration; device: Device } {
    const data = new FormData(form);
    if (!this.root.querySelector<AlertEditor>('homemanager-alert-editor')?.valid())
      throw new Error(t('Revisá los límites y la duración de los avisos.'));
    let alertDisplay: ReturnType<typeof alertSettingsDisplay>;
    try {
      alertDisplay = alertSettingsDisplay(this.alertDraft ?? { rules: [] });
    } catch (error) {
      throw new Error(t((error as Error).message));
    }
    const previous = this.adding ? undefined : this.device(),
      label = value(data, 'label');
    const fixed = previous?.mobility === 'fixed' && !this.allowFixedPosition;
    if (!fixed && (!value(data, 'x') || !value(data, 'y'))) throw new Error(t('Completá las dos coordenadas.'));
    const id = previous?.id ?? (value(data, 'id') || newDeviceId(label, this.configuration));
    const held = resolveSheet(this.sheet!, this.configuration, id, this.suggestions());
    if (held.incomplete.length)
      throw new Error(
        t('Completá las acciones de: {names}. O quitá ese control.', { names: held.incomplete.join(', ') }),
      );
    const tap = held.controls.find(control => control.id === held.tap);
    const category = (CATEGORIES as readonly string[]).includes(value(data, 'category'))
      ? (value(data, 'category') as Category)
      : this.sheetCategory(previous);
    const entityId = value(data, 'entityId');
    const suggested = entityId ? suggestPresentation(entityId, this._hass?.states[entityId]).kind : '';
    // The technical kind is no longer chosen: kept, else suggested by the entity or the category.
    const kind = (value(data, 'kind') ||
      ((KINDS as readonly string[]).includes(suggested) ? suggested : CATEGORY_KIND[category])) as Device['kind'];
    // Without RF remotes the field is not shown: keep what the device had.
    const remoteId = data.has('remoteId') ? value(data, 'remoteId') || null : (previous?.bindings.remoteId ?? null);
    const device: Device = {
      id,
      display: {
        label,
        icon: value(data, 'icon'),
        ...(held.size !== 'm' ? { size: held.size } : {}),
        ...(held.pinned.length ? { pinned: held.pinned } : {}),
        ...(previous?.display.archetype ? { archetype: previous.display.archetype } : {}),
        ...(sectionsOf(category).show
          ? { show: value(data, 'show') as NonNullable<Device['display']['show']> }
          : previous?.display.show
            ? { show: previous.display.show }
            : {}),
        category,
        ...(this.alertDraft?.rules.some(rule => rule.enabled) || previous?.display.alerts !== undefined
          ? { alerts: alertDisplay.alerts }
          : {}),
        ...(alertDisplay.highlight !== undefined ? { highlight: alertDisplay.highlight } : {}),
      },
      kind,
      roomId: value(data, 'roomId') || null,
      mobility: value(data, 'mobility') as Device['mobility'],
      position: fixed ? clone(previous.position) : { x: Number(value(data, 'x')), y: Number(value(data, 'y')) },
      bindings: {
        entityId: value(data, 'entityId') || null,
        ...(value(data, 'deviceId') ? { deviceId: value(data, 'deviceId') } : {}),
        ...(value(data, 'readings') ? { readings: JSON.parse(value(data, 'readings')) as string[] } : {}),
        // Kept for readers before 0.6: a tap that is a single button.
        primaryAction: tap?.type === 'button' ? tap.steps[0].actionId : null,
        advancedPopupId: value(data, 'panelId') || null,
        ...(remoteId ? { remoteId } : {}),
        ...(held.controls.length ? { controls: held.controls } : {}),
        tap: held.tap,
      },
      state: { value: 'unknown', confidence: 'unknown' },
    };
    const next = upsertDevice(held.configuration, device, {
      previousId: previous?.id,
      allowFixedPosition: this.allowFixedPosition,
    });

    return { next, device };
  }
  private applyDeviceForm(form: HTMLFormElement, close: boolean): void {
    const { next, device } = this.deviceChange(form);
    const newlyAdded = this.adding;
    this._selectedDeviceId = device.id;
    this.surface = 'device';
    this.adding = false;
    this.allowFixedPosition = false;
    this.sheet = undefined;
    this.emit(next);
    if (newlyAdded && this._embedded)
      this.dispatchEvent(
        new CustomEvent('homemanager-place', { bubbles: true, composed: true, detail: { deviceId: device.id } }),
      );
    if (close && this._embedded) this.closeSurface(false);
  }
  private onSubmit = (event: Event): void => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    if (!this.config && !this.homeConfig) return;
    try {
      const data = new FormData(form);
      // Named inputs such as name="id" clobber HTMLFormElement.id in browsers.
      const formId = form.getAttribute('id');
      if (formId === 'home-card-form' && this.homeConfig) {
        const title = value(data, 'title'),
          card: Record<string, unknown> = {
            type: this.homeConfig.type,
            card_id: this.homeConfig.card_id,
            home_id: value(data, 'home_id'),
          };
        if (title) card.title = title;
        this.homeConfig = card as typeof this.homeConfig;
        this.emitCard(card);
        this.notice(t('Referencia actualizada. Guardá en el editor de Home Assistant.'));
        return;
      }
      if (formId === 'migrate-form') {
        void this.migrate(value(data, 'homeId'));
        return;
      }
      if (formId === 'device-form') {
        this.applyDeviceForm(form, true);
      } else if (formId === 'action-form') {
        const targets = value(data, 'targets')
          .split(',')
          .map(value => value.trim())
          .filter(Boolean);
        const action: Action = {
          domain: value(data, 'domain') as Action['domain'],
          service: value(data, 'service'),
          target: { entity_id: targets.length === 1 ? targets[0] : targets },
          data: JSON.parse(value(data, 'data') || '{}'),
        };
        this.actionId = value(data, 'actionId');
        this.emit(upsertAction(this.configuration, this.actionId, action));
      } else if (formId === 'state-form') {
        if (!this._selectedDeviceId) throw new Error(t('Seleccioná un icono.'));
        const entityId = value(data, 'entityId'),
          feedback = value(data, 'feedback');
        this.emit(
          upsertStateSource(
            this.configuration,
            this._selectedDeviceId,
            entityId
              ? {
                  entityId,
                  attribute: value(data, 'attribute') || null,
                  feedback: feedback as 'measured' | 'optimistic' | 'transmitter',
                }
              : null,
          ),
        );
      } else if (formId === 'rooms-form') {
        let next = this.configuration;
        this.configuration.rooms.forEach((room, index) => {
          const label = value(data, `room-label-${index}`);
          const icon = value(data, `room-icon-${index}`);
          if (label !== room.label || icon !== (room.icon ?? ''))
            next = upsertRoom(next, { id: room.id, label, ...(icon ? { icon } : {}) }, { previousId: room.id });
        });
        this.emit(next);
      } else if (formId === 'room-add-form') {
        const id = value(data, 'roomId'),
          label = value(data, 'roomLabel') || id;
        this.emit(upsertRoom(this.configuration, { id, label }));
      } else if (formId === 'panel-form') {
        this.panelRows = this.captureRows();
        this.panelId = value(data, 'panelId');
        this.emit(
          upsertPanel(this.configuration, this.panelId, {
            kind: value(data, 'kind') as NativePanel['kind'],
            title: value(data, 'title'),
            controls: this.panelRows,
          }),
        );
      }
    } catch (error) {
      this.notice(error instanceof Error ? error.message : String(error));
    }
  };
  private async importFile(file?: File): Promise<void> {
    const generation = ++this.importGeneration;
    if (!file || !this.config) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error(t('El archivo excede 5 MiB.'));
      const source = await file.text();
      if (generation !== this.importGeneration) return;
      this.previewImport(source, /\.svg$/i.test(file.name) || file.type === 'image/svg+xml');
    } catch (error) {
      if (generation === this.importGeneration) this.notice(error instanceof Error ? error.message : String(error));
    }
  }
  /** Same preview, zone report and position migration for a file, a JSON export
   * or a plan restored from the integration's history. Nothing is applied yet. */
  private previewImport(source: string, svg: boolean): void {
    {
      let candidate: Configuration;
      if (svg) {
        const safe = sanitizeArchitecture(source);
        candidate = {
          ...persistentConfiguration(this.configuration),
          architecture: { format: 'svg', content: safe.content },
        };
      } else candidate = persistentConfiguration(JSON.parse(source));
      const clean = validateConfiguration(candidate, { allowPending: true });
      const previous = sanitizeArchitecture(this.configuration.architecture.content),
        incoming = sanitizeArchitecture(clean.architecture.content);
      const zones = detectZones(incoming.svg).map(zone => zone.id);
      const viewBoxChanged = svg && JSON.stringify(previous.box) !== JSON.stringify(incoming.box);
      if (svg && !viewBoxChanged) {
        this.reviewCandidate(clean);
        return;
      }
      this.imported = {
        configuration: clean,
        summary: summarizeImport(this.configuration, clean),
        losses: importLosses(this.configuration, clean),
        // Only a plan replacement moves devices: a JSON export already carries
        // positions that belong to its own plan and must be applied unchanged.
        viewBoxChanged,
        spatial: svg,
        backedUp: false,
        from: previous.box,
        to: incoming.box,
        missingZones: clean.rooms.filter(room => !zones.includes(room.id)).map(room => room.id),
        newZones: zones.filter(id => !clean.rooms.some(room => room.id === id)),
        positionMode: 'drawing',
      };
      this.settingsSection = 'import-section';
      this.render();
    }
  }
  private async loadPlans(): Promise<void> {
    if (!this._hass?.callWS || !this.homeId) return;
    try {
      this.plans = (
        await this._hass.callWS<{ plans: NonNullable<HomeManagerEditor['plans']> }>({
          type: 'homemanager/plans',
          home_id: this.homeId,
        })
      ).plans;
      this.settingsSection = 'import-section';
      this.render();
    } catch (error) {
      this.notice(describeError(error));
    }
  }
  private async restorePlan(planId: string): Promise<void> {
    if (!this._hass?.callWS || !this.homeId) return;
    try {
      const plan = await this._hass.callWS<{ content: string }>({
        type: 'homemanager/plan/get',
        home_id: this.homeId,
        plan_id: planId,
      });
      this.previewImport(plan.content, true);
      this.notice(t('Plano anterior cargado para revisar. Aplicalo al borrador y guardá para restaurarlo.'));
    } catch (error) {
      this.notice(describeError(error));
    }
  }
  /** Name, icon and controls back to what the bound entity suggests (shown, not saved). */
  private resetSheet(withPresentation = true): void {
    if (!this.sheet) return;
    const entityId = this.sheetEntity();
    const form = this.root.querySelector<HTMLFormElement>('#device-form');
    const icon = form?.querySelector<HTMLInputElement>('[name=icon]');
    if (withPresentation && entityId && form) {
      const presentation = suggestPresentation(entityId, this._hass?.states[entityId]);
      form.querySelector<HTMLInputElement>('[name=label]')!.value = friendlyName(this._hass, entityId).slice(0, 240);
      if (icon) icon.value = presentation.icon;
      this.root.querySelector('homemanager-icon-picker[data-device-icon]')?.setAttribute('value', presentation.icon);
    }
    this.sheet = suggestedSheet(
      this.sheet.key,
      this.device()?.id ?? 'device',
      entityId,
      icon?.value ?? 'mdi:shape',
      (domain, service) => this.canSuggest(entityId ?? '', domain, service),
    );
    this.paintControls();
  }
  /** Whether a step may call a service of an entity without asking anything:
   * allowed by the contract, and not a script that needs input (that one runs
   * from its panel, where its fields are). */
  private canSuggest(entityId: string, domain: string, service: string): boolean {
    if (!(ALLOWED[domain] ?? []).includes(service)) return false;
    if (domain !== 'script') return true;
    const fields = (
      this._hass?.services?.script?.[entityId.slice(7)] as
        | { fields?: Record<string, { required?: boolean }> }
        | undefined
    )?.fields;
    return !fields || !Object.values(fields).some(field => field?.required === true);
  }
  /** The device a chosen entity makes, with its suggested controls. It starts in the middle unless told otherwise. */
  private deviceFromEntity(
    configuration: Configuration,
    entityId: string,
    selection?: DeviceSelection,
    place?: { roomId: string; position: { x: number; y: number } },
  ): { next: Configuration; id: string; label: string } {
    const hass = this._hass!;
    const entity = hass.states[entityId];
    const label = (
      selection?.deviceId
        ? deviceName(hass.devices?.[selection.deviceId], hass)
        : personName(friendlyName(hass, entityId), readingName(entityId, hass))
    ).slice(0, 240);
    const id = newDeviceId(label, configuration);
    const presentation = suggestPresentation(entityId, entity);
    const area = areaOf(hass, entityId);
    const fold = (text: string) =>
      text
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    const room =
      place?.roomId !== undefined
        ? configuration.rooms.find(item => item.id === place.roomId)
        : (configuration.rooms.find(item => item.areaId && item.areaId === entityAreaId(entityId, hass)) ??
          (area
            ? configuration.rooms.find(
                item => fold(item.label) === fold(area) || item.id === fold(area).replace(/[^a-z0-9]+/g, '-'),
              )
            : undefined));
    let next = configuration;
    const suggested = suggestControls(id, entityId, presentation.icon, (domain, service) =>
      this.canSuggest(entityId, domain, service),
    );
    // Suggested ids may already exist with another meaning: map them to the placed ones.
    const placed = new Map<string, string>();
    for (const [key, action] of Object.entries(suggested.actions)) {
      const result = placeAction(next, key, action);
      next = result.configuration;
      placed.set(key, result.id);
    }
    for (const control of suggested.controls)
      for (const step of control.steps) step.actionId = placed.get(step.actionId) ?? step.actionId;
    const tap = suggested.controls.find(control => control.id === suggested.tap);
    next = upsertDevice(next, {
      id,
      roomId: room?.id ?? null,
      kind: (KINDS as readonly string[]).includes(presentation.kind) ? (presentation.kind as Device['kind']) : 'other',
      position: place?.position ?? { x: 0.5, y: 0.5 },
      mobility: 'editable',
      display: { label, icon: presentation.icon },
      bindings: {
        entityId,
        ...(selection?.deviceId ? { deviceId: selection.deviceId, readings: selection.readings } : {}),
        primaryAction: tap?.type === 'button' ? tap.steps[0].actionId : null,
        advancedPopupId: null,
        ...(suggested.controls.length ? { controls: suggested.controls } : {}),
        tap: suggested.tap,
      },
      state: { value: 'unknown', confidence: 'unknown' },
    });
    return { next, id, label };
  }
  private addFromEntity(entityId: string, selection?: DeviceSelection): void {
    const hass = this._hass;
    if (!entityId || !hass?.states[entityId]) return;
    const configuration = this.configuration;
    const existing = configuration.catalog.devices.find(
      device =>
        device.bindings.entityId === entityId ||
        (selection?.deviceId &&
          (device.bindings.deviceId === selection.deviceId ||
            (device.bindings.entityId && hass.entities?.[device.bindings.entityId]?.device_id === selection.deviceId))),
    );
    if (existing) {
      this.selectedDeviceId = existing.id;
      this.notice(t('«{label}» ya está en el plano.', { label: existing.display.label }));
      return;
    }
    const { next, id, label } = this.deviceFromEntity(configuration, entityId, selection);
    this._selectedDeviceId = id;
    this.surface = 'device';
    this.adding = false;
    this.emit(next);
    this.notice(
      this._embedded
        ? t('«{label}» agregado. Tocá el plano para ubicarlo.', { label })
        : t('«{label}» agregado en el centro del plano. Arrastralo a su lugar.', { label }),
    );
    this.dispatchEvent(
      new CustomEvent('homemanager-place', { bubbles: true, composed: true, detail: { deviceId: id } }),
    );
  }
  private download(): void {
    const content = validateConfiguration(persistentConfiguration(this.configuration), { allowPending: true });
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'homemanager-configuration.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

if (!customElements.get('homemanager-editor')) customElements.define('homemanager-editor', HomeManagerEditor);
