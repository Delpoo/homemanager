import { t } from '../i18n/index.js';
import { isActiveValue } from '../panels/controls.js';
import { stateText } from '../panels/native-panel.js';
import { GROUP_DISTANCE, confidenceLabel, layer, reducedMotion } from './card-helpers.js';
import { pinnedControls, stepLabel, tapControl } from './device-controls.js';
import {
  createSpaceHighlight,
  fitCamera,
  hasSpaceGeometry,
  sanitizeArchitecture,
  spaceBounds,
  type Camera,
} from './geometry.js';
import { boundsOf, clusterPoints, interpolateCamera, renderSymbol } from './markers.js';
import { symbolSpec } from '../model/symbol-spec.js';
import { escapeHTML as e, type RoomId } from './types.js';

import { updateRoomRail } from '../shell/room-rail.js';
import type { HomeManagerCard } from './home-manager-card.js';
export function mountArchitecture(this: HomeManagerCard) {
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
  const shown = this.draft.rooms.filter(
    room => hasSpaceGeometry(this.svg!, room) || this.draft!.catalog.devices.some(d => d.roomId === room.id),
  );
  updateRoomRail(this.root, shown, this.currentRoom, this.editing);
  (this.root.querySelector('.empty') as HTMLElement).hidden = this.svg.children.length > 0;
}

export function fit(this: HomeManagerCard, room: RoomId | null, animate = true) {
  if (!this.svg || !this.viewport) return;
  const r = this.viewport.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const space = room ? this.draft?.rooms.find(item => item.id === room) : undefined;
  const bounds = room ? (space ? spaceBounds(this.svg, space, this.box) : null) : this.box;
  if (!bounds) {
    this.status(t('Esta habitación no tiene una zona SVG válida. Revisá su ID en el editor de arquitectura.'));
    return;
  }
  this.currentRoom = room;
  // The whole plan ends the room view.
  if (room === null) this.roomView = false;
  this.insights?.update(this);
  this.baseScale = fitCamera(this.box, { width: r.width, height: r.height }, 24).scale;
  // A space's framing (CP8): how much of its surroundings the view keeps.
  const padding = room ? { tight: 12, normal: 34, wide: 96 }[space?.frame ?? 'normal'] : 24;
  this.moveCamera(fitCamera(bounds, { width: r.width, height: r.height }, padding), animate);
  this.root
    .querySelectorAll('[data-room]')
    .forEach(b => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.room === room)));
  this.root.querySelector('.rooms .all')?.setAttribute('aria-pressed', String(room === null));
}

