/** D22: spaces own their shape. Pure rules; measuring SVG zones stays in card/geometry. */
export interface RoomShape {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ShapedRoom {
  id: string;
  /** The space's rectangle; with `rects`, the box around them. */
  shape?: RoomShape;
  /** A zone of merged rectangles: an L is two. */
  rects?: RoomShape[];
  shapeSource?: 'svg' | 'app';
}
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

/** Plan coordinates live on a fine grid (a millionth of the plan), so a drag never stores endless decimals. */
export const snapToGrid = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 1e6) / 1e6;

/** A shape edited in the app wins over any SVG zone, now and after every import. */
export const ownsShape = (room: ShapedRoom): boolean => room.shapeSource === 'app' && !!room.shape;

/** A zone's rectangles: its merged parts, else its one shape. */
export const rectsOf = (room: ShapedRoom): RoomShape[] => room.rects ?? (room.shape ? [room.shape] : []);
export const roomContains = (room: ShapedRoom, point: Point): boolean =>
  rectsOf(room).some(rect => shapeContains(rect, point));

export function shapeContains(shape: RoomShape, point: Point): boolean {
  return (
    point.x >= shape.x && point.x <= shape.x + shape.width && point.y >= shape.y && point.y <= shape.y + shape.height
  );
}

/** Normalized shape → plan (viewBox) coordinates. */
export function shapeToPlan(shape: RoomShape, box: Box): Box {
  return {
    x: box.x + shape.x * box.width,
    y: box.y + shape.y * box.height,
    width: shape.width * box.width,
    height: shape.height * box.height,
  };
}

/** Plan bounds → a normalized shape clipped to the plan, or null when nothing is left. */
export function planToShape(bounds: Box, box: Box): RoomShape | null {
  if (![bounds.x, bounds.y, bounds.width, bounds.height, box.width, box.height].every(Number.isFinite)) return null;
  if (box.width <= 0 || box.height <= 0) return null;
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  const left = Math.max(0, (bounds.x - box.x) / box.width),
    top = Math.max(0, (bounds.y - box.y) / box.height),
    right = Math.min(1, (bounds.x + bounds.width - box.x) / box.width),
    bottom = Math.min(1, (bounds.y + bounds.height - box.y) / box.height);
  const shape = { x: round(left), y: round(top), width: round(right - left), height: round(bottom - top) };
  if (shape.width <= 0 || shape.height <= 0) return null;
  // Rounding never pushes a shape past the plan's edge.
  shape.width = Math.min(shape.width, round(1 - shape.x));
  shape.height = Math.min(shape.height, round(1 - shape.y));
  return shape;
}

/**
 * Which space a point falls in. `zoneHits` are the spaces whose SVG zone contains it
 * (exact geometry); spaces with their own shape answer by that shape instead, and so
 * does a space whose zone is gone but kept a copy. A shape is the more specific answer
 * (a room drawn inside another), and between shapes the smallest wins. Ties and
 * overlapping zones give no answer, as before.
 */
export function roomAtPoint(
  rooms: readonly ShapedRoom[],
  point: Point,
  zoneHits: readonly string[],
  zoneIds: ReadonlySet<string>,
): string | null {
  const byShape = rooms.filter(
    room => room.shape && (ownsShape(room) || !zoneIds.has(room.id)) && roomContains(room, point),
  );
  if (!byShape.length) {
    const byZone = zoneHits.filter(id => rooms.some(room => room.id === id && !ownsShape(room)));
    return byZone.length === 1 ? byZone[0] : null;
  }
  const area = (room: ShapedRoom) => rectsOf(room).reduce((sum, rect) => sum + rect.width * rect.height, 0);
  const sorted = [...byShape].sort((a, b) => area(a) - area(b));
  return sorted.length > 1 && area(sorted[0]) === area(sorted[1]) ? null : sorted[0].id;
}

/** What an import keeps of a zone: the box around it and, when it is not a plain rectangle, its parts. */
export type ZoneCopy = RoomShape & { rects?: RoomShape[] };

/**
 * After an import: every space that follows the SVG takes a copy of its zone, so a
 * later plan without that zone loses nothing. Shapes edited in the app never change,
 * and a space without a zone keeps whatever it had.
 */
export function withZoneShapes<T extends ShapedRoom>(
  rooms: readonly T[],
  zoneShapes: Readonly<Record<string, ZoneCopy | null>>,
): T[] {
  return rooms.map(room => {
    const zone = zoneShapes[room.id];
    if (ownsShape(room) || !zone) return room;
    const { rects, ...shape } = zone;
    const { rects: _old, ...rest } = room;
    return { ...rest, shape, ...(rects ? { rects: rects.map(rect => ({ ...rect })) } : {}), shapeSource: 'svg' } as T;
  });
}

