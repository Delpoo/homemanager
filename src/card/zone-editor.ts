import { t } from '../i18n/index.js';
import { TaskScreen, taskScreen } from '../ui/task-screen.js';
import {
  addZone,
  applyDraft,
  cutZones,
  deviceMoves,
  intersectZones,
  removeZone,
  renameZone,
  reorderZones,
  setGeom,
  startDraft,
  subtractZones,
  transformZones,
  unionZones,
  zoneAt,
  zoneBox,
  type DeviceMove,
  type EditZone,
  type ZoneDraft,
} from '../model/zone-edit.js';
import { labelPoint, pathOf, rectGeom, ringArea, tidyRing, type Geom, type Pt } from '../model/polygon.js';
import { uiButton } from '../ui/components.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { installDialogComponents } from '../ui/panel-components.js';
import { validateConfiguration } from './configuration.js';
import { detectZones, zoneShapes } from './geometry.js';
import { escapeHTML as e } from './types.js';
import type { HomeManagerCard } from './home-manager-card.js';

/**
 * The plan editor (0.13): every space is a shape with straight sides, edited like in a
 * drawing program over the plan. Choose first, then act: unir (one outline), restar,
 * intersecar, cortar con un trazo, puntos, mover, escalar, girar, voltear, alinear.
 * Everything stays in a draft until ✓, which is one undo step of the plan.
 */
export type ZoneTool = 'select' | 'points' | 'rect' | 'poly' | 'cut';
type Drag =
  | { kind: 'move'; p0: Pt; before: ZoneDraft; moved: boolean }
  | { kind: 'resize'; h: string; box: Box; before: ZoneDraft; moved: boolean }
  | { kind: 'vertex'; before: ZoneDraft; moved: boolean }
  | { kind: 'rect'; a: Pt; b: Pt }
  | { kind: 'cut'; a: Pt; b: Pt };
type Box = { x: number; y: number; width: number; height: number };
export interface ZoneEdit {
  draft: ZoneDraft;
  past: ZoneDraft[];
  future: ZoneDraft[];
  /** Chosen spaces, in the order they were chosen (the first keeps the name when joining). */
  chosen: string[];
  tool: ZoneTool;
  /** Points of the shape being drawn with the free tool. */
  poly: Pt[];
  cursor?: Pt;
  /** The point being edited: space, ring, index. */
  vertex?: { id: string; ring: number; index: number };
  drag?: Drag;
  guides: { x?: number; y?: number }[];
  snap: boolean;
  hidePlan: boolean;
  align: boolean;
  keys: boolean;
  renaming?: string;
  /** Kept for the old API: the first chosen space. */
  selected: string | null;
}

/** An empty id draws a new space; a space without a shape opens ready to draw it. */
export function startZoneEdit(this: HomeManagerCard, id: string | null = null, tool: string = 'select'): void {
  if (!this.svg || !this.draft || !this.editing) return;
  if (this.placing) this.stopPlacing();
  this.selected = null;
  this.updateSelection();
  const ids = this.draft.rooms.map(room => room.id);
  const draft = startDraft(this.draft.rooms, zoneShapes(this.svg, this.box, ids));
  const empty = !!id && !draft.zones.find(zone => zone.id === id)?.geom.length;
  this.zoneEdit = {
    draft,
    past: [],
    future: [],
    chosen: id ? [id] : [],
    tool: empty || tool === 'new' || tool === 'add' ? 'rect' : (tool as ZoneTool),
    poly: [],
    guides: [],
    snap: true,
    hidePlan: false,
    align: false,
    keys: false,
    selected: id,
  };
  this.renderZoneEdit();
  this.fit(null, false);
  keepKeys(this);
}
/** The keyboard shortcuts need the focus inside the card: on its tools, never on a field. */
function keepKeys(card: HomeManagerCard): void {
  const active = card.root.activeElement as HTMLElement | null;
  if (active?.matches('input, select, textarea')) return;
  card.root.querySelector<HTMLElement>('.zvtools [aria-pressed=true]')?.focus({ preventScroll: true });
}

const zoneOf = (edit: ZoneEdit, id: string) => edit.draft.zones.find(zone => zone.id === id);
const chosenZones = (edit: ZoneEdit) =>
  edit.chosen.map(id => zoneOf(edit, id)).filter(zone => zone?.geom.length) as EditZone[];
const glyph = (name: string) => `<ha-icon icon="${name}" aria-hidden="true"></ha-icon>`;
const tool = (command: string, label: string, icon: string, extra = '', cls = '') =>
  `<button type="button" class="ztool${cls}" data-command="${command}" aria-label="${e(label)}" title="${e(label)}"${extra}>${glyph(icon)}</button>`;
const SPACE_COLORS = ['#7fa37a', '#d9a35f', '#6f9fc9', '#b38bc0', '#c9c06f', '#6fb8ad', '#d98a8a', '#9a8fd1'];
const colorOf = (edit: ZoneEdit, id: string) =>
  SPACE_COLORS[
    Math.max(
      0,
      edit.draft.zones.findIndex(zone => zone.id === id),
    ) % SPACE_COLORS.length
  ];

/** Screen position of a plan point. */
function screenOf(card: HomeManagerCard): (p: Pt) => Pt {
  const { scale, x, y } = card.camera;
  return ([px, py]) => [
    x + (card.box.x + px * card.box.width) * scale,
    y + (card.box.y + py * card.box.height) * scale,
  ];
}
function normalized(card: HomeManagerCard, point: { x: number; y: number }): Pt {
  const { scale, x, y } = card.camera;
  return [
    ((point.x - x) / scale - card.box.x) / card.box.width,
    ((point.y - y) / scale - card.box.y) / card.box.height,
  ];
}
/** How far (as a share of the plan) a few pixels reach at the current zoom. */
const reach = (card: HomeManagerCard, px: number): [number, number] => [
  px / card.camera.scale / card.box.width,
  px / card.camera.scale / card.box.height,
];

