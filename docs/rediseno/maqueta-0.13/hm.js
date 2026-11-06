'use strict';
/* HomeManager 0.13 — maqueta interactiva. Datos inventados. */
const ICONS = window.HM_ICONS || {};
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ''}"/></svg>`;
const ib = (act, icon, tip, extra = '') =>
  `<button type="button" class="ib ${extra}" data-act="${act}" data-tip="${esc(tip)}" aria-label="${esc(tip)}">${ic(icon)}</button>`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (v, d = 0) => Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

/* ——— Datos de ejemplo ——— */
const PALETTES = {
  hogar: ['#4F7A5A', '#7FA37A', '#C9A66B', '#D98B1F', '#D0453A', '#B2577F', '#6F6BB8', '#4F8FBF', '#3E9C9C', '#5F6E66'],
  pastel: ['#A8D5BA', '#F6D6AD', '#F7B7A3', '#E8A9C9', '#C7B8EA', '#A7C7E7', '#B5E2E0', '#F3E8A6', '#D9D2C5', '#C2CCC4'],
  vivos: ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#00ACC1', '#1E88E5', '#5E35B1', '#D81B60', '#6D4C41', '#212121'],
  tierra: ['#8D6E63', '#A1887F', '#C0A080', '#B5833C', '#9C6B3E', '#6B8E23', '#556B2F', '#8F9779', '#A0522D', '#5D4037'],
  grises: ['#111111', '#333333', '#555555', '#777777', '#999999', '#BBBBBB', '#DDDDDD', '#F0F0F0', '#4F7A5A', '#8FB38B'],
  mia: ['#4F7A5A', '#E9A23B', '#6FA9D6'],
};
const PALNAMES = { hogar: 'Hogar', pastel: 'Pastel', vivos: 'Vivos', tierra: 'Tierra', grises: 'Grises', mia: 'Mi paleta' };
const ARCH = [
  { id: 'living', rects: [[40, 40, 420, 350]], floor: 'floor' },
  { id: 'cocina', rects: [[40, 400, 240, 260], [280, 530, 180, 130]], floor: 'floor-tile' },
  { id: 'dorm', rects: [[470, 40, 310, 300]], floor: 'floor-wood' },
  { id: 'oficina', rects: [[790, 40, 170, 300]], floor: 'floor-wood' },
  { id: 'bano', rects: [[470, 350, 200, 190]], floor: 'floor-tile' },
  { id: 'balcon', rects: [[680, 350, 280, 310]], floor: 'floor-deck' },
];
let SPACES = [
  { id: 'living', name: 'Living', icon: 'mdiSofaOutline', c: '#7FA37A', rects: [[40, 40, 420, 350]] },
  { id: 'cocina', name: 'Cocina', icon: 'mdiStove', c: '#C9A66B', rects: [[40, 400, 240, 260], [280, 530, 180, 130]] },
  { id: 'dorm', name: 'Dormitorio', icon: 'mdiBedKingOutline', c: '#6F6BB8', rects: [[470, 40, 310, 300]] },
  { id: 'oficina', name: 'Oficina', icon: 'mdiDesk', c: '#4F8FBF', rects: [[790, 40, 170, 300]] },
  { id: 'bano', name: 'Baño', icon: 'mdiShowerHead', c: '#3E9C9C', rects: [[470, 350, 200, 190]] },
  { id: 'balcon', name: 'Balcón', icon: 'mdiFlowerOutline', c: '#6B8E23', rects: [[680, 350, 280, 310]] },
];
const dev = (o) => ({ size: 100, op: 100, shape: 'circle', linked: true, layer: 'dev', value: null, c: '#4F7A5A', mods: ['device'], readings: [], ...o });
let DEV = [
  dev({ id: 'aire', name: 'Aire acondicionado', icon: 'mdiAirConditioner', sp: 'living', x: 300, y: 110, c: '#4F8FBF', value: '24 °C', mods: ['device', 'values', 'gestures', 'control', 'shortcuts', 'alerts'], readings: ['Temperatura', 'Modo', 'Consumo'] }),
  dev({ id: 'luz', name: 'Luz del techo', icon: 'mdiCeilingLight', sp: 'living', x: 160, y: 230, c: '#D98B1F', mods: ['device', 'gestures'], readings: ['Brillo'] }),
  dev({ id: 'robot', name: 'Robot aspirador', icon: 'mdiRobotVacuum', sp: 'living', x: 390, y: 300, c: '#5F6E66', value: 'En base', mods: ['device', 'values', 'shortcuts'], readings: ['Estado', 'Batería'] }),
  dev({ id: 'cortina', name: 'Cortina', icon: 'mdiCurtains', sp: 'dorm', x: 560, y: 90, c: '#6F6BB8', value: 'Abierta', mods: ['device', 'values'], readings: ['Posición'] }),
  dev({ id: 'vent', name: 'Ventilador', icon: 'mdiCeilingFan', sp: 'dorm', x: 650, y: 210, linked: false, mods: [] }),
  dev({ id: 'aire2', name: 'Aire oficina', icon: 'mdiAirConditioner', sp: 'oficina', x: 875, y: 270, c: '#4F8FBF', linked: false, mods: [] }),
  dev({ id: 'router', name: 'Router', icon: 'mdiRouterWireless', sp: 'oficina', x: 880, y: 110, layer: 'infra', c: '#5F6E66', shape: 'rounded', mods: ['device', 'values'], readings: ['Conexión'] }),
  dev({ id: 'term', name: 'Termohigrómetro', icon: 'mdiThermometer', sp: 'bano', x: 560, y: 440, c: '#3E9C9C', value: '27 °C · 48 %', mods: ['device', 'values'], readings: ['Temperatura', 'Humedad'] }),
  dev({ id: 'medidor', name: 'Medidor', icon: 'mdiMeterElectricOutline', sp: 'cocina', x: 110, y: 600, layer: 'infra', c: '#D98B1F', value: '1,24 kW', shape: 'rounded', mods: ['device', 'values'], readings: ['Potencia'] }),
  dev({ id: 'rep', name: 'Repetidor', icon: 'mdiAccessPointNetwork', sp: 'cocina', x: 230, y: 450, layer: 'infra', linked: false, c: '#5F6E66', shape: 'dot', mods: [] }),
  dev({ id: 'maceta', name: 'Maceta', icon: 'mdiSproutOutline', sp: 'balcon', x: 840, y: 470, c: '#6B8E23', value: '18 %', alert: true, mods: ['device', 'values', 'alerts'], readings: ['Humedad del suelo'] }),
  dev({ id: 'puerta', name: 'Puerta balcón', icon: 'mdiDoorSliding', sp: 'balcon', x: 730, y: 610, c: '#8D6E63', value: 'Cerrada', mods: ['device'], readings: ['Apertura'] }),
];
let WIDGETS = [
  { id: 'w1', type: 'atajos' }, { id: 'w2', type: 'clima' }, { id: 'w3', type: 'energia' }, { id: 'w4', type: 'activos' }, { id: 'w5', type: 'alertas' },
];
let SETS = [
  { id: 'orig', name: 'Original', main: true, light: true, dark: true },
  { id: 'muebles', name: 'Con muebles', main: false, light: true, dark: false },
];
const ALERTS = [
  { id: 'maceta', name: 'Maceta seca', sev: 'warn', txt: 'Humedad < 20 % · 10 min · 1 símbolo', on: true },
  { id: 'aire', name: 'Living caluroso', sev: 'info', txt: 'Temperatura > 28 °C · 15 min · 1 símbolo', on: true },
  { id: 'fuga', name: 'Agua en el piso', sev: 'alert', txt: 'Sensor de agua = mojado · en el momento', on: true },
];
const BASE = [
  { name: 'Batería baja', txt: '< 15 %', on: true, sev: 'warn' },
  { name: 'Sin conexión', txt: '> 10 min', on: true, sev: 'warn' },
  { name: 'Puerta o ventana abierta', txt: 'Seguridad', on: true, sev: 'alert' },
  { name: 'Movimiento', txt: 'Resaltar al detectar', on: false, sev: 'info' },
];
const AUTOS = [
  { id: 'dormir', name: 'Dormir', icon: 'mdiWeatherNight', on: true, pin: true, chips: [['mdiGestureTap', 'Botón en Ahora'], ['mdiClockOutline', '23:30']] },
  { id: 'salir', name: 'Salir de casa', icon: 'mdiHomeExportOutline', on: true, pin: true, chips: [['mdiGestureTap', 'Botón en Ahora'], ['mdiAccountOffOutline', 'Nadie en casa']] },
  { id: 'verif', name: 'Aire apagado de verdad', icon: 'mdiAirConditioner', on: true, pin: false, chips: [['mdiFlashOutline', 'Consumo > 50 W'], ['mdiWeatherNight', 'En modo Dormir']] },
];
const ICON_CHOICES = ['mdiAirConditioner', 'mdiCeilingLight', 'mdiLightbulbOutline', 'mdiFan', 'mdiCeilingFan', 'mdiTelevision', 'mdiRobotVacuum', 'mdiCurtains', 'mdiDoorSliding', 'mdiThermometer', 'mdiWaterPercent', 'mdiSproutOutline', 'mdiRouterWireless', 'mdiAccessPointNetwork', 'mdiMeterElectricOutline', 'mdiSpeaker', 'mdiCctv', 'mdiWashingMachine', 'mdiFridgeOutline', 'mdiLockOutline', 'mdiMotionSensor', 'mdiSmokeDetectorVariant', 'mdiPowerSocketEu', 'mdiDesk'];
const MODS = {
  device: { icon: 'mdiLinkVariant', t: 'Dispositivo', w: 'Dispositivo', sum: d => (d.linked ? `${d.readings.length} lecturas` : 'Sin vincular') },
  values: { icon: 'mdiGauge', t: 'Indicadores', w: 'Indicadores', sum: d => `${(d.fx || []).filter(f => f.on).map(f => FX[f.t].t).join(' · ') || 'Ninguno'}` },
  gestures: { icon: 'mdiGestureTap', t: 'Gestos', w: 'Gestos', sum: () => 'Tocar: prender · Mantener: control' },
  control: { icon: 'mdiTuneVariant', t: 'Control', w: 'Control', sum: () => 'Automático' },
  shortcuts: { icon: 'mdiLightningBoltOutline', t: 'Atajos', w: 'Atajos', sum: () => '2 atajos junto al símbolo' },
  alerts: { icon: 'mdiBellOutline', t: 'Alertas', w: 'Alertas', sum: d => (d.alert ? '1 alerta activa' : '1 alerta lo usa') },
};
const ZR = 2.2; // zoom de "por espacio"

/* ——— Estado ——— */
const S = {
  screen: 'inicio', mode: 'view', tool: null, sel: null, set: null, homes: false, home: 'Casa Demo', notes: false,
  zoom: 1, center: [500, 350], room: null, layers: { dev: true, infra: true }, tips: true, palette: 'hogar',
  open: { aire: 'values' }, pop: null, planTool: 'select', planSel: [], renaming: null, gallery: false, wset: null,
  sizes: { house: 80, room: 120, min: 60, max: 160 }, iv: { z: 1, c: [500, 350] }, ivLocal: false, link: 'unlinked', grid: 'normal', showVals: true,
  alertEdit: false, guide: 0, cmp: 'lt', sev: 'warn', opts: { badge: true, ring: true, bar: true, now: true }, autoEdit: null,
  nav: false, fxSel: {}, rf: { view: null, src: 'ir', listening: false, left: 15, tests: {}, sheet: 'sig', el: 'e1', heard: false },
  filter: 'all', dirty: 0, moving: false, activity: 'Cortina · Abierta · hace 2 min', drawing: null, mergeFirst: null,
};
let ORIG = null, UNDO = [], REDO = [], lastMark = { k: '', t: 0 };
const snap = () => JSON.stringify({ DEV, SPACES, WIDGETS, SETS });
const restore = j => { const o = JSON.parse(j); DEV = o.DEV; SPACES = o.SPACES; WIDGETS = o.WIDGETS; SETS = o.SETS; };
function mark(k = '') {
  const now = Date.now();
  if (k && k === lastMark.k && now - lastMark.t < 900) { lastMark.t = now; return; }
  lastMark = { k, t: now }; UNDO.push(snap()); REDO = [];
  if (S.mode === 'edit') S.dirty++;
}
const D = () => DEV.find(d => d.id === S.sel);
const SP = id => SPACES.find(s => s.id === id);

