import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import type { RfWidget, WidgetType } from '../integration/rf.js';
import {
  WIDGET_SIZE,
  layoutOf,
  place,
  add,
  uniqueId,
  rows,
  columnsOf,
  freeSpot,
  type DrawableRemote,
} from '../rf/layout.js';
import { HomeManagerRfRemote } from '../rf/remote-view.js';
import { installPanelComponents } from './panel-components.js';
import { rfManagerStyles } from './rf-components.js';
import { iconPicker } from './icon-picker.js';
import { choiceDialog, confirmDialog } from './confirm-dialog.js';
import { iconButton, sidePanelStyles } from './side-panel.js';
import {
  BLOCK_SLOTS,
  LEVEL_TYPES,
  MAX_COLUMNS,
  MAX_GRID_ROWS,
  MAX_LEVELS,
  MAX_SEQUENCE,
  REMOTE_THEMES,
  gridOf,
  isBlock,
  levelCount,
  mapLayout,
  levelText,
  pieceInputs,
  sendByOf,
  type PieceStep,
  type RemoteTheme,
  CONTROL_STYLES,
  SYM_ANIMS,
  WINDOW_KINDS,
  formsFor,
  type ControlStyle,
  type PieceForm,
} from '../model/control-layout.js';
import { BRAND_COUNT, BRAND_GROUPS } from './brands.js';
import {
  DESIGNS,
  applyTemplate,
  learnOrder,
  resolveWanted,
  setTemplateNames,
  type ApplianceKind,
  type StartDesign,
} from '../model/remote-templates.js';
import { brandMark, keyStyles, radiusOf } from './remote-keys.js';
import { personName } from '../model/names.js';
// Templates name their buttons and pieces in the screen's language.
setTemplateNames(name => t(name));

export interface DesignerOptions {
  key: string;
  remote: DrawableRemote;
  /** The control's name, shown above the canvas. */
  name?: string;
  controls?: { id: string; label: string }[];
  renderContent?: (piece: RfWidget, testing: boolean) => HTMLElement | null;
  absolute?: boolean;
  readValues?: HomeManagerRfRemote['readValues'];
  history?: HomeManagerRfRemote['history'];
  estimated: boolean;
  save(layout: RfWidget[] | null): Promise<void> | void;
  /** Test mode: a tap sends for real. Without it the designer never sends. */
  press?: (buttonId: string) => Promise<unknown>;
  /** 0.14 · Home Assistant buttons of the symbol's device (a robot's routines): «Especiales › Rutinas». */
  routines?: { id: string; name: string }[];
  /** 0.14 · the appliance of this remote: «Diseño» swaps its starting designs. */
  appliance?: ApplianceKind | null;
  /** "Learn more buttons" from the tray; with a name, the button the control waits for. */
  learn?: (name?: string) => void;
  /** What the tray lists: learned buttons (remotes) or actions (a plan symbol). */
  trayTitle?: string;
  /** 0.13: pins a piece next to the symbol that uses this control. */
  pinTo?: (pieceId: string) => void;
  /** 0.13: the same control for another appliance (a copy with its own emitter). */
  duplicate?: {
    emitters: { id: string; name: string }[];
    current?: string;
    run(name: string, emitter?: string): Promise<void>;
    /** "Design only": other remotes of the same kind, and how to give one this design. */
    targets?: { id: string; name: string; buttons: { id: string; name: string }[] }[];
    applyDesign?(targetId: string, layout: RfWidget[]): Promise<void>;
  };
}

/** The kinds the designer offers, grouped by what they do (0.13). One type can
 * appear twice with another look: a brand key is a button, a list is modes. */
type Cat = 'button' | 'level' | 'mode' | 'info' | 'block';
type Variant = { id: string; cat: Cat; type: WidgetType; name: string; icon: string };
const VARIANTS: Variant[] = [
  { id: 'press', cat: 'button', type: 'button', name: 'Pulsador', icon: 'mdi:gesture-tap' },
  { id: 'onoff', cat: 'button', type: 'toggle', name: 'Encender / apagar', icon: 'mdi:power' },
  { id: 'brand', cat: 'button', type: 'button', name: 'Marca o app', icon: 'mdi:play-box-outline' },
  { id: 'sequence', cat: 'button', type: 'preset', name: 'Secuencia', icon: 'mdi:playlist-play' },
  { id: 'updown', cat: 'level', type: 'updown', name: 'Subir / bajar', icon: 'mdi:plus-minus-variant' },
  { id: 'bar', cat: 'level', type: 'slider', name: 'Barra', icon: 'mdi:tune-vertical' },
  { id: 'steps', cat: 'level', type: 'steps', name: 'Escalones', icon: 'mdi:stairs' },
  { id: 'knob', cat: 'level', type: 'knob', name: 'Perilla', icon: 'mdi:knob' },
  { id: 'modes', cat: 'mode', type: 'modes', name: 'Botones', icon: 'mdi:view-grid-outline' },
  { id: 'list', cat: 'mode', type: 'modes', name: 'Lista', icon: 'mdi:format-list-bulleted' },
  { id: 'cycle', cat: 'mode', type: 'cycle', name: 'Un botón que rota', icon: 'mdi:repeat' },
  { id: 'value', cat: 'info', type: 'indicator', name: 'Valor', icon: 'mdi:gauge' },
  { id: 'graph', cat: 'info', type: 'graph', name: 'Gráfico', icon: 'mdi:chart-line' },
  { id: 'title', cat: 'info', type: 'title', name: 'Título', icon: 'mdi:format-title' },
  { id: 'separator', cat: 'info', type: 'separator', name: 'Separador', icon: 'mdi:minus' },
  { id: 'dpad', cat: 'block', type: 'dpad', name: 'Cruceta', icon: 'mdi:gamepad-round-outline' },
  { id: 'numpad', cat: 'block', type: 'numpad', name: 'Teclado numérico', icon: 'mdi:dialpad' },
  { id: 'transport', cat: 'block', type: 'transport', name: 'Reproducción', icon: 'mdi:play-pause' },
  { id: 'colors', cat: 'block', type: 'colors', name: 'Botones de colores', icon: 'mdi:palette-outline' },
];
const CATS: Record<Cat, [string, string]> = {
  button: ['Botón', 'mdi:gesture-tap-button'],
  level: ['Niveles', 'mdi:tune-variant'],
  mode: ['Modos', 'mdi:format-list-bulleted'],
  info: ['Información', 'mdi:information-outline'],
  block: ['Bloques', 'mdi:view-grid-plus-outline'],
};
/** 0.14 · one catalogue, the same everywhere: five tabs, and each entry is a kind of
 * button that is set up differently. Nivel and Opciones gather the old level and list
 * kinds, which became their forms. */
type CatalogTab = 'buttons' | 'groups' | 'levels' | 'info' | 'special';
type Entry = 'press' | 'onoff' | 'sequence' | 'brand' | 'dpad' | 'numpad' | 'transport' | 'colors' | 'level' | 'options' | 'value' | 'graph' | 'title' | 'separator' | 'window' | 'control';
const CATALOG: [CatalogTab, string, string, Entry[]][] = [
  ['buttons', 'Botones', 'mdi:gesture-tap-button', ['press', 'onoff', 'sequence', 'brand']],
  ['groups', 'Grupos', 'mdi:view-grid-plus-outline', ['dpad', 'numpad', 'transport', 'colors']],
  ['levels', 'Niveles y listas', 'mdi:tune-variant', ['level', 'options']],
  ['info', 'Información', 'mdi:information-outline', ['value', 'graph', 'title', 'separator']],
  ['special', 'Especiales', 'mdi:star-four-points-outline', ['window']],
];
const ENTRY: Record<Entry, [string, string, string]> = {
  press: ['Botón', 'mdi:gesture-tap', 'press'],
  onoff: ['Prender / apagar', 'mdi:power', 'onoff'],
  sequence: ['Secuencia', 'mdi:playlist-play', 'sequence'],
  brand: ['Botón de app', 'mdi:play-box-outline', 'brand'],
  dpad: ['Cruceta', 'mdi:gamepad-round-outline', 'dpad'],
  numpad: ['Teclado numérico', 'mdi:dialpad', 'numpad'],
  transport: ['Reproducción', 'mdi:play-pause', 'transport'],
  colors: ['Colores', 'mdi:palette-outline', 'colors'],
  level: ['Nivel', 'mdi:tune-vertical', 'updown'],
  options: ['Opciones', 'mdi:format-list-bulleted', 'modes'],
  value: ['Valor', 'mdi:gauge', 'value'],
  graph: ['Gráfica', 'mdi:chart-line', 'graph'],
  title: ['Título', 'mdi:format-title', 'title'],
  separator: ['Separador', 'mdi:minus', 'separator'],
  window: ['Ventana', 'mdi:window-shutter', 'bar'],
  control: ['Control del aire', 'mdi:air-conditioner', 'control'],
};
/** Which catalogue entry a piece is. */
function entryOf(piece: RfWidget): Entry {
  if (piece.type === 'button') return piece.brand ? 'brand' : 'press';
  if (piece.type === 'toggle') return 'onoff';
  if (piece.type === 'preset') return 'sequence';
  if (piece.type === 'slider' && piece.form === 'window') return 'window';
  if (['updown', 'slider', 'steps', 'knob'].includes(piece.type)) return 'level';
  if (piece.type === 'modes' || piece.type === 'cycle') return 'options';
  if (piece.type === 'indicator') return 'value';
  if (piece.type === 'graph') return 'graph';
  if (['title', 'separator', 'dpad', 'numpad', 'transport', 'colors'].includes(piece.type)) return piece.type as Entry;
  return 'control';
}
type StepId = 'what' | 'form' | 'look' | 'does' | 'gestures' | 'shows' | 'plan';
/** What each step owns, so «Descartar» puts back only that step. «Qué hace» owns the rest. */
const STEP_FIELDS: Record<Exclude<StepId, 'what' | 'does'>, string[]> = {
  form: ['form', 'win', 'winSide', 'x', 'y', 'w', 'h'],
  look: ['label', 'icon', 'hideIcon', 'hideLabel', 'style', 'symAnim', 'symWhen', 'fontSize', 'fontWeight', 'iconSize', 'bg', 'fg', 'border', 'active', 'radius', 'relief', 'anim'],
  gestures: ['hold', 'holdButton'],
  shows: ['display', 'valueSize', 'reading', 'attribute', 'chart'],
  plan: [],
};
/** The piece with the fields of one step put back as they were in `snap`. */
function restoreStep(piece: RfWidget, snap: RfWidget, step: StepId): RfWidget {
  if (step === 'what') return structuredClone(snap);
  const listed = Object.values(STEP_FIELDS).flat();
  const keys =
    step === 'does'
      ? [...new Set([...Object.keys(piece), ...Object.keys(snap)])].filter(key => !listed.includes(key) && key !== 'id' && key !== 'type')
      : STEP_FIELDS[step];
  const out = structuredClone(piece) as unknown as Record<string, unknown>;
  const from = snap as unknown as Record<string, unknown>;
  for (const key of keys) {
    if (key in from) out[key] = structuredClone(from[key]);
    else delete out[key];
  }
  return out as unknown as RfWidget;
}
/** Nivel and Opciones: the old kinds are now forms of one type. */
const FAMILY: Partial<Record<Entry, string[]>> = {
  level: ['updown', 'bar', 'steps', 'knob'],
  window: ['updown', 'bar', 'steps', 'knob'],
  options: ['modes', 'list', 'cycle'],
};
const FAMILY_FORMS: Partial<Record<Entry, PieceForm[]>> = {
  level: ['thermo', 'bars', 'window'],
  window: ['thermo', 'bars', 'window'],
  options: ['segment', 'bars'],
};
/** The kind a form needs when the current one cannot take it. */
const FORM_HOME: Partial<Record<PieceForm, string>> = { thermo: 'bar', window: 'bar', bars: 'steps', segment: 'modes' };
/** The least room a form needs (columns × rows); a smaller button grows when it takes it. */
const FORM_MIN: Partial<Record<PieceForm, [number, number]>> = { thermo: [2, 2], window: [2, 2], gauge: [2, 2], segment: [3, 1], bars: [2, 1], big: [2, 1] };
const variantOf = (piece: RfWidget): Variant =>
  piece.type === 'button' && piece.brand
    ? VARIANTS[2]
    : piece.type === 'modes' && piece.display === 'list'
      ? VARIANTS[9]
      : (VARIANTS.find(v => v.type === piece.type) ?? {
          id: 'control',
          cat: 'button',
          type: piece.type,
          name: 'Control existente',
          icon: 'mdi:remote',
        });
const SWATCHES = ['#4F7A5A', '#3F7FBF', '#6F6BB8', '#D98B1F', '#D0453A', '#C2477F', '#1F2421', '#FFFFFF'];
const THEMES: [RemoteTheme | 'hm', string][] = [
  ['hm', 'Automático'],
  ['grafito', 'Grafito'],
  ['claro', 'Claro'],
  ['arena', 'Arena'],
  ['vidrio', 'Vidrio'],
];
const TEMPLATES: [RemoteTheme, string][] = [
  ['claro', 'Clásico'], ['grafito', 'Digital'], ['arena', 'Retro'], ['vidrio', 'Futurista'],
];
/** 0.14 · how each form, style, movement and window looks in the inspector: a name (hover) and a symbol. */
const FORM_LOOK: Record<PieceForm, [string, string]> = {
  round: ['Redondo', 'mdi:circle-outline'],
  square: ['Cuadrado', 'mdi:square-rounded-outline'],
  pill: ['Píldora', 'mdi:pill'],
  icon: ['Solo símbolo', 'mdi:shape-outline'],
  switch: ['Interruptor', 'mdi:toggle-switch-outline'],
  lamp: ['Luz', 'mdi:lightbulb-outline'],
  thermo: ['Termostato', 'mdi:thermostat'],
  bars: ['Barras', 'mdi:chart-bar'],
  fader: ['Barra deslizante', 'mdi:tune-vertical'],
  window: ['Ventana', 'mdi:window-shutter'],
  pair: ['Par', 'mdi:plus-minus-variant'],
  segment: ['Segmentos', 'mdi:view-column-outline'],
  display: ['Pantalla', 'mdi:numeric'],
  big: ['Número grande', 'mdi:format-size'],
  gauge: ['Medidor', 'mdi:gauge'],
  pop: ['Detrás de un botón', 'mdi:arrow-expand'],
};
const STYLE_LOOK: Record<ControlStyle, string> = {
  normal: 'Normal',
  digital: 'Digital',
  retro: 'Retro',
  color: 'Colorido',
  glass: 'Cristal',
  futurista: 'Futurista',
};
const STYLE_ICON: Record<ControlStyle, string> = {
  normal: 'mdi:circle-slice-8',
  digital: 'mdi:numeric-8-box-outline',
  retro: 'mdi:radio',
  color: 'mdi:palette',
  glass: 'mdi:blur',
  futurista: 'mdi:rocket-launch-outline',
};
const ANIM_LOOK: [string, string, string][] = [
  ['', 'Quieto', 'mdi:motion-pause-outline'],
  ['spin', 'Gira', 'mdi:rotate-right'],
  ['spinslow', 'Gira lento', 'mdi:fan-speed-1'],
  ['flicker', 'Titila', 'mdi:fire'],
  ['bob', 'Flota', 'mdi:arrow-up-down'],
  ['pulse', 'Late', 'mdi:heart-pulse'],
  ['rock', 'Se mece', 'mdi:rotate-left-variant'],
];
const WIN_LOOK: Record<string, [string, string]> = {
  roller: ['Persiana enrollable', 'mdi:roller-shade'],
  venetian: ['Veneciana', 'mdi:blinds-horizontal'],
  vertical: ['Vertical', 'mdi:blinds-vertical'],
  curtains: ['Dos cortinas', 'mdi:curtains'],
  curtain: ['Una cortina', 'mdi:curtains-closed'],
};
/** Pieces whose symbol can move (a level or a list moves its own symbol through its form). */
const MOVES: WidgetType[] = ['button', 'toggle', 'preset', 'cycle', 'steps', 'slider', 'updown', 'modes'];
/** Words that tell which learned button belongs to each key of a block. */
const SLOT_WORDS: Record<string, RegExp> = {
  up: /^(arriba|up|subir|▲)$/i,
  down: /^(abajo|down|bajar|▼)$/i,
  left: /^(izquierda|left|◀)$/i,
  right: /^(derecha|right|▶)$/i,
  ok: /^(ok|enter|aceptar|select)$/i,
  enter: /^(entrar|enter|aceptar)$/i,
  dash: /^(-\/--|guion)$/i,
  prev: /^(anterior|prev|previous)$/i,
  rew: /^(retroceder|rew|rewind)$/i,
  play: /^(play|play\/pausa|reproducir|pausa|play\/pause)$/i,
  ff: /^(adelantar|ff|forward)$/i,
  next: /^(siguiente|next)$/i,
  red: /^(rojo|red)$/i,
  green: /^(verde|green)$/i,
  yellow: /^(amarillo|yellow)$/i,
  blue: /^(azul|blue)$/i,
};
const glyph = (name: string) => `<ha-icon icon="${e(name)}" aria-hidden="true"></ha-icon>`;
const clampNumber = (value: string | number, low: number, high: number) =>
  Math.max(low, Math.min(high, Math.round(Number(value) || low)));

/** The control editor (0.14): the control in the middle (drag, resize, test) and the
 * «Editar control» panel on the right. Changes stay in a draft that can be undone and
 * is kept only with «Guardar»; leaving with changes asks first. It edits only layout
 * and references, and sends nothing unless test mode is on. */
