/** D22 · room view (vision §13). Pure navigation rules in plan coordinates; the card only draws them. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface NavRoom {
  id: string;
  bounds: Box;
  /** A space you pass through (a hallway): it gets no arrows and no swipes. */
  skip?: boolean;
}
export interface NavTarget {
  id: string;
  /** Radians, screen convention: 0 points right, π/2 points down. */
  angle: number;
  distance: number;
  sharesWall: boolean;
  /** 1 for the nearest target, down to 0.7 for the farthest. */
  scale: number;
  /** 1 for the nearest target, down to 0.5 for the farthest. */
  opacity: number;
}

export const MAX_ARROWS = 8;
/** Two targets closer than this in direction show one arrow: the nearer one. */
export const SAME_DIRECTION = (20 * Math.PI) / 180;
/** A swipe chooses the target within this angle of where it pushes. */
export const SWIPE_CONE = (35 * Math.PI) / 180;
/** Pulling an arrow back this far (pixels) travels. */
export const PULL_DISTANCE = 40;

export const centreOf = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
/** Smallest difference between two angles, in [0, π]. */
export function angleGap(a: number, b: number): number {
  const gap = Math.abs(a - b) % (2 * Math.PI);
  return gap > Math.PI ? 2 * Math.PI - gap : gap;
}
const contains = (box: Box, point: Point) =>
  point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;

/** Whether two rooms touch along an edge (not just a corner), within a small tolerance. */
export function sharesWall(a: Box, b: Box): boolean {
  const tolerance = 0.02 * Math.max(a.width, a.height, b.width, b.height);
  const overlap = (a1: number, a2: number, b1: number, b2: number) => Math.min(a2, b2) - Math.max(a1, b1);
  const vertical =
    (Math.abs(a.x + a.width - b.x) <= tolerance || Math.abs(b.x + b.width - a.x) <= tolerance) &&
    overlap(a.y, a.y + a.height, b.y, b.y + b.height) > tolerance;
  const horizontal =
    (Math.abs(a.y + a.height - b.y) <= tolerance || Math.abs(b.y + b.height - a.y) <= tolerance) &&
    overlap(a.x, a.x + a.width, b.x, b.x + b.width) > tolerance;
  return vertical || horizontal;
}

/** The room the view is on: the smallest one containing the point, else the one whose centre is nearest. */
export function roomInView(rooms: readonly NavRoom[], point: Point): NavRoom | null {
  const inside = rooms
    .filter(room => contains(room.bounds, point))
    .sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height);
  if (inside.length) return inside[0];
  let best: NavRoom | null = null,
    distance = Infinity;
  for (const room of rooms) {
    const centre = centreOf(room.bounds);
    const d = Math.hypot(centre.x - point.x, centre.y - point.y);
    if (d < distance) {
      best = room;
      distance = d;
    }
  }
  return best;
}

/**
 * One arrow per reachable room, pointing at its centre with its real angle. Nearer
 * rooms come first; with the same distance, the one sharing a wall. A room in nearly
 * the same direction (under 20°) as a kept one gets no arrow: it is reached past it.
 */
export function navTargets(current: NavRoom, rooms: readonly NavRoom[], hidden: readonly string[] = []): NavTarget[] {
  const from = centreOf(current.bounds);
  const candidates = rooms
    .filter(room => room.id !== current.id && !room.skip && !hidden.includes(room.id))
    .map(room => {
      const to = centreOf(room.bounds);
      return {
        id: room.id,
        angle: Math.atan2(to.y - from.y, to.x - from.x),
        distance: Math.hypot(to.x - from.x, to.y - from.y),
        sharesWall: sharesWall(current.bounds, room.bounds),
      };
    })
    .filter(candidate => candidate.distance > 0)
    .sort((a, b) =>
      Math.abs(a.distance - b.distance) <= 0.01 * Math.max(a.distance, b.distance)
        ? Number(b.sharesWall) - Number(a.sharesWall)
        : a.distance - b.distance,
    );
  const kept: typeof candidates = [];
  for (const candidate of candidates) {
    if (kept.length >= MAX_ARROWS) break;
    if (!kept.some(other => angleGap(other.angle, candidate.angle) < SAME_DIRECTION)) kept.push(candidate);
  }
  const near = kept[0]?.distance ?? 0,
    far = kept.at(-1)?.distance ?? 0;
  return kept.map(target => {
    const t = far > near ? (target.distance - near) / (far - near) : 0;
    return { ...target, scale: 1 - 0.3 * t, opacity: 1 - 0.5 * t };
  });
}

/** Where the ray from the room's centre leaves it, plus a gap: just outside the edge. */
export function exitPoint(bounds: Box, angle: number, gap: number): Point {
  const centre = centreOf(bounds);
  const dx = Math.cos(angle),
    dy = Math.sin(angle);
  const t = Math.min(
    Math.abs(dx) > 1e-9 ? bounds.width / 2 / Math.abs(dx) : Infinity,
    Math.abs(dy) > 1e-9 ? bounds.height / 2 / Math.abs(dy) : Infinity,
  );
  return { x: centre.x + dx * (t + gap), y: centre.y + dy * (t + gap) };
}

/** The target closest to a direction, within a cone. A swipe pushes the plan, so it travels against the finger. */
export function targetToward(targets: readonly NavTarget[], direction: Point, cone = SWIPE_CONE): string | null {
  if (!Math.hypot(direction.x, direction.y)) return null;
  const angle = Math.atan2(direction.y, direction.x);
  let best: NavTarget | null = null;
  for (const target of targets)
    if (angleGap(target.angle, angle) <= cone && (!best || angleGap(target.angle, angle) < angleGap(best.angle, angle)))
      best = target;
  return best?.id ?? null;
}
export const swipeTarget = (targets: readonly NavTarget[], finger: Point): string | null =>
  targetToward(targets, { x: -finger.x, y: -finger.y });

/** How far an arrow has been pulled back (against where it points), and whether that travels. */
export function pullOf(angle: number, drag: Point): { distance: number; travels: boolean } {
  const back = { x: -Math.cos(angle), y: -Math.sin(angle) };
  const distance = drag.x * back.x + drag.y * back.y;
  const aligned = Math.hypot(drag.x, drag.y) > 0 && distance >= Math.cos(Math.PI / 4) * Math.hypot(drag.x, drag.y);
  return { distance: Math.max(0, distance), travels: aligned && distance >= PULL_DISTANCE };
}