/* ——— Pantallas para revisar ——— */
const SCREENS = [
  ['Principal', [['inicio', 'Inicio'], ['casas', 'Casas']]],
  ['Editar', [['simbolo', 'Símbolo'], ['indicadores', 'Indicadores del símbolo'], ['plano', 'Plano'], ['ahora', 'Ahora'], ['vista', 'Tamaño y vista']]],
  ['Controles', [['controles', 'Controles'], ['equipos', 'Equipos'], ['control', 'Un control'], ['nuevo-control', '1 · Nuevo control'], ['aprender', '2 · Aprender'], ['probar', '3 · Probar'], ['disenador', '4 · Diseñar'], ['eco', 'Comprobar · auto-eco'], ['receptor-b', 'Comprobar · receptor B'], ['camara', 'Comprobar · cámara'], ['ficha', 'Ficha técnica']]],
  ['Ajustes', [['alertas', 'Alertas'], ['alerta-nueva', 'Nueva alerta'], ['guia', 'Guía'], ['automatizaciones', 'Automatizaciones'], ['automatizacion', 'Automatización'], ['estado', 'Estado'], ['datos', 'Datos'], ['ayuda', 'Ayuda']]],
];
const PRESET = {
  casas: { homes: true }, simbolo: { mode: 'edit', tool: 'sym', sel: 'aire' }, plano: { mode: 'edit', tool: 'plan' },
  ahora: { mode: 'edit', tool: 'now' }, vista: { mode: 'edit', tool: 'view' }, alertas: { set: 'alertas' },
  'alerta-nueva': { set: 'alertas', alertEdit: true }, guia: { set: 'alertas', alertEdit: true, guide: 1 },
  automatizaciones: { set: 'auto' }, automatizacion: { set: 'auto', autoEdit: 'dormir' }, controles: { set: 'rf' },
  indicadores: { mode: 'edit', tool: 'sym', sel: 'cortina' }, equipos: { set: 'rf', rfv: 'devices' }, control: { set: 'rf', rfv: 'remote' },
  'nuevo-control': { set: 'rf', rfv: 'new' }, aprender: { set: 'rf', rfv: 'learn' }, probar: { set: 'rf', rfv: 'test' }, disenador: { set: 'rf', rfv: 'design' }, ficha: { set: 'rf', rfv: 'sheet' },
  eco: { set: 'rf', rfv: 'echo' }, 'receptor-b': { set: 'rf', rfv: 'recvb' }, camara: { set: 'rf', rfv: 'camera' },
  estado: { set: 'estado' }, datos: { set: 'datos' }, ayuda: { set: 'ayuda' },
};
function go(id) {
  if (!PRESET[id] && id !== 'inicio') id = 'inicio';
  Object.assign(S, { mode: 'view', tool: null, sel: null, set: null, homes: false, alertEdit: false, guide: 0, autoEdit: null,
    gallery: false, wset: null, pop: null, zoom: 1, center: [500, 350], room: null, planSel: [], planTool: 'select', moving: false, nav: false }, PRESET[id] || {});
  stopLearn(); S.rf.view = PRESET[id]?.rfv ?? null; S.rf.tests = {}; Object.assign(S.rf, { chk: {}, cam: 1, camNo: false, camRes: null, profile: null }); S.tv = {}; if (typeof syncValues === 'function') syncValues();
  if (id === 'indicadores') S.open.cortina = 'values';
  if (S.rf.view === 'learn') { LEARNED = []; startLearn(); }
  if (S.rf.view === 'test') LEARNED = LEARN_NAMES.map((n, i) => ({ id: 'b' + i, name: n, seed: i + 3, ok: true }));
  if (S.mode === 'edit' && !ORIG) ORIG = snap();
  S.screen = id; render();
  if (id === 'indicadores') setTimeout(() => document.querySelector('.mod.open')?.scrollIntoView({ block: 'start' }));
}
function screenOf() {
  if (S.mode === 'edit') return S.tool === 'sym' && S.sel && S.open[S.sel] === 'values' ? 'indicadores' : { sym: 'simbolo', plan: 'plano', now: 'ahora', view: 'vista' }[S.tool];
  if (S.set === 'rf') return { devices: 'equipos', remote: 'control', new: 'nuevo-control', learn: 'aprender', test: 'probar', design: 'disenador', sheet: 'ficha', echo: 'eco', recvb: 'receptor-b', camera: 'camara' }[S.rf.view] || 'controles';
  if (S.set === 'alertas') return S.guide ? 'guia' : S.alertEdit ? 'alerta-nueva' : 'alertas';
  if (S.set === 'auto') return S.autoEdit ? 'automatizacion' : 'automatizaciones';
  if (S.set) return { rf: 'controles', estado: 'estado', datos: 'datos', ayuda: 'ayuda' }[S.set];
  return S.homes ? 'casas' : 'inicio';
}

/* ——— Render ——— */
function render() {
  S.screen = screenOf();
  if (location.hash.slice(1) !== S.screen) { try { history.replaceState(null, '', '#' + S.screen); } catch {} }
  renderReview(); renderTop(); renderRail(); renderStage(); renderSide(); renderPops(); renderNotes(); renderGuide(); renderNav();
}
function renderReview() {
  $('#notes-btn').setAttribute('aria-pressed', S.notes);
  $('#screen-sel').innerHTML = SCREENS.map(([g, list]) => `<optgroup label="${g}">` + list.map(([id, n]) => `<option value="${id}" ${S.screen === id ? 'selected' : ''}>${n}</option>`).join('') + '</optgroup>').join('');
}
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
function renderTop() {
  const t = $('#top');
  if (S.mode === 'edit') {
    t.className = 'top edit';
    const tool = (id, icon, tip) => ib('tool:' + id, icon, tip, S.tool === id ? 'on' : '');
    t.innerHTML = `<div class="tools" role="toolbar" aria-label="Herramientas">${tool('sym', 'mdiCursorDefaultClickOutline', 'Símbolos')}${tool('plan', 'mdiFloorPlan', 'Plano y espacios')}${tool('now', 'mdiViewDashboardEditOutline', 'Panel Ahora')}${tool('view', 'mdiMagnifyExpand', 'Tamaño y vista')}</div>
      <span class="sep"></span>${ib('undo', 'mdiUndo', 'Deshacer')}${ib('redo', 'mdiRedo', 'Rehacer')}<span class="grow"></span>
      ${ib('discard', 'mdiBackupRestore', 'Descartar cambios')}<button type="button" class="ib" data-act="save" data-tip="Guardar" aria-label="Guardar">${ic('mdiContentSaveOutline')}${S.dirty ? `<span class="badge">${S.dirty}</span>` : ''}</button>${ib('exit', 'mdiClose', 'Salir de edición')}`;
  } else {
    t.className = 'top';
    t.innerHTML = `<button type="button" class="home-pick" data-act="homes" data-tip="Cambiar o crear casa" aria-expanded="${S.homes}"><span class="logo">${ic('mdiHomeOutline', 'lg')}</span>${esc(S.home)}${ic('mdiChevronDown', 'sm')}</button>
      <div class="activity">${esc(S.activity)}</div><span class="clock">18:23</span>
      ${ib('theme', isDark() ? 'mdiWeatherSunny' : 'mdiWeatherNight', isDark() ? 'Modo claro' : 'Modo oscuro')}${ib('edit', 'mdiPencilOutline', 'Editar')}${ib('full', 'mdiFullscreen', 'Pantalla completa')}${ib('settings', 'mdiCogOutline', 'Ajustes', S.set ? 'on' : '')}`;
  }
}
function renderRail() {
  $('#rail').innerHTML = ib('navopen', 'mdiMenu', 'Menú') + '<span class="railsep"></span>' + ib('room:all', 'mdiHomeOutline', 'Toda la casa', !S.room ? 'on' : '') + SPACES.map(s => ib('room:' + s.id, s.icon, s.name, S.room === s.id ? 'on' : '')).join('');
}
function curvePct(z) {
  const t = clamp((z - 1) / (ZR - 1), 0, 1);
  return clamp(S.sizes.house + (S.sizes.room - S.sizes.house) * t, S.sizes.min, S.sizes.max) / 100;
}
function rectAttr(r) { return `x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}"`; }
function archSVG() {
  const fills = ARCH.map(s => s.rects.map(r => `<rect ${rectAttr(r)} style="fill:var(--${s.floor})"/>` +
    (s.floor === 'floor-wood' ? `<rect ${rectAttr(r)} fill="url(#wood)"/>` : s.floor === 'floor-tile' ? `<rect ${rectAttr(r)} fill="url(#tile)"/>` : s.floor === 'floor-deck' ? `<rect ${rectAttr(r)} fill="url(#deck)"/>` : '')).join('')).join('');
  const f = 'style="fill:var(--furn)"';
  const furn = `<rect x="60" y="80" width="56" height="210" rx="10" ${f}/><rect x="180" y="140" width="90" height="90" rx="8" ${f}/><rect x="60" y="410" width="34" height="240" rx="4" ${f}/><rect x="94" y="618" width="170" height="32" rx="4" ${f}/>
    <rect x="320" y="560" width="110" height="64" rx="8" ${f}/><rect x="560" y="120" width="160" height="190" rx="10" ${f}/><rect x="840" y="56" width="100" height="44" rx="4" ${f}/>
    <rect x="590" y="368" width="64" height="64" rx="6" ${f}/><circle cx="508" cy="500" r="18" ${f}/><circle cx="910" cy="620" r="18" ${f}/><circle cx="940" cy="400" r="14" ${f}/>`;
  const w = 'style="stroke:var(--wall)" stroke-width="7" stroke-linecap="square" fill="none"';
  const walls = `<rect x="35" y="35" width="930" height="630" style="stroke:var(--wall)" stroke-width="11" fill="none"/>
    <path ${w} d="M465 35V255M465 325V665M35 395H285M360 395H465M280 395V450M380 530H465M465 345H555M620 345H855M915 345H965M785 35V150M785 210V345M675 345V545M675 600V665M465 545H600M650 545H675"/>
    <path style="stroke:var(--cool)" stroke-width="4" d="M120 35H260M560 35H700M990 0M965 120V260M965 420V560M140 665H240"/>`;
  const defs = `<defs>
    <pattern id="wood" width="80" height="16" patternUnits="userSpaceOnUse"><path d="M0 15.5H80M40 0V16" style="stroke:var(--furn)" stroke-width="1"/></pattern>
    <pattern id="tile" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M0 29.5H30M29.5 0V30" style="stroke:var(--furn)" stroke-width="1"/></pattern>
    <pattern id="deck" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0 23.5H24" style="stroke:var(--furn)" stroke-width="2"/></pattern>
    <filter id="ring" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="5" result="d"/><feComposite in="d" in2="SourceAlpha" operator="out" result="r"/><feFlood style="flood-color:var(--brand)"/><feComposite in2="r" operator="in"/></filter>
  </defs>`;
  let over = '';
  if (S.mode === 'edit' && S.tool === 'plan') {
    over = SPACES.map(s => {
      const on = S.planSel.includes(s.id) || S.mergeFirst === s.id;
      const big = s.rects.reduce((a, r) => (r[2] * r[3] > a[2] * a[3] ? r : a));
      return `<g class="space-hit" data-act="space:${s.id}">${on ? `<g filter="url(#ring)">${s.rects.map(r => `<rect ${rectAttr(r)} fill="#000"/>`).join('')}</g>` : ''}
        ${s.rects.map(r => `<rect ${rectAttr(r)} style="fill:${s.c}" fill-opacity="${on ? 0.34 : 0.16}"/>`).join('')}
        <text x="${big[0] + big[2] / 2}" y="${big[1] + big[3] / 2}" text-anchor="middle" dominant-baseline="middle" style="fill:var(--ink);font:500 22px var(--font)">${esc(s.name)}</text></g>`;
    }).join('');
    if (S.drawing) { const r = S.drawing; over += `<rect x="${Math.min(r[0], r[2])}" y="${Math.min(r[1], r[3])}" width="${Math.abs(r[2] - r[0])}" height="${Math.abs(r[3] - r[1])}" style="fill:var(--brand);stroke:var(--brand)" fill-opacity=".2" stroke-width="3" stroke-dasharray="8 6"/>`; }
  } else if (S.room) {
    const s = SP(S.room);
    if (s) over = `<g filter="url(#ring)">${s.rects.map(r => `<rect ${rectAttr(r)} fill="#000"/>`).join('')}</g>`;
  }
  return `<svg class="arch" id="arch" viewBox="0 0 1000 700" role="img" aria-label="Plano de ejemplo">${defs}<rect x="35" y="35" width="930" height="630" style="fill:var(--floor)"/>${fills}${furn}${walls}${over}</svg>`;
}
function symbolsHTML() {
  const z = S.zoom, k = curvePct(z);
  return DEV.filter(d => S.layers[d.layer]).map(d => {
    const px = 44 * (d.size / 100) * k;
    const showLink = S.mode === 'edit' ? !d.linked : S.link !== 'never' && !d.linked;
    const fs = fxStyle(d);
    const cls = ['sym', fs.includes('--bc') ? 'bordered' : '', S.sel === d.id ? 'sel' : '', showLink ? 'unlinked' : '', S.link === 'always' && d.linked && S.mode === 'view' ? 'linkmark' : '', d.alert ? 'alerting' : ''].join(' ');
    return `<button type="button" class="${cls}" data-act="sym:${d.id}" data-tip="${esc(d.name)}" aria-label="${esc(d.name)}" data-shape="${d.shape}" style="left:${d.x / 10}%;top:${d.y / 7}%;--px:${px.toFixed(1)};--k:${(1 / z).toFixed(3)};--c:${d.c};--o:${d.op};${fs}">${ic(d.icon)}${fxHTML(d)}${d.value && S.showVals && fxOn(d, 'label') ? `<span class="val">${esc(d.value)}</span>` : ''}${d.alert ? `<span class="bdg">${ic('mdiExclamationThick')}</span>` : ''}</button>`;
  }).join('');
}
const PTOOLS = [
  ['select', 'mdiCursorDefaultOutline', 'Elegir', 'Tocá un espacio'], ['draw', 'mdiVectorRectangle', 'Dibujar espacio', 'Arrastrá sobre el plano'],
  ['addpart', 'mdiVectorSquarePlus', 'Agregar parte', 'Elegí un espacio y arrastrá'], ['divide', 'mdiVectorLine', 'Dividir', 'Tocá el espacio a dividir'],
  ['merge', 'mdiVectorUnion', 'Unir', 'Tocá dos espacios vecinos'], ['rename', 'mdiRenameOutline', 'Renombrar', 'Tocá el espacio'],
  ['delete', 'mdiTrashCanOutline', 'Borrar espacio', 'Tocá el espacio a borrar'],
];
function renderStage() {
  const st = $('#stage');
  st.className = 'stage' + (S.mode === 'edit' ? ' edit' : '');
  if (S.set === 'rf' && S.rf.view === 'design') { st.innerHTML = designerStage(); return; }
  const c = S.center, z = S.zoom;
  let bottom = '';
  if (S.mode === 'edit' && S.tool === 'plan') {
    const cur = PTOOLS.find(p => p[0] === S.planTool);
    const hint = S.planTool === 'merge' && S.mergeFirst ? 'Tocá el segundo espacio' : S.planTool === 'addpart' && !S.planSel.length ? 'Elegí un espacio' : cur[3];
    bottom = `<div class="ptool"><div class="hint">${esc(hint)}</div><div class="bar" role="toolbar">${PTOOLS.map(p => ib('ptool:' + p[0], p[1], p[2], S.planTool === p[0] ? 'on' : '')).join('')}<span class="sep" style="align-self:center"></span>${ib('undo', 'mdiUndo', 'Deshacer')}</div></div>`;
  } else {
    bottom = `<div class="layerbox">${ib('layer:dev', 'mdiLightbulbGroupOutline', 'Dispositivos', S.layers.dev ? 'on' : '')}${ib('layer:infra', 'mdiLan', 'Infraestructura', S.layers.infra ? 'on' : '')}</div>` +
      (S.mode === 'edit' && S.tool === 'sym' ? `<button type="button" class="fab" data-act="sym-add" data-tip="Agregar símbolo" aria-label="Agregar símbolo">${ic('mdiPlus', 'lg')}</button>` : '');
  }
  st.innerHTML = `<div class="planwrap"><div class="plan ${S.mode === 'edit' && S.tool === 'plan' ? 'dimmed' : ''}" id="plan" style="transform:scale(${z}) translate(${(500 - c[0]) / 10}%, ${(350 - c[1]) / 7}%)">${archSVG()}${symbolsHTML()}</div></div>
    <div class="zoombox">${ib('zoom:in', 'mdiPlus', 'Acercar')}${ib('zoom:out', 'mdiMinus', 'Alejar')}${ib('initial', 'mdiHomeMapMarker', 'Vista inicial')}</div>${bottom}`;
}

