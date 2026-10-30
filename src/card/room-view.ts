import { t } from '../i18n/index.js';
import {
  exitPoint,
  navTargets,
  pullOf,
  roomInView,
  swipeTarget,
  targetToward,
  type NavRoom,
  type NavTarget,
} from '../model/room-nav.js';
import { spaceBounds } from './geometry.js';
import { escapeHTML as e } from './types.js';
import type { HomeManagerCard } from './home-manager-card.js';

/** Room view (vision §13): rules come from model/room-nav; this file draws and listens. */
const STORAGE = 'homemanager-room-nav';
/** Pixels between a room's edge and its arrows. */
const GAP = 16;
const HOLD_MS = 350;
export interface NavModes {
  arrows: boolean;
  swipe: boolean;
}
export function loadNavModes(): NavModes {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Partial<NavModes>;
    return { arrows: stored.arrows !== false, swipe: stored.swipe !== false };
  } catch {
    return { arrows: true, swipe: true };
  }
}
function saveNavModes(modes: NavModes): void {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(modes));
  } catch {
    /* A page-only preference when storage is denied. */
  }
}

export function navModesMarkup(modes: NavModes): string {
  const button = (command: string, label: string, icon: string, on: boolean) =>
    `<button type="button" data-command="${command}" aria-pressed="${on}"><ha-icon icon="${icon}" aria-hidden="true"></ha-icon>${e(label)}</button>`;
  return `<div class="navmodes" role="group" aria-label="${e(t('Navegación por espacios'))}" hidden>${button('nav-arrows', t('Flechas'), 'mdi:chevron-right', modes.arrows)}${button('nav-swipe', t('Deslizar'), 'mdi:gesture-swipe-horizontal', modes.swipe)}</div>`;
}

/** Spaces with geometry, in plan coordinates. Measured once per plan and set of spaces. */
export function navRooms(this: HomeManagerCard): NavRoom[] {
  if (!this.svg || !this.draft) return [];
  const key = JSON.stringify(this.draft.rooms);
  if (this.navCache?.svg !== this.svg || this.navCache.key !== key) {
    const svg = this.svg;
    this.navCache = {
      svg,
      key,
      rooms: this.draft.rooms.flatMap(room => {
        const bounds = spaceBounds(svg, room, this.box);
        return bounds ? [{ id: room.id, bounds, ...(room.nav?.skip ? { skip: true } : {}) }] : [];
      }),
    };
  }
  return this.navCache.rooms;
}
function viewCentre(card: HomeManagerCard) {
  const r = card.viewport.getBoundingClientRect();
  return {
    x: (r.width / 2 - card.camera.x) / card.camera.scale,
    y: (r.height / 2 - card.camera.y) / card.camera.scale,
  };
}
/** The space the view is on and its arrows: the one travelled to, else the one at the centre. */
export function currentNav(this: HomeManagerCard): { room: NavRoom; targets: NavTarget[] } | null {
  const rooms = this.navRooms();
  const room = rooms.find(item => item.id === this.currentRoom) ?? roomInView(rooms, viewCentre(this));
  return room ? { room, targets: targetsFrom(this, room, rooms) } : null;
}
/** After moving the plan by hand, the space at the centre becomes the current one; nothing reframes. */
export function settleRoom(this: HomeManagerCard): void {
  const room = roomInView(this.navRooms(), viewCentre(this));
  if (room && room.id !== this.currentRoom) {
    this.currentRoom = room.id;
    this.queuePosition();
  }
}
/** A space's arrows, without the destinations it hides (CP8). */
function targetsFrom(card: HomeManagerCard, room: NavRoom, rooms: readonly NavRoom[]): NavTarget[] {
  return navTargets(room, rooms, card.draft?.rooms.find(item => item.id === room.id)?.nav?.hidden ?? []);
}
/** Every possible arrow from a space, hidden ones included, for the space dialog. */
export function arrowChoices(this: HomeManagerCard, id: string): { id: string; label: string; angle: number }[] {
  const rooms = this.navRooms().map(room => ({ ...room, skip: false }));
  const room = rooms.find(item => item.id === id);
  return room
    ? navTargets(room, rooms).map(target => ({ id: target.id, label: labelOf(this, target.id), angle: target.angle }))
    : [];
}
const labelOf = (card: HomeManagerCard, id: string) => card.draft?.rooms.find(room => room.id === id)?.label ?? id;

