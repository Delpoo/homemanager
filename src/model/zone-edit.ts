import { suggestedRoomIcon } from './archetype.js';
import { rectsOf, type Point, type RoomShape } from './room-shapes.js';
import {
  areaOf,
  bboxOf,
  cutGeom,
  fitGeom,
  geomContains,
  geomOfRects,
  intersect,
  strokeCrosses,
  subtract,
  tidyGeom,
  unionAll,
  type Geom,
  type Pt,
} from './polygon.js';

/**
 * The plan editor's draft (0.13): every space is a shape with straight sides, edited like
 * in a drawing program (unir, restar, intersecar, cortar con un trazo, puntos). The drawing
 * is only a background. Nothing here touches the plan until `applyDraft`. Pure.
 */
export const MIN_RECT = 0.01;

export interface ZoneRoom {
  id: string;
  label: string;
  icon?: string;
  shape?: RoomShape;
  rects?: RoomShape[];
  outline?: [number, number][][];
  shapeSource?: 'svg' | 'app';
}
export interface ZoneDevice {
  id: string;
  roomId: string | null;
  position: Point;
  display: { label: string };
}
export interface EditZone {
  id: string;
  label: string;
  icon?: string;
  /** Outline, then holes; empty when the space has no shape yet. */
  geom: Geom;
  /** Its shape changed: on apply it stops following the SVG. */
  shapeChanged: boolean;
  /** Its shape is a copy of an SVG zone. */
  fromDrawing?: boolean;
  labelChanged: boolean;
  isNew: boolean;
}
export interface ZoneDraft {
  zones: EditZone[];
  /** Spaces merged away, and where their devices go. */
  merged: Record<string, string>;
  removed: string[];
}
export interface DeviceMove {
  deviceId: string;
  label: string;
  from: string | null;
  to: string | null;
}

/** A space's shape now: its outline, else its rectangles as one outline. */
export function geomOfRoom(room: Pick<ZoneRoom, 'outline' | 'rects' | 'shape'>): Geom {
  if (room.outline) return room.outline.map(ring => ring.map(([x, y]): Pt => [x, y]));
  const rects = rectsOf({ id: '', ...room });
  return rects.length ? (geomOfRects(rects) ?? []) : [];
}

/** Every space as a shape: its zone's current copy while it follows the SVG, else what it owns. */
export function startDraft(
  rooms: readonly ZoneRoom[],
  zoneCopies: Readonly<Record<string, (RoomShape & { rects?: RoomShape[] }) | null>>,
): ZoneDraft {
  return {
    merged: {},
    removed: [],
    zones: rooms.map(room => {
      const copy = room.shapeSource === 'app' ? null : zoneCopies[room.id];
      const geom = copy ? (geomOfRects(copy.rects ?? [copy]) ?? []) : geomOfRoom(room);
      return {
        id: room.id,
        label: room.label,
        ...(room.icon ? { icon: room.icon } : {}),
        geom,
        ...(copy ? { fromDrawing: true } : {}),
        shapeChanged: false,
        labelChanged: false,
        isNew: false,
      };
    }),
  };
}

/** A stable, readable ID for a new space: its name in kebab-case, unique in the plan. */
export function newZoneId(label: string, taken: readonly string[]): string {
  const base =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'espacio';
  let id = base,
    n = 2;
  while (taken.includes(id)) id = `${base}-${n++}`;
  return id;
}

const change = (draft: ZoneDraft, id: string, update: (zone: EditZone) => EditZone): ZoneDraft => ({
  ...draft,
  zones: draft.zones.map(zone => (zone.id === id ? update(zone) : zone)),
});
/** A new space with this shape, last (on top). */
export function addZone(draft: ZoneDraft, label: string, geom: Geom, taken: readonly string[]): ZoneDraft {
  const id = newZoneId(label, [...taken, ...draft.zones.map(zone => zone.id)]);
  const zone: EditZone = { id, label, geom, shapeChanged: true, labelChanged: true, isNew: true };
  return { ...draft, zones: [...draft.zones, zone] };
}
export function setGeom(draft: ZoneDraft, id: string, geom: Geom): ZoneDraft {
  return change(draft, id, zone => ({ ...zone, geom, shapeChanged: true }));
}
export function renameZone(draft: ZoneDraft, id: string, label: string): ZoneDraft {
  return change(draft, id, zone => ({ ...zone, label, labelChanged: true }));
}
export function removeZone(draft: ZoneDraft, id: string): ZoneDraft {
  const zone = draft.zones.find(item => item.id === id);
  if (!zone) return draft;
  return {
    ...draft,
    zones: draft.zones.filter(item => item.id !== id),
    removed: zone.isNew ? draft.removed : [...draft.removed, id],
  };
}
/** The others disappear into `into`; whatever had merged into them follows. */
function absorb(draft: ZoneDraft, into: string, others: readonly string[]): ZoneDraft {
  const merged = { ...draft.merged };
  let removed = draft.removed;
  for (const from of others) {
    merged[from] = into;
    for (const [key, value] of Object.entries(merged)) if (value === from) merged[key] = into;
    const zone = draft.zones.find(item => item.id === from);
    if (zone && !zone.isNew) removed = [...removed, from];
  }
  return { zones: draft.zones.filter(zone => !others.includes(zone.id)), merged, removed };
}
/** Unir: one shape, one outline; the first space keeps its name, the others' devices follow it.
 * Shapes that do not touch are joined across the gap between them. Null when nothing to join. */
