/* ═════════ 3 · Diseñador de controles ═════════
   Tres zonas como en una herramienta de diseño: recursos a la izquierda (botones
   aprendidos, elementos, bloques, marcas), el control en el centro (arrastrar,
   agrandar, probar) y el inspector a la derecha (Aspecto, Función, Muestra). */
const CATS = {
  boton: { name: 'Botón', icon: 'mdiGestureTapButton', variants: [['pulsador', 'Pulsador', 'mdiGestureTap'], ['onoff', 'Encender / apagar', 'mdiPower'], ['marca', 'Marca o app', 'mdiPlayBoxOutline'], ['secuencia', 'Secuencia', 'mdiPlaylistPlay']] },
  niveles: { name: 'Niveles', icon: 'mdiTuneVariant', variants: [['masmenos', 'Subir / bajar', 'mdiPlusMinusVariant'], ['barra', 'Barra', 'mdiTuneVertical'], ['escalones', 'Escalones', 'mdiStairs'], ['perilla', 'Perilla', 'mdiKnob']] },
  modos: { name: 'Modos', icon: 'mdiFormatListBulleted', variants: [['botones', 'Botones', 'mdiViewGridOutline'], ['lista', 'Lista', 'mdiFormatListBulleted'], ['ciclo', 'Un botón que rota', 'mdiRepeat']] },
  info: { name: 'Información', icon: 'mdiInformationOutline', variants: [['valor', 'Valor', 'mdiGauge'], ['grafico', 'Gráfico', 'mdiChartLine'], ['titulo', 'Título', 'mdiFormatTitle'], ['separador', 'Separador', 'mdiMinus']] },
  bloque: { name: 'Bloques', icon: 'mdiViewGridPlusOutline', variants: [['cruceta', 'Cruceta', 'mdiGamepadRoundOutline'], ['numeros', 'Teclado numérico', 'mdiDialpad'], ['transporte', 'Reproducción', 'mdiPlayPause'], ['colores', 'Botones de colores', 'mdiPaletteOutline']] },
};
const BLOCK_SLOTS = {
  cruceta: [['up', 'Arriba', 'mdiChevronUp'], ['down', 'Abajo', 'mdiChevronDown'], ['left', 'Izquierda', 'mdiChevronLeft'], ['right', 'Derecha', 'mdiChevronRight'], ['ok', 'OK', 'mdiCheckboxBlankCircleOutline']],
  numeros: [...'123456789'.split('').map(n => [n, n, '']), ['dash', '-/--', ''], ['0', '0', ''], ['enter', 'Entrar', 'mdiKeyboardReturn']],
  transporte: [['prev', 'Anterior', 'mdiSkipPrevious'], ['rew', 'Retroceder', 'mdiRewind'], ['play', 'Reproducir / pausa', 'mdiPlayPause'], ['ff', 'Adelantar', 'mdiFastForward'], ['next', 'Siguiente', 'mdiSkipNext']],
  colores: [['red', 'Rojo', ''], ['green', 'Verde', ''], ['yellow', 'Amarillo', ''], ['blue', 'Azul', '']],
};
const KEY_COLORS = { red: '#d0453a', green: '#3f8f5f', yellow: '#d9b21f', blue: '#3f7fbf' };
const THEMES = [['grafito', 'Grafito'], ['claro', 'Claro'], ['arena', 'Arena'], ['vidrio', 'Vidrio']];
const SWATCH = ['#4f7a5a', '#3f7fbf', '#6f6bb8', '#d98b1f', '#d0453a', '#c2477f', '#1f2421', '#ffffff'];
const ICONSET = ['mdiPower', 'mdiPowerOff', 'mdiPlus', 'mdiMinus', 'mdiChevronUp', 'mdiChevronDown', 'mdiChevronLeft', 'mdiChevronRight', 'mdiArrowLeft', 'mdiHomeOutline', 'mdiMenu', 'mdiInformationOutline', 'mdiVolumeHigh', 'mdiVolumeOff', 'mdiVolumePlus', 'mdiVolumeMinus', 'mdiPlay', 'mdiPause', 'mdiPlayPause', 'mdiStop', 'mdiRewind', 'mdiFastForward', 'mdiSkipPrevious', 'mdiSkipNext', 'mdiRecordRec', 'mdiSnowflake', 'mdiFire', 'mdiFan', 'mdiWaterOutline', 'mdiArrowOscillating', 'mdiLightbulbOutline', 'mdiTimerOutline', 'mdiWeatherNight', 'mdiWeatherSunny', 'mdiThermometer', 'mdiSpeedometer', 'mdiTelevision', 'mdiVideoInputHdmi', 'mdiCast', 'mdiWifi', 'mdiBluetooth', 'mdiMicrophone', 'mdiCogOutline', 'mdiStarOutline', 'mdiHeartOutline', 'mdiTelevisionGuide', 'mdiSubtitlesOutline', 'mdiApps', 'mdiGestureTap', 'mdiPlaylistPlay', 'mdiMovieOpenOutline', 'mdiMusic', 'mdiGamepadVariantOutline', 'mdiLockOutline', 'mdiEyeOutline', 'mdiRepeat', 'mdiAutoFix', 'mdiFlashOutline', 'mdiLeaf', 'mdiSleep'];
const BRANDS = [
  ['Video', [['Netflix', 'mdiNetflix', '#E50914'], ['YouTube', 'mdiYoutube', '#FF0000'], ['YouTube TV', 'mdiYoutubeTv', '#FF0000'], ['Prime Video', '', '#00A8E1'], ['Disney+', '', '#113CCF'], ['Max', '', '#002BE7'], ['Apple TV', 'mdiApple', '#111111'], ['Paramount+', '', '#0064FF'], ['Hulu', 'mdiHulu', '#1CE783'], ['Peacock', '', '#111111'], ['Crunchyroll', '', '#F47521'], ['Mubi', '', '#111111'], ['Pluto TV', '', '#2A2A2A'], ['Tubi', '', '#7408FF'], ['Rakuten TV', '', '#BF0000'], ['ViX', '', '#FF4F00'], ['Plex', 'mdiPlex', '#E5A00D'], ['Kodi', 'mdiKodi', '#17B2E7'], ['Vimeo', 'mdiVimeo', '#1AB7EA'], ['Twitch', 'mdiTwitch', '#9146FF'], ['Globoplay', '', '#FB0234'], ['Canal+', '', '#111111'], ['BBC iPlayer', '', '#F54997'], ['Sky', '', '#0072C9'], ['NOW', '', '#00B2A9']]],
  ['Deportes', [['DAZN', '', '#111111'], ['ESPN', '', '#D50A0A'], ['Fox Sports', '', '#00205B'], ['TyC Sports', '', '#E30613'], ['NBA', '', '#1D428A'], ['F1 TV', '', '#E10600']]],
  ['TV y cable', [['Flow', '', '#111111'], ['DirecTV GO', '', '#00A6D6'], ['Telecentro', '', '#E30613'], ['Claro video', '', '#DA291C'], ['Movistar TV', '', '#019DF4'], ['Samsung TV Plus', '', '#1428A0'], ['LG Channels', '', '#A50034']]],
  ['Música y radio', [['Spotify', 'mdiSpotify', '#1DB954'], ['Apple Music', 'mdiApple', '#FA243C'], ['YouTube Music', 'mdiYoutube', '#FF0000'], ['Amazon Music', '', '#25D1DA'], ['Deezer', '', '#A238FF'], ['Tidal', '', '#111111'], ['SoundCloud', 'mdiSoundcloud', '#FF5500'], ['TuneIn', '', '#14D8CC'], ['Radio', 'mdiRadio', '#5f6e66'], ['Podcasts', 'mdiPodcast', '#8c4fd1']]],
  ['Equipos y juegos', [['Google TV', 'mdiGoogle', '#4285F4'], ['Chromecast', 'mdiCast', '#4285F4'], ['Android TV', 'mdiAndroid', '#3DDC84'], ['Fire TV', '', '#FF9900'], ['Roku', '', '#6C3C97'], ['Xbox', 'mdiMicrosoftXbox', '#107C10'], ['PlayStation', 'mdiSonyPlaystation', '#003791'], ['Nintendo Switch', 'mdiNintendoSwitch', '#E60012'], ['Steam', 'mdiSteam', '#1b2838'], ['Google Play', 'mdiGooglePlay', '#01875f'], ['Navegador', 'mdiWeb', '#4f7a5a'], ['Asistente', 'mdiGoogleAssistant', '#4285F4']]],
  ['Teclas del control', [['Inicio', 'mdiHomeOutline', '#4f7a5a'], ['Menú', 'mdiMenu', '#4f7a5a'], ['Atrás', 'mdiArrowLeft', '#4f7a5a'], ['Guía', 'mdiTelevisionGuide', '#4f7a5a'], ['Info', 'mdiInformationOutline', '#4f7a5a'], ['Fuente', 'mdiVideoInputHdmi', '#4f7a5a'], ['HDMI 1', 'mdiHdmiPort', '#4f7a5a'], ['HDMI 2', 'mdiHdmiPort', '#4f7a5a'], ['HDMI 3', 'mdiHdmiPort', '#4f7a5a'], ['Silencio', 'mdiVolumeOff', '#4f7a5a'], ['Subtítulos', 'mdiSubtitlesOutline', '#4f7a5a'], ['Apps', 'mdiApps', '#4f7a5a'], ['Micrófono', 'mdiMicrophone', '#4f7a5a'], ['Grabar', 'mdiRecordRec', '#d0453a'], ['Pausa', 'mdiPause', '#4f7a5a'], ['Reproducir', 'mdiPlay', '#4f7a5a'], ['Detener', 'mdiStop', '#4f7a5a'], ['Adelantar', 'mdiFastForward', '#4f7a5a'], ['Retroceder', 'mdiRewind', '#4f7a5a']]],
];
const brandOf = name => BRANDS.flatMap(([, l]) => l).find(b => b[0] === name) ?? [name, '', '#5f6e66'];
const brandMark = (name, size = '') => {
  const [n, i, c] = brandOf(name);
  return `<span class="brandmark ${size}" style="--bc:${c}">${i ? ic(i, 'sm') : esc(n.replace(/[^A-Za-z0-9+]/g, '').slice(0, 2))}</span>`;
};
const SENSORS = ['Temperatura living', 'Humedad living', 'Consumo del aire', 'Potencia de la TV'];