/* ——— Panel derecho ——— */
function renderSide() {
  const sd = $('#side');
  sd.className = 'side';
  if (S.mode === 'edit') {
    if (S.tool === 'sym') sd.innerHTML = S.sel ? symPanel(D()) : symList();
    else if (S.tool === 'plan') sd.innerHTML = planPanel();
    else if (S.tool === 'now') { sd.className = 'side now'; sd.innerHTML = nowPanel(true); }
    else if (S.tool === 'view') sd.innerHTML = viewPanel();
  } else if (S.set) sd.innerHTML = settingsPanel();
  else { sd.className = 'side now'; sd.innerHTML = nowPanel(false); }
}
function symList() {
  return `<div class="dh"><h2>Símbolos</h2>${ib('sym-add', 'mdiPlus', 'Agregar símbolo')}</div>
  <div class="dbody"><label class="search">${ic('mdiMagnify')}<input id="sym-q" placeholder="Buscar" aria-label="Buscar símbolo"></label>
  <div class="list">${DEV.map(d => `<div class="li" data-act="sym:${d.id}" style="cursor:pointer"><span class="ico-tile" style="--c:${d.c}">${ic(d.icon)}</span><div class="t"><b>${esc(d.name)}</b><span>${esc(SP(d.sp)?.name || 'Sin espacio')}${d.layer === 'infra' ? ' · Infraestructura' : ''}</span></div>${d.linked ? '' : `<span data-tip="Sin vincular" style="color:var(--edit)">${ic('mdiLinkOff', 'sm')}</span>`}</div>`).join('')}</div></div>`;
}
function modBody(id, d) {
  switch (id) {
    case 'device':
      return d.linked
        ? `<div class="chips"><span class="chip" style="padding-right:10px">${ic('mdiHomeAssistant', 'sm')} ${esc(d.name)} · ${esc(SP(d.sp)?.name || '')}</span>${ib('x', 'mdiSwapHorizontal', 'Cambiar dispositivo')}${ib('x', 'mdiLinkOff', 'Desvincular')}</div>
           <div class="chips">${d.readings.map(r => `<span class="chip">${esc(r)}<button type="button" data-tip="Quitar lectura" aria-label="Quitar">${ic('mdiClose', 'sm')}</button></span>`).join('')}<button type="button" class="chip add" data-tip="Agregar lectura">${ic('mdiPlus', 'sm')}</button></div>`
        : `<button type="button" class="chip add" data-act="link-dev">${ic('mdiLinkVariantPlus', 'sm')} Vincular</button>`;
    case 'values':
      return indicBody(d);
    case 'values-old':
      return `<div class="chips">${(d.readings.length ? d.readings : ['Estado']).map((r, i) => `<span class="chip" style="${i === 0 ? 'border-color:var(--brand);color:var(--brand)' : ''};padding-right:10px">${i === 0 ? ic('mdiCheck', 'sm') : ''}${esc(r)}</span>`).join('')}</div>
        <div class="row wide" style="grid-template-columns:24px auto 1fr">${ic('mdiDecimal')}<div class="seg">${['0', '0,0', '0,00'].map((v, i) => `<button type="button" class="ib ${i === 0 ? 'on' : ''}" style="width:auto;padding:0 10px;font-size:13px" data-tip="Decimales">${v}</button>`).join('')}</div><span></span></div>
        <div class="row wide">${ic('mdiPaletteSwatchVariant')}<span class="name">Colores por rango</span><button type="button" class="switch" role="switch" aria-checked="false" data-act="sw" aria-label="Colores por rango"></button></div>`;
    case 'gestures':
      return `<div class="gest">${ic('mdiGestureTap')}<select class="field" aria-label="Al tocar"><option>Prender o apagar</option><option>Abrir control</option><option>Abrir app</option><option>Elegir entre varias</option></select>
        ${ic('mdiGestureTapHold')}<select class="field" aria-label="Al mantener"><option>Abrir control</option><option>Prender o apagar</option><option>Abrir app</option></select>
        ${ic('mdiGestureDoubleTap')}<select class="field" aria-label="Doble toque"><option>Nada</option><option>Abrir app</option></select></div>`;
    case 'control':
      return `<div class="ctlprev"><span class="knob">24°</span><div class="chips">${['mdiSnowflake', 'mdiFire', 'mdiFan', 'mdiWaterOutline'].map(n => `<span class="ico-tile">${ic(n)}</span>`).join('')}</div><span class="grow"></span>${ib('x', 'mdiPencilRuler', 'Diseñar control')}</div>`;
    case 'shortcuts':
      return `<div class="chips"><span class="chip">${ic('mdiSnowflake', 'sm')} Turbo<button type="button" aria-label="Quitar">${ic('mdiClose', 'sm')}</button></span><span class="chip">${ic('mdiVolumeOff', 'sm')} Silencio<button type="button" aria-label="Quitar">${ic('mdiClose', 'sm')}</button></span><button type="button" class="chip add" data-tip="Agregar atajo (hasta 3)">${ic('mdiPlus', 'sm')}</button></div>`;
    case 'alerts':
      return `<div class="list">${d.alert ? `<div class="li"><span class="dot" style="--c:var(--warn)"></span><div class="t"><b>Maceta seca</b><span>Humedad < 20 % · 10 min</span></div>${ib('go:alerta-nueva', 'mdiPencilOutline', 'Editar alerta')}</div>` : `<div class="li"><span class="dot" style="--c:var(--info)"></span><div class="t"><b>Living caluroso</b><span>Temperatura > 28 °C · 15 min</span></div>${ib('go:alerta-nueva', 'mdiPencilOutline', 'Editar alerta')}</div>`}</div>
        <div class="chips">${ib('go:alerta-nueva', 'mdiBellPlusOutline', 'Nueva alerta para este símbolo')}</div>`;
  }
  return '';
}
function symPanel(d) {
  const pal = PALETTES[S.palette];
  const shapes = [['circle', 'mdiCircleOutline', 'Círculo'], ['rounded', 'mdiSquareRoundedOutline', 'Redondeado'], ['square', 'mdiSquareOutline', 'Cuadrado'], ['dot', 'mdiCircleSmall', 'Punto'], ['none', 'mdiCircleOffOutline', 'Sin fondo']];
  const missing = Object.keys(MODS).filter(m => !d.mods.includes(m));
  return `<div class="symhead">
    <button type="button" class="iconbtn" id="iconbtn" style="--c:${d.c}" data-act="pop:icon" data-tip="Cambiar icono" aria-label="Cambiar icono">${ic(d.icon, 'lg')}<span class="pen">${ic('mdiPencil')}</span></button>
    <div class="titlebox"><input class="title-in" id="sym-name" value="${esc(d.name)}" aria-label="Nombre" data-bind="name" data-tip="Tocá para cambiar el nombre">
      <button type="button" class="spacepick" data-act="pop:space" data-tip="Espacio">${ic('mdiMapMarkerOutline', 'sm')}${esc(SP(d.sp)?.name || 'Sin espacio')}${ic('mdiChevronDown', 'sm')}</button></div>
    ${ib('close-sym', 'mdiClose', 'Cerrar')}</div>
  <div class="dbody">
    <div class="row wide">${ic('mdiLan')}<span class="name">Infraestructura</span><button type="button" class="switch" role="switch" aria-checked="${d.layer === 'infra'}" data-act="infra" aria-label="Infraestructura" data-tip="Se oculta con el filtro de infraestructura"></button></div>
    <div class="lbl">Aspecto<span class="grow"></span></div>
    <div class="row" data-tip-row>${ic('mdiResize')}<input type="range" id="r-size" min="40" max="200" step="5" value="${d.size}" data-bind="size" aria-label="Tamaño" data-tip="Tamaño respecto de los demás"><label class="num"><input type="number" id="n-size" min="40" max="200" value="${d.size}" data-bind="size" aria-label="Tamaño en %"><span>%</span></label></div>
    <div class="row">${ic('mdiCircleOpacity')}<input type="range" id="r-op" min="0" max="100" step="5" value="${d.op}" data-bind="op" aria-label="Opacidad del fondo" data-tip="Opacidad del fondo"><label class="num"><input type="number" id="n-op" min="0" max="100" value="${d.op}" data-bind="op" aria-label="Opacidad en %"><span>%</span></label></div>
    <div class="row wide" style="grid-template-columns:24px auto 1fr">${ic('mdiShapeOutline')}<div class="seg" role="radiogroup" aria-label="Forma">${shapes.map(s => ib('shape:' + s[0], s[1], s[2], d.shape === s[0] ? 'on' : '')).join('')}</div><span></span></div>
    <div class="row wide" style="grid-template-columns:24px minmax(0,1fr);align-items:start">${ic('mdiPaletteOutline')}<div style="display:flex;flex-direction:column;gap:10px">
      <div class="swatches">${pal.map(c => `<button type="button" class="sw ${c.toLowerCase() === d.c.toLowerCase() ? 'on' : ''}" style="--c:${c}" data-act="color:${c}" data-tip="${c}" aria-label="Color ${c}"></button>`).join('')}<label class="sw custom" data-tip="Otro color"><input type="color" id="c-custom" value="${d.c}" data-bind="color" aria-label="Elegir otro color"></label></div>
      <div class="palsel"><select id="pal" data-bind="palette" aria-label="Paleta">${Object.keys(PALETTES).map(p => `<option value="${p}" ${S.palette === p ? 'selected' : ''}>${PALNAMES[p]}</option>`).join('')}</select>${ib('pal:add', 'mdiPlusCircleOutline', 'Agregar este color a Mi paleta')}${S.palette === 'mia' ? ib('pal:rm', 'mdiMinusCircleOutline', 'Quitar este color de Mi paleta') : ''}</div></div></div>
    ${d.mods.map(m => `<div class="mod ${S.open[d.id] === m ? 'open' : ''}"><div class="modh"><button type="button" class="modt" data-act="mod:toggle:${m}" aria-expanded="${S.open[d.id] === m}">${ic(MODS[m].icon)}<span class="t"><b>${MODS[m].t}</b><span>${esc(MODS[m].sum(d))}</span></span>${ic('mdiChevronDown', 'chev')}</button>${ib('mod:rm:' + m, 'mdiTrashCanOutline', 'Quitar ' + MODS[m].t.toLowerCase(), 'modrm')}</div><div class="modb">${modBody(m, d)}</div></div>`).join('')}
    ${missing.length ? `<div class="lbl">Agregar<span class="grow"></span></div><div class="addmods">${missing.map(m => `<button type="button" data-act="mod:add:${m}">${ic('mdiPlus', 'sm')}${ic(MODS[m].icon, 'sm')}${MODS[m].w}</button>`).join('')}</div>` : ''}
  </div>
  <div class="dfoot">${ib('sym-del', 'mdiTrashCanOutline', 'Borrar símbolo', 'danger')}${ib('sym-move', 'mdiCursorMove', 'Mover', S.moving ? 'on' : '')}${ib('sym-dup', 'mdiContentCopy', 'Duplicar')}<span class="grow"></span><button type="button" class="ib primary" data-act="close-sym" data-tip="Listo" aria-label="Listo">${ic('mdiCheck')}</button></div>`;
}
function miniPlan(dark) {
  const p = dark ? { bg: '#1b221e', a: '#26302a', w: '#3a3227', t: '#252c28', d: '#322d25', wall: '#9fb0a5' } : { bg: '#ffffff', a: '#efe9dc', w: '#e6d3b5', t: '#e8ebe6', d: '#ddd3c0', wall: '#3e4b43' };
  const col = { floor: p.a, 'floor-wood': p.w, 'floor-tile': p.t, 'floor-deck': p.d };
  return `<svg class="mini" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="${p.bg}"/><rect x="35" y="35" width="930" height="630" fill="${p.a}"/>${ARCH.map(s => s.rects.map(r => `<rect ${rectAttr(r)} fill="${col[s.floor]}"/>`).join('')).join('')}<rect x="35" y="35" width="930" height="630" fill="none" stroke="${p.wall}" stroke-width="16"/><path d="M465 35V665M35 395H465M465 345H965M785 35V345M675 345V665" stroke="${p.wall}" stroke-width="10" fill="none"/></svg>`;
}
function planPanel() {
  return `<div class="dh"><h2>Plano</h2>${ib('x', 'mdiHomeImportOutline', 'Traer áreas de Home Assistant')}</div>
  <div class="dbody">
    <div class="lbl">Imágenes<span class="grow"></span></div>
    <div class="sets">${SETS.map(s => `<div class="set ${s.main ? 'main' : ''}"><header>${ib('set-main:' + s.id, s.main ? 'mdiStar' : 'mdiStarOutline', s.main ? 'Principal' : 'Usar como principal', s.main ? 'on' : '')}<b>${esc(s.name)}</b>${ib('x', 'mdiPencilOutline', 'Renombrar')}${s.main ? '' : ib('set-del:' + s.id, 'mdiTrashCanOutline', 'Borrar')}</header>
      <div class="thumbs">${['light', 'dark'].map(m => s[m] ? `<div class="thumb"><span class="mode">${ic(m === 'light' ? 'mdiWeatherSunny' : 'mdiWeatherNight')}</span>${miniPlan(m === 'dark')}</div>`
        : `<button type="button" class="thumb empty" data-act="set-up:${s.id}:${m}" data-tip="${m === 'light' ? 'Imagen clara' : 'Imagen oscura'}">${ic('mdiImagePlusOutline')}<span>SVG / PNG / JPG</span></button>`).join('')}</div></div>`).join('')}</div>
    <div class="addmods"><button type="button" data-act="set-add">${ic('mdiPlus', 'sm')}${ic('mdiImageMultipleOutline', 'sm')}Imágenes</button></div>
    <div class="lbl">Espacios<span class="grow"></span></div>
    <div class="list">${SPACES.map(s => {
      const n = DEV.filter(d => d.sp === s.id).length;
      return `<div class="li ${S.planSel.includes(s.id) ? 'sel' : ''}" data-act="space:${s.id}" style="cursor:pointer"><span class="ico-tile" style="--c:${s.c}">${ic(s.icon)}</span><div class="t">${S.renaming === s.id ? `<input class="name-in" id="ren-${s.id}" value="${esc(s.name)}" data-bind="spname" data-id="${s.id}" aria-label="Nombre del espacio">` : `<b>${esc(s.name)}</b>`}<span>${n} símbolos${s.rects.length > 1 ? ` · ${s.rects.length} partes` : ''}</span></div>
        <div class="acts">${ib('sp-ren:' + s.id, 'mdiRenameOutline', 'Renombrar')}${ib('x', 'mdiHomeExportOutline', 'Crear esta área en Home Assistant')}${ib('sp-del:' + s.id, 'mdiTrashCanOutline', 'Borrar espacio', 'danger')}</div></div>`;
    }).join('')}</div>
  </div>`;
}

