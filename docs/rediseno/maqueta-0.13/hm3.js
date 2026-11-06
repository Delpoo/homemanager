/* ——— Parte 3: de dónde salen los datos de los indicadores, diseñador avanzado,
   comprobaciones y base de controles ——— */

/* Tipos de dato, como los deduce HomeManager de Home Assistant */
const KIND = { number: ['mdiNumeric', 'Número'], binary: ['mdiToggleSwitchOutline', 'Sí / no'], enum: ['mdiFormatListBulleted', 'Estados'], text: ['mdiFormatText', 'Texto'] };
const SRC = {
  'cover.cortina_dormitorio#current_position': { dev: 'cortina', name: 'Posición', kind: 'number', unit: '%', min: 0, max: 100, now: 75, how: 'cover › atributo current_position' },
  'cover.cortina_dormitorio': { dev: 'cortina', name: 'Estado', kind: 'enum', opts: { open: 'Abierta', opening: 'Abriendo', closing: 'Cerrando', closed: 'Cerrada' }, now: 'open', how: 'cover › estado' },
  'sensor.bano_temperatura': { dev: 'term', name: 'Temperatura', kind: 'number', unit: '°C', min: -10, max: 50, now: 27, how: 'sensor › device_class temperature' },
  'sensor.bano_humedad': { dev: 'term', name: 'Humedad', kind: 'number', unit: '%', min: 0, max: 100, now: 48, how: 'sensor › device_class humidity' },
  'binary_sensor.router_conectado': { dev: 'router', name: 'Conexión', kind: 'binary', opts: { on: 'Conectado', off: 'Desconectado' }, now: 'on', how: 'binary_sensor › device_class connectivity' },
  'sensor.router_clientes': { dev: 'router', name: 'Equipos conectados', kind: 'number', unit: '', min: 0, max: 40, now: 17, how: 'sensor › state_class measurement' },
  'climate.aire_living': { dev: 'aire', name: 'Modo', kind: 'enum', opts: { off: 'Apagado', cool: 'Frío', heat: 'Calor', dry: 'Seco', fan_only: 'Ventilar', auto: 'Auto' }, now: 'cool', how: 'climate › estado (hvac_modes)' },
  'climate.aire_living#current_temperature': { dev: 'aire', name: 'Temperatura', kind: 'number', unit: '°C', min: 10, max: 35, now: 24, how: 'climate › atributo current_temperature' },
  'sensor.aire_living_potencia': { dev: 'aire', name: 'Consumo', kind: 'number', unit: 'W', min: 0, max: 2500, now: 820, how: 'sensor › device_class power' },
  'vacuum.robot': { dev: 'robot', name: 'Estado', kind: 'enum', opts: { docked: 'En base', cleaning: 'Limpiando', returning: 'Volviendo', paused: 'En pausa', error: 'Error' }, now: 'docked', how: 'vacuum › estado' },
  'sensor.robot_bateria': { dev: 'robot', name: 'Batería', kind: 'number', unit: '%', min: 0, max: 100, now: 92, how: 'sensor › device_class battery' },
  'sensor.robot_ultima': { dev: 'robot', name: 'Última limpieza', kind: 'text', now: 'Living y cocina', how: 'sensor › texto' },
  'sensor.maceta_humedad': { dev: 'maceta', name: 'Humedad del suelo', kind: 'number', unit: '%', min: 0, max: 100, now: 18, how: 'sensor › device_class moisture' },
  'sensor.medidor_potencia': { dev: 'medidor', name: 'Potencia', kind: 'number', unit: 'W', min: 0, max: 5000, now: 1240, how: 'sensor › device_class power' },
};
S.tv = {};
const val = k => (k in S.tv ? S.tv[k] : SRC[k]?.now ?? null);
function fmtV(s, v) {
  if (v == null || !s) return '—';
  if (s.kind === 'number') return fmt(v, 0) + (s.unit ? (s.unit === '%' || s.unit === 'W' ? ' ' : ' ') + s.unit : '');
  if (s.opts) return s.opts[v] ?? v;
  return String(v);
}
const shortV = (s, v) => (v == null ? '—' : s.kind === 'number' ? fmt(v, 0) : fmtV(s, v));
const NUMERIC_ONLY = ['ring', 'num'];
const FX3 = {
  cortina: [
    { t: 'ring', src: 'cover.cortina_dormitorio#current_position', min: 0, max: 100, w: 4, mode: 'fixed', a: '#6F6BB8', b: '#DCD8EE', none: '#9AA59F', on: true },
    { t: 'led', src: 'cover.cortina_dormitorio#current_position', rules: [{ from: 0, to: 0, c: '#9AA59F', n: 'Cerrada' }, { from: 1, to: 99, c: '#D98B1F', n: 'Entreabierta' }, { from: 100, to: 100, c: '#3F8F5F', n: 'Abierta' }], none: '#9AA59F', on: true },
    { t: 'label', src: 'cover.cortina_dormitorio', on: true }],
  term: [
    { t: 'border', src: 'sensor.bano_temperatura', rules: [{ from: -10, to: 17, c: '#4F8FBF', n: 'Fresco' }, { from: 18, to: 25, c: '#3F8F5F', n: 'Agradable' }, { from: 26, to: 50, c: '#D98B1F', n: 'Caluroso' }], none: '#9AA59F', on: true },
    { t: 'num', src: 'sensor.bano_humedad', pos: 'br', on: true }, { t: 'label', src: 'sensor.bano_temperatura', on: true }],
  router: [{ t: 'led', src: 'binary_sensor.router_conectado', rules: { on: '#3F8F5F', off: '#D0453A' }, none: '#9AA59F', on: true }, { t: 'num', src: 'sensor.router_clientes', pos: 'tr', on: true }],
  aire: [{ t: 'icon', src: 'climate.aire_living', rules: { off: '#9AA59F', cool: '#4F8FBF', heat: '#D0453A', dry: '#C9A66B', fan_only: '#5F6E66', auto: '#3F8F5F' }, none: '#9AA59F', on: true },
    { t: 'ring', src: 'sensor.aire_living_potencia', min: 0, max: 2500, w: 3, mode: 'fixed', a: '#D98B1F', b: '#F1E6D6', none: '#9AA59F', on: false }, { t: 'label', src: 'climate.aire_living#current_temperature', on: true }],
  robot: [{ t: 'num', src: 'sensor.robot_bateria', pos: 'tr', on: true }, { t: 'label', src: 'vacuum.robot', on: true }],
  maceta: [{ t: 'ring', src: 'sensor.maceta_humedad', min: 0, max: 100, w: 4, mode: 'rules', b: '#E3E7E1', rules: [{ from: 0, to: 19, c: '#D0453A', n: 'Seca' }, { from: 20, to: 39, c: '#D98B1F', n: 'Regar pronto' }, { from: 40, to: 100, c: '#3F8F5F', n: 'Bien' }], none: '#9AA59F', on: true }, { t: 'label', src: 'sensor.maceta_humedad', on: true }],
  medidor: [{ t: 'border', src: 'sensor.medidor_potencia', rules: [{ from: 0, to: 999, c: '#3F8F5F', n: 'Normal' }, { from: 1000, to: 2999, c: '#D98B1F', n: 'Alto' }, { from: 3000, to: 5000, c: '#D0453A', n: 'Muy alto' }], none: '#9AA59F', on: true }, { t: 'label', src: 'sensor.medidor_potencia', on: true }],
};
DEV.forEach(d => { if (FX3[d.id]) d.fx = FX3[d.id]; else d.fx = (d.fx || []).filter(f => f.t === 'label').map(f => ({ ...f, src: null })); });
function matchRule(f) {
  const s = SRC[f.src], v = val(f.src);
  if (!s || v == null) return null;
  if (s.kind === 'number') return (f.rules || []).find(r => v >= r.from && v <= r.to) || null;
  return f.rules && f.rules[v] ? { c: f.rules[v], n: s.opts?.[v] ?? v } : null;
}
function fxColor(f) {
  if (f.t === 'ring' && f.mode === 'fixed') return f.a;
  const r = matchRule(f);
  return r ? r.c : f.none || '#9AA59F';
}
function fxHTML(d) {
  let h = '';
  for (const f of d.fx || []) {
    if (!f.on) continue;
    const s = SRC[f.src], v = val(f.src);
    if (f.t === 'ring' && s?.kind === 'number') { const p = v == null ? 0 : clamp(((v - f.min) / (f.max - f.min)) * 100, 0, 100); h += `<span class="fx-ring" style="--p:${p};--fa:${fxColor(f)};--fb:${f.b};--fw:${f.w}px"></span>`; }
    if (f.t === 'led') h += `<span class="fx-led" style="--fc:${fxColor(f)}"></span>`;
    if (f.t === 'num' && s) h += `<span class="fx-num ${f.pos}">${esc(shortV(s, v))}</span>`;
  }
  return h;
}
function fxSummary(f) { const s = SRC[f.src]; return s ? `${s.name} · ${KIND[s.kind][1]}` : 'Sin fuente'; }
function syncValues() { DEV.forEach(d => { const f = (d.fx || []).find(x => x.t === 'label' && x.src); if (f) d.value = fmtV(SRC[f.src], val(f.src)); }); }
syncValues();
function defaultRules(s) {
  if (!s) return [];
  if (s.kind === 'number') { const a = s.min ?? 0, b = s.max ?? 100, t = Math.round((b - a) / 3); return [{ from: a, to: a + t - 1, c: '#4F8FBF', n: '' }, { from: a + t, to: a + 2 * t - 1, c: '#3F8F5F', n: '' }, { from: a + 2 * t, to: b, c: '#D98B1F', n: '' }]; }
  if (s.kind === 'binary') return { on: '#3F8F5F', off: '#9AA59F' };
  if (s.kind === 'enum') { const pal = PALETTES.hogar; return Object.fromEntries(Object.keys(s.opts).map((k, i) => [k, pal[(i * 3) % pal.length]])); }
  return {};
}
function rulesEditor(f, i) {
  const s = SRC[f.src]; if (!s) return '';
  const sw = (c, bind, tip) => `<label class="sw" style="--c:${c}" data-tip="${esc(tip)}"><input type="color" value="${c}" data-bind="${bind}" data-i="${i}" aria-label="${esc(tip)}"></label>`;
  const hit = matchRule(f);
  let rows = '';
  if (s.kind === 'number') {
    rows = f.rules.map((r, k) => `<div class="srow ${hit === r ? 'hit' : ''}">${sw(r.c, 'rc:' + k, 'Color')}<label class="num w70"><input type="number" value="${r.from}" data-bind="rfrom:${k}" data-i="${i}" aria-label="Desde"></label><span class="muted">a</span><label class="num w70"><input type="number" value="${r.to}" data-bind="rto:${k}" data-i="${i}" aria-label="Hasta"></label><input class="rname" value="${esc(r.n || '')}" placeholder="Nombre" data-bind="rn:${k}" data-i="${i}" aria-label="Nombre del rango">${ib(`rrm:${i}:${k}`, 'mdiClose', 'Quitar')}</div>`).join('')
      + `<button type="button" class="chip add" data-act="radd:${i}" data-tip="Agregar rango">${ic('mdiPlus', 'sm')}</button>`;
  } else if (s.kind === 'binary' || s.kind === 'enum') {
    rows = Object.entries(s.opts).map(([k, lbl]) => `<div class="srow ${val(f.src) === k ? 'hit' : ''}">${sw(f.rules[k] || '#9AA59F', 'rk:' + k, 'Color para ' + lbl)}<span class="opt">${esc(lbl)}</span><code>${esc(k)}</code></div>`).join('');
  } else {
    rows = `<div class="srow">${sw('#4F7A5A', 'rk:x', 'Color')}<input class="rname" placeholder="Texto exacto" aria-label="Texto exacto"></div>`;
  }
  rows += `<div class="srow none">${sw(f.none || '#9AA59F', 'rnone', 'Sin dato')}<span class="opt muted">Sin dato</span><code>unavailable</code></div>`;
  return `<div class="scale">${rows}</div>`;
}
function fxEditor(d, f, i) {
  const s = SRC[f.src];
  const r = matchRule(f), cur = val(f.src);
  const head = `<button type="button" class="srcpill" data-act="pop:src" id="srcpill">${s ? ic(KIND[s.kind][0], 'sm') : ic('mdiDatabaseOffOutline', 'sm')}<span><b>${s ? esc(s.name) : 'Elegí una lectura'}</b><code>${s ? esc(f.src.replace('#', ' › ')) : ''}</code></span>${ic('mdiChevronDown', 'sm')}</button>
    ${s ? `<div class="nowline">${ic('mdiArrowRightBottom', 'sm')}<span>Ahora <b>${esc(fmtV(s, cur))}</b></span>${f.t !== 'num' && f.t !== 'label' ? `<span class="arrow">→</span><span class="dot" style="--c:${fxColor(f)}"></span><span>${esc(f.t === 'ring' && f.mode === 'fixed' ? Math.round(((cur - f.min) / (f.max - f.min)) * 100) + ' % del anillo' : r?.n || (r ? '' : 'sin regla'))}</span>` : ''}${ib('x', 'mdiInformationOutline', `Tipo detectado: ${KIND[s.kind][1]}. ${s.how}${s.unit ? ' · unidad ' + s.unit : ''}`)}</div>` : ''}`;
  let body = '';
  if (f.t === 'ring') {
    body = `<div class="grid4">${ic('mdiArrowExpandHorizontal')}<label class="num" data-tip="Vacío en"><input type="number" value="${f.min}" data-bind="fmin" data-i="${i}" aria-label="Mínimo"></label><span class="muted">a</span><label class="num" data-tip="Lleno en"><input type="number" value="${f.max}" data-bind="fmax" data-i="${i}" aria-label="Máximo"></label></div>
      <div class="row">${ic('mdiFormatLineWeight')}<input type="range" min="2" max="10" value="${f.w}" data-bind="fxw" data-i="${i}" aria-label="Grosor" data-tip="Grosor"><label class="num"><input type="number" value="${f.w}" data-bind="fxw" data-i="${i}" aria-label="Grosor"><span>px</span></label></div>
      <div class="row wide" style="grid-template-columns:24px auto 1fr auto">${ic('mdiPaletteOutline')}<div class="seg">${ib(`fxm:${i}:fixed`, 'mdiCircle', 'Un color', f.mode === 'fixed' ? 'on' : '')}${ib(`fxm:${i}:rules`, 'mdiGradientHorizontal', 'Color según el valor', f.mode === 'rules' ? 'on' : '')}</div><span></span><span style="display:flex;gap:6px">${f.mode === 'fixed' ? `<label class="sw" style="--c:${f.a}" data-tip="Parte llena"><input type="color" value="${f.a}" data-bind="fxa" data-i="${i}" aria-label="Parte llena"></label>` : ''}<label class="sw" style="--c:${f.b}" data-tip="Parte vacía"><input type="color" value="${f.b}" data-bind="fxb" data-i="${i}" aria-label="Parte vacía"></label></span></div>
      ${f.mode === 'rules' ? rulesEditor(f, i) : ''}`;
  } else if (['border', 'icon', 'led'].includes(f.t)) {
    body = rulesEditor(f, i);
  } else if (f.t === 'num') {
    body = `<div class="row wide" style="grid-template-columns:24px auto 1fr">${ic('mdiFormatSuperscript')}<div class="seg">${[['tr', 'mdiArrowTopRight', 'Arriba a la derecha'], ['br', 'mdiArrowBottomRight', 'Abajo a la derecha'], ['b', 'mdiArrowDown', 'Debajo']].map(p => ib(`fxpos:${i}:${p[0]}`, p[1], p[2], f.pos === p[0] ? 'on' : '')).join('')}</div><span></span></div>`;
  } else if (f.t === 'label') {
    body = `<div class="row wide" style="grid-template-columns:24px auto 1fr">${ic('mdiDecimal')}<div class="seg">${['0', '0,0', '0,00'].map((v, k) => `<button type="button" class="ib ${k === 0 ? 'on' : ''}" style="width:auto;padding:0 10px;font-size:13px" data-tip="Decimales">${v}</button>`).join('')}</div><span></span></div>`;
  }
  return `<div class="fxed">${head}${body}</div>`;
}
function testControl(f, i) {
  const s = SRC[f?.src]; if (!s) return '';
  if (s.kind === 'number') return `<div class="row" style="width:100%">${ic('mdiTestTube')}<input type="range" id="fx-test" min="${s.min}" max="${s.max}" value="${val(f.src)}" data-bind="tv" data-k="${f.src}" aria-label="Probar valor" data-tip="Probá distintos valores: el plano cambia en vivo"><label class="num"><input type="number" value="${val(f.src)}" data-bind="tv" data-k="${f.src}" aria-label="Valor de prueba"><span>${esc(s.unit || '')}</span></label></div>`;
  if (s.opts) return `<div class="row wide" style="grid-template-columns:24px 1fr;width:100%">${ic('mdiTestTube')}<div class="chips">${Object.entries(s.opts).map(([k, l]) => `<button type="button" class="chip ${val(f.src) === k ? 'pick' : ''}" style="padding:4px 10px" data-act="tvset:${f.src}:${k}" data-tip="Probar este estado">${esc(l)}</button>`).join('')}</div></div>`;
  return '';
}
function indicBody(d) {
  const sel = Math.min(S.fxSel[d.id] ?? 0, Math.max(0, d.fx.length - 1)), f = d.fx[sel];
  const missing = Object.keys(FX).filter(t => !d.fx.some(x => x.t === t));
  return `<div class="fxprev"><span class="sym big" data-shape="${d.shape}" style="--px:84;--k:1;--c:${d.c};--o:${d.op};${fxStyle(d)};position:relative;transform:none;left:auto;top:auto">${ic(d.icon)}${fxHTML(d)}${d.value && fxOn(d, 'label') ? `<span class="val">${esc(d.value)}</span>` : ''}</span>${testControl(f, sel)}</div>
    <div class="list">${d.fx.map((x, i) => `<div class="li ${i === sel ? 'sel' : ''}" data-act="fxsel:${i}" style="cursor:pointer;min-height:46px"><span class="ico-tile" style="width:30px;height:30px">${ic(FX[x.t].icon, 'sm')}</span><div class="t"><b>${FX[x.t].t}</b><span>${esc(fxSummary(x))}</span></div>${ib('fxeye:' + i, x.on ? 'mdiEyeOutline' : 'mdiEyeOffOutline', x.on ? 'Ocultar' : 'Mostrar')}${ib('fxrm:' + i, 'mdiTrashCanOutline', 'Quitar')}</div>`).join('')}</div>
    ${f ? fxEditor(d, f, sel) : ''}
    ${missing.length ? `<div class="addmods">${missing.map(t => `<button type="button" data-act="fxadd3:${t}" data-tip="Agregar ${FX[t].t.toLowerCase()}">${ic('mdiPlus', 'sm')}${ic(FX[t].icon, 'sm')}${FX[t].t}</button>`).join('')}</div>` : ''}`;
}
function refreshPrev(d) {
  syncValues();
  const p = document.querySelector('.fxprev .sym');
  if (p) { p.setAttribute('style', `--px:84;--k:1;--c:${d.c};--o:${d.op};${fxStyle(d)};position:relative;transform:none;left:auto;top:auto`); p.innerHTML = ic(d.icon) + fxHTML(d) + (d.value && fxOn(d, 'label') ? `<span class="val">${esc(d.value)}</span>` : ''); }
}