export function toggleRoomView(this: HomeManagerCard): void {
  if (this.roomView) {
    this.fit(null);
    return;
  }
  const nav = this.currentNav();
  if (!nav) {
    this.status(t('Este plano todavía no tiene espacios con zona o forma.'));
    return;
  }
  this.travel(nav.room.id);
}
/** Frames a space at 100 %; the camera eases there without reloading anything. */
export function travel(this: HomeManagerCard, id: string): void {
  this.roomView = true;
  this.fit(id);
  this.status(labelOf(this, id));
}

/** Arrows just outside the current space, one per target; redrawn with every camera frame. */
export function renderNav(this: HomeManagerCard): void {
  const active = this.roomView && !this.editing;
  this.root.querySelector('[data-command=room-view]')?.setAttribute('aria-pressed', String(active));
  const modes = this.root.querySelector<HTMLElement>('.navmodes');
  if (modes) modes.hidden = !active;
  const layer = this.root.querySelector<HTMLElement>('.nav-layer');
  if (!layer || this.navDrag) return;
  const nav = active && this.navModes.arrows ? this.currentNav() : null;
  if (!nav) {
    layer.replaceChildren();
    return;
  }
  const existing = new Map(
    [...layer.querySelectorAll<HTMLElement>('.nav-arrow')].map(node => [node.dataset.nav, node]),
  );
  const gap = GAP / this.camera.scale;
  for (const target of nav.targets) {
    let arrow = existing.get(target.id);
    existing.delete(target.id);
    if (!arrow) {
      arrow = document.createElement('button');
      arrow.setAttribute('type', 'button');
      arrow.className = 'nav-arrow';
      arrow.dataset.nav = target.id;
      arrow.innerHTML = `<span class="nav-glyph"><svg viewBox="-12 -12 24 24" aria-hidden="true"><path class="halo" d="M-5 -8 4 0-5 8"/><path d="M-5 -8 4 0-5 8"/></svg></span><span class="nav-name" hidden></span>`;
      layer.append(arrow);
    }
    const label = labelOf(this, target.id);
    arrow.setAttribute('aria-label', t('Ir a {room}', { room: label }));
    arrow.querySelector('.nav-name')!.textContent = label;
    const point = exitPoint(nav.room.bounds, target.angle, gap);
    arrow.style.left = `${this.camera.x + point.x * this.camera.scale}px`;
    arrow.style.top = `${this.camera.y + point.y * this.camera.scale}px`;
    arrow.style.setProperty('--angle', `${target.angle}rad`);
    arrow.style.setProperty('--size', String(target.scale));
    arrow.style.opacity = String(target.opacity);
    arrow.dataset.angle = String(target.angle);
  }
  for (const stale of existing.values()) stale.remove();
}

/** Tap: nothing. Hold: the name. Pull back past 40 px: travel. Enter: travel. */
export function bindNav(this: HomeManagerCard): void {
  const layer = this.root.querySelector<HTMLElement>('.nav-layer');
  if (!layer) return;
  const finish = (travel: boolean) => {
    const drag = this.navDrag;
    if (!drag) return;
    clearTimeout(drag.timer);
    this.navDrag = undefined;
    drag.arrow.style.removeProperty('--pull');
    drag.arrow.querySelector<HTMLElement>('.nav-name')!.hidden = true;
    if (travel) this.travel(drag.id);
    else if (!drag.moved && !this.navHinted) {
      this.navHinted = true;
      this.status(t('Tirá de la flecha hacia atrás para ir a {room}.', { room: labelOf(this, drag.id) }));
    }
    this.renderNav();
  };
  layer.addEventListener('pointerdown', event => {
    const arrow = (event.target as Element).closest<HTMLElement>('.nav-arrow');
    if (!arrow || event.button !== 0) return;
    // The plan must not pan while an arrow is held.
    event.stopPropagation();
    event.preventDefault();
    arrow.setPointerCapture(event.pointerId);
    const name = arrow.querySelector<HTMLElement>('.nav-name')!;
    this.navDrag = {
      id: arrow.dataset.nav!,
      angle: Number(arrow.dataset.angle),
      x: event.clientX,
      y: event.clientY,
      moved: false,
      arrow,
      timer: setTimeout(() => (name.hidden = false), HOLD_MS),
    };
  });
  layer.addEventListener('pointermove', event => {
    const drag = this.navDrag;
    if (!drag) return;
    const offset = { x: event.clientX - drag.x, y: event.clientY - drag.y };
    if (Math.hypot(offset.x, offset.y) > 6) drag.moved = true;
    const pull = pullOf(drag.angle, offset);
    drag.arrow.style.setProperty('--pull', `${Math.min(pull.distance, 64)}px`);
    if (pull.travels) drag.arrow.querySelector<HTMLElement>('.nav-name')!.hidden = false;
  });
  layer.addEventListener('pointerup', event => {
    const drag = this.navDrag;
    if (!drag) return;
    finish(pullOf(drag.angle, { x: event.clientX - drag.x, y: event.clientY - drag.y }).travels);
  });
  layer.addEventListener('pointercancel', () => finish(false));
  // Keyboard and screen readers: Enter or Space on an arrow travels (a click with no pointer).
  layer.addEventListener('click', event => {
    const arrow = (event.target as Element).closest<HTMLElement>('.nav-arrow');
    if (arrow && (event as MouseEvent).detail === 0) this.travel(arrow.dataset.nav!);
  });
}