/* Panel Ahora */
const spark = (pts, h = 36) => {
  const max = Math.max(...pts), min = Math.min(...pts), w = 260;
  const xy = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - 4 - ((v - min) / (max - min || 1)) * (h - 8)}`);
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px;display:block"><path d="M0,${h} L${xy.join(' L')} L${w},${h}Z" style="fill:var(--brand)" fill-opacity=".12"/><path d="M${xy.join(' L')}" style="stroke:var(--brand)" stroke-width="2" fill="none"/><circle cx="${w}" cy="${xy[xy.length - 1].split(',')[1]}" r="3.5" style="fill:var(--brand)"/></svg>`;
};
const WTYPES = {
  atajos: { t: 'Atajos', icon: 'mdiGestureTap' }, clima: { t: 'Clima', icon: 'mdiThermometer' }, energia: { t: 'Energía', icon: 'mdiFlashOutline' },
  activos: { t: 'Encendido', icon: 'mdiPower' }, alertas: { t: 'Alertas', icon: 'mdiBellOutline' }, lectura: { t: 'Lectura', icon: 'mdiGauge' }, grafico: { t: 'Gráfico', icon: 'mdiChartLine' },
};
function widgetBody(w) {
  switch (w.type) {
    case 'atajos': return `<div class="shortcuts">${AUTOS.filter(a => a.pin).map(a => `<button type="button" class="scut" data-act="run:${a.id}"><span class="c">${ic(a.icon)}</span>${esc(a.name)}</button>`).join('')}<button type="button" class="scut" data-act="run:cine"><span class="c">${ic('mdiMovieOpenOutline')}</span>Cine</button></div>`;
    case 'clima': return `<div class="tiles">${[['Living', '24,6°', '52 %'], ['Dormitorio', '23,1°', '55 %'], ['Oficina', '25,0°', '—'], ['Baño', '27,0°', '48 %']].map(r => `<div class="tile"><span>${r[0]}</span><b>${r[1]}</b><span>${ic('mdiWaterPercent', 'sm')} ${r[2]}</span></div>`).join('')}</div>`;
    case 'energia': return `<div style="display:flex;align-items:baseline;gap:8px"><span class="big">1,24</span><span class="muted">kW ahora</span></div>${spark([0.6, 0.7, 0.65, 0.9, 1.4, 1.2, 0.8, 0.95, 1.1, 1.24])}<div class="wlist" style="margin-top:8px"><div>${ic('mdiAirConditioner', 'sm')}<span>Aire living</span><b>820 W</b></div><div>${ic('mdiFridgeOutline', 'sm')}<span>Heladera</span><b>140 W</b></div><div>${ic('mdiRouterWireless', 'sm')}<span>Router</span><b>12 W</b></div></div>`;
    case 'activos': return `<div class="wlist"><div>${ic('mdiAirConditioner', 'sm')}<span>Aire living</span><b>Frío 24°</b></div><div>${ic('mdiCurtains', 'sm')}<span>Cortina</span><b>Abierta</b></div><div>${ic('mdiCeilingLight', 'sm')}<span>Luz del techo</span><b>60 %</b></div></div>`;
    case 'alertas': return `<div class="wlist"><div><span class="dot" style="--c:var(--warn)"></span><span>Maceta seca</span><b>18 %</b></div></div>`;
    case 'lectura': return `<div style="display:flex;align-items:baseline;gap:8px"><span class="big">48</span><span class="muted">% humedad · Baño</span></div>`;
    case 'grafico': return `${spark([22, 22.5, 23.4, 24.8, 25.1, 24.6, 24.2, 24.6], 52)}<div class="small muted">Temperatura living · 24 h</div>`;
  }
  return '';
}
function nowPanel(edit) {
  const head = `<div class="nowh"><h2>Ahora</h2>${edit ? ib('w-add', 'mdiPlus', 'Agregar bloque', S.gallery ? 'on' : '') + ib('w-reset', 'mdiRestore', 'Volver al panel estándar') : ''}</div>`;
  return head + `<div class="widgets" id="widgets">${WIDGETS.map(w => `<section class="w ${w.half ? 'half' : ''} ${edit ? 'editing' : ''}" data-w="${w.id}" ${edit ? 'draggable="true"' : ''}>
    <h3>${ic(WTYPES[w.type].icon, 'sm')}${esc(w.title || WTYPES[w.type].t)}</h3>${widgetBody(w)}
    ${edit ? `<div class="wtools"><span class="ib" data-tip="Arrastrar para mover" style="cursor:grab">${ic('mdiDragVertical')}</span>${ib('w-half:' + w.id, w.half ? 'mdiArrowExpandHorizontal' : 'mdiArrowCollapseHorizontal', w.half ? 'Ancho completo' : 'Media columna')}${ib('w-set:' + w.id, 'mdiCogOutline', 'Ajustar bloque')}${ib('w-rm:' + w.id, 'mdiClose', 'Quitar bloque')}</div>` : ''}</section>`).join('')}</div>`;
}

/* Tamaño y vista */
function curveSVG() {
  const W = 320, H = 120, x0 = 34, x1 = W - 10, y0 = 10, y1 = H - 24, zmax = 2.8;
  const { min, max } = S.sizes;
  const X = z => x0 + ((z - 1) / (zmax - 1)) * (x1 - x0);
  const Y = p => y1 - ((p - (min - 10)) / (max + 10 - (min - 10))) * (y1 - y0);
  const pts = []; for (let z = 1; z <= zmax + 0.001; z += 0.1) pts.push(`${X(z).toFixed(1)},${Y(curvePct(z) * 100).toFixed(1)}`);
  const cz = clamp(S.zoom, 1, zmax);
  return `<svg class="curve" id="curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tamaño según el zoom">
    <line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" style="stroke:var(--line)"/><line x1="${x0}" y1="${Y(100)}" x2="${x1}" y2="${Y(100)}" style="stroke:var(--line)" stroke-dasharray="3 4"/>
    <line x1="${X(ZR)}" y1="${y0}" x2="${X(ZR)}" y2="${y1}" style="stroke:var(--line)" stroke-dasharray="3 4"/>
    <text x="${x0}" y="${H - 8}">Casa</text><text x="${X(ZR)}" y="${H - 8}" text-anchor="middle">Espacio</text><text x="${x0 - 6}" y="${Y(100) + 3}" text-anchor="end">100%</text>
    <polyline points="${pts.join(' ')}" style="stroke:var(--brand)" stroke-width="2.5" fill="none"/>
    <circle cx="${X(cz)}" cy="${Y(curvePct(cz) * 100)}" r="6" style="fill:var(--brand);stroke:var(--surface)" stroke-width="2"/></svg>`;
}
function ivFrame() {
  const w = 100 / S.iv.z, h = 100 / S.iv.z, l = S.iv.c[0] / 10 - w / 2, t = S.iv.c[1] / 7 - h / 2;
  return `<span class="frame" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%"></span>`;
}
function viewPanel() {
  const n = (k, min, max, tip) => `<label class="num" data-tip="${tip}"><input type="number" id="n-${k}" min="${min}" max="${max}" value="${S.sizes[k]}" data-bind="sz:${k}" aria-label="${tip}"><span>%</span></label>`;
  const r = (k, icon, tip) => `<div class="row">${ic(icon)}<input type="range" id="r-${k}" min="40" max="200" step="5" value="${S.sizes[k]}" data-bind="sz:${k}" aria-label="${tip}" data-tip="${tip}">${n(k, 40, 200, tip)}</div>`;
  const seg = (key, opts) => `<div class="seg">${opts.map(o => ib(key + ':' + o[0], o[1], o[2], S[key] === o[0] ? 'on' : '')).join('')}</div>`;
  return `<div class="dh"><h2>Tamaño y vista</h2>${ib('sz-reset', 'mdiRestore', 'Valores estándar')}</div>
  <div class="dbody">
    <div class="lbl">Tamaño de los símbolos<span class="grow"></span></div>
    ${r('house', 'mdiHomeOutline', 'Con la casa entera')}${r('room', 'mdiSofaOutline', 'Al ver un espacio')}
    <div id="curvebox">${curveSVG()}</div>
    <div class="row">${ic('mdiMagnify')}<input type="range" id="r-zoom" min="1" max="2.8" step="0.05" value="${S.zoom}" data-bind="zoom" aria-label="Probar zoom" data-tip="Probá el zoom: el plano cambia en vivo"><label class="num"><input type="number" id="n-zoom" min="1" max="2.8" step="0.1" value="${S.zoom.toFixed(1)}" data-bind="zoom" aria-label="Zoom"><span>×</span></label></div>
    <div style="display:grid;grid-template-columns:24px 1fr 24px 1fr;gap:10px;align-items:center">${ic('mdiArrowCollapseAll')}${n('min', 20, 100, 'Mínimo')}${ic('mdiArrowExpandAll')}${n('max', 100, 300, 'Máximo')}</div>
    <div class="lbl">Vista inicial<span class="grow"></span></div>
    <div class="iv" id="ivbox">${miniPlan(isDark())}${ivFrame()}</div>
    <div style="display:flex;align-items:center;gap:6px">${ib('iv-pin', 'mdiPinOutline', 'Usar la vista actual')}${ib('iv-go', 'mdiHomeMapMarker', 'Ir a la vista inicial')}${ib('iv-clear', 'mdiPinOffOutline', 'Volver a la casa entera')}<span class="grow"></span>${ic('mdiMonitor')}<button type="button" class="switch" role="switch" aria-checked="${S.ivLocal}" data-act="iv-local" aria-label="Sólo en este equipo" data-tip="Sólo en este equipo"></button></div>
    <div class="lbl">Marca de vínculo<span class="grow"></span></div>
    ${seg('link', [['never', 'mdiEyeOffOutline', 'Nunca'], ['unlinked', 'mdiLinkOff', 'Sólo en los que no están vinculados'], ['always', 'mdiLinkVariant', 'Siempre']])}
    <div class="lbl">Cuadrícula al mover<span class="grow"></span></div>
    ${seg('grid', [['off', 'mdiGridOff', 'Sin cuadrícula'], ['fine', 'mdiDotsGrid', 'Fina (0,5 %)'], ['normal', 'mdiGrid', 'Normal (1 %)'], ['coarse', 'mdiGridLarge', 'Gruesa (2 %)']])}
    <div class="row wide">${ic('mdiNumeric')}<span class="name">Valores en el plano</span><button type="button" class="switch" role="switch" aria-checked="${S.showVals}" data-act="vals" aria-label="Valores en el plano"></button></div>
  </div>`;
}

