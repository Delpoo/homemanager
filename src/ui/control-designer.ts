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
import { confirmDialog } from './confirm-dialog.js';
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
  levelText,
  pieceInputs,
  sendByOf,
  type PieceStep,
  type RemoteTheme,
} from '../model/control-layout.js';
import { BRAND_COUNT, BRAND_GROUPS } from './brands.js';
import { brandMark, keyStyles, radiusOf } from './remote-keys.js';
import { personName } from '../model/names.js';

export interface DesignerOptions {
  key: string;
  remote: DrawableRemote;
  /** The control's name, shown above the canvas. */
  name?: string;
  controls?: { id: string; label: string }[];
  renderContent?: (piece: RfWidget) => HTMLElement | null;
  readValues?: HomeManagerRfRemote['readValues'];
  estimated: boolean;
  save(layout: RfWidget[] | null): Promise<void> | void;
  /** Test mode: a tap sends for real. Without it the designer never sends. */
  press?: (buttonId: string) => Promise<unknown>;
  /** "Learn more buttons" from the tray. */
  learn?: () => void;
  /** What the tray lists: learned buttons (remotes) or actions (a plan symbol). */
  trayTitle?: string;
  /** 0.13: the same control for another appliance (a copy with its own emitter). */
  duplicate?: {
    emitters: { id: string; name: string }[];
    current?: string;
    run(name: string, emitter?: string): Promise<void>;
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

/** The free designer (0.13), as in a design program: resources on the left (learned
 * buttons, elements, blocks, brands), the control in the middle (drag, resize, test)
 * and the inspector on the right (Look, Function, Shows). Every change is saved at
 * once and can be undone; it edits only layout and references, and sends nothing
 * unless test mode is on. */
export class ControlDesigner extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private options?: DesignerOptions;
  private remote?: DrawableRemote;
  private history: (RfWidget[] | null)[] = [];
  private future: (RfWidget[] | null)[] = [];
  private selected: string[] = [];
  private testing = false;
  private left: 'learned' | 'elements' | 'blocks' | 'brands' = 'elements';
  private tab: 'look' | 'function' | 'shows' = 'look';
  private brandQuery = '';
  private brandsFor = false;
  private dupOpen = false;
  private busy = false;
  private error = '';
  private dragged: { kind: 'learned' | 'variant' | 'brand'; value: string } | null = null;
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
    if (this.options?.key !== options.key) {
      this.history = [];
      this.future = [];
      this.selected = [];
      this.testing = false;
      this.dupOpen = false;
    }
    this.options = options;
    this.remote = structuredClone(options.remote);
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
    return this.remote?.buttons ?? [];
  }
  private name(ref: string): string {
    return personName(this.learned().find(button => button.id === ref)?.name, ref);
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
    const previous = structuredClone(this.remote.layout);
    this.busy = true;
    try {
      await this.options.save(layout);
      if (undo === 'undo') this.future.push(previous);
      else {
        this.history.push(previous);
        if (this.history.length > 60) this.history.shift();
        if (undo !== 'redo') this.future = [];
      }
      this.remote.layout = structuredClone(layout);
      this.error = '';
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
      this.selected = this.selected.filter(id => this.layout().some(item => item.id === id));
      this.render();
    }
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
    const was = this.selected.join();
    this.selected = ids;
    this.brandsFor = false;
    if (ids.join() !== was && ids.length === 1) this.tab = this.tab === 'shows' ? 'look' : this.tab;
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
  }

  // Rendering ------------------------------------------------------------

