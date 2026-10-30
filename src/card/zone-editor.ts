import { t } from '../i18n/index.js';
import { dragShape, unionOutline, type RoomShape, type ShapeHandle } from '../model/room-shapes.js';
import {
  MAX_RECTS,
  MIN_RECT,
  addRect,
  addZone,
  applyDraft,
  deviceMoves,
  mergeZones,
  removeRect,
  removeZone,
  renameZone,
  snapRect,
  startDraft,
  updateRect,
  zoneAt,
  type DeviceMove,
  type EditZone,
  type ZoneDraft,
} from '../model/zone-edit.js';
import { uiButton } from '../ui/components.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { installDialogComponents, panelDialog } from '../ui/panel-components.js';
import { validateConfiguration } from './configuration.js';
import { detectZones, zoneShapes } from './geometry.js';
import { escapeHTML as e } from './types.js';
import type { HomeManagerCard } from './home-manager-card.js';

/**
 * Stage 2b of 0.10: the drawing is only a background and the zones belong to the app.
 * Every edit stays in a draft of its own until "Aplicar", which is one undo step.
 */
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const PLAN: RoomShape = { x: 0, y: 0, width: 1, height: 1 };
const DOCK_WIDTH = 720;
export type ZoneTool = 'select' | 'new' | 'add';
type Drag =
  | { kind: 'rect'; handle: ShapeHandle; x: number; y: number; rect: RoomShape; before: ZoneDraft; moved: boolean }
  | { kind: 'draw'; from: { x: number; y: number }; shape?: RoomShape };
export interface ZoneEdit {
  draft: ZoneDraft;
  past: ZoneDraft[];
  selected: string | null;
  /** Which of the selected zone's rectangles has the handles. */
  rect: number;
  tool: ZoneTool;
  drag?: Drag;
  /** What the DOM was built from: coordinates and names update in place. */
  built: string;
  /** Typing a name is one undo step, however long the name. */
  naming: boolean;
}

/** An empty id draws a new space, or a space with no shape yet gets its first rectangle. */
export function startZoneEdit(this: HomeManagerCard, id: string | null = null, tool: ZoneTool = 'select'): void {
  if (!this.svg || !this.draft || !this.editing) return;
  if (this.placing) this.stopPlacing();
  this.selected = null;
  this.updateSelection();
  const ids = this.draft.rooms.map(room => room.id);
  const draft = startDraft(this.draft.rooms, zoneShapes(this.svg, this.box, ids));
  const empty = !!id && !draft.zones.find(zone => zone.id === id)?.rects.length;
  this.zoneEdit = {
    draft,
    past: [],
    selected: id,
    rect: 0,
    tool: empty ? 'add' : tool,
    built: '',
    naming: false,
  };
  this.renderZoneEdit();
  this.fit(null, false);
  this.root.querySelector<HTMLElement>('.zone-rect[data-active]')?.focus({ preventScroll: true });
}

const selectedZone = (edit: ZoneEdit): EditZone | undefined => edit.draft.zones.find(zone => zone.id === edit.selected);
const keyOf = (edit: ZoneEdit): string =>
  JSON.stringify([edit.selected, edit.tool, edit.draft.zones.map(zone => [zone.id, zone.rects.length])]);

function hint(edit: ZoneEdit, zone: EditZone | undefined): string {
  if (edit.tool === 'new') return t('Arrastrá sobre el plano para dibujar la zona.');
  if (edit.tool === 'add' && zone)
    return t('Arrastrá sobre el plano para agregarle un rectángulo a {room}.', { room: zone.label });
  if (zone && !zone.rects.length) return t('Esta zona todavía no tiene forma.');
  if (!zone) return t('Tocá una zona del plano para editarla.');
  return t('Arrastrá la zona o sus puntos.');
}

