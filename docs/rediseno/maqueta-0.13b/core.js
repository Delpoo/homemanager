/* HomeManager 0.13 · segunda parte — maqueta interactiva con datos inventados. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${(window.HM_ICONS || {})[n] || ''}"/></svg>`;
const ib = (label, icon, attrs = '', cls = '') => `<button type="button" class="ib ${cls}" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}>${ic(icon)}</button>`;
let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 1700);
}
const SCREENS = [['menu', 'Menú cuaderno'], ['plano', 'Editor del plano'], ['controles', 'Diseñador de controles'], ['pegados', 'Controles en el plano']];
let screen = SCREENS.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'menu';
function nav() {
  $('#screens').innerHTML = SCREENS.map(([id, name], i) => `<button type="button" data-screen="${id}" aria-current="${id === screen}"><b>${i + 1}</b>${esc(name)}</button>`).join('');
}
$('#screens').addEventListener('click', e => {
  const b = e.target.closest('[data-screen]');
  if (b) go(b.dataset.screen);
});
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (SCREENS.some(([s]) => s === id) && id !== screen) { screen = id; render(); }
});
function go(id) {
  screen = id;
  history.replaceState(null, '', '#' + id);
  render();
}
function topBar({ edit = false, gear = false } = {}) {
  return `<div class="top"><button type="button" class="home">${ic('mdiHomeOutline')}Casa de prueba${ic('mdiChevronDown', 'sm')}</button><span class="grow" style="flex:1"></span><span class="clock">18:42</span>${ib('Tema claro u oscuro', 'mdiWeatherNight', 'data-top="theme"')}${ib('Editar el plano', 'mdiPencilOutline', `data-top="edit" aria-pressed="${edit}"`)}${ib('Configuración', 'mdiCogOutline', `data-top="gear" aria-pressed="${gear}"`)}</div>`;
}
function toggleTheme() {
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = dark ? 'light' : 'dark';
}
const ROOMS = [['M20 20H300V230H200V380H20Z', 'var(--floor)'], ['M200 230H300V380H200Z', 'var(--floor-tile)'], ['M300 20H580V230H300Z', 'var(--floor-wood)'], ['M300 230H430V380H300Z', 'var(--floor-tile)'], ['M430 230H580V380H430Z', 'var(--floor)']];
const planSvg = (extra = '') => `<svg viewBox="0 0 600 400" aria-hidden="true">${ROOMS.map(([d, f]) => `<path class="room" d="${d}" fill="${f}"/>`).join('')}${extra}</svg>`;
const sym = (x, y, icon, on = false, attrs = '') => `<button type="button" class="symbol${on ? ' on' : ''}" style="left:${(x / 600) * 100}%;top:${(y / 400) * 100}%" ${attrs}>${ic(icon)}</button>`;

/* ═════════ 1 · Menú cuaderno ═════════ */
const M = { stack: ['root'], open: true, edit: false };
const ROW = (id, name, icon, sub = '', soon = false) => ({ id, name, icon, sub, soon });
const PAGES = {
  root: { title: 'Configuración', groups: [
    ['Mi casa', [ROW('plano', 'Plano y espacios', 'mdiFloorPlan', '6 espacios'), ROW('hogares', 'Hogares', 'mdiHomeOutline', '2 casas')]],
    ['Pantallas', [ROW('ahora', 'Panel Ahora', 'mdiViewDashboardOutline'), ROW('apariencia', 'Apariencia', 'mdiPaletteOutline'), ROW('tamano', 'Tamaño y vista', 'mdiMagnifyExpand')]],
    ['Controles', [ROW('controles', 'Controles', 'mdiRemote', '3 controles'), ROW('equipos', 'Equipos', 'mdiChip', 'Athom A · Athom B')]],
    ['Avisos', [ROW('alertas', 'Alertas', 'mdiBellOutline', '2 activas'), ROW('auto', 'Automatizaciones', 'mdiRobotOutline', '', true)]],
    ['Mantenimiento', [ROW('estado', 'Estado de la casa', 'mdiClipboardCheckOutline'), ROW('copias', 'Almacenamiento y copias', 'mdiDatabaseOutline')]],
    ['Avanzado', [ROW('acciones', 'Acciones y paneles', 'mdiCodeBraces'), ROW('ayuda', 'Ayuda', 'mdiHelpCircleOutline')]],
  ] },
  plano: { title: 'Plano y espacios', groups: [['', [ROW('editar', 'Editar dibujo y espacios', 'mdiVectorPolylineEdit'), ROW('imagenes', 'Imágenes del plano', 'mdiImageMultipleOutline', '3 imágenes'), ROW('areas', 'Áreas de Home Assistant', 'mdiHomeAssistant', '5 de 6 vinculadas')]]] },
  controles: { title: 'Controles', groups: [['', [ROW('r-tv', 'TV living', 'mdiTelevision', 'IR · 26 botones'), ROW('r-aire', 'Aire living', 'mdiAirConditioner', 'IR · 11 botones'), ROW('r-vent', 'Ventilador living', 'mdiCeilingFan', 'RF · 7 botones')]]] },
  apariencia: { title: 'Apariencia', custom: 'look' },
};
for (const id of ['tv', 'aire', 'vent']) PAGES['r-' + id] = { title: '', custom: 'remote', remote: id };
const titleOf = id => {
  if (PAGES[id]?.remote) return DS.r[PAGES[id].remote].name;
  if (PAGES[id]?.title) return PAGES[id].title;
  for (const p of Object.values(PAGES)) for (const [, rows] of p.groups ?? []) for (const r of rows) if (r.id === id) return r.name;
  return id;
};
function pageHtml(id) {
  const p = PAGES[id] ?? { custom: 'empty' };
  const depth = M.stack.indexOf(id);
  const parent = depth > 0 ? titleOf(M.stack[depth - 1]) : '';
  const head = `<div class="phead">${depth > 0 ? ib('Atrás', 'mdiArrowLeft', 'data-nb="back"') : ''}<h2>${parent ? `<span class="crumb">${esc(parent)}</span>` : ''}${esc(titleOf(id))}</h2>${id === 'controles' ? ib('Nuevo control', 'mdiPlus') : ''}${ib('Cerrar', 'mdiClose', 'data-nb="close"')}</div>`;
  let body = '';
  if (p.groups) body = p.groups.map(([g, rows]) => `${g ? `<div class="grp">${esc(g)}</div>` : ''}${rows.map(r => `<button type="button" class="row${r.soon ? ' soon' : ''}" data-nb="${r.id}">${ic(r.icon)}<span class="t">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>${r.soon ? ic('mdiClockOutline', 'chev') : ic('mdiChevronRight', 'chev')}</button>`).join('')}`).join('');
  else if (p.custom === 'look') body = `<div class="card"><div class="field">${ic('mdiWeatherNight')}<div class="seg"><button aria-pressed="true">Automático</button><button>Claro</button><button>Oscuro</button></div></div><div class="field">${ic('mdiInformationOutline')}<span>Ayudas al pasar el mouse</span><input type="checkbox" class="switch" checked aria-label="Ayudas"></div></div>`;
  else if (p.custom === 'remote') {
    const r = DS.r[p.remote];
    body = `<div class="mini"><div class="mini-in"><div class="rmt theme-${r.theme} testing" style="--cols:${r.cols};--rows:${r.rows};--cell:60px;--gap:${r.gap}px;--rrad:${r.rrad}px">${r.els.map(e => renderEl(e)).join('')}</div></div></div>${[['Diseñar', 'mdiPencilRuler', 'design'], ['Aprender botones', 'mdiAccessPoint', 'x'], ['Probar botones', 'mdiPlayCircleOutline', 'x'], ['Duplicar para otro aparato', 'mdiContentDuplicate', 'x'], ['Emisor y ajustes', 'mdiTuneVariant', 'x']].map(([t, i, k]) => `<button type="button" class="row" data-nb="${k === 'design' ? 'design:' + p.remote : 'x'}">${ic(i)}<span class="t">${esc(t)}</span>${ic('mdiChevronRight', 'chev')}</button>`).join('')}`;
  } else body = `<div class="card soft">${ic('mdiFileDocumentOutline', 'lg')}</div>`;
  return `${head}<div class="pbody">${body}</div>`;
}
function renderMenu() {
  $('#app').innerHTML = `${topBar({ edit: M.edit, gear: M.open })}${M.edit ? `<div class="editband">${ic('mdiPencilOutline', 'sm')}<span>Edición</span><span style="flex:1"></span>${ib('Guardar', 'mdiCheck', 'data-top="edit"', 'sm primary')}</div>` : ''}<div class="body"><div class="stage"><div class="plan">${planSvg()}${sym(90, 70, 'mdiLightbulbOutline', true)}${sym(150, 150, 'mdiCeilingFan')}${sym(440, 110, 'mdiAirConditioner', true)}${sym(360, 300, 'mdiThermometer')}${sym(500, 320, 'mdiFlowerOutline')}</div></div><aside class="side${M.open ? '' : ' closed'}" id="side"><div class="nb" id="nb"><div class="page">${M.open ? pageHtml(M.stack.at(-1)) : ahoraHtml()}</div></div></aside></div>`;
  fitMini();
}
function fitMini() {
  for (const box of $$('.mini')) {
    const inner = box.querySelector('.mini-in'), r = inner.firstElementChild;
    const k = Math.min(1, (box.clientWidth - 24) / r.offsetWidth, 300 / r.offsetHeight);
    inner.style.transform = `scale(${k})`;
    box.style.height = `${r.offsetHeight * k + 24}px`;
  }
}
const ahoraHtml = () => `<div class="phead"><h2>Ahora</h2></div><div class="pbody"><div class="grp">Clima</div><div class="row">${ic('mdiThermometer')}<span class="t">Living</span><b>23,4°</b></div><div class="grp">Encendidos</div><div class="row">${ic('mdiLightbulbOutline')}<span class="t">Lámpara<small>Living</small></span></div><div class="row">${ic('mdiAirConditioner')}<span class="t">Aire<small>Dormitorio · frío 24°</small></span></div></div>`;
function slide(toId, dir) {
  const nb = $('#nb');
  const old = nb.querySelector('.page');
  const next = document.createElement('div');
  next.className = 'page ' + (dir === 'fwd' ? 'in-right' : 'in-left');
  next.innerHTML = pageHtml(toId);
  old.className = 'page ' + (dir === 'fwd' ? 'out-left' : 'out-right');
  if (dir === 'back') nb.prepend(next); else nb.append(next);
  fitMini();
  setTimeout(() => { old.remove(); next.className = 'page'; }, 270);
}
function bindMenu() {
  $('#app').onclick = e => {
    const t = e.target.closest('[data-top],[data-nb]');
    if (!t) return;
    if (t.dataset.top === 'gear') { M.open = !M.open; if (M.open) M.stack = ['root']; return renderMenu(); }
    if (t.dataset.top === 'edit') { M.edit = !M.edit; return renderMenu(); }
    if (t.dataset.top === 'theme') return toggleTheme();
    const id = t.dataset.nb;
    if (!id) return;
    if (id === 'close') { M.open = false; return renderMenu(); }
    if (id === 'back') { M.stack.pop(); return slide(M.stack.at(-1), 'back'); }
    if (id.startsWith('design:')) { DS.cur = id.slice(7); DS.sel = []; return go('controles'); }
    if (id === 'editar') return go('plano');
    if (id === 'x' || t.classList.contains('soon')) return;
    M.stack.push(id);
    slide(id, 'fwd');
  };
}

function render() {
  nav();
  const app = $('#app');
  for (const k of ['onclick', 'ondblclick', 'oninput', 'onchange', 'onpointerdown', 'onpointermove', 'onpointerup', 'ondragstart', 'ondragover', 'ondragleave', 'ondrop', 'ondragend']) app[k] = null;
  if (screen === 'menu') { renderMenu(); bindMenu(); }
  else if (screen === 'plano') { renderPlano(); bindPlano(); }
  else if (screen === 'controles') { renderControles(); bindControles(); }
  else { renderPegados(); bindPegados(); }
}