/* ——— Ajustes ——— */
const TABS = [['alertas', 'mdiBellOutline', 'Alertas'], ['auto', 'mdiRobotOutline', 'Automatizaciones'], ['rf', 'mdiRemote', 'Controles'], ['estado', 'mdiStethoscope', 'Estado de la casa'], ['datos', 'mdiDatabaseOutline', 'Datos y copias'], ['ayuda', 'mdiHelpCircleOutline', 'Ayuda']];
function settingsPanel() {
  if (S.set === 'rf') return rfPanel2() ?? rfPanel();
  const title = TABS.find(t => t[0] === S.set)[2];
  let extra = '', body = '';
  if (S.set === 'alertas') {
    if (S.alertEdit) return alertEditor();
    extra = ib('alert-new', 'mdiPlus', 'Nueva alerta') + ib('guide', 'mdiSchoolOutline', 'Guía paso a paso');
    body = `<div class="lbl">Mis alertas<span class="grow"></span></div><div class="list">${ALERTS.map(a => `<div class="li" data-act="alert-open" style="cursor:pointer"><span class="dot" style="--c:var(--${a.sev})"></span><div class="t"><b>${esc(a.name)}</b><span>${esc(a.txt)}</span></div><button type="button" class="switch" role="switch" aria-checked="${a.on}" data-act="sw" aria-label="Activa"></button></div>`).join('')}</div>
      <div class="lbl">Incluidas<span class="grow"></span></div><div class="list">${BASE.map(a => `<div class="li"><span class="dot" style="--c:var(--${a.sev})"></span><div class="t"><b>${esc(a.name)}</b><span>${esc(a.txt)}</span></div><div class="acts">${ib('x', 'mdiPencilOutline', 'Cambiar límite')}</div><button type="button" class="switch" role="switch" aria-checked="${a.on}" data-act="sw" aria-label="Activa"></button></div>`).join('')}</div>`;
  } else if (S.set === 'auto') {
    if (S.autoEdit) return autoEditor();
    extra = ib('auto-open', 'mdiPlus', 'Nueva automatización');
    body = `<div class="list">${AUTOS.map(a => `<div class="li" data-act="auto-open" style="cursor:pointer;align-items:flex-start"><span class="ico-tile">${ic(a.icon)}</span><div class="t"><b>${esc(a.name)}</b><div class="chips" style="margin-top:6px">${a.chips.map(c => `<span class="chip" style="padding-right:10px">${ic(c[0], 'sm')}${esc(c[1])}</span>`).join('')}</div></div>${ib('pin:' + a.id, a.pin ? 'mdiStar' : 'mdiStarOutline', a.pin ? 'Está en la pantalla principal' : 'Poner en la pantalla principal', a.pin ? 'on' : '')}<button type="button" class="switch" role="switch" aria-checked="${a.on}" data-act="sw" aria-label="Activa" style="margin-top:8px"></button></div>`).join('')}</div>`;
  } else if (S.set === 'rf') {
    extra = ib('x', 'mdiPlus', 'Nuevo control');
    body = `<div class="list">${[['Ventilador dormitorio', '6 botones · 433 MHz', 'mdiCeilingFan'], ['Aire oficina', '12 botones · infrarrojo', 'mdiAirConditioner'], ['Proyector', '4 botones · infrarrojo', 'mdiProjector']].map(r => `<div class="li"><span class="ico-tile">${ic(r[2])}</span><div class="t"><b>${r[0]}</b><span>${r[1]}</span></div><div class="acts">${ib('x', 'mdiAccessPoint', 'Aprender botones')}${ib('x', 'mdiPencilRuler', 'Diseñar control')}${ib('x', 'mdiTrashCanOutline', 'Borrar', 'danger')}</div></div>`).join('')}</div>`;
  } else if (S.set === 'estado') {
    const rows = [['all', 'Todo', 16], ['link', 'Sin vincular', 11], ['out', 'Fuera de espacio', 2], ['state', 'Sin estado', 1], ['ref', 'Referencias', 2]];
    const items = [['link', 'Ventilador', 'Dormitorio · sin vincular', 'mdiCeilingFan', 'mdiLinkVariantPlus', 'Vincular'], ['link', 'Aire oficina', 'Oficina · sin vincular', 'mdiAirConditioner', 'mdiLinkVariantPlus', 'Vincular'], ['link', 'Repetidor', 'Cocina · sin vincular', 'mdiAccessPointNetwork', 'mdiLinkVariantPlus', 'Vincular'],
      ['out', 'Cortina', 'Fuera de todo espacio', 'mdiCurtains', 'mdiMapMarkerRadiusOutline', 'Ubicar en el plano'], ['out', 'Puerta balcón', 'Fuera de todo espacio', 'mdiDoorSliding', 'mdiMapMarkerRadiusOutline', 'Ubicar en el plano'],
      ['state', 'Robot aspirador', 'Home Assistant no sabe su estado', 'mdiRobotVacuum', 'mdiEyeOutline', 'Ver dispositivo'], ['ref', 'Panel «Aire viejo»', 'Usa una acción que no existe', 'mdiViewDashboardOutline', 'mdiWrenchOutline', 'Arreglar']];
    body = `<div class="fchips">${rows.map(r => `<button type="button" class="${S.filter === r[0] ? 'on' : ''}" data-act="filter:${r[0]}">${r[1]} <b>${r[2]}</b></button>`).join('')}</div>
      <div class="list">${items.filter(i => S.filter === 'all' || i[0] === S.filter).map(i => `<div class="li"><span class="ico-tile">${ic(i[3])}</span><div class="t"><b>${i[1]}</b><span>${i[2]}</span></div>${ib('x', i[4], i[5])}</div>`).join('')}</div>
      <details class="small muted"><summary>${'Datos técnicos'}</summary><p>Revisión 2.5 · 6 zonas · 6 espacios · 12 símbolos · huella 0a17c9e</p></details>`;
  } else if (S.set === 'datos') {
    const parts = [['Planos e historial', 0.11, 'var(--brand)'], ['Imágenes', 0.05, 'var(--cool)'], ['Casas', 0.04, 'var(--warn)'], ['Controles RF', 0.01, 'var(--muted)']];
    body = `<div style="display:flex;align-items:baseline;gap:8px"><span class="big">0,2</span><span class="muted">de 64 MiB</span></div>
      <div class="usage">${parts.map(p => `<span style="width:${(p[1] / 0.4) * 100 * 0.5}%;background:${p[2]}"></span>`).join('')}</div>
      <div class="legend">${parts.map(p => `<i style="background:${p[2]}"></i><span>${p[0]}</span><b>${fmt(p[1], 2)} MiB</b>`).join('')}</div>
      <div style="display:flex;gap:4px">${ib('x', 'mdiImageRemoveOutline', 'Borrar imágenes sin uso')}${ib('x', 'mdiHistory', 'Dejar sólo los 3 planos anteriores más nuevos')}</div>
      <div class="lbl">Copias<span class="grow"></span></div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:stretch"><button type="button" class="ib" style="width:64px;height:auto;border:1px solid var(--line)" data-tip="Exportar copia (JSON)" aria-label="Exportar copia">${ic('mdiDownload', 'lg')}</button>
      <label class="drop">${ic('mdiUpload', 'lg')}<span><b>Importar</b>JSON / SVG / PNG / JPG</span><input type="file" hidden accept=".json,.svg,.png,.jpg,.jpeg,application/json,image/*"></label></div>
      <div class="lbl">Planos anteriores<span class="grow"></span></div>
      <div class="list">${[['Revisión 12', '05/11 18:02 · 12 símbolos'], ['Revisión 11', '04/11 22:40 · 11 símbolos'], ['Revisión 10', '02/11 09:15 · 11 símbolos']].map(r => `<div class="li"><span class="ico-tile">${ic('mdiFileClockOutline')}</span><div class="t"><b>${r[0]}</b><span>${r[1]}</span></div><div class="acts">${ib('x', 'mdiRestore', 'Volver a este plano')}${ib('x', 'mdiDownload', 'Descargar')}</div></div>`).join('')}</div>
      <div class="lbl">Archivo vinculado<span class="grow"></span></div>
      <div class="li"><span class="ico-tile">${ic('mdiFileLinkOutline')}</span><div class="t"><b style="font-family:ui-monospace,monospace;font-weight:400;font-size:13px">/config/homemanager/casa.svg</b><span>Sin archivo todavía</span></div>${ib('x', 'mdiInformationOutline', 'Si cambiás ese archivo, el plano se actualiza solo; si afecta espacios o símbolos, te pregunta')}</div>`;
  } else if (S.set === 'ayuda') {
    body = `<label class="search">${ic('mdiMagnify')}<input id="help-q" placeholder="Buscar en la ayuda" aria-label="Buscar en la ayuda"></label>
      <div class="row wide">${ic('mdiTooltipTextOutline')}<span class="name">Ayudas al pasar el mouse</span><button type="button" class="switch" role="switch" aria-checked="${S.tips}" data-act="tips" aria-label="Ayudas al pasar el mouse"></button></div>
      <div class="helpgrid">${[['mdiGestureTap', 'Usar el plano'], ['mdiPencilOutline', 'Editar'], ['mdiBellOutline', 'Alertas'], ['mdiRobotOutline', 'Automatizaciones'], ['mdiRemote', 'Controles RF'], ['mdiSchoolOutline', 'Guía de alertas']].map(h => `<button type="button" class="hcard" ${h[1] === 'Guía de alertas' ? 'data-act="go:guia"' : ''}>${ic(h[0], 'lg')}<b>${h[1]}</b></button>`).join('')}</div>
      <div class="lbl">Estados<span class="grow"></span></div>
      <div class="states">${[['Confirmado', 'ok', 'Medido y comprobado'], ['Estimado', 'warn', 'Lectura sin confirmar'], ['Enviado', 'info', 'Home Assistant recibió la orden'], ['Desconocido', 'muted', 'Sin datos o falló']].map(s => `<span class="state" style="--c:var(--${s[1]})">${s[0]}</span><span>${s[2]}</span>`).join('')}</div>
      <div class="small muted">Versión 0.13.0</div>`;
  }
  return `<div class="dh"><h2>${title}</h2>${extra}${ib('close-set', 'mdiClose', 'Cerrar')}</div>
    <div class="stabs" role="tablist">${TABS.map(t => ib('set:' + t[0], t[1], t[2], S.set === t[0] ? 'on' : '')).join('')}</div>
    <div class="dbody">${body}</div>`;
}
function alertEditor() {
  const cmp = [['lt', 'mdiLessThan', 'Menor que'], ['gt', 'mdiGreaterThan', 'Mayor que'], ['eq', 'mdiEqual', 'Igual a'], ['ch', 'mdiSwapVertical', 'Cuando cambia']];
  const sev = [['warn', 'mdiAlertOutline', 'Aviso'], ['alert', 'mdiAlertOctagonOutline', 'Alerta'], ['info', 'mdiInformationOutline', 'Info']];
  const opts = [['badge', 'mdiBellBadgeOutline', 'Insignia en el símbolo'], ['ring', 'mdiSelectionEllipse', 'Resaltar el símbolo'], ['bar', 'mdiMessageAlertOutline', 'Mensaje en la barra de actividad'], ['now', 'mdiViewDashboardOutline', 'Mostrar en Ahora']];
  const v = S.alertVal ?? 20, now = 18, on = S.cmp === 'lt' ? now < v : S.cmp === 'gt' ? now > v : S.cmp === 'eq' ? now === Number(v) : true;
  return `<div class="dh">${ib('alert-back', 'mdiArrowLeft', 'Volver')}<input class="title-in" id="alert-name" value="Maceta seca" aria-label="Nombre de la alerta" style="flex:1">${ib('guide', 'mdiSchoolOutline', 'Guía paso a paso')}</div>
  <div class="dbody">
    <div class="lbl">${ic('mdiEyeOutline', 'sm')}Cuando<span class="grow"></span></div>
    <div class="sentence"><span class="pill" id="g-read" data-act="x" data-tip="Qué lectura mirar">${ic('mdiWaterPercent', 'sm')}Humedad · Maceta${ic('mdiChevronDown', 'sm')}</span>
      <span class="seg" id="g-cmp" role="radiogroup" aria-label="Condición">${cmp.map(c => ib('cmp:' + c[0], c[1], c[2], S.cmp === c[0] ? 'on' : '')).join('')}</span>
      <span class="pill" id="g-val"><input type="number" id="a-val" value="${v}" data-bind="aval" aria-label="Límite"> %</span>
      <span class="pill" id="g-dur" data-tip="Durante">${ic('mdiTimerOutline', 'sm')}<input type="number" id="a-dur" value="10" aria-label="Minutos"> min</span></div>
    <div class="lbl">${ic('mdiBellOutline', 'sm')}Entonces<span class="grow"></span></div>
    <div id="g-sev" style="display:flex;flex-direction:column;gap:10px"><div class="sev">${sev.map(s => `<button type="button" class="${S.sev === s[0] ? 'on' : ''}" style="--c:var(--${s[0]})" data-act="sev:${s[0]}">${ic(s[1], 'sm')}${s[2]}</button>`).join('')}</div>
      <div style="display:flex;align-items:center;gap:8px"><div class="seg">${opts.map(o => ib('opt:' + o[0], o[1], o[2], S.opts[o[0]] ? 'on' : '')).join('')}</div><span class="grow"></span><button type="button" class="sw" style="--c:var(--${S.sev})" data-tip="Color" aria-label="Color"></button></div></div>
    <div class="lbl">${ic('mdiMapMarkerOutline', 'sm')}En<span class="grow"></span></div>
    <div class="chips" id="g-where"><span class="chip">${ic('mdiSproutOutline', 'sm')}Maceta<button type="button" aria-label="Quitar">${ic('mdiClose', 'sm')}</button></span><button type="button" class="chip add" data-tip="Agregar símbolo">${ic('mdiPlus', 'sm')}</button></div>
    <div class="preview-card" id="g-prev"><span class="psym ${on ? 'warn' : ''}" style="color:#6B8E23">${ic('mdiSproutOutline')}${on && S.opts.badge ? `<span class="bdg">${ic('mdiExclamationThick')}</span>` : ''}</span><div><b>${on ? 'Ahora se activaría' : 'Ahora no se activa'}</b><div class="small muted">Humedad ${now} % · hace 25 min</div></div></div>
  </div>
  <div class="dfoot">${ib('x', 'mdiTrashCanOutline', 'Borrar alerta', 'danger')}${ib('x', 'mdiContentCopy', 'Duplicar')}<span class="grow"></span><button type="button" class="ib primary" data-act="alert-back" data-tip="Listo" aria-label="Listo">${ic('mdiCheck')}</button></div>`;
}
function autoEditor() {
  const step = (c, icon, title, lines) => `<div class="step" style="--c:${c}"><header>${ic(icon, 'sm')}${title}<span class="grow"></span>${ib('x', 'mdiDotsHorizontal', 'Más')}</header>${lines.map(l => `<div class="ln">${ic(l[0], 'sm')}<span>${l[1]}</span></div>`).join('')}<div class="chips"><button type="button" class="chip add" data-tip="Agregar">${ic('mdiPlus', 'sm')}</button></div></div>`;
  const conn = `<div class="conn"><button type="button" data-tip="Agregar paso" aria-label="Agregar paso">${ic('mdiPlus')}</button></div>`;
  return `<div class="dh">${ib('auto-back', 'mdiArrowLeft', 'Volver')}<span class="ico-tile">${ic('mdiWeatherNight')}</span><input class="title-in" id="auto-name" value="Dormir" aria-label="Nombre" style="flex:1">${ib('x', 'mdiStar', 'En la pantalla principal', 'on')}<button type="button" class="switch" role="switch" aria-checked="true" data-act="sw" aria-label="Activa"></button></div>
  <div class="dbody"><div class="flow">
    ${step('var(--brand)', 'mdiPlayCircleOutline', 'Cuando', [['mdiGestureTap', 'Tocás <b>Dormir</b> en Ahora'], ['mdiClockOutline', 'Todos los días a las <b>23:30</b>']])}${conn}
    ${step('var(--cool)', 'mdiLightningBoltOutline', 'Hacer', [['mdiAirConditioner', 'Apagar <b>4 aires</b> · Living, Dormitorio, Oficina, Comedor'], ['mdiCurtains', 'Cerrar <b>Cortina</b>'], ['mdiCeilingLight', 'Apagar <b>Luz del techo</b>']])}${conn}
    ${step('var(--ok)', 'mdiCheckDecagramOutline', 'Comprobar', [['mdiFlashOutline', 'Cada aire baja de <b>30 W</b> en <b>60 s</b>'], ['mdiRepeat', 'Si no baja: reenviar, hasta <b>3 veces</b>'], ['mdiMeterElectricOutline', 'Medidor sin datos: no reenviar']])}${conn}
    ${step('var(--alert)', 'mdiAlertOctagonOutline', 'Si falla', [['mdiBellOutline', 'Alerta <b>«Aire sigue prendido»</b> en el símbolo y en Ahora']])}
  </div></div>
  <div class="dfoot">${ib('x', 'mdiPlay', 'Probar ahora')}${ib('x', 'mdiHistory', 'Últimas ejecuciones')}${ib('x', 'mdiTrashCanOutline', 'Borrar', 'danger')}<span class="grow"></span><button type="button" class="ib primary" data-act="auto-back" data-tip="Listo" aria-label="Listo">${ic('mdiCheck')}</button></div>`;
}