export class ControlDesigner extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private options?: DesignerOptions;
  private remote?: DrawableRemote;
  /** The layout as last saved; the draft is `remote.layout`. */
  private saved: RfWidget[] | null = null;
  private history: (RfWidget[] | null)[] = [];
  private future: (RfWidget[] | null)[] = [];
  private selected: string[] = [];
  private testing = false;
  /** Open modules of the «Editar control» panel. */
  private mods = new Set(['learned', 'pieces']);
  /** «Botón nuevo»: the catalogue is open for a piece that does not exist yet. */
  private adding = false;
  private catTab: CatalogTab = 'buttons';
  /** The open step of the chosen button, and what each changed step was before. */
  private openStep: StepId | null = null;
  private stepSnaps = new Map<StepId, RfWidget>();
  private stepPiece?: string;
  private pieceBase?: RfWidget;
  private nextStep: StepId | null = null;
  private addingWanted = false;
  private readonly designPreviews = DESIGNS.map(() => {
    const preview = new HomeManagerRfRemote();
    preview.setAttribute('data-template', '');
    preview.preview = true;
    preview.inert = true;
    return preview;
  });
  private tab: 'look' | 'function' | 'shows' = 'look';
  private brandQuery = '';
  private brandsFor = false;
  private dupOpen = false;
  private dupDesignOnly = false;
  private templatePreview?: RemoteTheme;
  private busy = false;
  private error = '';
  private canvas = new HomeManagerRfRemote();
  constructor() {
    super();
    installPanelComponents(
      this.root,
      'control-designer',
      rfManagerStyles + sidePanelStyles + keyStyles + designerStyles,
      false,
    );
    this.canvas.toggleAttribute('data-designer', true);
    this.canvas.onLayout = layout => void this.commit(layout);
    this.canvas.onEdit = id => this.select([id]);
    this.canvas.onSelect = (id, more) => {
      if (!id) this.select([]);
      else if (more)
        this.select(this.selected.includes(id) ? this.selected.filter(item => item !== id) : [...this.selected, id]);
      else this.select([id]);
    };
    this.canvas.onDelete = id => void this.removePieces(this.selected.includes(id) ? this.selected : [id]);
    this.canvas.onDuplicate = ids => this.duplicatePieces(ids);
    this.addEventListener('keydown', event => this.keys(event));
  }
  configure(options: DesignerOptions): void {
    const same = this.options?.key === options.key;
    // A host re-render must not throw away a draft that is not saved yet.
    const draft = same && this.dirty ? structuredClone(this.remote!.layout ?? null) : undefined;
    if (!same) {
      this.history = [];
      this.future = [];
      this.selected = [];
      this.testing = false;
      this.dupOpen = false;
      this.templatePreview = undefined;
    }
    this.options = options;
    this.remote = structuredClone(options.remote);
    this.saved = structuredClone(options.remote.layout ?? null);
    if (draft !== undefined) this.remote.layout = draft;
    // 0.14: a button learned with the name of one the control waits for takes its place.
    const resolved = resolveWanted(this.remote.layout ?? null, this.remote.buttons ?? []);
    if (resolved) this.remote.layout = resolved;
    this.render();
  }
  /** Buttons the control waits for (not learned yet). */
  private wanted(): { id: string; name: string; icon?: string | null }[] {
    return this.layout().find(piece => piece.type === 'canvas')?.wanted ?? [];
  }
  /** True while the draft differs from what is saved. */
  get dirty(): boolean {
    return !!this.remote && JSON.stringify(this.remote.layout ?? null) !== JSON.stringify(this.saved ?? null);
  }
  /** Before the host closes the editor: with changes, asks to keep editing, discard or save. */
  async confirmLeave(): Promise<boolean> {
    if (!this.dirty) return true;
    const choice = await choiceDialog(this.root, {
      title: t('¿Guardar los cambios?'),
      message: t('El control tiene cambios sin guardar.'),
      choices: [
        ['stay', t('Seguir editando')],
        ['discard', t('Descartar')],
        ['save', t('Guardar'), 'primary'],
      ],
    });
    if (choice === 'save') return this.saveDraft();
    if (choice === 'discard') {
      this.discardDraft();
      return true;
    }
    return false;
  }
  private async saveDraft(): Promise<boolean> {
    if (!this.remote || !this.options || this.busy) return false;
    const layout = structuredClone(this.remote.layout ?? null);
    this.stepSnaps.clear();
    this.busy = true;
    this.reflectBusy();
    try {
      await this.options.save(layout);
      this.saved = structuredClone(layout);
      this.error = '';
      return true;
    } catch (error) {
      this.error = (error as Error).message;
      return false;
    } finally {
      this.busy = false;
      this.render();
    }
  }
  private discardDraft(): void {
    if (!this.remote) return;
    this.remote.layout = structuredClone(this.saved);
    this.stepSnaps.clear();
    this.stepPiece = undefined;
    this.history = [];
    this.future = [];
    this.selected = this.selected.filter(id => this.layout().some(item => item.id === id));
    this.error = '';
    this.render();
  }
  refreshIndicators(): void {
    this.canvas.updateIndicators();
  }

  // Data -------------------------------------------------------------------

  private layout(): RfWidget[] {
    return this.remote ? layoutOf(this.remote) : [];
  }
  private pieces(): RfWidget[] {
    return this.selected
      .map(id => this.layout().find(item => item.id === id && item.type !== 'canvas'))
      .filter((item): item is RfWidget => !!item);
  }
  private learned(): { id: string; name: string; icon: string | null }[] {
    const buttons = this.remote?.buttons ?? [];
    const routines = (this.options?.routines ?? [])
      .filter(routine => !buttons.some(button => button.id === routine.id))
      .map(routine => ({ id: routine.id, name: routine.name, icon: 'mdi:play-circle-outline' }));
    return [...buttons, ...routines];
  }
  private name(ref: string): string {
    return personName(this.learned().find(button => button.id === ref)?.name ?? this.wanted().find(item => item.id === ref)?.name, ref);
  }
  /** How many pieces use each learned button. */
  private usage(): Map<string, number> {
    const used = new Map<string, number>();
    for (const piece of this.layout()) {
      const refs = new Set([
        ...piece.buttons,
        ...(piece.holdButton ? [piece.holdButton] : []),
        ...(piece.sequence ?? []).flatMap(step => ('button' in step ? [step.button] : [])),
      ]);
      for (const ref of refs) used.set(ref, (used.get(ref) ?? 0) + 1);
    }
    return used;
  }
  /** Learned buttons nobody uses yet first, so a new piece saves as it is. */
  private pool(): string[] {
    const used = this.usage();
    const ids = this.learned().map(button => button.id);
    return [...ids.filter(id => !used.has(id)), ...ids.filter(id => used.has(id))];
  }

  private async commit(layout: RfWidget[] | null, undo: 'undo' | 'redo' | null = null): Promise<void> {
    if (!this.remote || !this.options || this.busy) return;
    if ((layout ?? []).some(w => w.type !== 'canvas' && w.y + w.h > MAX_GRID_ROWS) || (layout?.length ?? 0) > 64) {
      this.error = t('No queda espacio en el lienzo.');
      this.render();
      return;
    }
    // 0.14: a change only edits the draft; «Guardar» keeps it.
    const before = this.selected.length === 1 ? this.layout().find(item => item.id === this.selected[0]) : undefined;
    const previous = structuredClone(this.remote.layout);
    if (undo === 'undo') this.future.push(previous);
    else {
      this.history.push(previous);
      if (this.history.length > 60) this.history.shift();
      if (undo !== 'redo') this.future = [];
    }
    this.remote.layout = structuredClone(layout);
    this.error = '';
    // The first change while a step is open remembers how the button was, for «Descartar».
    if (before && !undo && this.openStep && this.stepPiece === before.id && !this.stepSnaps.has(this.openStep)) {
      const after = this.layout().find(item => item.id === before.id);
      if (JSON.stringify(after) !== JSON.stringify(before)) this.stepSnaps.set(this.openStep, structuredClone(before));
    }
    this.selected = this.selected.filter(id => this.layout().some(item => item.id === id));
    this.render();
  }
  /** Changes the chosen pieces (all of them when several are chosen). */
  private change(mutate: (piece: RfWidget) => void): void {
    const layout = structuredClone(this.layout());
    let next = layout;
    for (const id of this.selected) {
      const piece = next.find(item => item.id === id);
      if (!piece) continue;
      mutate(piece);
      next = this.selected.length === 1 ? place(next, piece.id, piece) : next;
    }
    void this.commit(next);
  }
  /** Shown while a slider moves; saved when it is let go. */
  private preview(mutate: (piece: RfWidget) => void, canvas = false): void {
    if (!this.remote) return;
    const layout = structuredClone(this.layout());
    if (canvas) mutate(this.canvasPiece(layout));
    else for (const piece of layout) if (this.selected.includes(piece.id)) mutate(piece);
    this.canvas.remote = { ...this.remote, layout };
  }
  private changeCanvas(mutate: (canvas: RfWidget) => void): void {
    const layout = structuredClone(this.layout());
    mutate(this.canvasPiece(layout));
    void this.commit(layout);
  }
  /** The canvas piece of a layout, added when the control had none. */
  private canvasPiece(layout: RfWidget[]): RfWidget {
    let canvas = layout.find(piece => piece.type === 'canvas');
    if (!canvas) {
      canvas = {
        id: uniqueId(layout, 'canvas'),
        type: 'canvas',
        x: 0,
        y: 0,
        w: columnsOf(layout),
        h: Math.max(2, rows(layout)),
        buttons: [],
        label: null,
        icon: null,
      };
      layout.unshift(canvas);
    }
    return canvas;
  }
  private select(ids: string[]): void {
    if (this.stepSnaps.size && this.stepPiece && !(ids.length === 1 && ids[0] === this.stepPiece)) {
      void this.leavePiece(ids);
      return;
    }
    if (this.adding && ids.length) this.adding = false;
    const was = this.selected.join();
    this.selected = ids;
    this.brandsFor = false;
    if (ids.join() !== was && ids.length === 1) this.tab = this.tab === 'shows' ? 'look' : this.tab;
    this.render();
  }

  /** Leaving a button with steps not accepted: keep editing, discard them or accept them. */
  private async leavePiece(ids: string[]): Promise<void> {
    const choice = await choiceDialog(this.root, {
      title: t('¿Aceptar los cambios de este botón?'),
      message: t('Hay pasos con cambios sin aceptar.'),
      choices: [
        ['stay', t('Seguir editando')],
        ['discard', t('Descartar')],
        ['accept', t('Aceptar'), 'primary'],
      ],
    });
    if (choice !== 'discard' && choice !== 'accept') return;
    if (choice === 'discard') this.discardPiece();
    this.stepSnaps.clear();
    this.stepPiece = undefined;
    this.select(ids);
  }
  /** «Descartar todo»: the button goes back to how it was when it was opened. */
  private discardPiece(): void {
    const base = this.pieceBase;
    if (!base) return;
    this.openStep = null;
    const layout = structuredClone(this.layout()).map(item => (item.id === base.id ? structuredClone(base) : item));
    this.stepSnaps.clear();
    void this.commit(layout);
  }
  private discardStep(step: StepId): void {
    const snap = this.stepSnaps.get(step);
    const piece = this.pieces()[0];
    if (!snap || !piece) return;
    this.stepSnaps.delete(step);
    const open = this.openStep;
    this.openStep = null;
    const restored = restoreStep(piece, snap, step);
    void this.commit(structuredClone(this.layout()).map(item => (item.id === piece.id ? restored : item)));
    this.openStep = open;
    this.render();
  }

  // Creating -------------------------------------------------------------

  /** A new piece of a kind, with sensible buttons already chosen. */
  private make(variant: Variant, layout: RfWidget[], options: { ref?: string; brand?: string } = {}): RfWidget | null {
    const pool = options.ref ? [options.ref, ...this.pool().filter(id => id !== options.ref)] : this.pool();
    const type = variant.type;
    let [w, h] = WIDGET_SIZE[type];
    const base: RfWidget = { id: '', type, x: 0, y: 0, w, h, buttons: [], label: null, icon: null };
    let piece: RfWidget = base;
    const need = (count: number) => {
      if (pool.length >= count) return pool.slice(0, count);
      this.error = t('Faltan botones aprendidos: este elemento usa {count}.', { count });
      return null;
    };
    switch (variant.id) {
      case 'press':
      case 'onoff': {
        const refs = need(1);
        if (!refs) return null;
        piece = {
          ...base,
          buttons: refs,
          icon: variant.id === 'onoff' ? 'mdi:power' : null,
          ...(options.ref ? { hideIcon: true } : { hideLabel: true }),
        };
        break;
      }
      case 'brand': {
        const brand = options.brand ?? 'YouTube';
        const match = this.learned().find(button => button.name.toLowerCase() === brand.toLowerCase())?.id;
        const refs = match ? [match] : need(1);
        if (!refs) return null;
        piece = { ...base, buttons: refs, label: brand, brand, radius: 12, hideLabel: true };
        break;
      }
      case 'sequence': {
        const refs = need(1);
        if (!refs) return null;
        piece = { ...base, w: 2, buttons: refs, label: t('Secuencia'), sequence: [{ button: refs[0] }] };
        break;
      }
      case 'updown':
      case 'bar':
      case 'steps':
      case 'knob': {
        const two = pool.length >= 2;
        const refs = need(two ? 2 : 1);
        if (!refs) return null;
        piece = {
          ...base,
          buttons: refs,
          label: t('Nivel'),
          values: { min: 1, max: 5, step: 1 },
          sendBy: two ? 'updown' : 'advance',
          display: 'value',
          ...(variant.id === 'updown' ? { orientation: 'vertical' as const, radius: 999, w: 1, h: 2 } : {}),
          ...(variant.id === 'knob' ? { w: 2, h: 2 } : {}),
          ...(variant.id === 'bar' || variant.id === 'steps' ? { w: 3, h: 1 } : {}),
        };
        break;
      }
      case 'modes':
      case 'list':
      case 'cycle': {
        const count = Math.min(3, Math.max(2, pool.length));
        const refs = need(count);
        if (!refs) return null;
        piece = {
          ...base,
          buttons: refs,
          label: t('Modo'),
          options: refs.map(ref => ({ label: this.name(ref).slice(0, 20), icon: null })),
          ...(variant.id === 'list' ? { display: 'list' as const, w: 2 } : {}),
          ...(variant.id === 'modes' ? { w: 3 } : {}),
          ...(variant.id === 'cycle' ? { w: 1 } : {}),
        };
        break;
      }
      case 'value':
      case 'graph':
        piece = { ...base, w: 2, h: 1, label: variant.id === 'graph' ? t('Gráfico') : t('Valor') };
        break;
      case 'title':
        piece = { ...base, w: columnsOf(layout), label: t('Título') };
        break;
      case 'separator':
        piece = { ...base, w: columnsOf(layout) };
        break;
      default: {
        if (!isBlock(type)) return null;
        const slots: Record<string, string> = {};
        for (const [slot] of BLOCK_SLOTS[type]) {
          const word = SLOT_WORDS[slot] ?? new RegExp(`^${slot}$`);
          const match = this.learned().find(
            button => word.test(button.name.trim()) && !Object.values(slots).includes(button.id),
          );
          if (match) slots[slot] = match.id;
        }
        piece = { ...base, buttons: [...new Set(Object.values(slots))], slots, radius: 999 };
      }
    }
    [w, h] = [Math.min(piece.w, columnsOf(layout)), piece.h];
    return { ...piece, id: uniqueId(layout, variant.id === 'brand' ? (options.brand ?? 'brand') : variant.id), w, h };
  }

  private addPiece(
    variantId: string,
    at?: { x: number; y: number },
    options: { ref?: string; brand?: string } = {},
  ): void {
    const variant = VARIANTS.find(v => v.id === variantId);
    if (!variant || !this.remote) return;
    const layout = this.layout();
    const piece = this.make(variant, layout, options);
    if (!piece) {
      this.render();
      return;
    }
    let next = add(layout, piece);
    if (at) next = place(next, piece.id, at);
    // A canvas with fixed rows grows to hold what was added.
    const canvas = next.find(item => item.type === 'canvas');
    const added = next.find(item => item.id === piece.id)!;
    if (canvas && added.y + added.h > canvas.h)
      next = next.map(item => (item === canvas ? { ...canvas, h: Math.min(MAX_GRID_ROWS, added.y + added.h) } : item));
    this.selected = [piece.id];
    this.tab = variant.cat === 'block' || variant.cat === 'info' ? 'look' : 'function';
    void this.commit(next);
  }

  /** «Botón nuevo»: adds the chosen entry where there is room and opens it. */
  private addEntry(entry: Entry): void {
    this.adding = false;
    this.nextStep = 'form';
    const variant = ENTRY[entry][2];
    this.addPiece(variant);
    if (entry === 'window' && this.selected.length === 1) this.change(piece => { if (formsFor(piece).includes('window')) piece.form = 'window'; });
  }

  /** A learned button dropped on a piece: it becomes what that piece sends. */
  private assign(pieceId: string, ref: string): void {
    const layout = structuredClone(this.layout());
    const piece = layout.find(item => item.id === pieceId);
    if (!piece) return;
    if (isBlock(piece.type)) {
      const free = BLOCK_SLOTS[piece.type].find(([slot]) => !piece.slots?.[slot]);
      if (!free) return;
      piece.slots = { ...piece.slots, [free[0]]: ref };
      piece.buttons = [...new Set(Object.values(piece.slots))];
    } else if (LEVEL_TYPES.includes(piece.type) && sendByOf(piece) === 'updown') {
      piece.buttons = piece.buttons[1] === ref ? piece.buttons : [piece.buttons[1] ?? ref, ref];
    } else if (piece.type === 'preset') {
      if ((piece.sequence?.length ?? 0) >= MAX_SEQUENCE) return;
      piece.sequence = [...(piece.sequence ?? []), { button: ref }];
      piece.buttons = [...new Set(piece.sequence.flatMap(step => ('button' in step ? [step.button] : [])))];
    } else if (piece.buttons.length) piece.buttons[0] = ref;
    else return;
    this.selected = [piece.id];
    this.tab = 'function';
    void this.commit(layout);
  }

  private duplicatePieces(ids: string[]): void {
    let layout = this.layout();
    const copies: string[] = [];
    for (const id of ids) {
      const piece = layout.find(item => item.id === id && item.type !== 'canvas');
      if (!piece) continue;
      const copy = { ...structuredClone(piece), id: uniqueId(layout, piece.id) };
      layout = [...layout, { ...copy, ...freeSpot(layout, copy.w, copy.h) }];
      copies.push(copy.id);
    }
    this.selected = copies;
    void this.commit(layout);
  }

  private async removePieces(ids: string[]): Promise<void> {
    const pieces = ids.map(id => this.layout().find(p => p.id === id)).filter((p): p is RfWidget => !!p);
    if (!pieces.length) return;
    const name =
      pieces.length > 1
        ? t('{count} elementos', { count: pieces.length })
        : (pieces[0].label ?? (pieces[0].buttons[0] ? this.name(pieces[0].buttons[0]) : t(variantOf(pieces[0]).name)));
    if (
      await confirmDialog(this.root, {
        title: t('¿Quitar «{name}» del control?', { name }),
        message: t('El botón y sus acciones se conservan.'),
        confirm: t('Quitar'),
      })
    ) {
      this.selected = [];
      await this.commit(this.layout().filter(w => !ids.includes(w.id)));
    }
  }

  /** Another kind of the same family: what can be kept is kept. */
  private convert(piece: RfWidget, variant: Variant): void {
    if (variant.id === 'brand') {
      piece.brand = piece.brand ?? 'YouTube';
      piece.label = piece.label ?? piece.brand;
    } else delete piece.brand;
    if (variant.type === 'modes' || piece.type === 'modes') {
      if (variant.id === 'list') piece.display = 'list';
      else if (piece.display === 'list') delete piece.display;
    }
    if (['canvas', 'title', 'separator'].includes(variant.type)) {
      delete piece.chart;
      delete piece.period;
    }
    if (piece.type === 'preset' && variant.type !== 'preset') delete piece.sequence;
    if (variant.type === 'preset') {
      piece.sequence = piece.buttons.slice(0, MAX_SEQUENCE).map(button => ({ button }));
      piece.buttons = [...new Set(piece.buttons)].slice(0, 12);
    }
    if (variant.type === 'button' || variant.type === 'preset')
      piece.buttons = piece.buttons.slice(0, variant.type === 'button' ? 1 : 12);
    if (variant.type === 'toggle') piece.buttons = piece.buttons.slice(0, 2);
    if (LEVEL_TYPES.includes(variant.type) && !piece.sendBy) piece.sendBy = sendByOf(piece);
    if (variant.type === 'cycle' && piece.buttons.length > 4) {
      piece.buttons = piece.buttons.slice(0, 4);
      piece.options = piece.options?.slice(0, 4);
    }
    if (piece.orientation && !['updown', 'slider', 'steps'].includes(variant.type)) delete piece.orientation;
    if (piece.hold === 'other' && variant.type !== 'button') {
      delete piece.hold;
      delete piece.holdButton;
    }
    piece.type = variant.type;
    if (piece.form && !formsFor(piece).includes(piece.form)) {
      delete piece.form;
      delete piece.win;
      delete piece.winSide;
    }
  }

  // Rendering ------------------------------------------------------------

  /** Prevent another edit from being silently discarded while its predecessor saves. */
  private reflectBusy(): void {
    this.setAttribute('aria-busy', String(this.busy));
    this.canvas.inert = this.busy;
    if (this.busy)
      this.root.querySelectorAll<HTMLInputElement>('input, select, textarea, button').forEach(control => {
        control.disabled = true;
      });
  }

  private render(): void {
    if (!this.remote || !this.options) return;
    const scroll = this.root.querySelector('.insp-body')?.scrollTop ?? 0;
    const tools = `<div class="dbar"><div class="seg dmode" role="group"><button type="button" data-mode="design" aria-pressed="${!this.testing}" aria-label="${e(t('Editar'))}" title="${e(t('Editar'))}">${glyph('mdi:pencil')}<span>${e(t('Editar'))}</span></button><button type="button" data-mode="test" aria-pressed="${this.testing}" aria-label="${e(t('Probar'))}" title="${e(t('Probar'))}"${this.options.press ? '' : ' disabled'}>${glyph('mdi:play')}<span>${e(t('Probar'))}</span></button></div><span class="grow"></span>${iconButton(t('Deshacer') + ' · Ctrl+Z', 'mdi:undo', `data-undo${!this.history.length || this.busy ? ' disabled' : ''}`)}${iconButton(t('Rehacer') + ' · Ctrl+Shift+Z', 'mdi:redo', `data-redo${!this.future.length || this.busy ? ' disabled' : ''}`)}</div>`;
    const dirty = this.dirty;
    const strip = `<div class="dedit${dirty ? ' dirty' : ''}" role="group" aria-label="${e(t('Cambios'))}">${glyph('mdi:pencil')}<span class="dtitle">${e(t('Editando el control de {name}', { name: personName(this.options.name, t('Control')) }))}</span><span class="grow"></span><button type="button" class="dlink" data-undo${!this.history.length || this.busy ? ' disabled' : ''}>${e(t('Deshacer'))}</button><button type="button" class="dlink" data-draft="discard"${dirty && !this.busy ? '' : ' disabled'}>${e(t('Descartar cambios'))}</button><button type="button" class="dsave" data-draft="save"${dirty && !this.busy ? '' : ' disabled'}>${e(t('Guardar'))}</button></div>`;
    this.root.innerHTML = `${strip}<div class="designer${this.testing ? ' testing' : ''}">${tools}<div class="stage"><div class="canvas"></div><p class="error-text" role="status">${e(this.error)}</p></div><aside class="insp" aria-label="${e(t('Inspector'))}">${this.inspector()}</aside></div>${this.dupOpen ? this.dupDialog() : ''}`;
    this.canvas.estimated = this.options.estimated;
    this.canvas.preview = !this.testing;
    this.canvas.onPress = this.testing ? this.options.press : undefined;
    this.canvas.readValues = this.options.readValues;
    this.canvas.history = this.options.history;
    this.canvas.renderContent = this.options.renderContent
      ? piece => this.options?.renderContent?.(piece, this.testing) ?? null
      : undefined;
    this.canvas.remote = this.remote;
    this.canvas.editing = !this.testing;
    if (this.templatePreview && !this.selected.length) {
      const theme = this.templatePreview;
      this.preview(canvas => { canvas.theme = theme; }, true);
    }
    this.canvas.selected = this.testing ? [] : this.selected;
    this.root.querySelector('.canvas')!.append(this.canvas);
    const body = this.root.querySelector('.insp-body');
    if (body) body.scrollTop = scroll;
    this.bind();
    this.mountDesignPreviews();
    this.reflectBusy();
  }

  /** About eighty brands and keys, grouped, with a search. */
  private brandList(mode: 'drag' | 'pick'): string {
    const query = this.brandQuery.trim().toLowerCase();
    const groups = BRAND_GROUPS.map(
      ([group, list]) =>
        [
          group,
          list.filter(
            ([name]) => !query || name.toLowerCase().includes(query) || t(name).toLowerCase().includes(query),
          ),
        ] as const,
    ).filter(([, list]) => list.length);
    return `<input class="bsearch" type="search" name="brand-search" placeholder="${e(t('{count} marcas y teclas', { count: BRAND_COUNT }))}" value="${e(this.brandQuery)}" aria-label="${e(t('Buscar marca'))}">${
      groups
        .map(
          ([group, list]) =>
            `<div class="egrp"><span>${e(t(group))}</span><div class="bgrid">${list
              .map(
                ([name]) =>
                  `<button type="button" class="brand" ${mode === 'drag' ? `draggable="true" data-drag="brand" data-value="${e(name)}"` : `data-brand="${e(name)}"`} title="${e(t(name))}">${brandMark(name)}<span>${e(t(name))}</span></button>`,
              )
              .join('')}</div></div>`,
        )
        .join('') || '<p class="muted">—</p>'
    }`;
  }

  private inspector(): string {
    if (this.testing)
      return `<div class="ihead"><span class="tile">${glyph('mdi:play')}</span><b>${e(t('Probar'))}</b></div>`;
    if (this.adding) return this.newPiecePanel();
    const chosen = this.pieces();
    if (!chosen.length) return this.editPanel();
    const headTools = `${iconButton(t('Duplicar') + ' · Ctrl+D', 'mdi:content-duplicate', 'data-command="duplicate"', 'sm')}${iconButton(t('Quitar') + ' · Supr', 'mdi:trash-can-outline', 'data-command="remove"', 'sm danger')}`;
    if (chosen.length > 1)
      return `<div class="ihead"><span class="tile">${glyph('mdi:selection-multiple')}</span><b>${e(t('{count} elementos', { count: chosen.length }))}</b>${headTools}</div><div class="insp-body">${this.lookRows(chosen[0], true)}</div>`;
    return this.piecePanel(chosen[0]);
  }

  /** The steps of a button, each with its one-line summary and its rows (built only when open). */
  private steps(piece: RfWidget): [StepId, string, string, () => string][] {
    const entry = entryOf(piece);
    const refs = [...new Set([...piece.buttons, ...Object.values(piece.slots ?? {})])].filter(Boolean);
    const sent = refs.slice(0, 3).map(ref => this.name(ref)).join(' · ') + (refs.length > 3 ? ' …' : '');
    const family = FAMILY[entry];
    const formName = piece.form ? t(FORM_LOOK[piece.form][0]) : family ? t(variantOf(piece).name) : t('Como siempre');
    const list: [StepId, string, string, () => string][] = [
      ['what', t('Qué botón es'), `${t(ENTRY[entry][0])} · ${this.pieceTitle(piece)}`, () => `<div class="nowis">${glyph(ENTRY[entry][1])}<span>${e(t('Ahora es'))} <b>${e(t(ENTRY[entry][0]))}</b> <small>· ${e(this.pieceTitle(piece))}</small></span></div>${this.catalog(entry)}`],
      ['form', t('Forma y tamaño'), `${formName} · ${piece.w} × ${piece.h}`, () => this.formRows(piece) + this.placeRows(piece)],
      ['look', t('Aspecto'), piece.style ? t(STYLE_LOOK[piece.style]) : t('Como el control'), () => this.lookRows(piece, false, false) + this.showsRows(piece, 'tap')],
    ];
    if (this.functionRows(piece, 'does')) list.push(['does', t('Qué hace'), sent || '—', () => this.functionRows(piece, 'does')]);
    if (this.functionRows(piece, 'gestures'))
      list.push(['gestures', t('Gestos'), piece.hold === 'repeat' ? t('Mantener: repite') : piece.hold === 'other' ? t('Mantener: otro botón') : t('Mantener: nada'), () => this.functionRows(piece, 'gestures')]);
    if (this.showsRows(piece, 'shows'))
      list.push(['shows', t('Qué muestra'), piece.reading !== undefined ? t('Estado: un sensor') : LEVEL_TYPES.includes(piece.type) || ['toggle', 'modes', 'cycle'].includes(piece.type) ? t('Estado: lo enviado') : t('Gráfica y estado'), () => this.showsRows(piece, 'shows')]);
    if (this.options?.pinTo && piece.type !== 'separator') list.push(['plan', t('En el plano'), t('Junto a su símbolo'), () => this.showsRows(piece, 'plan')]);
    return list;
  }

  /** 0.14 · a button is edited by steps: Accept / Discard each, pending ones in yellow. */
  private piecePanel(piece: RfWidget): string {
    if (this.stepPiece !== piece.id) {
      this.stepPiece = piece.id;
      this.pieceBase = structuredClone(piece);
      this.stepSnaps.clear();
      this.openStep = this.nextStep;
      this.nextStep = null;
    }
    const entry = ENTRY[entryOf(piece)];
    const headTools = `${iconButton(t('Duplicar') + ' · Ctrl+D', 'mdi:content-duplicate', 'data-command="duplicate"', 'sm')}${iconButton(t('Quitar') + ' · Supr', 'mdi:trash-can-outline', 'data-command="remove"', 'sm danger')}`;
    const steps = this.steps(piece)
      .map(([id, title, summary, body], i) => {
        const open = this.openStep === id;
        const pending = this.stepSnaps.has(id);
        const num = open || pending ? `<span class="snum">${i + 1}</span>` : `<span class="snum done">${glyph('mdi:check')}</span>`;
        return `<section class="step${open ? ' open' : ''}${pending ? ' pending' : ''}"><button type="button" class="shead" data-step-open="${id}" aria-expanded="${open}">${num}<b>${e(title)}<small>${e(summary)}</small></b>${pending ? `<i class="sdot" title="${e(t('Cambios sin aceptar'))}"></i>` : ''}${glyph(open ? 'mdi:chevron-up' : 'mdi:chevron-down')}</button>${
          open
            ? `<div class="sbody">${body()}<div class="sacts"><button type="button" class="sbtn" data-step-discard="${id}"${pending ? '' : ' disabled'}>${e(t('Descartar'))}</button><button type="button" class="sbtn primary" data-step-accept="${id}">${glyph('mdi:check')}${e(t('Aceptar'))}</button></div></div>`
            : ''
        }</section>`;
      })
      .join('');
    const all = this.stepSnaps.size
      ? `<div class="allacts"><button type="button" class="sbtn" data-steps="discard">${e(t('Descartar todo'))}</button><button type="button" class="sbtn primary" data-steps="accept">${glyph('mdi:check-all')}${e(t('Aceptar todo'))}</button></div>`
      : '';
    return `<div class="ihead">${iconButton(t('Volver a Editar control'), 'mdi:chevron-left', 'data-command="piece-back"', 'sm')}<b>${e(this.pieceTitle(piece))}<small>${e(t(entry[0]))}</small></b>${headTools}</div><div class="insp-body">${steps}${all}</div>`;
  }

  /** The title of a piece in lists: its own text, the button it sends, or its kind. */
  private pieceTitle(piece: RfWidget): string {
    if (piece.label) return piece.label;
    // Options read best by what they offer: «Frío · Seco · Calor».
    const options = (piece.options ?? []).map(option => option?.label).filter((label): label is string => !!label);
    if ((piece.type === 'modes' || piece.type === 'cycle') && options.length)
      return options.slice(0, 3).join(' · ') + (options.length > 3 ? ' …' : '');
    return piece.buttons[0] ? this.name(piece.buttons[0]) : t(ENTRY[entryOf(piece)][0]);
  }
  /** Pieces that use each learned button. */
  private users(): Map<string, RfWidget[]> {
    const users = new Map<string, RfWidget[]>();
    for (const piece of this.layout()) {
      if (piece.type === 'canvas') continue;
      const refs = new Set([
        ...piece.buttons,
        ...Object.values(piece.slots ?? {}),
        ...(piece.holdButton ? [piece.holdButton] : []),
        ...(piece.sequence ?? []).flatMap(step => ('button' in step ? [step.button] : [])),
      ]);
      for (const ref of refs) if (ref) users.set(ref, [...(users.get(ref) ?? []), piece]);
    }
    return users;
  }
  private module(id: string, icon: string, title: string, sub: string, body: string): string {
    const open = this.mods.has(id);
    return `<section class="mod${open ? ' open' : ''}"><button type="button" class="mhead" data-mod="${id}" aria-expanded="${open}"><span class="mtile">${glyph(icon)}</span><b>${e(title)}<small>${e(sub)}</small></b>${glyph(open ? 'mdi:chevron-up' : 'mdi:chevron-down')}</button>${open ? `<div class="mbody">${body}</div>` : ''}</section>`;
  }
  /** 0.14 · «Editar control»: learned buttons, the buttons of this control, style and canvas, and more. */
  private editPanel(): string {
    const layout = this.layout();
    const pieces = layout.filter(piece => piece.type !== 'canvas').sort((a, b) => a.y - b.y || a.x - b.x);
    const users = this.users();
    const learned = this.learned();
    const unused = learned.filter(button => !users.has(button.id)).length;
    const learnedRows =
      learned
        .map(button => {
          const using = users.get(button.id) ?? [];
          const name = personName(button.name);
          return `<div class="mrow${using.length ? '' : ' unused'}"><span class="mic">${glyph('mdi:access-point')}</span><span class="mtx"><b>${e(name)}</b><small>${e(using.length ? [...new Set(using.map(piece => this.pieceTitle(piece)))].join(' · ') : t('Sin usar'))}</small></span>${
            using.length
              ? `<button type="button" class="mgo" data-open-piece="${e(using[0].id)}" aria-label="${e(t('Abrir {name}', { name: this.pieceTitle(using[0]) }))}" title="${e(t('Abrir {name}', { name: this.pieceTitle(using[0]) }))}">${glyph('mdi:chevron-right')}</button>`
              : `<button type="button" class="madd" data-place="${e(button.id)}" aria-label="${e(t('Poner «{name}» en el control', { name }))}" title="${e(t('Poner «{name}» en el control', { name }))}">${glyph('mdi:plus')}</button>`
          }</div>`;
        })
        .join('') || `<p class="muted">${e(t('Todavía no hay botones aprendidos.'))}</p>`;
    const waitRows = this.wanted()
      .map(item => {
        const using = users.get(item.id) ?? [];
        return `<div class="mrow waiting"><span class="mic"><b class="mwant">!</b></span><span class="mtx"><b>${e(item.name)}</b><small>${e(t('Sin aprender'))}${using.length ? ` · ${e([...new Set(using.map(piece => this.pieceTitle(piece)))].join(' · '))}` : ''}</small></span>${
          this.options?.learn
            ? `<button type="button" class="madd" data-learn-wanted="${e(item.id)}" aria-label="${e(t('Aprender «{name}»', { name: item.name }))}" title="${e(t('Aprender «{name}»', { name: item.name }))}">${glyph('mdi:access-point')}</button>`
            : ''
        }${
          using.length
            ? `<button type="button" class="mgo" data-open-piece="${e(using[0].id)}" aria-label="${e(t('Abrir {name}', { name: this.pieceTitle(using[0]) }))}" title="${e(t('Abrir {name}', { name: this.pieceTitle(using[0]) }))}">${glyph('mdi:chevron-right')}</button>`
            : `<button type="button" class="mgo" data-unwant="${e(item.id)}" aria-label="${e(t('Quitar «{name}»', { name: item.name }))}" title="${e(t('Quitar «{name}»', { name: item.name }))}">${glyph('mdi:close')}</button>`
        }</div>`;
      })
      .join('');
    const learnFoot = `${
      this.options?.learn
        ? `<button type="button" class="mfoot" data-command="learn">${glyph('mdi:plus')}${e(t('Aprender un botón más'))}</button>`
        : ''
    }${
      this.addingWanted
        ? `<div class="mwadd"><input class="tin" name="wanted-name" maxlength="40" placeholder="${e(t('Nombre del botón'))}" aria-label="${e(t('Nombre del botón'))}"><button type="button" class="madd" data-command="wanted-ok" aria-label="${e(t('Agregar'))}" title="${e(t('Agregar'))}">${glyph('mdi:check')}</button><button type="button" class="mgo" data-command="wanted-cancel" aria-label="${e(t('Cancelar'))}" title="${e(t('Cancelar'))}">${glyph('mdi:close')}</button></div>`
        : `<button type="button" class="mfoot quiet" data-command="wanted-add">${glyph('mdi:alert-circle-outline')}${e(t('Agregar uno para aprender después'))}</button>`
    }`;
    const pieceRows = pieces
      .map(piece => {
        const entry = ENTRY[entryOf(piece)];
        return `<button type="button" class="mrow" data-open-piece="${e(piece.id)}"><span class="mic">${glyph(piece.icon ?? entry[1])}</span><span class="mtx"><b>${e(this.pieceTitle(piece))}</b><small>${e(t(entry[0]))}</small></span>${glyph('mdi:chevron-right')}</button>`;
      })
      .join('');
    const canvas = layout.find(piece => piece.type === 'canvas');
    const grid = gridOf(layout);
    const height = grid.rows ?? Math.max(2, rows(layout));
    const look = canvas?.style ? t(STYLE_LOOK[canvas.style]) : t(THEMES.find(([key]) => key === (canvas?.theme ?? 'hm'))?.[1] ?? 'Automático');
    const more = [
      `<button type="button" class="mrow" data-command="auto-layout"><span class="mic">${glyph('mdi:auto-fix')}</span><span class="mtx"><b>${e(t('Volver al diseño automático'))}</b></span></button>`,
      this.options?.duplicate
        ? `<button type="button" class="mrow" data-command="duplicate-remote"><span class="mic">${glyph('mdi:content-duplicate')}</span><span class="mtx"><b>${e(t('Duplicar para otro aparato'))}</b></span></button>`
        : '',
      this.options?.duplicate?.targets?.length && this.options.duplicate.applyDesign
        ? `<button type="button" class="mrow" data-command="copy-design"><span class="mic">${glyph('mdi:content-copy')}</span><span class="mtx"><b>${e(t('Copiar este diseño a otro control'))}</b></span></button>`
        : '',
    ].join('');
    const title = this.options?.trayTitle ?? t('Botones aprendidos');
    return `<div class="ihead"><span class="tile">${glyph('mdi:pencil')}</span><b>${e(t('Editar control'))}<small>${e(personName(this.options?.name, t('Control')))} · ${e(t('{count} botones', { count: pieces.length }))}</small></b></div><div class="insp-body">${this.module(
      'learned',
      'mdi:access-point',
      title,
      `${learned.length ? t('{count} · {unused} sin usar', { count: learned.length, unused }) : '—'}${this.wanted().length ? ` · ${t('{count} sin aprender', { count: this.wanted().length })}` : ''}`,
      `<div class="mlist">${waitRows}${learnedRows}</div>${learnFoot}`,
    )}${this.module(
      'pieces',
      'mdi:view-grid-outline',
      t('Botones de este control'),
      String(pieces.length),
      `<div class="mlist">${pieceRows}</div><button type="button" class="mfoot" data-command="new-piece">${glyph('mdi:plus')}${e(t('Botón nuevo'))}</button>`,
    )}${this.designModule()}${this.module('canvas', 'mdi:palette-swatch-outline', t('Estilo y lienzo'), `${look} · ${grid.columns} × ${height}`, this.canvasRows())}${this.module(
      'more',
      'mdi:dots-horizontal',
      t('Más'),
      t('copiar, duplicar, volver al inicio'),
      `<div class="mlist">${more}</div>`,
    )}</div>`;
  }
  /** 0.14 · «Diseño»: the three starting designs of the appliance; the learned buttons go with any of them. */
  private designModule(): string {
    const kind = this.options?.appliance;
    if (!kind) return '';
    const cards = DESIGNS.map(
      ([design, label, about, icon], i) =>
        `<div class="ddesign"><span class="dprev" data-dprev="${i}"></span><span class="dtx"><b>${glyph(icon)}${e(t(label))}</b><small>${e(t(about))}</small><button type="button" class="sbtn" data-use-design="${design}">${e(t('Usar este diseño'))}</button></span></div>`,
    ).join('');
    return this.module('design', 'mdi:view-dashboard-outline', t('Diseño'), t('Clásico, Moderno o Avanzado'), `<div class="ddesigns">${cards}</div>`);
  }
  private mountDesignPreviews(): void {
    const kind = this.options?.appliance;
    if (!kind || !this.mods.has('design') || this.selected.length || this.adding) return;
    DESIGNS.forEach(([design], i) => {
      const slot = this.root.querySelector(`[data-dprev="${i}"]`);
      if (!slot) return;
      this.designPreviews[i].remote = {
        id: `design-${design}`,
        buttons: this.learned().map(button => ({ ...button, fingerprint: '' })),
        parts: [],
        layout: applyTemplate(kind, design, this.learned()),
      };
      slot.append(this.designPreviews[i]);
    });
  }
  /** «Rutinas»: one big card per routine not on the control yet, two per row below what is there. */
  private addRoutines(): void {
    const routines = this.options?.routines ?? [];
    let layout = this.layout();
    const used = this.users();
    const missing = routines.filter(routine => !used.has(routine.id));
    if (!missing.length) {
      this.error = t('Todas las rutinas ya están en el control.');
      this.render();
      return;
    }
    const columns = gridOf(layout).columns;
    const width = Math.max(1, Math.floor(columns / 2));
    let row = Math.max(0, ...layout.filter(piece => piece.type !== 'canvas').map(piece => piece.y + piece.h));
    missing.forEach((routine, i) => {
      const x = (i % 2) * width;
      if (i && i % 2 === 0) row++;
      const piece: RfWidget = { id: uniqueId(layout, 'rutina'), type: 'button', x, y: row, w: width, h: 1, buttons: [routine.id], label: routine.name, icon: 'mdi:play-circle-outline', form: 'pill' };
      layout = add(layout, piece);
    });
    const canvas = layout.find(item => item.type === 'canvas');
    if (canvas && row + 1 > canvas.h) layout = layout.map(item => (item === canvas ? { ...canvas, h: Math.min(MAX_GRID_ROWS, row + 1) } : item));
    this.adding = false;
    this.selected = [];
    void this.commit(layout);
  }
  /** Swaps the arrangement for a starting design; asks first, and it can be undone. */
  private async useDesign(design: StartDesign): Promise<void> {
    const kind = this.options?.appliance;
    if (!kind) return;
    const label = t(DESIGNS.find(([id]) => id === design)?.[1] ?? '');
    const names = new Set(this.learned().map(button => button.name.trim().toLowerCase()));
    const missing = learnOrder(kind, design).filter(item => !names.has(item.name.trim().toLowerCase())).length;
    if (
      !(await confirmDialog(this.root, {
        title: t('¿Usar el diseño {name}?', { name: label }),
        message:
          t('Reemplaza el acomodo de este control. Los botones aprendidos se conservan; se puede deshacer.') +
          (missing ? ' ' + t('{count} botones del diseño quedan sin aprender, con «!».', { count: missing }) : ''),
        confirm: t('Usar'),
      }))
    )
      return;
    this.selected = [];
    void this.commit(applyTemplate(kind, design, this.learned()));
  }
  /** The catalogue: five tabs, each entry with how many the control already has. */
  private catalog(current?: Entry): string {
    const counts = new Map<Entry, number>();
    for (const piece of this.layout()) if (piece.type !== 'canvas') counts.set(entryOf(piece), (counts.get(entryOf(piece)) ?? 0) + 1);
    const tabs = CATALOG.map(
      ([key, label, icon]) =>
        `<button type="button" role="tab" data-cat-tab="${key}" aria-selected="${this.catTab === key}" title="${e(t(label))}">${glyph(icon)}<span>${e(t(label))}</span></button>`,
    ).join('');
    const entries: string[] = (CATALOG.find(([key]) => key === this.catTab)?.[3] ?? []).map(entry => {
      const [label, icon] = ENTRY[entry];
      const count = counts.get(entry) ?? 0;
      const preview = ['dpad', 'numpad', 'transport', 'colors'].includes(entry) ? `<span class="bprev">${blockPreview(entry as WidgetType)}</span>` : glyph(icon);
      return `<button type="button" class="ctile" data-entry="${entry}" aria-pressed="${current === entry}" title="${e(t(label))}">${preview}<span>${e(t(label))}</span>${count ? `<em>${count}</em>` : ''}</button>`;
    });
    if (this.catTab === 'special' && this.options?.routines?.length)
      entries.push(
        `<button type="button" class="ctile" data-routines title="${e(t('Rutinas'))}">${glyph('mdi:robot-vacuum')}<span>${e(t('Rutinas'))}</span></button>`,
      );
    if (this.catTab === 'special' && this.options?.absolute)
      for (const control of this.options.controls ?? [])
        entries.push(
          `<button type="button" class="ctile" data-absolute-piece="${e(control.id)}" title="${e(control.label)}">${glyph('mdi:air-conditioner')}<span>${e(control.label)}</span></button>`,
        );
    return `<div class="ctabs" role="tablist">${tabs}</div><div class="ctiles">${entries.join('')}</div>`;
  }
  /** «Botón nuevo», step 1: which button it is. Choosing one adds it where there is room. */
  private newPiecePanel(): string {
    return `<div class="ihead">${iconButton(t('Volver'), 'mdi:chevron-left', 'data-command="new-cancel"', 'sm')}<b>${e(t('Botón nuevo'))}<small>${e(t('Paso 1 de varios'))}</small></b></div><div class="insp-body"><section class="step open"><div class="shead"><span class="snum">1</span><b>${e(t('Qué botón es'))}</b></div><div class="sbody">${this.catalog()}<div class="sacts"><button type="button" class="sbtn" data-command="new-cancel">${e(t('Cancelar'))}</button></div></div></section></div>`;
  }
  /** Columns and rows, gap, corners, theme, templates, body colour, button style and accent. */
  private canvasRows(): string {
    const layout = this.layout();
    const grid = gridOf(layout);
    const canvas = layout.find(piece => piece.type === 'canvas');
    const theme = canvas?.theme ?? 'hm';
    const height = grid.rows ?? Math.max(2, rows(layout));
    return `<div class="isec">${e(t('Lienzo'))}</div>${row('mdi:view-grid-outline', t('Columnas y filas'), `<span class="sizes">${stepper('cols', grid.columns, 2, MAX_COLUMNS, t('Columnas'))}<span>×</span>${stepper('rows', height, 2, MAX_GRID_ROWS, t('Filas'))}</span>`)}${row('mdi:arrow-expand-all', t('Separación'), slider('gap', 2, 24, canvas?.gap ?? 10, 'px', t('Separación')))}${row('mdi:square-rounded-outline', t('Esquinas del control'), slider('body-radius', 0, 60, canvas?.radius ?? 28, 'px', t('Esquinas del control')))}<div class="isec">${e(t('Tema'))}</div><div class="themes">${THEMES.map(([key, label]) => `<button type="button" class="theme theme-${key}" data-theme="${key}" aria-pressed="${theme === key}"><span class="tbody"><i></i><i></i><i></i><i></i></span><span>${e(t(label))}</span></button>`).join('')}</div><div class="isec">${e(t('Plantillas'))}</div>${row('mdi:palette', t('Vista previa de plantilla'), `<select class="isel" data-template-preview aria-label="${e(t('Vista previa de plantilla'))}"><option value="">—</option>${TEMPLATES.map(([key, label]) => `<option value="${key}"${this.templatePreview === key ? ' selected' : ''}>${e(t(label))}</option>`).join('')}</select>`)}${this.templatePreview ? `<div class="chips"><button type="button" class="chip" data-template-apply>${e(t('Aplicar a {name}', {name: personName(this.options?.name, t('Control'))}))}</button><button type="button" class="chip" data-template-cancel>${e(t('Cancelar'))}</button></div>` : ''}${row('mdi:format-color-fill', t('Color del cuerpo'), swatches('body', canvas?.bg, t('Color del cuerpo')))}<div class="isec">${e(t('Estilo de los botones'))}</div><div class="cstyles">${(['', ...CONTROL_STYLES] as (ControlStyle | '')[]).map(key => `<button type="button" class="cstyle${key ? ` st-${key}` : ''}" data-cstyle="${key}" aria-pressed="${(canvas?.style ?? '') === key}" title="${e(t(key ? STYLE_LOOK[key] : 'Del tema'))}"><span class="cprev"><i>${glyph('mdi:power')}</i><i></i></span><span>${e(t(key ? STYLE_LOOK[key] : 'Del tema'))}</span></button>`).join('')}</div>${row('mdi:palette', t('Color de acento'), swatches('accent', canvas?.accent, t('Color de acento')))}`;
  }

  private lookRows(piece: RfWidget, many = false, place = true): string {
    const variant = variantOf(piece);
    const words = piece.type !== 'separator';
    const showsIcon = !piece.brand && !isBlock(piece.type) && !['separator', 'graph'].includes(piece.type);
    let html = '';
    if (!many && words)
      html += `${row('mdi:format-text', t('Texto e ícono'), `<div class="tline">${showsIcon ? iconPicker(piece.icon ?? '', t('Icono'), 'name="widget-icon" clearable') : ''}<input class="tin" type="text" name="widget-label" maxlength="40" value="${e(piece.label ?? '')}" placeholder="${e(piece.buttons[0] ? this.name(piece.buttons[0]) : t(variant.name))}" aria-label="${e(t('Texto que se ve'))}"></div>`)}${
        variant.cat === 'button' || variant.cat === 'mode'
          ? row(
              'mdi:eye-outline',
              t('Qué se ve'),
              seg(
                'show',
                [
                  ['icon', t('Solo ícono'), 'mdi:shape-outline'],
                  ['text', t('Solo texto'), 'mdi:format-text'],
                  ['both', t('Ícono y texto'), 'mdi:label-outline'],
                ],
                piece.hideLabel ? 'icon' : piece.hideIcon ? 'text' : 'both',
                true,
              ),
            )
          : ''
      }`;
    html += this.styleRows(piece, many);
    html += `<div class="isec">${e(t('Letra'))}</div>${row('mdi:format-size', t('Tamaño de letra'), slider('fontSize', 8, 40, piece.fontSize ?? 13, 'px', t('Tamaño de letra')))}${row(
      'mdi:format-bold',
      t('Grosor'),
      seg(
        'fontWeight',
        [
          ['400', t('Normal')],
          ['500', t('Medio')],
          ['700', t('Negrita')],
        ],
        String(piece.fontWeight ?? 500),
      ),
    )}${row('mdi:shape-outline', t('Tamaño del ícono'), slider('iconSize', 12, 64, piece.iconSize ?? 22, 'px', t('Tamaño del ícono')))}`;
    html += `<div class="isec">${e(t('Color'))}</div>${row('mdi:format-color-fill', t('Fondo'), swatches('bg', piece.bg, t('Fondo')))}${row('mdi:format-color-text', t('Letra e ícono'), swatches('fg', piece.fg, t('Letra e ícono')))}${row('mdi:border-color', t('Borde'), swatches('border', piece.border, t('Borde')))}${
      ['toggle', 'modes', 'steps', 'cycle', 'slider', 'knob'].includes(piece.type)
        ? row('mdi:power', t('Color al estar activo'), swatches('active', piece.active, t('Color al estar activo')))
        : ''
    }`;
    const radius = radiusOf(piece);
    html += `<div class="isec">${e(t('Forma'))}</div>${row('mdi:square-rounded-outline', t('Esquinas'), `<div class="islider"><input type="range" min="0" max="40" value="${Math.min(40, radius)}" data-num="radius" aria-label="${e(t('Esquinas'))}"><output>${radius >= 999 ? '◯' : `${radius}px`}</output>${iconButton(t('Píldora'), 'mdi:circle-outline', `data-pill aria-pressed="${radius >= 999}"`, 'sm')}</div>`)}${row(
      'mdi:layers-outline',
      t('Relieve'),
      seg(
        'relief',
        [
          ['raised', t('Con relieve')],
          ['flat', t('Liso')],
          ['outline', t('Contorno')],
        ],
        piece.relief ?? 'raised',
      ),
    )}`;
    if (!many && place) html += `<div class="isec">${e(t('Lugar'))}</div>${this.placeRows(piece)}`;
    return html;
  }

  /** 0.14 · step 2: the form. A Nivel or Opciones lists its kinds and its forms together. */
  private formRows(piece: RfWidget): string {
    const entry = entryOf(piece);
    const family = FAMILY[entry];
    const choices: [string, string, string][] = family
      ? [
          ...family.map(id => {
            const v = VARIANTS.find(item => item.id === id)!;
            return [`v:${id}`, t(v.name), v.icon] as [string, string, string];
          }),
          ...(FAMILY_FORMS[entry] ?? []).map(f => [`f:${f}`, t(FORM_LOOK[f][0]), FORM_LOOK[f][1]] as [string, string, string]),
        ]
      : formsFor(piece).length
        ? [['', t('Como siempre'), variantOf(piece).icon], ...formsFor(piece).map(f => [`f:${f}`, t(FORM_LOOK[f][0]), FORM_LOOK[f][1]] as [string, string, string])]
        : [];
    const current = piece.form ? `f:${piece.form}` : family ? `v:${variantOf(piece).id}` : '';
    let html = choices.length
      ? row(
          'mdi:shape-plus-outline',
          t('Forma'),
          `<div class="seg icons" role="group" aria-label="${e(t('Forma'))}">${choices
            .map(([value, label, icon]) => `<button type="button" data-shape="${value}" aria-pressed="${current === value}" title="${e(label)}" aria-label="${e(label)}">${glyph(icon)}</button>`)
            .join('')}</div>`,
        )
      : '';
    if (piece.form === 'window') {
      html += row(
        'mdi:window-closed-variant',
        t('Tipo de ventana'),
        seg('win', WINDOW_KINDS.map(k => [k === 'roller' ? '' : k, t(WIN_LOOK[k][0]), WIN_LOOK[k][1]] as [string, string, string]), piece.win && piece.win !== 'roller' ? piece.win : '', true),
      );
      if (piece.win === 'vertical' || piece.win === 'curtain')
        html += row(
          'mdi:arrow-left-right',
          t('Lado donde se junta'),
          seg('winSide', [['', t('Izquierda'), 'mdi:format-horizontal-align-left'], ['r', t('Derecha'), 'mdi:format-horizontal-align-right']], piece.winSide === 'r' ? 'r' : '', true),
        );
    }
    return html;
  }
  /** Column, row, width and height (dragging on the canvas does the same). */
  private placeRows(piece: RfWidget): string {
    const grid = gridOf(this.layout());
    return row('mdi:cursor-move', t('Columna, fila, ancho y alto'), `<div class="xywh">${stepper('x', piece.x + 1, 1, grid.columns, t('Columna'), 'X')}${stepper('y', piece.y + 1, 1, MAX_GRID_ROWS, t('Fila'), 'Y')}${stepper('w', piece.w, 1, grid.columns, t('Ancho'), '↔')}${stepper('h', piece.h, 1, 12, t('Alto'), '↕')}</div>`);
  }
  /** 0.14 · the button style and how its symbol moves. */
  private styleRows(piece: RfWidget, many: boolean): string {
    let html = `<div class="isec">${e(t('Estilo'))}</div>`;
    if (!many && this.selected.length > 1) html += this.formRows(piece);
    html += row(
      'mdi:palette-swatch-outline',
      t('Estilo del botón'),
      seg('style', [['', t('Del control'), 'mdi:link-variant'], ...CONTROL_STYLES.map(s => [s, t(STYLE_LOOK[s]), STYLE_ICON[s]] as [string, string, string])], piece.style ?? '', true),
    );
    if (MOVES.includes(piece.type) && !piece.brand) {
      html += row('mdi:animation-play-outline', t('Movimiento del símbolo'), seg('symAnim', ANIM_LOOK.map(([v, label, icon]) => [v, t(label), icon] as [string, string, string]), piece.symAnim ?? '', true));
      if (piece.symAnim)
        html += row(
          'mdi:clock-outline',
          t('Cuándo se mueve'),
          seg('symWhen', [['', t('Mientras está activo'), 'mdi:power'], ['always', t('Siempre'), 'mdi:all-inclusive']], piece.symWhen === 'always' ? 'always' : '', true),
        );
    }
    return html;
  }

  private refSelect(
    name: string,
    value: string | undefined,
    empty = t('Elegir botón'),
    attributes = '',
    label = empty,
  ): string {
    const choices =
      this.options?.controls && this.selected.length === 1 && this.pieces()[0]?.type === 'control'
        ? this.options.controls.map(c => ({ id: c.id, name: c.label }))
        : [...this.learned(), ...this.wanted().map(item => ({ id: item.id, name: `${item.name} · ${t('sin aprender')}` }))];
    return `<select class="isel" ${name ? `name="${name}"` : ''} ${attributes} aria-label="${e(label)}"><option value="">${e(empty)}</option>${choices.map(c => `<option value="${e(c.id)}"${value === c.id ? ' selected' : ''}>${e(c.name)}</option>`).join('')}</select>`;
  }

  /** 0.14 · colour while an option is chosen and how its symbol moves. */
  private optionLook(piece: RfWidget, i: number): string {
    const option = piece.options?.[i];
    const color = option?.color && /^#[0-9a-fA-F]{6}$/.test(option.color) ? option.color : '';
    return `<div class="optx"><div class="seg icons" role="group">${ANIM_LOOK.map(([v, label, icon]) => `<button type="button" data-option-anim="${i}" data-value="${v}" aria-pressed="${(option?.anim ?? '') === v}" title="${e(t(label))}" aria-label="${e(t(label))}">${glyph(icon)}</button>`).join('')}</div><span class="ocolw"><label class="ocol${color ? ' set' : ''}" style="--c:${color || 'transparent'}" title="${e(t('Color al elegirla'))}"><input type="color" data-option-color="${i}" value="${color || '#4F7A5A'}" aria-label="${e(t('Color al elegirla'))}"></label>${color ? `<button type="button" class="oclr" data-option-color-clear="${i}" title="${e(t('Quitar color'))}" aria-label="${e(t('Quitar color'))}">${glyph('mdi:close')}</button>` : ''}</span></div>`;
  }

  private functionRows(piece: RfWidget, part: 'does' | 'gestures' | 'all' = 'all'): string {
    const variant = variantOf(piece);
    const family = VARIANTS.filter(v => v.cat === variant.cat);
    let gest = '';
    let html =
      variant.id === 'control' || part !== 'all'
        ? ''
        : row(
            CATS[variant.cat][1],
            t('Tipo'),
            seg(
              'variant',
              family.map(v => [v.id, t(v.name)]),
              variant.id,
            ),
          );
    if (piece.type === 'control')
      return (
        html +
        row(
          'mdi:remote',
          t('Qué controla'),
          this.refSelect('ref-0', piece.buttons[0], undefined, '', t('Qué controla')),
        ) + (part === 'all' ? this.chartRows(piece) : '')
      );
    if (variant.cat === 'button') {
      if (piece.brand)
        html +=
          row(
            'mdi:play-box-outline',
            t('Marca'),
            `<button type="button" class="chip wide" data-command="brands" aria-expanded="${this.brandsFor}">${brandMark(piece.brand)}<span>${e(t(piece.brand))}</span>${glyph('mdi:chevron-down')}</button>`,
          ) + (this.brandsFor ? `<div class="ipop">${this.brandList('pick')}</div>` : '');
      if (piece.type === 'toggle')
        html +=
          row('mdi:power', t('Encender'), this.refSelect('ref-0', piece.buttons[0], undefined, '', t('Encender'))) +
          row(
            'mdi:power-off',
            t('Apagar'),
            this.refSelect('ref-1', piece.buttons[1], t('El mismo botón'), '', t('Apagar')),
          );
      else if (piece.type === 'preset') {
        const steps = (piece.sequence ?? [])
          .map((step, index) =>
            'wait' in step
              ? `<div class="seqr">${glyph('mdi:timer-sand')}<label class="ms"><input type="number" min="50" max="5000" step="50" value="${step.wait}" data-wait="${index}" aria-label="${e(t('Milisegundos'))}"><span>ms</span></label>${iconButton(t('Quitar'), 'mdi:close', `data-remove-step="${index}"`, 'sm')}</div>`
              : `<div class="seqr"><span class="sn">${index + 1}</span>${this.refSelect('', step.button, t('Paso {number}', { number: index + 1 }), `data-step="${index}"`)}<label class="tm" title="${e(t('Veces'))}"><input type="number" min="1" max="10" value="${step.times ?? 1}" data-times="${index}" aria-label="${e(t('Veces'))}"><span>×</span></label>${iconButton(t('Quitar'), 'mdi:close', `data-remove-step="${index}"`, 'sm')}</div>`,
          )
          .join('');
        const full = (piece.sequence?.length ?? 0) >= MAX_SEQUENCE;
        html += `<div class="isec">${e(t('Pasos'))}</div><div class="seqs">${steps}</div><div class="chips"><button type="button" class="chip" data-add-step="button"${full ? ' disabled' : ''}>${glyph('mdi:plus')}${e(t('Botón'))}</button><button type="button" class="chip" data-add-step="wait"${full ? ' disabled' : ''}>${glyph('mdi:timer-sand')}${e(t('Pausa'))}</button></div>`;
      } else
        html += row(
          'mdi:access-point',
          t('Envía'),
          this.refSelect('ref-0', piece.buttons[0], undefined, '', t('Envía')),
        );
      if (piece.type === 'button')
        gest +=
          row(
            'mdi:gesture-tap-hold',
            t('Al mantener apretado'),
            seg(
              'hold',
              [
                ['', t('Nada')],
                ['repeat', t('Repite')],
                ['other', t('Otro botón')],
              ],
              piece.hold ?? '',
            ),
          ) +
          (piece.hold === 'other'
            ? row(
                'mdi:access-point',
                t('Botón al mantener'),
                this.refSelect('hold-button', piece.holdButton, undefined, '', t('Botón al mantener')),
              )
            : '');
    } else if (variant.cat === 'level') {
      const count = levelCount(piece);
      const mode = sendByOf(piece);
      const named = !!piece.names;
      // 0.14: «Sólo sube y baja» is a Nivel without numbers or names (it does not know where it is).
      const plain = !piece.names && !piece.values && mode !== 'level';
      html += ['updown', 'slider', 'steps'].includes(piece.type)
        ? row(
            'mdi:swap-vertical',
            t('Sentido'),
            seg(
              'orientation',
              [
                ['vertical', t('Vertical'), 'mdi:arrow-up-down'],
                ['', t('Horizontal'), 'mdi:arrow-left-right'],
              ],
              piece.orientation ?? '',
              true,
            ),
          )
        : '';
      html += row(
        'mdi:numeric',
        t('Valores'),
        seg(
          'values',
          [
            ['numbers', t('Números')],
            ['names', t('Nombres')],
            ['plain', t('Sólo sube y baja')],
          ],
          plain ? 'plain' : named ? 'names' : 'numbers',
        ),
      );
      if (plain)
        html +=
          row('mdi:chevron-up', t('Subir'), this.refSelect('ref-1', piece.buttons[1], undefined, '', t('Subir'))) +
          row('mdi:chevron-down', t('Bajar'), this.refSelect('ref-0', piece.buttons[0], undefined, '', t('Bajar')));
      else html += named
        ? row(
            'mdi:format-list-bulleted',
            t('Niveles'),
            `<div class="lvln">${piece.names!.map((name, i) => `<span><input aria-label="${e(t('Nivel {number}', { number: i + 1 }))}" data-level="${i}" maxlength="20" value="${e(name)}">${piece.names!.length > 2 ? `<button type="button" data-level-remove="${i}" aria-label="${e(t('Quitar'))}">×</button>` : ''}</span>`).join('')}${piece.names!.length < MAX_LEVELS ? iconButton(t('Agregar nivel'), 'mdi:plus', 'data-command="level-add"', 'sm') : ''}</div>`,
          )
        : row(
            'mdi:ruler',
            t('Desde, hasta, paso y unidad'),
            `<div class="lvl4"><input type="number" aria-label="${e(t('Desde'))}" title="${e(t('Desde'))}" data-range="min" value="${piece.values?.min ?? 1}"><input type="number" aria-label="${e(t('Hasta'))}" title="${e(t('Hasta'))}" data-range="max" value="${piece.values?.max ?? Math.max(2, count)}"><input type="number" min="1" aria-label="${e(t('Paso'))}" title="${e(t('Paso'))}" data-range="step" value="${piece.values?.step ?? 1}"><input aria-label="${e(t('Unidad'))}" title="${e(t('Unidad'))}" data-range="unit" maxlength="6" value="${e(piece.values?.unit ?? '')}" placeholder="°"></div>`,
          );
      if (!plain) html += row(
        'mdi:repeat',
        t('Al llegar al final'),
        seg(
          'wrap',
          [
            ['', t('Frena')],
            ['true', t('Vuelve al inicio')],
          ],
          piece.wrap ? 'true' : '',
        ),
      );
      const levelsFit = count > 0 && count <= MAX_LEVELS;
      if (!plain) html += row(
        'mdi:access-point',
        t('Cómo envía'),
        seg(
          'sendBy',
          [
            ['updown', t('Subir / bajar')],
            ['advance', t('Uno que avanza')],
            ...(levelsFit ? [['level', t('Uno por nivel')] as [string, string]] : []),
          ],
          mode,
        ),
      );
      if (plain) {
        // Subir and Bajar are already above.
      } else if (mode === 'updown')
        html +=
          row('mdi:chevron-up', t('Subir'), this.refSelect('ref-1', piece.buttons[1], undefined, '', t('Subir'))) +
          row('mdi:chevron-down', t('Bajar'), this.refSelect('ref-0', piece.buttons[0], undefined, '', t('Bajar')));
      else if (mode === 'advance')
        html += row(
          'mdi:chevron-right',
          t('Botón que avanza'),
          this.refSelect('ref-0', piece.buttons[0], undefined, '', t('Botón que avanza')),
        );
      else
        html += Array.from(
          { length: piece.buttons.length },
          (_, i) =>
            `<div class="lvlsend"><span>${e(count ? levelText(piece, i) : String(i + 1))}</span>${this.refSelect(`ref-${i}`, piece.buttons[i], undefined, '', count ? levelText(piece, i) : String(i + 1))}${!piece.names && !piece.values && piece.buttons.length > 2 ? iconButton(t('Quitar'), 'mdi:close', `data-remove-ref="${i}"`, 'sm') : ''}</div>`,
        ).join('');
      gest += row(
        'mdi:gesture-tap-hold',
        t('Al mantener apretado'),
        seg(
          'hold',
          [
            ['', t('Nada')],
            ['repeat', t('Repite')],
          ],
          piece.hold ?? '',
        ),
      );
    } else if (variant.cat === 'mode') {
      const max = piece.type === 'cycle' ? 4 : 8;
      html += `<div class="isec">${e(t('Opciones'))}</div><div class="opts">${piece.buttons
        .map(
          (ref, i) =>
            `<div class="optr">${iconPicker(piece.options?.[i]?.icon ?? '', t('Icono'), `data-option-icon="${i}" clearable`)}<input aria-label="${e(t('Texto'))}" data-option-label="${i}" maxlength="20" value="${e(piece.options?.[i]?.label ?? '')}" placeholder="${e(this.name(ref))}">${this.refSelect(`ref-${i}`, ref, undefined, '', t('Opción') + ' ' + (i + 1))}${piece.buttons.length > 2 ? iconButton(t('Quitar'), 'mdi:close', `data-remove-ref="${i}"`, 'sm') : ''}</div>${this.optionLook(piece, i)}`,
        )
        .join(
          '',
        )}</div>${piece.buttons.length < max ? `<button type="button" class="chip" data-command="option-add">${glyph('mdi:plus')}${e(t('Opción'))}</button>` : ''}`;
    } else if (variant.cat === 'info') {
      if (piece.type === 'indicator' || piece.type === 'graph')
        html += this.readingRows(piece, t('Sensor de Home Assistant'));
    } else if (isBlock(piece.type)) {
      html += `<div class="isec">${e(t('Botones aprendidos'))}</div>${BLOCK_SLOTS[piece.type]
        .map(
          ([slot, name, icon]) =>
            `<div class="slotr">${icon ? glyph(icon) : piece.type === 'colors' ? `<i class="cdot" style="--cc:${{ red: '#d0453a', green: '#3f8f5f', yellow: '#d9b21f', blue: '#3f7fbf' }[slot]}"></i>` : `<b class="sk">${e(slot === 'ok' ? 'OK' : t(name))}</b>`}<span>${e(t(name))}</span>${this.refSelect('', piece.slots?.[slot], '—', `data-slot="${slot}"`, t(name))}</div>`,
        )
        .join('')}`;
    }
    if (part === 'gestures') return gest;
    if (part === 'does') return html;
    return html + gest + this.chartRows(piece);
  }

  private chartRows(piece: RfWidget): string {
    if (['canvas', 'title', 'separator'].includes(piece.type)) return '';
    const standalone = piece.type === 'graph';
    let html = standalone ? '' : this.readingRows(
      { ...piece, reading: piece.chart?.reading, attribute: piece.chart?.attribute },
      t('Lectura para la gráfica'), true,
    );
    if (!standalone && !piece.chart?.reading) return html;
    html += row(
          'mdi:clock-outline',
          t('Período'),
          seg(
            'period',
            [
              ['1h', t('1 h')],
              ['24h', t('24 h')],
              ['7d', t('7 días')],
              ['30d', t('30 días')],
            ],
            piece.period ?? '24h',
          ),
        );
    const chart = piece.chart ?? {};
        const field = (name: string, label: string, values: [string, string][], selected: string) =>
          row('mdi:tune', label, `<select class="isel" data-chart="${name}" aria-label="${e(label)}">${values.map(([value, title]) =>
            `<option value="${value}"${value === selected ? ' selected' : ''}>${e(title)}</option>`).join('')}</select>`);
        const number = (name: string, label: string, value: number | undefined, attrs = '') =>
          row('mdi:numeric', label, `<input class="tin" type="number" data-chart="${name}" aria-label="${e(label)}" value="${value ?? ''}" ${attrs}>`);
        html += field('scale', t('Escala'), [['auto', t('Automática')], ['fixed', t('Fija')], ['log', t('Logarítmica')]], chart.scale ?? 'auto');
        if (chart.scale === 'fixed') html += number('min', t('Mínimo'), chart.min, 'step="any"') +
          number('max', t('Máximo'), chart.max, 'step="any"');
        html += field('style', t('Trazo'), [['area', t('Línea y área')], ['line', t('Solo línea')]], chart.style ?? 'area') +
          field('precision', t('Precisión'), [['decimals', t('Decimales')], ['significant', t('Cifras significativas')]], chart.precision ?? 'decimals') +
          number('digits', t('Cantidad'), chart.digits, `min="${chart.precision === 'significant' ? 1 : 0}" max="6" step="1"`) +
          row('mdi:ruler', t('Unidad'), `<input class="tin" data-chart="unit" maxlength="16" aria-label="${e(t('Unidad'))}" value="${e(chart.unit ?? '')}">`);
    return html;
  }

  private readingRows(piece: RfWidget, label: string, chart = false): string {
    const readings = this.options?.readValues?.() ?? {};
    const ids = Object.keys(readings)
      .filter(
        id =>
          chart || piece.type === 'graph' || /^(sensor|binary_sensor|input_number|input_select|number|select|climate|fan|light|switch|media_player)\./.test(
            id,
          ) || id === piece.reading,
      )
      .sort();
    return `${row('mdi:home-assistant', label, `<select class="isel" ${chart ? 'data-chart="reading"' : 'name="reading"'} aria-label="${e(label)}"><option value="">${e(t('Sin lectura'))}</option>${ids.map(id => `<option value="${e(id)}"${id === piece.reading ? ' selected' : ''}>${e(String(readings[id]?.attributes?.friendly_name ?? id))}</option>`).join('')}</select>`)}${piece.reading ? row('mdi:code-braces', t('Atributo (avanzado)'), `<input class="tin" ${chart ? 'data-chart="attribute"' : 'name="attribute"'} maxlength="80" value="${e(piece.attribute ?? '')}" aria-label="${e(t('Atributo (avanzado)'))}">`) : ''}`;
  }

  private showsRows(piece: RfWidget, part: 'shows' | 'tap' | 'plan' | 'all' = 'all'): string {
    let html = '';
    if (part === 'tap' || part === 'plan') {
      if (part === 'plan')
        return this.options?.pinTo && piece.type !== 'separator'
          ? row('mdi:floor-plan', t('En el plano'), `<button type="button" class="chip" data-command="pin-to-plan">${glyph('mdi:pin-outline')}${e(t('Pegar junto a su símbolo'))}</button>`)
          : '';
      return `<div class="isec">${e(t('Al tocar'))}</div>${row('mdi:gesture-tap', t('Al tocar'), seg('anim', [['', t('Se hunde')], ['flash', t('Destello')], ['none', t('Nada')]], piece.anim ?? ''))}`;
    }
    if (LEVEL_TYPES.includes(piece.type))
      html +=
        row(
          'mdi:numeric',
          t('En el medio'),
          seg(
            'display',
            [
              ['value', t('Valor')],
              ['name', t('Nombre')],
              ['dots', t('Puntos')],
              ['text', t('Texto')],
            ],
            piece.display ?? (piece.names || piece.values ? 'value' : 'text'),
          ),
        ) +
        row(
          'mdi:format-size',
          t('Tamaño del valor'),
          slider('valueSize', 12, 40, piece.valueSize ?? 22, 'px', t('Tamaño del valor')),
        );
    if (['toggle', 'modes', 'cycle', ...LEVEL_TYPES].includes(piece.type)) {
      html += row(
        'mdi:home-assistant',
        t('De dónde sale el estado'),
        seg(
          'state-from',
          [
            ['sent', t('Lo enviado')],
            ['sensor', t('Un sensor')],
          ],
          piece.reading !== undefined ? 'sensor' : 'sent',
        ),
      );
      if (piece.reading !== undefined) html += this.readingRows(piece, t('Sensor'));
    }
    if (part === 'shows') return html + this.chartRows(piece);
    if (this.options?.pinTo && piece.type !== 'separator')
      html += row(
        'mdi:floor-plan',
        t('En el plano'),
        `<button type="button" class="chip" data-command="pin-to-plan">${glyph('mdi:pin-outline')}${e(t('Pegar junto a su símbolo'))}</button>`,
      );
    html += row(
      'mdi:gesture-tap',
      t('Al tocar'),
      seg(
        'anim',
        [
          ['', t('Se hunde')],
          ['flash', t('Destello')],
          ['none', t('Nada')],
        ],
        piece.anim ?? '',
      ),
    );
    return html;
  }

  private dupDialog(): string {
    const dup = this.options?.duplicate;
    if (!dup) return '';
    const base = personName(this.options?.name, t('Control'));
    const targets = dup.targets ?? [];
    const what =
      targets.length && dup.applyDesign
        ? `<div class="irow" title="${e(t('Qué se copia'))}">${glyph('mdi:content-copy')}${seg(
            'dup-what',
            [
              ['all', t('Diseño y botones')],
              ['design', t('Solo el diseño')],
            ],
            this.dupDesignOnly ? 'design' : 'all',
          )}</div>`
        : '';
    if (this.dupDesignOnly)
      return `<div class="veil" data-veil><div class="sheet" role="dialog" aria-modal="true" aria-label="${e(t('Duplicar control'))}"><h3>${glyph('mdi:content-duplicate')}${e(t('Duplicar «{name}»', { name: base }))}</h3>${what}<div class="irow" title="${e(t('Control que recibe el diseño'))}">${glyph('mdi:remote')}<select class="isel" name="dup-target" aria-label="${e(t('Control que recibe el diseño'))}">${targets.map(item => `<option value="${e(item.id)}">${e(personName(item.name))}</option>`).join('')}</select></div><div class="acts"><button type="button" data-dup="cancel">${e(t('Cancelar'))}</button><button type="button" class="primary" data-dup="ok">${e(t('Copiar diseño'))}</button></div></div></div>`;
    return `<div class="veil" data-veil><div class="sheet" role="dialog" aria-modal="true" aria-label="${e(t('Duplicar control'))}"><h3>${glyph('mdi:content-duplicate')}${e(t('Duplicar «{name}»', { name: base }))}</h3>${what}<input class="tin" type="text" name="dup-name" maxlength="80" value="${e(t('{name} (copia)', { name: base }))}" aria-label="${e(t('Nombre'))}">${
      dup.emitters.length
        ? `<div class="irow" title="${e(t('Emisor'))}">${glyph('mdi:access-point')}<select class="isel" name="dup-emitter" aria-label="${e(t('Emisor'))}">${dup.emitters.map(emitter => `<option value="${e(emitter.id)}"${emitter.id === dup.current ? ' selected' : ''}>${e(emitter.name)}</option>`).join('')}</select></div>`
        : ''
    }<div class="acts"><button type="button" data-dup="cancel">${e(t('Cancelar'))}</button><button type="button" class="primary" data-dup="ok">${e(t('Duplicar'))}</button></div></div></div>`;
  }

  // Events ---------------------------------------------------------------

  private keys(event: KeyboardEvent): void {
    const target = event.composedPath()[0] as HTMLElement;
    if (target?.closest?.('input,select,textarea,homemanager-icon-picker') || this.testing) return;
    const key = event.key.toLowerCase();
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && key === 'z') {
      event.preventDefault();
      this.root.querySelector<HTMLButtonElement>(event.shiftKey ? '[data-redo]' : '[data-undo]')?.click();
    } else if (ctrl && key === 'y') {
      event.preventDefault();
      this.root.querySelector<HTMLButtonElement>('[data-redo]')?.click();
    } else if (ctrl && key === 'd' && this.selected.length && !event.composedPath().includes(this.canvas)) {
      // On the canvas the control itself duplicates (once); here only from the panel.
      event.preventDefault();
      this.duplicatePieces(this.selected);
    } else if (
      (key === 'delete' || key === 'backspace') &&
      this.selected.length &&
      !target?.closest?.('homemanager-rf-remote')
    ) {
      event.preventDefault();
      void this.removePieces(this.selected);
    } else if (key === 'escape' && (this.selected.length || this.brandsFor)) {
      event.preventDefault();
      event.stopPropagation();
      this.select([]);
    }
  }

  private bind(): void {
    const root = this.root;
    const on = (selector: string, work: (element: HTMLElement, event: Event) => void, type = 'click') =>
      root
        .querySelectorAll<HTMLElement>(selector)
        .forEach(element => element.addEventListener(type, event => work(element, event)));
    on('[data-mode]', element => {
      this.testing = element.dataset.mode === 'test';
      this.render();
    });
    on('[data-undo]', () => {
      const layout = this.history.pop();
      if (layout !== undefined) void this.commit(layout, 'undo');
    });
    on('[data-redo]', () => {
      const layout = this.future.pop();
      if (layout !== undefined) void this.commit(layout, 'redo');
    });
    on('[data-draft=save]', () => void this.saveDraft());
    on('[data-draft=discard]', async () => {
      if (
        await confirmDialog(this.root, {
          title: t('¿Descartar los cambios?'),
          message: t('El control vuelve a como estaba guardado.'),
          confirm: t('Descartar'),
        })
      )
        this.discardDraft();
    });
    on('[data-command=auto-layout]', async () => {
      if (
        await confirmDialog(this.root, {
          title: t('¿Volver al diseño automático?'),
          message: t('Se reemplaza sólo la disposición; los botones y acciones se conservan.'),
          confirm: t('Volver'),
        })
      ) {
        this.selected = [];
        await this.commit(null);
      }
    });
    // Copying works on what is saved: a draft is saved first.
    const openDup = async (designOnly: boolean) => {
      if (this.dirty) {
        const choice = await choiceDialog(this.root, {
          title: t('¿Guardar los cambios?'),
          message: t('Para copiar o duplicar, primero se guardan los cambios.'),
          choices: [
            ['cancel', t('Cancelar')],
            ['save', t('Guardar'), 'primary'],
          ],
        });
        if (choice !== 'save' || !(await this.saveDraft())) return;
      }
      this.dupDesignOnly = designOnly;
      this.dupOpen = true;
      this.render();
      this.root.querySelector<HTMLInputElement>('[name=dup-name]')?.select();
    };
    on('[data-command=duplicate-remote]', () => void openDup(false));
    on('[data-command=copy-design]', () => void openDup(true));
    on('[data-set="dup-what"]', element => {
      this.dupDesignOnly = element.dataset.value === 'design';
      this.render();
    });
    on('[data-dup]', async element => {
      if (element.dataset.dup === 'ok' && this.dupDesignOnly) {
        const dup = this.options?.duplicate;
        const target = dup?.targets?.find(
          item => item.id === root.querySelector<HTMLSelectElement>('[name=dup-target]')?.value,
        );
        if (dup?.applyDesign && target) {
          const mapped = mapLayout(this.layout(), this.learned(), target.buttons);
          try {
            await dup.applyDesign(target.id, mapped.layout);
            this.error = mapped.left
              ? t('{count} elementos quedaron afuera: ese control no tiene sus botones.', { count: mapped.left })
              : '';
          } catch (error) {
            this.error = (error as Error).message;
          }
        }
        this.dupOpen = false;
        this.dupDesignOnly = false;
        this.render();
        return;
      }
      if (element.dataset.dup === 'ok') {
        const name = root.querySelector<HTMLInputElement>('[name=dup-name]')!.value.trim();
        const emitter = root.querySelector<HTMLSelectElement>('[name=dup-emitter]')?.value;
        if (!name) return;
        try {
          await this.options?.duplicate?.run(
            name,
            emitter && emitter !== this.options.duplicate.current ? emitter : undefined,
          );
          this.error = '';
        } catch (error) {
          this.error = (error as Error).message;
        }
      }
      this.dupOpen = false;
      this.render();
    });
    on('[data-veil]', (element, event) => {
      if (event.target === element) {
        this.dupOpen = false;
        this.render();
      }
    });
    on('[data-command=learn]', () => this.options?.learn?.());
    on('[data-absolute-piece]', element => {
      const id = element.dataset.absolutePiece!;
      if (!this.options?.controls?.some(control => control.id === id)) return;
      const layout = this.layout();
      const used = new Set(layout.map(piece => piece.id));
      let number = layout.length + 1;
      while (used.has('absolute-' + number)) number++;
      const piece: RfWidget = {
        id: 'absolute-' + number, type: 'control', x: 0, y: 0, w: Math.min(3, columnsOf(layout)), h: 1,
        buttons: [id], label: null, icon: null,
      };
      const next = add(layout, piece);
      const placed = next.find(item => item.id === piece.id);
      if (!placed) return;
      const canvas = next.find(item => item.type === 'canvas');
      if (canvas && placed.y + placed.h > canvas.h) canvas.h = Math.min(MAX_GRID_ROWS, placed.y + placed.h);
      this.selected = [piece.id];
      this.tab = 'function';
      void this.commit(next);
    });
    on('[data-tab]', element => {
      this.tab = element.dataset.tab as typeof this.tab;
      this.render();
    });
    on(
      '[name=brand-search]',
      element => {
        this.brandQuery = (element as HTMLInputElement).value;
        const position = (element as HTMLInputElement).selectionStart ?? this.brandQuery.length;
        this.render();
        const input = root.querySelector<HTMLInputElement>('[name=brand-search]');
        input?.focus();
        input?.setSelectionRange(position, position);
      },
      'input',
    );
    // 0.14 · the «Editar control» panel and the catalogue.
    on('[data-mod]', element => {
      const id = element.dataset.mod!;
      if (this.mods.has(id)) this.mods.delete(id);
      else this.mods.add(id);
      this.render();
    });
    on('[data-open-piece]', element => this.select([element.dataset.openPiece!]));
    on('[data-place]', element => {
      if (!this.testing) this.addPiece('press', undefined, { ref: element.dataset.place! });
    });
    on('[data-command=new-piece]', () => {
      this.adding = true;
      this.selected = [];
      this.render();
    });
    on('[data-command=new-cancel]', () => {
      this.adding = false;
      this.render();
    });
    on('[data-cat-tab]', element => {
      this.catTab = element.dataset.catTab as CatalogTab;
      this.render();
    });
    on('[data-entry]', element => {
      if (this.testing) return;
      const entry = element.dataset.entry as Entry;
      if (this.adding) return this.addEntry(entry);
      // Step 1 of a button: it becomes another kind and keeps what still makes sense.
      const piece = this.pieces()[0];
      const variant = VARIANTS.find(item => item.id === ENTRY[entry][2]);
      if (!piece || !variant || entryOf(piece) === entry) return;
      this.change(target => {
        if (variantOf(target).id !== variant.id) this.convert(target, variant);
        if (entry === 'window' && formsFor(target).includes('window')) target.form = 'window';
        else if (target.form === 'window') {
          delete target.form;
          delete target.win;
          delete target.winSide;
        }
      });
    });
    on('[data-shape]', element => {
      const value = element.dataset.shape!;
      this.change(piece => {
        if (value.startsWith('v:')) {
          const variant = VARIANTS.find(item => item.id === value.slice(2));
          if (variant && variant.id !== variantOf(piece).id) this.convert(piece, variant);
          delete piece.form;
          delete piece.win;
          delete piece.winSide;
          return;
        }
        if (!value) {
          delete piece.form;
          delete piece.win;
          delete piece.winSide;
          return;
        }
        const form = value.slice(2) as PieceForm;
        if (!formsFor(piece).includes(form)) {
          const home = VARIANTS.find(item => item.id === FORM_HOME[form]);
          if (home) this.convert(piece, home);
        }
        if (!formsFor(piece).includes(form)) return;
        piece.form = form;
        const [minW, minH] = FORM_MIN[form] ?? [1, 1];
        piece.w = Math.min(gridOf(this.layout()).columns, Math.max(piece.w, minW));
        piece.h = Math.max(piece.h, minH);
        if (form !== 'window') {
          delete piece.win;
          delete piece.winSide;
        }
      });
    });
    on('[data-step-open]', element => {
      const id = element.dataset.stepOpen as StepId;
      this.openStep = this.openStep === id ? null : id;
      this.render();
    });
    on('[data-step-accept]', element => {
      this.stepSnaps.delete(element.dataset.stepAccept as StepId);
      this.openStep = null;
      this.render();
    });
    on('[data-step-discard]', element => this.discardStep(element.dataset.stepDiscard as StepId));
    on('[data-steps=accept]', () => {
      this.stepSnaps.clear();
      this.openStep = null;
      this.render();
    });
    on('[data-steps=discard]', () => this.discardPiece());
    on('[data-command=piece-back]', () => this.select([]));
    on('[data-use-design]', element => void this.useDesign(element.dataset.useDesign as StartDesign));
    on('[data-routines]', () => this.addRoutines());
    on('[data-learn-wanted]', element => {
      const item = this.wanted().find(entry => entry.id === element.dataset.learnWanted);
      if (item) this.options?.learn?.(item.name);
    });
    on('[data-unwant]', element =>
      this.changeCanvas(canvas => {
        canvas.wanted = (canvas.wanted ?? []).filter(item => item.id !== element.dataset.unwant);
        if (!canvas.wanted.length) delete canvas.wanted;
      }),
    );
    on('[data-command=wanted-add]', () => {
      this.addingWanted = true;
      this.render();
      this.root.querySelector<HTMLInputElement>('[name=wanted-name]')?.focus();
    });
    on('[data-command=wanted-cancel]', () => {
      this.addingWanted = false;
      this.render();
    });
    const addWanted = () => {
      const name = this.root.querySelector<HTMLInputElement>('[name=wanted-name]')?.value.trim().slice(0, 40) ?? '';
      this.addingWanted = false;
      if (!name) return this.render();
      this.changeCanvas(canvas => {
        const list = canvas.wanted ?? [];
        const taken = new Set([...list.map(item => item.id), ...this.learned().map(button => button.id)]);
        const base = `w-${name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'boton'}`;
        let id = base;
        for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
        canvas.wanted = [...list, { id, name }];
      });
    };
    on('[data-command=wanted-ok]', addWanted);
    on('[name=wanted-name]', (_, event) => {
      if ((event as KeyboardEvent).key === 'Enter') addWanted();
      if ((event as KeyboardEvent).key === 'Escape') {
        this.addingWanted = false;
        this.render();
      }
    }, 'keydown');
    this.bindCanvasInspector();
    if (this.pieces().length) this.bindPieceInspector();
  }

  private bindCanvasInspector(): void {
    const root = this.root;
    root.querySelector<HTMLSelectElement>('[data-template-preview]')?.addEventListener('change', event => {
      const value = (event.target as HTMLSelectElement).value as RemoteTheme;
      this.templatePreview = REMOTE_THEMES.includes(value) ? value : undefined;
      this.render();
      this.root.querySelector<HTMLElement>('[data-template-preview]')?.focus();
    });
    root.querySelector('[data-template-apply]')?.addEventListener('click', () => {
      const theme = this.templatePreview;
      if (!theme) return;
      this.templatePreview = undefined;
      this.changeCanvas(canvas => { canvas.theme = theme; });
    });
    root.querySelector('[data-template-cancel]')?.addEventListener('click', () => {
      this.templatePreview = undefined;
      this.render();
      this.root.querySelector<HTMLElement>('[data-template-preview]')?.focus();
    });
    root.querySelectorAll<HTMLElement>('[data-theme]').forEach(button =>
      button.addEventListener('click', () =>
        this.changeCanvas(canvas => {
          const theme = button.dataset.theme as RemoteTheme | 'hm';
          if (theme === 'hm') delete canvas.theme;
          else if (REMOTE_THEMES.includes(theme)) canvas.theme = theme;
        }),
      ),
    );
    root.querySelectorAll<HTMLElement>('[data-cstyle]').forEach(button =>
      button.addEventListener('click', () =>
        this.changeCanvas(canvas => {
          const style = button.dataset.cstyle as ControlStyle | '';
          if (style && CONTROL_STYLES.includes(style)) canvas.style = style;
          else delete canvas.style;
        }),
      ),
    );
    root.querySelectorAll<HTMLElement>('[data-step-key=cols],[data-step-key=rows]').forEach(button =>
      button.addEventListener('click', () => {
        const key = button.dataset.stepKey!;
        const grid = gridOf(this.layout());
        const columns = clampNumber(grid.columns + (key === 'cols' ? Number(button.dataset.d) : 0), 2, MAX_COLUMNS);
        const height = clampNumber(
          (grid.rows ?? Math.max(2, rows(this.layout()))) + (key === 'rows' ? Number(button.dataset.d) : 0),
          2,
          MAX_GRID_ROWS,
        );
        const layout = structuredClone(this.layout());
        const canvas = this.canvasPiece(layout);
        canvas.w = columns;
        canvas.h = Math.max(height, ...layout.filter(p => p.type !== 'canvas').map(p => p.y + p.h));
        let next = layout.map(item => {
          if (item.type === 'canvas') return item;
          const w = Math.min(item.w, columns);
          return { ...item, w, x: Math.min(item.x, columns - w) };
        });
        for (const item of next) if (item.type !== 'canvas') next = place(next, item.id, item);
        void this.commit(next);
      }),
    );
    const bodySliders: [string, keyof RfWidget][] = [
      ['gap', 'gap'],
      ['body-radius', 'radius'],
    ];
    for (const [name, key] of bodySliders) {
      const input = root.querySelector<HTMLInputElement>(`[data-num="${name}"]`);
      if (!input || this.pieces().length) continue;
      input.addEventListener('input', () => {
        input.nextElementSibling!.textContent = `${input.value}px`;
        this.preview(canvas => ((canvas as unknown as Record<string, number>)[key] = Number(input.value)), true);
      });
      input.addEventListener('change', () =>
        this.changeCanvas(canvas => ((canvas as unknown as Record<string, number>)[key] = Number(input.value))),
      );
    }
    if (!this.pieces().length) this.bindColors(true);
  }

  private bindColors(canvas: boolean): void {
    const root = this.root;
    const apply = (key: string, value: string) => {
      const set = (piece: RfWidget) => {
        const record = piece as unknown as Record<string, unknown>;
        if (value) record[key === 'body' ? 'bg' : key] = value.toUpperCase();
        else delete record[key === 'body' ? 'bg' : key];
      };
      if (canvas) this.changeCanvas(set);
      else this.change(set);
    };
    root
      .querySelectorAll<HTMLElement>('[data-color]')
      .forEach(button =>
        button.addEventListener('click', () => apply(button.dataset.color!, button.dataset.value ?? '')),
      );
    root
      .querySelectorAll<HTMLInputElement>('[data-color-input]')
      .forEach(input => input.addEventListener('change', () => apply(input.dataset.colorInput!, input.value)));
  }

  private bindPieceInspector(): void {
    const root = this.root;
    const piece = this.pieces()[0];
    const on = (selector: string, work: (element: HTMLElement) => void, type = 'click') =>
      root
        .querySelectorAll<HTMLElement>(selector)
        .forEach(element => element.addEventListener(type, () => work(element)));
    const value = (element: HTMLElement) => (element as HTMLInputElement).value;
    on('[data-command=duplicate]', () => this.duplicatePieces(this.selected));
    on('[data-command=pin-to-plan]', () => this.options?.pinTo?.(piece.id));
    on('[data-chart]', element => {
      const field = element as HTMLInputElement | HTMLSelectElement;
      if (!field.reportValidity()) return;
      const key = field.dataset.chart!;
      const chart = { ...piece.chart } as Record<string, string | number>;
      if (!field.value.trim() && key !== 'min' && key !== 'max') delete chart[key];
      else chart[key] = ['digits', 'min', 'max'].includes(key) ? Number(field.value) : field.value;
      if (key === 'reading') {
        delete chart.attribute;
        if (!chart.reading) {
          this.change(p => { delete p.chart; delete p.period; });
          return;
        }
      }
      if (chart.scale === 'fixed') {
        chart.min ??= 0;
        chart.max ??= 100;
        if (Number(chart.min) >= Number(chart.max)) {
          field.value = String(piece.chart?.[key as 'min' | 'max'] ?? '');
          return;
        }
      }
      if (chart.precision === 'significant' && chart.digits === 0) chart.digits = 1;
      this.change(p => { p.chart = chart; });
    }, 'change');
    on('[data-command=remove]', () => void this.removePieces(this.selected));
    this.bindColors(false);
    on('[name=widget-label]', element => this.change(p => (p.label = value(element).trim() || null)), 'change');
    on('[name=widget-label]', element => this.preview(p => (p.label = value(element) || null)), 'input');
    on('[name=widget-icon]', element => this.change(p => (p.icon = value(element) || null)), 'change');
    // Segmented choices: data-set says which field, data-value what it becomes.
    on('[data-set]', element => {
      const key = element.dataset.set!;
      const choice = element.dataset.value ?? '';
      if (key === 'variant') {
        const variant = VARIANTS.find(v => v.id === choice);
        if (variant) this.change(p => this.convert(p, variant));
        return;
      }
      if (key === 'values') {
        this.change(p => {
          if (choice === 'names' && !p.names) {
            const count = Math.max(2, Math.min(MAX_LEVELS, levelCount(p) || 3));
            p.names = Array.from({ length: count }, (_, i) =>
              (p.values ? levelText(p, i) : t('Nivel {number}', { number: i + 1 })).slice(0, 20),
            );
            delete p.values;
          } else if (choice === 'numbers' && !p.values) {
            p.values = { min: 1, max: Math.max(2, levelCount(p) || 5), step: 1 };
            delete p.names;
          } else if (choice === 'plain') {
            delete p.values;
            delete p.names;
            p.sendBy = 'updown';
            delete p.wrap;
            // A plain up/down has no level to draw.
            if (p.form && !formsFor(p).includes(p.form)) {
              delete p.form;
              delete p.win;
              delete p.winSide;
            }
          }
          fitRefs(p, this.pool());
        });
        return;
      }
      if (key === 'state-from') {
        this.change(p => {
          if (choice === 'sensor')
            p.reading =
              p.reading ??
              Object.keys(this.options?.readValues?.() ?? {}).find(id => id.startsWith('sensor.')) ??
              'sensor.unknown';
          else {
            delete p.reading;
            delete p.attribute;
          }
        });
        return;
      }
      this.change(p => {
        const record = p as unknown as Record<string, unknown>;
        if (key === 'show') {
          delete p.hideIcon;
          delete p.hideLabel;
          if (choice === 'icon') p.hideLabel = true;
          if (choice === 'text') p.hideIcon = true;
        } else if (key === 'fontWeight') p.fontWeight = Number(choice) as 400 | 500 | 700;
        else if (key === 'form') {
          if (choice && formsFor(p).includes(choice as PieceForm)) p.form = choice as PieceForm;
          else delete p.form;
          if (p.form !== 'window') {
            delete p.win;
            delete p.winSide;
          }
        } else if (key === 'win') {
          if (choice) p.win = choice as RfWidget['win'];
          else delete p.win;
          if (p.win !== 'vertical' && p.win !== 'curtain') delete p.winSide;
        }
        else if (key === 'wrap') {
          if (choice) p.wrap = true;
          else delete p.wrap;
        } else if (key === 'sendBy') {
          p.sendBy = choice as 'updown' | 'advance' | 'level';
          fitRefs(p, this.pool());
        } else if (key === 'orientation') {
          const vertical = choice === 'vertical';
          if (vertical === (p.orientation === 'vertical')) return;
          if (vertical) p.orientation = 'vertical';
          else delete p.orientation;
          [p.w, p.h] = [Math.min(columnsOf(this.layout()), p.h), Math.min(12, p.w)];
        } else if (key === 'relief' && choice === 'raised') delete p.relief;
        else if (key === 'hold') {
          if (!choice) {
            delete p.hold;
            delete p.holdButton;
          } else {
            p.hold = choice as 'repeat' | 'other';
            if (choice === 'other')
              p.holdButton = p.holdButton ?? this.pool().find(id => id !== p.buttons[0]) ?? p.buttons[0];
            else delete p.holdButton;
          }
        } else if (choice) record[key] = choice;
        else delete record[key];
      });
    });
    // Sliders: shown while they move, saved when let go.
    root.querySelectorAll<HTMLInputElement>('.insp-body [data-num]').forEach(input => {
      const key = input.dataset.num!;
      if (key === 'gap' || key === 'body-radius') return;
      input.addEventListener('input', () => {
        input.nextElementSibling!.textContent = `${input.value}px`;
        this.preview(p => ((p as unknown as Record<string, number>)[key] = Number(input.value)));
      });
      input.addEventListener('change', () =>
        this.change(p => {
          (p as unknown as Record<string, number>)[key] = Number(input.value);
          if (key === 'radius') delete p.shape;
        }),
      );
    });
    on('[data-pill]', () =>
      this.change(p => {
        p.radius = radiusOf(p) >= 999 ? 14 : 999;
        delete p.shape;
      }),
    );
    // Place: the steppers move and resize; what is in the way moves down.
    on('[data-step-key]', element => {
      const key = element.dataset.stepKey!;
      if (!['x', 'y', 'w', 'h'].includes(key)) return;
      this.change(p => {
        (p as unknown as Record<string, number>)[key] = Math.max(
          key === 'w' || key === 'h' ? 1 : 0,
          (p as unknown as Record<string, number>)[key] + Number(element.dataset.d),
        );
      });
    });
    // References: which learned button each part sends.
    on(
      '.isel[name^=ref-]',
      element => {
        const index = Number(element.getAttribute('name')!.slice(4));
        const ref = value(element);
        this.change(p => {
          const before = p.buttons[index];
          if (p.type === 'toggle' && index === 1 && !ref) p.buttons = p.buttons.slice(0, 1);
          else if (ref) p.buttons[index] = ref;
          // 0.14 · «Envía»: a Botón takes the name and symbol of what it sends, unless it has its own.
          if (p.type === 'button' && !p.brand && index === 0 && ref && before !== ref) {
            const old = this.learned().find(button => button.id === before);
            const next = this.learned().find(button => button.id === ref);
            if (!p.label || p.label === old?.name) p.label = null;
            if (!p.icon || p.icon === old?.icon) p.icon = next?.icon ?? null;
          }
        });
      },
      'change',
    );
    on('[name=hold-button]', element => value(element) && this.change(p => (p.holdButton = value(element))), 'change');
    on('[data-remove-ref]', element =>
      this.change(p => {
        const index = Number(element.dataset.removeRef);
        p.buttons.splice(index, 1);
        p.options?.splice(index, 1);
      }),
    );
    on('[data-command=option-add]', () =>
      this.change(p => {
        const ref = this.pool().find(id => !p.buttons.includes(id)) ?? p.buttons[0];
        p.buttons.push(ref);
        p.options = [
          ...(p.options ?? p.buttons.slice(0, -1).map(() => ({ label: null, icon: null }))),
          { label: this.name(ref).slice(0, 20), icon: null },
        ];
      }),
    );
    on(
      '[data-option-label]',
      element =>
        this.change(p => {
          const index = Number(element.dataset.optionLabel);
          p.options = p.buttons.map((_, i) => p.options?.[i] ?? { label: null, icon: null });
          p.options[index] = { ...p.options[index], label: value(element).trim().slice(0, 20) || null };
        }),
      'change',
    );
    on(
      '[data-option-icon]',
      element =>
        this.change(p => {
          const index = Number(element.dataset.optionIcon);
          p.options = p.buttons.map((_, i) => p.options?.[i] ?? { label: null, icon: null });
          p.options[index] = { ...p.options[index], icon: value(element) || null };
        }),
      'change',
    );
    const optionLook = (index: number, look: { color?: string | null; anim?: string }) =>
      this.change(p => {
        p.options = p.buttons.map((_, i) => p.options?.[i] ?? { label: null, icon: null });
        const next = { ...p.options[index] } as NonNullable<RfWidget['options']>[number];
        if ('color' in look) {
          if (look.color) next.color = look.color.toUpperCase();
          else delete next.color;
        }
        if ('anim' in look) {
          if (look.anim && (SYM_ANIMS as string[]).includes(look.anim)) next.anim = look.anim as typeof next.anim;
          else delete next.anim;
        }
        p.options[index] = next;
      });
    on('[data-option-color]', element => optionLook(Number(element.dataset.optionColor), { color: value(element) }), 'change');
    on('[data-option-color-clear]', element => optionLook(Number(element.dataset.optionColorClear), { color: null }));
    on('[data-option-anim]', element => optionLook(Number(element.dataset.optionAnim), { anim: element.dataset.value ?? '' }));
    on(
      '[data-slot]',
      element =>
        this.change(p => {
          const slots = { ...p.slots };
          if (value(element)) slots[element.dataset.slot!] = value(element);
          else delete slots[element.dataset.slot!];
          p.slots = slots;
          p.buttons = [...new Set(Object.values(slots))];
        }),
      'change',
    );
    // Levels: names and the numeric range.
    on(
      '[data-level]',
      element =>
        this.change(p => {
          if (!p.names) return;
          const name = value(element).trim().slice(0, 20);
          if (name) p.names[Number(element.dataset.level)] = name;
        }),
      'change',
    );
    on('[data-level-remove]', element =>
      this.change(p => {
        if (!p.names || p.names.length <= 2) return;
        p.names.splice(Number(element.dataset.levelRemove), 1);
        fitRefs(p, this.pool());
      }),
    );
    on('[data-command=level-add]', () =>
      this.change(p => {
        if (!p.names || p.names.length >= MAX_LEVELS) return;
        p.names.push(t('Nivel {number}', { number: p.names.length + 1 }).slice(0, 20));
        fitRefs(p, this.pool());
      }),
    );
    on(
      '[data-range]',
      element =>
        this.change(p => {
          const range = { ...(p.values ?? { min: 1, max: 5, step: 1 }) };
          const key = element.dataset.range as 'min' | 'max' | 'step' | 'unit';
          if (key === 'unit') {
            if (value(element)) range.unit = value(element).slice(0, 6);
            else delete range.unit;
          } else range[key] = clampNumber(value(element), key === 'step' ? 1 : -9999, 9999);
          if (range.max <= range.min) range.max = range.min + range.step;
          while (Math.floor((range.max - range.min) / range.step) + 1 > 1000) range.step++;
          p.values = range;
          if (sendByOf(p) === 'level' && levelCount(p) > MAX_LEVELS) p.sendBy = 'updown';
          fitRefs(p, this.pool());
        }),
      'change',
    );
    // Sequence steps.
    const steps = (mutate: (sequence: PieceStep[]) => void) =>
      this.change(p => {
        const sequence = structuredClone(p.sequence ?? []);
        mutate(sequence);
        if (!sequence.length) return;
        p.sequence = sequence;
        p.buttons = [...new Set(sequence.flatMap(step => ('button' in step ? [step.button] : [])))];
        if (!p.buttons.length) {
          p.buttons = [this.pool()[0]];
          p.sequence.unshift({ button: p.buttons[0] });
        }
      });
    on('[data-add-step]', element =>
      steps(sequence =>
        sequence.push(
          element.dataset.addStep === 'wait' ? { wait: 500 } : { button: piece.buttons[0] ?? this.pool()[0] },
        ),
      ),
    );
    on('[data-remove-step]', element =>
      steps(sequence => sequence.length > 1 && sequence.splice(Number(element.dataset.removeStep), 1)),
    );
    on(
      '[data-step]',
      element =>
        value(element) &&
        steps(
          sequence =>
            (sequence[Number(element.dataset.step)] = {
              ...sequence[Number(element.dataset.step)],
              button: value(element),
            }),
        ),
      'change',
    );
    on(
      '[data-times]',
      element =>
        steps(sequence => {
          const step = sequence[Number(element.dataset.times)];
          if ('button' in step) step.times = clampNumber(value(element), 1, 10);
        }),
      'change',
    );
    on(
      '[data-wait]',
      element =>
        steps(sequence => (sequence[Number(element.dataset.wait)] = { wait: clampNumber(value(element), 50, 5000) })),
      'change',
    );
    // Readings.
    on(
      '[name=reading]',
      element =>
        this.change(p => {
          if (value(element)) p.reading = value(element);
          else if (['indicator', 'graph'].includes(p.type)) {
            delete p.reading;
            delete p.attribute;
          }
        }),
      'change',
    );
    on(
      '[name=attribute]',
      element =>
        this.change(p => {
          if (value(element).trim()) p.attribute = value(element).trim();
          else delete p.attribute;
        }),
      'change',
    );
    // Brands.
    on('[data-command=brands]', () => {
      this.brandsFor = !this.brandsFor;
      this.render();
    });
    on('[data-brand]', element =>
      this.change(p => {
        const brand = element.dataset.brand!;
        const before = p.brand;
        p.brand = brand;
        if (!p.label || p.label === before) p.label = brand.slice(0, 40);
        const match = this.learned().find(button => button.name.toLowerCase() === brand.toLowerCase());
        if (match) p.buttons = [match.id];
        this.brandsFor = false;
      }),
    );
  }
}
if (!customElements.get('homemanager-control-designer'))
  customElements.define('homemanager-control-designer', ControlDesigner);