/* ——— Controles: botones aprendidos y diseñador avanzado ——— */
const LB = ['Encender', 'Apagar', 'Subir', 'Bajar', 'Modo frío', 'Modo calor', 'Modo seco', 'Modo ventilar', 'Vel. 1', 'Vel. 2', 'Vel. 3', 'Vel. 4', 'Swing', 'Turbo', 'Silencio', 'Timer', 'Aletas arriba', 'Aletas abajo'];
let GRID = { cols: 4, rows: 8 };
let DZ = [
  { id: 'p1', t: 'toggle', x: 0, y: 0, w: 2, h: 1, label: 'Encender', icon: 'mdiPower', bg: '#4F7A5A', fg: '#FFFFFF', act: { on: 'Encender', off: 'Apagar' }, state: 'sensor' },
  { id: 'p2', t: 'pair', x: 2, y: 0, w: 2, h: 1, label: 'Temperatura', icon: 'mdiThermometer', act: { down: 'Bajar', up: 'Subir' }, shown: '24°' },
  { id: 'p3', t: 'options', x: 0, y: 1, w: 4, h: 1, label: 'Modo', icon: 'mdiSnowflake', opts: [{ n: 'Frío', i: 'mdiSnowflake', b: 'Modo frío' }, { n: 'Calor', i: 'mdiFire', b: 'Modo calor' }, { n: 'Seco', i: 'mdiWaterOffOutline', b: 'Modo seco' }, { n: 'Ventilar', i: 'mdiFan', b: 'Modo ventilar' }] },
  { id: 'p4', t: 'knob', x: 0, y: 2, w: 2, h: 2, label: 'Ventilador', icon: 'mdiFan', steps: ['Vel. 1', 'Vel. 2', 'Vel. 3', 'Vel. 4'], cur: 2 },
  { id: 'p5', t: 'vslider', x: 2, y: 2, w: 1, h: 2, label: 'Aletas', icon: 'mdiArrowUpDown', act: { up: 'Aletas arriba', down: 'Aletas abajo' }, cur: 60 },
  { id: 'p6', t: 'preset', x: 3, y: 2, w: 1, h: 1, label: 'Noche', icon: 'mdiWeatherNight', bg: '#6F6BB8', fg: '#FFFFFF', seq: [{ b: 'Encender' }, { b: 'Modo frío' }, { wait: 300 }, { b: 'Bajar', n: 2 }, { b: 'Vel. 1' }, { b: 'Silencio' }] },
  { id: 'p7', t: 'button', x: 3, y: 3, w: 1, h: 1, label: 'Turbo', icon: 'mdiWeatherWindy', act: { tap: 'Turbo' } },
  { id: 'p8', t: 'button', x: 0, y: 4, w: 1, h: 1, label: 'Swing', icon: 'mdiArrowOscillating', act: { tap: 'Swing' } },
  { id: 'p9', t: 'button', x: 1, y: 4, w: 1, h: 1, label: 'Silencio', icon: 'mdiVolumeOff', act: { tap: 'Silencio' } },
  { id: 'p10', t: 'value', x: 2, y: 4, w: 2, h: 1, label: 'Consumo', icon: 'mdiFlashOutline', src: 'sensor.aire_living_potencia' },
  { id: 'p11', t: 'graph', x: 0, y: 5, w: 4, h: 2, label: 'Temperatura · 24 h', icon: 'mdiChartLine', src: 'climate.aire_living#current_temperature' },
];
const ET3 = {
  Botones: { button: ['mdiGestureTap', 'Botón'], brand: ['mdiPlayBoxOutline', 'Marca'], toggle: ['mdiPower', 'Encender/apagar'], preset: ['mdiPlaylistPlay', 'Preset'] },
  Ajustes: { pair: ['mdiPlusMinusVariant', 'Más/menos'], knob: ['mdiKnob', 'Perilla'], vslider: ['mdiTuneVertical', 'Deslizador ↕'], hslider: ['mdiTuneVariant', 'Deslizador ↔'], steps: ['mdiDotsHorizontal', 'Pasos'], options: ['mdiFormatListBulleted', 'Opciones'] },
  Información: { value: ['mdiGauge', 'Lectura'], graph: ['mdiChartLine', 'Gráfico'], text: ['mdiFormatText', 'Texto'], sep: ['mdiMinus', 'Separador'] },
};
const ETALL = Object.assign({}, ...Object.values(ET3));
const BRANDS = [['YouTube', '#FF0000', '#FFFFFF', 'mdiYoutube'], ['Netflix', '#141414', '#E50914', 'mdiNetflix'], ['Prime Video', '#00A8E1', '#FFFFFF', 'mdiPlayBoxOutline'], ['Disney+', '#113CCF', '#FFFFFF', 'mdiPlayBoxOutline'], ['Spotify', '#1DB954', '#FFFFFF', 'mdiSpotify']];
const usedBtns = () => {
  const u = {};
  const add = b => { if (b) u[b] = (u[b] || 0) + 1; };
  DZ.forEach(e => { Object.values(e.act || {}).forEach(add); (e.opts || []).forEach(o => add(o.b)); (e.steps || []).forEach(add); (e.seq || []).forEach(s => add(s.b)); });
  return u;
};
function slotsOf(e) {
  if (e.t === 'button' || e.t === 'brand') return [['tap', 'mdiGestureTap', 'Al tocar']];
  if (e.t === 'toggle') return [['on', 'mdiPower', 'Encender'], ['off', 'mdiPowerOff', 'Apagar']];
  if (e.t === 'pair' || e.t === 'vslider' || e.t === 'hslider') return [['down', 'mdiMinus', e.t === 'pair' ? 'Menos' : 'Bajar'], ['up', 'mdiPlus', e.t === 'pair' ? 'Más' : 'Subir']];
  return [];
}
function lbChip(e, slot, b) {
  return `<button type="button" class="lbchip ${b ? '' : 'empty'}" data-act="pop:lb|${e.id}|${slot}" data-drop="${e.id}|${slot}">${ic(b ? (S.rf.src === 'rf' ? 'mdiAccessPoint' : 'mdiRemoteTv') : 'mdiLinkVariantPlus', 'sm')}${esc(b || 'Elegir botón')}${ic('mdiChevronDown', 'sm')}</button>`;
}
function elInner(e) {
  const lab = e.hideLabel ? '' : `<span class="elab">${esc(e.label)}</span>`, icn = e.hideIcon ? '' : ic(e.icon);
  switch (e.t) {
    case 'toggle': return `<span class="big-btn">${icn}</span>${lab}`;
    case 'pair': return `<span class="pairb">${ic('mdiMinus')}</span><span class="pl"><b>${esc(e.shown || '')}</b>${lab}</span><span class="pairb">${ic('mdiPlus')}</span>`;
    case 'options': return `<span class="optl">${e.hideIcon ? '' : ic(e.icon, 'sm')}${esc(e.label)}</span><span class="opts">${e.opts.map((o, k) => `<span class="${k === 0 ? 'on' : ''}">${o.i ? ic(o.i, 'sm') : ''}${esc(o.n)}</span>`).join('')}</span>`;
    case 'knob': { const p = ((e.cur || 1) / e.steps.length) * 100; return `<span class="knob" style="--p:${p}"><span>${e.cur || 1}</span></span>${lab}`; }
    case 'vslider': return `<span class="vsl"><i style="height:${e.cur || 50}%"></i></span>${lab}`;
    case 'hslider': return `${lab}<span class="hsl"><i style="width:${e.cur || 50}%"></i></span>`;
    case 'steps': return `<span class="optl">${esc(e.label)}</span><span class="stepsb">${e.steps.map((_, k) => `<i class="${k < 2 ? 'on' : ''}"></i>`).join('')}</span>`;
    case 'value': { const s = SRC[e.src]; return `<span class="optl">${icn}${esc(e.label)}</span><b class="bigv">${esc(fmtV(s, val(e.src)))}</b>`; }
    case 'graph': return `<span class="optl">${icn}${esc(e.label)}</span>${spark([22, 22.5, 23.4, 24.8, 25.1, 24.6, 24.2, 24.6], 40)}`;
    case 'text': return `<span class="elab big">${esc(e.label)}</span>`;
    case 'sep': return '<hr>';
    default: return `${icn}${lab}`;
  }
}
function designerStage() {
  const st = $('#stage'), W = st.clientWidth || 900, H = st.clientHeight || 700;
  const cell = clamp(Math.floor(Math.min((W - 520) / GRID.cols, (H - 210) / GRID.rows)), 26, 76);
  const used = usedBtns();
  const cells = Array.from({ length: GRID.cols * GRID.rows }, (_, k) => `<div class="cell" data-cell="${k % GRID.cols},${Math.floor(k / GRID.cols)}" style="grid-column:${(k % GRID.cols) + 1};grid-row:${Math.floor(k / GRID.cols) + 1}"></div>`).join('');
  const els = DZ.map(e => `<div class="rel t-${e.t} ${S.rf.el === e.id ? 'sel' : ''} ${e.shape || ''}" data-e="${e.id}" style="grid-column:${e.x + 1}/span ${e.w};grid-row:${e.y + 1}/span ${e.h};${e.bg ? `--ebg:${e.bg};` : ''}${e.fg ? `--efg:${e.fg};` : ''}">${elInner(e)}${S.rf.el === e.id ? '<span class="rh" data-rh="1" title="Cambiar tamaño"></span>' : ''}</div>`).join('');
  return `<div class="designer">
    <aside class="tray"><header>${ic(S.rf.src === 'rf' ? 'mdiAccessPoint' : 'mdiRemoteTv', 'sm')}<b>Botones aprendidos</b><span class="cap">${LB.length}</span></header>
      <div class="traylist">${LB.map(b => `<span class="tchip ${used[b] ? '' : 'unused'}" draggable="true" data-lb="${esc(b)}" data-tip="${used[b] ? 'Usado en ' + used[b] + ' elemento(s)' : 'Sin usar: arrastralo al control'}">${ic('mdiDragVertical', 'sm')}${esc(b)}${used[b] ? `<em>${used[b]}</em>` : `<em class="no">!</em>`}</span>`).join('')}</div>
      <footer>${ib('rfgo:learn', 'mdiPlus', 'Aprender más botones')}</footer></aside>
    <div class="remote" style="--cell:${cell}px"><header>${ic('mdiAirConditioner')}<b>Aire oficina</b><span class="cap ir">IR</span><span class="gsz">${GRID.cols} × ${GRID.rows}</span></header>
      <div class="rgrid" id="rgrid" style="grid-template-columns:repeat(${GRID.cols},var(--cell));grid-template-rows:repeat(${GRID.rows},var(--cell))">${cells}${els}</div></div>
    <div class="ptool"><div class="hint">Arrastrá elementos y botones · la esquina cambia el tamaño</div><div class="bar">${ib('undo', 'mdiUndo', 'Deshacer')}${ib('x', 'mdiAutoFix', 'Diseño automático')}${ib('x', 'mdiCellphone', 'Ver como en el teléfono')}${ib('dztest', 'mdiPlay', 'Modo prueba: tocar envía', S.rf.testMode ? 'on' : '')}</div></div></div>`;
}
function designPanel() {
  const e = DZ.find(x => x.id === S.rf.el) || DZ[0];
  const swRow = (bind, cur, tip, list) => `<div class="swatches">${list.map(c => `<button type="button" class="sw ${cur === c ? 'on' : ''}" style="--c:${c}" data-act="ecol:${bind}:${c}" aria-label="${tip} ${c}"></button>`).join('')}<label class="sw custom" data-tip="Otro color"><input type="color" value="${cur || '#4F7A5A'}" data-bind="ecol:${bind}" aria-label="${tip}"></label></div>`;
  const pal = ['#4F7A5A', '#4F8FBF', '#6F6BB8', '#D98B1F', '#D0453A', '#141414', '#FFFFFF', '#E3E7E1'];
  let action = '';
  const slots = slotsOf(e);
  if (slots.length) action = slots.map(s => `<div class="arow">${ic(s[1], 'sm')}<span>${s[2]}</span>${lbChip(e, s[0], e.act?.[s[0]])}</div>`).join('') + (e.t === 'button' || e.t === 'brand' ? `<div class="arow">${ic('mdiGestureTapHold', 'sm')}<span>Mantener</span><span class="seg">${ib('x', 'mdiRepeat', 'Repetir mientras se mantiene', 'on')}${ib('x', 'mdiCancel', 'Nada')}</span></div>` : '');
  if (e.t === 'options') action = e.opts.map((o, k) => `<div class="arow">${ib('x', o.i || 'mdiShapeOutline', 'Icono de la opción')}<input class="field sm" value="${esc(o.n)}" aria-label="Texto de la opción">${lbChip(e, 'o' + k, o.b)}${ib(`eoptrm:${e.id}:${k}`, 'mdiClose', 'Quitar opción')}</div>`).join('') + `<button type="button" class="chip add" data-act="eoptadd:${e.id}">${ic('mdiPlus', 'sm')}</button>`;
  if (e.t === 'knob' || e.t === 'steps') action = e.steps.map((b, k) => `<div class="arow"><span class="stepn">${k + 1}</span><span>Paso</span>${lbChip(e, 's' + k, b)}${ib(`esteprm:${e.id}:${k}`, 'mdiClose', 'Quitar paso')}</div>`).join('') + `<button type="button" class="chip add" data-act="estepadd:${e.id}">${ic('mdiPlus', 'sm')}</button>`;
  if (e.t === 'preset') action = `<div class="seq">${e.seq.map((s, k) => `<div class="arow">${s.wait ? `${ic('mdiTimerSand', 'sm')}<span>Esperar</span><label class="num w70"><input type="number" value="${s.wait}" aria-label="Milisegundos"><span>ms</span></label>` : `<span class="stepn">${k + 1}</span><span></span>${lbChip(e, 'q' + k, s.b)}<label class="num w56" data-tip="Veces"><input type="number" value="${s.n || 1}" min="1" aria-label="Veces"><span>×</span></label>`}${ib(`eseqrm:${e.id}:${k}`, 'mdiClose', 'Quitar')}</div>`).join('')}</div>
      <div class="chips"><button type="button" class="chip add" data-act="eseqadd:${e.id}:b">${ic('mdiPlus', 'sm')}${ic('mdiRemoteTv', 'sm')}</button><button type="button" class="chip add" data-act="eseqadd:${e.id}:w">${ic('mdiPlus', 'sm')}${ic('mdiTimerSand', 'sm')}</button>${ib('x', 'mdiPlay', 'Probar la secuencia')}</div>`;
  if (e.t === 'value' || e.t === 'graph') { const s = SRC[e.src]; action = `<button type="button" class="srcpill">${ic(KIND[s.kind][0], 'sm')}<span><b>${esc(s.name)}</b><code>${esc(e.src.replace('#', ' › '))}</code></span>${ic('mdiChevronDown', 'sm')}</button>`; }
  const stateRow = ['toggle', 'knob', 'pair', 'options'].includes(e.t) ? `<div class="lbl">${ic('mdiEyeOutline', 'sm')}Estado que muestra<span class="grow"></span></div>
    <div class="seg">${ib(`estate:${e.id}:est`, 'mdiHelpCircleOutline', 'Estimado: el último botón enviado', e.state !== 'sensor' ? 'on' : '')}${ib(`estate:${e.id}:sensor`, 'mdiDatabaseArrowRightOutline', 'Desde un sensor de Home Assistant', e.state === 'sensor' ? 'on' : '')}</div>
    ${e.state === 'sensor' ? `<div class="arow"><button type="button" class="srcpill">${ic('mdiNumeric', 'sm')}<span><b>Consumo &gt; 50 W = prendido</b><code>sensor.aire_living_potencia</code></span>${ic('mdiChevronDown', 'sm')}</button></div>` : ''}` : '';
  return `<div class="dh">${ib('rfgo:remote', 'mdiArrowLeft', 'Volver')}<h2>Diseño</h2>${ib('x', 'mdiAutoFix', 'Diseño automático')}${ib('close-set', 'mdiClose', 'Cerrar')}</div>
  <div class="dbody">
    <div class="lbl">${ic('mdiGrid', 'sm')}Lienzo<span class="grow"></span></div>
    <div class="grid4">${ic('mdiTableColumn')}<label class="num" data-tip="Columnas"><input type="number" min="2" max="30" value="${GRID.cols}" data-bind="gcols" aria-label="Columnas"></label><span class="muted">×</span><label class="num" data-tip="Filas"><input type="number" min="2" max="30" value="${GRID.rows}" data-bind="grows" aria-label="Filas"></label></div>
    <div class="lbl">${ic('mdiPlus', 'sm')}Agregar<span class="grow"></span></div>
    ${Object.entries(ET3).map(([g, items]) => `<div class="egroup"><span>${g}</span><div class="etypes">${Object.entries(items).map(([k, v]) => `<button type="button" class="etype" data-act="${k === 'brand' ? 'pop:brand' : 'eadd3:' + k}" data-tip="${v[1]}" id="et-${k}">${ic(v[0])}<span>${v[1]}</span></button>`).join('')}</div></div>`).join('')}
    <div class="selhead"><span class="ico-tile">${ic(ETALL[e.t]?.[0] || 'mdiShapeOutline')}</span><b>${ETALL[e.t]?.[1] || ''}</b><span class="grow"></span>${ib('edup:' + e.id, 'mdiContentCopy', 'Duplicar')}${ib('erm3:' + e.id, 'mdiTrashCanOutline', 'Quitar elemento', 'danger')}</div>
    <div class="lbl">${ic('mdiPaletteOutline', 'sm')}Aspecto<span class="grow"></span></div>
    <div class="arow"><button type="button" class="iconbtn" style="width:42px;height:42px;--c:${e.fg || 'var(--ink)'}" data-tip="Icono">${ic(e.icon || 'mdiShapeOutline')}</button><input class="field" value="${esc(e.label)}" data-bind="elabel3" aria-label="Texto">${ib(`etog:${e.id}:hideIcon`, e.hideIcon ? 'mdiImageOffOutline' : 'mdiImageOutline', 'Mostrar icono', e.hideIcon ? '' : 'on')}${ib(`etog:${e.id}:hideLabel`, e.hideLabel ? 'mdiFormatTextVariantOutline' : 'mdiFormatText', 'Mostrar texto', e.hideLabel ? '' : 'on')}</div>
    <div class="arow">${ic('mdiFormatColorFill', 'sm')}<span>Fondo</span>${swRow('bg', e.bg, 'Fondo', pal)}</div>
    <div class="arow">${ic('mdiFormatColorText', 'sm')}<span>Texto</span>${swRow('fg', e.fg, 'Texto e icono', pal)}</div>
    <div class="arow">${ic('mdiShapeOutline', 'sm')}<span>Forma</span><div class="seg">${[['', 'mdiSquareRoundedOutline', 'Redondeado'], ['round', 'mdiCircleOutline', 'Redondo'], ['square', 'mdiSquareOutline', 'Recto']].map(s => ib(`eshape:${e.id}:${s[0] || 'n'}`, s[1], s[2], (e.shape || '') === s[0] ? 'on' : '')).join('')}</div></div>
    <div class="grid4" style="grid-template-columns:24px 1fr 1fr 1fr 1fr">${ic('mdiResize')}${['x', 'y', 'w', 'h'].map(k => `<label class="num" data-tip="${({ x: 'Columna', y: 'Fila', w: 'Ancho', h: 'Alto' })[k]}"><span>${k === 'w' ? '↔' : k === 'h' ? '↕' : k}</span><input type="number" value="${e[k] + (k === 'x' || k === 'y' ? 1 : 0)}" data-bind="epos:${k}" aria-label="${k}"></label>`).join('')}</div>
    ${action ? `<div class="lbl">${ic('mdiLinkVariant', 'sm')}${e.t === 'value' || e.t === 'graph' ? 'Lectura' : 'Botones aprendidos que usa'}<span class="grow"></span></div>${action}` : ''}
    ${stateRow}
  </div>
  <div class="dfoot">${ib('x', 'mdiHomeAssistant', 'Entidades en Home Assistant')}<span class="grow"></span><button type="button" class="ib primary" data-act="rfgo:remote" data-tip="Listo" aria-label="Listo">${ic('mdiCheck')}</button></div>`;
}

