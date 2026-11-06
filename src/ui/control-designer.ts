import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import type { RfWidget, WidgetType } from '../integration/rf.js';
import {
  WIDGET_BUTTONS,
  WIDGET_SIZE,
  layoutOf,
  place,
  add,
  uniqueId,
  rows,
  columnsOf,
  type DrawableRemote,
} from '../rf/layout.js';
import { widgetLabel } from '../rf/catalog.js';
import { HomeManagerRfRemote } from '../rf/remote-view.js';
import { installPanelComponents } from './panel-components.js';
import { rfManagerStyles } from './rf-components.js';
import { iconPicker } from './icon-picker.js';
import { confirmDialog } from './confirm-dialog.js';
import { iconButton, sidePanelStyles } from './side-panel.js';
import { MAX_COLUMNS, MAX_GRID_ROWS, MAX_SEQUENCE, gridOf, type PieceStep } from '../model/control-layout.js';

export interface DesignerOptions {
  key: string;
  remote: DrawableRemote;
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
}

/** What can be added, grouped as in the 0.13 mockup. A "kind" is a piece type plus
 * an optional preset look: a brand button is a button with its colours and icon. */
type Kind = WidgetType | 'brand' | 'vertical';
const GROUPS: [string, [Kind, string][]][] = [
  [
    'Botones',
    [
      ['button', 'mdi:gesture-tap'],
      ['brand', 'mdi:play-box-outline'],
      ['toggle', 'mdi:power'],
      ['preset', 'mdi:playlist-play'],
      ['cycle', 'mdi:sync'],
    ],
  ],
  [
    'Ajustes',
    [
      ['updown', 'mdi:plus-minus-variant'],
      ['knob', 'mdi:knob'],
      ['vertical', 'mdi:tune-vertical'],
      ['slider', 'mdi:tune-variant'],
      ['steps', 'mdi:dots-horizontal'],
      ['modes', 'mdi:format-list-bulleted'],
    ],
  ],
  [
    'Información',
    [
      ['indicator', 'mdi:gauge'],
      ['graph', 'mdi:chart-line'],
      ['title', 'mdi:format-text'],
      ['separator', 'mdi:minus'],
    ],
  ],
];
const KIND_ICON: Record<string, string> = Object.fromEntries(GROUPS.flatMap(([, items]) => items));
const BRANDS: [string, string, string, string][] = [
  ['YouTube', '#FF0000', '#FFFFFF', 'mdi:youtube'],
  ['Netflix', '#141414', '#E50914', 'mdi:netflix'],
  ['Prime Video', '#00A8E1', '#FFFFFF', 'mdi:play-box-outline'],
  ['Disney+', '#113CCF', '#FFFFFF', 'mdi:play-box-outline'],
  ['Spotify', '#1DB954', '#FFFFFF', 'mdi:spotify'],
];
const PALETTE = ['#4F7A5A', '#4F8FBF', '#6F6BB8', '#D98B1F', '#D0453A', '#141414', '#FFFFFF', '#E3E7E1'];
const kindName = (kind: Kind): string =>
  kind === 'brand' ? t('Marca') : kind === 'vertical' ? t('Deslizador vertical') : widgetLabel(kind);
const glyph = (name: string) => `<ha-icon icon="${e(name)}" aria-hidden="true"></ha-icon>`;

/** The free designer (0.13): learned buttons on the left, the remote on its grid in
 * the middle, the selected piece on the right. Every change is saved at once and can
 * be undone; it edits only layout and references, and sends nothing unless the person
 * turns on test mode. */