/** A level piece uses as many learned buttons as the way it sends needs. */
function fitRefs(piece: RfWidget, pool: string[]): void {
  const [low, high] = pieceInputs(piece);
  const fill = [...piece.buttons, ...pool.filter(id => !piece.buttons.includes(id)), ...pool];
  if (piece.buttons.length < low) piece.buttons = fill.slice(0, low);
  if (piece.buttons.length > high) piece.buttons = piece.buttons.slice(0, high);
}

function blockPreview(type: WidgetType): string {
  const keys: Record<string, string> = {
    dpad: '<i class="pv-dpad"><b></b></i>',
    numpad: `<i class="pv-num">${'<b></b>'.repeat(12)}</i>`,
    transport: `<i class="pv-row">${'<b></b>'.repeat(3)}</i>`,
    colors:
      '<i class="pv-row pv-col"><b style="--cc:#d0453a"></b><b style="--cc:#3f8f5f"></b><b style="--cc:#d9b21f"></b><b style="--cc:#3f7fbf"></b></i>',
  };
  return keys[type] ?? '';
}

const row = (icon: string, label: string, control: string) =>
  `<div class="irow" title="${e(label)}">${glyph(icon)}<div class="ictl">${control}</div></div>`;
const seg = (key: string, items: ([string, string] | [string, string, string])[], value: string, icons = false) =>
  `<div class="seg${icons ? ' icons' : ''}" role="group">${items
    .map(
      ([v, label, icon]) =>
        `<button type="button" data-set="${key}" data-value="${e(v)}" aria-pressed="${value === v}" title="${e(label)}" aria-label="${e(label)}">${icon ? glyph(icon) : ''}${icons ? '' : e(label)}</button>`,
    )
    .join('')}</div>`;