  private render(): void {
    if (!this.remote || !this.options) return;
    const scroll = this.root.querySelector('.insp-body')?.scrollTop ?? 0;
    const tools = `<div class="dbar"><div class="seg dmode" role="group"><button type="button" data-mode="design" aria-pressed="${!this.testing}" aria-label="${e(t('Diseñar'))}" title="${e(t('Diseñar'))}">${glyph('mdi:pencil-ruler')}<span>${e(t('Diseñar'))}</span></button><button type="button" data-mode="test" aria-pressed="${this.testing}" aria-label="${e(t('Probar'))}" title="${e(t('Probar'))}"${this.options.press ? '' : ' disabled'}>${glyph('mdi:play')}<span>${e(t('Probar'))}</span></button></div><span class="grow"></span>${iconButton(t('Deshacer') + ' · Ctrl+Z', 'mdi:undo', `data-undo${!this.history.length || this.busy ? ' disabled' : ''}`)}${iconButton(t('Rehacer') + ' · Ctrl+Shift+Z', 'mdi:redo', `data-redo${!this.future.length || this.busy ? ' disabled' : ''}`)}${iconButton(t('Diseño automático'), 'mdi:auto-fix', 'data-command="auto-layout"')}${this.options.duplicate ? iconButton(t('Duplicar este control para otro aparato'), 'mdi:content-duplicate', 'data-command="duplicate-remote"') : ''}</div>`;
    this.root.innerHTML = `<div class="designer${this.testing ? ' testing' : ''}">${tools}<aside class="res" aria-label="${e(t('Recursos'))}">${this.resources()}</aside><div class="stage"><div class="canvas"></div><p class="error-text" role="status">${e(this.error)}</p></div><aside class="insp" aria-label="${e(t('Inspector'))}">${this.inspector()}</aside></div>${this.dupOpen ? this.dupDialog() : ''}`;
    this.canvas.estimated = this.options.estimated;
    this.canvas.preview = !this.testing;
    this.canvas.onPress = this.testing ? this.options.press : undefined;
    this.canvas.readValues = this.options.readValues;
    this.canvas.renderContent = this.options.renderContent;
    this.canvas.remote = this.remote;
    this.canvas.editing = !this.testing;
    this.canvas.selected = this.testing ? [] : this.selected;
    this.root.querySelector('.canvas')!.append(this.canvas);
    const body = this.root.querySelector('.insp-body');
    if (body) body.scrollTop = scroll;
    this.bind();
  }