function barMarkup(edit: ZoneEdit): string {
  const zone = selectedZone(edit);
  const others = edit.draft.zones.filter(item => item.id !== edit.selected);
  const options = (items: readonly EditZone[], selected = '') =>
    items
      .map(item => `<option value="${e(item.id)}"${item.id === selected ? ' selected' : ''}>${e(item.label)}</option>`)
      .join('');
  const button = (command: string, label: string, enabled = true, pressed?: boolean) =>
    `<button type="button" data-command="${command}"${enabled ? '' : ' disabled'}${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}>${e(label)}</button>`;
  return `<div class="zones-bar" role="toolbar" aria-label="${e(t('Editor de zonas'))}"><div class="zones-row"><select name="zone-pick" aria-label="${e(t('Zona'))}"><option value="">${e(t('Elegí una zona'))}</option>${options(edit.draft.zones, edit.selected ?? '')}</select><input name="zone-name" maxlength="240" aria-label="${e(t('Nombre de la zona'))}" placeholder="${e(t('Nombre de la zona'))}" value="${e(zone?.label ?? '')}"${zone ? '' : ' disabled'}></div><div class="zones-row">${button('zone-new', t('Nueva zona'), true, edit.tool === 'new')}${button('zone-add', t('Agregar rectángulo'), !!zone && zone.rects.length < MAX_RECTS, edit.tool === 'add')}${button('zone-cut', t('Quitar rectángulo'), (zone?.rects.length ?? 0) > 1)}<select name="zone-merge" aria-label="${e(t('Fusionar con'))}"${zone && others.length ? '' : ' disabled'}><option value="">${e(t('Fusionar con…'))}</option>${options(others)}</select>${button('zone-delete', t('Eliminar zona'), !!zone)}</div><div class="zones-row"><span class="zones-hint">${e(hint(edit, zone))}</span>${button('zone-undo', t('Deshacer'), edit.past.length > 0)}${button('zone-cancel', t('Cancelar'))}<button type="button" class="primary" data-command="zone-apply">${e(t('Aplicar'))}</button></div></div>`;
}

function build(layer: HTMLElement, edit: ZoneEdit): void {
  const zone = selectedZone(edit);
  // Smaller zones on top, as tapping picks the smallest.
  const fills = edit.draft.zones
    .filter(item => item.id !== edit.selected)
    .flatMap(item =>
      item.rects.map((_, index) => `<div class="zone-fill" data-zone="${e(item.id)}" data-index="${index}"></div>`),
    )
    .join('');
  const names = edit.draft.zones
    .filter(item => item.rects.length)
    .map(item => `<span class="zone-name" data-zone="${e(item.id)}"></span>`)
    .join('');
  const rects = (zone?.rects ?? [])
    .map(
      (_, index) =>
        `<div class="zone-rect" tabindex="0" role="group" data-handle="move" data-index="${index}" aria-label="${e(t('Rectángulo {n} de {room}: flechas para moverlo, Mayúsculas y flechas para cambiar su tamaño', { n: index + 1, room: zone!.label }))}">${HANDLES.map(handle => `<span class="zone-handle" data-handle="${handle}" aria-hidden="true"></span>`).join('')}</div>`,
    )
    .join('');
  layer.innerHTML = `<div class="zones-fills">${fills}</div><svg class="zones-outline" aria-hidden="true"></svg>${rects}${edit.tool === 'select' ? '' : '<div class="zones-draw"><div class="zone-preview" hidden></div></div>'}${names}${barMarkup(edit)}`;
}

