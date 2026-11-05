/* ——— Parte 2: menú ☰, indicadores de símbolos y controles RF/IR ——— */

/* Indicadores: elementos visuales que dependen de una lectura */
const FX = {
  ring: { icon: 'mdiCircleSlice5', t: 'Anillo' }, border: { icon: 'mdiCheckboxBlankCircleOutline', t: 'Borde' }, icon: { icon: 'mdiFormatColorFill', t: 'Color del icono' },
  led: { icon: 'mdiLedOn', t: 'LED' }, num: { icon: 'mdiFormatSuperscript', t: 'Número' }, label: { icon: 'mdiLabelOutline', t: 'Etiqueta' },
};
const FXDATA = {
  cortina: [{ t: 'ring', src: 'Posición', v: 75, min: 0, max: 100, a: '#6F6BB8', b: '#DCD8EE', w: 4, mode: 'fixed', on: true }, { t: 'label', src: 'Posición', on: true }],
  term: [{ t: 'border', src: 'Temperatura', v: 27, mode: 'range', stops: [[-40, 18, '#4F8FBF'], [18, 26, '#3F8F5F'], [26, 60, '#D98B1F']], on: true }, { t: 'num', src: 'Humedad', v: 48, pos: 'br', on: true }, { t: 'label', src: 'Temperatura', on: true }],
  router: [{ t: 'led', src: 'Conexión', v: 'En línea', mode: 'state', map: { 'En línea': '#3F8F5F', 'Sin conexión': '#D0453A' }, on: true }],
  aire: [{ t: 'icon', src: 'Modo', v: 'Frío', mode: 'state', map: { Frío: '#4F8FBF', Calor: '#D0453A', Seco: '#C9A66B', Ventilar: '#5F6E66' }, on: true }, { t: 'led', src: 'Encendido', v: 'Prendido', mode: 'state', map: { Prendido: '#3F8F5F', Apagado: '#9AA59F' }, on: true }, { t: 'label', src: 'Temperatura', on: true }],
  robot: [{ t: 'num', src: 'Batería', v: 92, pos: 'tr', on: true }, { t: 'label', src: 'Estado', on: true }],
  maceta: [{ t: 'ring', src: 'Humedad del suelo', v: 18, min: 0, max: 100, a: '#D0453A', b: '#E3E7E1', w: 4, mode: 'range', stops: [[0, 20, '#D0453A'], [20, 40, '#D98B1F'], [40, 100, '#3F8F5F']], on: true }, { t: 'label', src: 'Humedad del suelo', on: true }],
  medidor: [{ t: 'border', src: 'Potencia', v: 1240, mode: 'range', stops: [[0, 1000, '#3F8F5F'], [1000, 3000, '#D98B1F'], [3000, 9999, '#D0453A']], on: true }, { t: 'label', src: 'Potencia', on: true }],
};
DEV.forEach(d => { d.fx = FXDATA[d.id] || (d.value ? [{ t: 'label', src: d.readings[0] || 'Estado', on: true }] : []); });
const fxOn = (d, t) => (d.fx || []).some(f => f.t === t && f.on);
function fxColor(f, v = f.v) {
  if (f.mode === 'state') return f.map[v] || '#9AA59F';
  if (f.mode === 'range') { const s = f.stops.find(x => v >= x[0] && v < x[1]) || f.stops[f.stops.length - 1]; return s[2]; }
  return f.a;
}
function fxHTML(d) {
  let h = '';
  for (const f of d.fx || []) {
    if (!f.on) continue;
    if (f.t === 'ring') { const p = clamp(((f.v - f.min) / (f.max - f.min)) * 100, 0, 100); h += `<span class="fx-ring" style="--p:${p};--fa:${fxColor(f)};--fb:${f.b};--fw:${f.w}px"></span>`; }
    if (f.t === 'led') h += `<span class="fx-led" style="--fc:${fxColor(f)}"></span>`;
    if (f.t === 'num') h += `<span class="fx-num ${f.pos}">${esc(f.v)}</span>`;
  }
  return h;
}
function fxStyle(d) {
  let s = '';
  for (const f of d.fx || []) {
    if (!f.on) continue;
    if (f.t === 'border') s += `--bc:${fxColor(f)};`;
    if (f.t === 'icon') s += `--c:${fxColor(f)};`;
  }
  return s;
}
function fxSummary(f) {
  if (f.t === 'ring') return `${f.src} · ${f.min}–${f.max}`;
  if (f.t === 'num') return `${f.src} · ${({ tr: 'arriba', br: 'abajo', b: 'debajo' })[f.pos]}`;
  if (f.mode === 'state') return `${f.src} · ${Object.keys(f.map).length} estados`;
  if (f.mode === 'range') return `${f.src} · ${f.stops.length} rangos`;
  return f.src;
}
function fxEditor(d, f, i) {
  const src = `<div class="row wide" style="grid-template-columns:24px auto 1fr">${ic('mdiDatabaseArrowRightOutline')}<span class="pill">${esc(f.src)}${ic('mdiChevronDown', 'sm')}</span><span></span></div>`;
  const sw = (c, act, tip) => `<label class="sw" style="--c:${c}" data-tip="${tip}"><input type="color" value="${c}" data-bind="${act}" data-i="${i}" style="opacity:0;width:100%;height:100%;cursor:pointer" aria-label="${tip}"></label>`;
  const scale = () => f.mode === 'state'
    ? `<div class="scale">${Object.entries(f.map).map(([k, c]) => `<div class="srow">${sw(c, 'fxmap:' + k, 'Color para ' + k)}<span class="chip" style="padding-right:10px">${esc(k)}</span><span class="grow"></span>${ib('x', 'mdiClose', 'Quitar')}</div>`).join('')}<button type="button" class="chip add">${ic('mdiPlus', 'sm')}</button></div>`
    : `<div class="scale">${f.stops.map((s, k) => `<div class="srow">${sw(s[2], 'fxstop:' + k, 'Color del rango')}<label class="num" style="width:76px"><input type="number" value="${s[0]}" aria-label="Desde"></label><span class="muted">–</span><label class="num" style="width:76px"><input type="number" value="${s[1]}" aria-label="Hasta"></label>${ib('x', 'mdiClose', 'Quitar')}</div>`).join('')}<button type="button" class="chip add" data-tip="Agregar rango">${ic('mdiPlus', 'sm')}</button></div>`;
  const modeSeg = `<div class="seg">${[['fixed', 'mdiCircle', 'Un color'], ['range', 'mdiGradientHorizontal', 'Por rango de valores'], ['state', 'mdiFormatListBulleted', 'Por estado']].filter(m => f.t !== 'ring' || m[0] !== 'state').map(m => ib(`fxmode:${i}:${m[0]}`, m[1], m[2], (f.mode || 'fixed') === m[0] ? 'on' : '')).join('')}</div>`;
  let body = src;
  if (f.t === 'ring') {
    body += `<div style="display:grid;grid-template-columns:24px 1fr 12px 1fr;gap:10px;align-items:center">${ic('mdiArrowExpandHorizontal')}<label class="num" data-tip="Mínimo"><input type="number" value="${f.min}" aria-label="Mínimo"></label><span class="muted">–</span><label class="num" data-tip="Máximo"><input type="number" value="${f.max}" aria-label="Máximo"></label></div>
      <div class="row">${ic('mdiFormatLineWeight')}<input type="range" min="2" max="10" value="${f.w}" data-bind="fxw" data-i="${i}" aria-label="Grosor" data-tip="Grosor"><label class="num"><input type="number" value="${f.w}" data-bind="fxw" data-i="${i}" aria-label="Grosor en px"><span>px</span></label></div>
      <div class="row wide" style="grid-template-columns:24px auto 1fr auto">${ic('mdiPaletteOutline')}${modeSeg}<span></span><span style="display:flex;gap:6px">${f.mode === 'range' ? '' : sw(f.a, 'fxa', 'Parte llena')}${sw(f.b, 'fxb', 'Parte vacía')}</span></div>${f.mode === 'range' ? scale() : ''}`;
  } else if (f.t === 'border' || f.t === 'icon' || f.t === 'led') {
    body += `<div class="row wide" style="grid-template-columns:24px auto 1fr">${ic('mdiPaletteOutline')}${modeSeg}<span></span></div>${f.mode === 'fixed' || !f.mode ? `<div class="swatches" style="padding-left:36px">${sw(f.a || '#4F7A5A', 'fxa', 'Color')}</div>` : scale()}`;
  } else if (f.t === 'num') {
    body += `<div class="row wide" style="grid-template-columns:24px auto 1fr">${ic('mdiFormatSuperscript')}<div class="seg">${[['tr', 'mdiArrowTopRight', 'Arriba a la derecha'], ['br', 'mdiArrowBottomRight', 'Abajo a la derecha'], ['b', 'mdiArrowDown', 'Debajo']].map(p => ib(`fxpos:${i}:${p[0]}`, p[1], p[2], f.pos === p[0] ? 'on' : '')).join('')}</div><span></span></div>`;
  } else if (f.t === 'label') {
    body += `<div class="row wide" style="grid-template-columns:24px auto 1fr">${ic('mdiDecimal')}<div class="seg">${['0', '0,0', '0,00'].map((v, k) => `<button type="button" class="ib ${k === 0 ? 'on' : ''}" style="width:auto;padding:0 10px;font-size:13px" data-tip="Decimales">${v}</button>`).join('')}</div><span></span></div>`;
  }
  return `<div class="fxed">${body}</div>`;
}
function indicBody(d) {
  const sel = S.fxSel[d.id] ?? 0, f = d.fx[sel];
  const num = f && ['ring', 'border', 'num'].includes(f.t) && typeof f.v === 'number';
  const missing = Object.keys(FX).filter(t => !d.fx.some(x => x.t === t));
  return `<div class="fxprev"><span class="sym big" data-shape="${d.shape}" style="--px:84;--k:1;--c:${d.c};--o:${d.op};${fxStyle(d)};position:relative;transform:none;left:auto;top:auto">${ic(d.icon)}${fxHTML(d)}${d.value && fxOn(d, 'label') ? `<span class="val">${esc(d.value)}</span>` : ''}</span>
      ${num ? `<div class="row" style="width:100%">${ic('mdiTestTube')}<input type="range" id="fx-test" min="${f.min ?? 0}" max="${f.max ?? 100}" value="${f.v}" data-bind="fxv" data-i="${sel}" aria-label="Probar valor" data-tip="Probá distintos valores: el plano cambia en vivo"><label class="num"><input type="number" value="${f.v}" data-bind="fxv" data-i="${sel}" aria-label="Valor de prueba"></label></div>` : ''}</div>
    <div class="list">${d.fx.map((x, i) => `<div class="li ${i === sel ? 'sel' : ''}" data-act="fxsel:${i}" style="cursor:pointer;min-height:46px"><span class="ico-tile" style="width:30px;height:30px">${ic(FX[x.t].icon, 'sm')}</span><div class="t"><b>${FX[x.t].t}</b><span>${esc(fxSummary(x))}</span></div>${ib('fxeye:' + i, x.on ? 'mdiEyeOutline' : 'mdiEyeOffOutline', x.on ? 'Ocultar' : 'Mostrar')}${ib('fxrm:' + i, 'mdiTrashCanOutline', 'Quitar')}</div>`).join('')}</div>
    ${f ? fxEditor(d, f, sel) : ''}
    ${missing.length ? `<div class="addmods">${missing.map(t => `<button type="button" data-act="fxadd:${t}" data-tip="Agregar ${FX[t].t.toLowerCase()}">${ic('mdiPlus', 'sm')}${ic(FX[t].icon, 'sm')}${FX[t].t}</button>`).join('')}</div>` : ''}`;
}