/* Base de controles: se acota a medida que se aprenden botones */
const DB_STEPS = [1240, 214, 37, 3];
const PROFILES = [
  { id: 'mitsu', brand: 'Mitsubishi', model: 'MSZ-GE / SG · aire', btns: 24, hit: 3 },
  { id: 'mitsu2', brand: 'Mitsubishi', model: 'MSY-GN · aire', btns: 22, hit: 3 },
  { id: 'hyund', brand: 'Hyundai', model: 'HY-12 · aire', btns: 18, hit: 2 },
];
const LEARN_NAMES = ['Encender', 'Subir', 'Modo frío', 'Bajar'];
function startLearn() {
  stopLearn(); S.rf.listening = true; S.rf.left = 15;
  learnTimer = setInterval(() => {
    if (S.set !== 'rf' || S.rf.view !== 'learn') { stopLearn(); return; }
    S.rf.left -= 1;
    if (S.rf.left % 3 === 0 && LEARNED.length < 4 && !S.rf.profile) {
      const n = LEARNED.length; LEARNED.forEach(b => (b.fresh = false));
      LEARNED.push({ id: 'b' + Date.now(), name: LEARN_NAMES[n], seed: n + 3, ok: n !== 3, fresh: true, match: n < 3 ? ['Power', 'Temp +', 'Cool'][n] : null });
    }
    if (S.rf.left <= 0 || (LEARNED.length >= 4 && S.rf.left < 3)) { S.rf.listening = false; stopLearn(); }
    renderSide();
  }, 1000);
}
function learnView() {
  const r = 46, len = 2 * Math.PI * r, n = LEARNED.length, count = DB_STEPS[Math.min(n, 3)];
  const head = `<div class="dh">${ib('rfgo:new', 'mdiArrowLeft', 'Volver')}<h2>Aprender</h2>${ib('close-set', 'mdiClose', 'Cerrar')}</div>`;
  const prof = S.rf.profile && PROFILES.find(p => p.id === S.rf.profile);
  return head + `<div class="dbody">${stepper('learn')}
    <div class="listen ${S.rf.listening ? 'on' : ''}" ${S.rf.listening ? '' : 'data-act="rflearn"'}>
      <svg class="count" viewBox="0 0 110 110"><circle cx="55" cy="55" r="${r}" style="stroke:var(--line)" stroke-width="5" fill="none"/><circle cx="55" cy="55" r="${r}" style="stroke:var(--brand)" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - S.rf.left / 15)}" transform="rotate(-90 55 55)"/></svg>
      <span class="waves"><i></i><i></i><i></i></span><span class="core">${ic(S.rf.src === 'ir' ? 'mdiRemoteTv' : 'mdiAccessPoint', 'lg')}</span></div>
    <div class="listen-t">${S.rf.listening ? `<b>Pulsá un botón del control</b><span>${S.rf.left} s · Athom living escucha</span>` : `<b>${n ? 'Pausa' : 'Tocá para escuchar'}</b><span>${n ? 'Tocá el receptor para seguir' : 'Uno o varios botones, de a uno'}</span>`}</div>
    <div class="caps-list">${(prof ? LB.slice(0, 6).map((nm, i) => ({ name: nm, seed: i + 3, ok: true, match: nm })) : LEARNED).map((b, i) => `<div class="capcard ${b.fresh ? 'fresh' : ''}"><span class="dot" style="--c:var(--${b.ok ? 'ok' : 'warn'})" data-tip="${b.ok ? 'Señal reconocida: 2 tramas iguales' : 'Recibido una vez: pulsalo otra vez'}"></span>${wave(b.seed, 70)}<span class="nm"><input class="name-in" list="lb-names" value="${esc(b.name)}" aria-label="Nombre del botón">${b.match ? `<em data-tip="Mismo código que «${esc(b.match)}» en ${prof ? prof.brand : 'Mitsubishi'} ${prof ? '' : 'MSZ-GE'}">${ic('mdiDatabaseCheckOutline', 'sm')}${esc(b.match)}</em>` : ''}</span>${b.ok ? ib('x', 'mdiPlay', 'Probar') : ib('rfrep:' + i, 'mdiRefresh', 'Pulsalo otra vez')}${ib('rfdel:' + i, 'mdiClose', 'Descartar')}</div>`).join('')}${prof ? `<div class="more">+ ${prof.btns - 6} botones del perfil</div>` : ''}</div>
    <datalist id="lb-names">${LB.map(x => `<option value="${x}">`).join('')}</datalist>
    <div class="dbpanel ${n ? '' : 'idle'}"><header>${ic('mdiDatabaseSearchOutline')}<b>Base de controles</b><span class="count">${prof ? '✓' : fmt(count)}</span></header>
      ${!n ? `<div class="dbbar"><i style="width:100%"></i></div><span class="muted small">${fmt(count)} controles IR · se acota con cada botón</span>` : prof ? `<div class="okline">${ic('mdiCheckCircle')}<b>Usando ${prof.brand} ${prof.model}</b></div>` : `<div class="dbbar"><i style="width:${(count / 1240) * 100}%"></i></div>
        <div class="list">${PROFILES.filter((_, k) => n >= 2 || k < 2).map(p => `<div class="li"><span class="brand">${p.brand[0]}</span><div class="t"><b>${p.brand} · ${p.model}</b><span>${p.btns} botones · coincide ${Math.min(p.hit, n)} de ${n}</span></div>${ib('x', 'mdiPlayCircleOutline', 'Probar este perfil: envía Encender con sus códigos')}<button type="button" class="chip pick" data-act="useprof:${p.id}" style="padding:4px 10px">Usar</button></div>`).join('')}</div>`}</div>
    <details class="small"><summary class="muted">${ic('mdiSineWave', 'sm')} Portadora 38 kHz · estimada</summary><div class="row" style="margin-top:8px">${ic('mdiSineWave')}<input type="range" min="30" max="56" value="38" aria-label="Portadora"><label class="num"><input type="number" value="38" aria-label="kHz"><span>kHz</span></label></div></details></div>
    <div class="dfoot">${ib('rfgo:sheet', 'mdiWaveform', 'Ficha técnica')}<span class="grow"></span><button type="button" class="next" data-act="rfgo:test" ${n || prof ? '' : 'disabled'}>${ic('mdiPlayCircleOutline', 'sm')}Probar</button></div>`;
}
function testView() {
  const list = LEARNED.length ? LEARNED : LEARN_NAMES.map((n, i) => ({ name: n, seed: i + 3, ok: true }));
  return `<div class="dh">${ib('rfgo:learn', 'mdiArrowLeft', 'Volver')}<h2>Probar</h2>${ib('close-set', 'mdiClose', 'Cerrar')}</div><div class="dbody">${stepper('test')}
    <div class="list">${list.map((b, i) => { const t = S.rf.tests[i] || {}; return `<div class="trow"><div class="li" style="border:0">${wave(b.seed, 60)}<div class="t"><b>${esc(b.name)}</b><span>${t.sent ? (t.ok === true ? 'Funcionó' : t.ok === false ? 'No reaccionó' : 'Enviado · ¿reaccionó?') : 'Sin probar'}</span></div>
      <button type="button" class="ib send ${t.sent && t.ok == null ? 'pulse' : ''}" data-act="rftest:${i}" data-tip="Enviar" aria-label="Enviar">${ic('mdiPlay')}</button>${t.sent && t.ok == null ? ib('rfok:' + i + ':1', 'mdiThumbUpOutline', 'Sí, reaccionó') + ib('rfok:' + i + ':0', 'mdiThumbDownOutline', 'No reaccionó') : t.ok === true ? `<span style="color:var(--ok)">${ic('mdiCheckCircle')}</span>` : ''}</div>
      ${t.ok === false ? `<div class="tune">${ic('mdiTune', 'sm')}<span class="pill">${ic('mdiMinus', 'sm')} 562 µs ${ic('mdiPlus', 'sm')}</span><span class="pill">${ic('mdiRepeat', 'sm')} 3 ${ic('mdiPlus', 'sm')}</span><span class="pill">${ic('mdiBroadcast', 'sm')} Athom dormitorio</span>${ib('rftest:' + i, 'mdiPlay', 'Probar otra vez')}</div>` : ''}</div>`; }).join('')}</div>
    <div class="lbl">Comprobar (opcional)<span class="grow"></span></div>
    <div class="checks">${[['echo', 'mdiSineWave', 'Auto-eco', 'El mismo equipo escucha lo que envía'], ['recvb', 'mdiAccessPointNetwork', 'Receptor B', 'Otro equipo escucha'], ['camera', 'mdiCameraOutline', 'Cámara', 'Ver el destello del LED']].map(c => `<button type="button" class="check" data-act="rfgo:${c[0]}">${ic(c[1], 'lg')}<b>${c[2]}</b><span>${c[3]}</span></button>`).join('')}</div></div>
    <div class="dfoot">${ib('x', 'mdiContentSaveOutline', 'Guardar sin diseñar')}<span class="grow"></span><button type="button" class="next" data-act="rfgo:design">${ic('mdiPencilRuler', 'sm')}Diseñar</button></div>`;
}
function compareCard(who) {
  return `<div class="verdict">${ic('mdiCheckDecagram', 'lg')}<div><b>Coincide</b><span>${who}</span></div>${ib('x', 'mdiInformationOutline', 'Confirma que la señal salió del emisor. Si el aparato reaccionó se confirma aparte.')}</div>
    <div class="timeline"><div class="tl-tools"><span class="lg-c">Capturada</span><span class="lg-p">${who.startsWith('Eco') ? 'Eco' : 'Recibida por B'}</span><span class="grow"></span>${ib('x', 'mdiMagnifyPlusOutline', 'Acercar')}</div>${wave(7, 360, 34)}${wave(7, 360, 34, 'var(--cool)')}<div class="axis"><span>0</span><span>20 ms</span><span>40 ms</span><span>60 ms</span></div></div>
    <div class="facts">${[['Tramas', '2 / 2', 'iguales'], ['Tiempos', '134 / 134', 'mismo largo'], ['Signos', 'OK', 'marcas y pausas'], ['Dif. máx.', '48 µs', 'tolerancia 120 µs o 25 %'], ['Portadora', '38 kHz', 'configurada'], ['Ventana', '3 s', 'sólo este nodo']].map(f => `<div><span>${f[0]}</span><b>${f[1]}</b><em>${f[2]}</em></div>`).join('')}</div>`;
}
function checkView(kind) {
  const back = `<div class="dh">${ib('rfgo:test', 'mdiArrowLeft', 'Volver')}<h2>${({ echo: 'Auto-eco', recvb: 'Receptor B', camera: 'Cámara del teléfono' })[kind]}</h2>${ib('close-set', 'mdiClose', 'Cerrar')}</div>`;
  const st = S.rf.chk[kind];
  if (kind === 'echo' || kind === 'recvb') {
    const nodes = kind === 'echo' ? [['Athom living', 'Envía y escucha']] : [['Athom living', 'Envía'], ['Athom dormitorio', 'Escucha (B)']];
    return back + `<div class="dbody"><div class="pair2">${nodes.map((nd, k) => `<div class="nodecard">${ic(k === 0 ? 'mdiBroadcast' : 'mdiEarHearing', 'lg')}<b>${nd[0]}</b><span>${nd[1]}</span></div>${k < nodes.length - 1 ? `<span class="beam ${st === 'run' ? 'on' : ''}">${ic('mdiChevronTripleRight')}</span>` : ''}`).join('')}</div>
      <div class="chips"><span class="chip" style="padding-right:10px">${ic('mdiRemoteTv', 'sm')}Encender</span>${kind === 'recvb' ? `<span class="chip warnchip" data-tip="Durante la ventana, B puede oír otros mandos cercanos">${ic('mdiAlertOutline', 'sm')}Otros mandos</span>` : ''}</div>
      ${st === 'done' ? compareCard(kind === 'echo' ? 'Eco del mismo Athom living' : 'Recibida por Athom dormitorio') : st === 'run' ? `<div class="listen on small2"><span class="waves"><i></i><i></i><i></i></span><span class="core">${ic('mdiEarHearing', 'lg')}</span></div><div class="listen-t"><b>Enviando y escuchando…</b><span>Ventana de 3 s</span></div>` : ''}</div>
      <div class="dfoot"><span class="grow"></span><button type="button" class="next" data-act="chkrun:${kind}">${ic('mdiPlay', 'sm')}${st === 'done' ? 'Repetir' : 'Enviar y escuchar'}</button></div>`;
  }
  const step = S.rf.cam;
  const steps = [['Calibrar', 'mdiRemote'], ['Probar', 'mdiBroadcast'], ['Resultado', 'mdiClipboardCheckOutline']];
  const stp = `<div class="stepper">${steps.map((s, i) => `<button type="button" class="st ${i + 1 < step ? 'done' : i + 1 === step ? 'cur' : ''}" data-act="cam:${i + 1}"><span>${ic(i + 1 < step ? 'mdiCheck' : s[1], 'sm')}</span><em>${s[0]}</em></button>${i < 2 ? '<i></i>' : ''}`).join('')}</div>`;
  let body = '';
  if (step === 1) body = `<div class="camfig">${ic('mdiCellphone', 'lg')}<span class="flash"></span>${ic('mdiRemote', 'lg')}</div><div class="listen-t"><b>Apuntá la cámara al mando original</b><span>Pulsá un botón: ¿ves un destello violeta?</span></div>
    <div class="yesno"><button type="button" class="check" data-act="cam:2">${ic('mdiThumbUpOutline', 'lg')}<b>Lo veo</b></button><button type="button" class="check" data-act="camno">${ic('mdiThumbDownOutline', 'lg')}<b>No lo veo</b></button></div>
    ${S.rf.camNo ? `<div class="card">${ic('mdiCameraFlipOutline')}<b>Probá con la cámara frontal u otro teléfono</b><span class="small muted">Algunas cámaras filtran el infrarrojo.</span><button type="button" class="chip" data-act="cam:3" style="align-self:flex-start;padding:4px 10px">Marcar no concluyente</button></div>` : ''}`;
  if (step === 2) body = `<div class="camfig">${ic('mdiCellphone', 'lg')}<span class="flash ${st === 'run' ? 'on' : ''}"></span>${ic('mdiChip', 'lg')}</div><div class="listen-t"><b>Apuntá al LED del Athom living</b><span>${st === 'run' ? 'Enviando Encender cada segundo…' : 'Envía la señal durante 10 s'}</span></div>
    <div style="display:flex;justify-content:center"><button type="button" class="next" data-act="camsend">${ic('mdiPlay', 'sm')}${st === 'run' ? 'Enviando' : 'Enviar 10 s'}</button></div>`;
  if (step === 3) body = `<div class="listen-t"><b>¿Qué viste?</b><span>Se guarda sólo lo que elijas</span></div>
    <div class="checks">${[['vis', 'mdiFlashOutline', 'Emisión visible'], ['novis', 'mdiFlashOffOutline', 'No visible'], ['nc', 'mdiHelpCircleOutline', 'No concluyente']].map(c => `<button type="button" class="check ${S.rf.camRes === c[0] ? 'pick' : ''}" data-act="camres:${c[0]}">${ic(c[1], 'lg')}<b>${c[2]}</b></button>`).join('')}</div>
    <textarea class="field" style="height:70px;padding:8px 12px" placeholder="Nota (opcional)" aria-label="Nota"></textarea>`;
  return back + `<div class="dbody">${stp}${body}</div><div class="dfoot"><span class="grow"></span>${step === 3 ? `<button type="button" class="next" data-act="rfgo:test" ${S.rf.camRes ? '' : 'disabled'}>${ic('mdiContentSaveOutline', 'sm')}Guardar</button>` : ''}</div>`;
}
function rfPanel2() {
  const v = S.rf.view;
  if (v === 'learn') return learnView();
  if (v === 'test') return testView();
  if (v === 'design') return designPanel();
  if (v === 'echo' || v === 'recvb' || v === 'camera') return checkView(v);
  return null;
}

