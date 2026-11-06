import polygonClipping from 'polygon-clipping';

/**
 * Spaces as shapes with straight sides (0.13 plan editor). Coordinates are shares of the
 * plan (0–1). A shape is its outline plus any holes: rings of points, outer one first.
 * Pure: the editor and the plan share these rules.
 */
export type Pt = [number, number];
export type Ring = Pt[];
export type Geom = Ring[];

/** Points per ring and rings per space the plan accepts. */
export const MAX_RING_POINTS = 200;
export const MAX_RINGS = 8;

const closed = (ring: Ring): Ring => [...ring, ring[0]];
const toPolygon = (geom: Geom) => geom.map(closed) as polygonClipping.Polygon;

export function bboxOf(geoms: readonly Geom[]): { x: number; y: number; width: number; height: number } {
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity;
  for (const g of geoms)
    for (const r of g)
      for (const [x, y] of r) {
        x1 = Math.min(x1, x);
        y1 = Math.min(y1, y);
        x2 = Math.max(x2, x);
        y2 = Math.max(y2, y);
      }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
export const ringArea = (r: Ring): number =>
  r.reduce((a, [x, y], i) => {
    const [u, v] = r[(i + 1) % r.length];
    return a + x * v - u * y;
  }, 0) / 2;
/** Area as a share of the plan's area: outline minus holes. */
export const areaOf = (g: Geom): number =>
  g.reduce((a, r, i) => a + (i === 0 ? Math.abs(ringArea(r)) : -Math.abs(ringArea(r))), 0);
const inRing = (r: Ring, [px, py]: Pt): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i],
      [xj, yj] = r[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
/** Inside the outline and outside its holes. */
export const geomContains = (g: Geom, p: Pt): boolean => g.reduce((acc, r) => (inRing(r, p) ? !acc : acc), false);
export const segDist = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
export const edgesOf = (g: Geom): [Pt, Pt][] => g.flatMap(r => r.map((p, i): [Pt, Pt] => [p, r[(i + 1) % r.length]]));

/** Where a space's name goes: the point inside it farthest from its edges. */
export function labelPoint(g: Geom): Pt {
  const b = bboxOf([g]);
  const edges = edgesOf(g);
  const clearance = (p: Pt) => Math.min(...edges.map(([a, c]) => segDist(p, a, c)));
  let best: Pt = [b.x + b.width / 2, b.y + b.height / 2];
  let bestD = geomContains(g, best) ? clearance(best) : -1;
  for (let i = 1; i < 14; i++)
    for (let j = 1; j < 14; j++) {
      const p: Pt = [b.x + (b.width * i) / 14, b.y + (b.height * j) / 14];
      if (!geomContains(g, p)) continue;
      const d = clearance(p);
      if (d > bestD * 1.02) {
        bestD = d;
        best = p;
      }
    }
  return best;
}

const round = (v: number): number => Math.round(v * 1e6) / 1e6;
/** Rounded, without repeated points or points in the middle of a straight side: a
 * merged outline keeps no trace of the lines that were inside. */
export function tidyRing(r: Ring): Ring {
  const pts: Ring = r.map(([x, y]) => [round(x), round(y)]);
  if (pts.length > 1 && pts[0][0] === pts.at(-1)![0] && pts[0][1] === pts.at(-1)![1]) pts.pop();
  for (let changed = true; changed && pts.length > 3; ) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length],
        b = pts[i],
        c = pts[(i + 1) % pts.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < 1e-9 || (a[0] === b[0] && a[1] === b[1])) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}
export const tidyGeom = (g: Geom): Geom => g.map(tidyRing).filter(r => r.length >= 3);
/** Pieces too small to be a space (a sliver from a cut) are dropped. */
const MIN_AREA = 1e-5;
const piecesOf = (multi: polygonClipping.MultiPolygon): Geom[] =>
  multi.map(p => tidyGeom(p as Geom)).filter(g => g.length && areaOf(g) > MIN_AREA);