/* ——— Popovers ——— */
function renderPops() {
  const host = $('#pops');
  let html = '';
  const app = $('#app').getBoundingClientRect();
  const near = (sel, dx = 0, dy = 8) => { const el = $(sel); if (!el) return 'left:12px;top:60px'; const r = el.getBoundingClientRect(); return `left:${Math.max(8, r.left - app.left + dx)}px;top:${r.bottom - app.top + dy}px`; };
  if (S.homes && S.mode === 'view') {
    html += `<div class="pop menu" style="left:10px;top:56px" role="menu"><button type="button" class="mi" data-act="home:Casa Demo">${ic('mdiHomeOutline')}<span class="grow">Casa Demo</span>${S.home === 'Casa Demo' ? ic('mdiCheck') : ''}</button>
      <button type="button" class="mi" data-act="home:Casa de la playa">${ic('mdiBeach')}<span class="grow">Casa de la playa</span>${S.home === 'Casa de la playa' ? ic('mdiCheck') : ''}</button><hr>
      <button type="button" class="mi">${ic('mdiPlus')}<span class="grow">Nueva casa</span></button><button type="button" class="mi">${ic('mdiContentCopy')}<span class="grow">Duplicar esta casa</span></button><button type="button" class="mi">${ic('mdiRenameOutline')}<span class="grow">Renombrar</span></button><button type="button" class="mi" style="color:var(--alert)">${ic('mdiTrashCanOutline')}<span class="grow">Borrar esta casa</span></button></div>`;
  }
  if (S.pop === 'icon') html += `<div class="pop" style="${near('#iconbtn')}"><h4>${ic('mdiShapeOutline', 'sm')}Icono</h4><label class="search">${ic('mdiMagnify')}<input placeholder="Buscar" aria-label="Buscar icono"></label><div class="iconsgrid">${ICON_CHOICES.map(n => ib('seticon:' + n, n, n.replace('mdi', ''), D()?.icon === n ? 'on' : '')).join('')}</div></div>`;
  if (S.pop === 'space') html += `<div class="pop menu" style="${near('.spacepick')}">${SPACES.map(s => `<button type="button" class="mi" data-act="setspace:${s.id}">${ic(s.icon)}<span class="grow">${esc(s.name)}</span>${D()?.sp === s.id ? ic('mdiCheck') : ''}</button>`).join('')}</div>`;
  if (S.gallery && S.mode === 'edit' && S.tool === 'now') {
    const r = $('#side').getBoundingClientRect();
    html += `<div class="pop" style="left:${r.left - app.left - 340}px;top:${r.top - app.top + 10}px"><h4>${ic('mdiPlus', 'sm')}Agregar bloque</h4><div class="gallery">${Object.entries(WTYPES).map(([k, w]) => `<button type="button" class="gcard" data-act="w-new:${k}"><span class="gprev">${ic(w.icon, 'lg')}</span><span>${w.t}</span></button>`).join('')}</div></div>`;
  }
  if (S.wset && S.mode === 'edit' && S.tool === 'now') {
    const w = WIDGETS.find(x => x.id === S.wset), el = document.querySelector(`[data-w="${S.wset}"]`);
    if (w && el) {
      const r = el.getBoundingClientRect();
      const items = w.type === 'clima' ? SPACES.map(s => s.name) : DEV.map(d => d.name);
      html += `<div class="pop" style="left:${r.left - app.left - 330}px;top:${Math.max(8, r.top - app.top)}px;width:320px"><h4>${ic(WTYPES[w.type].icon, 'sm')}${WTYPES[w.type].t}<span class="grow"></span>${ib('w-set:' + w.id, 'mdiCheck', 'Listo')}</h4>
        <input class="field" id="w-title" value="${esc(w.title || WTYPES[w.type].t)}" data-bind="wtitle" aria-label="Título">
        <div class="seg">${[['list', 'mdiFormatListBulleted', 'Lista'], ['tiles', 'mdiViewGridOutline', 'Mosaico'], ['graph', 'mdiChartLine', 'Gráfico']].map((o, i) => ib('x', o[1], o[2], i === (w.type === 'clima' ? 1 : 0) ? 'on' : '')).join('')}</div>
        <label class="search">${ic('mdiMagnify')}<input placeholder="Buscar" aria-label="Buscar"></label>
        <div class="picker">${items.map((n, i) => `<label><input type="checkbox" ${i < 4 ? 'checked' : ''}>${esc(n)}</label>`).join('')}</div></div>`;
    }
  }
  if (S.confirmExit) html += `<div class="pop" style="right:12px;top:56px;width:280px"><h4>${ic('mdiContentSaveAlertOutline', 'sm')}${S.dirty} cambios sin guardar</h4><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="chip" data-act="exit-discard" style="padding:6px 12px">Descartar</button><button type="button" class="chip" data-act="exit-save" style="padding:6px 12px;background:var(--brand);color:var(--on-brand);border-color:var(--brand)">Guardar</button></div></div>`;
  html += extraPops(app, near);
  host.innerHTML = html;
}

/* ——— Guía de alertas ——— */
const GUIDE = [
  ['#g-read', 'Qué mirar', 'Una lectura de un sensor. Ejemplo: la humedad de la maceta.'],
  ['#g-cmp', 'La condición', 'Menor que, mayor que, igual a o cuando cambia.'],
  ['#g-val', 'El límite', '20 % durante 10 minutos: así un pico suelto no avisa.'],
  ['#g-sev', 'Cómo se ve', 'Aviso, alerta o info. En el símbolo, en la barra de actividad o en Ahora.'],
  ['#g-prev', 'El resultado', 'La vista previa usa el valor de este momento.'],
];
function renderGuide() {
  document.querySelectorAll('.gfocus').forEach(e => e.classList.remove('gfocus'));
  const host = $('#guidehost');
  if (!S.guide || S.set !== 'alertas' || !S.alertEdit) { host.innerHTML = ''; return; }
  const [sel, t, p] = GUIDE[S.guide - 1];
  const el = $(sel); if (!el) { host.innerHTML = ''; return; }
  el.classList.add('gfocus');
  const app = $('#app').getBoundingClientRect(), r = el.getBoundingClientRect();
  const left = clamp(r.left - app.left - 300, 8, app.width - 290);
  host.innerHTML = `<div class="guide" style="left:${left}px;top:${clamp(r.top - app.top, 8, app.height - 180)}px" role="dialog" aria-label="Guía"><b>${t}</b><p>${p}</p><footer><span>${S.guide} de ${GUIDE.length}</span>${S.guide > 1 ? '<button type="button" class="ghost" data-act="g-prev">Anterior</button>' : '<button type="button" class="ghost" data-act="g-close">Salir</button>'}<button type="button" data-act="${S.guide < GUIDE.length ? 'g-next' : 'g-close'}">${S.guide < GUIDE.length ? 'Siguiente' : 'Listo'}</button></footer></div>`;
}