/* Popovers de esta parte */
function extraPops(app, near) {
  let h = '';
  const d = D();
  if (S.pop === 'src' && d) {
    const f = d.fx[S.fxSel[d.id] ?? 0];
    const mine = Object.entries(SRC).filter(([, s]) => s.dev === d.id);
    h += `<div class="pop" style="${near('#srcpill')};width:340px"><h4>${ic('mdiDatabaseArrowRightOutline', 'sm')}Lectura</h4><label class="search">${ic('mdiMagnify')}<input placeholder="Buscar en Home Assistant" aria-label="Buscar entidad"></label>
      <div class="srclist">${mine.map(([k, s]) => { const bad = NUMERIC_ONLY.includes(f.t) && s.kind !== 'number'; return `<button type="button" class="srcrow ${f.src === k ? 'on' : ''}" ${bad ? 'disabled' : `data-act="setsrc:${k}"`} data-tip="${bad ? 'Este elemento necesita un número' : esc(s.how)}"><span class="kind">${ic(KIND[s.kind][0], 'sm')}</span><span class="t"><b>${esc(s.name)}</b><code>${esc(k.replace('#', ' › '))}</code></span><span class="v">${esc(fmtV(s, val(k)))}</span></button>`; }).join('')}</div>
      <span class="muted small">${ic('mdiInformationOutline', 'sm')} Tipo según Home Assistant: número, sí/no, estados o texto</span></div>`;
  }
  if (S.pop && S.pop.startsWith('lb|')) {
    const [, eid, slot] = S.pop.split('|'); const used = usedBtns();
    h += `<div class="pop" style="${near(`[data-act="pop:lb|${eid}|${slot}"]`)};width:260px"><h4>${ic('mdiRemoteTv', 'sm')}Botón aprendido</h4><div class="srclist">${LB.map(b => `<button type="button" class="srcrow" data-act="setlb:${eid}|${slot}|${b}"><span class="kind">${wave(LB.indexOf(b) + 3, 34, 16)}</span><span class="t"><b>${esc(b)}</b></span><span class="v">${used[b] ? used[b] + '×' : '<em class="no">sin usar</em>'}</span></button>`).join('')}</div>${ib('rfgo:learn', 'mdiPlus', 'Aprender uno nuevo')}</div>`;
  }
  if (S.pop === 'brand') {
    h += `<div class="pop" style="${near('#et-brand')};width:260px"><h4>${ic('mdiPlayBoxOutline', 'sm')}Botón de marca</h4><div class="brands">${BRANDS.map(b => `<button type="button" class="brandbtn" style="--ebg:${b[1]};--efg:${b[2]}" data-act="ebrand:${b[0]}">${ic(b[3])}${b[0]}</button>`).join('')}</div></div>`;
  }
  return h;
}