/** Draws in screen space; called with every camera frame. */
export function renderZoneEdit(this: HomeManagerCard): void {
  const layer = this.root.querySelector<HTMLElement>('.zones-layer');
  if (!layer) return;
  const edit = this.editing ? this.zoneEdit : undefined;
  this.root.querySelector('.shell')?.classList.toggle('zones-active', !!edit);
  if (!edit) {
    // Leaving edit mode drops what was not applied.
    this.zoneEdit = undefined;
    if (layer.childElementCount) layer.replaceChildren();
    return;
  }
  // Wide enough: the tools go beside the plan, which keeps all its height.
  layer.toggleAttribute('data-docked', this.viewport.clientWidth >= DOCK_WIDTH);
  const key = keyOf(edit);
  if (key !== edit.built) {
    const active = this.root.activeElement as HTMLElement | null;
    const focus = active?.dataset.command
      ? `[data-command="${active.dataset.command}"]`
      : active?.matches('.zones-bar [name]')
        ? `[name="${active.getAttribute('name')}"]`
        : '';
    build(layer, edit);
    edit.built = key;
    if (focus) layer.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
  }
  // In place: rebuilding here would drop a drag's capture and the keyboard's focus.
  const undo = layer.querySelector<HTMLButtonElement>('[data-command="zone-undo"]');
  if (undo) undo.disabled = !edit.past.length;
  const { scale, x, y } = this.camera;
  const px = (shape: RoomShape) => ({
    left: x + (this.box.x + shape.x * this.box.width) * scale,
    top: y + (this.box.y + shape.y * this.box.height) * scale,
    width: shape.width * this.box.width * scale,
    height: shape.height * this.box.height * scale,
  });
  const place = (element: HTMLElement, shape: RoomShape) => {
    const box = px(shape);
    element.style.left = `${box.left}px`;
    element.style.top = `${box.top}px`;
    element.style.width = `${box.width}px`;
    element.style.height = `${box.height}px`;
  };
  const byId = new Map(edit.draft.zones.map(zone => [zone.id, zone]));
  for (const fill of layer.querySelectorAll<HTMLElement>('.zone-fill')) {
    const rect = byId.get(fill.dataset.zone!)?.rects[Number(fill.dataset.index)];
    if (rect) place(fill, rect);
  }
  const zone = selectedZone(edit);
  for (const element of layer.querySelectorAll<HTMLElement>('.zone-rect')) {
    const index = Number(element.dataset.index);
    if (zone?.rects[index]) {
      place(element, zone.rects[index]);
      // A small rectangle keeps its corners: eight handles would cover it.
      const box = px(zone.rects[index]);
      element.toggleAttribute('data-narrow', box.width < 56);
      element.toggleAttribute('data-short', box.height < 56);
    }
    element.toggleAttribute('data-active', index === edit.rect);
  }
  // One outline per zone, with no seam between its rectangles.
  layer.querySelector('.zones-outline')!.innerHTML = edit.draft.zones
    .map(item => {
      const d = unionOutline(item.rects)
        .map(([a, b]) => {
          const from = px({ ...a, width: 0, height: 0 }),
            to = px({ ...b, width: 0, height: 0 });
          return `M${from.left} ${from.top}L${to.left} ${to.top}`;
        })
        .join('');
      return `<path d="${d}"${item.id === edit.selected ? ' data-selected' : ''}></path>`;
    })
    .join('');
  // The name sits in the zone's largest rectangle, and never wider than it.
  for (const name of layer.querySelectorAll<HTMLElement>('.zone-name')) {
    const item = byId.get(name.dataset.zone!);
    const largest = item?.rects.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    if (!item || !largest) continue;
    const box = px(largest);
    name.textContent = item.label;
    name.style.left = `${box.left + box.width / 2}px`;
    name.style.top = `${box.top + box.height / 2}px`;
    name.style.maxWidth = `${Math.max(36, box.width - 8)}px`;
  }
  const preview = layer.querySelector<HTMLElement>('.zone-preview');
  if (preview) {
    const shape = edit.drag?.kind === 'draw' ? edit.drag.shape : undefined;
    preview.hidden = !shape;
    if (shape) place(preview, shape);
  }
}

const remember = (edit: ZoneEdit, before = edit.draft) => {
  edit.past.push(before);
  if (edit.past.length > 40) edit.past.shift();
};
function selectZone(card: HomeManagerCard, edit: ZoneEdit, id: string | null): void {
  edit.selected = id;
  edit.rect = 0;
  edit.naming = false;
  edit.tool = id && !selectedZone(edit)?.rects.length ? 'add' : 'select';
  card.renderZoneEdit();
  const name = card.root.querySelector<HTMLInputElement>('.zones-bar [name="zone-name"]');
  if (name) name.value = selectedZone(edit)?.label ?? '';
}
function normalized(card: HomeManagerCard, point: { x: number; y: number }): { x: number; y: number } {
  const { scale, x, y } = card.camera;
  return {
    x: Math.min(1, Math.max(0, ((point.x - x) / scale - card.box.x) / card.box.width)),
    y: Math.min(1, Math.max(0, ((point.y - y) / scale - card.box.y) / card.box.height)),
  };
}
const othersOf = (edit: ZoneEdit, skip?: RoomShape): RoomShape[] => [
  PLAN,
  ...edit.draft.zones.flatMap(zone => zone.rects.filter(rect => rect !== skip)),
];

