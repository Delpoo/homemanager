import { t } from '../i18n/index.js';
import { dragShape, planToShape, type ShapeHandle as Handle } from '../model/room-shapes.js';
import { fitCamera, spaceBounds } from './geometry.js';
import { clone, escapeHTML as e } from './types.js';
import type { HomeManagerCard } from './home-manager-card.js';

/** CP8: a space's shape is edited on the plan, as a rectangle with eight handles. */
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export function startShapeEdit(this: HomeManagerCard, id: string): void {
  const room = this.draft?.rooms.find(item => item.id === id);
  if (!room || !this.svg) return;
  const zone = spaceBounds(this.svg, room, this.box);
  const shape = room.shape ?? (zone && planToShape(zone, this.box)) ?? { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };
  this.shapeEdit = { id, shape: { ...shape } };
  // Room around the shape, so every handle can be reached.
  const r = this.viewport.getBoundingClientRect();
  const bounds = zone ?? {
    x: this.box.x + shape.x * this.box.width,
    y: this.box.y + shape.y * this.box.height,
    width: shape.width * this.box.width,
    height: shape.height * this.box.height,
  };
  this.currentRoom = id;
  if (r.width && r.height) this.moveCamera(fitCamera(bounds, { width: r.width, height: r.height }, 96));
  this.renderShapeEdit();
  this.root.querySelector<HTMLElement>('.shape-box')?.focus({ preventScroll: true });
}

/** Draws the rectangle in screen space; called with every camera frame. */
export function renderShapeEdit(this: HomeManagerCard): void {
  const layer = this.root.querySelector<HTMLElement>('.shape-layer');
  if (!layer) return;
  const edit = this.shapeEdit;
  if (!edit || !this.editing) {
    // Leaving edit mode drops an unapplied shape.
    this.shapeEdit = undefined;
    if (layer.childElementCount) layer.replaceChildren();
    return;
  }
  if (!layer.childElementCount) {
    const label = this.draft?.rooms.find(room => room.id === edit.id)?.label ?? edit.id;
    layer.innerHTML = `<div class="shape-box" tabindex="0" role="group" data-handle="move" aria-label="${e(t('Forma de {room}: flechas para moverla, Mayúsculas y flechas para cambiar su tamaño', { room: label }))}">${HANDLES.map(handle => `<span class="shape-handle" data-handle="${handle}" aria-hidden="true"></span>`).join('')}</div><div class="shape-bar" role="toolbar" aria-label="${e(t('Forma de {room}', { room: label }))}"><span>${e(label)}</span><button type="button" data-command="shape-cancel">${e(t('Cancelar'))}</button><button type="button" class="primary" data-command="shape-apply">${e(t('Aplicar forma'))}</button></div>`;
  }
  const box = layer.querySelector<HTMLElement>('.shape-box')!;
  const { scale, x, y } = this.camera;
  box.style.left = `${x + (this.box.x + edit.shape.x * this.box.width) * scale}px`;
  box.style.top = `${y + (this.box.y + edit.shape.y * this.box.height) * scale}px`;
  box.style.width = `${edit.shape.width * this.box.width * scale}px`;
  box.style.height = `${edit.shape.height * this.box.height * scale}px`;
}

export function endShapeEdit(this: HomeManagerCard, apply: boolean): void {
  const edit = this.shapeEdit;
  this.shapeEdit = undefined;
  this.shapeDrag = undefined;
  this.renderShapeEdit();
  if (!apply || !edit || !this.draft) return;
  const next = clone(this.draft);
  const room = next.rooms.find(item => item.id === edit.id);
  if (!room) return;
  room.shape = { ...edit.shape };
  room.shapeSource = 'app';
  this.change(next);
  this.status(t('Forma guardada en el borrador. Guardá el plano para conservarla.'));
}

export function bindShapeEdit(this: HomeManagerCard): void {
  const layer = this.root.querySelector<HTMLElement>('.shape-layer');
  if (!layer) return;
  layer.addEventListener('pointerdown', event => {
    const target = (event.target as Element).closest<HTMLElement>('[data-handle]');
    if (!target || !this.shapeEdit || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    target.setPointerCapture(event.pointerId);
    this.shapeDrag = {
      handle: target.dataset.handle!,
      x: event.clientX,
      y: event.clientY,
      shape: { ...this.shapeEdit.shape },
    };
  });
  layer.addEventListener('pointermove', event => {
    const drag = this.shapeDrag;
    if (!drag || !this.shapeEdit) return;
    const dx = (event.clientX - drag.x) / this.camera.scale / this.box.width,
      dy = (event.clientY - drag.y) / this.camera.scale / this.box.height;
    this.shapeEdit.shape = dragShape(drag.shape, drag.handle as Handle, dx, dy);
    this.renderShapeEdit();
  });
  const release = () => (this.shapeDrag = undefined);
  layer.addEventListener('pointerup', release);
  layer.addEventListener('pointercancel', release);
  layer.addEventListener('keydown', event => {
    const edit = this.shapeEdit;
    if (!edit) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.endShapeEdit(false);
      return;
    }
    const step = 0.005;
    const offset = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!offset || !(event.target as Element).matches('.shape-box')) return;
    event.preventDefault();
    event.stopPropagation();
    edit.shape = dragShape(edit.shape, event.shiftKey ? 'se' : 'move', offset[0], offset[1]);
    this.renderShapeEdit();
  });
}

export const shapeEditStyles = `
.shape-layer{position:absolute;inset:0;pointer-events:none;z-index:4}
.shape-box{position:absolute;box-sizing:border-box;border:2px solid var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 14%,transparent);pointer-events:auto;touch-action:none;cursor:move;border-radius:2px}
.shape-box:focus-visible{outline:3px solid color-mix(in srgb,var(--hm-brand) 45%,transparent);outline-offset:3px}
.shape-handle{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border:2px solid var(--hm-brand);border-radius:4px;background:var(--hm-surface);touch-action:none}
.shape-handle::after{content:'';position:absolute;inset:-12px}
.shape-handle[data-handle=nw]{left:0;top:0;cursor:nwse-resize}.shape-handle[data-handle=n]{left:50%;top:0;cursor:ns-resize}.shape-handle[data-handle=ne]{left:100%;top:0;cursor:nesw-resize}.shape-handle[data-handle=e]{left:100%;top:50%;cursor:ew-resize}
.shape-handle[data-handle=se]{left:100%;top:100%;cursor:nwse-resize}.shape-handle[data-handle=s]{left:50%;top:100%;cursor:ns-resize}.shape-handle[data-handle=sw]{left:0;top:100%;cursor:nesw-resize}.shape-handle[data-handle=w]{left:0;top:50%;cursor:ew-resize}
.shape-bar{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 6px 6px 14px;background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:14px;box-shadow:var(--hm-shadow);pointer-events:auto;font-size:13px;white-space:nowrap}
.shape-bar button{min-height:36px;padding:0 14px;border-radius:18px;border:1px solid var(--hm-line);background:var(--hm-surface);color:var(--hm-ink)}
.shape-bar button.primary{background:var(--hm-brand);border-color:var(--hm-brand);color:var(--hm-on-accent,#fff)}
`;