const slider = (key: string, min: number, max: number, value: number, unit: string, label: string) =>
  `<div class="islider"><input type="range" min="${min}" max="${max}" value="${value}" data-num="${key}" aria-label="${e(label)}"><output>${value}${unit}</output></div>`;
const stepper = (key: string, value: number, min: number, max: number, label: string, prefix = '') =>
  `<span class="stp" title="${e(label)}">${prefix ? `<em>${e(prefix)}</em>` : ''}<button type="button" data-step-key="${key}" data-d="-1" aria-label="${e(label)} −"${value <= min ? ' disabled' : ''}>−</button><output aria-label="${e(label)}">${value}</output><button type="button" data-step-key="${key}" data-d="1" aria-label="${e(label)} +"${value >= max ? ' disabled' : ''}>+</button></span>`;
const swatches = (key: string, value: string | undefined, label: string) =>
  `<div class="sw">${['', ...SWATCHES]
    .map(
      color =>
        `<button type="button" class="${color ? '' : 'auto'}" data-color="${key}" data-value="${color}" style="--c:${color || 'transparent'}" aria-pressed="${(value ?? '').toUpperCase() === color}" aria-label="${e(`${label} ${color || t('Del tema')}`)}" title="${e(color || t('Del tema'))}"></button>`,
    )
    .join(
      '',
    )}<label class="swc" title="${e(t('Otro color'))}"><input type="color" data-color-input="${key}" value="${value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#4F7A5A'}" aria-label="${e(`${label} · ${t('Otro color')}`)}"><ha-icon icon="mdi:eyedropper-variant" aria-hidden="true"></ha-icon></label></div>`;

