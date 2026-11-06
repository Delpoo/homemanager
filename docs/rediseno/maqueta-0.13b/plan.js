/* ═════════ 2 · Editor del plano ═════════
   Formas de lados rectos (rectángulos o polígonos). Cada forma es un espacio.
   Operaciones como en un programa de dibujo: unir (un solo contorno), restar,
   intersecar, cortar con un trazo, editar puntos, mover, escalar, girar, alinear. */
const UM = 0.02; // metros por unidad: el plano mide 12 × 8 m
const fm = v => (v * UM).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fm2 = v => (v * UM * UM).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const SPC = ['var(--sp1)', 'var(--sp2)', 'var(--sp3)', 'var(--sp4)', 'var(--sp5)', 'var(--sp6)', 'var(--sp7)'];
const rectG = (x, y, w, h) => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]];
const PE0 = () => [
  { id: 'a1', name: 'Living', color: 'var(--sp1)', geom: [[[24, 24], [296, 24], [296, 226], [196, 226], [196, 376], [24, 376]]] },
  { id: 'a2', name: 'Cocina', color: 'var(--sp2)', geom: rectG(204, 234, 92, 142) },
  { id: 'a3', name: 'Dormitorio', color: 'var(--sp3)', geom: rectG(304, 24, 272, 202) },
  { id: 'a7', name: 'Vestidor', color: 'var(--sp7)', geom: rectG(486, 120, 90, 106) },
  { id: 'a4', name: 'Baño', color: 'var(--sp4)', geom: rectG(304, 234, 122, 142) },
  { id: 'a5', name: 'Balcón', color: 'var(--sp5)', geom: rectG(446, 250, 130, 126) },
];
const PE = { shapes: PE0(), sel: [], tool: 'select', hist: [], fut: [], vx: 0, vy: 0, zoom: 1, snap: true, img: true, imgOp: 0.6, vsel: null, drag: null, draft: null, poly: null, hover: null, guides: [], rename: null, pop: null, n: 10, space: false, areas: false };

/* — geometría — */
const ringsOf = g => g;
const bboxOf = geoms => {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const g of geoms) for (const r of g) for (const [x, y] of r) {
    x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
};
const ringArea = r => r.reduce((a, [x, y], i) => { const [u, v] = r[(i + 1) % r.length]; return a + x * v - u * y; }, 0) / 2;
const areaOf = g => g.reduce((a, r, i) => a + (i === 0 ? Math.abs(ringArea(r)) : -Math.abs(ringArea(r))), 0);
const inRing = (r, [px, py]) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inGeom = (g, p) => g.reduce((acc, r) => (inRing(r, p) ? !acc : acc), false);
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const edges = g => g.flatMap(r => r.map((p, i) => [p, r[(i + 1) % r.length]]));
function labelPoint(g) {
  const b = bboxOf([g]);
  let best = [b.cx, b.cy], bestD = inGeom(g, best) ? Math.min(...edges(g).map(([a, c]) => segDist(best, a, c))) : -1;
  for (let i = 1; i < 14; i++) for (let j = 1; j < 14; j++) {
    const p = [b.x + (b.w * i) / 14, b.y + (b.h * j) / 14];
    if (!inGeom(g, p)) continue;
    const d = Math.min(...edges(g).map(([a, c]) => segDist(p, a, c)));
    if (d > bestD + 0.5) { bestD = d; best = p; }
  }
  return best;
}
function tidyRing(r) {
  const pts = r.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
  // Sin puntos en línea recta: un contorno unido no conserva las líneas de adentro.
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < 0.01 || (a[0] === b[0] && a[1] === b[1])) { pts.splice(i, 1); changed = true; break; }
    }
  }
  return pts;
}
const tidyGeom = g => g.map(tidyRing).filter(r => r.length >= 3);
const toMulti = geoms => geoms.map(g => g.map(r => [...r, r[0]]));
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const segSeg = (a, b, c, d) => Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
/** El puente entre dos formas que no se tocan: el espacio entre los lados que se
 * enfrentan (como el hueco de una pared). Si ningún lado se enfrenta, lo que hay
 * entre los dos bordes más cercanos. */
function bridge(A, B) {
  let min = Infinity;
  const pairs = [];
  for (const [a, b] of edges(A)) for (const [c, d] of edges(B)) {
    const dd = segSeg(a, b, c, d);
    pairs.push({ a, b, c, d, dd });
    min = Math.min(min, dd);
  }
  let best = null;
  for (const q of pairs) {
    if (q.dd > min + 0.5) continue;
    const ux = q.b[0] - q.a[0], uy = q.b[1] - q.a[1], L = Math.hypot(ux, uy);
    const vx = q.d[0] - q.c[0], vy = q.d[1] - q.c[1], M = Math.hypot(vx, vy);
    if (L < 1e-6 || M < 1e-6) continue;
    if (Math.abs(ux * vy - uy * vx) / (L * M) > 0.02) continue; // no son paralelos
    const t = p => ((p[0] - q.a[0]) * ux + (p[1] - q.a[1]) * uy) / (L * L);
    const lo = Math.max(0, Math.min(t(q.c), t(q.d))), hi = Math.min(1, Math.max(t(q.c), t(q.d)));
    const over = (hi - lo) * L;
    if (over > 1 && (!best || over > best.over)) best = { q, lo, hi, over };
  }
  if (best) {
    const { q, lo, hi } = best;
    const P = k => [q.a[0] + (q.b[0] - q.a[0]) * k, q.a[1] + (q.b[1] - q.a[1]) * k];
    const proj = p => { const vx = q.d[0] - q.c[0], vy = q.d[1] - q.c[1]; const k = ((p[0] - q.c[0]) * vx + (p[1] - q.c[1]) * vy) / (vx * vx + vy * vy); return [q.c[0] + vx * k, q.c[1] + vy * k]; };
    const p1 = P(lo), p2 = P(hi);
    const h = hull([p1, p2, proj(p1), proj(p2)]);
    if (h.length >= 3) return [h];
  }
  const near = pairs.filter(q => q.dd <= min + 0.5)[0];
  const h = hull([near.a, near.b, near.c, near.d]);
  return h.length >= 3 ? [h] : null;
}
/** Unir: una sola forma. Si las partes no se tocan, se rellena lo que hay entre ellas. */
function unionAll(geoms) {
  let res = window.polygonClipping.union(...toMulti(geoms));
  for (let guard = 0; res.length > 1 && guard < 12; guard++) {
    let pick = null;
    for (let i = 0; i < res.length; i++) for (let j = i + 1; j < res.length; j++) {
      const A = res[i], B = res[j];
      let d = Infinity;
      for (const [a, b] of edges([A[0]])) for (const [c, e] of edges([B[0]])) d = Math.min(d, segSeg(a, b, c, e));
      if (!pick || d < pick.d) pick = { d, i, j };
    }
    const br = bridge([res[pick.i][0]], [res[pick.j][0]]);
    if (!br) break;
    res = window.polygonClipping.union(res, toMulti([br]));
  }
  return res.map(tidyGeom).filter(g => g.length);
}
const piecesOf = multi => multi.map(tidyGeom).filter(g => g.length && areaOf(g) > 20);