/** The magnet: a point catches the corners of other spaces, else the grid (half a percent). */
function snapPoint(card: HomeManagerCard, edit: ZoneEdit, p: Pt, skip: readonly string[] = []): Pt {
  edit.guides = [];
  if (!edit.snap) return p;
  const [tx, ty] = reach(card, 8);
  let bx: number | null = null,
    by: number | null = null;
  for (const zone of edit.draft.zones) {
    if (skip.includes(zone.id)) continue;
    for (const ring of zone.geom)
      for (const [x, y] of ring) {
        if (Math.abs(x - p[0]) < tx && (bx === null || Math.abs(x - p[0]) < Math.abs(bx - p[0]))) bx = x;
        if (Math.abs(y - p[1]) < ty && (by === null || Math.abs(y - p[1]) < Math.abs(by - p[1]))) by = y;
      }
  }
  if (bx !== null) edit.guides.push({ x: bx });
  if (by !== null) edit.guides.push({ y: by });
  const grid = (v: number) => Math.round(v / 0.005) * 0.005;
  return [bx ?? grid(p[0]), by ?? grid(p[1])];
}
/** Moving: the box of what moves catches the edges and centres of the other spaces. */
function snapDelta(
  card: HomeManagerCard,
  edit: ZoneEdit,
  box: Box,
  dx: number,
  dy: number,
  skip: readonly string[],
): Pt {
  edit.guides = [];
  if (!edit.snap) return [dx, dy];
  const [tx, ty] = reach(card, 8);
  const xs = [box.x, box.x + box.width / 2, box.x + box.width],
    ys = [box.y, box.y + box.height / 2, box.y + box.height];
  let bx: { d: number; at: number } | null = null,
    by: { d: number; at: number } | null = null;
  for (const zone of edit.draft.zones) {
    if (skip.includes(zone.id) || !zone.geom.length) continue;
    const b = zoneBox([zone]);
    for (const target of [b.x, b.x + b.width / 2, b.x + b.width])
      for (const source of xs) {
        const d = target - (source + dx);
        if (Math.abs(d) < tx && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, at: target };
      }
    for (const target of [b.y, b.y + b.height / 2, b.y + b.height])
      for (const source of ys) {
        const d = target - (source + dy);
        if (Math.abs(d) < ty && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, at: target };
      }
  }
  if (bx) edit.guides.push({ x: bx.at });
  if (by) edit.guides.push({ y: by.at });
  const grid = (v: number) => Math.round(v / 0.005) * 0.005;
  return [bx ? dx + bx.d : grid(dx), by ? dy + by.d : grid(dy)];
}
/** With Shift, a stroke goes horizontal, vertical or at 45°. */
function ortho(a: Pt, q: Pt, soft = false): Pt {
  const dx = q[0] - a[0],
    dy = q[1] - a[1];
  const ang = Math.atan2(dy, dx),
    step = Math.PI / 4;
  const snapped = Math.round(ang / step) * step;
  if (soft && Math.abs(ang - snapped) > 0.09) return q;
  const len = Math.hypot(dx, dy);
  return [a[0] + Math.cos(snapped) * len, a[1] + Math.sin(snapped) * len];
}

