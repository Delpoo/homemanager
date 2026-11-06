/* ═════════ 4 · Controles en el plano ═════════
   Un elemento del control se pega a un símbolo: se arrastra a donde uno quiera,
   se puede fijar, cambia de tamaño a mano o con números (las dos cosas siempre
   coinciden) y tiene su propio estilo. Es el mismo elemento del diseñador. */
const AT = {
  sym: { x: 170, y: 150, size: 1 },
  edit: true,
  sel: { kind: 'att', id: 'w1' },
  att: [{ id: 'w1', from: 'vvel', dx: 30, dy: -24, w: 128, h: 48, locked: false, scale: true, over: { fs: 10, vsz: 20, rad: 999 } }],
  pop: false,
  n: 2,
};
const ventEl = id => DS.r.vent.els.find(e => e.id === id);
const attById = id => AT.att.find(a => a.id === id);
function attEl(a) {
  const base = ventEl(a.from);
  return { ...base, ...a.over, id: a.id, x: 1, y: 1 };
}
function symLevel() {
  const v = ventEl('vvel');
  return v ? lvIdx(v) / Math.max(1, levelCount(v) - 1) : 0;
}
function renderPegados() {
  $('#app').innerHTML = `${topBar({ edit: AT.edit })}${AT.edit ? `<div class="editband">${ic('mdiPencilOutline', 'sm')}<span>Edición</span><span style="flex:1"></span>${ib('Guardar', 'mdiCheck', 'data-top="edit"', 'sm primary')}</div>` : ''}<div class="body"><div class="stage"><div class="aplan" id="aplan"><div class="ascale" id="ascale"></div></div></div><aside class="side sheet-phone" id="aside"></aside></div>`;
  paintPlanA();
  paintAttSide();
}
function paintPlanA() {
  const s = AT.sym, k = s.size;
  const sz = 40 * k;
  const atts = AT.att.map(a => {
    const sc = a.scale ? k : 1;
    const x = s.x + a.dx * sc, y = s.y + a.dy * sc;
    const sel = AT.sel?.kind === 'att' && AT.sel.id === a.id;
    const e = attEl(a);
    return `<div class="att${AT.edit ? ' editing' : ''}${sel && AT.edit ? ' sel' : ''}${a.locked ? ' locked' : ''}" data-att="${a.id}" style="left:${x}px;top:${y}px;width:${a.w * sc}px;height:${a.h * sc}px;opacity:${a.over.op ?? 1}">${renderEl({ ...e, w: 1, h: 1 }, { place: false })}${AT.edit && sel ? `<span class="agrip" data-agrip="${a.id}" title="Arrastrá para cambiar el tamaño"></span><span class="alock">${ib(a.locked ? 'Soltar' : 'Fijar en su lugar', a.locked ? 'mdiLockOutline' : 'mdiLockOpenVariantOutline', `data-lock="${a.id}"`, 'sm')}</span>` : ''}</div>`;
  }).join('');
  const lines = AT.edit ? AT.att.map(a => { const sc = a.scale ? k : 1; return `<line class="alink" x1="${s.x}" y1="${s.y}" x2="${s.x + a.dx * sc + (a.w * sc) / 2}" y2="${s.y + a.dy * sc + (a.h * sc) / 2}"/>`; }).join('') : '';
  const symSel = AT.sel?.kind === 'sym' && AT.edit;
  $('#ascale').innerHTML = `${planSvg(lines)}<div class="asym${symSel ? ' sel' : ''}${AT.edit ? ' editing' : ''}" data-asym style="left:${s.x}px;top:${s.y}px;width:${sz}px;height:${sz}px;--p:${symLevel() * 100}">${ic('mdiCeilingFan')}${symSel ? '<span class="agrip" data-sgrip title="Arrastrá para cambiar el tamaño"></span>' : ''}</div>${sym(440, 110, 'mdiAirConditioner', true)}${sym(360, 300, 'mdiThermometer')}${atts}`;
  fitPlan();
}
/** El plano se dibuja en 600 × 400 y se escala entero: letras, íconos y bordes juntos. */
function fitPlan() {
  const host = $('#aplan'), inner = $('#ascale');
  if (!host || !inner) return;
  const k = Math.min(host.clientWidth / 600, host.clientHeight / 400 || Infinity);
  inner.style.transform = `scale(${k})`;
  AT.k = k;
}
window.addEventListener('resize', () => screen === 'pegados' && fitPlan());
function paintAttSide() {
  const s = AT.sym;
  const list = AT.att.map(a => { const e = attEl(a); const on = AT.sel?.kind === 'att' && AT.sel.id === a.id; return `<div class="arow${on ? ' on' : ''}" data-pick="${a.id}"><span class="aprev">${renderEl({ ...e, w: 1, h: 1 }, { place: false })}</span><span class="t">${esc(e.text)}</span>${ib(a.locked ? 'Soltar' : 'Fijar en su lugar', a.locked ? 'mdiLockOutline' : 'mdiLockOpenVariantOutline', `data-lock="${a.id}"`, 'sm')}${ib('Quitar del plano', 'mdiTrashCanOutline', `data-adel="${a.id}"`, 'sm danger')}</div>`; }).join('');
  const add = AT.pop ? `<div class="apick">${DS.r.vent.els.map(e => `<div class="apickr" role="button" tabindex="0" data-addfrom="${e.id}"><span class="aprev">${renderEl({ ...e, w: 1, h: 1 }, { place: false })}</span><span>${esc(e.text)}</span></div>`).join('')}</div>` : '';
  let props = '';
  const a = AT.sel?.kind === 'att' && attById(AT.sel.id);
  if (a) {
    const o = a.over;
    props = `<div class="isec">${esc(attEl(a).text)}</div>${row('mdiArrowLeftRight', 'Ancho', `<div class="islider"><input type="range" min="50" max="300" value="${Math.round(a.w)}" data-asz="w" aria-label="Ancho"><output data-out="w">${Math.round(a.w)}</output></div>`)}${row('mdiArrowUpDown', 'Alto', `<div class="islider"><input type="range" min="28" max="200" value="${Math.round(a.h)}" data-asz="h" aria-label="Alto"><output data-out="h">${Math.round(a.h)}</output></div>`)}${row('mdiFormatSize', 'Tamaño de letra', `<div class="islider"><input type="range" min="8" max="24" value="${o.fs ?? 12}" data-ao="fs" aria-label="Letra"><output>${o.fs ?? 12}</output></div>`)}${row('mdiNumeric', 'Tamaño del valor', `<div class="islider"><input type="range" min="12" max="40" value="${o.vsz ?? 20}" data-ao="vsz" aria-label="Valor"><output>${o.vsz ?? 20}</output></div>`)}${row('mdiFormatColorFill', 'Fondo', swatchesA('bg', o.bg))}${row('mdiFormatColorText', 'Letra e ícono', swatchesA('fg', o.fg))}${row('mdiSquareRoundedOutline', 'Esquinas', `<div class="islider"><input type="range" min="0" max="40" value="${Math.min(40, o.rad ?? 14)}" data-ao="rad" aria-label="Esquinas"><button type="button" class="pillbtn" data-aset="rad" data-val="999" aria-pressed="${(o.rad ?? 0) >= 999}" title="Píldora">${ic('mdiCircleOutline', 'sm')}</button></div>`)}${row('mdiOpacity', 'Opacidad', `<div class="islider"><input type="range" min="30" max="100" value="${Math.round((o.op ?? 1) * 100)}" data-ao="op" aria-label="Opacidad"><output>${Math.round((o.op ?? 1) * 100)}%</output></div>`)}${row('mdiShapeOutline', 'Relieve', `<div class="seg">${[['relieve', 'Con relieve'], ['plano', 'Plano'], ['contorno', 'Contorno']].map(([v, t]) => `<button type="button" data-aset="relief" data-val="${v}" aria-pressed="${(o.relief ?? attEl(a).relief) === v}">${t}</button>`).join('')}</div>`)}${row('mdiResize', 'Crece con el símbolo', `<input type="checkbox" class="switch" data-ascale ${a.scale ? 'checked' : ''} aria-label="Crece con el símbolo">`)}`;
  } else if (AT.sel?.kind === 'sym') props = '';
  $('#aside').innerHTML = `<div class="nb"><div class="page"><div class="phead"><span class="tile htile">${ic('mdiCeilingFan')}</span><h2><span class="crumb">Living</span>Ventilador living</h2>${ib('Cerrar', 'mdiClose')}</div><div class="pbody"><div class="ibody flat">${row('mdiResize', 'Tamaño del símbolo', `<div class="islider"><input type="range" min="60" max="200" value="${Math.round(s.size * 100)}" data-ssz aria-label="Tamaño del símbolo"><output data-out="s">${Math.round(s.size * 100)}%</output></div>`)}<div class="isec">Junto al símbolo ${ib('Agregar un elemento del control', 'mdiPlus', 'data-aadd', 'sm')}</div>${add}<div class="alist">${list}</div>${props}</div></div></div></div>`;
}
const swatchesA = (key, val) => `<div class="sw">${['', ...SWATCH].map(c => `<button type="button" class="${c ? '' : 'auto'}" data-aset="${key}" data-val="${c}" style="--c:${c || 'transparent'}" aria-pressed="${(val ?? '') === c}" title="${c || 'Como en el control'}"></button>`).join('')}<label class="swc" title="Otro color"><input type="color" data-acolor="${key}" value="${/^#/.test(val) ? val : '#4f7a5a'}" aria-label="Otro color">${ic('mdiEyedropperVariant', 'sm')}</label></div>`;
/** Mientras se arrastra, el panel muestra los mismos números. */
function syncNumbers(a) {
  for (const k of ['w', 'h']) {
    const r = $(`[data-asz="${k}"]`), o = $(`[data-out="${k}"]`);
    if (r) r.value = Math.round(a[k]);
    if (o) o.textContent = Math.round(a[k]);
  }
}
function bindPegados() {
  const app = $('#app');
  app.onclick = ev => {
    const t = ev.target;
    const top = t.closest('[data-top]');
    if (top) {
      if (top.dataset.top === 'edit') { AT.edit = !AT.edit; return renderPegados(); }
      return top.dataset.top === 'theme' ? toggleTheme() : go('menu');
    }
    const lock = t.closest('[data-lock]');
    if (lock) { const a = attById(lock.dataset.lock); a.locked = !a.locked; return renderPegados(); }
    const del = t.closest('[data-adel]');
    if (del) { AT.att = AT.att.filter(a => a.id !== del.dataset.adel); AT.sel = null; return renderPegados(); }
    if (t.closest('[data-aadd]')) { AT.pop = !AT.pop; return paintAttSide(); }
    const from = t.closest('[data-addfrom]');
    if (from) {
      const id = 'w' + AT.n++;
      const e = ventEl(from.dataset.addfrom);
      AT.att.push({ id, from: e.id, dx: 30, dy: 30 + AT.att.length * 10, w: e.cat === 'niveles' ? 128 : 56, h: 46, locked: false, scale: true, over: { fs: 10, rad: e.rad } });
      AT.sel = { kind: 'att', id };
      AT.pop = false;
      return renderPegados();
    }
    const pick = t.closest('[data-pick]');
    if (pick) { AT.sel = { kind: 'att', id: pick.dataset.pick }; return renderPegados(); }
    const aset = t.closest('[data-aset]');
    if (aset && AT.sel?.kind === 'att') { const a = attById(AT.sel.id); const v = aset.dataset.val; a.over[aset.dataset.aset] = aset.dataset.aset === 'rad' ? Number(v) : v; return renderPegados(); }
    // Fuera de la edición, el control funciona: velocidad, luz, temporizador.
    const attEl0 = t.closest('[data-att]');
    if (attEl0 && !AT.edit) {
      const a = attById(attEl0.dataset.att);
      const op = t.closest('[data-op]');
      if (op) { operateEl(ventEl(a.from), op.dataset.op, op.dataset.v); paintPlanA(); }
    }
  };
  app.oninput = ev => {
    const t = ev.target;
    if (t.dataset.ssz !== undefined) { AT.sym.size = Number(t.value) / 100; const out = $('[data-out="s"]'); if (out) out.textContent = `${t.value}%`; return paintPlanA(); }
    const a = AT.sel?.kind === 'att' && attById(AT.sel.id);
    if (!a) return;
    if (t.dataset.asz) { a[t.dataset.asz] = Number(t.value); syncNumbers(a); return paintPlanA(); }
    if (t.dataset.ao) { const k = t.dataset.ao; a.over[k] = k === 'op' ? Number(t.value) / 100 : Number(t.value); const out = t.parentElement.querySelector('output'); if (out) out.textContent = k === 'op' ? `${t.value}%` : t.value; return paintPlanA(); }
    if (t.dataset.acolor) { a.over[t.dataset.acolor] = t.value; return paintPlanA(); }
  };
  app.onchange = ev => {
    if (ev.target.dataset.ascale !== undefined && AT.sel?.kind === 'att') { attById(AT.sel.id).scale = ev.target.checked; renderPegados(); }
  };
  app.onpointerdown = ev => {
    if (!AT.edit) return;
    const t = ev.target;
    if (t.closest('[data-lock]')) return;
    const toPlan = e => [e.clientX / AT.k, e.clientY / AT.k];
    const agrip = t.closest('[data-agrip]'), sgrip = t.closest('[data-sgrip]');
    const attNode = t.closest('[data-att]'), symNode = t.closest('[data-asym]');
    if (agrip) { const a = attById(agrip.dataset.agrip); AT.drag = { kind: 'agrip', a, p0: toPlan(ev), w0: a.w, h0: a.h }; }
    else if (sgrip) AT.drag = { kind: 'sgrip', p0: toPlan(ev), s0: AT.sym.size };
    else if (attNode) {
      const a = attById(attNode.dataset.att);
      AT.sel = { kind: 'att', id: a.id };
      if (!a.locked) AT.drag = { kind: 'att', a, p0: toPlan(ev), d0: [a.dx, a.dy] };
      paintPlanA();
      paintAttSide();
    } else if (symNode) { AT.sel = { kind: 'sym' }; AT.drag = { kind: 'sym', p0: toPlan(ev), s0: { ...AT.sym } }; renderPegados(); }
    else if (t.closest('#aplan')) { AT.sel = null; renderPegados(); }
    if (AT.drag) ev.preventDefault();
  };
  app.onpointermove = ev => {
    const d = AT.drag;
    if (!d) return;
    const p = [ev.clientX / AT.k, ev.clientY / AT.k];
    const dx = p[0] - d.p0[0], dy = p[1] - d.p0[1];
    if (d.kind === 'sym') { AT.sym.x = Math.max(30, Math.min(570, d.s0.x + dx)); AT.sym.y = Math.max(30, Math.min(370, d.s0.y + dy)); }
    else if (d.kind === 'att') {
      const sc = d.a.scale ? AT.sym.size : 1;
      // Imán suave: se alinea con el centro del símbolo.
      let nx = d.d0[0] + dx / sc, ny = d.d0[1] + dy / sc;
      if (Math.abs(ny + d.a.h / 2) < 6) ny = -d.a.h / 2;
      if (Math.abs(nx + d.a.w / 2) < 6) nx = -d.a.w / 2;
      // Nunca sale del plano.
      nx = Math.max(-AT.sym.x / sc, Math.min((600 - AT.sym.x) / sc - d.a.w, nx));
      ny = Math.max(-AT.sym.y / sc, Math.min((400 - AT.sym.y) / sc - d.a.h, ny));
      d.a.dx = nx; d.a.dy = ny;
    } else if (d.kind === 'agrip') {
      const sc = d.a.scale ? AT.sym.size : 1;
      d.a.w = Math.max(50, Math.min(300, d.w0 + dx / sc));
      d.a.h = Math.max(28, Math.min(200, d.h0 + dy / sc));
      syncNumbers(d.a);
    } else if (d.kind === 'sgrip') {
      AT.sym.size = Math.max(0.6, Math.min(2, d.s0 + (dx + dy) / 80));
      const r = $('[data-ssz]'), o = $('[data-out="s"]');
      if (r) r.value = Math.round(AT.sym.size * 100);
      if (o) o.textContent = `${Math.round(AT.sym.size * 100)}%`;
    }
    paintPlanA();
  };
  app.onpointerup = () => { if (AT.drag) { AT.drag = null; paintAttSide(); } };
}