/* — vista, imán, historial — */
const vb = () => ({ x: PE.vx, y: PE.vy, w: 600 / PE.zoom, h: 400 / PE.zoom });
const shapeById = id => PE.shapes.find(s => s.id === id);
const selShapes = () => PE.sel.map(shapeById).filter(Boolean);
function peSave() {
  PE.hist.push(JSON.stringify(PE.shapes));
  if (PE.hist.length > 60) PE.hist.shift();
  PE.fut = [];
}
function snapPt(p, exclude = []) {
  PE.guides = [];
  if (!PE.snap) return [p[0], p[1]];
  const th = 7 / PE.zoom;
  let bx = null, by = null;
  for (const s of PE.shapes) {
    if (exclude.includes(s.id)) continue;
    for (const r of s.geom) for (const [x, y] of r) {
      if (Math.abs(x - p[0]) < th && (bx === null || Math.abs(x - p[0]) < Math.abs(bx - p[0]))) bx = x;
      if (Math.abs(y - p[1]) < th && (by === null || Math.abs(y - p[1]) < Math.abs(by - p[1]))) by = y;
    }
  }
  if (bx !== null) PE.guides.push({ x: bx });
  if (by !== null) PE.guides.push({ y: by });
  return [bx ?? Math.round(p[0] / 5) * 5, by ?? Math.round(p[1] / 5) * 5];
}
function snapDelta(start, dx, dy, exclude) {
  PE.guides = [];
  if (!PE.snap) return [dx, dy];
  const th = 7 / PE.zoom;
  const xs = [start.x, start.cx, start.x2], ys = [start.y, start.cy, start.y2];
  let best = { x: null, y: null };
  for (const s of PE.shapes) {
    if (exclude.includes(s.id)) continue;
    const b = bboxOf([s.geom]);
    for (const tx of [b.x, b.cx, b.x2]) for (const sx of xs) {
      const d = tx - (sx + dx);
      if (Math.abs(d) < th && (best.x === null || Math.abs(d) < Math.abs(best.x.d))) best.x = { d, at: tx };
    }
    for (const ty of [b.y, b.cy, b.y2]) for (const sy of ys) {
      const d = ty - (sy + dy);
      if (Math.abs(d) < th && (best.y === null || Math.abs(d) < Math.abs(best.y.d))) best.y = { d, at: ty };
    }
  }
  if (best.x) PE.guides.push({ x: best.x.at });
  if (best.y) PE.guides.push({ y: best.y.at });
  return [best.x ? dx + best.x.d : Math.round(dx / 5) * 5, best.y ? dy + best.y.d : Math.round(dy / 5) * 5];
}
const mapGeom = (g, f) => g.map(r => r.map(p => f(p)));