/* — controles de ejemplo — */
const K = (o) => ({ show: 'icono', fs: 13, fw: 500, isz: 22, rad: 14, relief: 'relieve', bg: '', fg: '', bd: '', onBg: '', anim: 'hundir', ...o });
const DS0 = () => ({
  tv: {
    id: 'tv', name: 'TV living', icon: 'mdiTelevision', src: 'IR', theme: 'grafito', cols: 3, rows: 10, gap: 10, rrad: 34, body: '',
    learned: ['Encender', 'Fuente', 'Silencio', 'Netflix', 'YouTube', 'Prime Video', 'Arriba', 'Abajo', 'Izquierda', 'Derecha', 'OK', 'Atrás', 'Inicio', 'Menú', 'Vol +', 'Vol −', 'Canal +', 'Canal −', 'Play/Pausa', 'Adelantar', 'Retroceder', 'Rojo', 'Verde', 'Amarillo', 'Azul', 'Guía'],
    els: [
      K({ id: 'pw', cat: 'boton', v: 'onoff', x: 1, y: 1, w: 1, h: 1, text: 'Encender', icon: 'mdiPower', fg: '#ff6b5e', send: 'Encender', send2: '', on: false }),
      K({ id: 'src', cat: 'boton', v: 'pulsador', x: 2, y: 1, w: 1, h: 1, text: 'Fuente', icon: 'mdiVideoInputHdmi', send: 'Fuente', hold: 'nada' }),
      K({ id: 'mute', cat: 'boton', v: 'pulsador', x: 3, y: 1, w: 1, h: 1, text: 'Silencio', icon: 'mdiVolumeOff', send: 'Silencio', hold: 'nada' }),
      K({ id: 'nf', cat: 'boton', v: 'marca', x: 1, y: 2, w: 1, h: 1, brand: 'Netflix', text: 'Netflix', send: 'Netflix', rad: 12 }),
      K({ id: 'yt', cat: 'boton', v: 'marca', x: 2, y: 2, w: 1, h: 1, brand: 'YouTube', text: 'YouTube', send: 'YouTube', rad: 12 }),
      K({ id: 'pv', cat: 'boton', v: 'marca', x: 3, y: 2, w: 1, h: 1, brand: 'Prime Video', text: 'Prime Video', send: 'Prime Video', rad: 12 }),
      K({ id: 'dp', cat: 'bloque', v: 'cruceta', x: 1, y: 3, w: 3, h: 3, rad: 999, slots: { up: 'Arriba', down: 'Abajo', left: 'Izquierda', right: 'Derecha', ok: 'OK' } }),
      K({ id: 'bk', cat: 'boton', v: 'pulsador', x: 1, y: 6, w: 1, h: 1, text: 'Atrás', icon: 'mdiArrowLeft', send: 'Atrás', hold: 'nada' }),
      K({ id: 'hm', cat: 'boton', v: 'pulsador', x: 2, y: 6, w: 1, h: 1, text: 'Inicio', icon: 'mdiHomeOutline', send: 'Inicio', hold: 'nada' }),
      K({ id: 'mn', cat: 'boton', v: 'pulsador', x: 3, y: 6, w: 1, h: 1, text: 'Menú', icon: 'mdiMenu', send: 'Menú', hold: 'nada' }),
      K({ id: 'vol', cat: 'niveles', v: 'masmenos', orient: 'v', x: 1, y: 7, w: 1, h: 2, text: 'VOL', values: 'num', min: 0, max: 100, step: 1, unit: '', levels: [], value: 18, wrap: false, display: 'nada', sendBy: 'updown', up: 'Vol +', down: 'Vol −', hold: 'repetir', rad: 999, fs: 12 }),
      K({ id: 'guia', cat: 'boton', v: 'pulsador', x: 2, y: 7, w: 1, h: 1, text: 'Guía', icon: 'mdiTelevisionGuide', send: 'Guía', hold: 'nada' }),
      K({ id: 'cine', cat: 'boton', v: 'secuencia', x: 2, y: 8, w: 1, h: 1, text: 'Cine', icon: 'mdiMovieOpenOutline', show: 'ambos', fs: 11, seq: [{ b: 'Encender', t: 1 }, { wait: 1500 }, { b: 'Fuente', t: 2 }, { b: 'Netflix', t: 1 }] }),
      K({ id: 'ch', cat: 'niveles', v: 'masmenos', orient: 'v', x: 3, y: 7, w: 1, h: 2, text: 'CH', values: 'num', min: 1, max: 999, step: 1, unit: '', levels: [], value: 13, wrap: true, display: 'nada', sendBy: 'updown', up: 'Canal +', down: 'Canal −', hold: 'nada', rad: 999, fs: 12 }),
      K({ id: 'tr', cat: 'bloque', v: 'transporte', x: 1, y: 9, w: 3, h: 1, rad: 999, slots: { rew: 'Retroceder', play: 'Play/Pausa', ff: 'Adelantar' } }),
      K({ id: 'col', cat: 'bloque', v: 'colores', x: 1, y: 10, w: 3, h: 1, rad: 999, slots: { red: 'Rojo', green: 'Verde', yellow: 'Amarillo', blue: 'Azul' } }),
    ],
  },
  aire: {
    id: 'aire', name: 'Aire living', icon: 'mdiAirConditioner', src: 'IR', theme: 'claro', cols: 4, rows: 6, gap: 8, rrad: 30, body: '',
    learned: ['Encender', 'Apagar', 'Temp +', 'Temp −', 'Modo frío', 'Modo calor', 'Modo seco', 'Modo ventilar', 'Velocidad', 'Oscilar', 'Turbo'],
    els: [
      K({ id: 'apw', cat: 'boton', v: 'onoff', x: 1, y: 1, w: 1, h: 1, text: 'Encender', icon: 'mdiPower', send: 'Encender', send2: 'Apagar', on: true, onBg: '#4f7a5a' }),
      K({ id: 'osc', cat: 'boton', v: 'pulsador', x: 2, y: 1, w: 2, h: 1, text: 'Oscilar', icon: 'mdiArrowOscillating', show: 'ambos', send: 'Oscilar', hold: 'nada' }),
      K({ id: 'tur', cat: 'boton', v: 'pulsador', x: 4, y: 1, w: 1, h: 1, text: 'Turbo', icon: 'mdiFlashOutline', send: 'Turbo', hold: 'nada' }),
      K({ id: 'tmp', cat: 'niveles', v: 'masmenos', orient: 'v', x: 1, y: 2, w: 1, h: 3, text: 'Temperatura', values: 'num', min: 16, max: 30, step: 1, unit: '°', levels: [], value: 24, wrap: false, display: 'valor', sendBy: 'updown', up: 'Temp +', down: 'Temp −', hold: 'nada', vsz: 26, fs: 10 }),
      K({ id: 'mod', cat: 'modos', v: 'botones', x: 2, y: 2, w: 3, h: 1, text: 'Modo', fs: 11, isz: 18, options: [{ t: 'Frío', i: 'mdiSnowflake', s: 'Modo frío' }, { t: 'Calor', i: 'mdiFire', s: 'Modo calor' }, { t: 'Seco', i: 'mdiWaterOutline', s: 'Modo seco' }, { t: 'Ventilar', i: 'mdiFan', s: 'Modo ventilar' }], value: 0, onBg: '#3f7fbf', rad: 12 }),
      K({ id: 'vel', cat: 'niveles', v: 'escalones', orient: 'h', x: 2, y: 3, w: 3, h: 1, text: 'Velocidad', values: 'nombres', levels: ['Auto', 'Baja', 'Media', 'Alta'], min: 0, max: 3, step: 1, unit: '', value: 2, wrap: true, display: 'nombre', sendBy: 'avanza', up: 'Velocidad', down: '', fs: 11, rad: 12 }),
      K({ id: 'amb', cat: 'info', v: 'valor', x: 2, y: 4, w: 3, h: 1, text: 'Ambiente', sensor: 'Temperatura living', fs: 11 }),
      K({ id: 'noche', cat: 'boton', v: 'secuencia', x: 1, y: 5, w: 4, h: 1, text: 'Modo noche', icon: 'mdiWeatherNight', show: 'ambos', seq: [{ b: 'Modo seco', t: 1 }, { wait: 500 }, { b: 'Temp +', t: 2 }, { b: 'Velocidad', t: 1 }] }),
      K({ id: 'gr', cat: 'info', v: 'grafico', x: 1, y: 6, w: 4, h: 1, text: 'Consumo hoy', sensor: 'Consumo del aire', fs: 10 }),
    ],
  },
  vent: {
    id: 'vent', name: 'Ventilador living', icon: 'mdiCeilingFan', src: 'RF', theme: 'arena', cols: 3, rows: 4, gap: 10, rrad: 30, body: '',
    learned: ['Apagar', 'Velocidad 1', 'Velocidad 2', 'Velocidad 3', 'Luz', 'Temporizador', 'Rotación'],
    els: [
      K({ id: 'vpw', cat: 'boton', v: 'pulsador', x: 1, y: 1, w: 1, h: 1, text: 'Apagar', icon: 'mdiPower', send: 'Apagar', hold: 'nada' }),
      K({ id: 'vluz', cat: 'boton', v: 'onoff', x: 2, y: 1, w: 1, h: 1, text: 'Luz', icon: 'mdiLightbulbOutline', send: 'Luz', send2: '', on: false, onBg: '#d98b1f' }),
      K({ id: 'vtim', cat: 'modos', v: 'ciclo', x: 3, y: 1, w: 1, h: 1, text: 'Temporizador', options: [{ t: '1 h', i: 'mdiTimerOutline', s: 'Temporizador' }, { t: '4 h', i: 'mdiTimerOutline', s: 'Temporizador' }, { t: '8 h', i: 'mdiTimerOutline', s: 'Temporizador' }], value: 0, fs: 11 }),
      K({ id: 'vvel', cat: 'niveles', v: 'masmenos', orient: 'h', x: 1, y: 2, w: 3, h: 1, text: 'Velocidad', values: 'nombres', levels: ['Apagado', '1', '2', '3'], min: 0, max: 3, step: 1, unit: '', value: 2, wrap: false, display: 'valor', sendBy: 'nivel', up: '', down: '', lvl: ['Apagar', 'Velocidad 1', 'Velocidad 2', 'Velocidad 3'], hold: 'nada', vsz: 22, fs: 10 }),
      K({ id: 'vrot', cat: 'boton', v: 'pulsador', x: 1, y: 3, w: 3, h: 1, text: 'Rotación', icon: 'mdiRepeat', show: 'ambos', send: 'Rotación', hold: 'nada' }),
    ],
  },
});
const DS = { r: DS0(), cur: 'tv', sel: [], tab: 'aspecto', left: 'elementos', test: false, hist: [], fut: [], pop: null, bq: '', iq: '', n: 200, sent: '', dup: false, drag: null, ghost: null };
const R = () => DS.r[DS.cur];
const elById = id => R().els.find(e => e.id === id);
const dsSel = () => DS.sel.map(elById).filter(Boolean);
function dsSave() {
  DS.hist.push(JSON.stringify(DS.r));
  if (DS.hist.length > 60) DS.hist.shift();
  DS.fut = [];
}
const levelCount = e => (e.values === 'num' ? Math.floor((e.max - e.min) / e.step) + 1 : e.levels.length);
const lvIdx = e => (e.values === 'num' ? Math.round((e.value - e.min) / e.step) : e.value);
const levelText = (e, i = lvIdx(e)) => (e.values === 'num' ? `${e.min + i * e.step}${e.unit}` : e.levels[i] ?? '');