export class ControlDesigner extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private options?: DesignerOptions;
  private remote?: DrawableRemote;
  private history: (RfWidget[] | null)[] = [];
  private selected = '';
  private testing = false;
  private brandsOpen = false;
  private busy = false;
  private error = '';
  private canvas = new HomeManagerRfRemote();
  constructor() {
    super();
    installPanelComponents(this.root, 'control-designer', rfManagerStyles + sidePanelStyles + designerStyles, false);
    this.canvas.onLayout = layout => void this.commit(layout);
    this.canvas.onEdit = id => this.select(id);
    this.canvas.onDelete = id => void this.removePiece(id);
  }
  configure(options: DesignerOptions): void {
    if (this.options?.key !== options.key) {
      this.history = [];
      this.selected = '';
      this.testing = false;
    }
    this.options = options;
    this.remote = structuredClone(options.remote);
    this.render();
  }
  refreshIndicators(): void {
    this.canvas.updateIndicators();
  }

  private layout(): RfWidget[] {
    return this.remote ? layoutOf(this.remote) : [];
  }
  private piece(): RfWidget | undefined {
    return this.layout().find(item => item.id === this.selected && item.type !== 'canvas');
  }

  private async commit(layout: RfWidget[] | null, undo = false): Promise<void> {
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
      if (!undo) this.history.push(previous);
      this.remote.layout = structuredClone(layout);
      this.error = '';
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
      this.render();
    }
  }
  private change(mutate: (piece: RfWidget) => void): void {
    const layout = structuredClone(this.layout());
    const piece = layout.find(item => item.id === this.selected);
    if (!piece) return;
    mutate(piece);
    void this.commit(place(layout, piece.id, piece));
  }
  private select(id: string): void {
    this.selected = id;
    this.brandsOpen = false;
    this.render();
  }

  /** How many pieces use each learned button. */
  private usage(): Map<string, number> {
    const used = new Map<string, number>();
    for (const piece of this.layout()) {
      const refs = new Set([
        ...piece.buttons,
        ...(piece.sequence ?? []).flatMap(step => ('button' in step ? [step.button] : [])),
      ]);
      for (const ref of refs) used.set(ref, (used.get(ref) ?? 0) + 1);
    }
    return used;
  }

  /** A new piece takes the learned buttons nobody uses yet, so it saves as it is. */
  private addKind(kind: Kind, brand?: (typeof BRANDS)[number], at?: { x: number; y: number }, button?: string): void {
    if (!this.remote) return;
    const type: WidgetType = kind === 'brand' ? 'button' : kind === 'vertical' ? 'updown' : kind;
    const [min] = WIDGET_BUTTONS[type];
    const used = this.usage();
    const learned = this.remote.buttons.map(item => item.id);
    const pool = [...learned.filter(id => !used.has(id)), ...learned.filter(id => used.has(id))];
    const buttons = button
      ? [button]
      : pool.slice(0, Math.max(min, type === 'knob' || type === 'steps' ? Math.min(3, pool.length) : min));
    if (buttons.length < min) {
      this.error = t('Faltan botones aprendidos: este elemento usa {count}.', { count: min });
      this.render();
      return;
    }
    const layout = this.layout();
    const [w, h] = kind === 'vertical' ? [1, 3] : WIDGET_SIZE[type];
    const columns = columnsOf(layout);
    const piece: RfWidget = {
      id: uniqueId(layout, kind === 'brand' ? (brand?.[0] ?? 'brand') : type),
      type,
      w: Math.min(w, columns),
      h,
      x: 0,
      y: 0,
      buttons,
      label: brand ? brand[0] : type === 'title' ? t('Título') : null,
      icon: brand ? brand[3] : null,
      ...(brand ? { bg: brand[1], fg: brand[2], shape: 'round' as const } : {}),
      ...(kind === 'vertical' ? { orientation: 'vertical' as const } : {}),
      ...(type === 'preset' ? { label: t('Preset'), sequence: buttons.map(id => ({ button: id })) } : {}),
    };
    let next = add(layout, piece);
    if (at) next = place(next, piece.id, at);
    this.selected = piece.id;
    this.brandsOpen = false;
    void this.commit(next);
  }

  private async removePiece(id: string): Promise<void> {
    const p = this.layout().find(p => p.id === id);
    const name = p?.label ?? this.remote?.buttons.find(b => b.id === p?.buttons[0])?.name ?? t('Control');
    if (
      await confirmDialog(this.root, {
        title: t('¿Quitar «{name}» del control?', { name }),
        message: t('El botón y sus acciones se conservan.'),
        confirm: t('Quitar'),
      })
    ) {
      if (this.selected === id) this.selected = '';
      await this.commit(this.layout().filter(w => w.id !== id));
    }
  }

  // Rendering ------------------------------------------------------------

  private render(): void {
    if (!this.remote || !this.options) return;
    const used = this.usage();
    const tray = `<aside class="tray" aria-label="${e(this.options.trayTitle ?? t('Botones aprendidos'))}"><header>${glyph('mdi:access-point')}<b>${e(this.options.trayTitle ?? t('Botones aprendidos'))}</b><span class="count">${this.remote.buttons.length}</span></header><div class="traylist">${this.remote.buttons
      .map(button => {
        const count = used.get(button.id) ?? 0;
        return `<span class="tchip${count ? '' : ' unused'}" draggable="true" data-learned="${e(button.id)}" title="${e(count ? t('Usado en {count} elemento(s)', { count }) : t('Sin usar: arrastralo al control'))}">${glyph('mdi:drag-vertical')}<span>${e(button.name)}</span><em>${count || '!'}</em></span>`;
      })
      .join(
        '',
      )}</div>${this.options.learn ? `<footer>${iconButton(t('Aprender más botones'), 'mdi:plus', 'data-command="learn"')}</footer>` : ''}</aside>`;
    const tools = `<div class="ptool">${iconButton(t('Deshacer diseño'), 'mdi:undo', `data-undo${!this.history.length || this.busy ? ' disabled' : ''}`)}${iconButton(t('Diseño automático'), 'mdi:auto-fix', 'data-command="auto-layout"')}${iconButton(t('Modo prueba: tocar envía'), 'mdi:play', `data-command="test-mode" aria-pressed="${this.testing}"${this.options.press ? '' : ' disabled'}`)}</div>`;
    this.root.innerHTML = `<div class="designer">${tray}<div class="stage"><div class="canvas"></div>${tools}<p class="error-text" role="status">${e(this.error)}</p></div><aside class="props">${this.properties()}</aside></div>`;
    this.canvas.estimated = this.options.estimated;
    this.canvas.preview = !this.testing;
    this.canvas.onPress = this.testing ? this.options.press : undefined;
    this.canvas.readValues = this.options.readValues;
    this.canvas.renderContent = this.options.renderContent;
    this.canvas.remote = this.remote;
    this.canvas.editing = !this.testing;
    // In the designer a piece is chosen by tapping it; its panel has delete and duplicate.
    this.canvas.toggleAttribute('data-designer', true);
    this.root.querySelector('.canvas')!.append(this.canvas);
    this.bind();
    this.markSelection();
  }

  /** The selected piece is outlined on the canvas. */
  private markSelection(): void {
    const shadow = this.canvas.shadowRoot;
    shadow?.querySelectorAll('.widget.selected').forEach(node => node.classList.remove('selected'));
    if (this.selected) shadow?.querySelector(`[data-widget="${CSS.escape(this.selected)}"]`)?.classList.add('selected');
  }

  private properties(): string {
    const grid = gridOf(this.layout());
    const canvas = `<div class="lbl">${glyph('mdi:grid')}${e(t('Lienzo'))}<span class="grow"></span></div><div class="grid2">${glyph('mdi:table-column')}<label class="num" title="${e(t('Columnas'))}"><input type="number" name="grid-cols" min="2" max="${MAX_COLUMNS}" value="${grid.columns}" aria-label="${e(t('Columnas'))}"></label><span>×</span><label class="num" title="${e(t('Filas'))}"><input type="number" name="grid-rows" min="2" max="${MAX_GRID_ROWS}" value="${grid.rows ?? Math.max(2, rows(this.layout()))}" aria-label="${e(t('Filas'))}"></label></div>`;
    const kinds = GROUPS.map(
      ([group, items]) =>
        `<div class="egroup"><span>${e(t(group))}</span><div class="etypes">${items
          .filter(([kind]) => kind !== 'control')
          .map(
            ([kind, icon]) =>
              `<button type="button" class="etype" data-add="${kind}" aria-label="${e(kindName(kind))}" title="${e(kindName(kind))}"${kind === 'brand' ? ` aria-expanded="${this.brandsOpen}"` : ''}>${glyph(icon)}<span>${e(kindName(kind))}</span></button>`,
          )
          .join('')}</div></div>`,
    ).join('');
    const brands = this.brandsOpen
      ? `<div class="brands" role="group" aria-label="${e(t('Marca'))}">${BRANDS.map(([name, bg, fg, icon], index) => `<button type="button" class="brand" data-brand="${index}" aria-label="${e(name)}" title="${e(name)}">${swatchIcon(icon, bg, fg)}<span>${e(name)}</span></button>`).join('')}</div>`
      : '';
    const add = `<div class="lbl">${glyph('mdi:plus')}${e(t('Agregar elemento'))}<span class="grow"></span></div>${kinds}${brands}`;
    const piece = this.piece();
    return `${canvas}${add}${piece ? this.pieceProperties(piece) : ''}`;
  }

  private pieceProperties(piece: RfWidget): string {
    const remote = this.remote!;
    const choices =
      piece.type === 'control'
        ? (this.options?.controls ?? [])
        : remote.buttons.map(b => ({ id: b.id, label: b.name }));
    const option = (selected: string) =>
      `<option value="">${e(t('Elegir botón'))}</option>${choices.map(c => `<option value="${e(c.id)}"${selected === c.id ? ' selected' : ''}>${e(c.label)}</option>`).join('')}`;
    const slot = (index: number, icon: string, label: string, removable: boolean) =>
      `<div class="arow">${glyph(icon)}<span>${e(label)}</span><select data-slot="${index}" aria-label="${e(label)}">${option(piece.buttons[index] ?? '')}</select>${removable ? iconButton(t('Quitar paso'), 'mdi:close', `data-remove-slot="${index}"`) : ''}</div>`;
    const [min, max] = WIDGET_BUTTONS[piece.type];
    let links = '';
    if (piece.type === 'preset') {
      const steps = (piece.sequence ?? [])
        .map((step, index) =>
          'wait' in step
            ? `<div class="arow">${glyph('mdi:timer-sand')}<span>${e(t('Esperar'))}</span><label class="num"><input type="number" min="50" max="5000" step="50" value="${step.wait}" data-wait="${index}" aria-label="${e(t('Milisegundos'))}"><span>ms</span></label>${iconButton(t('Quitar'), 'mdi:close', `data-remove-step="${index}"`)}</div>`
            : `<div class="arow"><span class="stepn">${index + 1}</span><select data-step="${index}" aria-label="${e(t('Paso {number}', { number: index + 1 }))}">${option(step.button)}</select><label class="num" title="${e(t('Veces'))}"><input type="number" min="1" max="10" value="${step.times ?? 1}" data-times="${index}" aria-label="${e(t('Veces'))}"><span>×</span></label>${iconButton(t('Quitar'), 'mdi:close', `data-remove-step="${index}"`)}</div>`,
        )
        .join('');
      const full = (piece.sequence?.length ?? 0) >= MAX_SEQUENCE;
      links = `${steps}<div class="chips">${iconButton(t('Agregar botón a la secuencia'), 'mdi:plus', `data-add-step="button"${full ? ' disabled' : ''}`)}${iconButton(t('Agregar pausa'), 'mdi:timer-sand', `data-add-step="wait"${full ? ' disabled' : ''}`)}</div>`;
    } else if (max > 0) {
      const names: [string, string][] =
        piece.type === 'updown'
          ? [
              ['mdi:minus', t('Menos')],
              ['mdi:plus', t('Más')],
            ]
          : piece.type === 'toggle'
            ? [
                ['mdi:power', t('Encender')],
                ['mdi:power-off', t('Apagar')],
              ]
            : [];
      const count = Math.max(min, piece.buttons.length);
      links =
        Array.from({ length: count }, (_, index) =>
          slot(
            index,
            names[index]?.[0] ??
              (piece.type === 'button' || piece.type === 'control' ? 'mdi:gesture-tap' : 'mdi:numeric'),
            names[index]?.[1] ?? (max === 1 ? t('Al tocar') : t('Paso {number}', { number: index + 1 })),
            count > min,
          ),
        ).join('') +
        (count < max
          ? `<div class="chips">${iconButton(t('Agregar paso'), 'mdi:plus', 'data-command="add-slot"')}</div>`
          : '');
    }
    const readings = this.options?.readValues?.() ?? {};
    const reading =
      piece.type === 'indicator' || piece.type === 'graph'
        ? `<div class="arow">${glyph('mdi:database-arrow-right-outline')}<select name="reading" aria-label="${e(t('Lectura que muestra'))}"><option value="">${e(t('Sin lectura'))}</option>${Object.keys(
            readings,
          )
            .map(
              id =>
                `<option value="${e(id)}"${id === piece.reading ? ' selected' : ''}>${e(String(readings[id]?.attributes?.friendly_name ?? id.replace(/^[^.]+\./, '').replace(/_/g, ' ')))}</option>`,
            )
            .join(
              '',
            )}</select></div><label class="field">${e(t('Atributo (avanzado)'))}<input name="attribute" maxlength="80" value="${e(piece.attribute ?? '')}"></label>`
        : '';
    const swatches = (key: 'bg' | 'fg', label: string) =>
      `<div class="arow">${glyph(key === 'bg' ? 'mdi:format-color-fill' : 'mdi:format-color-text')}<span>${e(label)}</span><div class="swatches">${iconButton(t('Sin color'), 'mdi:cancel', `data-color="${key}:" aria-pressed="${!piece[key]}"`, 'sw-none')}${PALETTE.map(color => swatch(key, color, piece[key] === color, `${label} ${color}`)).join('')}<label class="sw custom" title="${e(t('Otro color'))}"><input type="color" data-color-input="${key}" value="${piece[key] ?? '#4F7A5A'}" aria-label="${e(t('Otro color'))}"></label></div></div>`;
    const shape = `<div class="arow">${glyph('mdi:shape-outline')}<span>${e(t('Forma'))}</span><div class="seg">${(
      [
        ['', 'mdi:square-rounded-outline', t('Redondeado')],
        ['round', 'mdi:circle-outline', t('Redondo')],
        ['square', 'mdi:square-outline', t('Recto')],
      ] as const
    )
      .map(([value, icon, label]) =>
        iconButton(label, icon, `data-shape="${value}" aria-pressed="${(piece.shape ?? '') === value}"`),
      )
      .join('')}</div></div>`;
    const upright =
      piece.type === 'updown' || piece.type === 'slider' || piece.type === 'steps'
        ? iconButton(
            t('Vertical'),
            'mdi:arrow-up-down',
            `data-toggle="orientation" aria-pressed="${piece.orientation === 'vertical'}"`,
          )
        : '';
    const position = `<div class="grid4">${glyph('mdi:resize')}${(['x', 'y', 'w', 'h'] as const)
      .map(
        key =>
          `<label class="num" title="${e({ x: t('Columna'), y: t('Fila'), w: t('Ancho'), h: t('Alto') }[key])}"><span>${{ x: 'x', y: 'y', w: '↔', h: '↕' }[key]}</span><input type="number" min="${key === 'w' || key === 'h' ? 1 : 1}" value="${piece[key] + (key === 'x' || key === 'y' ? 1 : 0)}" data-box="${key}" aria-label="${e({ x: t('Columna'), y: t('Fila'), w: t('Ancho'), h: t('Alto') }[key])}"></label>`,
      )
      .join('')}</div>`;
    const kind: Kind = piece.orientation === 'vertical' && piece.type === 'updown' ? 'vertical' : piece.type;
    return `<div class="selhead"><span class="ico-tile">${glyph(KIND_ICON[kind] ?? 'mdi:shape-outline')}</span><b>${e(kindName(kind))}</b><span class="grow"></span>${upright}${iconButton(t('Duplicar'), 'mdi:content-copy', 'data-command="duplicate"')}${iconButton(t('Quitar elemento'), 'mdi:trash-can-outline', 'data-command="remove"', 'danger')}</div>
    <div class="lbl">${glyph('mdi:palette-outline')}${e(t('Aspecto'))}<span class="grow"></span></div>
    <div class="arow">${iconPicker(piece.icon ?? '', t('Icono'), 'name="widget-icon" clearable')}<input class="field" name="widget-label" maxlength="40" value="${e(piece.label ?? '')}" placeholder="${e(t('Texto'))}" aria-label="${e(t('Texto'))}">${iconButton(t('Mostrar icono'), piece.hideIcon ? 'mdi:image-off-outline' : 'mdi:image-outline', `data-toggle="hideIcon" aria-pressed="${!piece.hideIcon}"`)}${iconButton(t('Mostrar texto'), piece.hideLabel ? 'mdi:format-text-variant-outline' : 'mdi:format-text', `data-toggle="hideLabel" aria-pressed="${!piece.hideLabel}"`)}</div>
    ${swatches('bg', t('Fondo'))}${swatches('fg', t('Texto'))}${shape}${position}
    ${links ? `<div class="lbl">${glyph('mdi:link-variant')}${e(t('Botones aprendidos que usa'))}<span class="grow"></span></div>${links}` : ''}${reading}`;
  }

  // Events ---------------------------------------------------------------

  private bind(): void {
    const root = this.root;
    const on = (selector: string, work: (element: HTMLElement) => void, event = 'click') =>
      root
        .querySelectorAll<HTMLElement>(selector)
        .forEach(element => element.addEventListener(event, () => work(element)));
    on('[data-undo]', () => {
      const layout = this.history.at(-1);
      if (layout !== undefined)
        void this.commit(layout, true).then(() => {
          if (!this.error) this.history.pop();
          this.render();
        });
    });
    on('[data-command=auto-layout]', async () => {
      if (
        await confirmDialog(this.root, {
          title: t('¿Volver al diseño automático?'),
          message: t('Se reemplaza sólo la disposición; los botones y acciones se conservan.'),
          confirm: t('Volver'),
        })
      ) {
        this.selected = '';
        await this.commit(null);
      }
    });
    on('[data-command=test-mode]', () => {
      this.testing = !this.testing;
      this.render();
    });
    on('[data-command=learn]', () => this.options?.learn?.());
    on('[data-add]', element => {
      const kind = element.dataset.add as Kind;
      if (kind === 'brand') {
        this.brandsOpen = !this.brandsOpen;
        this.render();
      } else this.addKind(kind);
    });
    on('[data-brand]', element => this.addKind('brand', BRANDS[Number(element.dataset.brand)]));
    // The canvas size: columns and rows; pieces outside are pulled in.
    on(
      '[name=grid-cols],[name=grid-rows]',
      () => {
        const columns = clampNumber(root.querySelector<HTMLInputElement>('[name=grid-cols]')!.value, 2, MAX_COLUMNS);
        const height = clampNumber(root.querySelector<HTMLInputElement>('[name=grid-rows]')!.value, 2, MAX_GRID_ROWS);
        const pieces = this.layout()
          .filter(item => item.type !== 'canvas')
          .map(item => {
            const w = Math.min(item.w, columns);
            return { ...item, w, x: Math.min(item.x, columns - w) };
          });
        const canvas: RfWidget | null =
          columns === 4 && height <= rows(pieces)
            ? null
            : { id: 'canvas', type: 'canvas', x: 0, y: 0, w: columns, h: height, buttons: [], label: null, icon: null };
        let next = canvas ? [canvas, ...pieces] : pieces;
        for (const item of pieces) next = place(next, item.id, item);
        void this.commit(next);
      },
      'change',
    );
    // Learned buttons are dragged onto the control (a new button) or onto a slot.
    on(
      '[data-learned]',
      element => {
        this.dragged = element.dataset.learned!;
      },
      'dragstart',
    );
    const stage = root.querySelector<HTMLElement>('.stage');
    stage?.addEventListener('dragover', event => event.preventDefault());
    stage?.addEventListener('drop', event => {
      event.preventDefault();
      const id = this.dragged;
      this.dragged = '';
      if (!id) return;
      const cell = this.canvas.cellAt(event.clientX, event.clientY);
      this.addKind('button', undefined, cell ?? undefined, id);
    });
    root.querySelectorAll<HTMLSelectElement>('[data-slot]').forEach(select => {
      select.addEventListener('dragover', event => event.preventDefault());
      select.addEventListener('drop', event => {
        event.preventDefault();
        if (!this.dragged) return;
        select.value = this.dragged;
        this.dragged = '';
        select.dispatchEvent(new Event('change'));
      });
    });
    const piece = this.piece();
    if (!piece) return;
    on(
      '[data-slot]',
      element => {
        const value = (element as HTMLSelectElement).value;
        if (!value) return;
        this.change(p => {
          p.buttons[Number(element.dataset.slot)] = value;
        });
      },
      'change',
    );
    on('[data-command=add-slot]', () => {
      const free = this.remote!.buttons.find(button => !piece.buttons.includes(button.id))?.id;
      if (free) this.change(p => p.buttons.push(free));
    });
    on('[data-remove-slot]', element => this.change(p => p.buttons.splice(Number(element.dataset.removeSlot), 1)));
    on(
      '[name=widget-label]',
      element => this.change(p => (p.label = (element as HTMLInputElement).value.trim() || null)),
      'change',
    );
    on(
      '[name=widget-icon]',
      element => this.change(p => (p.icon = (element as HTMLInputElement).value || null)),
      'change',
    );
    on('[data-toggle]', element => {
      const key = element.dataset.toggle!;
      this.change(p => {
        if (key === 'orientation') {
          if (p.orientation) delete p.orientation;
          else p.orientation = 'vertical';
        } else if (key === 'hideIcon' || key === 'hideLabel') {
          if (p[key]) delete p[key];
          else p[key] = true;
        }
      });
    });
    on('[data-color]', element => {
      const [key, color] = element.dataset.color!.split(':') as ['bg' | 'fg', string];
      this.change(p => {
        if (color) p[key] = color;
        else delete p[key];
      });
    });
    on(
      '[data-color-input]',
      element => {
        const key = element.dataset.colorInput as 'bg' | 'fg';
        this.change(p => (p[key] = (element as HTMLInputElement).value.toUpperCase()));
      },
      'change',
    );
    on('[data-shape]', element =>
      this.change(p => {
        const shape = element.dataset.shape as '' | 'round' | 'square';
        if (shape) p.shape = shape;
        else delete p.shape;
      }),
    );
    on(
      '[data-box]',
      element => {
        const key = element.dataset.box as 'x' | 'y' | 'w' | 'h';
        const value = Number((element as HTMLInputElement).value) - (key === 'x' || key === 'y' ? 1 : 0);
        if (Number.isFinite(value)) this.change(p => (p[key] = value));
      },
      'change',
    );
    on(
      '[name=reading]',
      element => this.change(p => setOptional(p, 'reading', (element as HTMLSelectElement).value)),
      'change',
    );
    on(
      '[name=attribute]',
      element => this.change(p => setOptional(p, 'attribute', (element as HTMLInputElement).value.trim())),
      'change',
    );
    on('[data-command=duplicate]', () => {
      const layout = this.layout();
      const copy = { ...structuredClone(piece), id: uniqueId(layout, piece.id) };
      this.selected = copy.id;
      void this.commit(add(layout, copy));
    });
    on('[data-command=remove]', () => void this.removePiece(piece.id));
    // Preset steps.
    const steps = (mutate: (sequence: PieceStep[]) => void) =>
      this.change(p => {
        const sequence = structuredClone(p.sequence ?? []);
        mutate(sequence);
        p.sequence = sequence;
        p.buttons = [...new Set(sequence.flatMap(step => ('button' in step ? [step.button] : [])))];
      });
    on('[data-add-step]', element =>
      steps(sequence =>
        sequence.push(
          element.dataset.addStep === 'wait'
            ? { wait: 300 }
            : { button: piece.buttons[0] ?? this.remote!.buttons[0].id },
        ),
      ),
    );
    on('[data-remove-step]', element =>
      steps(sequence => {
        if (sequence.length > 1) sequence.splice(Number(element.dataset.removeStep), 1);
      }),
    );
    on(
      '[data-step]',
      element => {
        const value = (element as HTMLSelectElement).value;
        if (value)
          steps(
            sequence =>
              (sequence[Number(element.dataset.step)] = { ...sequence[Number(element.dataset.step)], button: value }),
          );
      },
      'change',
    );
    on(
      '[data-times]',
      element =>
        steps(sequence => {
          const step = sequence[Number(element.dataset.times)];
          if ('button' in step) step.times = clampNumber((element as HTMLInputElement).value, 1, 10);
        }),
      'change',
    );
    on(
      '[data-wait]',
      element =>
        steps(
          sequence =>
            (sequence[Number(element.dataset.wait)] = {
              wait: clampNumber((element as HTMLInputElement).value, 50, 5000),
            }),
        ),
      'change',
    );
  }
  private dragged = '';
}
if (!customElements.get('homemanager-control-designer'))
  customElements.define('homemanager-control-designer', ControlDesigner);