/** A tap on the plan picks the smallest zone under it, or nothing. */
export function tapZone(this: HomeManagerCard, point: { x: number; y: number }): void {
  const edit = this.zoneEdit;
  if (!edit) return;
  const at = normalized(this, point);
  const zone = zoneAt(edit.draft, at);
  if (zone?.id === edit.selected && zone) {
    // Within the selected zone it picks the rectangle under the finger.
    const index = zone.rects.findIndex(rect => zoneAt({ ...edit.draft, zones: [{ ...zone, rects: [rect] }] }, at));
    if (index >= 0) edit.rect = index;
    this.renderZoneEdit();
    return;
  }
  selectZone(this, edit, zone?.id ?? null);
}

function finishDrawing(card: HomeManagerCard, edit: ZoneEdit, shape: RoomShape | undefined): void {
  if (!shape || shape.width < MIN_RECT || shape.height < MIN_RECT) {
    card.status(t('Arrastrá un poco más para dibujar el rectángulo.'));
    return;
  }
  const others = othersOf(edit);
  const rect = snapRect(snapRect(shape, others, 'nw'), others, 'se');
  remember(edit);
  if (edit.tool === 'add' && edit.selected) {
    edit.draft = addRect(edit.draft, edit.selected, rect);
    edit.rect = (selectedZone(edit)?.rects.length ?? 1) - 1;
    edit.tool = 'select';
    card.renderZoneEdit();
    return;
  }
  const taken = card.draft?.rooms.map(room => room.id) ?? [];
  edit.draft = addZone(edit.draft, t('Zona {n}', { n: edit.draft.zones.length + 1 }), rect, taken);
  selectZone(card, edit, edit.draft.zones.at(-1)!.id);
  // The name comes right after the drawing.
  const name = card.root.querySelector<HTMLInputElement>('.zones-bar [name="zone-name"]');
  name?.focus();
  name?.select();
}