/* — dibujo de un elemento (el mismo en el diseñador y en el plano) — */
function keyStyle(e) {
  const v = [];
  if (e.cat === 'boton' && e.v === 'marca' && !e.bg) v.push(`--kbg:${brandOf(e.brand)[2]}`, '--kfg:#fff');
  else {
    if (e.bg) v.push(`--kbg:${e.bg}`);
    if (e.fg) v.push(`--kfg:${e.fg}`);
  }
  if (e.bd) v.push(`--kbd:${e.bd}`);
  if (e.onBg) v.push(`--kon:${e.onBg}`);
  v.push(`--fs:${e.fs}px`, `--fw:${e.fw}`, `--isz:${e.isz}px`, `--rad:${e.rad >= 999 ? '999px' : e.rad + 'px'}`);
  if (e.vsz) v.push(`--vsz:${e.vsz}px`);
  return v.join(';');
}
function content(e, icon, text) {
  const ico = e.show !== 'texto' && icon ? icon : '';
  const txt = e.show !== 'icono' && text ? `<span class="kt">${esc(text)}</span>` : '';
  return ico + txt || `<span class="kt">${esc(text)}</span>`;
}
function renderEl(e, { place = true, extra = '' } = {}) {
  const grid = place ? `grid-column:${e.x} / span ${e.w};grid-row:${e.y} / span ${e.h};` : '';
  const cls = `k ${e.relief}${e.cat === 'info' ? ' kinfo' : ''}${e.on && e.v === 'onoff' ? ' on' : ''}${e.bd ? ' bd' : ''}`;
  const open = `<div class="${cls}" data-el="${e.id}" style="${grid}${keyStyle(e)}" ${extra}>`;
  let inner = '';
  if (e.cat === 'boton') {
    const icon = e.v === 'marca' ? brandMark(e.brand, 'inkey') : ic(e.icon || 'mdiGestureTap');
    inner = `<button type="button" class="kface" data-op="press" aria-label="${esc(e.text)}">${content(e, icon, e.text)}</button>`;
  } else if (e.cat === 'niveles') {
    const n = levelCount(e), i = lvIdx(e);
    const mid = e.display === 'nada' ? `<span class="kt">${esc(e.text)}</span>` : e.display === 'puntos' ? `<span class="kdots">${Array.from({ length: Math.min(8, n) }, (_, j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}</span>` : `<b class="kval">${esc(e.display === 'nombre' || e.values === 'nombres' ? levelText(e) : levelText(e))}</b>${e.h > 1 || e.w > 2 ? `<small class="ksub">${esc(e.text)}</small>` : ''}`;
    if (e.v === 'masmenos') {
      const up = `<button type="button" class="kpart" data-op="inc" aria-label="Subir">${ic(e.orient === 'v' ? 'mdiChevronUp' : 'mdiPlus')}</button>`;
      const down = `<button type="button" class="kpart" data-op="dec" aria-label="Bajar">${ic(e.orient === 'v' ? 'mdiChevronDown' : 'mdiMinus')}</button>`;
      inner = `<div class="krock ${e.orient}">${e.orient === 'v' ? up : down}<div class="kmid">${mid}</div>${e.orient === 'v' ? down : up}</div>`;
    } else if (e.v === 'escalones') {
      inner = `<div class="ksteps ${e.orient}">${Array.from({ length: n }, (_, j) => `<button type="button" data-op="set" data-v="${j}" aria-pressed="${j === i}">${esc(e.values === 'num' ? e.min + j * e.step : e.levels[j])}</button>`).join('')}</div>`;
    } else if (e.v === 'barra') {
      const p = (i / Math.max(1, n - 1)) * 100;
      inner = `<div class="kbar ${e.orient}"><button type="button" class="kpart" data-op="dec" aria-label="Bajar">${ic('mdiMinus', 'sm')}</button><div class="ktrack"><i style="${e.orient === 'v' ? 'height' : 'width'}:${p}%"></i></div><button type="button" class="kpart" data-op="inc" aria-label="Subir">${ic('mdiPlus', 'sm')}</button>${e.display !== 'nada' ? `<span class="kbarv">${esc(levelText(e))}</span>` : ''}</div>`;
    } else {
      const p = (i / Math.max(1, n - 1)) * 100;
      inner = `<div class="kknob"><button type="button" class="kpart" data-op="dec" aria-label="Bajar">${ic('mdiMinus', 'sm')}</button><span class="dial" style="--p:${p}"><b>${esc(levelText(e))}</b></span><button type="button" class="kpart" data-op="inc" aria-label="Subir">${ic('mdiPlus', 'sm')}</button></div>`;
    }
  } else if (e.cat === 'modos') {
    const o = e.options[e.value] ?? e.options[0];
    if (e.v === 'botones') inner = `<div class="kmodes">${e.options.map((op, j) => `<button type="button" data-op="mode" data-v="${j}" aria-pressed="${j === e.value}">${ic(op.i)}<span>${esc(op.t)}</span></button>`).join('')}</div>`;
    else if (e.v === 'ciclo') inner = `<button type="button" class="kface col" data-op="cycle">${ic(o.i)}<span class="kt">${esc(o.t)}</span></button>`;
    else inner = `<button type="button" class="kface" data-op="cycle">${ic(o.i)}<span class="kt">${esc(o.t)}</span>${ic('mdiChevronDown', 'sm')}</button>`;
  } else if (e.cat === 'info') {
    if (e.v === 'valor') inner = `<div class="kread"><small>${esc(e.text)}</small><b>26,5 <em>°C</em></b></div>`;
    else if (e.v === 'grafico') inner = `<div class="kread"><small>${esc(e.text)}</small><svg viewBox="0 0 100 30" preserveAspectRatio="none"><path d="M0 26 L12 22 L24 24 L36 15 L48 17 L60 9 L72 12 L84 6 L100 8 L100 30 L0 30Z" class="fill"/><path d="M0 26 L12 22 L24 24 L36 15 L48 17 L60 9 L72 12 L84 6 L100 8" class="line"/></svg></div>`;
    else if (e.v === 'titulo') inner = `<div class="ktitle">${esc(e.text)}</div>`;
    else inner = `<div class="ksep"></div>`;
  } else {
    const s = e.slots ?? {};
    if (e.v === 'cruceta') inner = `<div class="kdpad"><button type="button" class="du" data-op="slot" data-v="up" aria-label="Arriba">${ic('mdiChevronUp')}</button><button type="button" class="dl" data-op="slot" data-v="left" aria-label="Izquierda">${ic('mdiChevronLeft')}</button><button type="button" class="dok" data-op="slot" data-v="ok">OK</button><button type="button" class="dr" data-op="slot" data-v="right" aria-label="Derecha">${ic('mdiChevronRight')}</button><button type="button" class="dd" data-op="slot" data-v="down" aria-label="Abajo">${ic('mdiChevronDown')}</button></div>`;
    else if (e.v === 'numeros') inner = `<div class="knum">${BLOCK_SLOTS.numeros.map(([k, t, i]) => `<button type="button" data-op="slot" data-v="${k}">${i ? ic(i, 'sm') : esc(t)}</button>`).join('')}</div>`;
    else if (e.v === 'transporte') inner = `<div class="ktrans">${BLOCK_SLOTS.transporte.filter(([k]) => e.w > 2 || ['rew', 'play', 'ff'].includes(k)).map(([k, t, i]) => `<button type="button" data-op="slot" data-v="${k}" aria-label="${t}">${ic(i)}</button>`).join('')}</div>`;
    else inner = `<div class="kcolors">${BLOCK_SLOTS.colores.map(([k, t]) => `<button type="button" data-op="slot" data-v="${k}" aria-label="${t}" style="--cc:${KEY_COLORS[k]}"></button>`).join('')}</div>`;
  }
  return `${open}${inner}</div>`;
}
/** Tocar en modo prueba (o en el plano): cambia el valor y "envía". */
function operateEl(e, op, v) {
  let sent = '';
  if (op === 'press') {
    if (e.v === 'onoff') { e.on = !e.on; sent = e.on || !e.send2 ? e.send : e.send2; }
    else if (e.v === 'secuencia') sent = (e.seq ?? []).filter(s => s.b).map(s => (s.t > 1 ? `${s.b} ×${s.t}` : s.b)).join(' → ');
    else sent = e.send;
  } else if (op === 'inc' || op === 'dec') {
    const n = levelCount(e);
    let i = lvIdx(e) + (op === 'inc' ? 1 : -1);
    if (i >= n) i = e.wrap ? 0 : n - 1;
    if (i < 0) i = e.wrap ? n - 1 : 0;
    const moved = i !== lvIdx(e);
    e.value = e.values === 'num' ? e.min + i * e.step : i;
    sent = !moved ? '' : e.sendBy === 'updown' ? (op === 'inc' ? e.up : e.down) : e.sendBy === 'nivel' ? e.lvl?.[i] ?? levelText(e) : e.up;
    if (!moved) sent = '—';
  } else if (op === 'set') {
    e.value = e.values === 'num' ? e.min + Number(v) * e.step : Number(v);
    sent = e.sendBy === 'nivel' ? e.lvl?.[Number(v)] ?? levelText(e) : e.up;
  } else if (op === 'mode') { e.value = Number(v); sent = e.options[e.value].s; }
  else if (op === 'cycle') { e.value = (e.value + 1) % e.options.length; sent = e.options[e.value].s; }
  else if (op === 'slot') sent = e.slots?.[v] || '—';
  return sent;
}