export function unionZones(draft: ZoneDraft, ids: readonly string[]): ZoneDraft | null {
  const zones = ids.map(id => draft.zones.find(zone => zone.id === id)).filter(zone => zone?.geom.length) as EditZone[];
  if (zones.length < 2) return null;
  const geom = unionAll(zones.map(zone => zone.geom));
  const fitted = geom && fitGeom(geom);
  if (!fitted) return null;
  return absorb(
    setGeom(draft, zones[0].id, fitted),
    zones[0].id,
    zones.slice(1).map(zone => zone.id),
  );
}
/** Restar: the first space loses what the others cover; they stay as they are. Pieces left
 * apart become spaces of their own. Null when nothing would be left. */
export function subtractZones(draft: ZoneDraft, ids: readonly string[], taken: readonly string[]): ZoneDraft | null {
  const [first, ...rest] = ids.map(id => draft.zones.find(zone => zone.id === id)).filter(Boolean) as EditZone[];
  if (!first || !rest.length) return null;
  const pieces = subtract(
    first.geom,
    rest.map(zone => zone.geom),
  );
  if (!pieces.length) return null;
  let next = setGeom(draft, first.id, pieces[0]);
  pieces.slice(1).forEach((geom, index) => {
    next = addZone(next, `${first.label} ${index + 2}`, geom, taken);
  });
  return next;
}
/** Intersecar: the first space keeps only what all of them share; the others disappear into it. */
export function intersectZones(draft: ZoneDraft, ids: readonly string[]): ZoneDraft | null {
  const zones = ids.map(id => draft.zones.find(zone => zone.id === id)).filter(Boolean) as EditZone[];
  if (zones.length < 2) return null;
  const geom = intersect(zones.map(zone => zone.geom));
  if (!geom) return null;
  return absorb(
    setGeom(draft, zones[0].id, geom),
    zones[0].id,
    zones.slice(1).map(zone => zone.id),
  );
}
/** Cortar con un trazo: every space the stroke crosses (only the chosen ones, when any) ends in
 * pieces; the largest keeps the space, the rest are new spaces next to it. */
export function cutZones(
  draft: ZoneDraft,
  a: Pt,
  b: Pt,
  only: readonly string[],
  taken: readonly string[],
): { draft: ZoneDraft; pieces: string[] } | null {
  const shaped = draft.zones.filter(zone => zone.geom.length && strokeCrosses(zone.geom, a, b));
  // Only the chosen spaces, unless the stroke crosses none of them.
  const chosenHit = shaped.filter(zone => only.includes(zone.id));
  const hit = chosenHit.length ? chosenHit : shaped;
  let next = draft;
  const pieces: string[] = [];
  for (const zone of hit) {
    const parts = cutGeom(zone.geom, a, b);
    if (parts.length < 2) continue;
    next = setGeom(next, zone.id, parts[0]);
    pieces.push(zone.id);
    parts.slice(1).forEach((geom, index) => {
      next = addZone(next, `${zone.label} ${index + 2}`, geom, taken);
      pieces.push(next.zones.at(-1)!.id);
    });
  }
  return pieces.length ? { draft: next, pieces } : null;
}
/** Moves, scales, turns or flips spaces: any change of their points that keeps them inside the plan. */
export function transformZones(draft: ZoneDraft, ids: readonly string[], f: (p: Pt) => Pt): ZoneDraft {
  let next = draft;
  for (const id of ids) {
    const zone = next.zones.find(item => item.id === id);
    if (!zone?.geom.length) continue;
    const geom = fitGeom(tidyGeom(zone.geom.map(ring => ring.map(f))));
    if (geom) next = setGeom(next, id, geom);
  }
  return next;
}
/** Spaces drawn later are on top; front and back change that order. */
export function reorderZones(draft: ZoneDraft, ids: readonly string[], to: 'front' | 'back'): ZoneDraft {
  const chosen = draft.zones.filter(zone => ids.includes(zone.id));
  const rest = draft.zones.filter(zone => !ids.includes(zone.id));
  return { ...draft, zones: to === 'front' ? [...rest, ...chosen] : [...chosen, ...rest] };
}
export const zoneBox = (zones: readonly EditZone[]) => bboxOf(zones.map(zone => zone.geom));