/* — dibujo — */
const pathD = g => g.map(r => 'M' + r.map(p => p.join(' ')).join('L') + 'Z').join('');
const FLOOR = `<g class="floorimg"><rect x="14" y="14" width="572" height="372" fill="var(--floor)" stroke="var(--wall)" stroke-width="8"/>
<path d="M300 14V230M196 230H300M196 230V386M300 230H430M430 230V386M300 120H580" stroke="var(--wall)" stroke-width="6" fill="none"/>
<path d="M300 70a40 40 0 0 1 40 40M196 300a34 34 0 0 1 34-34M430 300a30 30 0 0 0-30-30" stroke="var(--wall)" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/>
<g fill="none" stroke="var(--wall)" stroke-opacity=".45" stroke-width="2"><rect x="44" y="44" width="120" height="70" rx="10"/><rect x="60" y="150" width="90" height="56" rx="6"/><rect x="380" y="40" width="120" height="70" rx="8"/><rect x="214" y="250" width="70" height="30" rx="4"/><rect x="320" y="300" width="50" height="60" rx="18"/><circle cx="520" cy="320" r="26"/></g></g>`;
function peHandles(b) {
  const s = 7 / PE.zoom;
  const pts = { nw: [b.x, b.y], n: [b.cx, b.y], ne: [b.x2, b.y], e: [b.x2, b.cy], se: [b.x2, b.y2], s: [b.cx, b.y2], sw: [b.x, b.y2], w: [b.x, b.cy] };
  return Object.entries(pts).map(([k, [x, y]]) => `<rect class="ph ${k}" data-h="${k}" x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="${s / 4}"/>`).join('');
}
function renderPlano() {
  $('#app').innerHTML = `${topBar({ edit: true })}<div class="editband">${ic('mdiPencilOutline', 'sm')}<span>Edición del plano</span><span style="flex:1"></span>${ib('Deshacer · Ctrl+Z', 'mdiUndo', 'data-pe="undo"', 'sm')}${ib('Rehacer · Ctrl+Shift+Z', 'mdiRedo', 'data-pe="redo"', 'sm')}${ib('Descartar cambios', 'mdiClose', 'data-pe="reset"', 'sm')}${ib('Guardar', 'mdiCheck', 'data-pe="apply"', 'sm primary')}</div><div class="body"><div class="stage pe-stage"><div class="pe" id="pe"></div><div class="vtools" id="vtools"></div><div class="pe-tr" id="petr"></div><div class="pe-zoom" id="pezoom"></div><div id="pectx"></div></div><aside class="side wide hide-phone" id="peside"></aside></div>`;
  paintPE();
}
const TOOLS = [
  ['select', 'Seleccionar y mover · V', 'mdiCursorDefaultOutline'],
  ['points', 'Editar puntos · A', 'mdiVectorPolylineEdit'],
  ['rect', 'Rectángulo · R', 'mdiVectorRectangle'],
  ['poly', 'Forma libre de lados rectos · P', 'mdiVectorPolygon'],
  ['cut', 'Cortar con un trazo · K', 'mdiScissorsCutting'],
  ['pan', 'Mover la vista · H o barra espaciadora', 'mdiHandBackRightOutline'],
];
function paintPE() {
  const v = vb();
  const sel = new Set(PE.sel);
  const shapes = PE.shapes.map(s => `<path class="ps${sel.has(s.id) ? ' sel' : ''}${PE.hover === s.id && !sel.has(s.id) ? ' hov' : ''}" data-s="${s.id}" d="${pathD(s.geom)}" style="--c:${s.color}"/>`).join('');
  let over = '';
  const ss = selShapes();
  if (ss.length && (PE.tool === 'select') && !PE.draft) {
    const b = bboxOf(ss.map(s => s.geom));
    over += `<rect class="pbox" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>${peHandles(b)}`;
  }
  if (PE.tool === 'points') {
    const r = 4.2 / PE.zoom;
    for (const s of ss) s.geom.forEach((ring, ri) => ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      over += `<rect class="pmid" data-mid="${s.id}|${ri}|${i}" x="${(p[0] + q[0]) / 2 - r * 0.7}" y="${(p[1] + q[1]) / 2 - r * 0.7}" width="${r * 1.4}" height="${r * 1.4}" rx="${r * 0.3}"/>`;
    }));
    for (const s of ss) s.geom.forEach((ring, ri) => ring.forEach((p, i) => {
      const on = PE.vsel && PE.vsel.id === s.id && PE.vsel.ri === ri && PE.vsel.i === i;
      over += `<circle class="pv${on ? ' on' : ''}" data-v="${s.id}|${ri}|${i}" cx="${p[0]}" cy="${p[1]}" r="${r}"/>`;
    }));
  }
  if (PE.draft?.kind === 'rect' || PE.draft?.kind === 'marquee') {
    const d = PE.draft;
    over += `<rect class="${d.kind === 'rect' ? 'pdraft' : 'pmarq'}" x="${Math.min(d.x0, d.x1)}" y="${Math.min(d.y0, d.y1)}" width="${Math.abs(d.x1 - d.x0)}" height="${Math.abs(d.y1 - d.y0)}"/>`;
  }
  if (PE.draft?.kind === 'cut') over += `<line class="pcut" x1="${PE.draft.a[0]}" y1="${PE.draft.a[1]}" x2="${PE.draft.b[0]}" y2="${PE.draft.b[1]}"/>`;
  if (PE.poly) {
    const pts = PE.poly.pts;
    const tail = PE.poly.cursor ? [...pts, PE.poly.cursor] : pts;
    over += `<polyline class="pdraft" points="${tail.map(p => p.join(',')).join(' ')}" fill="none"/>${pts.map((p, i) => `<circle class="pv${i === 0 && PE.poly.closing ? ' on' : ''}" cx="${p[0]}" cy="${p[1]}" r="${(i === 0 ? 5 : 3.5) / PE.zoom}"/>`).join('')}`;
  }
  for (const g of PE.guides) over += g.x !== undefined ? `<line class="pguide" x1="${g.x}" y1="${v.y}" x2="${g.x}" y2="${v.y + v.h}"/>` : `<line class="pguide" x1="${v.x}" y1="${g.y}" x2="${v.x + v.w}" y2="${g.y}"/>`;
  const dots = PE.snap ? `<pattern id="pgrid" width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="${0.9 / PE.zoom}" fill="var(--muted)" opacity=".45"/></pattern><rect x="-600" y="-400" width="1800" height="1200" fill="url(#pgrid)" pointer-events="none"/>` : '';
  const pct = (x, y) => `left:${((x - v.x) / v.w) * 100}%;top:${((y - v.y) / v.h) * 100}%`;
  const labels = PE.shapes.map(s => {
    const [x, y] = labelPoint(s.geom);
    const area = `${fm2(areaOf(s.geom))} m²`;
    return PE.rename === s.id
      ? `<span class="plbl edit" style="${pct(x, y)};--c:${s.color}"><input id="perename" value="${esc(s.name)}" aria-label="Nombre"></span>`
      : `<button type="button" class="plbl${sel.has(s.id) ? ' sel' : ''}" data-lbl="${s.id}" style="${pct(x, y)};--c:${s.color}"><b>${esc(s.name)}</b><small>${area}</small></button>`;
  }).join('');
  let meas = '';
  if (ss.length && PE.tool === 'select' && !PE.draft) {
    const b = bboxOf(ss.map(s => s.geom));
    meas = `<span class="pmeas" style="${pct(b.cx, b.y2)}">${fm(b.w)} × ${fm(b.h)} m</span>`;
  }
  if (PE.draft?.kind === 'rect') {
    const d = PE.draft;
    meas = `<span class="pmeas" style="${pct((d.x0 + d.x1) / 2, Math.max(d.y0, d.y1))}">${fm(Math.abs(d.x1 - d.x0))} × ${fm(Math.abs(d.y1 - d.y0))} m</span>`;
  }
  if (PE.draft?.kind === 'cut') meas = `<span class="pmeas" style="${pct(PE.draft.b[0], PE.draft.b[1])}">${fm(Math.hypot(PE.draft.b[0] - PE.draft.a[0], PE.draft.b[1] - PE.draft.a[1]))} m</span>`;
  if (PE.poly?.cursor && PE.poly.pts.length) {
    const a = PE.poly.pts.at(-1), c = PE.poly.cursor;
    meas = `<span class="pmeas" style="${pct(c[0], c[1])}">${fm(Math.hypot(c[0] - a[0], c[1] - a[1]))} m</span>`;
  }
  $('#pe').dataset.tool = PE.tool;
  $('#pe').innerHTML = `<svg viewBox="${v.x} ${v.y} ${v.w} ${v.h}" id="pesvg"><rect data-bg x="-600" y="-400" width="1800" height="1200" fill="transparent"/>${PE.img ? `<g opacity="${PE.imgOp}" pointer-events="none">${FLOOR}</g>` : ''}${dots}<g class="pshapes">${shapes}</g>${over}</svg><div class="plabels">${labels}${meas}</div>${PE.pop ?? ''}`;
  $('#vtools').innerHTML = TOOLS.map(([k, t, i]) => ib(t, i, `data-tool="${k}" aria-pressed="${PE.tool === k}"`)).join('');
  $('#petr').innerHTML = `${ib('Imán · alinea con la grilla y otras formas', PE.snap ? 'mdiMagnetOn' : 'mdiMagnet', `data-pe="snap" aria-pressed="${PE.snap}"`)}${ib('Imagen del plano', PE.img ? 'mdiImageOutline' : 'mdiEyeOffOutline', `data-pe="img" aria-pressed="${PE.img}"`)}${PE.img ? `<input type="range" min="0.15" max="1" step="0.05" value="${PE.imgOp}" data-peop aria-label="Transparencia de la imagen" title="Transparencia de la imagen">` : ''}${ib('Atajos de teclado', 'mdiKeyboardOutline', 'data-pe="keys"')}`;
  $('#pezoom').innerHTML = `${ib('Alejar', 'mdiMinus', 'data-pe="zout"', 'sm')}<button type="button" class="zpct" data-pe="fit" title="Ver todo">${Math.round(PE.zoom * 100)}%</button>${ib('Acercar', 'mdiPlus', 'data-pe="zin"', 'sm')}`;
  // Barra de la selección, flotando sobre lo elegido.
  let ctx = '';
  if (ss.length && PE.tool === 'select' && !PE.draft) {
    const b = bboxOf(ss.map(s => s.geom));
    const x = Math.min(84, Math.max(16, ((b.cx - v.x) / v.w) * 100));
    const top = ((b.y - v.y) / v.h) * 100;
    const below = top < 14;
    const y = below ? Math.min(92, ((b.y2 - v.y) / v.h) * 100) : top;
    const multi = ss.length > 1;
    ctx = `<div class="pctx${below ? ' below' : ''}" style="left:${x}%;top:${y}%">${multi ? `${ib('Unir en una sola forma · Ctrl+U', 'mdiVectorUnion', 'data-op="union"')}${ib('Restar: quitarle al primero lo que tapan los otros', 'mdiVectorDifferenceBa', 'data-op="subtract"')}${ib('Intersecar: dejar solo lo común', 'mdiVectorIntersection', 'data-op="intersect"')}<span class="sep"></span>${ib('Alinear', 'mdiAlignHorizontalCenter', 'data-op="alignmenu"')}` : `${ib('Editar puntos · doble clic', 'mdiVectorPolylineEdit', 'data-op="points"')}${ib('Cortar con un trazo', 'mdiScissorsCutting', 'data-op="cut"')}`}<span class="sep"></span>${ib('Girar 90°', 'mdiRotateRight', 'data-op="rot"')}${ib('Voltear horizontal', 'mdiFlipHorizontal', 'data-op="fliph"')}${ib('Voltear vertical', 'mdiFlipVertical', 'data-op="flipv"')}${ib('Duplicar · Ctrl+D', 'mdiContentDuplicate', 'data-op="dup"')}${ib('Traer adelante', 'mdiArrangeBringForward', 'data-op="front"')}${ib('Mandar atrás', 'mdiArrangeSendBackward', 'data-op="back"')}${ib('Borrar · Supr', 'mdiTrashCanOutline', 'data-op="del"', 'danger')}${PE.align ? `<div class="palign">${[['left', 'Izquierda', 'mdiAlignHorizontalLeft'], ['hc', 'Centro', 'mdiAlignHorizontalCenter'], ['right', 'Derecha', 'mdiAlignHorizontalRight'], ['top', 'Arriba', 'mdiAlignVerticalTop'], ['vc', 'Medio', 'mdiAlignVerticalCenter'], ['bottom', 'Abajo', 'mdiAlignVerticalBottom']].map(([k, t, i]) => ib(t, i, `data-align="${k}"`, 'sm')).join('')}</div>` : ''}</div>`;
  }
  if (PE.vsel && PE.tool === 'points') {
    const s = shapeById(PE.vsel.id);
    const p = s?.geom[PE.vsel.ri]?.[PE.vsel.i];
    if (p) ctx = `<div class="pctx${((p[1] - v.y) / v.h) * 100 < 14 ? ' below' : ''}" style="left:${((p[0] - v.x) / v.w) * 100}%;top:${Math.max(7, ((p[1] - v.y) / v.h) * 100)}%">${ib('Quitar punto · Supr', 'mdiTrashCanOutline', 'data-op="vdel"', 'danger')}</div>`;
  }
  $('#pe').insertAdjacentHTML('beforeend', ctx);
  paintPESide();
  const input = $('#perename');
  if (input) {
    input.focus();
    input.select();
    const done = ok => {
      if (PE.rename == null) return;
      const s = shapeById(PE.rename);
      if (ok && input.value.trim() && input.value.trim() !== s.name) { peSave(); s.name = input.value.trim(); }
      PE.rename = null;
      paintPE();
    };
    input.onkeydown = ev => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); ev.stopPropagation(); };
    input.onblur = () => done(true);
  }
}
const HA_AREAS = ['Living', 'Cocina', 'Dormitorio', 'Baño', 'Balcón', 'Oficina'];
function paintPESide() {
  const ss = selShapes();
  let body;
  if (ss.length === 1) {
    const s = ss[0];
    const b = bboxOf([s.geom]);
    const num = (k, val, t, icon) => `<label class="pnum" title="${t}">${ic(icon, 'sm')}<input type="number" step="0.05" data-geo="${k}" value="${(val * UM).toFixed(2)}" aria-label="${t}"><span>m</span></label>`;
    body = `<div class="pins"><div class="prow">${ic('mdiLabelOutline')}<input class="tin" type="text" data-pname value="${esc(s.name)}" aria-label="Nombre"></div><div class="prow">${ic('mdiPaletteOutline')}<div class="sw">${SPC.map(c => `<button type="button" data-pcolor="${c}" style="--c:${c}" aria-pressed="${s.color === c}" title="Color"></button>`).join('')}</div></div><div class="pgrid4">${num('x', b.x, 'Posición horizontal', 'mdiArrowRight')}${num('y', b.y, 'Posición vertical', 'mdiArrowDown')}${num('w', b.w, 'Ancho', 'mdiArrowLeftRight')}${num('h', b.h, 'Alto', 'mdiArrowUpDown')}</div><div class="pstats"><span title="Superficie">${ic('mdiRulerSquare', 'sm')}<b>${fm2(areaOf(s.geom))} m²</b></span><span title="Puntos">${ic('mdiVectorPoint', 'sm')}<b>${s.geom.reduce((n, r) => n + r.length, 0)}</b></span>${s.geom.length > 1 ? `<span title="Huecos">${ic('mdiVectorDifferenceBa', 'sm')}<b>${s.geom.length - 1}</b></span>` : ''}</div><div class="prow">${ic('mdiHomeAssistant')}<button type="button" class="chip" data-pe="areas">${esc(HA_AREAS.includes(s.name) ? s.name : 'Sin área')}${ic('mdiChevronDown', 'sm')}</button></div>${PE.areas ? `<div class="chips" style="padding-left:34px">${HA_AREAS.map(a => `<button type="button" class="chip" data-area="${esc(a)}" aria-pressed="${a === s.name}">${esc(a)}</button>`).join('')}</div>` : ''}</div>`;
  } else if (ss.length > 1) {
    body = `<div class="pins"><div class="pmulti"><b>${ss.length}</b> formas</div><div class="pops">${[['union', 'Unir', 'mdiVectorUnion'], ['subtract', 'Restar', 'mdiVectorDifferenceBa'], ['intersect', 'Intersecar', 'mdiVectorIntersection']].map(([k, t, i]) => `<button type="button" class="pop-op" data-op="${k}">${ic(i, 'lg')}<span>${t}</span></button>`).join('')}</div><div class="prow">${ic('mdiAlignHorizontalCenter')}<div class="seg icons">${[['left', 'Izquierda', 'mdiAlignHorizontalLeft'], ['hc', 'Centro', 'mdiAlignHorizontalCenter'], ['right', 'Derecha', 'mdiAlignHorizontalRight'], ['top', 'Arriba', 'mdiAlignVerticalTop'], ['vc', 'Medio', 'mdiAlignVerticalCenter'], ['bottom', 'Abajo', 'mdiAlignVerticalBottom']].map(([k, t, i]) => `<button type="button" data-align="${k}" title="${t}" aria-label="${t}">${ic(i, 'sm')}</button>`).join('')}</div></div></div>`;
  } else body = '';
  const layers = PE.shapes.map(s => `<button type="button" class="player${PE.sel.includes(s.id) ? ' on' : ''}" data-layer="${s.id}"><i style="--c:${s.color}"></i><span>${esc(s.name)}</span><small>${fm2(areaOf(s.geom))} m²</small></button>`).reverse().join('');
  $('#peside').innerHTML = `<div class="nb"><div class="page"><div class="phead">${ib('Atrás', 'mdiArrowLeft', 'data-pe="back"')}<h2><span class="crumb">Configuración › Plano y espacios</span>Espacios</h2></div><div class="pbody">${body}<div class="grp">Formas</div><div class="players">${layers}</div></div></div></div>`;
}