/* — pantalla — */
function renderControles() {
  const r = R();
  $('#app').innerHTML = `${topBar({ gear: true })}<div class="dbar">${ib('Atrás', 'mdiArrowLeft', 'data-ds="back"')}<button type="button" class="rpick" data-ds="remotes">${ic(r.icon)}<b>${esc(r.name)}</b><span class="srcpill">${r.src}</span>${ic('mdiChevronDown', 'sm')}</button><div class="seg dmode"><button type="button" data-ds="design" aria-pressed="${!DS.test}">${ic('mdiPencilRuler', 'sm')}Diseñar</button><button type="button" data-ds="test" aria-pressed="${DS.test}">${ic('mdiPlay', 'sm')}Probar</button></div><span class="grow" style="flex:1"></span>${ib('Deshacer · Ctrl+Z', 'mdiUndo', `data-ds="undo"${DS.hist.length ? '' : ' disabled'}`)}${ib('Rehacer', 'mdiRedo', `data-ds="redo"${DS.fut.length ? '' : ' disabled'}`)}${ib('Ordenar automáticamente', 'mdiAutoFix', 'data-ds="auto"')}${ib('Duplicar este control para otro aparato', 'mdiContentDuplicate', 'data-ds="dup"')}${ib('Listo', 'mdiCheck', 'data-ds="done"', 'primary')}</div><div class="designer"><aside class="dres" id="dres"></aside><div class="dstage theme-bg-${r.theme}" id="dstage"></div><aside class="insp" id="insp"></aside></div>${DS.pop === 'remotes' ? remotesPop() : ''}${DS.dup ? dupHtml() : ''}`;
  paintDesigner();
}
function remotesPop() {
  return `<div class="rpop">${Object.values(DS.r).map(x => `<div class="rrow${x.id === DS.cur ? ' on' : ''}"><button type="button" data-remote="${x.id}">${ic(x.icon)}<span>${esc(x.name)}</span><span class="srcpill">${x.src}</span></button>${ib('Duplicar para otro aparato', 'mdiContentDuplicate', `data-dupof="${x.id}"`, 'sm')}</div>`).join('')}</div>`;
}
function paintDesigner() {
  paintRes();
  paintCanvas();
  paintInsp();
}
function paintRes() {
  const r = R();
  const tabs = [['aprendidos', 'Aprendidos', 'mdiAccessPoint'], ['elementos', 'Elementos', 'mdiShapeOutline'], ['bloques', 'Bloques', 'mdiViewGridPlusOutline'], ['marcas', 'Marcas', 'mdiPlayBoxOutline']];
  let body = '';
  if (DS.left === 'aprendidos') {
    const uses = l => r.els.filter(e => [e.send, e.send2, e.up, e.down].includes(l) || e.options?.some(o => o.s === l) || Object.values(e.slots ?? {}).includes(l) || e.seq?.some(s => s.b === l) || e.lvl?.includes(l)).length;
    body = `<div class="lhead"><span>${r.learned.length}</span>${ib('Aprender más botones', 'mdiPlus', 'data-ds="learn"', 'sm')}</div><div class="learned">${r.learned.map(l => { const n = uses(l); return `<span class="lchip${n ? '' : ' unused'}" draggable="true" data-drag="learned" data-val="${esc(l)}" title="${n ? `En ${n} elemento${n > 1 ? 's' : ''}` : 'Sin usar: arrastralo al control'}">${ic('mdiDragVertical', 'sm')}<span>${esc(l)}</span><em>${n || '!'}</em></span>`; }).join('')}</div>`;
  } else if (DS.left === 'elementos') {
    body = ['boton', 'niveles', 'modos', 'info'].map(c => `<div class="egrp"><span>${esc(CATS[c].name)}</span><div class="etiles">${CATS[c].variants.map(([v, t, i]) => `<button type="button" class="etile" draggable="true" data-drag="variant" data-cat="${c}" data-val="${v}" title="${esc(t)}">${ic(i, 'lg')}<span>${esc(t)}</span></button>`).join('')}</div></div>`).join('');
  } else if (DS.left === 'bloques') {
    body = `<div class="etiles one">${CATS.bloque.variants.map(([v, t]) => `<div class="btile" role="button" tabindex="0" draggable="true" data-drag="variant" data-cat="bloque" data-val="${v}" title="${esc(t)}"><span class="bprev">${renderEl(sampleOf('bloque', v), { place: false })}</span><span>${esc(t)}</span></div>`).join('')}</div>`;
  } else {
    const q = DS.bq.trim().toLowerCase();
    const groups = BRANDS.map(([g, l]) => [g, l.filter(b => !q || b[0].toLowerCase().includes(q))]).filter(([, l]) => l.length);
    body = `<input class="tin bsearch" id="bq" placeholder="${BRANDS.reduce((n, [, l]) => n + l.length, 0)} marcas y teclas" value="${esc(DS.bq)}" aria-label="Buscar marca">${groups.map(([g, l]) => `<div class="egrp"><span>${esc(g)}</span><div class="bgrid">${l.map(b => `<button type="button" class="brand" draggable="true" data-drag="brand" data-val="${esc(b[0])}" title="${esc(b[0])}">${brandMark(b[0])}<span>${esc(b[0])}</span></button>`).join('')}</div></div>`).join('') || '<p class="muted">—</p>'}`;
  }
  $('#dres').innerHTML = `<div class="rtabs" role="tablist">${tabs.map(([k, t, i]) => `<button type="button" role="tab" data-left="${k}" aria-selected="${DS.left === k}" title="${t}">${ic(i, 'sm')}<span>${t}</span></button>`).join('')}</div><div class="rbody">${body}</div>`;
}
function sampleOf(cat, v) {
  const base = K({ id: 'sample', cat, v, x: 1, y: 1, w: 3, h: 3, text: '', rad: cat === 'bloque' ? 999 : 14 });
  if (cat === 'bloque') return { ...base, slots: {}, rad: 999 };
  return base;
}
function paintCanvas() {
  const r = R();
  const sel = new Set(DS.sel);
  const cell = 60;
  const grid = DS.test ? '' : Array.from({ length: r.cols * r.rows }, (_, i) => `<span class="gcell" style="grid-column:${(i % r.cols) + 1};grid-row:${Math.floor(i / r.cols) + 1}"></span>`).join('');
  const els = r.els.map(e => renderEl(e, { extra: sel.has(e.id) && !DS.test ? 'data-sel' : '' })).join('');
  let handles = '';
  if (!DS.test && DS.sel.length === 1) {
    const e = elById(DS.sel[0]);
    handles = `<div class="kbox" style="grid-column:${e.x} / span ${e.w};grid-row:${e.y} / span ${e.h}"><span class="kh e" data-kh="e"></span><span class="kh s" data-kh="s"></span><span class="kh se" data-kh="se"></span><div class="kmini">${ib('Duplicar', 'mdiContentDuplicate', 'data-ds="eldup"', 'sm')}${ib('Quitar', 'mdiTrashCanOutline', 'data-ds="eldel"', 'sm danger')}</div></div>`;
  }
  const ghost = DS.ghost ? `<span class="kghost${DS.ghost.ok ? '' : ' bad'}" style="grid-column:${DS.ghost.x} / span ${DS.ghost.w};grid-row:${DS.ghost.y} / span ${DS.ghost.h}"></span>` : '';
  $('#dstage').innerHTML = `${DS.sent ? `<div class="sent" role="status">${ic('mdiAccessPoint', 'sm')}${esc(DS.sent)}</div>` : ''}<div class="rmt theme-${r.theme}${DS.test ? ' testing' : ' designing'}" id="rmt" style="--cols:${r.cols};--rows:${r.rows};--cell:${cell}px;--gap:${r.gap}px;--rrad:${r.rrad}px;${r.body ? `--rbody:${r.body};` : ''}">${grid}${els}${ghost}${handles}</div>`;
}
const row = (icon, label, html) => `<div class="irow" title="${esc(label)}">${ic(icon, 'sm')}<div class="ictl">${html}</div></div>`;
const segI = (key, items, value, icons = false) => `<div class="seg${icons ? ' icons' : ''}">${items.map(([v, t, i]) => `<button type="button" data-set="${key}" data-val="${v}" aria-pressed="${String(value) === String(v)}" title="${esc(t)}" aria-label="${esc(t)}">${i ? ic(i, 'sm') : ''}${icons ? '' : esc(t)}</button>`).join('')}</div>`;
const selL = (key, value, opts, empty = 'Elegir', attrs = '') => `<select class="isel" data-field="${key}" ${attrs}><option value="">${esc(empty)}</option>${opts.map(o => `<option${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
const slider = (key, min, max, val, unit = '') => `<div class="islider"><input type="range" min="${min}" max="${max}" value="${val}" data-num="${key}" aria-label="${esc(key)}"><output>${val}${unit}</output></div>`;
const swatches = (key, val, extra = []) => `<div class="sw">${[...extra, ...SWATCH].map(c => `<button type="button" class="${c === '' ? 'auto' : c === 'none' ? 'none' : ''}" data-set="${key}" data-val="${c}" style="--c:${c || 'transparent'}" aria-pressed="${(val ?? '') === c}" title="${c === '' ? 'Del tema' : c === 'none' ? 'Sin color' : c}"></button>`).join('')}<label class="swc" title="Otro color"><input type="color" data-color="${key}" value="${/^#/.test(val) ? val : '#4f7a5a'}" aria-label="Otro color">${ic('mdiEyedropperVariant', 'sm')}</label></div>`;
const stepper = (key, val, min = 1, max = 20) => `<span class="stp"><button type="button" data-step="${key}" data-d="-1"${val <= min ? ' disabled' : ''}>−</button><output>${val}</output><button type="button" data-step="${key}" data-d="1"${val >= max ? ' disabled' : ''}>+</button></span>`;
function paintInsp() {
  const r = R();
  const ss = dsSel();
  if (!ss.length) {
    $('#insp').innerHTML = `<div class="ihead"><span class="tile">${ic(r.icon)}</span><b><input class="iname" data-rname value="${esc(r.name)}" aria-label="Nombre del control"><small>${r.src} · ${r.els.length} elementos</small></b></div><div class="ibody"><div class="isec">Lienzo</div>${row('mdiViewGridOutline', 'Columnas y filas', `<span class="sizes">${stepper('cols', r.cols, 2, 8)}<span>×</span>${stepper('rows', r.rows, 2, 16)}</span>`)}${row('mdiArrowExpandAll', 'Separación', slider('gap', 2, 18, r.gap, ' px'))}${row('mdiSquareRoundedOutline', 'Esquinas del control', slider('rrad', 0, 48, r.rrad, ' px'))}<div class="isec">Tema</div><div class="themes">${THEMES.map(([k, t]) => `<button type="button" class="theme theme-${k}" data-theme="${k}" aria-pressed="${r.theme === k}"><span class="tbody"><i></i><i></i><i></i><i></i></span><span>${t}</span></button>`).join('')}</div>${row('mdiFormatColorFill', 'Color del cuerpo', swatches('body', r.body, ['']))}</div>`;
    return;
  }
  if (ss.length > 1) {
    $('#insp').innerHTML = `<div class="ihead"><span class="tile">${ic('mdiSelectionMultiple')}</span><b>${ss.length} elementos</b>${ib('Duplicar', 'mdiContentDuplicate', 'data-ds="eldup"', 'sm')}${ib('Quitar', 'mdiTrashCanOutline', 'data-ds="eldel"', 'sm danger')}</div><div class="ibody">${aspectoRows(ss[0], true)}</div>`;
    return;
  }
  const e = ss[0];
  const c = CATS[e.cat];
  const vn = c.variants.find(([v]) => v === e.v)?.[1] ?? '';
  const tabs = `<div class="tabs" role="tablist">${[['aspecto', 'Aspecto'], ['funcion', 'Función'], ['muestra', 'Muestra']].map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${DS.tab === k}">${t}</button>`).join('')}</div>`;
  let body = '';
  if (DS.tab === 'aspecto') body = aspectoRows(e);
  else if (DS.tab === 'funcion') body = funcionRows(e);
  else body = muestraRows(e);
  $('#insp').innerHTML = `<div class="ihead"><span class="tile">${ic(c.variants.find(([v]) => v === e.v)?.[2] ?? c.icon)}</span><b>${esc(e.text || vn)}<small>${esc(c.name)} · ${esc(vn)}</small></b>${ib('Duplicar · Ctrl+D', 'mdiContentDuplicate', 'data-ds="eldup"', 'sm')}${ib('Quitar · Supr', 'mdiTrashCanOutline', 'data-ds="eldel"', 'sm danger')}</div>${tabs}<div class="ibody">${body}</div>${DS.pop === 'icons' ? iconsPop(e) : ''}${DS.pop === 'brands' ? brandsPop() : ''}`;
}
function aspectoRows(e, multi = false) {
  const hasText = !['separador'].includes(e.v);
  let h = '';
  if (!multi && hasText) h += `${row('mdiFormatText', 'Texto e ícono', `<div class="tline">${e.cat === 'boton' && e.v !== 'marca' || e.cat === 'modos' ? `<button type="button" class="ipick" data-ds="icons" title="Ícono">${ic(e.icon || 'mdiShapeOutline')}</button>` : ''}<input class="tin" type="text" data-field="text" value="${esc(e.text)}" aria-label="Texto que se ve"></div>`)}${row('mdiEyeOutline', 'Qué se ve', segI('show', [['icono', 'Solo ícono', 'mdiShapeOutline'], ['texto', 'Solo texto', 'mdiFormatText'], ['ambos', 'Ícono y texto', 'mdiLabelOutline']], e.show, true))}`;
  h += `<div class="isec">Letra</div>${row('mdiFormatSize', 'Tamaño de letra', slider('fs', 9, 28, e.fs, ' px'))}${row('mdiFormatBold', 'Grosor', segI('fw', [['400', 'Normal'], ['500', 'Medio'], ['700', 'Negrita']], e.fw))}${row('mdiShapeOutline', 'Tamaño del ícono', slider('isz', 12, 48, e.isz, ' px'))}`;
  h += `<div class="isec">Color</div>${row('mdiFormatColorFill', 'Fondo', swatches('bg', e.bg, ['', 'none']))}${row('mdiFormatColorText', 'Letra e ícono', swatches('fg', e.fg, ['']))}${row('mdiBorderColor', 'Borde', swatches('bd', e.bd, ['']))}${['onoff', 'botones', 'escalones', 'ciclo'].includes(e.v) ? row('mdiPower', 'Color al estar activo', swatches('onBg', e.onBg, [''])) : ''}`;
  h += `<div class="isec">Forma</div>${row('mdiSquareRoundedOutline', 'Esquinas', `<div class="islider"><input type="range" min="0" max="40" value="${Math.min(40, e.rad)}" data-num="rad" aria-label="Esquinas"><button type="button" class="pillbtn" data-set="rad" data-val="999" aria-pressed="${e.rad >= 999}" title="Píldora">${ic('mdiCircleOutline', 'sm')}</button></div>`)}${row('mdiShapeOutline', 'Relieve', segI('relief', [['relieve', 'Con relieve'], ['plano', 'Plano'], ['contorno', 'Contorno']], e.relief))}`;
  if (!multi) h += `<div class="isec">Lugar</div>${row('mdiCursorMove', 'Columna, fila, ancho y alto', `<div class="xywh"><label>X${stepper('x', e.x, 1, R().cols)}</label><label>Y${stepper('y', e.y, 1, R().rows)}</label><label>${ic('mdiArrowLeftRight', 'sm')}${stepper('w', e.w, 1, R().cols)}</label><label>${ic('mdiArrowUpDown', 'sm')}${stepper('h', e.h, 1, R().rows)}</label></div>`)}`;
  return h;
}
function funcionRows(e) {
  const L = R().learned;
  let h = row(CATS[e.cat].icon, 'Tipo', segI('v', CATS[e.cat].variants.map(([v, t]) => [v, t]), e.v));
  if (e.cat === 'boton') {
    if (e.v === 'marca') h += row('mdiPlayBoxOutline', 'Marca', `<button type="button" class="chip wide" data-ds="brands">${brandMark(e.brand)}${esc(e.brand)}${ic('mdiChevronDown', 'sm')}</button>`);
    if (e.v === 'onoff') h += row('mdiPower', 'Encender', selL('send', e.send, L)) + row('mdiPowerOff', 'Apagar', selL('send2', e.send2, L, 'El mismo botón'));
    else if (e.v === 'secuencia') {
      h += `<div class="isec">Pasos</div><div class="seqs">${(e.seq ?? []).map((s, i) => s.wait !== undefined ? `<div class="seqr">${ic('mdiTimerSandEmpty', 'sm')}<label class="ms"><input type="number" min="50" max="10000" step="50" value="${s.wait}" data-seqwait="${i}" aria-label="Pausa"><span>ms</span></label>${ib('Quitar', 'mdiClose', `data-seqdel="${i}"`, 'sm')}</div>` : `<div class="seqr"><span class="sn">${i + 1}</span>${selL('', s.b, L, 'Botón', `data-seqb="${i}"`)}<label class="tm" title="Veces"><input type="number" min="1" max="10" value="${s.t}" data-seqt="${i}" aria-label="Veces"><span>×</span></label>${ib('Quitar', 'mdiClose', `data-seqdel="${i}"`, 'sm')}</div>`).join('')}</div><div class="chips">${`<button type="button" class="chip" data-ds="seqadd">${ic('mdiPlus', 'sm')}Botón</button><button type="button" class="chip" data-ds="seqwait">${ic('mdiTimerSandEmpty', 'sm')}Pausa</button>`}</div>`;
    } else h += row('mdiAccessPoint', 'Envía', selL('send', e.send, L));
    if (e.v === 'pulsador' || e.v === 'marca') h += row('mdiGestureTapHold', 'Al mantener apretado', segI('hold', [['nada', 'Nada'], ['repetir', 'Repite'], ['otro', 'Otro botón']], e.hold ?? 'nada')) + (e.hold === 'otro' ? row('mdiAccessPoint', 'Botón al mantener', selL('holdSend', e.holdSend, L)) : '');
  } else if (e.cat === 'niveles') {
    h += row('mdiSwapVertical', 'Sentido', segI('orient', [['v', 'Vertical', 'mdiArrowUpDown'], ['h', 'Horizontal', 'mdiArrowLeftRight']], e.orient, true));
    h += row('mdiNumeric', 'Valores', segI('values', [['num', 'Números'], ['nombres', 'Nombres']], e.values));
    h += e.values === 'num'
      ? row('mdiRuler', 'Desde, hasta, paso y unidad', `<div class="lvl4"><input aria-label="Desde" data-field="min" value="${e.min}"><input aria-label="Hasta" data-field="max" value="${e.max}"><input aria-label="Paso" data-field="step" value="${e.step}"><input aria-label="Unidad" data-field="unit" value="${esc(e.unit)}" placeholder="°"></div>`)
      : row('mdiFormatListBulleted', 'Niveles', `<div class="lvln">${e.levels.map((l, i) => `<span><input aria-label="Nivel ${i + 1}" data-level="${i}" value="${esc(l)}">${e.levels.length > 2 ? `<button type="button" data-lvldel="${i}" aria-label="Quitar">×</button>` : ''}</span>`).join('')}${ib('Agregar nivel', 'mdiPlus', 'data-ds="lvladd"', 'sm')}</div>`);
    h += row('mdiRepeat', 'Al llegar al final', segI('wrap', [['false', 'Frena'], ['true', 'Vuelve al inicio']], String(e.wrap)));
    h += row('mdiAccessPoint', 'Cómo envía', segI('sendBy', [['updown', 'Subir / bajar'], ['avanza', 'Uno que avanza'], ['nivel', 'Uno por nivel']], e.sendBy));
    if (e.sendBy === 'updown') h += row('mdiChevronUp', 'Subir', selL('up', e.up, L)) + row('mdiChevronDown', 'Bajar', selL('down', e.down, L));
    else if (e.sendBy === 'avanza') h += row('mdiChevronRight', 'Botón que avanza', selL('up', e.up, L));
    else h += Array.from({ length: Math.min(10, levelCount(e)) }, (_, i) => row('mdiNumeric', levelText(e, i), `<div class="lvlsend"><span>${esc(levelText(e, i))}</span>${selL('', e.lvl?.[i] ?? '', L, 'Botón', `data-lvlsend="${i}"`)}</div>`)).join('');
    h += row('mdiGestureTapHold', 'Al mantener apretado', segI('hold', [['nada', 'Nada'], ['repetir', 'Repite']], e.hold ?? 'nada'));
  } else if (e.cat === 'modos') {
    h += `<div class="isec">Opciones</div><div class="opts">${e.options.map((o, i) => `<div class="optr"><button type="button" class="ipick sm" data-opticon="${i}" title="Ícono">${ic(o.i, 'sm')}</button><input aria-label="Texto" data-opt="${i}" value="${esc(o.t)}">${selL('', o.s, L, 'Botón', `data-optsend="${i}"`)}${e.options.length > 2 ? ib('Quitar', 'mdiClose', `data-optdel="${i}"`, 'sm') : ''}</div>`).join('')}</div><button type="button" class="chip" data-ds="optadd">${ic('mdiPlus', 'sm')}Opción</button>`;
  } else if (e.cat === 'info') {
    if (['valor', 'grafico'].includes(e.v)) h += row('mdiHomeAssistant', 'Sensor de Home Assistant', selL('sensor', e.sensor, SENSORS));
    if (e.v === 'grafico') h += row('mdiClockOutline', 'Período', segI('period', [['1h', '1 h'], ['24h', '24 h'], ['7d', '7 días']], e.period ?? '24h'));
  } else {
    h += `<div class="isec">Botones aprendidos</div>${BLOCK_SLOTS[e.v].map(([k, t, i]) => `<div class="slotr">${i ? ic(i, 'sm') : e.v === 'colores' ? `<i class="cdot" style="--cc:${KEY_COLORS[k]}"></i>` : `<b class="sk">${esc(t)}</b>`}<span>${esc(t)}</span>${selL('', e.slots?.[k] ?? '', L, '—', `data-slot="${k}"`)}</div>`).join('')}`;
  }
  return h;
}
function muestraRows(e) {
  let h = '';
  if (e.cat === 'niveles') h += row('mdiNumeric', 'En el medio', segI('display', [['valor', 'Valor'], ['nombre', 'Nombre'], ['puntos', 'Puntos'], ['nada', 'Texto']], e.display)) + row('mdiFormatSize', 'Tamaño del valor', slider('vsz', 12, 40, e.vsz ?? 22, ' px'));
  h += row('mdiHomeAssistant', 'De dónde sale el estado', segI('stateFrom', [['enviado', 'Lo enviado'], ['sensor', 'Un sensor']], e.stateFrom ?? 'enviado'));
  if (e.stateFrom === 'sensor') h += row('mdiThermometer', 'Sensor', selL('stateSensor', e.stateSensor, SENSORS));
  h += row('mdiGestureTap', 'Al tocar', segI('anim', [['hundir', 'Se hunde'], ['destello', 'Destello'], ['nada', 'Nada']], e.anim));
  h += row('mdiFloorPlan', 'En el plano', `<div class="tline"><button type="button" class="chip" data-ds="toplan">${ic('mdiPinOutline', 'sm')}Pegar a un símbolo</button></div>`);
  return h;
}
function iconsPop(e) {
  const q = DS.iq.trim().toLowerCase();
  const list = ICONSET.filter(n => !q || n.toLowerCase().includes(q));
  return `<div class="ipop"><input class="tin" id="iq" placeholder="Buscar ícono" value="${esc(DS.iq)}" aria-label="Buscar ícono"><div class="igrid">${list.map(n => `<button type="button" data-icon="${n}" aria-pressed="${e.icon === n}" title="${n.slice(3)}">${ic(n)}</button>`).join('')}</div></div>`;
}
function brandsPop() {
  return `<div class="ipop">${BRANDS.map(([g, l]) => `<div class="egrp"><span>${esc(g)}</span><div class="bgrid">${l.map(b => `<button type="button" class="brand" data-brand="${esc(b[0])}" title="${esc(b[0])}">${brandMark(b[0])}<span>${esc(b[0])}</span></button>`).join('')}</div></div>`).join('')}</div>`;
}
function dupHtml() {
  const r = DS.r[DS.dup];
  return `<div class="veil" data-veil><div class="sheet" role="dialog" aria-label="Duplicar control"><h3>${ic('mdiContentDuplicate')}Duplicar «${esc(r.name)}»</h3><input class="tin" type="text" id="dupname" value="${esc(r.name.replace(/living/i, 'dormitorio'))}" aria-label="Nombre"><div class="irow" title="Emisor">${ic('mdiAccessPoint', 'sm')}<div class="chips"><button type="button" class="chip" aria-pressed="false" data-emit>Athom A</button><button type="button" class="chip" aria-pressed="true" data-emit>Athom B</button></div></div><div class="irow" title="Qué se copia">${ic('mdiContentCopy', 'sm')}<div class="seg"><button type="button" aria-pressed="true" data-copy>Diseño y botones</button><button type="button" aria-pressed="false" data-copy>Solo el diseño</button></div></div><div class="acts"><button type="button" class="btn" data-dupact="cancel">Cancelar</button><button type="button" class="btn primary" data-dupact="ok">Duplicar</button></div></div></div>`;
}

/* — lugar en la grilla — */
const clash = (x, y, w, h, skip = []) => x < 1 || y < 1 || x + w - 1 > R().cols || y + h - 1 > R().rows || R().els.some(e => !skip.includes(e.id) && x < e.x + e.w && e.x < x + w && y < e.y + e.h && e.y < y + h);
function freeSlot(w, h) {
  for (let y = 1; y <= R().rows; y++) for (let x = 1; x <= R().cols; x++) if (!clash(x, y, w, h)) return { x, y };
  R().rows += h;
  return { x: 1, y: R().rows - h + 1 };
}
function newEl(kind, val, at) {
  const r = R();
  let e;
  if (kind === 'brand') e = K({ cat: 'boton', v: 'marca', brand: val, text: val, send: r.learned.includes(val) ? val : '', w: 1, h: 1, rad: 12 });
  else if (kind === 'learned') e = K({ cat: 'boton', v: 'pulsador', text: val, icon: 'mdiGestureTap', show: 'texto', send: val, w: 1, h: 1, fs: 12 });
  else {
    const [cat, v] = val;
    const d = {
      boton: { text: v === 'marca' ? 'YouTube' : v === 'secuencia' ? 'Secuencia' : 'Botón', icon: { pulsador: 'mdiGestureTap', onoff: 'mdiPower', secuencia: 'mdiPlaylistPlay' }[v] ?? '', brand: 'YouTube', send: '', seq: [{ b: '', t: 1 }], hold: 'nada', w: v === 'secuencia' ? 2 : 1, h: 1, show: v === 'secuencia' ? 'ambos' : 'icono' },
      niveles: { text: 'Nivel', orient: v === 'masmenos' ? 'v' : 'h', values: 'num', min: 1, max: 5, step: 1, unit: '', levels: ['Baja', 'Media', 'Alta'], value: 1, wrap: false, display: 'valor', sendBy: 'updown', up: '', down: '', w: v === 'masmenos' ? 1 : v === 'perilla' ? 2 : 3, h: v === 'masmenos' ? 2 : v === 'perilla' ? 2 : 1, rad: v === 'masmenos' ? 999 : 14 },
      modos: { text: 'Modo', options: [{ t: 'Uno', i: 'mdiNumeric', s: '' }, { t: 'Dos', i: 'mdiNumeric', s: '' }, { t: 'Tres', i: 'mdiNumeric', s: '' }], value: 0, w: v === 'botones' ? 3 : 1, h: 1, fs: 11 },
      info: { text: v === 'titulo' ? 'Título' : v === 'grafico' ? 'Consumo' : 'Valor', sensor: '', w: v === 'titulo' || v === 'separador' ? R().cols : 2, h: 1 },
      bloque: { slots: {}, w: v === 'cruceta' || v === 'numeros' ? 3 : 3, h: v === 'cruceta' ? 3 : v === 'numeros' ? 4 : 1, rad: 999 },
    }[cat];
    e = K({ cat, v, ...d });
  }
  e.id = 'e' + DS.n++;
  e.w = Math.min(e.w, r.cols);
  const p = at && !clash(at.x, at.y, e.w, e.h) ? at : freeSlot(e.w, e.h);
  Object.assign(e, p);
  return e;
}
function cellAt(ev) {
  const rm = $('#rmt');
  const b = rm.getBoundingClientRect();
  const st = getComputedStyle(rm);
  const pad = parseFloat(st.paddingLeft), gap = R().gap, cell = 60;
  return { x: Math.max(1, Math.min(R().cols, Math.floor((ev.clientX - b.left - pad + gap / 2) / (cell + gap)) + 1)), y: Math.max(1, Math.min(R().rows, Math.floor((ev.clientY - b.top - parseFloat(st.paddingTop) + gap / 2) / (cell + gap)) + 1)) };
}
function autoLayout() {
  const r = R();
  const els = [...r.els].sort((a, b) => a.y - b.y || a.x - b.x);
  r.els = [];
  for (const e of els) { const p = freeSlot(e.w, e.h); Object.assign(e, p); r.els.push(e); }
  let max = 0;
  for (const e of r.els) max = Math.max(max, e.y + e.h - 1);
  r.rows = Math.max(2, max);
}
function flashSent(text, el) {
  DS.sent = text === '—' ? 'Ya está en el límite' : text ? `Envía ${text}` : '';
  paintCanvas();
  const k = $(`#rmt [data-el="${el.id}"]`);
  if (k && el.anim !== 'nada') { k.classList.add(el.anim === 'destello' ? 'flash' : 'press'); }
  clearTimeout(DS.sentT);
  DS.sentT = setTimeout(() => { DS.sent = ''; const s = $('.sent'); if (s) s.remove(); }, 1600);
}