/* Menú ☰ */
const NAV = [
  ['Editar', [['tool:sym', 'mdiCursorDefaultClickOutline', 'Símbolos'], ['tool:plan', 'mdiFloorPlan', 'Plano y espacios'], ['tool:now', 'mdiViewDashboardEditOutline', 'Panel Ahora'], ['tool:view', 'mdiMagnifyExpand', 'Tamaño y vista']]],
  ['Ajustes', TABS.map(t => ['set:' + t[0], t[1], t[2]])],
];
function renderNav() {
  const host = $('#navhost');
  if (!S.nav) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="scrim" data-act="navclose"></div><nav class="navdrawer" aria-label="Menú"><div class="navhead">${ic('mdiHomeOutline', 'lg')}<b>${esc(S.home)}</b>${ib('navclose', 'mdiClose', 'Cerrar')}</div>
    ${NAV.map(([g, items]) => `<div class="lbl" style="padding:14px 16px 6px">${g}<span class="grow"></span></div>${items.map(([act, icon, name]) => `<button type="button" class="navit" data-act="nav:${act.replace(':', '|')}">${ic(icon)}<span>${name}</span></button>`).join('')}`).join('')}</nav>`;
}

/* ——— Controles RF / IR ——— */
const NODES = [
  { id: 'athom1', name: 'Athom living', rf: true, ir: true, ok: true, star: true },
  { id: 'athom2', name: 'Athom dormitorio', rf: false, ir: true, ok: true },
  { id: 'esp3', name: 'ESP balcón', rf: true, ir: false, ok: false },
];
let REMOTES = [
  { id: 'aire2', name: 'Aire oficina', icon: 'mdiAirConditioner', src: 'ir', btns: 12, linked: 'Aire oficina' },
  { id: 'vent', name: 'Ventilador dormitorio', icon: 'mdiCeilingFan', src: 'rf', btns: 6, linked: 'Ventilador' },
  { id: 'tv', name: 'Televisor', icon: 'mdiTelevision', src: 'ir', btns: 9, linked: null },
];
let LEARNED = [];
const SUGG = ['Encender', 'Apagar', 'Subir', 'Bajar', 'Modo', 'Ventilador', 'Turbo', 'Swing'];
let DESIGN = [
  { id: 'e1', t: 'toggle', label: 'Encender', icon: 'mdiPower', w: 2 }, { id: 'e2', t: 'pair', label: 'Temperatura', icon: 'mdiThermometer', w: 2 },
  { id: 'e3', t: 'options', label: 'Modo', icon: 'mdiSnowflake', w: 4, opts: ['Frío', 'Calor', 'Seco', 'Ventilar'] },
  { id: 'e4', t: 'steps', label: 'Ventilador', icon: 'mdiFan', w: 4, steps: 4 },
  { id: 'e5', t: 'button', label: 'Turbo', icon: 'mdiWeatherWindy', w: 1 }, { id: 'e6', t: 'button', label: 'Swing', icon: 'mdiArrowOscillating', w: 1 },
  { id: 'e7', t: 'button', label: 'Silencio', icon: 'mdiVolumeOff', w: 1 }, { id: 'e8', t: 'button', label: 'Timer', icon: 'mdiTimerOutline', w: 1 },
];
const ETYPES = { button: ['mdiGestureTap', 'Botón'], toggle: ['mdiPower', 'Encender/apagar'], pair: ['mdiPlusMinusVariant', 'Bajar/subir'], steps: ['mdiTuneVertical', 'Pasos'], options: ['mdiFormatListBulleted', 'Opciones'], text: ['mdiFormatText', 'Texto'] };
function wave(seed, w = 90, h = 22, color = 'var(--brand)') {
  let x = 0, r = seed * 9301 + 49297, d = '';
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  while (x < w) { const on = 2 + rnd() * 5, off = 2 + rnd() * (x < 8 ? 2 : 6); d += `M${x.toFixed(1)} ${h - 3}V3H${(x + on).toFixed(1)}V${h - 3}`; x += on + off; }
  return `<svg viewBox="0 0 ${w} ${h}" style="width:${w}px;height:${h}px;display:block"><path d="${d}" style="stroke:${color}" stroke-width="1.4" fill="none"/></svg>`;
}
const STEPS = [['new', 'mdiRemote', 'Control'], ['learn', 'mdiAccessPoint', 'Aprender'], ['test', 'mdiPlayCircleOutline', 'Probar'], ['design', 'mdiPencilRuler', 'Diseñar']];
function stepper(cur) {
  const k = STEPS.findIndex(s => s[0] === cur);
  return `<div class="stepper">${STEPS.map((s, i) => `<button type="button" class="st ${i < k ? 'done' : i === k ? 'cur' : ''}" data-act="rfgo:${s[0]}" data-tip="${s[2]}"><span>${ic(i < k ? 'mdiCheck' : s[1], 'sm')}</span><em>${s[2]}</em></button>${i < STEPS.length - 1 ? '<i></i>' : ''}`).join('')}</div>`;
}
let learnTimer = null;
function stopLearn() { if (learnTimer) { clearInterval(learnTimer); learnTimer = null; } }
function startLearn() {
  stopLearn(); S.rf.listening = true; S.rf.left = 15;
  learnTimer = setInterval(() => {
    if (S.set !== 'rf' || S.rf.view !== 'learn') { stopLearn(); return; }
    S.rf.left -= 1;
    if (S.rf.left % 3 === 0 && LEARNED.length < 4) {
      const n = LEARNED.length; LEARNED.push({ id: 'b' + Date.now(), name: SUGG[n] || 'Botón ' + (n + 1), seed: n + 3, ok: n !== 2, fresh: true });
      S.rf.pulse = Date.now();
    }
    if (S.rf.left <= 0 || LEARNED.length >= 4 && S.rf.left < 3) { S.rf.listening = false; stopLearn(); }
    renderSide();
  }, 1000);
}
function rfPanel() {
  const v = S.rf.view;
  const head = (title, back, extra = '') => `<div class="dh">${back ? ib('rfgo:' + back, 'mdiArrowLeft', 'Volver') : ''}<h2>${title}</h2>${extra}${ib('close-set', 'mdiClose', 'Cerrar')}</div>`;
  const tabs = `<div class="stabs" role="tablist">${TABS.map(t => ib('set:' + t[0], t[1], t[2], S.set === t[0] ? 'on' : '')).join('')}</div>`;
  if (!v) {
    return head('Controles', null, ib('rfgo:new', 'mdiPlus', 'Nuevo control')) + tabs + `<div class="dbody">
      <div class="nodes">${NODES.map(n => `<button type="button" class="node" data-act="rfgo:devices"><span class="dot" style="--c:var(--${n.ok ? 'ok' : 'alert'})"></span><b>${esc(n.name)}</b><span class="caps">${n.rf ? `<span class="cap">${ic('mdiAccessPoint', 'sm')}RF</span>` : ''}${n.ir ? `<span class="cap">${ic('mdiRemoteTv', 'sm')}IR</span>` : ''}</span></button>`).join('')}</div>
      <div class="list">${REMOTES.map(r => `<div class="li" data-act="rfgo:remote" style="cursor:pointer"><span class="ico-tile">${ic(r.icon)}</span><div class="t"><b>${esc(r.name)}</b><span>${r.btns} botones${r.linked ? ' · en el plano' : ''}</span></div><span class="cap ${r.src}">${r.src.toUpperCase()}</span><div class="acts">${ib('rfgo:design', 'mdiPencilRuler', 'Diseñar')}${ib('rfgo:learn', 'mdiAccessPoint', 'Aprender más botones')}</div></div>`).join('')}</div></div>`;
  }
  if (v === 'devices') {
    return head('Equipos', 'list') + `<div class="dbody"><div class="list">${NODES.map(n => `<div class="li" style="align-items:flex-start"><span class="ico-tile">${ic('mdiChip')}</span><div class="t"><b>${esc(n.name)} ${n.star ? `<span data-tip="Receptor por defecto" style="color:var(--warn);display:inline-block;vertical-align:-3px">${ic('mdiStar', 'sm')}</span>` : ''}</b>
      <div class="chips" style="margin-top:6px">${[['RF envía', n.rf], ['RF recibe', n.rf], ['IR envía', n.ir], ['IR recibe', n.ir]].map(c => `<span class="cap ${c[1] ? 'yes' : 'no'}">${ic(c[1] ? 'mdiCheck' : 'mdiClose', 'sm')}${c[0]}</span>`).join('')}</div>${n.ok ? '' : `<span style="color:var(--alert)">Falta el paquete HomeManager RF</span>`}</div>
      <div style="display:flex">${ib('rflisten', 'mdiEarHearing', 'Probar recepción')}${ib('x', 'mdiCodeTags', 'Ver YAML para ESPHome')}</div></div>`).join('')}</div>
      ${S.rf.heard ? `<div class="card okcard">${ic('mdiCheckCircleOutline')}<div><b>Recibe bien</b><div class="small muted">NEC · 32 bits · pulso 562 µs · Athom living</div></div></div>` : ''}</div>`;
  }
  if (v === 'remote') {
    return head('Aire oficina', 'list', `<span class="cap ir">IR</span>`) + `<div class="dbody">
      <div class="rprev" data-act="rfgo:design" data-tip="Diseñar">${DESIGN.slice(0, 4).map(e => `<span class="pe" style="grid-column:span ${e.w}">${ic(e.icon, 'sm')}${esc(e.label)}</span>`).join('')}</div>
      <div style="display:flex;gap:2px">${ib('rfgo:learn', 'mdiAccessPoint', 'Aprender más botones')}${ib('rfgo:design', 'mdiPencilRuler', 'Diseñar')}${ib('x', 'mdiHomeAssistant', 'Entidades en Home Assistant')}${ib('x', 'mdiTune', 'Emisor y portadora')}<span class="grow"></span>${ib('x', 'mdiTrashCanOutline', 'Borrar control', 'danger')}</div>
      <div class="lbl">Botones<span class="grow"></span></div>
      <div class="list">${['Encender', 'Apagar', 'Subir', 'Bajar', 'Modo', 'Turbo'].map((n, i) => `<div class="li"><span class="dot" style="--c:var(--${i === 4 ? 'warn' : 'ok'})" data-tip="${i === 4 ? 'Sin confirmar' : 'Probado'}"></span><div class="t"><b>${n}</b>${wave(i + 3)}</div><div class="acts">${ib('rfsend', 'mdiPlay', 'Enviar')}${ib('x', 'mdiRefresh', 'Volver a aprender (conserva vínculos)')}${ib('rfgo:sheet', 'mdiWaveform', 'Ficha técnica')}</div></div>`).join('')}</div></div>`;
  }
  if (v === 'new') {
    const kinds = [['mdiAirConditioner', 'Aire'], ['mdiCeilingFan', 'Ventilador'], ['mdiTelevision', 'TV'], ['mdiLightbulbOutline', 'Luz'], ['mdiProjector', 'Proyector'], ['mdiRemote', 'Otro']];
    return head('Nuevo control', 'list') + `<div class="dbody">${stepper('new')}
      <input class="title-in" style="font-size:20px" value="Aire oficina" aria-label="Nombre del control">
      <div class="kinds">${kinds.map((k, i) => `<button type="button" class="kind ${i === 0 ? 'on' : ''}">${ic(k[0], 'lg')}<span>${k[1]}</span></button>`).join('')}</div>
      <div class="lbl">Señal<span class="grow"></span></div>
      <div class="seg big2">${[['ir', 'mdiRemoteTv', 'Infrarrojo'], ['rf', 'mdiAccessPoint', 'Radio 433 MHz']].map(o => `<button type="button" class="ib ${S.rf.src === o[0] ? 'on' : ''}" data-act="rfsrc:${o[0]}" data-tip="${o[2]}">${ic(o[1])}<span>${o[0].toUpperCase()}</span></button>`).join('')}</div>
      <div class="row wide" style="grid-template-columns:24px 1fr">${ic('mdiEarHearing')}<div class="chips">${NODES.filter(n => n[S.rf.src]).map((n, i) => `<span class="chip ${i === 0 ? 'pick' : ''}" style="padding-right:10px" data-tip="Escucha">${ic('mdiChip', 'sm')}${esc(n.name)}</span>`).join('')}</div></div>
      <div class="row wide" style="grid-template-columns:24px 1fr">${ic('mdiBroadcast')}<div class="chips">${NODES.filter(n => n[S.rf.src]).map((n, i) => `<span class="chip ${i === 0 ? 'pick' : ''}" style="padding-right:10px" data-tip="Envía">${ic('mdiChip', 'sm')}${esc(n.name)}</span>`).join('')}</div></div></div>
      <div class="dfoot"><span class="grow"></span><button type="button" class="next" data-act="rfgo:learn">${ic('mdiAccessPoint', 'sm')}Aprender</button></div>`;
  }
  if (v === 'learn') {
    const r = 46, len = 2 * Math.PI * r;
    return head('Aprender', 'new') + `<div class="dbody">${stepper('learn')}
      <div class="listen ${S.rf.listening ? 'on' : ''}" ${S.rf.listening ? '' : 'data-act="rflearn"'}>
        <svg class="count" viewBox="0 0 110 110"><circle cx="55" cy="55" r="${r}" style="stroke:var(--line)" stroke-width="5" fill="none"/><circle cx="55" cy="55" r="${r}" style="stroke:var(--brand)" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - S.rf.left / 15)}" transform="rotate(-90 55 55)"/></svg>
        <span class="waves"><i></i><i></i><i></i></span><span class="core">${ic(S.rf.src === 'ir' ? 'mdiRemoteTv' : 'mdiAccessPoint', 'lg')}</span></div>
      <div class="listen-t">${S.rf.listening ? `<b>Pulsá un botón del control</b><span>${S.rf.left} s · Athom living escucha</span>` : `<b>${LEARNED.length ? 'Listo' : 'Tocá para escuchar'}</b><span>${LEARNED.length ? 'Tocá para aprender más' : 'Uno o varios botones, de a uno'}</span>`}</div>
      <div class="caps-list">${LEARNED.map((b, i) => `<div class="capcard ${b.fresh ? 'fresh' : ''}"><span class="dot" style="--c:var(--${b.ok ? 'ok' : 'warn'})" data-tip="${b.ok ? 'Señal reconocida' : 'Recibido, falta repetir'}"></span>${wave(b.seed)}<input class="name-in" style="box-shadow:none;background:var(--s2)" value="${esc(b.name)}" aria-label="Nombre del botón">${b.ok ? ib('x', 'mdiPlay', 'Probar') : ib('rfrep:' + i, 'mdiRefresh', 'Pulsalo otra vez')}${ib('rfdel:' + i, 'mdiClose', 'Descartar')}</div>`).join('')}</div>
      ${LEARNED.length ? `<div class="chips">${SUGG.slice(LEARNED.length, LEARNED.length + 5).map(s => `<button type="button" class="chip add">${s}</button>`).join('')}</div>` : ''}
      <details class="small"><summary class="muted">${ic('mdiWaveform', 'sm')} Portadora 38 kHz · estimada</summary><div class="row" style="margin-top:8px">${ic('mdiSineWave')}<input type="range" min="30" max="56" value="38" aria-label="Portadora"><label class="num"><input type="number" value="38" aria-label="kHz"><span>kHz</span></label></div></details></div>
      <div class="dfoot">${ib('rfgo:sheet', 'mdiWaveform', 'Ficha técnica')}<span class="grow"></span><button type="button" class="next" data-act="rfgo:test" ${LEARNED.length ? '' : 'disabled'}>${ic('mdiPlayCircleOutline', 'sm')}Probar</button></div>`;
  }
  if (v === 'test') {
    const list = LEARNED.length ? LEARNED : SUGG.slice(0, 4).map((n, i) => ({ name: n, seed: i + 3, ok: true }));
    return head('Probar', 'learn') + `<div class="dbody">${stepper('test')}
      <div class="list">${list.map((b, i) => { const t = S.rf.tests[i] || {}; return `<div class="trow"><div class="li" style="border:0">${wave(b.seed, 60)}<div class="t"><b>${esc(b.name)}</b><span>${t.sent ? (t.ok === true ? 'Funcionó' : t.ok === false ? 'No reaccionó' : 'Enviado · ¿reaccionó?') : 'Sin probar'}</span></div>
        <button type="button" class="ib send ${t.sent && t.ok == null ? 'pulse' : ''}" data-act="rftest:${i}" data-tip="Enviar" aria-label="Enviar">${ic('mdiPlay')}</button>${t.sent && t.ok == null ? ib('rfok:' + i + ':1', 'mdiThumbUpOutline', 'Sí, reaccionó') + ib('rfok:' + i + ':0', 'mdiThumbDownOutline', 'No reaccionó') : t.ok === true ? `<span style="color:var(--ok)">${ic('mdiCheckCircle')}</span>` : ''}</div>
        ${t.ok === false ? `<div class="tune">${ic('mdiTune', 'sm')}<span class="pill">${ic('mdiMinus', 'sm')} 562 µs ${ic('mdiPlus', 'sm')}</span><span class="pill">${ic('mdiRepeat', 'sm')} 3 ${ic('mdiPlus', 'sm')}</span><span class="pill">${ic('mdiBroadcast', 'sm')} Athom dormitorio</span>${ib('rftest:' + i, 'mdiPlay', 'Probar otra vez')}</div>` : ''}</div>`; }).join('')}</div>
      <div class="lbl">Comprobar (opcional)<span class="grow"></span></div>
      <div class="seg">${ib('x', 'mdiSineWave', 'Auto-eco en el mismo equipo')}${ib('x', 'mdiAccessPointNetwork', 'Receptor independiente B')}${ib('x', 'mdiCameraOutline', 'Cámara del teléfono')}${ib('rfgo:sheet', 'mdiChartTimelineVariant', 'Comparar captura y envío')}</div></div>
      <div class="dfoot">${ib('x', 'mdiContentSaveOutline', 'Guardar sin diseñar')}<span class="grow"></span><button type="button" class="next" data-act="rfgo:design">${ic('mdiPencilRuler', 'sm')}Diseñar</button></div>`;
  }
  if (v === 'sheet') {
    const tabsS = [['sum', 'mdiInformationOutline', 'Resumen'], ['sig', 'mdiWaveform', 'Señal'], ['dec', 'mdiCodeBraces', 'Decodificación'], ['emi', 'mdiBroadcast', 'Emisión'], ['tst', 'mdiClipboardCheckOutline', 'Pruebas']];
    return head('Encender · ficha', 'remote', ib('x', 'mdiExportVariant', 'Exportar SVG / PNG')) + `<div class="stabs">${tabsS.map(t => ib('rfsheet:' + t[0], t[1], t[2], S.rf.sheet === t[0] ? 'on' : '')).join('')}</div><div class="dbody">
      <div class="facts">${[['Portadora', '38 kHz', 'estimada'], ['Protocolo', 'NEC', 'reconocido'], ['Datos', '32 bits', '0x20DF10EF'], ['Tramas', '2', 'repetición'], ['Duración', '67,5 ms', '134 tiempos'], ['Emisor', 'Athom living', 'IR Proxy']].map(f => `<div><span>${f[0]}</span><b>${f[1]}</b><em>${f[2]}</em></div>`).join('')}</div>
      <div class="timeline"><div class="tl-tools">${ib('x', 'mdiMagnifyMinusOutline', 'Alejar')}${ib('x', 'mdiMagnifyPlusOutline', 'Acercar')}${ib('x', 'mdiFormatHorizontalAlignLeft', 'Alinear al primer pulso')}<span class="grow"></span><span class="lg-c">Captura</span><span class="lg-p">Envío</span></div>${wave(7, 360, 40)}${wave(7, 360, 40, 'var(--cool)')}<div class="axis"><span>0</span><span>20 ms</span><span>40 ms</span><span>60 ms</span></div></div>
      <div class="lbl">Pulsos y pausas<span class="grow"></span></div>
      <div class="histo">${[30, 72, 12, 46, 8, 3].map((h, i) => `<span style="height:${h}%" data-tip="${[560, 1690, 4500, 9000, 2250, 40000][i]} µs"></span>`).join('')}</div>
      <div class="list">${[['mdiCheckCircle', 'ok', 'Auto-eco', 'Coincide · diferencia máx. 48 µs'], ['mdiHelpCircleOutline', 'muted', 'Receptor B', 'Sin probar'], ['mdiCameraOutline', 'ok', 'Cámara', 'Emisión visible · 05/11 18:20']].map(r => `<div class="li"><span style="color:var(--${r[1]})">${ic(r[0])}</span><div class="t"><b>${r[2]}</b><span>${r[3]}</span></div></div>`).join('')}</div></div>`;
  }
  if (v === 'design') {
    const e = DESIGN.find(x => x.id === S.rf.el) || DESIGN[0];
    return head('Diseño', 'remote', ib('x', 'mdiAutoFix', 'Diseño automático')) + `<div class="dbody">${stepper('design')}
      <div class="lbl">Agregar<span class="grow"></span></div><div class="etypes">${Object.entries(ETYPES).map(([k, v2]) => `<button type="button" class="etype" data-act="eadd:${k}" data-tip="${v2[1]}">${ic(v2[0])}<span>${v2[1]}</span></button>`).join('')}</div>
      <div class="lbl">${ic(ETYPES[e.t][0], 'sm')}${ETYPES[e.t][1]}<span class="grow"></span>${ib('erm:' + e.id, 'mdiTrashCanOutline', 'Quitar elemento')}</div>
      <div class="row wide" style="grid-template-columns:auto 1fr"><button type="button" class="iconbtn" style="width:42px;height:42px" data-tip="Icono">${ic(e.icon)}</button><input class="field" value="${esc(e.label)}" data-bind="elabel" aria-label="Etiqueta"></div>
      <div class="row wide" style="grid-template-columns:24px auto 1fr">${ic('mdiArrowExpandHorizontal')}<div class="seg">${[1, 2, 4].map(w => `<button type="button" class="ib ${e.w === w ? 'on' : ''}" style="width:auto;padding:0 12px;font-size:13px" data-act="ew:${e.id}:${w}" data-tip="Ancho">${w}/4</button>`).join('')}</div><span></span></div>
      <div class="row wide" style="grid-template-columns:24px 1fr;align-items:start">${ic('mdiLinkVariant')}<div class="chips">${(e.t === 'pair' ? ['Bajar', 'Subir'] : e.t === 'toggle' ? ['Encender', 'Apagar'] : e.t === 'options' ? e.opts : e.t === 'steps' ? ['Vel. 1', 'Vel. 2', 'Vel. 3', 'Vel. 4'] : [e.label]).map(b => `<span class="chip">${ic('mdiAccessPoint', 'sm')}${esc(b)}${ic('mdiChevronDown', 'sm')}</span>`).join('')}</div></div>
      <div class="lbl">En el plano<span class="grow"></span></div>
      <div class="li" style="border:1px solid var(--line);border-radius:12px;padding:10px"><span class="ico-tile">${ic('mdiAirConditioner')}</span><div class="t"><b>Aire oficina</b><span>Se abre al mantener pulsado</span></div>${ib('x', 'mdiSwapHorizontal', 'Cambiar símbolo')}</div></div>
      <div class="dfoot">${ib('x', 'mdiHomeAssistant', 'Entidades en Home Assistant')}<span class="grow"></span><button type="button" class="ib primary" data-act="rfgo:remote" data-tip="Listo" aria-label="Listo">${ic('mdiCheck')}</button></div>`;
  }
  return '';
}
function designerStage() {
  const el = (e) => {
    let inner = '';
    if (e.t === 'toggle') inner = `<span class="big-btn">${ic('mdiPower', 'lg')}</span><span>${esc(e.label)}</span>`;
    else if (e.t === 'pair') inner = `<span class="pairb">${ic('mdiMinus')}</span><span class="pl"><b>24°</b>${esc(e.label)}</span><span class="pairb">${ic('mdiPlus')}</span>`;
    else if (e.t === 'options') inner = `<span class="optl">${ic(e.icon, 'sm')}${esc(e.label)}</span><span class="opts">${e.opts.map((o, i) => `<span class="${i === 0 ? 'on' : ''}">${o}</span>`).join('')}</span>`;
    else if (e.t === 'steps') inner = `<span class="optl">${ic(e.icon, 'sm')}${esc(e.label)}</span><span class="stepsb">${Array.from({ length: e.steps }, (_, i) => `<i class="${i < 2 ? 'on' : ''}"></i>`).join('')}</span>`;
    else if (e.t === 'text') inner = `<span class="optl">${esc(e.label)}</span>`;
    else inner = `${ic(e.icon)}<span>${esc(e.label)}</span>`;
    return `<div class="rel t-${e.t} ${S.rf.el === e.id ? 'sel' : ''}" style="grid-column:span ${e.w}" data-act="esel:${e.id}" data-e="${e.id}" draggable="true">${inner}</div>`;
  };
  return `<div class="designer"><div class="remote"><header>${ic('mdiAirConditioner')}<b>Aire oficina</b><span class="cap ir">IR</span></header><div class="rgrid" id="rgrid">${DESIGN.map(el).join('')}</div></div>
    <div class="ptool"><div class="hint">Arrastrá para ordenar · tocá para editar</div><div class="bar">${ib('undo', 'mdiUndo', 'Deshacer')}${ib('x', 'mdiAutoFix', 'Diseño automático')}${ib('x', 'mdiCellphone', 'Ver como en el teléfono')}${ib('x', 'mdiPlay', 'Probar los botones')}</div></div></div>`;
}

/* Acciones de la parte 2; devuelve true si hay que volver a dibujar todo */
function actRF(a, b, c) {
  const d = D();
  switch (a) {
    case 'nav': { S.nav = false; const [x, y] = b.split('|'); if (x === 'tool') { if (S.mode !== 'edit') { S.mode = 'edit'; ORIG = snap(); UNDO = []; S.dirty = 0; } S.set = null; act('tool', y); } else { if (S.mode === 'edit') { S.mode = 'view'; S.tool = null; S.sel = null; } act('set', y); } return false; }
    case 'navopen': S.nav = true; renderNav(); return false;
    case 'navclose': S.nav = false; renderNav(); return false;
    case 'fxsel': S.fxSel[d.id] = Number(b); return true;
    case 'fxeye': d.fx[b].on = !d.fx[b].on; mark(); return true;
    case 'fxrm': mark(); d.fx.splice(Number(b), 1); S.fxSel[d.id] = 0; return true;
    case 'fxadd': mark(); d.fx.push(b === 'ring' ? { t: 'ring', src: d.readings[0] || 'Valor', v: 50, min: 0, max: 100, a: d.c, b: '#E3E7E1', w: 4, mode: 'fixed', on: true } : b === 'num' ? { t: 'num', src: d.readings[0] || 'Valor', v: 50, pos: 'tr', on: true } : b === 'label' ? { t: 'label', src: d.readings[0] || 'Valor', on: true } : { t: b, src: d.readings[0] || 'Estado', v: 'Prendido', mode: 'state', map: { Prendido: '#3F8F5F', Apagado: '#9AA59F' }, on: true }); S.fxSel[d.id] = d.fx.length - 1; return true;
    case 'fxmode': { mark(); const f = d.fx[b]; f.mode = c; if (c === 'range' && !f.stops) f.stops = [[0, 33, '#4F8FBF'], [33, 66, '#3F8F5F'], [66, 100, '#D98B1F']]; if (c === 'state' && !f.map) f.map = { Prendido: '#3F8F5F', Apagado: '#9AA59F' }; if (c === 'fixed' && !f.a) f.a = d.c; if (c === 'range' && typeof f.v !== 'number') f.v = 50; return true; }
    case 'fxpos': mark(); d.fx[b].pos = c; return true;
    case 'rfgo': if (b !== 'learn') stopLearn(); if (b === 'new') { LEARNED = []; S.rf.tests = {}; } S.rf.view = b && b !== 'list' ? b : null; S.rf.heard = false; if (b === 'learn' && !LEARNED.length) startLearn(); return true;
    case 'rflearn': startLearn(); return true;
    case 'rfsrc': S.rf.src = b; return true;
    case 'rfdel': LEARNED.splice(Number(b), 1); return true;
    case 'rfrep': LEARNED[b].ok = true; LEARNED[b].fresh = false; return true;
    case 'rftest': S.rf.tests[b] = { sent: true, ok: null }; S.activity = 'Enviado · la reacción se confirma aparte'; return true;
    case 'rfok': S.rf.tests[b].ok = c === '1'; return true;
    case 'rfsend': S.activity = 'Encender · Enviado'; renderTop(); return false;
    case 'rflisten': S.rf.heard = true; return true;
    case 'rfsheet': S.rf.sheet = b; return true;
    case 'esel': S.rf.el = b; return true;
    case 'ew': DESIGN.find(e => e.id === b).w = Number(c); return true;
    case 'erm': DESIGN = DESIGN.filter(e => e.id !== b); S.rf.el = DESIGN[0]?.id; return true;
    case 'eadd': { const id = 'e' + Date.now(); DESIGN.push({ id, t: b, label: ETYPES[b][1], icon: ETYPES[b][0], w: b === 'options' || b === 'steps' ? 4 : b === 'button' ? 1 : 2, opts: ['A', 'B', 'C'], steps: 3 }); S.rf.el = id; return true; }
  }
  return null;
}
function inputRF(k, el, v) {
  const d = D(), i = Number(el.dataset.i);
  if (k === 'fxv') { const f = d.fx[i]; f.v = Number(v); if (f.t === 'label' || f.t === 'ring') d.value = v + ' %'; document.querySelectorAll('[data-bind="fxv"]').forEach(x => { if (x !== el) x.value = v; }); renderStage(); refreshPrev(d); return true; }
  if (k === 'fxw') { d.fx[i].w = Number(v); renderStage(); refreshPrev(d); return true; }
  if (k === 'fxa' || k === 'fxb') { d.fx[i][k === 'fxa' ? 'a' : 'b'] = v; el.parentElement.style.setProperty('--c', v); renderStage(); refreshPrev(d); return true; }
  if (k.startsWith('fxmap:')) { d.fx[i].map[k.slice(6)] = v; el.parentElement.style.setProperty('--c', v); renderStage(); refreshPrev(d); return true; }
  if (k.startsWith('fxstop:')) { d.fx[i].stops[Number(k.slice(7))][2] = v; el.parentElement.style.setProperty('--c', v); renderStage(); refreshPrev(d); return true; }
  if (k === 'elabel') { const e = DESIGN.find(x => x.id === S.rf.el) || DESIGN[0]; e.label = v; renderStage(); return true; }
  return false;
}
function refreshPrev(d) {
  const p = document.querySelector('.fxprev .sym');
  if (p) { p.setAttribute('style', `--px:84;--k:1;--c:${d.c};--o:${d.op};${fxStyle(d)};position:relative;transform:none;left:auto;top:auto`); p.innerHTML = ic(d.icon) + fxHTML(d) + (d.value && fxOn(d, 'label') ? `<span class="val">${esc(d.value)}</span>` : ''); }
}
/* Arrastrar elementos del diseñador */
let dragE = null;
document.addEventListener('dragstart', e => { const r = e.target.closest?.('.rel'); if (!r) return; dragE = r.dataset.e; r.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', dragE); } catch {} });
document.addEventListener('dragover', e => { if (dragE && e.target.closest?.('.rel')) e.preventDefault(); });
document.addEventListener('drop', e => {
  const t = e.target.closest?.('.rel'); if (!dragE || !t) return; e.preventDefault();
  const from = DESIGN.findIndex(x => x.id === dragE), to = DESIGN.findIndex(x => x.id === t.dataset.e);
  if (from !== to) { const [m] = DESIGN.splice(from, 1); DESIGN.splice(to, 0, m); }
  dragE = null; renderStage();
});
go(location.hash.slice(1) || 'inicio');