export function bindZoneEdit(this: HomeManagerCard): void {
  const layer = this.root.querySelector<HTMLElement>('.zones-layer');
  if (!layer) return;
  layer.addEventListener('pointerdown', event => {
    const edit = this.zoneEdit;
    const target = (event.target as Element).closest<HTMLElement>('.zones-draw, [data-handle]');
    if (!edit || !target || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    target.setPointerCapture(event.pointerId);
    if (target.matches('.zones-draw')) {
      edit.drag = { kind: 'draw', from: normalized(this, this.point(event)) };
      return;
    }
    const index = Number(target.closest<HTMLElement>('.zone-rect')?.dataset.index);
    const rect = selectedZone(edit)?.rects[index];
    if (!rect) return;
    edit.rect = index;
    edit.drag = {
      kind: 'rect',
      handle: target.dataset.handle as ShapeHandle,
      x: event.clientX,
      y: event.clientY,
      rect,
      before: edit.draft,
      moved: false,
    };
    this.renderZoneEdit();
  });
  layer.addEventListener('pointermove', event => {
    const edit = this.zoneEdit;
    const drag = edit?.drag;
    if (!edit || !drag) return;
    if (drag.kind === 'draw') {
      const at = normalized(this, this.point(event));
      const left = Math.min(drag.from.x, at.x),
        top = Math.min(drag.from.y, at.y);
      drag.shape = { x: left, y: top, width: Math.abs(at.x - drag.from.x), height: Math.abs(at.y - drag.from.y) };
      this.renderZoneEdit();
      return;
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3) return;
    if (!drag.moved) remember(edit, drag.before);
    drag.moved = true;
    const dx = (event.clientX - drag.x) / this.camera.scale / this.box.width,
      dy = (event.clientY - drag.y) / this.camera.scale / this.box.height;
    const moved = dragShape(drag.rect, drag.handle, dx, dy);
    edit.draft = updateRect(
      edit.draft,
      edit.selected!,
      edit.rect,
      snapRect(moved, othersOf({ ...edit, draft: drag.before }, drag.rect), drag.handle),
    );
    this.renderZoneEdit();
  });
  layer.addEventListener('pointerup', event => {
    const edit = this.zoneEdit;
    const drag = edit?.drag;
    if (!edit || !drag) return;
    edit.drag = undefined;
    if (drag.kind === 'draw') finishDrawing(this, edit, drag.shape);
    else if (!drag.moved) this.tapZone(this.point(event));
    this.renderZoneEdit();
  });
  layer.addEventListener('pointercancel', () => {
    const edit = this.zoneEdit;
    const drag = edit?.drag;
    if (!edit || !drag) return;
    edit.drag = undefined;
    if (drag.kind === 'rect' && drag.moved) {
      edit.draft = drag.before;
      edit.past.pop();
    }
    this.renderZoneEdit();
  });
  layer.addEventListener('input', event => {
    const edit = this.zoneEdit;
    const input = event.target as HTMLInputElement;
    if (!edit?.selected || input.name !== 'zone-name') return;
    if (!edit.naming) remember(edit);
    edit.naming = true;
    edit.draft = renameZone(edit.draft, edit.selected, input.value);
    for (const option of layer.querySelectorAll<HTMLOptionElement>(`option[value="${CSS.escape(edit.selected)}"]`))
      option.textContent = input.value;
    this.renderZoneEdit();
  });
  layer.addEventListener('focusout', event => {
    if ((event.target as HTMLInputElement).name === 'zone-name' && this.zoneEdit) this.zoneEdit.naming = false;
  });
  layer.addEventListener('change', event => {
    const edit = this.zoneEdit;
    const input = event.target as HTMLSelectElement;
    if (!edit) return;
    if (input.name === 'zone-pick') selectZone(this, edit, input.value || null);
    if (input.name === 'zone-merge' && input.value && edit.selected) {
      const merged = mergeZones(edit.draft, input.value, edit.selected);
      input.value = '';
      if (!merged) {
        this.status(t('Una zona admite hasta {count} rectángulos.', { count: MAX_RECTS }));
        return;
      }
      remember(edit);
      edit.draft = merged;
      edit.rect = 0;
      this.renderZoneEdit();
    }
  });
}

/** While the editor is open, the keyboard belongs to it. */
export function zoneKey(this: HomeManagerCard, event: KeyboardEvent): void {
  const edit = this.zoneEdit;
  if (!edit) return;
  const target = event.composedPath()[0] as HTMLElement;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  if (event.key === 'Escape') {
    if (edit.tool !== 'select') edit.tool = 'select';
    else if (edit.selected && !typing) edit.selected = null;
    else return;
    event.preventDefault();
    this.renderZoneEdit();
    return;
  }
  if (typing) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    this.zoneCommand('zone-undo');
    return;
  }
  const step = 0.005;
  const offset = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
  const rect = selectedZone(edit)?.rects[Number(target.dataset.index)];
  if (!offset || !rect || !target.matches('.zone-rect')) return;
  event.preventDefault();
  remember(edit);
  edit.rect = Number(target.dataset.index);
  edit.draft = updateRect(
    edit.draft,
    edit.selected!,
    edit.rect,
    dragShape(rect, event.shiftKey ? 'se' : 'move', offset[0], offset[1]),
  );
  this.renderZoneEdit();
}

