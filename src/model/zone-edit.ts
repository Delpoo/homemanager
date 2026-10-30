import { suggestedRoomIcon } from './archetype.js';
import {
  MIN_RECT,
  boundsOfRects,
  rectsOf,
  shapeContains,
  type Point,
  type RoomShape,
  type ShapeHandle,
} from './room-shapes.js';

export { MIN_RECT };

/**
 * The zone editor's draft (roadmap 0.10): the drawing is only a background, zones are
 * rectangles that merge. Nothing here touches the plan until `applyDraft`. Pure.
 */
export const MAX_RECTS = 12;
/** How close (share of the plan) an edge must be to catch another rectangle's edge. */
export const SNAP = 0.006;

export interface ZoneRoom {
  id: string;
  label: string;
  icon?: string;
  shape?: RoomShape;
  rects?: RoomShape[];
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
  rects: RoomShape[];
  /** Its rectangles changed: on apply it stops following the SVG. */
  shapeChanged: boolean;
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

/** Every space as rectangles: its zone's current copy while it follows the SVG, else what it owns. */
export function startDraft(
  rooms: readonly ZoneRoom[],
  zoneCopies: Readonly<Record<string, (RoomShape & { rects?: RoomShape[] }) | null>>,
): ZoneDraft {
  return {
    merged: {},
    removed: [],
    zones: rooms.map(room => {
      const copy = room.shapeSource === 'app' ? null : zoneCopies[room.id];
      const rects = copy
        ? (copy.rects ?? [{ x: copy.x, y: copy.y, width: copy.width, height: copy.height }])
        : rectsOf(room);
      return {
        id: room.id,
        label: room.label,
        ...(room.icon ? { icon: room.icon } : {}),
        rects: rects.map(rect => ({ ...rect })),
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
export function addZone(draft: ZoneDraft, label: string, rect: RoomShape, taken: readonly string[]): ZoneDraft {
  const id = newZoneId(label, [...taken, ...draft.zones.map(zone => zone.id)]);
  const zone: EditZone = { id, label, rects: [rect], shapeChanged: true, labelChanged: true, isNew: true };
  return { ...draft, zones: [...draft.zones, zone] };
}
/** Adding to a zone merges: it reads as one room. At the limit the draft stays as it is. */
export function addRect(draft: ZoneDraft, id: string, rect: RoomShape): ZoneDraft {
  return change(draft, id, zone =>
    zone.rects.length >= MAX_RECTS ? zone : { ...zone, rects: [...zone.rects, rect], shapeChanged: true },
  );
}
export function updateRect(draft: ZoneDraft, id: string, index: number, rect: RoomShape): ZoneDraft {
  return change(draft, id, zone => ({
    ...zone,
    rects: zone.rects.map((item, at) => (at === index ? rect : item)),
    shapeChanged: true,
  }));
}
export function removeRect(draft: ZoneDraft, id: string, index: number): ZoneDraft {
  return change(draft, id, zone => ({
    ...zone,
    rects: zone.rects.filter((_, at) => at !== index),
    shapeChanged: true,
  }));
}
export function renameZone(draft: ZoneDraft, id: string, label: string): ZoneDraft {
  return change(draft, id, zone => ({ ...zone, label, labelChanged: true }));
}
/** Two zones become one room; the first one's devices follow. Null when they would not fit. */
export function mergeZones(draft: ZoneDraft, from: string, into: string): ZoneDraft | null {
  const source = draft.zones.find(zone => zone.id === from),
    target = draft.zones.find(zone => zone.id === into);
  if (!source || !target || from === into || source.rects.length + target.rects.length > MAX_RECTS) return null;
  const merged = { ...draft.merged, [from]: into };
  // Whatever had already merged into the first one follows it.
  for (const [key, value] of Object.entries(merged)) if (value === from) merged[key] = into;
  return {
    zones: draft.zones
      .filter(zone => zone.id !== from)
      .map(zone =>
        zone.id === into ? { ...zone, rects: [...zone.rects, ...source.rects], shapeChanged: true } : zone,
      ),
    merged,
    removed: source.isNew ? draft.removed : [...draft.removed, from],
  };
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

/** Edges catch nearby edges of other rectangles, so parts of a home fit without gaps. Size is kept when moving. */
export function snapRect(
  rect: RoomShape,
  others: readonly RoomShape[],
  handle: ShapeHandle,
  tolerance = SNAP,
): RoomShape {
  const nearest = (value: number, lines: readonly number[]) => {
    let best = value,
      gap = tolerance;
    for (const line of lines)
      if (Math.abs(line - value) <= gap) {
        best = line;
        gap = Math.abs(line - value);
      }
    return best;
  };
  const xs = others.flatMap(other => [other.x, other.x + other.width]),
    ys = others.flatMap(other => [other.y, other.y + other.height]);
  let left = rect.x,
    top = rect.y,
    right = rect.x + rect.width,
    bottom = rect.y + rect.height;
  if (handle === 'move') {
    const shift = (start: number, end: number, lines: readonly number[]) => {
      const a = nearest(start, lines) - start,
        b = nearest(end, lines) - end;
      return !a ? b : !b ? a : Math.abs(a) <= Math.abs(b) ? a : b;
    };
    const dx = shift(left, right, xs),
      dy = shift(top, bottom, ys);
    left += dx;
    right += dx;
    top += dy;
    bottom += dy;
  } else {
    if (handle.includes('w')) left = nearest(left, xs);
    if (handle.includes('e')) right = nearest(right, xs);
    if (handle.includes('n')) top = nearest(top, ys);
    if (handle.includes('s')) bottom = nearest(bottom, ys);
  }
  if (right - left < MIN_RECT || bottom - top < MIN_RECT) return rect;
  const r = (value: number) => Math.round(value * 1e6) / 1e6;
  // Rounding never pushes a rectangle past the plan's edge.
  const x = r(left),
    y = r(top);
  return { x, y, width: Math.min(r(right - left), r(1 - x)), height: Math.min(r(bottom - top), r(1 - y)) };
}

/** The zone a point falls in: when zones overlap, the smallest is the more specific one. */
export function zoneAt(draft: ZoneDraft, point: Point): EditZone | null {
  const area = (zone: EditZone) => zone.rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
  const hits = draft.zones.filter(zone => zone.rects.some(rect => shapeContains(rect, point)));
  return hits.sort((a, b) => area(a) - area(b))[0] ?? null;
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
  for (const room of next.rooms) {
    const zone = draft.zones.find(item => item.id === room.id);
    if (!zone) continue;
    if (zone.labelChanged) room.label = zone.label.trim();
    if (zone.shapeChanged) writeRects(room, zone.rects);
    rooms.push(room);
  }
  for (const zone of draft.zones)
    if (zone.isNew) {
      const label = zone.label.trim();
      const room: ZoneRoom = { id: final.get(zone.id)!, label, icon: suggestedRoomIcon(label) };
      writeRects(room, zone.rects);
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
function writeRects(room: ZoneRoom, rects: readonly RoomShape[]): void {
  delete room.rects;
  if (!rects.length) {
    delete room.shape;
    delete room.shapeSource;
    return;
  }
  room.shape = boundsOfRects(rects);
  if (rects.length > 1) room.rects = rects.map(rect => ({ ...rect }));
  room.shapeSource = 'app';
}