/** The space a point falls in: when spaces overlap, the smallest is the more specific one. */
export function zoneAt(draft: ZoneDraft, point: Point): EditZone | null {
  const hits = draft.zones.filter(zone => zone.geom.length && geomContains(zone.geom, [point.x, point.y]));
  return hits.sort((a, b) => areaOf(a.geom) - areaOf(b.geom))[0] ?? null;
}

/**
 * Which devices the draft moves, to show before applying. Only what the edit caused: a
 * mismatch between two untouched zones is the diagnosis's business, not this one's.
 */
export function deviceMoves(devices: readonly ZoneDevice[], draft: ZoneDraft): DeviceMove[] {
  const changed = new Set(draft.zones.filter(zone => zone.shapeChanged).map(zone => zone.id));
  return devices.flatMap(device => {
    const from = device.roomId;
    const at = zoneAt(draft, device.position)?.id ?? null;
    const gone = !!from && draft.removed.includes(from);
    const target = at ?? (from ? (draft.merged[from] ?? (gone ? null : from)) : null);
    if (target === from) return [];
    const caused = gone || (!!from && changed.has(from)) || (!!target && changed.has(target));
    return caused ? [{ deviceId: device.id, label: device.display.label, from, to: target }] : [];
  });
}

/** The plan with the draft in it. A device whose space is gone always leaves it, chosen or not. */
export function applyDraft<
  T extends {
    rooms: ZoneRoom[];
    catalog: { devices: ZoneDevice[] };
  },
>(configuration: T, draft: ZoneDraft, moves: readonly DeviceMove[]): T {
  const next = structuredClone(configuration);
  const rooms: ZoneRoom[] = [];
  // A new space takes its ID from the name it ended up with, never from a space that was here.
  const final = new Map<string, string>();
  const taken = next.rooms.map(room => room.id);
  for (const zone of draft.zones)
    if (zone.isNew) {
      const id = newZoneId(zone.label, taken);
      final.set(zone.id, id);
      taken.push(id);
    }
  const named = (id: string | null) => (id && final.get(id)) ?? id;
  // The rooms keep their order (it is the order of the space rail); new ones go last.
  for (const room of next.rooms) {
    const zone = draft.zones.find(item => item.id === room.id);
    if (!zone) continue;
    if (zone.labelChanged) room.label = zone.label.trim();
    if (zone.shapeChanged) writeGeom(room, zone.geom);
    rooms.push(room);
  }
  for (const zone of draft.zones)
    if (zone.isNew) {
      const label = zone.label.trim();
      const room: ZoneRoom = { id: final.get(zone.id)!, label, icon: suggestedRoomIcon(label) };
      writeGeom(room, zone.geom);
      rooms.push(room);
    }
  next.rooms = rooms as T['rooms'];
  const exists = new Set(rooms.map(room => room.id));
  for (const device of next.catalog.devices) {
    const move = moves.find(item => item.deviceId === device.id);
    if (move) device.roomId = named(move.to);
    if (device.roomId && !exists.has(device.roomId)) device.roomId = named(draft.merged[device.roomId] ?? null);
  }
  return next;
}
const r6 = (value: number) => Math.round(value * 1e6) / 1e6;
function writeGeom(room: ZoneRoom, geom: Geom): void {
  delete room.rects;
  delete room.outline;
  if (!geom.length) {
    delete room.shape;
    delete room.shapeSource;
    return;
  }
  const box = bboxOf([geom]);
  room.shape = { x: r6(box.x), y: r6(box.y), width: r6(box.width), height: r6(box.height) };
  room.outline = geom.map(ring => ring.map(([x, y]): [number, number] => [r6(x), r6(y)]));
  room.shapeSource = 'app';
}