export function zoneCommand(this: HomeManagerCard, command: string, trigger?: HTMLElement): void {
  const edit = this.zoneEdit;
  if (!edit) return;
  const selected = edit.selected;
  switch (command) {
    case 'zone-new':
      edit.tool = edit.tool === 'new' ? 'select' : 'new';
      break;
    case 'zone-add':
      edit.tool = edit.tool === 'add' ? 'select' : 'add';
      break;
    case 'zone-cut':
      if (selected) {
        remember(edit);
        edit.draft = removeRect(edit.draft, selected, edit.rect);
        edit.rect = 0;
      }
      break;
    case 'zone-delete':
      if (selected) {
        remember(edit);
        edit.draft = removeZone(edit.draft, selected);
        selectZone(this, edit, null);
      }
      break;
    case 'zone-undo': {
      const previous = edit.past.pop();
      if (!previous) break;
      edit.draft = previous;
      edit.rect = 0;
      if (!selectedZone(edit)) edit.selected = null;
      const name = this.root.querySelector<HTMLInputElement>('.zones-bar [name="zone-name"]');
      if (name) name.value = selectedZone(edit)?.label ?? '';
      break;
    }
    case 'zone-cancel':
      if (!edit.past.length) {
        this.endZoneEdit();
        return;
      }
      void confirmDialog(this.root, {
        title: t('¿Descartar las zonas editadas?'),
        message: t('El plano queda como estaba antes de abrir el editor.'),
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
    selectZone(this, edit, unnamed.id);
    this.root.querySelector<HTMLInputElement>('.zones-bar [name="zone-name"]')?.focus();
    this.status(t('Escribí el nombre del espacio.'));
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
  this.status(t('Zonas aplicadas en el borrador. Guardá el plano para conservarlas.'));
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
  template.innerHTML = panelDialog(
    t('Dispositivos que cambian de espacio'),
    `<p>${e(t('Con las zonas nuevas, estos dispositivos quedan en otro espacio. Destildá los que deban seguir donde están.'))}</p><div class="zone-moves">${moves
      .map(move => {
        const gone = !!move.from && edit.draft.removed.includes(move.from);
        return `<label class="k-row"><input class="k-checkbox" type="checkbox" name="zone-move" value="${e(move.deviceId)}" checked${gone ? ' disabled' : ''}><span class="txt"><b>${e(move.label)}</b><span>${e(label(move.from))} → ${e(label(move.to))}</span></span></label>`;
      })
      .join('')}</div>`,
    uiButton(t('Volver'), 'back') + uiButton(t('Aplicar'), 'apply', 'primary'),
  );
  const dialog = template.content.querySelector('dialog')!;
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
      dialog.close();
    });
    card.root.append(dialog);
    dialog.showModal();
  });
}

/** A plan without zones and without drawn spaces: offer to draw the first one (mockup §14). */
export function offerFirstSpace(this: HomeManagerCard): void {
  if (this.zonelessOffered || !this.svg || !this.draft || !this.editing) return;
  // Only over a drawing: an empty plan first needs its SVG.
  if (!this.svg.children.length || detectZones(this.svg).length || this.draft.rooms.some(room => room.shape)) return;
  this.zonelessOffered = true;
  installDialogComponents(this.root);
  const template = document.createElement('template');
  template.innerHTML = panelDialog(
    t('Este plano no tiene zonas'),
    `<p>${e(t('Dibujá cada espacio con rectángulos sobre el plano y ponele nombre. Las zonas se cambian cuando quieras.'))}</p>`,
    uiButton(t('Más tarde'), 'later') + uiButton(t('Dibujar el primero'), 'draw', 'primary'),
  );
  const dialog = template.content.querySelector('dialog')!;
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.addEventListener('click', event => {
    const action = (event.target as Element).closest<HTMLElement>('button[data-action]')?.dataset.action;
    if (!action) return;
    dialog.close();
    if (action === 'draw') this.startZoneEdit(null, 'new');
  });
  this.root.append(dialog);
  dialog.showModal();
}