const designerStyles = `
:host{display:flex;flex-direction:column;min-width:0;height:100%;container-type:inline-size}
.dedit{display:flex;align-items:center;gap:10px;padding:7px 12px;background:color-mix(in srgb,var(--hm-warn,#d98b1f) 14%,var(--hm-surface));border-bottom:1px solid var(--hm-line);min-width:0;font-size:13px}
.dedit>ha-icon{--mdc-icon-size:16px;color:var(--hm-warn,#d98b1f);flex:none}
.dedit .dtitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}.dedit .grow{flex:1}
.dedit .dlink{border:0;background:transparent;color:var(--hm-ink);font-size:13px;padding:6px 4px;white-space:nowrap}.dedit .dlink:disabled{color:var(--hm-muted);opacity:.6}
.dedit .dsave{border:0;border-radius:9px;padding:7px 14px;background:var(--hm-warn,#d98b1f);color:#fff;font-weight:600;font-size:13px;white-space:nowrap}.dedit .dsave:disabled{background:var(--hm-surface-2);color:var(--hm-muted)}
.designer{flex:1;display:grid;grid-template-columns:minmax(0,1fr) 360px;grid-template-rows:auto minmax(0,1fr);height:100%;min-height:560px;background:var(--hm-bg)}
.dbar{grid-column:1/-1;display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--hm-line);background:var(--hm-surface);min-width:0}
.dbar .grow{flex:1}
.seg{display:inline-flex;gap:2px;padding:3px;border-radius:11px;background:var(--hm-surface-2);flex-wrap:wrap}
.seg button{display:inline-flex;align-items:center;gap:5px;min-height:30px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--hm-muted);font-size:12.5px}
.seg button[aria-pressed=true]{background:var(--hm-surface);color:var(--hm-ink);box-shadow:var(--hm-shadow)}
.seg.icons button{padding:0 6px}.seg ha-icon{--mdc-icon-size:16px}
.ib.sm{width:32px;height:32px;min-height:32px;border-radius:9px}.ib.sm ha-icon{--mdc-icon-size:18px}.ib.danger{color:var(--hm-alert)}
.bprev{display:grid;place-items:center;width:52px;height:52px;border-radius:12px;background:linear-gradient(160deg,#323a35,#1b1f1c);flex:none}
.bprev i{display:grid;gap:3px}.bprev b{display:block;background:#4a534d;border-radius:4px}
.pv-dpad{width:34px;height:34px;border-radius:50%;background:#3b433e;place-items:center}.pv-dpad b{width:14px;height:14px;border-radius:50%;background:#59635c}
.pv-num{grid-template-columns:repeat(3,8px)}.pv-num b{width:8px;height:7px}
.pv-row{grid-auto-flow:column}.pv-row b{width:9px;height:9px;border-radius:50%}.pv-col b{background:var(--cc)}
.bsearch{width:100%;min-height:36px;padding:4px 10px;box-sizing:border-box}
.bgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.brand{display:flex;align-items:center;gap:6px;min-height:0;padding:5px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-surface);font-size:12px;color:var(--hm-ink);text-align:left;cursor:grab}
.brand span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stage{position:relative;min-width:0;min-height:0;overflow:auto;display:flex;flex-direction:column;align-items:center;gap:10px;padding:28px 18px}
.canvas{width:100%;display:flex;justify-content:center}.canvas homemanager-rf-remote{width:100%}
.testing .stage{background:color-mix(in srgb,var(--hm-brand) 6%,var(--hm-bg))}
.error-text{margin:0;color:var(--hm-alert);font-size:13px}.error-text:empty{display:none}
.insp{position:relative;display:flex;flex-direction:column;min-height:0;border-left:1px solid var(--hm-line);background:var(--hm-surface)}
.ihead{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--hm-line)}
.ihead .tile{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,var(--hm-brand) 12%,transparent);color:var(--hm-brand);flex:none}
.ihead b{flex:1;min-width:0;display:grid;font-weight:500;font-size:14px;overflow:hidden}.ihead b small{font-weight:400;font-size:11px;color:var(--hm-muted)}
.itabs{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid var(--hm-line)}
.itabs button{min-height:36px;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--hm-muted);font-size:13px}
.itabs button[aria-selected=true]{color:var(--hm-ink);border-bottom-color:var(--hm-brand)}
.insp-body{flex:1;overflow:auto;padding:8px 12px 20px;display:flex;flex-direction:column;gap:6px}
.mod{border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface);overflow:hidden;flex:none}
.mod.open{border-color:color-mix(in srgb,var(--hm-brand) 35%,var(--hm-line))}
.mhead{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border:0;background:transparent;color:var(--hm-ink);text-align:left}
.mhead>ha-icon{--mdc-icon-size:18px;color:var(--hm-muted);flex:none}
.mtile{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:color-mix(in srgb,var(--hm-brand) 12%,transparent);color:var(--hm-brand);flex:none}.mtile ha-icon{--mdc-icon-size:18px}
.mhead b{flex:1;min-width:0;display:grid;font-weight:500;font-size:14px}.mhead b small{font-weight:400;font-size:11.5px;color:var(--hm-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mbody{display:flex;flex-direction:column;gap:6px;padding:0 10px 10px}
.mlist{display:flex;flex-direction:column;border:1px solid var(--hm-line);border-radius:12px;overflow:hidden}
.mrow{display:flex;align-items:center;gap:10px;width:100%;min-height:46px;padding:6px 8px 6px 10px;border:0;border-bottom:1px solid var(--hm-line);background:var(--hm-surface);color:var(--hm-ink);text-align:left;font:inherit}
.mrow:last-child{border-bottom:0}button.mrow:hover{background:var(--hm-surface-2)}
.mrow>ha-icon{--mdc-icon-size:18px;color:var(--hm-muted);flex:none}
.mic{display:grid;place-items:center;width:24px;flex:none;color:var(--hm-muted)}.mic ha-icon{--mdc-icon-size:18px}
.mtx{flex:1;min-width:0;display:grid}.mtx b{font-weight:500;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mtx small{font-size:11.5px;color:var(--hm-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mrow.unused .mtx small{color:var(--hm-warn,#b86e10)}
.mgo,.madd{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:9px;background:transparent;color:var(--hm-muted);flex:none}.mgo ha-icon,.madd ha-icon{--mdc-icon-size:18px}
.madd{background:color-mix(in srgb,var(--hm-brand) 12%,transparent);color:var(--hm-brand)}
.mrow.waiting .mtx small{color:var(--hm-warn,#b86e10)}
.mwant{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--hm-warn,#d98b1f);color:#fff;font-size:12px;font-weight:700}
.mwadd{display:flex;align-items:center;gap:6px}.mwadd .tin{flex:1;min-width:0}
.ddesigns{display:grid;gap:8px}
.ddesign{display:flex;gap:10px;align-items:center;padding:8px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface)}
.dprev{position:relative;width:96px;height:124px;flex:none;overflow:hidden;border-radius:9px;background:var(--hm-surface-2)}
.dprev homemanager-rf-remote{position:absolute;left:0;top:0;width:328px;transform:scale(.29);transform-origin:top left;pointer-events:none}
.dtx{flex:1;min-width:0;display:grid;gap:4px;justify-items:start}.dtx b{display:flex;align-items:center;gap:6px;font-weight:600;font-size:13.5px}.dtx b ha-icon{--mdc-icon-size:16px}.dtx small{font-size:12px;color:var(--hm-muted)}
.mfoot.quiet{color:var(--hm-muted);border-style:dotted}
.mfoot{display:flex;align-items:center;justify-content:center;gap:6px;min-height:40px;border:1px dashed var(--hm-line);border-radius:12px;background:transparent;color:var(--hm-brand);font:inherit;font-size:13px;font-weight:500}.mfoot ha-icon{--mdc-icon-size:18px}
.ctabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px;padding:3px;border-radius:12px;background:var(--hm-surface-2)}
.ctabs button{display:flex;flex-direction:column;align-items:center;gap:2px;min-height:46px;padding:4px 2px;border:0;border-radius:9px;background:transparent;color:var(--hm-muted);font-size:10.5px;min-width:0}
.ctabs button span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ctabs ha-icon{--mdc-icon-size:18px}
.ctabs button[aria-selected=true]{background:var(--hm-surface);color:var(--hm-ink);box-shadow:var(--hm-shadow)}
.ctiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding-top:8px}
.ctile{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:66px;padding:8px 4px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);color:var(--hm-ink);font:inherit;font-size:12px;text-align:center}
.ctile span{max-width:100%;overflow:hidden;text-overflow:ellipsis}.ctile>ha-icon{--mdc-icon-size:20px}
.ctile:hover{border-color:var(--hm-brand)}.ctile[aria-pressed=true]{border-color:var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 10%,var(--hm-surface))}
.ctile em{position:absolute;top:5px;right:5px;min-width:18px;height:18px;display:grid;place-items:center;border-radius:9px;background:var(--hm-brand);color:var(--hm-on-accent,#fff);font-style:normal;font-size:10.5px;font-weight:700}
.ctile .bprev{transform:scale(.8)}
.step{border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface);flex:none}
.step.open{border-color:var(--hm-brand)}.step.pending{border-color:var(--hm-warn,#d98b1f);background:color-mix(in srgb,var(--hm-warn,#d98b1f) 7%,var(--hm-surface))}
.shead{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border:0;background:transparent;color:var(--hm-ink);text-align:left;font:inherit}
.shead>ha-icon{--mdc-icon-size:18px;color:var(--hm-muted);flex:none}
.snum{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--hm-brand);color:var(--hm-on-accent,#fff);font-size:12px;font-weight:600;flex:none}
.snum.done{background:color-mix(in srgb,var(--hm-brand) 14%,transparent);color:var(--hm-brand)}.snum.done ha-icon{--mdc-icon-size:16px}
.step.pending .snum{background:var(--hm-warn,#d98b1f);color:#fff}
.shead b{flex:1;min-width:0;display:grid;font-weight:500;font-size:14px}.shead b small{font-weight:400;font-size:11.5px;color:var(--hm-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sdot{width:8px;height:8px;border-radius:50%;background:var(--hm-warn,#d98b1f);flex:none}
.sbody{display:flex;flex-direction:column;gap:6px;padding:2px 12px 12px;border-top:1px solid var(--hm-line)}
.sacts{display:flex;justify-content:flex-end;gap:8px;padding-top:10px;margin-top:4px;border-top:1px dashed var(--hm-line)}
.sbtn{min-height:36px;padding:0 14px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-surface);color:var(--hm-ink);font:inherit;font-size:13px}
.sbtn.primary{display:inline-flex;align-items:center;gap:6px;border-color:var(--hm-brand);background:var(--hm-brand);color:var(--hm-on-accent,#fff)}.sbtn.primary ha-icon{--mdc-icon-size:16px}
.allacts{position:sticky;bottom:0;display:flex;gap:8px;justify-content:flex-end;padding:10px 0 2px;background:linear-gradient(transparent,var(--hm-surface) 30%)}
.nowis{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:var(--hm-surface-2);font-size:13px}.nowis small{color:var(--hm-muted)}.nowis ha-icon{--mdc-icon-size:18px;color:var(--hm-brand)}
.isec{margin-top:8px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--hm-muted)}
.irow{display:flex;align-items:center;gap:8px;min-height:36px;color:var(--hm-muted)}
.irow>ha-icon{--mdc-icon-size:18px;flex:none;width:20px}
.ictl{flex:1;min-width:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.tline{display:flex;align-items:center;gap:6px;width:100%}
.tin,.isel{flex:1;min-width:0;width:100%;min-height:34px;padding:3px 8px;box-sizing:border-box;font-size:13px}
.islider{display:flex;align-items:center;gap:6px;width:100%}.islider input{flex:1;min-width:0;accent-color:var(--hm-brand)}
.islider output{min-width:38px;font-size:12px;text-align:right;color:var(--hm-ink);font-variant-numeric:tabular-nums}
.stp{display:inline-flex;align-items:center;border:1px solid var(--hm-line);border-radius:9px;overflow:hidden;background:var(--hm-bg)}
.stp em{font-style:normal;font-size:11px;padding:0 0 0 6px;color:var(--hm-muted)}
.stp button{width:26px;min-height:28px;padding:0;border:0;border-radius:0;background:transparent;color:var(--hm-ink)}
.stp output{min-width:22px;text-align:center;font-size:12.5px;color:var(--hm-ink);font-variant-numeric:tabular-nums}
.sizes{display:flex;align-items:center;gap:6px}
.xywh{display:grid;grid-template-columns:repeat(2,auto);gap:6px}
.sw{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.sw button{width:19px;height:19px;min-height:19px;padding:0;border-radius:50%;border:1px solid color-mix(in srgb,var(--hm-ink) 18%,transparent);background:var(--c)}
.sw button.auto{background:conic-gradient(var(--hm-surface-2) 0 25%,var(--hm-surface) 0 50%,var(--hm-surface-2) 0 75%,var(--hm-surface) 0);}
.sw button[aria-pressed=true]{box-shadow:0 0 0 2px var(--hm-surface),0 0 0 4px var(--hm-brand)}
.swc{position:relative;display:grid;place-items:center;width:21px;height:21px;border-radius:50%;background:var(--hm-surface-2);cursor:pointer}.swc ha-icon{--mdc-icon-size:14px}
.swc input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;min-height:0;padding:0}
.themes{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.cstyles{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.cstyle{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 4px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);font-size:11px;color:var(--hm-ink);min-width:0}
.cstyle>span:last-child{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cstyle[aria-pressed=true]{border-color:var(--hm-brand);box-shadow:inset 0 0 0 1px var(--hm-brand)}
.cprev{display:flex;gap:3px;padding:5px 6px;border-radius:9px;background:var(--rbody,var(--hm-bg));border:1px solid var(--hm-line)}
.cprev i{display:grid;place-items:center;width:16px;height:16px;border-radius:5px;background:var(--rkey,var(--hm-surface));color:var(--rfg,var(--hm-ink))}
.cprev i:last-child{background:var(--racc,var(--hm-brand))}.cprev ha-icon{--mdc-icon-size:11px}
.optx{display:flex;align-items:center;gap:6px;margin:-2px 0 6px 0}
.seg.icons:has(>button:nth-child(6)) button{width:30px;height:30px;min-height:30px;padding:0;border-radius:8px}
.optx .seg.icons button{width:28px;height:28px;min-height:28px}.optx .seg ha-icon{--mdc-icon-size:14px}
.ocolw{position:relative;flex:none;display:flex}
.oclr{position:absolute;top:-6px;right:-6px;display:grid;place-items:center;width:16px;height:16px;min-height:0;padding:0;border-radius:50%;background:var(--hm-surface);border:1px solid var(--hm-line);color:var(--hm-muted)}.oclr ha-icon{--mdc-icon-size:11px}
.ocol{position:relative;width:26px;height:26px;border-radius:8px;border:1px dashed var(--hm-line);background:var(--c);cursor:pointer;flex:none}
.ocol.set{border-style:solid;border-color:transparent}
.ocol input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.theme{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);font-size:11.5px;color:var(--hm-ink)}
.theme[aria-pressed=true]{border-color:var(--hm-brand);box-shadow:inset 0 0 0 1px var(--hm-brand)}
.tbody{display:grid;grid-template-columns:repeat(2,10px);gap:3px;padding:6px 8px;border-radius:9px;background:var(--hm-surface);border:1px solid var(--hm-line)}.tbody i{height:8px;border-radius:3px;background:var(--hm-bg)}
.theme-grafito .tbody{background:linear-gradient(160deg,#323a35,#1b1f1c);border-color:transparent}.theme-grafito .tbody i{background:#4a534d}
.theme-claro .tbody{background:linear-gradient(160deg,#fff,#eceee9)}.theme-claro .tbody i{background:#dfe3dc}
.theme-arena .tbody{background:linear-gradient(160deg,#f4ede1,#e2d5bf);border-color:transparent}.theme-arena .tbody i{background:#fcf8f1}
.theme-vidrio .tbody{background:linear-gradient(160deg,#6f9fc9,#b38bc0);border-color:transparent}.theme-vidrio .tbody i{background:rgba(255,255,255,.4)}
.chip{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 10px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-surface);font-size:12.5px;color:var(--hm-ink)}
.chip.wide{width:100%}.chip.wide span{flex:1;text-align:left}.chip ha-icon{--mdc-icon-size:16px}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.ipop{max-height:260px;overflow:auto;padding:8px;border:1px solid var(--hm-line);border-radius:12px;display:flex;flex-direction:column;gap:10px}
.seqs,.opts{display:flex;flex-direction:column;gap:6px}
.seqr,.optr,.slotr,.lvlsend{display:flex;align-items:center;gap:6px;min-width:0}
.seqr .isel,.optr .isel,.slotr .isel,.lvlsend .isel{flex:1}
.optr input{width:70px;min-height:34px;padding:3px 6px}.optr homemanager-icon-picker{flex:none}
.sn{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--hm-surface-2);font-size:11px;font-weight:700;color:var(--hm-ink);flex:none}
.ms,.tm{display:inline-flex;align-items:center;gap:3px;font-size:12px;color:var(--hm-muted)}.ms input{width:64px;min-height:32px}.tm input{width:44px;min-height:32px}
.slotr>span{width:72px;font-size:12.5px;color:var(--hm-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.slotr ha-icon{--mdc-icon-size:18px}.sk{display:grid;place-items:center;min-width:20px;font-size:12px}
.cdot{width:14px;height:14px;border-radius:50%;background:var(--cc);flex:none}
.lvlsend>span{min-width:52px;font-size:12.5px;color:var(--hm-ink)}
.lvl4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;width:100%}.lvl4 input{min-width:0;min-height:32px;padding:2px 4px;text-align:center}
.lvln{display:flex;flex-wrap:wrap;gap:4px;align-items:center}.lvln span{display:inline-flex;align-items:center;border:1px solid var(--hm-line);border-radius:8px;background:var(--hm-bg)}
.lvln input{width:64px;min-height:28px;border:0;background:transparent;padding:0 6px}.lvln button{width:22px;min-height:28px;padding:0;border:0;background:transparent;color:var(--hm-muted)}
.veil{position:fixed;inset:0;z-index:20;display:grid;place-items:center;background:rgba(0,0,0,.35)}
.sheet{width:min(380px,calc(100vw - 32px));display:grid;gap:12px;padding:18px;border-radius:18px;background:var(--hm-surface);box-shadow:var(--hm-shadow)}
.sheet h3{display:flex;align-items:center;gap:8px;margin:0;font-size:16px;font-weight:500}
.acts{display:flex;justify-content:flex-end;gap:8px}
.acts button{min-height:38px;padding:0 14px;border-radius:10px}.acts .primary{background:var(--hm-brand);color:var(--hm-on-accent);border-color:transparent}
.muted{color:var(--hm-muted);font-size:12px}
@container (max-width:980px){.designer{grid-template-columns:minmax(0,1fr) 320px}}
@container (max-width:760px){
  .designer{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(360px,1fr) auto;min-height:0;height:auto}
  .dedit{flex-wrap:wrap;row-gap:2px}.dedit>ha-icon{display:none}.dedit .dtitle{flex:1 1 100%}.dedit .grow{display:none}.dedit .dlink:first-of-type{margin-left:auto}
  .insp{border-left:0;border-top:1px solid var(--hm-line)}.insp-body{overflow:visible}
  .dmode span{display:none}
}
`;
