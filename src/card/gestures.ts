import { t } from '../i18n/index.js';
import { LONG_PRESS_MS, reducedMotion } from './card-helpers.js';
import { spaceAt, zoomCamera } from './geometry.js';
import { clone } from './types.js';
import { snapToGrid } from '../model/room-shapes.js';

import type { HomeManagerCard } from './home-manager-card.js';
export function point(this: HomeManagerCard, event: { clientX: number; clientY: number }) {
  const r = this.viewport.getBoundingClientRect();
  return { x: event.clientX - r.left, y: event.clientY - r.top };
}

export function pointerDown(this: HomeManagerCard, event: PointerEvent) {
  if (event.button !== 0 || this.saving) return;
  const target = event.target as Element;
  // Floating controls inside the plan keep their own clicks (no pan capture).
  if (
    target.closest('.zoom, .layers, .cluster, .edit-add, .sent-note, .navmodes, .nav-layer, .zones-bar, .linked-note')
  )
    return;
  // Pinned controls keep their own gestures (a slider drags, not the plan).
  if (!this.editing && target.closest('.pins')) return;
  const p = this.point(event);
  this.pointers.set(event.pointerId, p);
  const marker = target.closest<HTMLElement>('.marker');
  // A new press: the click of an earlier long press can no longer arrive.
  this.suppressClick = null;
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
          this.suppressClick = { id, until: Date.now() + 1500 };
          this.showDetails(id, marker.querySelector('button.primary') ?? this.viewport, true);
        }, LONG_PRESS_MS),
      };
      return;
    }
    const d = this.draft?.catalog.devices.find(d => d.id === marker.dataset.id);
    if (!d) return;
    if (this.editor && !this.editor.flushDevice()) {
      this.pointers.delete(event.pointerId);
      return;
    }
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
  } else this.gesture = { kind: 'pan', x: p.x, y: p.y, camera: { ...this.camera }, at: performance.now() };
  this.viewport.setPointerCapture(event.pointerId);
}

export function beginPinch(this: HomeManagerCard) {
  const pts = [...this.pointers.values()];
  this.gesture = {
    kind: 'pinch',
    distance: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
    center: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
    camera: { ...this.camera },
  };
}

export function pointerMove(this: HomeManagerCard, event: PointerEvent) {
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
      x: snapToGrid(g.position.x + dx / this.camera.scale / this.box.width),
      y: snapToGrid(g.position.y + dy / this.camera.scale / this.box.height),
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
}

export function pointerUp(this: HomeManagerCard, event: PointerEvent) {
  if (this.longPress) {
    clearTimeout(this.longPress.timer);
    this.longPress = undefined;
  }
  const g = this.gesture;
  if (g?.kind === 'pan' && this.pointers.size === 1) {
    const p = this.point(event);
    const still = Math.hypot(p.x - g.x, p.y - g.y) < 6;
    if (!still && this.swipeNav({ x: p.x - g.x, y: p.y - g.y }, performance.now() - g.at)) {
      // A swipe in room view travels (or bounces); it is not a pan.
    } else if (still && this.zoneEdit) this.tapZone(p);
    else if (still && this.placing) this.place(this.placing, p);
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
    } else if (this.roomView) this.settleRoom();
  }
  this.pointers.delete(event.pointerId);
  if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
  if (g?.kind === 'device') {
    if (g.moved) {
      this.history.push(g.before);
      if (this.history.length > 40) this.history.shift();
      this.future = [];
      const d = this.draft!.catalog.devices.find(d => d.id === g.id)!;
      const detected = this.svg ? spaceAt(this.svg, d.position, this.box, this.draft!.rooms) : null;
      if (detected) d.roomId = detected;
      if (this.editor) {
        this.editor.setConfig({ ...this.config!, configuration: this.draft! });
        this.editor.selectedDeviceId = g.id;
      }
      this.fixedPermit = null;
    }
    if (!g.moved && this.editor) this.select(g.id);
    this.renderMarkers();
    this.updateControls();
  }
  this.gesture = undefined;
  if (g?.kind === 'device') this.frameAboveSheet();
  if (this.pointers.size === 1) {
    const p = [...this.pointers.values()][0];
    this.gesture = { kind: 'pan', x: p.x, y: p.y, camera: { ...this.camera }, at: 0 };
  }
}

export function contextMenu(this: HomeManagerCard, event: MouseEvent) {
  const marker = (event.target as Element).closest<HTMLElement>('.marker');
  if (!marker || this.editing) return;
  event.preventDefault();
  // On touch screens the long press already opened it.
  const held = this.suppressClick;
  if (held && held.id === marker.dataset.id && Date.now() < held.until) return;
  this.showDetails(marker.dataset.id!, marker.querySelector('button.primary') ?? this.viewport);
}

export function startPlacing(this: HomeManagerCard, id: string) {
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

export function stopPlacing(this: HomeManagerCard) {
  this.placing = null;
  const hint = this.root.querySelector<HTMLElement>('.placing-hint');
  if (hint) hint.hidden = true;
}

export function place(this: HomeManagerCard, id: string, point: { x: number; y: number }) {
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
        Math.min(1, Math.max(0, ((point.y - this.camera.y) / this.camera.scale - this.box.y) / this.box.height)) * 1e6,
      ) / 1e6,
  };
  const detected = this.svg ? spaceAt(this.svg, device.position, this.box, next.rooms) : null;
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

export function pointerCancel(this: HomeManagerCard, event: PointerEvent) {
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
}

export function wheel(this: HomeManagerCard, event: WheelEvent) {
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
}

export function zoom(this: HomeManagerCard, factor: number) {
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

export function key(this: HomeManagerCard, event: KeyboardEvent) {
  if (this.zoneEdit) {
    this.zoneKey(event);
    return;
  }
  if (event.key === 'Escape' && this.placing) {
    event.preventDefault();
    this.stopPlacing();
    return;
  }
  const target = event.composedPath()[0] as HTMLElement;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
  const held = target.closest?.('.marker');
  if (
    held &&
    !this.editing &&
    target.classList.contains('primary') &&
    ((event.key === 'Enter' && event.shiftKey) || event.key === 'ContextMenu')
  ) {
    event.preventDefault();
    this.showDetails((held as HTMLElement).dataset.id!, target);
    return;
  }
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
    device.position.x = snapToGrid(
      d.position.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
    );
    device.position.y = snapToGrid(
      d.position.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
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
    if (this.keyNav(event.key)) return;
    this.camera.x += event.key === 'ArrowLeft' ? shift : event.key === 'ArrowRight' ? -shift : 0;
    this.camera.y += event.key === 'ArrowUp' ? shift : event.key === 'ArrowDown' ? -shift : 0;
    this.queuePosition();
  }
}