/* Acciones */
function actRF3(a, b, c) {
  const d = D();
  const elOf = id => DZ.find(x => x.id === id);
  switch (a) {
    case 'setsrc': { mark(); const f = d.fx[S.fxSel[d.id] ?? 0]; f.src = b; const s = SRC[b]; if (['border', 'icon', 'led'].includes(f.t)) f.rules = defaultRules(s); if (f.t === 'ring') { f.min = s.min; f.max = s.max; if (f.mode === 'rules') f.rules = defaultRules(s); } S.pop = null; syncValues(); return true; }
    case 'tvset': S.tv[b] = c; syncValues(); return true;
    case 'fxadd3': { mark(); const k = Object.keys(SRC).find(x => SRC[x].dev === d.id && (!NUMERIC_ONLY.includes(b) || SRC[x].kind === 'number')) || null; const s = SRC[k];
      d.fx.push(b === 'ring' ? { t: 'ring', src: k, min: s?.min ?? 0, max: s?.max ?? 100, w: 4, mode: 'fixed', a: d.c, b: '#E3E7E1', none: '#9AA59F', on: true } : b === 'num' ? { t: 'num', src: k, pos: 'tr', on: true } : b === 'label' ? { t: 'label', src: k, on: true } : { t: b, src: k, rules: defaultRules(s), none: '#9AA59F', on: true });
      S.fxSel[d.id] = d.fx.length - 1; return true; }
    case 'fxm': { mark(); const f = d.fx[b]; f.mode = c; if (c === 'rules' && !f.rules) f.rules = defaultRules(SRC[f.src]); return true; }
    case 'radd': { mark(); const f = d.fx[b]; const last = f.rules[f.rules.length - 1]; f.rules.push({ from: last ? last.to + 1 : 0, to: (last ? last.to : 0) + 10, c: '#B2577F', n: '' }); return true; }
    case 'rrm': mark(); d.fx[b].rules.splice(Number(c), 1); return true;
    case 'useprof': S.rf.profile = b; S.rf.listening = false; stopLearn(); return true;
    case 'chkrun': S.rf.chk[b] = 'run'; renderSide(); setTimeout(() => { if (S.rf.chk[b] === 'run') { S.rf.chk[b] = 'done'; if (S.rf.view === b) renderSide(); } }, 1600); return false;
    case 'cam': S.rf.cam = Number(b); S.rf.camNo = false; return true;
    case 'camno': S.rf.camNo = true; return true;
    case 'camsend': S.rf.chk.camera = 'run'; renderSide(); setTimeout(() => { S.rf.chk.camera = null; if (S.rf.view === 'camera') { S.rf.cam = 3; renderSide(); } }, 2500); return false;
    case 'camres': S.rf.camRes = b; return true;
    case 'dztest': S.rf.testMode = !S.rf.testMode; return true;
    case 'eadd3': { const id = 'p' + Date.now(); const y = Math.max(0, ...DZ.map(e => e.y + e.h));
      const base = { id, t: b, x: 0, y: Math.min(y, GRID.rows - 1), w: ['options', 'steps', 'hslider', 'graph', 'sep', 'text'].includes(b) ? GRID.cols : b === 'knob' ? 2 : 1, h: b === 'knob' || b === 'vslider' || b === 'graph' ? 2 : 1, label: ETALL[b][1], icon: ETALL[b][0], act: {} };
      if (b === 'options') base.opts = [{ n: 'Opción 1', b: null }, { n: 'Opción 2', b: null }];
      if (b === 'knob' || b === 'steps') base.steps = [null, null, null];
      if (b === 'preset') { base.seq = [{ b: null }]; base.bg = '#6F6BB8'; base.fg = '#FFFFFF'; base.label = 'Mi preset'; }
      if (b === 'value' || b === 'graph') base.src = 'sensor.aire_living_potencia';
      if (base.y + base.h > GRID.rows) GRID.rows = base.y + base.h;
      DZ.push(base); S.rf.el = id; S.pop = null; return true; }
    case 'ebrand': { const br = BRANDS.find(x => x[0] === b); const id = 'p' + Date.now(); const y = Math.max(0, ...DZ.map(e => e.y + e.h)); if (y + 1 > GRID.rows) GRID.rows = y + 1;
      DZ.push({ id, t: 'brand', x: 0, y, w: 2, h: 1, label: br[0], icon: br[3], bg: br[1], fg: br[2], act: { tap: null } }); S.rf.el = id; S.pop = null; return true; }
    case 'erm3': DZ = DZ.filter(e => e.id !== b); S.rf.el = DZ[0]?.id; return true;
    case 'edup': { const e = elOf(b); const n = { ...JSON.parse(JSON.stringify(e)), id: 'p' + Date.now(), y: Math.min(GRID.rows - e.h, e.y + e.h) }; DZ.push(n); S.rf.el = n.id; return true; }
    case 'etog': { const e = elOf(b); e[c] = !e[c]; return true; }
    case 'ecol': { const e = DZ.find(x => x.id === S.rf.el); e[b] = c; return true; }
    case 'eshape': elOf(b).shape = c === 'n' ? '' : c; return true;
    case 'estate': elOf(b).state = c; return true;
    case 'eoptadd': elOf(b).opts.push({ n: 'Opción', b: null }); return true;
    case 'eoptrm': elOf(b).opts.splice(Number(c), 1); return true;
    case 'estepadd': elOf(b).steps.push(null); return true;
    case 'esteprm': elOf(b).steps.splice(Number(c), 1); return true;
    case 'eseqadd': elOf(b).seq.push(c === 'w' ? { wait: 300 } : { b: null }); return true;
    case 'eseqrm': elOf(b).seq.splice(Number(c), 1); return true;
    case 'setlb': { const [eid, slot, btn] = b.split('|'); assign(elOf(eid), slot, btn); S.pop = null; return true; }
  }
  return null;
}
function assign(e, slot, btn) {
  if (!e) return;
  if (slot[0] === 'o' && /^\d+$/.test(slot.slice(1))) e.opts[Number(slot.slice(1))].b = btn;
  else if (slot[0] === 's' && /^\d+$/.test(slot.slice(1))) e.steps[Number(slot.slice(1))] = btn;
  else if (slot[0] === 'q' && /^\d+$/.test(slot.slice(1))) e.seq[Number(slot.slice(1))].b = btn;
  else { e.act = e.act || {}; e.act[slot] = btn; }
}
function dropOn(e, btn) {
  const slots = slotsOf(e);
  if (e.t === 'options') { const k = e.opts.findIndex(o => !o.b); if (k >= 0) e.opts[k].b = btn; else e.opts.push({ n: btn, b: btn }); return; }
  if (e.t === 'knob' || e.t === 'steps') { const k = e.steps.indexOf(null); if (k >= 0) e.steps[k] = btn; else e.steps.push(btn); return; }
  if (e.t === 'preset') { e.seq.push({ b: btn }); return; }
  const free = slots.find(s => !e.act?.[s[0]]) || slots[0];
  if (free) assign(e, free[0], btn);
}
function inputRF3(k, el, v) {
  const d = D(), i = Number(el.dataset.i);
  if (k === 'tv') { S.tv[el.dataset.k] = Number(v); document.querySelectorAll('[data-bind="tv"]').forEach(x => { if (x !== el) x.value = v; }); syncValues(); renderStage(); refreshPrev(d); const nl = document.querySelector('.fxed'); if (nl) { const f = d.fx[S.fxSel[d.id] ?? 0]; nl.outerHTML = fxEditor(d, f, S.fxSel[d.id] ?? 0); } return true; }
  if (k === 'fmin' || k === 'fmax') { d.fx[i][k === 'fmin' ? 'min' : 'max'] = Number(v); renderStage(); refreshPrev(d); return true; }
  if (k.startsWith('rc:') || k.startsWith('rfrom:') || k.startsWith('rto:') || k.startsWith('rn:')) {
    const [kk, n] = k.split(':'); const r = d.fx[i].rules[Number(n)];
    if (kk === 'rc') { r.c = v; el.parentElement.style.setProperty('--c', v); } else if (kk === 'rn') r.n = v; else r[kk === 'rfrom' ? 'from' : 'to'] = Number(v);
    renderStage(); refreshPrev(d); return true;
  }
  if (k.startsWith('rk:')) { d.fx[i].rules[k.slice(3)] = v; el.parentElement.style.setProperty('--c', v); renderStage(); refreshPrev(d); return true; }
  if (k === 'rnone') { d.fx[i].none = v; el.parentElement.style.setProperty('--c', v); renderStage(); refreshPrev(d); return true; }
  if (k === 'gcols' || k === 'grows') { GRID[k === 'gcols' ? 'cols' : 'rows'] = clamp(Number(v) || 2, 2, 30); renderStage(); return true; }
  if (k === 'elabel3') { const e = DZ.find(x => x.id === S.rf.el); e.label = v; renderStage(); return true; }
  if (k.startsWith('ecol:')) { const e = DZ.find(x => x.id === S.rf.el); e[k.slice(5)] = v; renderStage(); return true; }
  if (k.startsWith('epos:')) { const e = DZ.find(x => x.id === S.rf.el); const kk = k.slice(5); e[kk] = Math.max(kk === 'w' || kk === 'h' ? 1 : 0, (Number(v) || 1) - (kk === 'x' || kk === 'y' ? 1 : 0)); renderStage(); return true; }
  return false;
}
/* Mover y cambiar tamaño en el diseñador, arrastrar botones aprendidos */
document.addEventListener('pointerdown', ev => {
  const r = ev.target.closest?.('.designer .rel'); if (!r) return;
  const grid = $('#rgrid'), e = DZ.find(x => x.id === r.dataset.e), resize = !!ev.target.closest('[data-rh]');
  const gr = grid.getBoundingClientRect(), cs = getComputedStyle(grid), cell = parseFloat(cs.gridTemplateColumns.split(' ')[0]) + parseFloat(cs.columnGap || 0);
  const start = { x: ev.clientX, y: ev.clientY, ex: e.x, ey: e.y, ew: e.w, eh: e.h }; let moved = false;
  const move = m => {
    const dx = Math.round((m.clientX - start.x) / cell), dy = Math.round((m.clientY - start.y) / cell);
    if (!dx && !dy && !moved) return; moved = true;
    if (resize) { e.w = clamp(start.ew + dx, 1, GRID.cols - e.x); e.h = clamp(start.eh + dy, 1, GRID.rows - e.y); }
    else { e.x = clamp(start.ex + dx, 0, GRID.cols - e.w); e.y = clamp(start.ey + dy, 0, GRID.rows - e.h); }
    r.style.gridColumn = `${e.x + 1}/span ${e.w}`; r.style.gridRow = `${e.y + 1}/span ${e.h}`;
  };
  const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); S.rf.el = e.id; renderStage(); renderSide(); };
  ev.preventDefault(); document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
});
let dragLB = null;
document.addEventListener('dragstart', ev => { const t = ev.target.closest?.('.tchip'); if (!t) return; dragLB = t.dataset.lb; try { ev.dataTransfer.setData('text/plain', dragLB); } catch {} });
document.addEventListener('dragover', ev => { if (dragLB && ev.target.closest?.('.rel, .cell, .lbchip')) ev.preventDefault(); });
document.addEventListener('drop', ev => {
  if (!dragLB) return; const tgt = ev.target.closest?.('.lbchip, .rel, .cell'); if (!tgt) return; ev.preventDefault();
  if (tgt.classList.contains('lbchip')) { const [eid, slot] = tgt.dataset.drop.split('|'); assign(DZ.find(x => x.id === eid), slot, dragLB); }
  else if (tgt.classList.contains('rel')) { dropOn(DZ.find(x => x.id === tgt.dataset.e), dragLB); S.rf.el = tgt.dataset.e; }
  else { const [x, y] = tgt.dataset.cell.split(',').map(Number); const id = 'p' + Date.now(); DZ.push({ id, t: 'button', x, y, w: 1, h: 1, label: dragLB, icon: 'mdiGestureTap', act: { tap: dragLB } }); S.rf.el = id; }
  dragLB = null; renderStage(); renderSide();
});
document.addEventListener('dragend', () => { dragLB = null; });
Object.assign(S.rf, { chk: {}, cam: 1, camNo: false, camRes: null, profile: null, testMode: false, el: 'p1' });
go(location.hash.slice(1) || 'inicio');