export function setNavMode(this: HomeManagerCard, mode: keyof NavModes): void {
  this.navModes = { ...this.navModes, [mode]: !this.navModes[mode] };
  saveNavModes(this.navModes);
  this.root.querySelector(`[data-command=nav-${mode}]`)?.setAttribute('aria-pressed', String(this.navModes[mode]));
  this.renderNav();
}

/** A quick swipe on the plan pushes it: the space on the opposite side comes in, else it bounces back. */
export function swipeNav(this: HomeManagerCard, finger: { x: number; y: number }, duration: number): boolean {
  if (!this.roomView || this.editing || !this.navModes.swipe || duration > 450 || Math.hypot(finger.x, finger.y) < 60)
    return false;
  const rooms = this.navRooms();
  const from = rooms.find(room => room.id === this.currentRoom);
  if (!from) return false;
  const id = swipeTarget(targetsFrom(this, from, rooms), finger);
  if (id) this.travel(id);
  else this.fit(from.id);
  return true;
}
/** Arrow keys on the plan in room view travel toward that side. */
export function keyNav(this: HomeManagerCard, key: string): boolean {
  if (!this.roomView || this.editing) return false;
  const direction = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  }[key];
  const nav = direction ? this.currentNav() : null;
  if (!direction || !nav) return false;
  const id = targetToward(nav.targets, direction, Math.PI / 3);
  if (id) this.travel(id);
  return true;
}

export const navStyles = `
.nav-layer{position:absolute;inset:0;pointer-events:none;z-index:2}
.nav-arrow{position:absolute;width:44px;height:44px;min-height:44px;margin:0;padding:0;border:0;border-radius:50%;background:transparent;box-shadow:none;transform:translate(-50%,-50%);pointer-events:auto;touch-action:none;cursor:grab;color:var(--hm-ink)}
.nav-arrow:focus-visible{outline:2px solid var(--hm-brand);outline-offset:2px}
.nav-glyph{position:absolute;inset:0;display:grid;place-items:center;transform:rotate(var(--angle)) translateX(calc(-1 * var(--pull, 0px))) scale(var(--size, 1));transition:transform .12s}
.nav-glyph svg{width:26px;height:26px;overflow:visible}.nav-glyph path{fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.nav-glyph .halo{stroke:var(--hm-bg);stroke-width:7;stroke-opacity:.85}
.nav-name{position:absolute;left:50%;bottom:calc(100% + 2px);transform:translateX(-50%);white-space:nowrap;padding:3px 10px;border-radius:12px;background:var(--hm-surface);border:1px solid var(--hm-line);box-shadow:var(--hm-shadow);font-size:12px;font-weight:600;color:var(--hm-ink)}
.navmodes{position:absolute;right:14px;bottom:14px;display:flex;gap:4px;padding:4px;background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:12px;z-index:3}
.navmodes button{display:flex;align-items:center;gap:6px;min-height:32px;padding:5px 10px;border:0;border-radius:9px;background:transparent;color:var(--hm-muted);font-size:12px;white-space:nowrap}.navmodes button ha-icon{--mdc-icon-size:16px}
.navmodes button[aria-pressed=true]{background:color-mix(in srgb,var(--hm-brand) 14%,transparent);color:var(--hm-ink)}
.zoom [data-command=room-view][aria-pressed=true]{background:color-mix(in srgb,var(--hm-brand) 16%,transparent);color:var(--hm-brand)}
@media(prefers-reduced-motion:reduce){.nav-glyph{transition:none}}
@container homemanager (max-width:650px){.navmodes{top:8px;left:8px;right:auto;bottom:auto}}
`;