function bindControles() {
  const app = $('#app');
  app.onclick = ev => {
    const t = ev.target;
    const top = t.closest('[data-top]');
    if (top) return top.dataset.top === 'theme' ? toggleTheme() : go('menu');
    const remote = t.closest('[data-remote]');
    if (remote) { DS.cur = remote.dataset.remote; DS.sel = []; DS.pop = null; DS.hist = []; DS.fut = []; return renderControles(); }
    const dupof = t.closest('[data-dupof]');
    if (dupof) { DS.dup = dupof.dataset.dupof; DS.pop = null; return renderControles(); }
    const dupact = t.closest('[data-dupact]');
    if (dupact) {
      if (dupact.dataset.dupact === 'ok') {
        const src = DS.r[DS.dup];
        const id = 'r' + DS.n++;
        DS.r[id] = { ...JSON.parse(JSON.stringify(src)), id, name: $('#dupname').value.trim() || `${src.name} copia` };
        DS.cur = id;
        DS.sel = [];
      }
      DS.dup = false;
      return renderControles();
    }
    const segb = t.closest('[data-copy],[data-emit]');
    if (segb) { $$(segb.dataset.copy !== undefined ? '[data-copy]' : '[data-emit]').forEach(b => b.setAttribute('aria-pressed', String(b === segb))); return; }
    if (t.closest('[data-veil]') && !t.closest('.sheet')) { DS.dup = false; return renderControles(); }
    if (DS.pop && !t.closest('.ipop,.rpop,[data-ds="icons"],[data-ds="brands"],[data-ds="remotes"]')) { DS.pop = null; return renderControles(); }
    const left = t.closest('[data-left]');
    if (left) { DS.left = left.dataset.left; return paintRes(); }
    const tab = t.closest('[data-tab]');
    if (tab) { DS.tab = tab.dataset.tab; return paintInsp(); }
    const th = t.closest('[data-theme]');
    if (th) { dsSave(); R().theme = th.dataset.theme; return renderControles(); }
    const icon = t.closest('[data-icon]');
    if (icon) { dsSave(); dsSel()[0].icon = icon.dataset.icon; DS.pop = null; return paintDesigner(); }
    const brand = t.closest('[data-brand]');
    if (brand) { dsSave(); const e = dsSel()[0]; e.brand = e.text = brand.dataset.brand; DS.pop = null; return paintDesigner(); }
    const add = t.closest('[data-drag]');
    if (add && !DS.test) {
      dsSave();
      const e = add.dataset.drag === 'variant' ? newEl('variant', [add.dataset.cat, add.dataset.val]) : newEl(add.dataset.drag, add.dataset.val);
      R().els.push(e);
      DS.sel = [e.id];
      DS.tab = add.dataset.drag === 'variant' && add.dataset.cat !== 'bloque' ? 'funcion' : 'aspecto';
      return paintDesigner();
    }
    const set = t.closest('[data-set]');
    if (set) {
      dsSave();
      let val = set.dataset.val;
      if (val === 'true' || val === 'false') val = val === 'true';
      const key = set.dataset.set;
      if (['fw'].includes(key)) val = Number(val);
      if (key === 'rad') val = Number(val);
      if (key === 'body') { R().body = val; return renderControles(); }
      for (const e of dsSel()) {
        e[key] = val;
        if (key === 'v' && e.cat === 'boton' && val === 'marca' && !e.brand) e.brand = e.text = 'YouTube';
        if (key === 'v' && e.cat === 'boton' && val === 'secuencia' && !e.seq) e.seq = [{ b: '', t: 1 }];
        if (key === 'v' && e.cat === 'niveles' && val === 'masmenos' && e.orient === 'h' && e.w > 2) { e.orient = 'h'; }
        if (key === 'values') e.value = e.values === 'num' ? e.min : 0;
        if (key === 'orient' && e.cat === 'niveles') { const w = e.w; e.w = Math.min(R().cols, e.h); e.h = w; if (clash(e.x, e.y, e.w, e.h, [e.id])) Object.assign(e, freeSlot(e.w, e.h)); }
      }
      return paintDesigner();
    }
    const step = t.closest('[data-step]');
    if (step) {
      dsSave();
      const k = step.dataset.step, d = Number(step.dataset.d);
      if (k === 'cols' || k === 'rows') { R()[k] = Math.max(2, R()[k] + d); return renderControles(); }
      const e = dsSel()[0];
      const next = { ...e, [k]: e[k] + d };
      if (!clash(next.x, next.y, next.w, next.h, [e.id])) Object.assign(e, next);
      return paintDesigner();
    }
    const opticon = t.closest('[data-opticon]');
    if (opticon) { dsSave(); const o = dsSel()[0].options[Number(opticon.dataset.opticon)]; o.i = ICONSET[(ICONSET.indexOf(o.i) + 1) % ICONSET.length]; return paintDesigner(); }
    const optdel = t.closest('[data-optdel]');
    if (optdel) { dsSave(); const e = dsSel()[0]; e.options.splice(Number(optdel.dataset.optdel), 1); e.value = 0; return paintDesigner(); }
    const seqdel = t.closest('[data-seqdel]');
    if (seqdel) { dsSave(); dsSel()[0].seq.splice(Number(seqdel.dataset.seqdel), 1); return paintDesigner(); }
    const lvldel = t.closest('[data-lvldel]');
    if (lvldel) { dsSave(); const e = dsSel()[0]; e.levels.splice(Number(lvldel.dataset.lvldel), 1); e.value = 0; return paintDesigner(); }
    const ds = t.closest('[data-ds]');
    if (ds) {
      const k = ds.dataset.ds;
      const e = dsSel()[0];
      if (k === 'back' || k === 'done') return go('menu');
      if (k === 'design' || k === 'test') { DS.test = k === 'test'; DS.sel = DS.test ? [] : DS.sel; return renderControles(); }
      if (k === 'undo' && DS.hist.length) { DS.fut.push(JSON.stringify(DS.r)); DS.r = JSON.parse(DS.hist.pop()); DS.sel = DS.sel.filter(elById); return renderControles(); }
      if (k === 'redo' && DS.fut.length) { DS.hist.push(JSON.stringify(DS.r)); DS.r = JSON.parse(DS.fut.pop()); return renderControles(); }
      if (k === 'auto') { dsSave(); autoLayout(); return renderControles(); }
      if (k === 'dup') { DS.dup = DS.cur; return renderControles(); }
      if (k === 'remotes') { DS.pop = DS.pop === 'remotes' ? null : 'remotes'; return renderControles(); }
      if (k === 'icons' || k === 'brands') { DS.pop = DS.pop === k ? null : k; DS.iq = ''; return paintInsp(); }
      if (k === 'learn') return toast('Abre Aprender, con este control elegido');
      if (k === 'toplan') return go('pegados');
      if (k === 'eldup') { dsSave(); const copies = dsSel().map(x => { const c = { ...JSON.parse(JSON.stringify(x)), id: 'e' + DS.n++ }; Object.assign(c, freeSlot(c.w, c.h)); return c; }); R().els.push(...copies); DS.sel = copies.map(c => c.id); return paintDesigner(); }
      if (k === 'eldel') { dsSave(); R().els = R().els.filter(x => !DS.sel.includes(x.id)); DS.sel = []; return paintDesigner(); }
      if (k === 'seqadd') { dsSave(); e.seq.push({ b: '', t: 1 }); return paintDesigner(); }
      if (k === 'seqwait') { dsSave(); e.seq.push({ wait: 500 }); return paintDesigner(); }
      if (k === 'optadd') { dsSave(); e.options.push({ t: 'Nueva', i: 'mdiNumeric', s: '' }); return paintDesigner(); }
      if (k === 'lvladd') { dsSave(); e.levels.push(`Nivel ${e.levels.length + 1}`); return paintDesigner(); }
    }
    // En modo prueba, tocar el control envía.
    const elEl = t.closest('#rmt [data-el]');
    if (elEl && DS.test) {
      const e = elById(elEl.dataset.el);
      const op = t.closest('[data-op]');
      if (op) flashSent(operateEl(e, op.dataset.op, op.dataset.v), e);
    }
  };
  app.oninput = ev => {
    const t = ev.target;
    if (t.id === 'bq' || t.id === 'iq') {
      DS[t.id] = t.value;
      const pos = t.selectionStart;
      if (t.id === 'bq') paintRes(); else paintInsp();
      const q = $('#' + t.id); q.focus(); q.setSelectionRange(pos, pos);
      return;
    }
    if (t.dataset.rname !== undefined) { R().name = t.value; const b = $('.rpick b'); if (b) b.textContent = t.value; return; }
    const e = dsSel()[0];
    if (t.dataset.num) {
      const k = t.dataset.num, v = Number(t.value);
      if (['gap', 'rrad'].includes(k)) R()[k] = v; else for (const x of dsSel()) x[k] = v;
      const out = t.parentElement.querySelector('output');
      if (out) out.textContent = v + (k === 'gap' || k === 'rrad' || k !== 'rad' ? ' px' : '');
      return paintCanvas();
    }
    if (!e) return;
    if (t.dataset.field) {
      const k = t.dataset.field;
      e[k] = ['min', 'max', 'step'].includes(k) ? Number(t.value) || 0 : t.value;
      if (['min', 'max', 'step'].includes(k)) e.value = Math.min(e.max, Math.max(e.min, e.value));
      if (k === 'text') { const b = $('.ihead b'); if (b) b.firstChild.textContent = t.value; }
    } else if (t.dataset.level !== undefined) e.levels[Number(t.dataset.level)] = t.value;
    else if (t.dataset.opt !== undefined) e.options[Number(t.dataset.opt)].t = t.value;
    else if (t.dataset.seqt !== undefined) e.seq[Number(t.dataset.seqt)].t = Number(t.value) || 1;
    else if (t.dataset.seqwait !== undefined) e.seq[Number(t.dataset.seqwait)].wait = Number(t.value) || 0;
    else if (t.dataset.color) { const k = t.dataset.color; if (k === 'body') R().body = t.value; else for (const x of dsSel()) x[k] = t.value; }
    else return;
    paintCanvas();
  };
  app.onchange = ev => {
    const t = ev.target;
    const e = dsSel()[0];
    if (!e) return;
    if (t.dataset.optsend !== undefined) e.options[Number(t.dataset.optsend)].s = t.value;
    else if (t.dataset.seqb !== undefined) e.seq[Number(t.dataset.seqb)].b = t.value;
    else if (t.dataset.slot) (e.slots ??= {})[t.dataset.slot] = t.value;
    else if (t.dataset.lvlsend !== undefined) (e.lvl ??= [])[Number(t.dataset.lvlsend)] = t.value;
    else if (t.classList.contains('isel') && t.dataset.field) e[t.dataset.field] = t.value;
    else return;
    paintRes();
  };
  // Arrastrar desde la izquierda al control (o un botón aprendido sobre un elemento).
  app.ondragstart = ev => {
    const d = ev.target.closest?.('[data-drag]');
    if (!d || DS.test) return;
    DS.dragging = { kind: d.dataset.drag, val: d.dataset.drag === 'variant' ? [d.dataset.cat, d.dataset.val] : d.dataset.val };
    ev.dataTransfer.setData('text/plain', 'hm');
    ev.dataTransfer.effectAllowed = 'copy';
  };
  app.ondragover = ev => {
    if (!DS.dragging || !ev.target.closest?.('#rmt')) return;
    ev.preventDefault();
    const c = cellAt(ev);
    const probe = DS.dragging.kind === 'variant' ? newEl('variant', DS.dragging.val) : { w: 1, h: 1 };
    DS.n--;
    const onEl = ev.target.closest('[data-el]');
    const ok = DS.dragging.kind === 'learned' && onEl ? true : !clash(c.x, c.y, probe.w, probe.h);
    const g = { x: c.x, y: c.y, w: Math.min(probe.w, R().cols), h: probe.h, ok };
    if (JSON.stringify(g) !== JSON.stringify(DS.ghost)) { DS.ghost = g; paintCanvas(); }
  };
  app.ondragleave = ev => { if (ev.target.id === 'dstage') { DS.ghost = null; paintCanvas(); } };
  app.ondrop = ev => {
    if (!DS.dragging) return;
    ev.preventDefault();
    const onEl = ev.target.closest?.('#rmt [data-el]');
    dsSave();
    if (DS.dragging.kind === 'learned' && onEl) {
      const e = elById(onEl.dataset.el);
      if (e.cat === 'boton') e.send = DS.dragging.val; else if (e.cat === 'niveles') { if (!e.up) e.up = DS.dragging.val; else e.down = DS.dragging.val; }
      DS.sel = [e.id];
      DS.tab = 'funcion';
    } else if (ev.target.closest?.('#rmt') && DS.ghost?.ok) {
      const e = newEl(DS.dragging.kind, DS.dragging.val, { x: DS.ghost.x, y: DS.ghost.y });
      R().els.push(e);
      DS.sel = [e.id];
    }
    DS.dragging = null;
    DS.ghost = null;
    paintDesigner();
  };
  app.ondragend = () => { DS.dragging = null; if (DS.ghost) { DS.ghost = null; paintCanvas(); } };
  // Mover y agrandar dentro del control.
  app.onpointerdown = ev => {
    if (DS.test || !ev.target.closest?.('#rmt')) return;
    const kh = ev.target.closest('[data-kh]');
    const elEl = ev.target.closest('[data-el]');
    if (ev.target.closest('.kmini')) return;
    if (kh) {
      const e = dsSel()[0];
      DS.drag = { kind: 'resize', h: kh.dataset.kh, e, w0: e.w, h0: e.h, c0: cellAt(ev), saved: false };
    } else if (elEl) {
      const id = elEl.dataset.el;
      if (ev.shiftKey) DS.sel = DS.sel.includes(id) ? DS.sel.filter(x => x !== id) : [...DS.sel, id];
      else if (!DS.sel.includes(id)) { DS.sel = [id]; DS.tab = 'aspecto'; }
      DS.drag = { kind: 'move', c0: cellAt(ev), start: dsSel().map(e => ({ id: e.id, x: e.x, y: e.y })), saved: false };
      paintInsp();
    } else { DS.sel = []; paintInsp(); }
    ev.preventDefault();
    paintCanvas();
  };
  app.onpointermove = ev => {
    const d = DS.drag;
    if (!d) return;
    const c = cellAt(ev);
    if (d.kind === 'move') {
      const dx = c.x - d.c0.x, dy = c.y - d.c0.y;
      const ids = d.start.map(s => s.id);
      const ok = d.start.every(s => { const e = elById(s.id); return !clash(s.x + dx, s.y + dy, e.w, e.h, ids); });
      if (!ok) return;
      if ((dx || dy) && !d.saved) { dsSave(); d.saved = true; }
      for (const s of d.start) Object.assign(elById(s.id), { x: s.x + dx, y: s.y + dy });
    } else {
      const e = d.e;
      const w = d.h.includes('e') ? Math.max(1, d.w0 + c.x - d.c0.x) : e.w;
      const h = d.h.includes('s') ? Math.max(1, d.h0 + c.y - d.c0.y) : e.h;
      if (clash(e.x, e.y, w, h, [e.id])) return;
      if ((w !== e.w || h !== e.h) && !d.saved) { dsSave(); d.saved = true; }
      e.w = w; e.h = h;
    }
    paintCanvas();
  };
  app.onpointerup = () => { if (DS.drag) { DS.drag = null; paintInsp(); } };
}
function dsKeys(ev) {
  if (screen !== 'controles' || ev.type !== 'keydown' || ev.target.closest?.('input,select,textarea')) return;
  const k = ev.key.toLowerCase(), ctrl = ev.ctrlKey || ev.metaKey;
  if (ctrl && k === 'z') { ev.preventDefault(); $(ev.shiftKey ? '[data-ds="redo"]' : '[data-ds="undo"]')?.click(); }
  else if (ctrl && k === 'd' && DS.sel.length) { ev.preventDefault(); $('[data-ds="eldup"]')?.click(); }
  else if ((k === 'delete' || k === 'backspace') && DS.sel.length) { ev.preventDefault(); $('[data-ds="eldel"]')?.click(); }
  else if (k === 'escape') { DS.sel = []; DS.pop = null; paintDesigner(); }
  else if (k.startsWith('arrow') && DS.sel.length) {
    ev.preventDefault();
    const [dx, dy] = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
    const ids = DS.sel;
    if (dsSel().every(e => !clash(e.x + dx, e.y + dy, e.w, e.h, ids))) { dsSave(); for (const e of dsSel()) { e.x += dx; e.y += dy; } paintDesigner(); }
  }
}
document.addEventListener('keydown', dsKeys);