/* — interacción — */
function peAct(k) {
  const ss = selShapes();
  if (k === 'union' && ss.length > 1) {
    const res = unionAll(ss.map(s => s.geom));
    if (!res.length) return;
    peSave();
    const keep = ss[0];
    keep.geom = res[0];
    PE.shapes = PE.shapes.filter(s => s === keep || !PE.sel.includes(s.id));
    PE.sel = [keep.id];
  } else if (k === 'subtract' && ss.length > 1) {
    const [first, ...rest] = ss;
    const res = piecesOf(window.polygonClipping.difference(toMulti([first.geom])[0], ...toMulti(rest.map(s => s.geom))));
    peSave();
    if (!res.length) PE.shapes = PE.shapes.filter(s => s !== first);
    else {
      res.sort((a, b) => areaOf(b) - areaOf(a));
      first.geom = res[0];
      res.slice(1).forEach((g, i) => PE.shapes.push({ id: 'a' + PE.n++, name: `${first.name} ${i + 2}`, color: SPC[(PE.n + i) % SPC.length], geom: g }));
    }
    PE.sel = res.length ? [first.id] : [];
  } else if (k === 'intersect' && ss.length > 1) {
    const res = piecesOf(window.polygonClipping.intersection(...toMulti(ss.map(s => s.geom))));
    if (!res.length) return toast('No se superponen');
    peSave();
    const keep = ss[0];
    keep.geom = res.sort((a, b) => areaOf(b) - areaOf(a))[0];
    PE.shapes = PE.shapes.filter(s => s === keep || !PE.sel.includes(s.id));
    PE.sel = [keep.id];
  } else if (k === 'points') { PE.tool = 'points'; PE.vsel = null; }
  else if (k === 'cut') PE.tool = 'cut';
  else if (k === 'alignmenu') PE.align = !PE.align;
  else if (['rot', 'fliph', 'flipv'].includes(k) && ss.length) {
    peSave();
    const b = bboxOf(ss.map(s => s.geom));
    const f = k === 'rot' ? ([x, y]) => [b.cx - (y - b.cy), b.cy + (x - b.cx)] : k === 'fliph' ? ([x, y]) => [2 * b.cx - x, y] : ([x, y]) => [x, 2 * b.cy - y];
    for (const s of ss) s.geom = tidyGeom(mapGeom(s.geom, f));
  } else if (k === 'dup' && ss.length) {
    peSave();
    const copies = ss.map(s => ({ id: 'a' + PE.n++, name: `${s.name} copia`, color: s.color, geom: mapGeom(s.geom, ([x, y]) => [x + 20, y + 20]) }));
    PE.shapes.push(...copies);
    PE.sel = copies.map(c => c.id);
  } else if ((k === 'front' || k === 'back') && ss.length) {
    peSave();
    const rest = PE.shapes.filter(s => !PE.sel.includes(s.id));
    PE.shapes = k === 'front' ? [...rest, ...ss] : [...ss, ...rest];
  } else if (k === 'del' && ss.length) {
    peSave();
    PE.shapes = PE.shapes.filter(s => !PE.sel.includes(s.id));
    PE.sel = [];
  } else if (k === 'vdel' && PE.vsel) {
    const s = shapeById(PE.vsel.id);
    const ring = s.geom[PE.vsel.ri];
    if (ring.length <= 3) return toast('Una forma necesita al menos 3 puntos');
    peSave();
    ring.splice(PE.vsel.i, 1);
    PE.vsel = null;
  }
  paintPE();
}
function peAlign(k) {
  const ss = selShapes();
  if (ss.length < 2) return;
  peSave();
  const all = bboxOf(ss.map(s => s.geom));
  for (const s of ss) {
    const b = bboxOf([s.geom]);
    const dx = k === 'left' ? all.x - b.x : k === 'right' ? all.x2 - b.x2 : k === 'hc' ? all.cx - b.cx : 0;
    const dy = k === 'top' ? all.y - b.y : k === 'bottom' ? all.y2 - b.y2 : k === 'vc' ? all.cy - b.cy : 0;
    s.geom = mapGeom(s.geom, ([x, y]) => [x + dx, y + dy]);
  }
  PE.align = false;
  paintPE();
}
function peCut(a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 8) return;
  const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-d[1], d[0]], L = 5000;
  const half = s => [[[a[0] - d[0] * L, a[1] - d[1] * L], [a[0] + d[0] * L, a[1] + d[1] * L], [a[0] + d[0] * L + s * n[0] * L, a[1] + d[1] * L + s * n[1] * L], [a[0] - d[0] * L + s * n[0] * L, a[1] - d[1] * L + s * n[1] * L], [a[0] - d[0] * L, a[1] - d[1] * L]]];
  const crosses = s => edges(s.geom).some(([p, q]) => {
    const den = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]);
    if (Math.abs(den) < 1e-9) return false;
    const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / den;
    const u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  });
  const pool = PE.sel.length ? selShapes() : PE.shapes;
  const hit = pool.filter(crosses);
  if (!hit.length) return toast('El trazo no cruza ninguna forma');
  peSave();
  const picked = [];
  for (const s of hit) {
    const pieces = [...piecesOf(window.polygonClipping.intersection(toMulti([s.geom])[0], half(1))), ...piecesOf(window.polygonClipping.intersection(toMulti([s.geom])[0], half(-1)))];
    if (pieces.length < 2) continue;
    pieces.sort((x, y) => areaOf(y) - areaOf(x));
    s.geom = pieces[0];
    picked.push(s.id);
    pieces.slice(1).forEach((g, i) => {
      const id = 'a' + PE.n++;
      PE.shapes.splice(PE.shapes.indexOf(s) + 1 + i, 0, { id, name: `${s.name} ${i + 2}`, color: SPC[(PE.shapes.length + i) % SPC.length], geom: g });
      picked.push(id);
    });
  }
  PE.sel = picked;
  PE.tool = 'select';
}
function peFinishPoly() {
  const pts = PE.poly?.pts ?? [];
  PE.poly = null;
  if (pts.length >= 3 && Math.abs(ringArea(pts)) > 50) {
    peSave();
    const id = 'a' + PE.n++;
    PE.shapes.push({ id, name: 'Espacio nuevo', color: SPC[PE.shapes.length % SPC.length], geom: [tidyRing(pts)] });
    PE.sel = [id];
    PE.rename = id;
    PE.tool = 'select';
  }
  paintPE();
}
function peSvgPt(ev) {
  const svg = $('#pesvg');
  const p = svg.createSVGPoint();
  p.x = ev.clientX; p.y = ev.clientY;
  const q = p.matrixTransform(svg.getScreenCTM().inverse());
  return [q.x, q.y];
}
function peZoom(f, at) {
  const v = vb();
  const z = Math.max(0.5, Math.min(6, PE.zoom * f));
  const c = at ?? [v.x + v.w / 2, v.y + v.h / 2];
  const rx = (c[0] - v.x) / v.w, ry = (c[1] - v.y) / v.h;
  PE.zoom = z;
  PE.vx = c[0] - rx * (600 / z);
  PE.vy = c[1] - ry * (400 / z);
}
function bindPlano() {
  const app = $('#app');
  app.onclick = ev => {
    const t = ev.target;
    const top = t.closest('[data-top]');
    if (top) return top.dataset.top === 'theme' ? toggleTheme() : go('menu');
    const tool = t.closest('[data-tool]');
    if (tool) { PE.tool = tool.dataset.tool; PE.poly = null; PE.vsel = null; PE.draft = null; PE.align = false; return paintPE(); }
    const op = t.closest('[data-op]');
    if (op) return peAct(op.dataset.op);
    const al = t.closest('[data-align]');
    if (al) return peAlign(al.dataset.align);
    const lay = t.closest('[data-layer]');
    if (lay) { PE.tool = 'select'; PE.sel = ev.shiftKey ? [...new Set([...PE.sel, lay.dataset.layer])] : [lay.dataset.layer]; return paintPE(); }
    const col = t.closest('[data-pcolor]');
    if (col) { peSave(); selShapes()[0].color = col.dataset.pcolor; return paintPE(); }
    const area = t.closest('[data-area]');
    if (area) { PE.areas = false; toast(`Vinculado al área «${area.dataset.area}»`); return paintPE(); }
    const pe = t.closest('[data-pe]');
    if (!pe) return;
    const k = pe.dataset.pe;
    if (k === 'back') return go('menu');
    if (k === 'undo' && PE.hist.length) { PE.fut.push(JSON.stringify(PE.shapes)); PE.shapes = JSON.parse(PE.hist.pop()); PE.sel = PE.sel.filter(shapeById); }
    else if (k === 'redo' && PE.fut.length) { PE.hist.push(JSON.stringify(PE.shapes)); PE.shapes = JSON.parse(PE.fut.pop()); PE.sel = PE.sel.filter(shapeById); }
    else if (k === 'reset') { peSave(); PE.shapes = PE0(); PE.sel = []; }
    else if (k === 'apply') toast('Plano guardado');
    else if (k === 'snap') PE.snap = !PE.snap;
    else if (k === 'img') PE.img = !PE.img;
    else if (k === 'zin') peZoom(1.25);
    else if (k === 'zout') peZoom(0.8);
    else if (k === 'fit') { PE.zoom = 1; PE.vx = 0; PE.vy = 0; }
    else if (k === 'areas') PE.areas = !PE.areas;
    else if (k === 'keys') PE.pop = PE.pop ? null : `<div class="pkeys">${[['V', 'Seleccionar'], ['A', 'Editar puntos'], ['R', 'Rectángulo'], ['P', 'Forma libre'], ['K', 'Cortar'], ['H / espacio', 'Mover la vista'], ['Shift + clic', 'Sumar a la selección'], ['Ctrl + U', 'Unir'], ['Ctrl + D', 'Duplicar'], ['Supr', 'Borrar'], ['Flechas', 'Mover (Shift: más)'], ['Ctrl + Z', 'Deshacer'], ['Enter', 'Cerrar la forma libre'], ['Esc', 'Cancelar']].map(([kk, tt]) => `<kbd>${kk}</kbd><span>${tt}</span>`).join('')}</div>`;
    paintPE();
  };
  app.ondblclick = ev => {
    const lbl = ev.target.closest('[data-lbl]');
    if (lbl) { PE.rename = lbl.dataset.lbl; return paintPE(); }
    if (PE.tool === 'poly') return peFinishPoly();
    const s = ev.target.closest('[data-s]');
    if (s && PE.tool === 'select') { PE.sel = [s.dataset.s]; PE.tool = 'points'; PE.vsel = null; paintPE(); }
  };
  app.oninput = ev => {
    const t = ev.target;
    if (t.dataset.peop !== undefined) { PE.imgOp = Number(t.value); const g = $('#pesvg g[opacity]'); if (g) g.setAttribute('opacity', PE.imgOp); return; }
    if (t.dataset.pname !== undefined) { const s = selShapes()[0]; s.name = t.value; const l = $(`[data-lbl="${s.id}"] b`); if (l) l.textContent = t.value; return; }
  };
  app.onchange = ev => {
    const t = ev.target;
    if (t.dataset.geo) {
      const s = selShapes()[0];
      const b = bboxOf([s.geom]);
      const val = Number(t.value) / UM;
      if (!(val > 0) && ['w', 'h'].includes(t.dataset.geo)) return paintPE();
      peSave();
      const k = t.dataset.geo;
      if (k === 'x') s.geom = mapGeom(s.geom, ([x, y]) => [x + val - b.x, y]);
      if (k === 'y') s.geom = mapGeom(s.geom, ([x, y]) => [x, y + val - b.y]);
      if (k === 'w') s.geom = mapGeom(s.geom, ([x, y]) => [b.x + ((x - b.x) * val) / b.w, y]);
      if (k === 'h') s.geom = mapGeom(s.geom, ([x, y]) => [x, b.y + ((y - b.y) * val) / b.h]);
      paintPE();
    }
    if (t.dataset.pname !== undefined) { peSave(); paintPE(); }
  };
  const host = $('#pe');
  host.addEventListener('wheel', ev => { ev.preventDefault(); peZoom(ev.deltaY < 0 ? 1.12 : 0.89, peSvgPt(ev)); paintPE(); }, { passive: false });
  host.onpointerdown = ev => {
    // Tocar la etiqueta elige la forma (Shift suma); doble clic la renombra.
    const dbl = isDouble(ev);
    const lbl = ev.target.closest('[data-lbl]');
    if (lbl && dbl) { PE.rename = lbl.dataset.lbl; return paintPE(); }
    if (lbl && PE.tool === 'select') {
      const id = lbl.dataset.lbl;
      PE.sel = ev.shiftKey ? (PE.sel.includes(id) ? PE.sel.filter(x => x !== id) : [...PE.sel, id]) : [id];
      return paintPE();
    }
    if (!ev.target.closest('svg') || ev.button === 2) return;
    const p = peSvgPt(ev);
    PE.pop = null;
    PE.align = false;
    const sEl = ev.target.closest('[data-s]'), hEl = ev.target.closest('[data-h]'), vEl = ev.target.closest('[data-v]'), mEl = ev.target.closest('[data-mid]');
    // Doble clic: en una forma, editar sus puntos; en la forma libre, cerrarla.
    if (dbl && PE.tool === 'poly' && PE.poly) return peFinishPoly();
    if (dbl && PE.tool === 'select' && sEl) { PE.sel = [sEl.dataset.s]; PE.tool = 'points'; PE.vsel = null; return paintPE(); }
    if (PE.tool === 'pan' || PE.space || ev.button === 1) PE.drag = { kind: 'pan', c: [ev.clientX, ev.clientY], v0: { x: PE.vx, y: PE.vy } };
    else if (PE.tool === 'rect') { const q = snapPt(p); PE.draft = { kind: 'rect', x0: q[0], y0: q[1], x1: q[0], y1: q[1] }; }
    else if (PE.tool === 'cut') { const q = snapPt(p); PE.draft = { kind: 'cut', a: q, b: q }; }
    else if (PE.tool === 'poly') {
      let q = snapPt(p);
      PE.poly ??= { pts: [] };
      const pts = PE.poly.pts;
      if (pts.length >= 3 && Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) < 9 / PE.zoom) return peFinishPoly();
      if (ev.shiftKey && pts.length) q = ortho(pts.at(-1), q);
      pts.push(q);
    } else if (PE.tool === 'points') {
      if (vEl || mEl) {
        const [id, ri, i] = (vEl ?? mEl).dataset[vEl ? 'v' : 'mid'].split('|');
        const s = shapeById(id);
        peSave();
        let idx = Number(i);
        if (mEl) { const ring = s.geom[ri]; const a = ring[idx], c = ring[(idx + 1) % ring.length]; ring.splice(idx + 1, 0, [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]); idx += 1; }
        PE.vsel = { id, ri: Number(ri), i: idx };
        PE.drag = { kind: 'vertex' };
      } else if (sEl) { PE.sel = [sEl.dataset.s]; PE.vsel = null; }
      else { PE.sel = []; PE.vsel = null; PE.tool = 'select'; }
    } else if (hEl) {
      const ss = selShapes();
      PE.drag = { kind: 'resize', h: hEl.dataset.h, b: bboxOf(ss.map(s => s.geom)), start: ss.map(s => ({ id: s.id, geom: JSON.parse(JSON.stringify(s.geom)) })), saved: false };
    } else if (sEl) {
      const id = sEl.dataset.s;
      if (ev.shiftKey) PE.sel = PE.sel.includes(id) ? PE.sel.filter(x => x !== id) : [...PE.sel, id];
      else if (!PE.sel.includes(id)) PE.sel = [id];
      const ss = selShapes();
      PE.drag = { kind: 'move', p0: p, b: bboxOf(ss.map(s => s.geom)), start: ss.map(s => ({ id: s.id, geom: JSON.parse(JSON.stringify(s.geom)) })), saved: false };
    } else {
      if (!ev.shiftKey) PE.sel = [];
      PE.draft = { kind: 'marquee', x0: p[0], y0: p[1], x1: p[0], y1: p[1], add: ev.shiftKey };
    }
    host.setPointerCapture(ev.pointerId);
    paintPE();
  };
  host.onpointermove = ev => {
    if (!$('#pesvg')) return;
    const p = peSvgPt(ev);
    const d = PE.drag;
    if (!d && !PE.draft) {
      if (PE.tool === 'poly' && PE.poly) {
        let q = snapPt(p);
        if (ev.shiftKey && PE.poly.pts.length) q = ortho(PE.poly.pts.at(-1), q);
        PE.poly.cursor = q;
        PE.poly.closing = PE.poly.pts.length >= 3 && Math.hypot(q[0] - PE.poly.pts[0][0], q[1] - PE.poly.pts[0][1]) < 9 / PE.zoom;
        return paintPE();
      }
      const over = ev.target.closest?.('[data-s]')?.dataset.s ?? null;
      if (over !== PE.hover && PE.tool === 'select') { PE.hover = over; paintPE(); }
      return;
    }
    if (PE.draft?.kind === 'rect') { const q = snapPt(p); PE.draft.x1 = q[0]; PE.draft.y1 = q[1]; }
    else if (PE.draft?.kind === 'cut') { let q = snapPt(p); if (!ev.altKey) q = ortho(PE.draft.a, q, true); PE.draft.b = q; }
    else if (PE.draft?.kind === 'marquee') { PE.draft.x1 = p[0]; PE.draft.y1 = p[1]; }
    else if (d?.kind === 'pan') { const r = $('#pesvg').getBoundingClientRect(); PE.vx = d.v0.x - ((ev.clientX - d.c[0]) / r.width) * (600 / PE.zoom); PE.vy = d.v0.y - ((ev.clientY - d.c[1]) / r.height) * (400 / PE.zoom); }
    else if (d?.kind === 'move') {
      const [dx, dy] = snapDelta(d.b, p[0] - d.p0[0], p[1] - d.p0[1], d.start.map(s => s.id));
      if (!dx && !dy && !d.saved) return;
      if (!d.saved) { peSave(); d.saved = true; }
      for (const st of d.start) shapeById(st.id).geom = mapGeom(st.geom, ([x, y]) => [x + dx, y + dy]);
    } else if (d?.kind === 'resize') {
      if (!d.saved) { peSave(); d.saved = true; }
      const q = snapPt(p, d.start.map(s => s.id));
      const b = d.b, h = d.h;
      let x1 = b.x, y1 = b.y, x2 = b.x2, y2 = b.y2;
      if (h.includes('w')) x1 = Math.min(q[0], x2 - 10);
      if (h.includes('e')) x2 = Math.max(q[0], x1 + 10);
      if (h.includes('n')) y1 = Math.min(q[1], y2 - 10);
      if (h.includes('s')) y2 = Math.max(q[1], y1 + 10);
      if (ev.shiftKey && h.length === 2) { const k = Math.max((x2 - x1) / b.w, (y2 - y1) / b.h); if (h.includes('w')) x1 = x2 - b.w * k; else x2 = x1 + b.w * k; if (h.includes('n')) y1 = y2 - b.h * k; else y2 = y1 + b.h * k; }
      const sx = (x2 - x1) / b.w, sy = (y2 - y1) / b.h;
      for (const st of d.start) shapeById(st.id).geom = mapGeom(st.geom, ([x, y]) => [x1 + (x - b.x) * sx, y1 + (y - b.y) * sy]);
    } else if (d?.kind === 'vertex') {
      const s = shapeById(PE.vsel.id);
      const ring = s.geom[PE.vsel.ri];
      let q = snapPt(p, [s.id]);
      if (ev.shiftKey) q = ortho(ring[(PE.vsel.i - 1 + ring.length) % ring.length], q);
      ring[PE.vsel.i] = q;
    }
    paintPE();
  };
  host.onpointerup = () => {
    const dr = PE.draft;
    if (dr?.kind === 'rect') {
      const w = Math.abs(dr.x1 - dr.x0), h = Math.abs(dr.y1 - dr.y0);
      if (w >= 10 && h >= 10) {
        peSave();
        const id = 'a' + PE.n++;
        PE.shapes.push({ id, name: 'Espacio nuevo', color: SPC[PE.shapes.length % SPC.length], geom: rectG(Math.min(dr.x0, dr.x1), Math.min(dr.y0, dr.y1), w, h) });
        PE.sel = [id];
        PE.rename = id;
        PE.tool = 'select';
      }
    } else if (dr?.kind === 'cut') peCut(dr.a, dr.b);
    else if (dr?.kind === 'marquee') {
      const m = { x: Math.min(dr.x0, dr.x1), y: Math.min(dr.y0, dr.y1), x2: Math.max(dr.x0, dr.x1), y2: Math.max(dr.y0, dr.y1) };
      if (m.x2 - m.x > 3 || m.y2 - m.y > 3) {
        const hit = PE.shapes.filter(s => { const b = bboxOf([s.geom]); return b.x < m.x2 && b.x2 > m.x && b.y < m.y2 && b.y2 > m.y; }).map(s => s.id);
        PE.sel = dr.add ? [...new Set([...PE.sel, ...hit])] : hit;
      }
    }
    if (PE.drag?.kind === 'vertex') PE.vsel = { ...PE.vsel };
    PE.draft = null;
    PE.drag = null;
    PE.guides = [];
    paintPE();
  };
}
/** Doble clic propio: el dibujo se rehace en cada clic y el navegador pierde la cuenta. */
let lastDown = { t: 0, x: 0, y: 0 };
function isDouble(ev) {
  const now = performance.now();
  const dbl = now - lastDown.t < 380 && Math.hypot(ev.clientX - lastDown.x, ev.clientY - lastDown.y) < 8;
  lastDown = dbl ? { t: 0, x: 0, y: 0 } : { t: now, x: ev.clientX, y: ev.clientY };
  return dbl;
}
/** Con Shift (o al cortar), el trazo va horizontal, vertical o a 45°. */
function ortho(a, q, soft = false) {
  const dx = q[0] - a[0], dy = q[1] - a[1];
  const ang = Math.atan2(dy, dx), step = Math.PI / 4;
  const snapA = Math.round(ang / step) * step;
  if (soft && Math.abs(ang - snapA) > 0.09) return q;
  const len = Math.hypot(dx, dy);
  return [Math.round((a[0] + Math.cos(snapA) * len) * 10) / 10, Math.round((a[1] + Math.sin(snapA) * len) * 10) / 10];
}
function peKeys(ev) {
  if (screen !== 'plano' || ev.target.closest?.('input,select,textarea')) return;
  const k = ev.key.toLowerCase();
  const ctrl = ev.ctrlKey || ev.metaKey;
  if (k === ' ') { PE.space = ev.type === 'keydown'; return; }
  if (ev.type !== 'keydown') return;
  if (ctrl && k === 'z') { ev.preventDefault(); $(ev.shiftKey ? '[data-pe="redo"]' : '[data-pe="undo"]')?.click(); return; }
  if (ctrl && k === 'y') { ev.preventDefault(); $('[data-pe="redo"]')?.click(); return; }
  if (ctrl && k === 'd') { ev.preventDefault(); return peAct('dup'); }
  if (ctrl && k === 'u') { ev.preventDefault(); return peAct('union'); }
  if (ctrl && k === 'a') { ev.preventDefault(); PE.sel = PE.shapes.map(s => s.id); PE.tool = 'select'; return paintPE(); }
  if (k === 'delete' || k === 'backspace') { ev.preventDefault(); return peAct(PE.tool === 'points' && PE.vsel ? 'vdel' : 'del'); }
  if (k === 'escape') { PE.poly = null; PE.draft = null; PE.vsel = null; if (PE.tool !== 'select') PE.tool = 'select'; else PE.sel = []; return paintPE(); }
  if (k === 'enter' && PE.poly) return peFinishPoly();
  const tools = { v: 'select', a: 'points', r: 'rect', p: 'poly', k: 'cut', h: 'pan' };
  if (!ctrl && tools[k]) { PE.tool = tools[k]; PE.poly = null; return paintPE(); }
  if (k.startsWith('arrow') && PE.sel.length) {
    ev.preventDefault();
    const s = ev.shiftKey ? 25 : 5;
    const [dx, dy] = { arrowleft: [-s, 0], arrowright: [s, 0], arrowup: [0, -s], arrowdown: [0, s] }[k];
    peSave();
    for (const sh of selShapes()) sh.geom = mapGeom(sh.geom, ([x, y]) => [x + dx, y + dy]);
    paintPE();
  }
  if (k === '+' || k === '=') { peZoom(1.25); paintPE(); }
  if (k === '-') { peZoom(0.8); paintPE(); }
}
document.addEventListener('keydown', peKeys);
document.addEventListener('keyup', peKeys);