  private resources(): string {
    const tabs: [typeof this.left, string, string][] = [
      ['learned', this.options?.trayTitle ?? t('Aprendidos'), 'mdi:access-point'],
      ['elements', t('Elementos'), 'mdi:shape-outline'],
      ['blocks', t('Bloques'), 'mdi:view-grid-plus-outline'],
      ['brands', t('Marcas'), 'mdi:play-box-outline'],
    ];
    let body = '';
    if (this.left === 'learned') {
      const used = this.usage();
      body = `<div class="lhead"><span>${this.learned().length}</span>${this.options?.learn ? iconButton(t('Aprender más botones'), 'mdi:plus', 'data-command="learn"', 'sm') : ''}</div><div class="learned">${this.learned()
        .map(button => {
          const count = used.get(button.id) ?? 0;
          return `<button type="button" class="lchip${count ? '' : ' unused'}" draggable="true" data-drag="learned" data-value="${e(button.id)}" title="${e(count ? t('Usado en {count} elemento(s)', { count }) : t('Sin usar: arrastralo al control'))}">${glyph('mdi:drag-vertical')}<span>${e(personName(button.name))}</span><em>${count || '!'}</em></button>`;
        })
        .join('')}</div>`;
    } else if (this.left === 'elements') {
      body = (['button', 'level', 'mode', 'info'] as Cat[])
        .map(
          cat =>
            `<div class="egrp"><span>${e(t(CATS[cat][0]))}</span><div class="etiles">${VARIANTS.filter(
              v => v.cat === cat,
            )
              .map(
                v =>
                  `<button type="button" class="etile" draggable="true" data-drag="variant" data-value="${v.id}" title="${e(t(v.name))}">${glyph(v.icon)}<span>${e(t(v.name))}</span></button>`,
              )
              .join('')}</div></div>`,
        )
        .join('');
    } else if (this.left === 'blocks') {
      body = `<div class="btiles">${VARIANTS.filter(v => v.cat === 'block')
        .map(
          v =>
            `<button type="button" class="btile" draggable="true" data-drag="variant" data-value="${v.id}" title="${e(t(v.name))}"><span class="bprev">${blockPreview(v.type)}</span><span>${e(t(v.name))}</span></button>`,
        )
        .join('')}</div>`;
    } else body = this.brandList('drag');
    return `<div class="rtabs" role="tablist">${tabs.map(([key, label, icon]) => `<button type="button" role="tab" data-left="${key}" aria-selected="${this.left === key}" title="${e(label)}">${glyph(icon)}<span>${e(label)}</span></button>`).join('')}</div><div class="rbody">${body}</div>`;
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
    const chosen = this.pieces();
    if (!chosen.length) return this.canvasInspector();
    const headTools = `${iconButton(t('Duplicar') + ' · Ctrl+D', 'mdi:content-duplicate', 'data-command="duplicate"', 'sm')}${iconButton(t('Quitar') + ' · Supr', 'mdi:trash-can-outline', 'data-command="remove"', 'sm danger')}`;
    if (chosen.length > 1)
      return `<div class="ihead"><span class="tile">${glyph('mdi:selection-multiple')}</span><b>${e(t('{count} elementos', { count: chosen.length }))}</b>${headTools}</div><div class="insp-body">${this.lookRows(chosen[0], true)}</div>`;
    const piece = chosen[0];
    const variant = variantOf(piece);
    const tabs = `<div class="itabs" role="tablist">${(
      [
        ['look', t('Aspecto')],
        ['function', t('Función')],
        ['shows', t('Muestra')],
      ] as const
    )
      .map(
        ([key, label]) =>
          `<button type="button" role="tab" data-tab="${key}" aria-selected="${this.tab === key}">${e(label)}</button>`,
      )
      .join('')}</div>`;
    const body =
      this.tab === 'look'
        ? this.lookRows(piece)
        : this.tab === 'function'
          ? this.functionRows(piece)
          : this.showsRows(piece);
    const title = piece.label ?? (piece.buttons[0] ? this.name(piece.buttons[0]) : t(variant.name));
    return `<div class="ihead"><span class="tile">${glyph(variant.icon)}</span><b>${e(title)}<small>${e(t(CATS[variant.cat][0]))} · ${e(t(variant.name))}</small></b>${headTools}</div>${tabs}<div class="insp-body">${body}</div>`;
  }

  private canvasInspector(): string {
    const layout = this.layout();
    const grid = gridOf(layout);
    const canvas = layout.find(piece => piece.type === 'canvas');
    const theme = canvas?.theme ?? 'hm';
    const height = grid.rows ?? Math.max(2, rows(layout));
    return `<div class="ihead"><span class="tile">${glyph('mdi:remote')}</span><b>${e(personName(this.options?.name, t('Control')))}<small>${e(t('{count} elementos', { count: layout.filter(p => p.type !== 'canvas').length }))}</small></b></div><div class="insp-body"><div class="isec">${e(t('Lienzo'))}</div>${row('mdi:view-grid-outline', t('Columnas y filas'), `<span class="sizes">${stepper('cols', grid.columns, 2, MAX_COLUMNS, t('Columnas'))}<span>×</span>${stepper('rows', height, 2, MAX_GRID_ROWS, t('Filas'))}</span>`)}${row('mdi:arrow-expand-all', t('Separación'), slider('gap', 2, 24, canvas?.gap ?? 10, 'px', t('Separación')))}${row('mdi:square-rounded-outline', t('Esquinas del control'), slider('body-radius', 0, 60, canvas?.radius ?? 28, 'px', t('Esquinas del control')))}<div class="isec">${e(t('Tema'))}</div><div class="themes">${THEMES.map(([key, label]) => `<button type="button" class="theme theme-${key}" data-theme="${key}" aria-pressed="${theme === key}"><span class="tbody"><i></i><i></i><i></i><i></i></span><span>${e(t(label))}</span></button>`).join('')}</div>${row('mdi:format-color-fill', t('Color del cuerpo'), swatches('body', canvas?.bg, t('Color del cuerpo')))}</div>`;
  }