/* ——— Notas para el propietario ——— */
const NOTES = {
  inicio: ['Pantalla principal', ['La casa se elige arriba a la izquierda: ya no es una sección de Ajustes.', '☀/🌙 cambia claro u oscuro con un toque.', '⚙ sólo aparece fuera de la edición: editar y ajustar son cosas distintas.', 'Dos filtros: Dispositivos e Infraestructura.', 'Sin cadenita encima del icono: un aro punteado marca lo no vinculado.', 'Atajos de automatizaciones (Dormir, Salir) arriba de Ahora.'], ['¿La marca de vínculo se ve en la pantalla normal o sólo al editar?']],
  casas: ['Casas', ['Cambiar, crear, duplicar, renombrar y borrar casa desde el selector de arriba.', 'Todo lo demás (Ajustes, Editar) es de la casa elegida.'], []],
  simbolo: ['Ficha del símbolo', ['Icono y nombre en el título: se editan ahí mismo (lápiz al pasar el mouse).', 'Espacio debajo del nombre.', 'Infraestructura es un interruptor visible, no «Capa: auto».', 'Tamaño y fondo con número en %, y el plano cambia en vivo.', 'Sin Small/Medium/Large: sólo el %.', 'Forma con dibujos; color con paletas de 10 colores, un selector libre y Mi paleta.', 'Los módulos son subtítulos, sin cajas ni la palabra «Módulos».', '«Agregar» suma un módulo nuevo; lo que ya está no se repite.', 'Tocar otro símbolo cambia la ficha (hoy se queda trabada).', '«Origen del estado» desaparece: sale del dispositivo vinculado.'], ['¿Cuántos atajos junto al símbolo? Hoy son 3.']],
  indicadores: ['Indicadores del símbolo', ['La fuente es una lectura real de Home Assistant; el tipo (número, sí/no, estados, texto) sale de la entidad y su clase.', 'Las reglas cambian según el tipo: rangos para números, una fila por estado para estados, dos filas para sí/no, y siempre «Sin dato».', 'La línea «Ahora» muestra el valor actual y qué regla se cumple.', 'Elementos que muestran datos sobre el símbolo: anillo, borde, color del icono, LED, número y etiqueta.', 'Cada uno toma una lectura y elige un color fijo, por rango de valores o por estado.', 'El anillo muestra un valor entre un mínimo y un máximo: la cortina al 75 % llena tres cuartos.', 'El control «probar valor» mueve el dato y el plano cambia en vivo.', 'Sirve igual para cualquier sensor o dispositivo: no está pensado para un caso solo.'], ['¿Qué otros elementos querés? (barra, icono que cambia según estado, animación al prender…)']],
  controles: ['Controles RF / IR', ['Una lista para RF e IR, con su etiqueta.', 'Arriba, los equipos ESPHome y lo que pueden hacer.', '+ abre el asistente de cuatro pasos.'], []],
  equipos: ['Equipos', ['Qué puede hacer cada equipo: enviar o recibir RF e IR.', 'Probar recepción y el YAML para ESPHome con iconos.', '★ marca el receptor por defecto.'], []],
  control: ['Un control', ['Vista previa del diseño; tocarla abre el diseñador.', 'Botones aprendidos con su forma de onda: enviar, volver a aprender (conserva vínculos) y ficha técnica.'], []],
  'nuevo-control': ['1 · Nuevo control', ['Nombre, tipo con dibujo, señal IR o RF y qué equipo escucha y cuál envía.'], ['¿Agregamos plantillas por marca (Mitsubishi, Philips…)?']],
  aprender: ['2 · Aprender', ['Base de controles: con cada botón se acota (1.240 → 214 → 37 → 3) y podés probar o usar un perfil completo.', 'El nombre se elige de una lista; el ✓ verde dice a qué botón del perfil corresponde.', 'El receptor late mientras escucha; el anillo cuenta los 15 segundos.', 'Cada botón aparece como tarjeta con su forma de onda y un nombre sugerido.', 'Punto verde: reconocida; naranja: pulsalo otra vez.', 'La portadora (38 kHz estimada) queda plegada, editable.', 'En la maqueta los botones llegan solos para ver la animación.'], []],
  probar: ['3 · Probar', ['▶ envía; después, 👍 o 👎 si el aparato reaccionó.', 'Si no reaccionó: ajustes rápidos de pulso, repeticiones y emisor.', 'Comprobaciones opcionales con iconos: auto-eco, receptor B, cámara, comparar.'], []],
  disenador: ['4 · Diseñar', ['Lienzo con columnas × filas a elección; los elementos se arrastran a una celda y la esquina cambia el tamaño.', 'A la izquierda, los botones aprendidos: se arrastran a un elemento (o a una celda vacía para crear un botón). Los «!» todavía no se usan.', 'Cada elemento dice qué botón aprendido usa en cada parte (encender/apagar, más/menos, cada paso, cada opción).', 'Presets: una secuencia de botones con esperas (ej. «Noche»).', 'Botones de marca, perilla, deslizadores, lectura y gráfico de un sensor, texto y separador.', 'El estado puede ser estimado o venir de un sensor (conexión con la comprobación por consumo).', 'El control se arma en grande, sobre el plano: arrastrar para ordenar, tocar para editar.', 'Elementos: botón, encender/apagar, bajar/subir, pasos, opciones y texto.', 'Cada elemento elige ancho, icono, etiqueta y qué botones aprendidos usa.', 'Abajo, el símbolo del plano donde se abre.'], []],
  ficha: ['Ficha técnica', ['Lo técnico sigue: portadora, protocolo, bits, tramas, duración, emisor.', 'Línea de tiempo con captura y envío superpuestos, zoom y exportar.', 'Histograma de pulsos y pausas, y resultados de eco, receptor B y cámara.'], []],
  eco: ['Comprobar · auto-eco', ['El mismo equipo envía y escucha en una ventana de 3 s.', 'Compara la señal capturada con la que volvió: tramas, cantidad de tiempos, signos y diferencia máxima.', 'Dice si la señal salió; si el aparato reaccionó se confirma aparte.'], []],
  'receptor-b': ['Comprobar · receptor B', ['Otro equipo (B) escucha lo que envía el primero.', 'Misma comparación que el auto-eco.', 'Aviso: B puede oír otros mandos cercanos durante la ventana.'], []],
  camara: ['Comprobar · cámara', ['Tres pasos: calibrar con el mando original, mirar el LED del emisor mientras envía 10 s, y anotar qué se vio.', 'HomeManager no usa la cámara: sólo guarda lo que elegís y una nota.'], []],
  plano: ['Plano y espacios', ['Una sola pantalla: imágenes, espacios y herramientas de dibujo.', 'Imágenes en conjuntos claro/oscuro; la ★ marca el principal.', 'Herramientas abajo, como en la app de Roborock: dibujar, agregar parte, dividir, unir, renombrar, borrar.', 'Al elegir un espacio se ve sólo su borde exterior.', '«Crear esta área en Home Assistant» en cada espacio y «Traer áreas» arriba reemplazan la sección Conectar.', 'Se eliminan «Agregar espacio sin dibujarlo» y «Revisar espacios contra el plano».'], ['¿Dividir con una línea dibujada a mano (como Roborock) o en mitades?']],
  ahora: ['Panel Ahora', ['Se edita en el mismo lugar, viendo el resultado real.', 'Bloques con arrastrar, ancho, ajustes y quitar: sólo iconos.', '+ abre una galería de bloques con dibujo.', '↺ vuelve al panel estándar.', 'Cada bloque elige qué mostrar con buscador y casillas, y su estilo (lista, mosaico, gráfico).'], ['¿Qué otros bloques querés? (cámara, clima exterior, escenas…)']],
  vista: ['Tamaño y vista', ['Un tamaño para la casa entera y otro al ver un espacio; en el medio crece de forma lineal.', 'La curva muestra cómo cambia; el control de zoom permite probarlo en vivo.', 'Cada símbolo tiene su % propio sobre esto (en su ficha).', 'Vista inicial con el marco dibujado; 📌 guarda lo que ves.', 'Marca de vínculo y cuadrícula viven acá, en editar.'], []],
  alertas: ['Alertas (antes «Reglas»)', ['Se llama Alertas: es lo que hace.', 'Lista corta con interruptor; las incluidas aparte.', '🎓 abre una guía paso a paso.'], ['¿«Alertas» te gusta como nombre?']],
  'alerta-nueva': ['Nueva alerta', ['Se arma como una frase: cuando [lectura] [<] [20 %] durante [10 min].', 'Cómo se ve, con iconos.', 'La vista previa dice si hoy se activaría.'], []],
  guia: ['Guía de alertas', ['Cinco pasos que señalan cada parte de la pantalla.', 'Se abre desde 🎓 o desde Ayuda.'], []],
  automatizaciones: ['Automatizaciones (nuevo)', ['Lista de automatizaciones con interruptor.', '★ la pone como botón en la pantalla principal.', 'Pueden usar las alertas y la comprobación por consumo que estás armando con ChatGPT.'], ['¿Las automatizaciones se guardan en HomeManager o se crean en Home Assistant?']],
  automatizacion: ['Editar automatización', ['Cuatro pasos: Cuando → Hacer → Comprobar → Si falla.', 'Comprobar usa el consumo: reenvía hasta 3 veces y no reenvía si el medidor no responde.', 'Si falla, dispara una alerta.', '▶ prueba ahora; historial de ejecuciones.'], ['¿Reemplaza a «Acciones lógicas» de Avanzado? (propuesta: sí)']],
  controles: ['Controles RF', ['Lista de controles con aprender, diseñar y borrar en iconos.'], []],
  estado: ['Estado de la casa', ['Filtros con número arriba, una fila por problema y un botón para arreglarlo.', 'Incluye las «Referencias pendientes» de Avanzado.', 'Datos técnicos plegados abajo.'], []],
  datos: ['Datos y copias', ['Almacenamiento y Copias juntos.', 'Importar acepta JSON / SVG / PNG / JPG y reconoce el archivo por su contenido (arregla el error «Unexpected token <»).', 'Planos anteriores con volver y descargar en iconos.'], []],
  ayuda: ['Ayuda', ['Buscador, temas con icono y la guía de alertas.', 'Interruptor para apagar las ayudas al pasar el mouse.', 'Estados con su color.'], ['Avanzado desaparece: Acciones lógicas → pasos de Automatizaciones; Paneles avanzados → Diseñador de controles; Referencias → Estado. ¿De acuerdo?']],
};
function renderNotes() {
  const host = $('#noteshost');
  if (!S.notes) { host.innerHTML = ''; return; }
  const n = NOTES[S.screen] || NOTES.inicio;
  host.innerHTML = `<aside class="notes" aria-label="Notas de diseño"><h3>${n[0]}</h3><h4>Qué cambia</h4><ul>${n[1].map(x => `<li>${esc(x)}</li>`).join('')}</ul>${n[2].length ? `<h4>Para decidir</h4><ul class="q">${n[2].map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</aside>`;
}

/* ——— Acciones ——— */
function fitRoom(id) {
  const s = SP(id); if (!s) return;
  const xs = s.rects.flatMap(r => [r[0], r[0] + r[2]]), ys = s.rects.flatMap(r => [r[1], r[1] + r[3]]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  S.center = [(x0 + x1) / 2, (y0 + y1) / 2]; S.zoom = clamp(Math.min(1000 / (x1 - x0), 700 / (y1 - y0)) * 0.75, 1, 2.8);
}
function toSvg(e) {
  const svg = $('#arch'); const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [Math.round(q.x), Math.round(q.y)];
}
function planClick(id) {
  const t = S.planTool;
  if (t === 'select' || t === 'addpart') { S.planSel = [id]; }
  else if (t === 'rename') { S.renaming = id; S.planSel = [id]; }
  else if (t === 'delete') { mark(); SPACES = SPACES.filter(s => s.id !== id); S.planSel = []; }
  else if (t === 'divide') {
    mark(); const s = SP(id); const r = s.rects.reduce((a, b) => (b[2] * b[3] > a[2] * a[3] ? b : a));
    const half = r[2] >= r[3] ? [[r[0], r[1], r[2] / 2, r[3]], [r[0] + r[2] / 2, r[1], r[2] / 2, r[3]]] : [[r[0], r[1], r[2], r[3] / 2], [r[0], r[1] + r[3] / 2, r[2], r[3] / 2]];
    s.rects = s.rects.map(x => (x === r ? half[0] : x));
    SPACES.push({ id: 'n' + Date.now(), name: 'Espacio nuevo', icon: 'mdiSquareOutline', c: '#B2577F', rects: [half[1]] }); S.planSel = [id];
  } else if (t === 'merge') {
    if (!S.mergeFirst) { S.mergeFirst = id; S.planSel = [id]; }
    else if (S.mergeFirst !== id) {
      mark(); const a = SP(S.mergeFirst), b = SP(id); a.rects = a.rects.concat(b.rects);
      DEV.forEach(d => { if (d.sp === b.id) d.sp = a.id; }); SPACES = SPACES.filter(s => s.id !== b.id); S.planSel = [a.id]; S.mergeFirst = null;
    }
  }
  render();
  if (S.renaming) setTimeout(() => { const i = $('#ren-' + S.renaming); i?.focus(); i?.select(); });
}
function act(a, b, c, el) {
  const d = D();
  switch (a) {
    case 'go': go(b); return;
    case 'notes': S.notes = !S.notes; renderReview(); renderNotes(); return;
    case 'homes': S.homes = !S.homes; renderTop(); renderPops(); return;
    case 'home': S.home = b; S.homes = false; S.activity = 'Cambiaste a ' + b; render(); return;
    case 'theme': document.documentElement.dataset.theme = isDark() ? 'light' : 'dark'; render(); return;
    case 'edit': S.mode = 'edit'; S.tool = 'sym'; S.sel = null; S.set = null; S.homes = false; ORIG = snap(); UNDO = []; REDO = []; S.dirty = 0; break;
    case 'full': try { $('#app').requestFullscreen?.().catch(() => {}); } catch {} return;
    case 'settings': S.set = S.set ? null : 'alertas'; S.alertEdit = false; S.autoEdit = null; S.homes = false; break;
    case 'set': S.set = b; S.alertEdit = false; S.autoEdit = null; S.guide = 0; break;
    case 'close-set': S.set = null; S.guide = 0; break;
    case 'tool': S.tool = b; S.sel = null; S.planSel = []; S.planTool = 'select'; S.mergeFirst = null; S.gallery = false; S.wset = null; S.pop = null; S.moving = false; break;
    case 'undo': if (UNDO.length) { REDO.push(snap()); restore(UNDO.pop()); S.dirty = Math.max(0, S.dirty - 1); } break;
    case 'redo': if (REDO.length) { UNDO.push(snap()); restore(REDO.pop()); S.dirty++; } break;
    case 'discard': if (ORIG) { restore(ORIG); S.dirty = 0; UNDO = []; S.activity = 'Cambios descartados'; } break;
    case 'save': S.dirty = 0; ORIG = snap(); S.activity = 'Guardado en Home Assistant'; break;
    case 'exit': if (S.dirty) { S.confirmExit = !S.confirmExit; renderPops(); return; } S.mode = 'view'; S.tool = null; S.sel = null; break;
    case 'exit-save': S.confirmExit = false; S.dirty = 0; S.mode = 'view'; S.tool = null; S.sel = null; S.activity = 'Guardado en Home Assistant'; break;
    case 'exit-discard': S.confirmExit = false; if (ORIG) restore(ORIG); S.dirty = 0; S.mode = 'view'; S.tool = null; S.sel = null; break;
    case 'zoom': S.zoom = clamp(S.zoom * (b === 'in' ? 1.25 : 0.8), 1, 2.8); if (S.zoom === 1) S.center = [500, 350]; renderStage(); syncView(); return;
    case 'initial': case 'iv-go': S.zoom = S.iv.z; S.center = [...S.iv.c]; S.room = null; renderStage(); renderRail(); syncView(); return;
    case 'room': if (b === 'all') { S.room = null; S.zoom = 1; S.center = [500, 350]; } else { S.room = b; fitRoom(b); } renderRail(); renderStage(); syncView(); return;
    case 'layer': S.layers[b] = !S.layers[b]; renderStage(); return;
    case 'sym':
      if (S.mode === 'edit') { if (S.tool === 'plan') return; S.tool = 'sym'; S.sel = b; S.pop = null; S.moving = false; S.gallery = false; S.wset = null; break; }
      if (S.mode === 'view') { const x = DEV.find(q => q.id === b); S.activity = `${x.name} · Enviado · hace un momento`; renderTop(); }
      return;
    case 'close-sym': S.sel = null; S.pop = null; S.moving = false; break;
    case 'sym-add': mark(); DEV.push(dev({ id: 'n' + Date.now(), name: 'Símbolo nuevo', icon: 'mdiLightbulbOutline', sp: 'living', x: 250, y: 300, linked: false, mods: [] })); S.sel = DEV[DEV.length - 1].id; S.tool = 'sym'; break;
    case 'sym-del': mark(); DEV = DEV.filter(x => x.id !== S.sel); S.sel = null; break;
    case 'sym-dup': { mark(); const n = { ...JSON.parse(JSON.stringify(d)), id: 'n' + Date.now(), x: d.x + 40, name: d.name + ' 2' }; DEV.push(n); S.sel = n.id; break; }
    case 'sym-move': S.moving = !S.moving; S.activity = S.moving ? 'Tocá el plano donde va el símbolo' : S.activity; renderTop(); break;
    case 'infra': mark(); d.layer = d.layer === 'infra' ? 'dev' : 'infra'; el.setAttribute('aria-checked', d.layer === 'infra'); renderStage(); renderTop(); return;
    case 'shape': mark(); d.shape = b; break;
    case 'color': mark('color'); d.c = b; break;
    case 'pal': if (b === 'add' && !PALETTES.mia.includes(d.c)) PALETTES.mia.push(d.c); if (b === 'rm') PALETTES.mia = PALETTES.mia.filter(x => x.toLowerCase() !== d.c.toLowerCase()); S.palette = 'mia'; break;
    case 'pop': S.pop = S.pop === b ? null : b; renderPops(); return;
    case 'seticon': mark(); d.icon = b; S.pop = null; break;
    case 'setspace': mark(); d.sp = b; S.pop = null; break;
    case 'mod':
      if (b === 'toggle') { S.open[d.id] = S.open[d.id] === c ? null : c; }
      else if (b === 'rm') { mark(); d.mods = d.mods.filter(m => m !== c); }
      else if (b === 'add') { mark(); d.mods.push(c); S.open[d.id] = c; if (c === 'device') d.linked = d.linked; }
      break;
    case 'link-dev': mark(); d.linked = true; d.readings = ['Estado']; break;
    case 'ptool': S.planTool = b; S.planSel = []; S.mergeFirst = null; S.renaming = null; renderStage(); renderSide(); return;
    case 'space': if (S.mode === 'edit' && S.tool === 'plan') planClick(b); return;
    case 'sp-ren': S.renaming = b; renderSide(); setTimeout(() => { const i = $('#ren-' + b); i?.focus(); i?.select(); }); return;
    case 'sp-del': mark(); SPACES = SPACES.filter(s => s.id !== b); break;
    case 'set-main': mark(); SETS.forEach(s => (s.main = s.id === b)); break;
    case 'set-del': mark(); SETS = SETS.filter(s => s.id !== b); break;
    case 'set-add': mark(); SETS.push({ id: 's' + Date.now(), name: 'Imágenes nuevas', main: false, light: false, dark: false }); break;
    case 'set-up': mark(); SETS.find(s => s.id === b)[c] = true; break;
    case 'w-add': S.gallery = !S.gallery; S.wset = null; renderSide(); renderPops(); return;
    case 'w-new': mark(); WIDGETS.push({ id: 'w' + Date.now(), type: b }); S.gallery = false; break;
    case 'w-rm': mark(); WIDGETS = WIDGETS.filter(w => w.id !== b); break;
    case 'w-half': { mark(); const w = WIDGETS.find(x => x.id === b); w.half = !w.half; break; }
    case 'w-set': S.wset = S.wset === b ? null : b; S.gallery = false; renderSide(); renderPops(); return;
    case 'w-reset': mark(); WIDGETS = [{ id: 'w1', type: 'atajos' }, { id: 'w2', type: 'clima' }, { id: 'w3', type: 'energia' }, { id: 'w4', type: 'activos' }, { id: 'w5', type: 'alertas' }]; break;
    case 'run': S.activity = `${b === 'cine' ? 'Cine' : AUTOS.find(x => x.id === b)?.name} · en marcha`; renderTop(); return;
    case 'sz-reset': S.sizes = { house: 80, room: 120, min: 60, max: 160 }; break;
    case 'iv-pin': S.iv = { z: S.zoom, c: [...S.center] }; S.activity = 'Vista inicial guardada'; break;
    case 'iv-clear': S.iv = { z: 1, c: [500, 350] }; break;
    case 'iv-local': S.ivLocal = !S.ivLocal; el.setAttribute('aria-checked', S.ivLocal); return;
    case 'link': S.link = b; break;
    case 'grid': S.grid = b; break;
    case 'vals': S.showVals = !S.showVals; break;
    case 'alert-new': case 'alert-open': S.alertEdit = true; S.guide = 0; break;
    case 'alert-back': S.alertEdit = false; S.guide = 0; break;
    case 'guide': S.alertEdit = true; S.guide = 1; break;
    case 'g-next': S.guide++; renderGuide(); renderReview(); return;
    case 'g-prev': S.guide--; renderGuide(); return;
    case 'g-close': S.guide = 0; break;
    case 'cmp': S.cmp = b; break;
    case 'sev': S.sev = b; break;
    case 'opt': S.opts[b] = !S.opts[b]; break;
    case 'auto-open': S.autoEdit = 'dormir'; break;
    case 'auto-back': S.autoEdit = null; break;
    case 'pin': { const x = AUTOS.find(q => q.id === b); x.pin = !x.pin; break; }
    case 'filter': S.filter = b; break;
    case 'tips': S.tips = !S.tips; el.setAttribute('aria-checked', S.tips); hideTip(); return;
    case 'sw': el.setAttribute('aria-checked', el.getAttribute('aria-checked') !== 'true'); return;
    default: { const r = actRF3(a, b, c, el) ?? actRF(a, b, c, el); if (r === true) break; return; }
  }
  render();
}
function syncView() {
  if (S.mode === 'edit' && S.tool === 'view') {
    const cb = $('#curvebox'); if (cb) cb.innerHTML = curveSVG();
    const r = $('#r-zoom'), n = $('#n-zoom'); if (r) r.value = S.zoom; if (n) n.value = S.zoom.toFixed(1);
    const iv = $('#ivbox'); if (iv) iv.innerHTML = miniPlan(isDark()) + ivFrame();
  }
}

/* ——— Eventos ——— */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (S.mode === 'edit' && S.tool === 'sym' && S.moving && e.target.closest('#arch') && !el) {
    const [x, y] = toSvg(e); mark(); Object.assign(D(), { x, y }); S.moving = false; render(); return;
  }
  if (!el) {
    if ((S.pop || S.homes || S.gallery || S.wset || S.confirmExit) && !e.target.closest('.pop')) { S.pop = null; S.homes = false; S.gallery = false; S.wset = null; S.confirmExit = false; renderTop(); renderPops(); }
    return;
  }
  if (el.closest('.pop') === null && (S.pop || S.homes) && !['pop', 'homes'].includes(el.dataset.act.split(':')[0])) { S.pop = null; if (el.dataset.act.split(':')[0] !== 'home') S.homes = false; }
  const [a, b, c] = el.dataset.act.split(':');
  act(a, b, c, el);
});
document.addEventListener('input', e => {
  const el = e.target, k = el.dataset.bind; if (!k) return;
  if (inputRF3(k, el, el.value) || inputRF(k, el, el.value)) return;
  const d = D(), v = el.value;
  const pair = (id) => document.querySelectorAll(`[data-bind="${k}"]`).forEach(x => { if (x !== el) x.value = v; });
  if (k === 'size' || k === 'op') { mark(k); d[k] = clamp(Number(v) || 0, k === 'op' ? 0 : 40, 200); pair(); renderStage(); }
  else if (k === 'name') { mark('name'); d.name = v; }
  else if (k === 'color') { mark('color'); d.c = v; renderStage(); $('#iconbtn')?.style.setProperty('--c', v); document.querySelectorAll('.sw.on').forEach(x => x.classList.remove('on')); }
  else if (k.startsWith('sz:')) { S.sizes[k.slice(3)] = Number(v) || 0; pair(); renderStage(); syncView(); }
  else if (k === 'zoom') { S.zoom = clamp(Number(v) || 1, 1, 2.8); if (el.type === 'range') { const n = $('#n-zoom'); if (n) n.value = S.zoom.toFixed(1); } else { const r = $('#r-zoom'); if (r) r.value = S.zoom; } renderStage(); const cb = $('#curvebox'); if (cb) cb.innerHTML = curveSVG(); }
  else if (k === 'spname') { const s = SP(el.dataset.id); if (s) { s.name = v; renderRail(); } }
  else if (k === 'wtitle') { const w = WIDGETS.find(x => x.id === S.wset); if (w) { w.title = v; const h = document.querySelector(`[data-w="${w.id}"] h3`); if (h) h.innerHTML = ic(WTYPES[w.type].icon, 'sm') + esc(v); } }
  else if (k === 'aval') { S.alertVal = Number(v); const p = $('#g-prev'); if (p) { const on = S.cmp === 'lt' ? 18 < S.alertVal : S.cmp === 'gt' ? 18 > S.alertVal : 18 === S.alertVal; p.querySelector('b').textContent = on ? 'Ahora se activaría' : 'Ahora no se activa'; p.querySelector('.psym').classList.toggle('warn', on); } }
});
document.addEventListener('change', e => {
  if (e.target.id === 'screen-sel') { go(e.target.value); return; }
  if (e.target.dataset.bind === 'palette') { S.palette = e.target.value; renderSide(); }
  if (e.target.dataset.bind === 'spname') { S.renaming = null; renderSide(); renderStage(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.dataset.bind === 'spname') { S.renaming = null; renderSide(); renderStage(); }
  if (e.key === 'Escape') { S.nav = false; renderNav(); S.pop = null; S.homes = false; S.gallery = false; S.wset = null; S.guide = 0; S.confirmExit = false; renderPops(); renderGuide(); }
});
/* Dibujar en el plano */
document.addEventListener('pointerdown', e => {
  if (!(S.mode === 'edit' && S.tool === 'plan' && (S.planTool === 'draw' || (S.planTool === 'addpart' && S.planSel.length)))) return;
  if (!e.target.closest('#arch')) return;
  const p = toSvg(e); S.drawing = [...p, ...p]; e.preventDefault();
  const move = ev => { const q = toSvg(ev); S.drawing[2] = q[0]; S.drawing[3] = q[1]; const svg = $('#arch'); svg.outerHTML = archSVG(); };
  const up = () => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
    const r = S.drawing; S.drawing = null;
    const rect = [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.abs(r[2] - r[0]), Math.abs(r[3] - r[1])];
    if (rect[2] > 20 && rect[3] > 20) {
      mark();
      if (S.planTool === 'draw') { const id = 'n' + Date.now(); SPACES.push({ id, name: 'Espacio nuevo', icon: 'mdiSquareOutline', c: '#B2577F', rects: [rect] }); S.planSel = [id]; S.renaming = id; }
      else SP(S.planSel[0]).rects.push(rect);
    }
    render(); if (S.renaming) setTimeout(() => { const i = $('#ren-' + S.renaming); i?.focus(); i?.select(); });
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
});
/* Arrastrar bloques de Ahora */
let dragW = null;
document.addEventListener('dragstart', e => { const w = e.target.closest?.('.w.editing'); if (!w) return; dragW = w.dataset.w; w.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragW); } catch {} });
document.addEventListener('dragover', e => { if (dragW && e.target.closest?.('.w.editing')) e.preventDefault(); });
document.addEventListener('drop', e => {
  const t = e.target.closest?.('.w.editing'); if (!dragW || !t) return; e.preventDefault();
  const from = WIDGETS.findIndex(w => w.id === dragW), to = WIDGETS.findIndex(w => w.id === t.dataset.w);
  if (from !== to) { mark(); const [m] = WIDGETS.splice(from, 1); WIDGETS.splice(to, 0, m); }
  dragW = null; render();
});
document.addEventListener('dragend', () => { dragW = null; document.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging')); });
/* Ayudas al pasar el mouse */
const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip);
function hideTip() { tip.hidden = true; }
function showTip(el) {
  if (!S.tips) return; const t = el.dataset.tip; if (!t) return;
  tip.textContent = t; tip.hidden = false;
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  let top = r.bottom + 8; if (top + h > innerHeight - 8) top = r.top - h - 8;
  tip.style.left = clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8) + 'px'; tip.style.top = top + 'px';
}
document.addEventListener('mouseover', e => { const el = e.target.closest?.('[data-tip]'); if (el) showTip(el); else hideTip(); });
document.addEventListener('focusin', e => { const el = e.target.closest?.('[data-tip]'); if (el && e.target.matches(':focus-visible')) showTip(el); });
document.addEventListener('focusout', hideTip);
document.addEventListener('scroll', hideTip, true);
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== S.screen) go(h); });
addEventListener('resize', () => { renderPops(); renderGuide(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => render());