const clampNumber = (value: string, low: number, high: number) =>
  Math.max(low, Math.min(high, Math.round(Number(value) || low)));
function setOptional(piece: RfWidget, key: 'reading' | 'attribute', value: string): void {
  if (value) piece[key] = value;
  else delete piece[key];
}
const swatch = (key: string, color: string, on: boolean, label: string) =>
  `<button type="button" class="sw" style="--c:${color}" data-color="${key}:${color}" aria-pressed="${on}" aria-label="${e(label)}" title="${e(color)}"></button>`;
const swatchIcon = (icon: string, bg: string, fg: string) =>
  `<span class="brandtile" style="--bg:${bg};--fg:${fg}">${glyph(icon)}</span>`;

const designerStyles = `
:host{display:block;min-width:0;height:100%;container-type:inline-size}
.designer{display:grid;grid-template-columns:200px minmax(0,1fr) 340px;gap:0;height:100%;min-height:0}
.tray{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--hm-line);background:var(--hm-surface)}
.tray header{display:flex;align-items:center;gap:8px;padding:12px;font-size:13px;color:var(--hm-brand)}.tray header b{flex:1;color:var(--hm-ink);font-weight:500}
.tray .count{font-size:11px;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--hm-surface-2);color:var(--hm-muted)}
.traylist{flex:1;overflow:auto;display:flex;flex-direction:column;gap:6px;padding:0 10px 10px}
.tchip{display:flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-surface);font-size:13px;cursor:grab;user-select:none}
.tchip span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tchip ha-icon{--mdc-icon-size:16px;color:var(--hm-muted)}
.tchip em{font-style:normal;font-size:11px;font-weight:700;min-width:18px;height:18px;display:grid;place-items:center;border-radius:9px;background:var(--hm-surface-2);color:var(--hm-muted)}
.tchip.unused{border-style:dashed}.tchip.unused em{background:color-mix(in srgb,var(--hm-warn) 20%,transparent);color:var(--hm-warn)}
.tray footer{padding:8px 10px;border-top:1px solid var(--hm-line)}
.stage{position:relative;min-width:0;min-height:0;overflow:auto;display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px;background:var(--hm-bg)}
.canvas{width:100%;display:flex;justify-content:center}.canvas homemanager-rf-remote{width:100%}
.ptool{display:flex;gap:4px;padding:4px;border-radius:14px;background:var(--hm-surface);box-shadow:var(--hm-shadow)}
.error-text{margin:0;color:var(--hm-alert);font-size:13px}.error-text:empty{display:none}
.props{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:14px 14px 24px;border-left:1px solid var(--hm-line);background:var(--hm-surface)}
.props>*{flex-shrink:0}
.egroup{display:grid;gap:6px}.egroup>span{font-size:11px;color:var(--hm-muted)}
.etypes{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px}
.etype{display:flex;flex-direction:column;align-items:center;gap:4px;min-height:0;padding:8px 4px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);font-size:11px;color:var(--hm-muted);line-height:1.15;text-align:center}
.etype ha-icon{--mdc-icon-size:22px;color:var(--hm-ink)}.etype:hover{border-color:var(--hm-brand)}
.etype[aria-expanded=true]{border-color:var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 10%,var(--hm-surface))}
.brands{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px}
.brand{display:flex;align-items:center;gap:6px;min-height:0;padding:6px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-surface);font-size:12px}
.brandtile{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--bg);color:var(--fg)}.brandtile ha-icon{--mdc-icon-size:16px}
.selhead{display:flex;align-items:center;gap:8px;padding-top:12px;border-top:1px solid var(--hm-line)}.selhead b{font-weight:500}
.arow{display:flex;align-items:center;gap:8px;min-width:0;color:var(--hm-muted);font-size:13px}
.arow>span:not(.stepn){min-width:58px}.arow select,.arow .field{flex:1;min-width:0;min-height:38px;padding:4px 8px}
.arow>ha-icon{--mdc-icon-size:18px;flex:none}
.field{width:100%;min-height:38px;padding:4px 10px}
label.field{display:grid;gap:4px;font-size:12px;color:var(--hm-muted)}
.stepn{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--hm-surface-2);font-size:11px;font-weight:700;color:var(--hm-ink)}
.num{display:inline-flex;align-items:center;gap:4px;padding:0 8px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-bg);font-size:12px;color:var(--hm-muted)}
.num input{width:46px;min-height:34px;border:0;padding:0;background:transparent;text-align:center}
.grid2{display:flex;align-items:center;gap:8px;color:var(--hm-muted)}
.grid4{display:grid;grid-template-columns:22px repeat(4,minmax(0,1fr));gap:6px;align-items:center;color:var(--hm-muted)}.grid4 .num{padding:0 4px}.grid4 .num input{width:100%}
.swatches{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.sw{width:24px;height:24px;min-height:24px;padding:0;border-radius:50%;border:1px solid color-mix(in srgb,var(--hm-ink) 18%,transparent);background:var(--c)}
.sw[aria-pressed=true]{box-shadow:0 0 0 2px var(--hm-surface),0 0 0 4px var(--hm-brand)}
.sw-none{width:24px;height:24px;min-height:24px}.sw-none ha-icon{--mdc-icon-size:16px}
.sw.custom{position:relative;overflow:hidden;background:conic-gradient(#D0453A,#D98B1F,#4F7A5A,#4F8FBF,#6F6BB8,#D0453A)}.sw.custom input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;min-height:0;padding:0}
@container (max-width:900px){.designer{grid-template-columns:minmax(0,1fr)}.tray{border-right:0;border-bottom:1px solid var(--hm-line)}.traylist{flex-direction:row;flex-wrap:wrap;max-height:120px}.props{border-left:0;border-top:1px solid var(--hm-line)}}
`;