function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [],
    up: Pt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo.at(-2)!, lo.at(-1)!, q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of p.reverse()) {
    while (up.length >= 2 && cross(up.at(-2)!, up.at(-1)!, q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const segSeg = (a: Pt, b: Pt, c: Pt, d: Pt) =>
  Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
/**
 * What fills the gap between two shapes that do not touch: the space between the sides
 * that face each other (a wall between two rooms); with no sides facing, what lies
 * between their nearest borders.
 */
export function bridge(A: Geom, B: Geom): Geom | null {
  let min = Infinity;
  const pairs: { a: Pt; b: Pt; c: Pt; d: Pt; dd: number }[] = [];
  for (const [a, b] of edgesOf([A[0]]))
    for (const [c, d] of edgesOf([B[0]])) {
      const dd = segSeg(a, b, c, d);
      pairs.push({ a, b, c, d, dd });
      min = Math.min(min, dd);
    }
  let best: { q: (typeof pairs)[number]; lo: number; hi: number; over: number } | null = null;
  for (const q of pairs) {
    if (q.dd > min + 1e-4) continue;
    const ux = q.b[0] - q.a[0],
      uy = q.b[1] - q.a[1],
      L = Math.hypot(ux, uy);
    const vx = q.d[0] - q.c[0],
      vy = q.d[1] - q.c[1],
      M = Math.hypot(vx, vy);
    if (L < 1e-9 || M < 1e-9 || Math.abs(ux * vy - uy * vx) / (L * M) > 0.02) continue;
    const t = (p: Pt) => ((p[0] - q.a[0]) * ux + (p[1] - q.a[1]) * uy) / (L * L);
    const lo = Math.max(0, Math.min(t(q.c), t(q.d))),
      hi = Math.min(1, Math.max(t(q.c), t(q.d)));
    const over = (hi - lo) * L;
    if (over > 1e-4 && (!best || over > best.over)) best = { q, lo, hi, over };
  }
  if (best) {
    const { q, lo, hi } = best;
    const P = (k: number): Pt => [q.a[0] + (q.b[0] - q.a[0]) * k, q.a[1] + (q.b[1] - q.a[1]) * k];
    const proj = (p: Pt): Pt => {
      const vx = q.d[0] - q.c[0],
        vy = q.d[1] - q.c[1];
      const k = ((p[0] - q.c[0]) * vx + (p[1] - q.c[1]) * vy) / (vx * vx + vy * vy);
      return [q.c[0] + vx * k, q.c[1] + vy * k];
    };
    const h = hull([P(lo), P(hi), proj(P(lo)), proj(P(hi))]);
    if (h.length >= 3) return [h];
  }
  const near = pairs.find(q => q.dd <= min + 1e-4);
  const h = near ? hull([near.a, near.b, near.c, near.d]) : [];
  return h.length >= 3 ? [h] : null;
}
/** Unir: always one shape. Pieces that do not touch are joined across the gap between them. */
export function unionAll(geoms: readonly Geom[]): Geom | null {
  if (!geoms.length) return null;
  let res = polygonClipping.union(toPolygon(geoms[0]), ...geoms.slice(1).map(toPolygon));
  for (let guard = 0; res.length > 1 && guard < 16; guard++) {
    let pick: { d: number; i: number; j: number } | null = null;
    for (let i = 0; i < res.length; i++)
      for (let j = i + 1; j < res.length; j++) {
        let d = Infinity;
        for (const [a, b] of edgesOf([res[i][0] as Ring]))
          for (const [c, e] of edgesOf([res[j][0] as Ring])) d = Math.min(d, segSeg(a, b, c, e));
        if (!pick || d < pick.d) pick = { d, i, j };
      }
    const br = bridge([res[pick!.i][0] as Ring], [res[pick!.j][0] as Ring]);
    if (!br) break;
    res = polygonClipping.union(res, toPolygon(br));
  }
  const pieces = piecesOf(res);
  return pieces.sort((a, b) => areaOf(b) - areaOf(a))[0] ?? null;
}
/** Restar: the first shape minus what the others cover. Pieces, largest first. */
export function subtract(base: Geom, others: readonly Geom[]): Geom[] {
  return piecesOf(polygonClipping.difference(toPolygon(base), ...others.map(toPolygon))).sort(
    (a, b) => areaOf(b) - areaOf(a),
  );
}
/** Intersecar: only what every shape covers. */
export function intersect(geoms: readonly Geom[]): Geom | null {
  if (geoms.length < 2) return null;
  return (
    piecesOf(polygonClipping.intersection(toPolygon(geoms[0]), ...geoms.slice(1).map(toPolygon))).sort(
      (a, b) => areaOf(b) - areaOf(a),
    )[0] ?? null
  );
}
/** Whether the stroke from a to b crosses the shape's border. */
export function strokeCrosses(g: Geom, a: Pt, b: Pt): boolean {
  return edgesOf(g).some(([p, q]) => {
    const den = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]);
    if (Math.abs(den) < 1e-12) return false;
    const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / den;
    const u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  });
}
/** Cortar con un trazo: the shape on each side of the line through a and b. Fewer than two
 * pieces means the stroke did not cut it. Largest first. */
export function cutGeom(g: Geom, a: Pt, b: Pt): Geom[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-6) return [g];
  const d: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len],
    n: Pt = [-d[1], d[0]],
    L = 10;
  const half = (s: number): Geom => [
    [
      [a[0] - d[0] * L, a[1] - d[1] * L],
      [a[0] + d[0] * L, a[1] + d[1] * L],
      [a[0] + d[0] * L + s * n[0] * L, a[1] + d[1] * L + s * n[1] * L],
      [a[0] - d[0] * L + s * n[0] * L, a[1] - d[1] * L + s * n[1] * L],
    ],
  ];
  return [
    ...piecesOf(polygonClipping.intersection(toPolygon(g), toPolygon(half(1)))),
    ...piecesOf(polygonClipping.intersection(toPolygon(g), toPolygon(half(-1)))),
  ].sort((x, y) => areaOf(y) - areaOf(x));
}
export const mapGeom = (g: Geom, f: (p: Pt) => Pt): Geom => g.map(r => r.map(p => f(p)));
/** A rectangle as a shape. */
export const rectGeom = (x: number, y: number, width: number, height: number): Geom => [
  [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ],
];
/** Several rectangles (the shapes saved before 0.13) as one outline. */
export const geomOfRects = (rects: readonly { x: number; y: number; width: number; height: number }[]): Geom | null =>
  unionAll(rects.map(r => rectGeom(r.x, r.y, r.width, r.height)));
/** Inside the plan, at most so many points; null when it cannot be a space. */
export function fitGeom(g: Geom): Geom | null {
  const clipped = intersect([g, rectGeom(0, 0, 1, 1)]);
  if (!clipped) return null;
  const rings = clipped.slice(0, MAX_RINGS).filter(r => r.length <= MAX_RING_POINTS);
  return rings.length && rings[0] === clipped[0] ? rings : null;
}
/** SVG path data, for the plan or the editor. */
export const pathOf = (g: Geom, sx = 1, sy = 1, ox = 0, oy = 0): string =>
  g.map(r => 'M' + r.map(([x, y]) => `${ox + x * sx} ${oy + y * sy}`).join('L') + 'Z').join('');
