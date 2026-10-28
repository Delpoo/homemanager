/** Marker layout in screen space. Pure and deterministic, so the same plan and
 * zoom always produce the same groups (no flicker while panning). */

export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}
export interface MarkerGroup {
  ids: string[];
  x: number;
  y: number;
}

/**
 * Greedy proximity clustering: points are visited in input order and join the
 * first group whose centre is closer than `distance`; the centre is the running
 * mean. A spatial hash keeps it near-linear for the sizes a home plan has.
 */
export function clusterPoints(points: ScreenPoint[], distance: number): MarkerGroup[] {
  if (!(distance > 0)) return points.map(point => ({ ids: [point.id], x: point.x, y: point.y }));
  const groups: (MarkerGroup & { sx: number; sy: number })[] = [];
  const grid = new Map<string, number[]>();
  const cell = (x: number, y: number) => `${Math.floor(x / distance)}:${Math.floor(y / distance)}`;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const cx = Math.floor(point.x / distance),
      cy = Math.floor(point.y / distance);
    let best = -1,
      bestDistance = distance;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const index of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const group = groups[index];
          const d = Math.hypot(group.x - point.x, group.y - point.y);
          if (d < bestDistance) {
            best = index;
            bestDistance = d;
          }
        }
    if (best < 0) {
      groups.push({ ids: [point.id], x: point.x, y: point.y, sx: point.x, sy: point.y });
      const key = cell(point.x, point.y);
      grid.set(key, [...(grid.get(key) ?? []), groups.length - 1]);
    } else {
      const group = groups[best];
      const before = cell(group.x, group.y);
      group.ids.push(point.id);
      group.sx += point.x;
      group.sy += point.y;
      group.x = group.sx / group.ids.length;
      group.y = group.sy / group.ids.length;
      const after = cell(group.x, group.y);
      if (after !== before) {
        grid.set(
          before,
          (grid.get(before) ?? []).filter(index => index !== best),
        );
        grid.set(after, [...(grid.get(after) ?? []), best]);
      }
    }
  }
  return groups.map(({ ids, x, y }) => ({ ids, x, y }));
}

/** Bounds (in plan coordinates) that frame a set of normalized positions. A
 * minimum size keeps devices at the same spot from producing an infinite zoom. */
export function boundsOf(
  positions: { x: number; y: number }[],
  box: { x: number; y: number; width: number; height: number },
  minimum: number,
): { x: number; y: number; width: number; height: number } {
  const xs = positions.map(p => box.x + p.x * box.width),
    ys = positions.map(p => box.y + p.y * box.height);
  let x = Math.min(...xs),
    y = Math.min(...ys),
    width = Math.max(...xs) - x,
    height = Math.max(...ys) - y;
  if (width < minimum) {
    x -= (minimum - width) / 2;
    width = minimum;
  }
  if (height < minimum) {
    y -= (minimum - height) / 2;
    height = minimum;
  }
  return { x, y, width, height };
}

/** Ease-out interpolation between two cameras, for framing animations. */
export function interpolateCamera(
  from: { x: number; y: number; scale: number },
  to: { x: number; y: number; scale: number },
  progress: number,
) {
  const p = 1 - Math.pow(1 - Math.min(1, Math.max(0, progress)), 3);
  return {
    x: from.x + (to.x - from.x) * p,
    y: from.y + (to.y - from.y) * p,
    scale: from.scale + (to.scale - from.scale) * p,
  };
}