  private lookRows(piece: RfWidget, many = false): string {
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
          ['flat', t('Plano')],
          ['outline', t('Contorno')],
        ],
        piece.relief ?? 'raised',
      ),
    )}`;
    if (!many) {
      const grid = gridOf(this.layout());
      html += `<div class="isec">${e(t('Lugar'))}</div>${row('mdi:cursor-move', t('Columna, fila, ancho y alto'), `<div class="xywh">${stepper('x', piece.x + 1, 1, grid.columns, t('Columna'), 'X')}${stepper('y', piece.y + 1, 1, MAX_GRID_ROWS, t('Fila'), 'Y')}${stepper('w', piece.w, 1, grid.columns, t('Ancho'), '↔')}${stepper('h', piece.h, 1, 12, t('Alto'), '↕')}</div>`)}`;
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
        : this.learned();
    return `<select class="isel" ${name ? `name="${name}"` : ''} ${attributes} aria-label="${e(label)}"><option value="">${e(empty)}</option>${choices.map(c => `<option value="${e(c.id)}"${value === c.id ? ' selected' : ''}>${e(c.name)}</option>`).join('')}</select>`;
  }

  private functionRows(piece: RfWidget): string {
    const variant = variantOf(piece);
    const family = VARIANTS.filter(v => v.cat === variant.cat);
    let html =
      variant.id === 'control'
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
          t('Control existente'),
          this.refSelect('ref-0', piece.buttons[0], undefined, '', t('Control existente')),
        )
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
        html +=
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
          ],
          named ? 'names' : 'numbers',
        ),
      );
      html += named
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
      html += row(
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
      html += row(
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
      if (mode === 'updown')
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
      html += row(
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
            `<div class="optr">${iconPicker(piece.options?.[i]?.icon ?? '', t('Icono'), `data-option-icon="${i}" clearable`)}<input aria-label="${e(t('Texto'))}" data-option-label="${i}" maxlength="20" value="${e(piece.options?.[i]?.label ?? '')}" placeholder="${e(this.name(ref))}">${this.refSelect(`ref-${i}`, ref, undefined, '', t('Opción') + ' ' + (i + 1))}${piece.buttons.length > 2 ? iconButton(t('Quitar'), 'mdi:close', `data-remove-ref="${i}"`, 'sm') : ''}</div>`,
        )
        .join(
          '',
        )}</div>${piece.buttons.length < max ? `<button type="button" class="chip" data-command="option-add">${glyph('mdi:plus')}${e(t('Opción'))}</button>` : ''}`;
    } else if (variant.cat === 'info') {
      if (piece.type === 'indicator' || piece.type === 'graph')
        html += this.readingRows(piece, t('Sensor de Home Assistant'));
      if (piece.type === 'graph')
        html += row(
          'mdi:clock-outline',
          t('Período'),
          seg(
            'period',
            [
              ['1h', t('1 h')],
              ['24h', t('24 h')],
              ['7d', t('7 días')],
            ],
            piece.period ?? '24h',
          ),
        );
    } else if (isBlock(piece.type)) {
      html += `<div class="isec">${e(t('Botones aprendidos'))}</div>${BLOCK_SLOTS[piece.type]
        .map(
          ([slot, name, icon]) =>
            `<div class="slotr">${icon ? glyph(icon) : piece.type === 'colors' ? `<i class="cdot" style="--cc:${{ red: '#d0453a', green: '#3f8f5f', yellow: '#d9b21f', blue: '#3f7fbf' }[slot]}"></i>` : `<b class="sk">${e(slot === 'ok' ? 'OK' : t(name))}</b>`}<span>${e(t(name))}</span>${this.refSelect('', piece.slots?.[slot], '—', `data-slot="${slot}"`, t(name))}</div>`,
        )
        .join('')}`;
    }
    return html;
  }

  private readingRows(piece: RfWidget, label: string): string {
    const readings = this.options?.readValues?.() ?? {};
    const ids = Object.keys(readings)
      .filter(
        id =>
          /^(sensor|binary_sensor|input_number|input_select|number|select|climate|fan|light|switch|media_player)\./.test(
            id,
          ) || id === piece.reading,
      )
      .sort();
    return `${row('mdi:home-assistant', label, `<select class="isel" name="reading" aria-label="${e(label)}"><option value="">${e(t('Sin lectura'))}</option>${ids.map(id => `<option value="${e(id)}"${id === piece.reading ? ' selected' : ''}>${e(String(readings[id]?.attributes?.friendly_name ?? id))}</option>`).join('')}</select>`)}${piece.reading ? row('mdi:code-braces', t('Atributo (avanzado)'), `<input class="tin" name="attribute" maxlength="80" value="${e(piece.attribute ?? '')}" aria-label="${e(t('Atributo (avanzado)'))}">`) : ''}`;
  }

  private showsRows(piece: RfWidget): string {
    let html = '';
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
    return `<div class="veil" data-veil><div class="sheet" role="dialog" aria-modal="true" aria-label="${e(t('Duplicar control'))}"><h3>${glyph('mdi:content-duplicate')}${e(t('Duplicar «{name}»', { name: base }))}</h3><input class="tin" type="text" name="dup-name" maxlength="80" value="${e(t('{name} (copia)', { name: base }))}" aria-label="${e(t('Nombre'))}">${
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
    } else if (ctrl && key === 'd' && this.selected.length) {
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
    on('[data-command=duplicate-remote]', () => {
      this.dupOpen = true;
      this.render();
      root.querySelector<HTMLInputElement>('[name=dup-name]')?.select();
    });
    on('[data-dup]', async element => {
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
    on('[data-left]', element => {
      this.left = element.dataset.left as typeof this.left;
      this.render();
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
    // A tap on a resource adds it where there is room; a drag drops it where it is let go.
    on('[data-drag]', element => {
      if (this.testing) return;
      const kind = element.dataset.drag!;
      const value = element.dataset.value!;
      if (kind === 'variant') this.addPiece(value);
      else if (kind === 'brand') this.addPiece('brand', undefined, { brand: value });
      else this.addPiece('press', undefined, { ref: value });
    });
    on(
      '[data-drag]',
      (element, event) => {
        this.dragged = { kind: element.dataset.drag as 'learned' | 'variant' | 'brand', value: element.dataset.value! };
        (event as DragEvent).dataTransfer?.setData('text/plain', element.dataset.value!);
        if ((event as DragEvent).dataTransfer) (event as DragEvent).dataTransfer!.effectAllowed = 'copy';
      },
      'dragstart',
    );
    const stage = root.querySelector<HTMLElement>('.stage');
    stage?.addEventListener('dragover', event => {
      if (this.dragged) event.preventDefault();
    });
    stage?.addEventListener('drop', event => {
      event.preventDefault();
      const dragged = this.dragged;
      this.dragged = null;
      if (!dragged || this.testing) return;
      const over = this.canvas.shadowRoot
        ?.elementsFromPoint?.(event.clientX, event.clientY)
        .find(node => (node as HTMLElement).dataset?.widget) as HTMLElement | undefined;
      if (dragged.kind === 'learned' && over) return this.assign(over.dataset.widget!, dragged.value);
      const cell = this.canvas.cellAt(event.clientX, event.clientY) ?? undefined;
      if (dragged.kind === 'variant') this.addPiece(dragged.value, cell);
      else if (dragged.kind === 'brand') this.addPiece('brand', cell, { brand: dragged.value });
      else this.addPiece('press', cell, { ref: dragged.value });
    });
    this.bindCanvasInspector();
    if (this.pieces().length) this.bindPieceInspector();
  }

  private bindCanvasInspector(): void {
    const root = this.root;
    root.querySelectorAll<HTMLElement>('[data-theme]').forEach(button =>
      button.addEventListener('click', () =>
        this.changeCanvas(canvas => {
          const theme = button.dataset.theme as RemoteTheme | 'hm';
          if (theme === 'hm') delete canvas.theme;
          else if (REMOTE_THEMES.includes(theme)) canvas.theme = theme;
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
          if (p.type === 'toggle' && index === 1 && !ref) p.buttons = p.buttons.slice(0, 1);
          else if (ref) p.buttons[index] = ref;
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
:host{display:block;min-width:0;height:100%;container-type:inline-size}
.designer{display:grid;grid-template-columns:232px minmax(0,1fr) 300px;grid-template-rows:auto minmax(0,1fr);height:100%;min-height:560px;background:var(--hm-bg)}
.dbar{grid-column:1/-1;display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--hm-line);background:var(--hm-surface);min-width:0}
.dbar .grow{flex:1}
.seg{display:inline-flex;gap:2px;padding:3px;border-radius:11px;background:var(--hm-surface-2);flex-wrap:wrap}
.seg button{display:inline-flex;align-items:center;gap:5px;min-height:30px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--hm-muted);font-size:12.5px}
.seg button[aria-pressed=true]{background:var(--hm-surface);color:var(--hm-ink);box-shadow:var(--hm-shadow)}
.seg.icons button{padding:0 8px}.seg ha-icon{--mdc-icon-size:16px}
.ib.sm{width:32px;height:32px;min-height:32px;border-radius:9px}.ib.sm ha-icon{--mdc-icon-size:18px}.ib.danger{color:var(--hm-alert)}
.res{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--hm-line);background:var(--hm-surface)}
.rtabs{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;padding:6px;border-bottom:1px solid var(--hm-line)}
.rtabs button{display:flex;flex-direction:column;align-items:center;gap:2px;min-height:44px;padding:4px 2px;border:0;border-radius:9px;background:transparent;color:var(--hm-muted);font-size:10.5px;min-width:0}
.rtabs button span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rtabs button[aria-selected=true]{background:color-mix(in srgb,var(--hm-brand) 12%,transparent);color:var(--hm-brand)}
.rtabs ha-icon{--mdc-icon-size:18px}
.rbody{flex:1;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:12px}
.lhead{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--hm-muted)}
.learned{display:flex;flex-direction:column;gap:6px}
.lchip{display:flex;align-items:center;gap:6px;min-height:34px;padding:4px 8px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-surface);font-size:13px;cursor:grab;text-align:left;color:var(--hm-ink)}
.lchip span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lchip ha-icon{--mdc-icon-size:16px;color:var(--hm-muted)}
.lchip em{font-style:normal;font-size:11px;font-weight:700;min-width:18px;height:18px;display:grid;place-items:center;border-radius:9px;background:var(--hm-surface-2);color:var(--hm-muted)}
.lchip.unused{border-style:dashed}.lchip.unused em{background:color-mix(in srgb,var(--hm-warn) 20%,transparent);color:var(--hm-warn)}
.egrp{display:grid;gap:6px}.egrp>span{font-size:11px;color:var(--hm-muted);letter-spacing:.04em;text-transform:uppercase}
.etiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.etile{display:flex;flex-direction:column;align-items:center;gap:4px;min-height:62px;padding:8px 4px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);font-size:11.5px;color:var(--hm-muted);line-height:1.15;text-align:center;cursor:grab}
.etile ha-icon{--mdc-icon-size:22px;color:var(--hm-ink)}.etile:hover,.btile:hover,.brand:hover{border-color:var(--hm-brand)}
.btiles{display:grid;gap:8px}
.btile{display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);font-size:13px;color:var(--hm-ink);cursor:grab;text-align:left}
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
@container (max-width:980px){.designer{grid-template-columns:200px minmax(0,1fr) 270px}}
@container (max-width:760px){
  .designer{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto minmax(360px,1fr) auto;min-height:0;height:auto}
  .res{border-right:0;border-bottom:1px solid var(--hm-line);max-height:220px}
  .insp{border-left:0;border-top:1px solid var(--hm-line)}.insp-body{overflow:visible}
  .dmode span{display:none}
}
`;