export function moveCamera(this: HomeManagerCard, target: Camera, animate = true) {
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

export function frameDevices(this: HomeManagerCard, ids: string[]) {
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

export function chooseDevice(this: HomeManagerCard, ids: string[]) {
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

export function renderMarkers(this: HomeManagerCard) {
  const overlay = this.root.querySelector('.overlay');
  if (!overlay || !this.draft) return;
  overlay.innerHTML = this.draft.catalog.devices
    .filter(d => this.editing || this.enabledLayers.has(layer(d, this._hass)))
    .map(
      d =>
        `<div class="marker size-${e(d.display.size ?? 'm')} ${d.id === this.selected ? 'selected' : ''} ${this.editing && (d.mobility !== 'fixed' || this.fixedPermit === d.id) ? 'editable' : ''}" data-id="${e(d.id)}"><button type="button" class="primary" aria-label="${e(d.display.label)}" aria-keyshortcuts="Shift+Enter" title="${e(d.display.label)}"></button>${pinnedControls(d).length ? '<div class="pins"></div>' : ''}</div>`,
    )
    .join('');
  this.mountPins();
  this.groupsKey = '';
  // New buttons must receive their current position before becoming interactive.
  this.refreshState();
  this.positionMarkers();
  this.updateSelection();
}

export function queuePosition(this: HomeManagerCard) {
  cancelAnimationFrame(this.frame);
  this.frame = requestAnimationFrame(() => this.positionMarkers());
}

export function screen(this: HomeManagerCard, position: { x: number; y: number }) {
  return {
    x: this.camera.x + (this.box.x + position.x * this.box.width) * this.camera.scale,
    y: this.camera.y + (this.box.y + position.y * this.box.height) * this.camera.scale,
  };
}

export function positionMarkers(this: HomeManagerCard) {
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
        if (group.ids.includes(this.selected ?? '')) continue;
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
    marker.classList.toggle('dim', this.currentRoom !== null && d.roomId !== this.currentRoom);
    marker.style.left = `${point.x}px`;
    marker.style.top = `${point.y}px`;
  }
  for (const cluster of overlay.querySelectorAll<HTMLElement>('.cluster')) {
    const ids = cluster.dataset.ids!.split(' ');
    const points = ids.map(id => this.screen(byId.get(id)!.position));
    cluster.style.left = `${points.reduce((sum, p) => sum + p.x, 0) / points.length}px`;
    cluster.style.top = `${points.reduce((sum, p) => sum + p.y, 0) / points.length}px`;
  }
  const highlight = architecture?.querySelector<SVGSVGElement>(':scope > .room-highlight');
  if (!this.currentRoom) highlight?.remove();
  else if (this.svg && architecture && highlight?.dataset.room !== this.currentRoom) {
    highlight?.remove();
    const space = this.draft?.rooms.find(item => item.id === this.currentRoom);
    const next = space ? createSpaceHighlight(this.svg, space, this.box) : null;
    if (next) {
      next.dataset.room = this.currentRoom;
      architecture.append(next);
    }
  }
  this.positionEditor();
  this.renderNav();
  this.renderShapeEdit();
}

export function refreshState(this: HomeManagerCard) {
  this.root.querySelectorAll<HTMLElement>('.marker').forEach(m => {
    const d = this.draft?.catalog.devices.find(d => d.id === m.dataset.id);
    if (!d) return;
    const state = this.runtime.states[d.id];
    const spec = symbolSpec(d, this._hass, Date.now(), state, this.feed.alertContext);
    const confidence = state?.confidence ?? 'unknown';
    m.dataset.confidence = confidence;
    m.dataset.active = String(!!spec.ring);
    m.dataset.archetype = spec.archetype;
    m.dataset.highlight = String(spec.highlight);
    m.dataset.alert = spec.badge?.level ?? '';
    const main = m.querySelector('button.primary')!;
    const tap = spec.tap === 'control' ? tapControl(d) : null;
    const next = tap ? this.tapStep(d, tap) : -1;
    const availability = tap ? this.adapter?.getActionAvailability(tap.steps[next]?.actionId ?? '') : undefined;
    const action = tap ? stepLabel(tap, next, this.draft) : t('Abrir panel');
    main.setAttribute(
      'title',
      `${d.display.label} · ${stateText(state?.value ?? 'unknown')} · ${confidenceLabel(confidence)}${this.editing ? '' : tap && !availability?.available ? ` · ${t('Acción pendiente o no disponible')}` : ` · ${t('Tocar: {action}', { action })}`}`,
    );
    main.setAttribute(
      'aria-description',
      `${confidenceLabel(confidence)}: ${stateText(state?.value ?? 'unknown')}. ${t('Tocar: {action}. Mantener pulsado: panel.', { action })}`,
    );
    // A cycle shows the icon of the step it is in (for example on or off).
    const current = tap?.type === 'cycle' ? this.cycleCurrent(d, tap) : -1;
    const glyph = current >= 0 ? tap?.steps[current]?.icon : undefined;
    if (glyph && spec.body.icon) spec.body.icon = glyph;
    main.innerHTML = renderSymbol(spec);
    (main as HTMLElement).dataset.icon = spec.body.icon ?? '';
    // Keep selection reachable in edit mode; a tap that cannot run still opens the panel by holding.
    (main as HTMLButtonElement).disabled = !this.editing && !!tap && !availability?.available;
    for (const view of this.pins.get(d.id) ?? []) view.refresh();
  });
  const d = this.draft?.catalog.devices.find(d => d.id === this.selected);
  if (d && this.panel) {
    const s = this.runtime.states[d.id];
    if (s) this.panel.update(s);
  }
  this.updateShell();
}