/** Draws in screen space; called with every camera frame. */
export function renderZoneEdit(this: HomeManagerCard): void {
  const layer = this.root.querySelector<HTMLElement>('.zones-layer');
  if (!layer) return;
  const edit = this.editing ? this.zoneEdit : undefined;
  const shell = this.root.querySelector('.shell');
  shell?.classList.toggle('zones-active', !!edit);
  shell?.classList.toggle('zones-hide-plan', !!edit?.hidePlan);
  if (!edit) {
    // Leaving edit mode drops what was not applied.
    this.zoneEdit = undefined;
    if (layer.childElementCount) layer.replaceChildren();
    return;
  }
  edit.selected = edit.chosen[0] ?? null;
  const at = screenOf(this);
  const sx = this.box.width * this.camera.scale,
    sy = this.box.height * this.camera.scale;
  const [ox, oy] = at([0, 0]);
  const path = (g: Geom) => pathOf(g, sx, sy, ox, oy);
  const chosen = new Set(edit.chosen);
  const shapes = edit.draft.zones
    .filter(zone => zone.geom.length)
    .map(
      zone =>
        `<path class="zshape${chosen.has(zone.id) ? ' on' : ''}" data-zone="${e(zone.id)}" d="${path(zone.geom)}" style="--zc:${colorOf(edit, zone.id)}"></path>`,
    )
    .join('');
  let over = '';
  const zones = chosenZones(edit);
  const box = zones.length ? zoneBox(zones) : null;
  if (box && edit.tool === 'select' && !edit.drag?.kind.match(/rect|cut/)) {
    const [x1, y1] = at([box.x, box.y]),
      [x2, y2] = at([box.x + box.width, box.y + box.height]);
    over += `<rect class="zbox" x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}"></rect>`;
    const pts: Record<string, Pt> = {
      nw: [x1, y1],
      n: [(x1 + x2) / 2, y1],
      ne: [x2, y1],
      e: [x2, (y1 + y2) / 2],
      se: [x2, y2],
      s: [(x1 + x2) / 2, y2],
      sw: [x1, y2],
      w: [x1, (y1 + y2) / 2],
    };
    over += Object.entries(pts)
      .map(
        ([k, [x, y]]) =>
          `<rect class="zh ${k}" data-h="${k}" x="${x - 6}" y="${y - 6}" width="12" height="12" rx="3"></rect>`,
      )
      .join('');
  }
  if (edit.tool === 'points')
    for (const zone of zones)
      zone.geom.forEach((ring, ri) =>
        ring.forEach((p, i) => {
          const q = ring[(i + 1) % ring.length];
          const [mx, my] = at([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
          const [vx, vy] = at(p);
          const on = edit.vertex?.id === zone.id && edit.vertex.ring === ri && edit.vertex.index === i;
          over += `<rect class="zmid" data-mid="${e(zone.id)}|${ri}|${i}" x="${mx - 5}" y="${my - 5}" width="10" height="10" rx="2"></rect><circle class="zv${on ? ' on' : ''}" data-v="${e(zone.id)}|${ri}|${i}" cx="${vx}" cy="${vy}" r="6"></circle>`;
        }),
      );
  const d = edit.drag;
  if (d?.kind === 'rect') {
    const [x1, y1] = at(d.a),
      [x2, y2] = at(d.b);
    over += `<rect class="zdraft" x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}"></rect>`;
  }
  if (d?.kind === 'cut') {
    const [x1, y1] = at(d.a),
      [x2, y2] = at(d.b);
    over += `<line class="zcut" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
  }
  if (edit.poly.length) {
    const tail = edit.cursor ? [...edit.poly, edit.cursor] : edit.poly;
    over += `<polyline class="zdraft" points="${tail.map(p => at(p).join(',')).join(' ')}"></polyline>${edit.poly.map((p, i) => `<circle class="zv${i === 0 ? ' first' : ''}" cx="${at(p)[0]}" cy="${at(p)[1]}" r="${i === 0 ? 7 : 5}"></circle>`).join('')}`;
  }
  const w = this.viewport.clientWidth,
    hgt = this.viewport.clientHeight;
  for (const g of edit.guides)
    over +=
      g.x !== undefined
        ? `<line class="zguide" x1="${at([g.x, 0])[0]}" y1="0" x2="${at([g.x, 0])[0]}" y2="${hgt}"></line>`
        : `<line class="zguide" x1="0" y1="${at([0, g.y!])[1]}" x2="${w}" y2="${at([0, g.y!])[1]}"></line>`;
  const labels = edit.draft.zones
    .filter(zone => zone.geom.length)
    .map(zone => {
      const [lx, ly] = at(labelPoint(zone.geom));
      if (edit.renaming === zone.id)
        return `<span class="zlabel edit" style="left:${lx}px;top:${ly}px;--zc:${colorOf(edit, zone.id)}"><input name="zone-rename" maxlength="240" value="${e(zone.label)}" aria-label="${e(t('Nombre del espacio'))}"></span>`;
      return `<button type="button" class="zlabel${chosen.has(zone.id) ? ' on' : ''}" data-zone-label="${e(zone.id)}" style="left:${lx}px;top:${ly}px;--zc:${colorOf(edit, zone.id)}" title="${e(t('Doble clic: cambiar el nombre'))}">${e(zone.label || t('Sin nombre'))}</button>`;
    })
    .join('');
  const drawing = edit.tool === 'rect' || edit.tool === 'poly' || edit.tool === 'cut';
  const toolbar = `<div class="zvtools" role="toolbar" aria-label="${e(t('Herramientas'))}">${(
    [
      ['select', t('Elegir y mover · V'), 'mdi:cursor-default-outline'],
      ['points', t('Editar puntos · A'), 'mdi:vector-polyline-edit'],
      ['rect', t('Rectángulo · R'), 'mdi:vector-rectangle'],
      ['poly', t('Forma libre de lados rectos · P'), 'mdi:vector-polygon'],
      ['cut', t('Cortar con un trazo · K'), 'mdi:scissors-cutting'],
    ] as const
  )
    .map(([k, label, icon]) => tool(`zone-tool-${k}`, label, icon, ` aria-pressed="${edit.tool === k}"`))
    .join('')}</div>`;
  const corner = `<div class="ztr">${tool('zone-snap', t('Imán: alinea con la grilla y con los otros espacios'), edit.snap ? 'mdi:magnet-on' : 'mdi:magnet', ` aria-pressed="${edit.snap}"`)}${tool('zone-plan', t('Mostrar u ocultar el dibujo del plano'), edit.hidePlan ? 'mdi:eye-off-outline' : 'mdi:image-outline', ` aria-pressed="${!edit.hidePlan}"`)}${tool('zone-keys', t('Atajos de teclado'), 'mdi:keyboard-outline', ` aria-pressed="${edit.keys}"`)}</div>${
    edit.keys
      ? `<div class="zkeys">${(
          [
            ['V', t('Elegir')],
            ['A', t('Editar puntos')],
            ['R', t('Rectángulo')],
            ['P', t('Forma libre')],
            ['K', t('Cortar')],
            ['Shift + clic', t('Sumar a la selección')],
            ['Ctrl + U', t('Unir')],
            ['Ctrl + D', t('Duplicar')],
            ['Supr', t('Borrar')],
            [t('Flechas'), t('Mover')],
            ['Ctrl + Z', t('Deshacer')],
            ['Enter', t('Cerrar la forma libre')],
            ['Esc', t('Cancelar')],
          ] as const
        )
          .map(([k, v]) => `<kbd>${e(k)}</kbd><span>${e(v)}</span>`)
          .join('')}</div>`
      : ''
  }`;
  const foot = `<div class="zfoot">${tool('zone-undo', t('Deshacer · Ctrl+Z'), 'mdi:undo', edit.past.length ? '' : ' disabled')}${tool('zone-redo', t('Rehacer · Ctrl+Shift+Z'), 'mdi:redo', edit.future.length ? '' : ' disabled')}<span class="zsep" aria-hidden="true"></span>${tool('zone-cancel', t('Cancelar'), 'mdi:close')}${tool('zone-apply', t('Aplicar'), 'mdi:check', '', ' primary')}</div>`;
  let ctx = '';
  if (box && edit.tool === 'select' && !d) {
    const [cx, top] = at([box.x + box.width / 2, box.y]);
    const [, bottom] = at([0, box.y + box.height]);
    const below = top < 70;
    const multi = zones.length > 1;
    ctx = `<div class="zctx${below ? ' below' : ''}" style="left:${Math.min(w - 170, Math.max(170, cx))}px;top:${below ? bottom : top}px">${
      multi
        ? `${tool('zone-union', t('Unir en una sola forma · Ctrl+U'), 'mdi:vector-union')}${tool('zone-subtract', t('Restar: al primero le quita lo que tapan los otros'), 'mdi:vector-difference-ba')}${tool('zone-intersect', t('Intersecar: deja sólo lo común'), 'mdi:vector-intersection')}<span class="zsep"></span>${tool('zone-align-menu', t('Alinear'), 'mdi:align-horizontal-center', ` aria-expanded="${edit.align}"`)}`
        : `${tool('zone-tool-points', t('Editar puntos · doble clic'), 'mdi:vector-polyline-edit')}${tool('zone-tool-cut', t('Cortar con un trazo'), 'mdi:scissors-cutting')}${tool('zone-rename', t('Cambiar el nombre'), 'mdi:rename-outline')}`
    }<span class="zsep"></span>${tool('zone-rotate', t('Girar 90°'), 'mdi:rotate-right')}${tool('zone-flip-h', t('Voltear horizontal'), 'mdi:flip-horizontal')}${tool('zone-flip-v', t('Voltear vertical'), 'mdi:flip-vertical')}${tool('zone-duplicate', t('Duplicar · Ctrl+D'), 'mdi:content-duplicate')}${tool('zone-front', t('Traer adelante'), 'mdi:arrange-bring-forward')}${tool('zone-back', t('Mandar atrás'), 'mdi:arrange-send-backward')}${tool('zone-delete', t('Borrar · Supr'), 'mdi:trash-can-outline', '', ' danger')}${
      edit.align
        ? `<div class="zalign">${(
            [
              ['left', t('Izquierda'), 'mdi:align-horizontal-left'],
              ['hc', t('Centro'), 'mdi:align-horizontal-center'],
              ['right', t('Derecha'), 'mdi:align-horizontal-right'],
              ['top', t('Arriba'), 'mdi:align-vertical-top'],
              ['vc', t('Medio'), 'mdi:align-vertical-center'],
              ['bottom', t('Abajo'), 'mdi:align-vertical-bottom'],
            ] as const
          )
            .map(([k, label, icon]) => tool(`zone-align-${k}`, label, icon))
            .join('')}</div>`
        : ''
    }</div>`;
  }
  if (edit.tool === 'points' && edit.vertex) {
    const zone = zoneOf(edit, edit.vertex.id);
    const p = zone?.geom[edit.vertex.ring]?.[edit.vertex.index];
    if (p) {
      const [vx, vy] = at(p);
      ctx = `<div class="zctx${vy < 70 ? ' below' : ''}" style="left:${vx}px;top:${vy}px">${tool('zone-vertex-delete', t('Quitar el punto · Supr'), 'mdi:trash-can-outline', '', ' danger')}</div>`;
    }
  }
  const list = `<aside class="zlist" aria-label="${e(t('Espacios'))}"><b>${e(t('Espacios'))}</b>${[...edit.draft.zones]
    .reverse()
    .map(
      zone =>
        `<button type="button" class="zitem${chosen.has(zone.id) ? ' on' : ''}" data-zone-item="${e(zone.id)}"><i style="--zc:${colorOf(edit, zone.id)}"></i><span>${e(zone.label || t('Sin nombre'))}</span>${zone.geom.length ? '' : `<small>${e(t('sin forma'))}</small>`}</button>`,
    )
    .join('')}</aside>`;
  layer.dataset.tool = edit.tool;
  const active = this.root.activeElement as HTMLElement | null;
  const focus = active?.getAttribute('name');
  // A rebuild must not drop the keyboard: the focus goes back to the tools.
  const hadFocus = !!active && layer.contains(active) && !focus;
  layer.innerHTML = `<svg class="zsvg" aria-hidden="true">${shapes}${over}</svg>${drawing ? '<div class="zones-draw"></div>' : ''}<div class="zlabels">${labels}</div>${toolbar}${corner}${list}${ctx}${foot}`;
  const input = layer.querySelector<HTMLInputElement>('[name="zone-rename"]');
  if (input && focus !== 'zone-rename') {
    input.focus();
    input.select();
  } else if (input) input.focus();
  else if (hadFocus) layer.querySelector<HTMLElement>('.zvtools [aria-pressed=true]')?.focus({ preventScroll: true });
}

function remember(edit: ZoneEdit, before = edit.draft): void {
  edit.past.push(before);
  if (edit.past.length > 60) edit.past.shift();
  edit.future = [];
}
const taken = (card: HomeManagerCard) => card.draft?.rooms.map(room => room.id) ?? [];
/** A tap on the plan (not on a space): nothing chosen, or a point of the free shape. */
export function tapZone(this: HomeManagerCard, point: { x: number; y: number }): void {
  const edit = this.zoneEdit;
  if (!edit) return;
  const zone = zoneAt(edit.draft, { x: normalized(this, point)[0], y: normalized(this, point)[1] });
  edit.chosen = zone ? [zone.id] : [];
  edit.vertex = undefined;
  edit.align = false;
  this.renderZoneEdit();
}

function finishPoly(card: HomeManagerCard, edit: ZoneEdit): void {
  const pts = edit.poly;
  edit.poly = [];
  edit.cursor = undefined;
  if (pts.length >= 3 && Math.abs(ringArea(pts)) > 1e-4) {
    remember(edit);
    edit.draft = addZone(edit.draft, t('Espacio nuevo'), [tidyRing(pts)], taken(card));
    const id = edit.draft.zones.at(-1)!.id;
    edit.chosen = [id];
    edit.renaming = id;
    edit.tool = 'select';
  }
  card.renderZoneEdit();
}

export function bindZoneEdit(this: HomeManagerCard): void {
  const layer = this.root.querySelector<HTMLElement>('.zones-layer');
  if (!layer) return;
  let lastDown = { t: 0, x: 0, y: 0 };
  // Our own double click: the drawing is rebuilt on every tap and the browser loses count.
  const isDouble = (event: PointerEvent) => {
    const now = performance.now();
    const double = now - lastDown.t < 380 && Math.hypot(event.clientX - lastDown.x, event.clientY - lastDown.y) < 8;
    lastDown = double ? { t: 0, x: 0, y: 0 } : { t: now, x: event.clientX, y: event.clientY };
    return double;
  };
  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
  const move = (event: PointerEvent) => {
    const edit = this.zoneEdit;
    const d = edit?.drag;
    if (!edit || !d) return;
    const p = normalized(this, this.point(event));
    if (d.kind === 'rect') d.b = snapPoint(this, edit, p);
    else if (d.kind === 'cut') d.b = event.altKey ? p : ortho(d.a, snapPoint(this, edit, p), true);
    else if (d.kind === 'move') {
      const box = zoneBox(chosenZones({ ...edit, draft: d.before }));
      const [dx, dy] = snapDelta(this, edit, box, p[0] - d.p0[0], p[1] - d.p0[1], edit.chosen);
      if (!dx && !dy && !d.moved) return;
      if (!d.moved) remember(edit, d.before);
      d.moved = true;
      edit.draft = transformZones(d.before, edit.chosen, ([x, y]) => [x + dx, y + dy]);
    } else if (d.kind === 'resize') {
      const q = snapPoint(this, edit, p, edit.chosen);
      const b = d.box;
      let x1 = b.x,
        y1 = b.y,
        x2 = b.x + b.width,
        y2 = b.y + b.height;
      const [mx, my] = reach(this, 10);
      if (d.h.includes('w')) x1 = Math.min(q[0], x2 - mx);
      if (d.h.includes('e')) x2 = Math.max(q[0], x1 + mx);
      if (d.h.includes('n')) y1 = Math.min(q[1], y2 - my);
      if (d.h.includes('s')) y2 = Math.max(q[1], y1 + my);
      if (event.shiftKey && d.h.length === 2) {
        const k = Math.max((x2 - x1) / b.width, (y2 - y1) / b.height);
        if (d.h.includes('w')) x1 = x2 - b.width * k;
        else x2 = x1 + b.width * k;
        if (d.h.includes('n')) y1 = y2 - b.height * k;
        else y2 = y1 + b.height * k;
      }
      if (!d.moved) remember(edit, d.before);
      d.moved = true;
      const kx = (x2 - x1) / b.width,
        ky = (y2 - y1) / b.height;
      edit.draft = transformZones(d.before, edit.chosen, ([x, y]) => [x1 + (x - b.x) * kx, y1 + (y - b.y) * ky]);
    } else if (d.kind === 'vertex' && edit.vertex) {
      const zone = zoneOf(edit, edit.vertex.id);
      if (!zone) return;
      const ring = zone.geom[edit.vertex.ring];
      let q = snapPoint(this, edit, p, [zone.id]);
      if (event.shiftKey) q = ortho(ring[(edit.vertex.index - 1 + ring.length) % ring.length], q);
      q = [Math.min(1, Math.max(0, q[0])), Math.min(1, Math.max(0, q[1]))];
      if (!d.moved) remember(edit, d.before);
      d.moved = true;
      const geom = zone.geom.map((r, ri) =>
        ri === edit.vertex!.ring ? r.map((point, i) => (i === edit.vertex!.index ? q : point)) : r,
      );
      edit.draft = setGeom(edit.draft, zone.id, geom);
    }
    this.renderZoneEdit();
  };
  const up = () => {
    end();
    const edit = this.zoneEdit;
    const d = edit?.drag;
    if (!edit || !d) return;
    edit.drag = undefined;
    edit.guides = [];
    queueMicrotask(() => keepKeys(this));
    if (d.kind === 'rect') {
      const [mx, my] = reach(this, 10);
      const x = Math.min(d.a[0], d.b[0]),
        y = Math.min(d.a[1], d.b[1]),
        w = Math.abs(d.b[0] - d.a[0]),
        h = Math.abs(d.b[1] - d.a[1]);
      if (w >= mx && h >= my) {
        remember(edit);
        const id = edit.chosen.length === 1 && !zoneOf(edit, edit.chosen[0])?.geom.length ? edit.chosen[0] : null;
        // A space without a shape gets this one; else it is a new space.
        if (id) edit.draft = setGeom(edit.draft, id, rectGeom(x, y, w, h));
        else {
          edit.draft = addZone(edit.draft, t('Espacio nuevo'), rectGeom(x, y, w, h), taken(this));
          edit.chosen = [edit.draft.zones.at(-1)!.id];
          edit.renaming = edit.chosen[0];
        }
        edit.tool = 'select';
      }
    } else if (d.kind === 'cut') {
      const cut = cutZones(edit.draft, d.a, d.b, edit.chosen, taken(this));
      if (cut) {
        remember(edit);
        edit.draft = cut.draft;
        edit.chosen = cut.pieces;
        edit.tool = 'select';
      } else if (Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) > 0.01)
        this.status(t('El trazo no cruza ningún espacio.'));
    }
    this.renderZoneEdit();
  };
  layer.addEventListener('pointerdown', event => {
    const edit = this.zoneEdit;
    if (!edit || event.button !== 0) return;
    const target = event.target as Element;
    // Its own bars and list: a tap there is never a tap on the plan.
    if (target.closest('.zctx, .zvtools, .ztr, .zfoot, .zkeys, .zalign')) {
      event.stopPropagation();
      return;
    }
    const double = isDouble(event);
    const label = target.closest<HTMLElement>('[data-zone-label]');
    const item = target.closest<HTMLElement>('[data-zone-item]');
    if (label || item) {
      const id = (label ?? item)!.dataset[label ? 'zoneLabel' : 'zoneItem']!;
      if (double) edit.renaming = id;
      else
        edit.chosen = event.shiftKey
          ? edit.chosen.includes(id)
            ? edit.chosen.filter(x => x !== id)
            : [...edit.chosen, id]
          : [id];
      if (!double && edit.tool !== 'points') edit.tool = 'select';
      event.stopPropagation();
      this.renderZoneEdit();
      return;
    }
    const draw = target.closest('.zones-draw');
    const shape = target.closest<SVGElement>('[data-zone]');
    const handle = target.closest<SVGElement>('[data-h]');
    const vertex = target.closest<SVGElement>('[data-v]');
    const mid = target.closest<SVGElement>('[data-mid]');
    if (!draw && !shape && !handle && !vertex && !mid) return;
    event.stopPropagation();
    event.preventDefault();
    const p = normalized(this, this.point(event));
    edit.align = false;
    if (draw) {
      if (edit.tool === 'rect') {
        const a = snapPoint(this, edit, p);
        edit.drag = { kind: 'rect', a, b: a };
      } else if (edit.tool === 'cut') {
        const a = snapPoint(this, edit, p);
        edit.drag = { kind: 'cut', a, b: a };
      } else if (edit.tool === 'poly') {
        if (double && edit.poly.length >= 3) return finishPoly(this, edit);
        let q = snapPoint(this, edit, p);
        const first = edit.poly[0];
        const [tx, ty] = reach(this, 10);
        if (first && edit.poly.length >= 3 && Math.abs(q[0] - first[0]) < tx && Math.abs(q[1] - first[1]) < ty)
          return finishPoly(this, edit);
        if (event.shiftKey && edit.poly.length) q = ortho(edit.poly.at(-1)!, q);
        edit.poly.push(q);
        this.renderZoneEdit();
        return;
      }
    } else if (vertex || mid) {
      const [id, ring, index] = (vertex ?? mid)!.dataset[vertex ? 'v' : 'mid']!.split('|');
      const zone = zoneOf(edit, id)!;
      const before = edit.draft;
      let at = Number(index);
      if (mid) {
        const r = zone.geom[Number(ring)];
        const a = r[at],
          b = r[(at + 1) % r.length];
        const geom = zone.geom.map((rr, ri) =>
          ri === Number(ring)
            ? [...rr.slice(0, at + 1), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt, ...rr.slice(at + 1)]
            : rr,
        );
        remember(edit);
        edit.draft = setGeom(edit.draft, id, geom);
        at += 1;
      }
      edit.vertex = { id, ring: Number(ring), index: at };
      edit.drag = { kind: 'vertex', before: mid ? edit.draft : before, moved: !!mid };
    } else if (handle) {
      edit.drag = {
        kind: 'resize',
        h: handle.dataset.h!,
        box: zoneBox(chosenZones(edit)),
        before: edit.draft,
        moved: false,
      };
    } else if (shape) {
      const id = shape.dataset.zone!;
      if (double && edit.tool === 'select') {
        edit.chosen = [id];
        edit.tool = 'points';
        edit.vertex = undefined;
        this.renderZoneEdit();
        return;
      }
      if (event.shiftKey)
        edit.chosen = edit.chosen.includes(id) ? edit.chosen.filter(x => x !== id) : [...edit.chosen, id];
      else if (!edit.chosen.includes(id)) edit.chosen = [id];
      edit.vertex = undefined;
      if (edit.tool === 'select') edit.drag = { kind: 'move', p0: p, before: edit.draft, moved: false };
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.renderZoneEdit();
    keepKeys(this);
  });
  layer.addEventListener('pointermove', event => {
    const edit = this.zoneEdit;
    if (!edit || edit.drag || edit.tool !== 'poly' || !edit.poly.length) return;
    let q = snapPoint(this, edit, normalized(this, this.point(event)));
    if (event.shiftKey) q = ortho(edit.poly.at(-1)!, q);
    edit.cursor = q;
    this.renderZoneEdit();
  });
  layer.addEventListener('keydown', event => {
    const input = event.target as HTMLInputElement;
    if (input.name !== 'zone-rename') return;
    event.stopPropagation();
    if (event.key === 'Enter') input.blur();
    if (event.key === 'Escape' && this.zoneEdit) {
      this.zoneEdit.renaming = undefined;
      this.renderZoneEdit();
    }
  });
  layer.addEventListener('focusout', event => {
    const input = event.target as HTMLInputElement;
    const edit = this.zoneEdit;
    if (input.name !== 'zone-rename' || !edit?.renaming) return;
    const id = edit.renaming;
    edit.renaming = undefined;
    const label = input.value.trim();
    if (label && label !== zoneOf(edit, id)?.label) {
      remember(edit);
      edit.draft = renameZone(edit.draft, id, label);
    }
    queueMicrotask(() => this.renderZoneEdit());
  });
}

/** While the editor is open, the keyboard belongs to it. */
export function zoneKey(this: HomeManagerCard, event: KeyboardEvent): void {
  const edit = this.zoneEdit;
  if (!edit) return;
  const target = event.composedPath()[0] as HTMLElement;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  const key = event.key.toLowerCase();
  const ctrl = event.ctrlKey || event.metaKey;
  const command = (name: string) => {
    event.preventDefault();
    this.zoneCommand(name);
  };
  if (key === 'escape') {
    event.preventDefault();
    if (edit.poly.length) edit.poly = [];
    else if (edit.tool !== 'select') edit.tool = 'select';
    else if (edit.chosen.length) edit.chosen = [];
    else return;
    edit.vertex = undefined;
    this.renderZoneEdit();
    return;
  }
  if (ctrl && key === 'z') return command(event.shiftKey ? 'zone-redo' : 'zone-undo');
  if (ctrl && key === 'y') return command('zone-redo');
  if (ctrl && key === 'd') return command('zone-duplicate');
  if (ctrl && key === 'u') return command('zone-union');
  if (ctrl && key === 'a') {
    event.preventDefault();
    edit.chosen = edit.draft.zones.filter(zone => zone.geom.length).map(zone => zone.id);
    edit.tool = 'select';
    this.renderZoneEdit();
    return;
  }
  if (key === 'delete' || key === 'backspace')
    return command(edit.tool === 'points' && edit.vertex ? 'zone-vertex-delete' : 'zone-delete');
  if (key === 'enter' && edit.poly.length) {
    event.preventDefault();
    finishPoly(this, edit);
    return;
  }
  const tools: Record<string, ZoneTool> = { v: 'select', a: 'points', r: 'rect', p: 'poly', k: 'cut' };
  if (!ctrl && tools[key]) return command(`zone-tool-${tools[key]}`);
  const step = event.shiftKey ? 0.025 : 0.005;
  const offset = (
    { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] } as Record<string, Pt>
  )[key];
  if (offset && edit.chosen.length) {
    event.preventDefault();
    remember(edit);
    edit.draft = transformZones(edit.draft, edit.chosen, ([x, y]) => [x + offset[0], y + offset[1]]);
    this.renderZoneEdit();
  }
}

export function zoneCommand(this: HomeManagerCard, command: string, trigger?: HTMLElement): void {
  const edit = this.zoneEdit;
  if (!edit) return;
  const zones = chosenZones(edit);
  const box = zones.length ? zoneBox(zones) : null;
  const apply = (next: ZoneDraft | null, failure?: string) => {
    if (!next) {
      if (failure) this.status(failure);
      return;
    }
    remember(edit);
    edit.draft = next;
  };
  if (command.startsWith('zone-tool-')) {
    edit.tool = command.slice(10) as ZoneTool;
    edit.poly = [];
    edit.vertex = undefined;
  } else if (command.startsWith('zone-align-') && command !== 'zone-align-menu' && zones.length > 1 && box) {
    const k = command.slice(11);
    let next = edit.draft;
    for (const zone of zones) {
      const b = zoneBox([zone]);
      const dx =
        k === 'left'
          ? box.x - b.x
          : k === 'right'
            ? box.x + box.width - b.x - b.width
            : k === 'hc'
              ? box.x + box.width / 2 - b.x - b.width / 2
              : 0;
      const dy =
        k === 'top'
          ? box.y - b.y
          : k === 'bottom'
            ? box.y + box.height - b.y - b.height
            : k === 'vc'
              ? box.y + box.height / 2 - b.y - b.height / 2
              : 0;
      next = transformZones(next, [zone.id], ([x, y]) => [x + dx, y + dy]);
    }
    apply(next);
    edit.align = false;
  } else
    switch (command) {
      case 'zone-align-menu':
        edit.align = !edit.align;
        break;
      case 'zone-snap':
        edit.snap = !edit.snap;
        break;
      case 'zone-plan':
        edit.hidePlan = !edit.hidePlan;
        break;
      case 'zone-keys':
        edit.keys = !edit.keys;
        break;
      case 'zone-union':
        apply(unionZones(edit.draft, edit.chosen));
        edit.chosen = edit.chosen.slice(0, 1);
        break;
      case 'zone-subtract':
        apply(subtractZones(edit.draft, edit.chosen, taken(this)), t('No queda nada de ese espacio.'));
        edit.chosen = edit.chosen.slice(0, 1);
        break;
      case 'zone-intersect':
        apply(intersectZones(edit.draft, edit.chosen), t('Esos espacios no se superponen.'));
        edit.chosen = edit.chosen.slice(0, 1);
        break;
      case 'zone-rename':
        if (edit.chosen[0]) edit.renaming = edit.chosen[0];
        break;
      case 'zone-rotate':
      case 'zone-flip-h':
      case 'zone-flip-v':
        if (box) {
          const cx = box.x + box.width / 2,
            cy = box.y + box.height / 2;
          // A plan is not square: turning keeps the shape's real proportions.
          const r = this.box.width / this.box.height;
          const f: (p: Pt) => Pt =
            command === 'zone-rotate'
              ? ([x, y]) => [cx - (y - cy) / r, cy + (x - cx) * r]
              : command === 'zone-flip-h'
                ? ([x, y]) => [2 * cx - x, y]
                : ([x, y]) => [x, 2 * cy - y];
          apply(transformZones(edit.draft, edit.chosen, f));
        }
        break;
      case 'zone-duplicate':
        if (zones.length) {
          let next = edit.draft;
          const ids: string[] = [];
          for (const zone of zones) {
            next = addZone(
              next,
              `${zone.label} ${t('copia')}`,
              zone.geom.map(ring => ring.map(([x, y]): Pt => [Math.min(1, x + 0.02), Math.min(1, y + 0.02)])),
              taken(this),
            );
            ids.push(next.zones.at(-1)!.id);
          }
          apply(next);
          edit.chosen = ids;
        }
        break;
      case 'zone-front':
      case 'zone-back':
        if (zones.length) apply(reorderZones(edit.draft, edit.chosen, command === 'zone-front' ? 'front' : 'back'));
        break;
      case 'zone-delete':
        if (edit.chosen.length) {
          let next = edit.draft;
          for (const id of edit.chosen) next = removeZone(next, id);
          apply(next);
          edit.chosen = [];
        }
        break;
      case 'zone-vertex-delete': {
        const v = edit.vertex;
        const zone = v && zoneOf(edit, v.id);
        if (!v || !zone) break;
        const ring = zone.geom[v.ring];
        if (ring.length <= 3) {
          this.status(t('Una forma necesita al menos tres puntos.'));
          break;
        }
        apply(
          setGeom(
            edit.draft,
            zone.id,
            zone.geom.map((r, ri) => (ri === v.ring ? r.filter((_, i) => i !== v.index) : r)),
          ),
        );
        edit.vertex = undefined;
        break;
      }
      case 'zone-undo': {
        const previous = edit.past.pop();
        if (!previous) break;
        edit.future.push(edit.draft);
        edit.draft = previous;
        edit.chosen = edit.chosen.filter(id => zoneOf(edit, id));
        break;
      }
      case 'zone-redo': {
        const next = edit.future.pop();
        if (!next) break;
        edit.past.push(edit.draft);
        edit.draft = next;
        break;
      }
      case 'zone-cancel':
        if (!edit.past.length) {
          this.endZoneEdit();
          return;
        }
        void confirmDialog(this.root, {
          title: t('¿Descartar los cambios del plano?'),
          message: t('Los espacios quedan como estaban antes de abrir el editor.'),
          confirm: t('Descartar cambios'),
          trigger,
        }).then(confirmed => {
          if (confirmed) this.endZoneEdit();
        });
        return;
      case 'zone-apply':
        void applyZones.call(this, edit);
        return;
    }
  this.renderZoneEdit();
  keepKeys(this);
}

export function endZoneEdit(this: HomeManagerCard): void {
  this.zoneEdit = undefined;
  this.renderZoneEdit();
  this.fit(null, false);
}

async function applyZones(this: HomeManagerCard, edit: ZoneEdit): Promise<void> {
  if (!this.draft) return;
  if (!edit.past.length) {
    this.endZoneEdit();
    return;
  }
  const unnamed = edit.draft.zones.find(zone => !zone.label.trim());
  if (unnamed) {
    edit.chosen = [unnamed.id];
    edit.renaming = unnamed.id;
    this.renderZoneEdit();
    return;
  }
  const moves = deviceMoves(this.draft.catalog.devices, edit.draft);
  const chosen = moves.length ? await chooseMoves(this, edit, moves) : [];
  if (!chosen) return;
  let next;
  try {
    next = applyDraft(this.draft, edit.draft, chosen);
    validateConfiguration(next, { allowPending: true });
  } catch (error) {
    // The work stays open: nothing is lost to a value the plan refuses.
    this.status(error instanceof Error ? error.message : t('Borrador no válido.'));
    return;
  }
  this.endZoneEdit();
  this.change(next);
  this.status(t('Espacios aplicados. Guardá el plano para conservarlos.'));
}

/** Before applying: which devices end up in another space. Null goes back to the editor. */
function chooseMoves(
  card: HomeManagerCard,
  edit: ZoneEdit,
  moves: readonly DeviceMove[],
): Promise<DeviceMove[] | null> {
  installDialogComponents(card.root);
  const label = (id: string | null) =>
    id === null
      ? t('Sin espacio')
      : (edit.draft.zones.find(zone => zone.id === id)?.label ??
        card.draft?.rooms.find(room => room.id === id)?.label ??
        id);
  const template = document.createElement('template');
  template.innerHTML = taskScreen(
    t('Dispositivos que cambian de espacio'),
    `<div class="zone-moves">${moves
      .map(move => {
        const gone = !!move.from && edit.draft.removed.includes(move.from);
        return `<label class="k-row"><input class="k-checkbox" type="checkbox" name="zone-move" value="${e(move.deviceId)}" checked${gone ? ' disabled' : ''}><span class="txt"><b>${e(move.label)}</b><span>${e(label(move.from))} → ${e(label(move.to))}</span></span></label>`;
      })
      .join('')}</div>`,
    uiButton(t('Aplicar'), 'apply', 'primary'),
  );
  customElements.upgrade(template.content);
  const dialog = template.content.querySelector<TaskScreen>('homemanager-task-screen')!;
  return new Promise(resolve => {
    let result: DeviceMove[] | null = null;
    dialog.addEventListener(
      'close',
      () => {
        dialog.remove();
        resolve(result);
      },
      { once: true },
    );
    dialog.addEventListener('click', event => {
      const action = (event.target as Element).closest<HTMLElement>('button[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'apply') {
        const kept = new Set(
          [...dialog.querySelectorAll<HTMLInputElement>('[name="zone-move"]:checked')].map(input => input.value),
        );
        result = moves.filter(move => kept.has(move.deviceId));
      }
      dialog.close(action === 'apply' ? 'applied' : '');
    });
    card.root.append(dialog);
    dialog.resumeKey = 'zone-moves:' + JSON.stringify(edit.draft.zones.map(zone => zone.id));
    dialog.show(card.root);
  });
}

/** A plan without zones and without drawn spaces: offer to draw the first one. */
export function offerFirstSpace(this: HomeManagerCard): void {
  if (this.zonelessOffered || !this.svg || !this.draft || !this.editing) return;
  // Only over a drawing: an empty plan first needs its SVG.
  if (!this.svg.children.length || detectZones(this.svg).length || this.draft.rooms.some(room => room.shape)) return;
  this.zonelessOffered = true;
  installDialogComponents(this.root);
  const template = document.createElement('template');
  template.innerHTML = taskScreen(
    t('Este plano no tiene zonas'),
    `<p>${e(t('Dibujá cada espacio sobre el plano y ponele nombre. Las zonas se cambian cuando quieras.'))}</p>`,
    uiButton(t('Más tarde'), 'later') + uiButton(t('Dibujar el primero'), 'draw', 'primary'),
  );
  customElements.upgrade(template.content);
  const dialog = template.content.querySelector<TaskScreen>('homemanager-task-screen')!;
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.addEventListener('click', event => {
    const action = (event.target as Element).closest<HTMLElement>('button[data-action]')?.dataset.action;
    if (!action) return;
    dialog.close();
    if (action === 'draw') this.startZoneEdit(null, 'rect');
  });
  this.root.append(dialog);
  dialog.show(this.root);
}

export const zoneEditStyles = `
.zones-layer{position:absolute;inset:0;pointer-events:none;z-index:4;overflow:hidden}
.zones-active .editor-wrap,.zones-active .rooms,.zones-active .layers,.zones-active .navmodes,.zones-active .edit-add{display:none!important}
.zones-active .overlay{opacity:.3}
.zones-active .overlay,.zones-active .overlay *{pointer-events:none!important}
.zones-hide-plan .plan-svg,.zones-hide-plan .viewport>svg{opacity:.12}
.shell.zones-active{grid-template-columns:minmax(0,1fr);grid-template-areas:"header" "edit" "workspace" "selection" "status"}
.zones-active .zoom{top:auto;bottom:12px;left:auto;right:12px}
.zsvg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.zshape{fill:color-mix(in srgb,var(--zc) 40%,transparent);stroke:color-mix(in srgb,var(--zc) 70%,var(--hm-ink));stroke-width:1.5;fill-rule:evenodd;pointer-events:visiblePainted;cursor:pointer}
.zshape:hover{fill:color-mix(in srgb,var(--zc) 54%,transparent)}
.zshape.on{fill:color-mix(in srgb,var(--zc) 56%,transparent);stroke:var(--hm-brand);stroke-width:2.5}
.zones-layer[data-tool=select] .zshape.on{cursor:move}
.zbox{fill:none;stroke:var(--hm-brand);stroke-width:1;stroke-dasharray:4 3;pointer-events:none}
.zh{fill:var(--hm-surface);stroke:var(--hm-brand);stroke-width:1.5;pointer-events:all}
.zh.nw,.zh.se{cursor:nwse-resize}.zh.ne,.zh.sw{cursor:nesw-resize}.zh.n,.zh.s{cursor:ns-resize}.zh.e,.zh.w{cursor:ew-resize}
.zv{fill:var(--hm-surface);stroke:var(--hm-brand);stroke-width:2;pointer-events:all;cursor:move}.zv.on,.zv.first{fill:var(--hm-brand)}
.zmid{fill:var(--hm-brand);opacity:.45;pointer-events:all;cursor:copy}.zmid:hover{opacity:1}
.zdraft{fill:color-mix(in srgb,var(--hm-brand) 16%,transparent);stroke:var(--hm-brand);stroke-width:2;stroke-dasharray:6 4;pointer-events:none}
polyline.zdraft{fill:none}
.zcut{stroke:var(--hm-alert);stroke-width:2;stroke-dasharray:7 4;pointer-events:none}
.zguide{stroke:#d14fa0;stroke-width:1;pointer-events:none}
.zones-draw{position:absolute;inset:0;pointer-events:auto;touch-action:none;cursor:crosshair}
.zlabels{position:absolute;inset:0;pointer-events:none}
.zlabel{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;display:flex;align-items:center;gap:5px;padding:3px 10px;border:0;border-radius:10px;background:color-mix(in srgb,var(--hm-surface) 86%,transparent);box-shadow:0 1px 3px rgba(0,0,0,.14);color:var(--hm-ink);font:500 12.5px var(--hm-font);white-space:nowrap;cursor:pointer}
.zlabel::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--zc)}
.zlabel.on{box-shadow:0 0 0 2px var(--hm-brand)}
.zlabel.edit input{border:0;outline:0;background:transparent;font:inherit;width:10em;text-align:center;padding:2px 0;color:var(--hm-ink)}
.zones-layer[data-tool=rect] .zlabel,.zones-layer[data-tool=poly] .zlabel,.zones-layer[data-tool=cut] .zlabel{pointer-events:none;opacity:.7}
.zvtools{position:absolute;left:12px;top:50%;transform:translateY(-50%);display:grid;gap:2px;padding:4px;border-radius:14px;background:var(--hm-surface);box-shadow:var(--hm-shadow);pointer-events:auto;z-index:3}
.ztr{position:absolute;right:12px;top:12px;display:flex;gap:2px;padding:4px;border-radius:12px;background:var(--hm-surface);box-shadow:var(--hm-shadow);pointer-events:auto;z-index:3}
.zkeys{position:absolute;right:12px;top:64px;z-index:5;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center;padding:12px 14px;border-radius:14px;background:var(--hm-surface);border:1px solid var(--hm-line);box-shadow:var(--hm-shadow);font-size:12.5px;pointer-events:auto}
.zkeys kbd{font:11.5px ui-monospace,monospace;padding:2px 6px;border-radius:6px;background:var(--hm-surface-2);border:1px solid var(--hm-line);white-space:nowrap;justify-self:start}
.zlist{position:absolute;right:12px;top:64px;bottom:72px;width:190px;display:flex;flex-direction:column;gap:2px;padding:10px 6px;border-radius:14px;background:var(--hm-surface);box-shadow:var(--hm-shadow);overflow:auto;pointer-events:auto;z-index:2;scrollbar-width:thin}
.zlist>b{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--hm-muted);font-weight:500;padding:0 8px 4px}
.zitem{display:flex;align-items:center;gap:8px;padding:7px 8px;border:0;border-radius:9px;background:transparent;color:var(--hm-ink);font:13px var(--hm-font);text-align:left;cursor:pointer}
.zitem i{flex:none;width:12px;height:12px;border-radius:4px;background:var(--zc)}.zitem span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zitem small{color:var(--hm-muted);font-size:11px}.zitem:hover{background:var(--hm-surface-2)}.zitem.on{background:color-mix(in srgb,var(--hm-brand) 14%,transparent);color:var(--hm-brand);font-weight:500}
.zctx{position:absolute;transform:translate(-50%,calc(-100% - 12px));display:flex;align-items:center;gap:1px;padding:3px;border-radius:12px;background:var(--hm-ink);box-shadow:var(--hm-shadow);pointer-events:auto;z-index:4;white-space:nowrap}
.zctx.below{transform:translate(-50%,16px)}
.zctx .ztool{color:var(--hm-surface);width:34px;height:34px;min-height:34px}.zctx .ztool:hover:not(:disabled){background:color-mix(in srgb,var(--hm-surface) 16%,transparent)}.zctx .ztool.danger{color:#ff8b80}
.zctx .zsep{background:color-mix(in srgb,var(--hm-surface) 25%,transparent);height:20px}
.zalign{position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);display:flex;gap:2px;padding:3px;border-radius:10px;background:var(--hm-ink)}
.zfoot{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;align-items:center;gap:2px;padding:4px;border-radius:14px;background:var(--hm-surface);box-shadow:var(--hm-shadow);pointer-events:auto;z-index:3}
.ztool{flex:none;display:grid;place-items:center;width:40px;height:40px;min-height:40px;padding:0;border:0;border-radius:11px;background:transparent;color:var(--hm-ink);cursor:pointer}
.ztool ha-icon{--mdc-icon-size:21px}.ztool:hover:not(:disabled){background:var(--hm-surface-2)}
.ztool:disabled{opacity:.32;cursor:default}
.ztool[aria-pressed=true],.ztool[aria-expanded=true]{background:color-mix(in srgb,var(--hm-brand) 16%,transparent);color:var(--hm-brand)}
.ztool.danger{color:var(--hm-alert)}.ztool.primary{background:var(--hm-brand);color:var(--hm-on-accent,#fff)}
.zsep{flex:none;width:1px;height:24px;margin:0 4px;background:var(--hm-line)}
.zone-moves{display:grid;gap:6px;max-height:50vh;overflow:auto}
@media(max-width:650px){.zlist{display:none}.zvtools{top:auto;bottom:64px;transform:none;display:flex}.ztool{width:40px;height:44px}}
`;