/** A corner or edge handle of the shape editor, or the whole shape. */
export type ShapeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';
/** The smallest shape, as a share of the plan. */
export const MIN_RECT = 0.02;

/** Moves or resizes a normalized shape by a normalized offset; it stays inside the plan. Pure. */
export function dragShape(shape: RoomShape, handle: ShapeHandle, dx: number, dy: number): RoomShape {
  let left = shape.x,
    top = shape.y,
    right = shape.x + shape.width,
    bottom = shape.y + shape.height;
  if (handle === 'move') {
    const x = Math.min(1 - shape.width, Math.max(0, shape.x + dx)),
      y = Math.min(1 - shape.height, Math.max(0, shape.y + dy));
    return round({ x, y, width: shape.width, height: shape.height });
  }
  if (handle.includes('w')) left = Math.min(right - MIN_RECT, Math.max(0, left + dx));
  if (handle.includes('e')) right = Math.max(left + MIN_RECT, Math.min(1, right + dx));
  if (handle.includes('n')) top = Math.min(bottom - MIN_RECT, Math.max(0, top + dy));
  if (handle.includes('s')) bottom = Math.max(top + MIN_RECT, Math.min(1, bottom + dy));
  return round({ x: left, y: top, width: right - left, height: bottom - top });
}
function round(shape: RoomShape): RoomShape {
  const r = (value: number) => Math.round(value * 1e6) / 1e6;
  const x = r(shape.x),
    y = r(shape.y);
  return { x, y, width: Math.min(r(shape.width), r(1 - x)), height: Math.min(r(shape.height), r(1 - y)) };
}

/** The box around some rectangles. */
export function boundsOfRects(rects: readonly RoomShape[]): RoomShape {
  const left = Math.min(...rects.map(rect => rect.x)),
    top = Math.min(...rects.map(rect => rect.y)),
    right = Math.max(...rects.map(rect => rect.x + rect.width)),
    bottom = Math.max(...rects.map(rect => rect.y + rect.height));
  return round({ x: left, y: top, width: right - left, height: bottom - top });
}

/**
 * The outline of merged rectangles, as segments: seams between them disappear, so an L
 * reads as one room. Works in whatever units the rectangles are in.
 */
export function unionOutline(rects: readonly Box[]): [Point, Point][] {
  const xs = [...new Set(rects.flatMap(rect => [rect.x, rect.x + rect.width]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap(rect => [rect.y, rect.y + rect.height]))].sort((a, b) => a - b);
  const covered = (column: number, row: number) => {
    if (column < 0 || row < 0 || column >= xs.length - 1 || row >= ys.length - 1) return false;
    const x = (xs[column] + xs[column + 1]) / 2,
      y = (ys[row] + ys[row + 1]) / 2;
    return rects.some(rect => shapeContains(rect, { x, y }));
  };
  const segments: [Point, Point][] = [];
  for (let column = 0; column < xs.length - 1; column++)
    for (let row = 0; row < ys.length - 1; row++) {
      if (!covered(column, row)) continue;
      const left = xs[column],
        right = xs[column + 1],
        top = ys[row],
        bottom = ys[row + 1];
      if (!covered(column, row - 1))
        segments.push([
          { x: left, y: top },
          { x: right, y: top },
        ]);
      if (!covered(column, row + 1))
        segments.push([
          { x: left, y: bottom },
          { x: right, y: bottom },
        ]);
      if (!covered(column - 1, row))
        segments.push([
          { x: left, y: top },
          { x: left, y: bottom },
        ]);
      if (!covered(column + 1, row))
        segments.push([
          { x: right, y: top },
          { x: right, y: bottom },
        ]);
    }
  return segments;
}

/**
 * Rectangles from a grid of filled cells: runs on each row, stacked while the next row
 * has the same run. An L becomes two. In cell units; the caller scales them to the plan.
 */
export function rectsFromCells(cells: readonly (readonly boolean[])[]): Box[] {
  const open = new Map<string, Box>();
  const done: Box[] = [];
  cells.forEach((row, y) => {
    const runs = new Set<string>();
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let end = x;
      while (end + 1 < row.length && row[end + 1]) end++;
      const key = `${x}:${end}`;
      runs.add(key);
      const growing = open.get(key);
      if (growing) growing.height += 1;
      else open.set(key, { x, y, width: end - x + 1, height: 1 });
      x = end;
    }
    for (const [key, rect] of open)
      if (!runs.has(key)) {
        done.push(rect);
        open.delete(key);
      }
  });
  return [...done, ...open.values()];
}