export const zoneEditStyles = `
.zones-layer{position:absolute;inset:0;pointer-events:none;z-index:4;overflow:hidden}
.zones-active .editor-wrap,.zones-active .rooms,.zones-active .layers,.zones-active .navmodes,.zones-active .edit-add{display:none!important}
.zones-active .overlay{opacity:.35}
.zones-active .overlay,.zones-active .overlay *{pointer-events:none!important}
.shell.zones-active{grid-template-columns:minmax(0,1fr);grid-template-areas:"header" "edit" "workspace" "selection" "status"}
.zones-active .zoom{top:12px;bottom:auto;left:12px;right:auto}
.zone-fill{position:absolute;background:color-mix(in srgb,var(--hm-brand) 10%,transparent)}
.zones-outline{position:absolute;inset:0;width:100%;height:100%}
.zones-outline path{fill:none;stroke:color-mix(in srgb,var(--hm-brand) 60%,transparent);stroke-width:1.5}
.zones-outline path[data-selected]{stroke:var(--hm-brand);stroke-width:2.5}
.zone-name{position:absolute;transform:translate(-50%,-50%);padding:1px 6px;border-radius:8px;background:color-mix(in srgb,var(--hm-surface) 82%,transparent);color:var(--hm-ink);font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box}
.zone-rect{position:absolute;box-sizing:border-box;background:color-mix(in srgb,var(--hm-brand) 30%,transparent);outline:1px dashed color-mix(in srgb,var(--hm-brand) 55%,transparent);outline-offset:-1px;pointer-events:auto;touch-action:none;cursor:move}
.zone-rect:focus-visible{outline:3px solid color-mix(in srgb,var(--hm-brand) 55%,transparent)}
.zone-rect[data-active]{z-index:1}
.zone-handle{display:none;position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border:2px solid var(--hm-brand);border-radius:4px;background:var(--hm-surface);box-sizing:border-box;touch-action:none}
.zone-rect[data-active] .zone-handle{display:block}
.zone-rect[data-narrow] .zone-handle[data-handle=n],.zone-rect[data-narrow] .zone-handle[data-handle=s],.zone-rect[data-short] .zone-handle[data-handle=e],.zone-rect[data-short] .zone-handle[data-handle=w]{display:none}
.zone-handle::after{content:'';position:absolute;inset:-10px}
.zone-handle[data-handle=nw]{left:0;top:0;cursor:nwse-resize}.zone-handle[data-handle=n]{left:50%;top:0;cursor:ns-resize}.zone-handle[data-handle=ne]{left:100%;top:0;cursor:nesw-resize}.zone-handle[data-handle=e]{left:100%;top:50%;cursor:ew-resize}
.zone-handle[data-handle=se]{left:100%;top:100%;cursor:nwse-resize}.zone-handle[data-handle=s]{left:50%;top:100%;cursor:ns-resize}.zone-handle[data-handle=sw]{left:0;top:100%;cursor:nesw-resize}.zone-handle[data-handle=w]{left:0;top:50%;cursor:ew-resize}
.zones-draw{position:absolute;inset:0;z-index:2;pointer-events:auto;touch-action:none;cursor:crosshair}
.zone-preview{position:absolute;box-sizing:border-box;border:2px dashed var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 18%,transparent)}
.zones-bar{position:absolute;left:10px;right:10px;bottom:10px;max-width:780px;margin:auto;display:grid;gap:6px;padding:8px;background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:14px;box-shadow:var(--hm-shadow);pointer-events:auto;font-size:13px;z-index:3}
.zones-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.zones-row select,.zones-row input,.zones-row button{min-height:36px;box-sizing:border-box;border:1px solid var(--hm-line);background:var(--hm-surface);color:var(--hm-ink);font:inherit}
.zones-row select,.zones-row input{flex:1 1 130px;min-width:0;padding:0 8px;border-radius:10px}
.zones-row button{padding:0 12px;border-radius:18px;cursor:pointer}
.zones-row button:disabled,.zones-row select:disabled,.zones-row input:disabled{opacity:.45;cursor:default}
.zones-row button[aria-pressed=true]{border-color:var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 16%,var(--hm-surface))}
.zones-row button.primary{background:var(--hm-brand);border-color:var(--hm-brand);color:var(--hm-on-accent,#fff)}
.zones-row:nth-child(2){flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
.zones-row:nth-child(2)>*{flex:none}
.zones-row:nth-child(3) button{flex:1 1 auto}
.zones-hint{flex:1 1 100%;color:var(--hm-muted,inherit);font-size:12px}
[data-docked] .zones-bar{left:auto;width:264px;top:10px;margin:0;align-content:start;overflow:auto}
[data-docked] .zones-row:nth-child(2){flex-wrap:wrap;overflow:visible}
[data-docked] .zones-row:nth-child(2)>*{flex:1 1 100%}
[data-docked] .zones-row select,[data-docked] .zones-row input{flex:1 1 100%}
.zone-moves{display:grid;gap:6px;max-height:50vh;overflow:auto}
`;
