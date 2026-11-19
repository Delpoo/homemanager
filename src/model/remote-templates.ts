/**
 * 0.14 · starting designs for a new remote (stage 3).
 *
 * Each appliance has three designs drawn on a 4-column grid: Clásico (like the real
 * remote, buttons only), Moderno (one big piece to slide and the options in sight) and
 * Avanzado (the same buttons plus readings and charts, the little-used ones behind a
 * button). A template does not know any learned button: every piece points at a button
 * the control waits for (`canvas.wanted`), named as on the remote. Learning a button with
 * that name puts it in place (see `resolveWanted`), so the same learned buttons work in
 * any of the three designs.
 */
import type { ControlPiece } from './control-layout.js';

export type ApplianceKind = 'ac' | 'tv' | 'light' | 'fan' | 'cover';
export type StartDesign = 'classic' | 'modern' | 'advanced';
export type Wanted = { id: string; name: string; icon?: string | null };

export const APPLIANCES: [ApplianceKind, string, string][] = [
  ['ac', 'Aire', 'mdi:air-conditioner'],
  ['tv', 'Tele', 'mdi:television'],
  ['light', 'Luz', 'mdi:lightbulb-outline'],
  ['fan', 'Ventilador', 'mdi:ceiling-fan'],
  ['cover', 'Cortina', 'mdi:roller-shade'],
];
export const DESIGNS: [StartDesign, string, string, string][] = [
  ['classic', 'Clásico', 'Como el control de verdad: sólo botones.', 'mdi:gesture-tap-button'],
  ['modern', 'Moderno', 'Una pieza grande para deslizar y las opciones a la vista.', 'mdi:tune-vertical'],
  [
    'advanced',
    'Avanzado',
    'Otra idea del mismo control: datos, gráficas y lo poco usado a un toque.',
    'mdi:chart-line',
  ],
];

/** How the screens name a template's buttons and pieces (their language); ids stay the Spanish ones. */
let localName: (name: string) => string = name => name;
export function setTemplateNames(translate: (name: string) => string): void {
  localName = translate;
}

/** The id of a waited button: the same name gives the same id in every design. */
export function wantedId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[+]/g, ' mas ')
    .replace(/[−-]/g, ' menos ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `w-${slug || 'boton'}`.slice(0, 64);
}

/** Symbols of the buttons a template asks for. */
const ICONS: Record<string, string> = {
  'Encender / apagar': 'mdi:power',
  'Temperatura +': 'mdi:plus',
  'Temperatura −': 'mdi:minus',
  Frío: 'mdi:snowflake',
  Calor: 'mdi:fire',
  Seco: 'mdi:water-percent',
  'Sólo ventilar': 'mdi:fan',
  Automático: 'mdi:autorenew',
  'Ventilación automática': 'mdi:fan-auto',
  'Ventilación baja': 'mdi:fan-speed-1',
  'Ventilación media': 'mdi:fan-speed-2',
  'Ventilación alta': 'mdi:fan-speed-3',
  'Lamas automático': 'mdi:arrow-oscillating',
  'Lamas oscilan': 'mdi:arrow-oscillating',
  Eco: 'mdi:leaf',
  Turbo: 'mdi:flash',
  Temporizador: 'mdi:timer-outline',
  'Apagar a las': 'mdi:timer-off-outline',
  'Prender a las': 'mdi:timer-outline',
  'Favorito (Smart set)': 'mdi:star-outline',
  'Hora +': 'mdi:clock-plus-outline',
  'Hora −': 'mdi:clock-minus-outline',
  Ambilight: 'mdi:television-ambient-light',
  Apps: 'mdi:apps',
  Fuentes: 'mdi:import',
  Guía: 'mdi:television-guide',
  Info: 'mdi:information-outline',
  Volver: 'mdi:arrow-u-left-top',
  Inicio: 'mdi:home-outline',
  Menú: 'mdi:menu',
  Salir: 'mdi:exit-to-app',
  Silencio: 'mdi:volume-off',
  'Volumen +': 'mdi:volume-plus',
  'Volumen −': 'mdi:volume-minus',
  'Canal +': 'mdi:chevron-up',
  'Canal −': 'mdi:chevron-down',
  Pausa: 'mdi:pause',
  Parar: 'mdi:stop',
  Audiodescripción: 'mdi:account-voice',
  Ajustes: 'mdi:cog-outline',
  'Brillo +': 'mdi:brightness-7',
  'Brillo −': 'mdi:brightness-5',
  'Más cálido': 'mdi:white-balance-incandescent',
  'Más frío': 'mdi:white-balance-sunny',
  Noche: 'mdi:weather-night',
  'Velocidad +': 'mdi:plus',
  'Velocidad −': 'mdi:minus',
  Modo: 'mdi:format-list-bulleted',
  Girar: 'mdi:rotate-3d-variant',
  'Invierno / verano': 'mdi:sun-snowflake-variant',
  Abrir: 'mdi:arrow-up',
  Cerrar: 'mdi:arrow-down',
  Favorita: 'mdi:star-outline',
  'Inclinar +': 'mdi:angle-acute',
  'Inclinar −': 'mdi:angle-obtuse',
};
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const AC_MODES: [string, string, string, string][] = [
  ['Frío', 'mdi:snowflake', '#3F7FBF', 'spin'],
  ['Calor', 'mdi:fire', '#D98B1F', 'flicker'],
  ['Seco', 'mdi:water-percent', '#4F7A5A', 'bob'],
  ['Sólo ventilar', 'mdi:fan', '#6F6BB8', 'spinslow'],
  ['Automático', 'mdi:autorenew', '#5F6E66', 'pulse'],
];
const AC_FAN = ['Ventilación automática', 'Ventilación baja', 'Ventilación media', 'Ventilación alta'];
const AC_VANES = ['Lamas automático', 'Lamas 1', 'Lamas 2', 'Lamas 3', 'Lamas 4', 'Lamas 5', 'Lamas oscilan'];

/** Builds one design: pieces in order, then the canvas that lists what it waits for. */
class Draw {
  private pieces: ControlPiece[] = [];
  private names: string[] = [];
  private taken = new Set<string>();
  private want(names: string[]): string[] {
    for (const name of names) if (!this.names.includes(name)) this.names.push(name);
    return names.map(wantedId);
  }
  private id(base: string): string {
    let id = base;
    for (let i = 2; this.taken.has(id); i++) id = `${base}-${i}`;
    this.taken.add(id);
    return id;
  }
  put(
    type: ControlPiece['type'],
    at: [number, number, number, number],
    names: string[],
    extra: Partial<ControlPiece> = {},
    base: string = type,
  ): this {
    const [x, y, w, h] = at;
    this.pieces.push({
      id: this.id(base),
      type,
      x,
      y,
      w,
      h,
      buttons: this.want(names),
      label: null,
      icon: null,
      ...extra,
    } as ControlPiece);
    return this;
  }
  /** A single button with its name and symbol. */
  key(name: string, at: [number, number, number, number], extra: Partial<ControlPiece> = {}): this {
    return this.put('button', at, [name], { icon: ICONS[name] ?? null, ...extra }, wantedId(name).slice(2));
  }
  /** A button that turns something on and off (one key on the remote). */
  lamp(name: string, at: [number, number, number, number]): this {
    return this.put(
      'toggle',
      at,
      [name],
      { label: name, icon: ICONS[name] ?? null, form: 'lamp' },
      wantedId(name).slice(2),
    );
  }
  brand(name: string, at: [number, number, number, number]): this {
    return this.put(
      'button',
      at,
      [name],
      { label: name, brand: name, radius: 12, hideLabel: true },
      wantedId(name).slice(2),
    );
  }
  /** Options: each one sends its own button. */
  options(
    names: string[],
    at: [number, number, number, number],
    extra: Partial<ControlPiece> = {},
    look?: [string, string, string, string][],
  ): this {
    const options = names.map((name, i) => {
      const style = look?.[i];
      return {
        label: name.replace(/^(Ventilación|Lamas) /, ''),
        icon: style?.[1] ?? ICONS[name] ?? null,
        ...(style ? { color: style[2], anim: style[3] as never } : {}),
      };
    });
    return this.put('modes', at, names, { options, ...extra }, 'options');
  }
  /** Up and down with two buttons: «Sólo sube y baja», or numbers when the values are known. */
  level(
    down: string,
    up: string,
    at: [number, number, number, number],
    extra: Partial<ControlPiece> = {},
    type: ControlPiece['type'] = 'updown',
  ): this {
    // The guide asks «+» before «−», as on the remote; the piece keeps [down, up].
    this.want([up, down]);
    return this.put(type, at, [down, up], { sendBy: 'updown', ...extra }, 'level');
  }
  block(
    type: 'dpad' | 'numpad' | 'transport' | 'colors',
    slots: Record<string, string>,
    at: [number, number, number, number],
    extra: Partial<ControlPiece> = {},
  ): this {
    const names = Object.values(slots);
    return this.put(
      type,
      at,
      names,
      { slots: Object.fromEntries(Object.entries(slots).map(([slot, name]) => [slot, wantedId(name)])), ...extra },
      type,
    );
  }
  info(
    type: 'indicator' | 'graph',
    at: [number, number, number, number],
    label: string,
    extra: Partial<ControlPiece> = {},
  ): this {
    return this.put(type, at, [], { label, ...extra }, type);
  }
  done(): ControlPiece[] {
    const rows = Math.max(2, ...this.pieces.map(piece => piece.y + piece.h));
    const wanted = this.names.map(name => ({
      id: wantedId(name),
      name,
      ...(ICONS[name] ? { icon: ICONS[name] } : {}),
    }));
    return [
      {
        id: 'canvas',
        type: 'canvas',
        x: 0,
        y: 0,
        w: 4,
        h: rows,
        buttons: [],
        label: null,
        icon: null,
        wanted,
      } as ControlPiece,
      ...this.pieces,
    ];
  }
}

const TEMP = { values: { min: 16, max: 30, step: 1, unit: '°' }, label: 'Temperatura' };
const NUMPAD = Object.fromEntries([...DIGITS.map(d => [d, `Número ${d}`])]);

function ac(design: StartDesign): ControlPiece[] {
  const d = new Draw();
  if (design === 'classic')
    return d
      .key('Encender / apagar', [0, 0, 1, 1], { form: 'round' })
      .level('Temperatura −', 'Temperatura +', [1, 0, 2, 1], { label: 'Temperatura' })
      .key('Eco', [3, 0, 1, 1])
      .options(
        AC_MODES.map(([name]) => name),
        [0, 1, 4, 1],
        { label: 'Modo' },
        AC_MODES,
      )
      .options(AC_FAN, [0, 2, 4, 1], { label: 'Ventilación' })
      .key('Apagar a las', [0, 3, 2, 1])
      .key('Prender a las', [2, 3, 2, 1])
      .options(AC_VANES, [0, 4, 4, 1], { label: 'Lamas' })
      .key('Turbo', [0, 5, 1, 1])
      .key('Favorito (Smart set)', [1, 5, 1, 1], { label: 'Favorito' })
      .level('Hora −', 'Hora +', [2, 5, 2, 1], { label: 'Hora' })
      .done();
  if (design === 'modern')
    return d
      .key('Encender / apagar', [0, 0, 1, 1], { form: 'round' })
      .lamp('Eco', [1, 0, 1, 1])
      .lamp('Turbo', [2, 0, 1, 1])
      .key('Temporizador', [3, 0, 1, 1], { form: 'round' })
      .level('Temperatura −', 'Temperatura +', [0, 1, 4, 3], { ...TEMP, form: 'thermo' }, 'slider')
      .options(
        AC_MODES.map(([name]) => name),
        [0, 4, 4, 1],
        { label: 'Modo', form: 'segment' },
        AC_MODES,
      )
      .options(AC_FAN, [0, 5, 2, 1], { label: 'Ventilación', form: 'bars', icon: 'mdi:fan' })
      .options(AC_VANES, [2, 5, 2, 1], { label: 'Lamas', form: 'bars', icon: 'mdi:arrow-oscillating' })
      .done();
  return d
    .info('indicator', [0, 0, 3, 1], 'Adentro', { form: 'display' })
    .key('Encender / apagar', [3, 0, 1, 1], { form: 'round' })
    .level('Temperatura −', 'Temperatura +', [0, 1, 4, 3], { ...TEMP, form: 'thermo' }, 'slider')
    .options(
      AC_MODES.map(([name]) => name),
      [0, 4, 4, 1],
      { label: 'Modo', form: 'segment' },
      AC_MODES,
    )
    .options(AC_FAN, [0, 5, 2, 1], { label: 'Ventilación', form: 'bars', icon: 'mdi:fan' })
    .options(AC_VANES, [2, 5, 2, 1], { label: 'Lamas', form: 'bars', icon: 'mdi:arrow-oscillating' })
    .key('Temporizador', [0, 6, 2, 1])
    .lamp('Eco', [2, 6, 1, 1])
    .lamp('Turbo', [3, 6, 1, 1])
    .info('graph', [0, 7, 4, 2], 'Consumo', { period: '24h' })
    .done();
}

function tv(design: StartDesign): ControlPiece[] {
  const d = new Draw();
  const dpad = { up: 'Arriba', down: 'Abajo', left: 'Izquierda', right: 'Derecha', ok: 'OK' };
  const media = { rew: 'Retroceder', play: 'Reproducir', ff: 'Adelantar' };
  const colors = { red: 'Rojo', green: 'Verde', yellow: 'Amarillo', blue: 'Azul' };
  const apps = (y: number) =>
    d
      .brand('Netflix', [0, y, 1, 1])
      .brand('YouTube', [1, y, 1, 1])
      .brand('Prime Video', [2, y, 1, 1])
      .key('Apps', [3, y, 1, 1]);
  if (design === 'classic') {
    d.key('Encender / apagar', [0, 0, 1, 1], { form: 'round' }).key('Ambilight', [1, 0, 1, 1]);
    apps(1);
    return d
      .key('Fuentes', [2, 0, 1, 1])
      .key('Ajustes', [3, 0, 1, 1])
      .key('Guía', [0, 2, 1, 1])
      .key('Info', [1, 2, 1, 1])
      .key('Menú', [2, 2, 1, 1])
      .key('Salir', [3, 2, 1, 1])
      .block('dpad', dpad, [0, 3, 3, 3])
      .key('Volver', [3, 3, 1, 1])
      .key('Inicio', [3, 4, 1, 1])
      .key('Silencio', [3, 5, 1, 1])
      .block('transport', media, [0, 6, 3, 1])
      .key('Pausa', [3, 6, 1, 1])
      .key('Parar', [0, 7, 1, 1])
      .block('colors', colors, [1, 7, 3, 1])
      .level('Volumen −', 'Volumen +', [0, 8, 1, 2], { label: 'Vol', orientation: 'vertical' })
      .level('Canal −', 'Canal +', [3, 8, 1, 2], { label: 'CH', orientation: 'vertical' })
      .key('Audiodescripción', [1, 8, 2, 1], { label: 'AD' })
      .block('numpad', NUMPAD, [0, 10, 3, 4])
      .done();
  }
  if (design === 'modern') {
    d.key('Encender / apagar', [0, 0, 1, 1], { form: 'round' })
      .key('Ambilight', [1, 0, 1, 1])
      .key('Fuentes', [2, 0, 1, 1])
      .key('Guía', [3, 0, 1, 1]);
    apps(1);
    return d
      .block('dpad', dpad, [0, 2, 3, 3])
      .key('Volver', [3, 2, 1, 1], { form: 'round' })
      .key('Inicio', [3, 3, 1, 1], { form: 'round' })
      .key('Menú', [3, 4, 1, 1], { form: 'round' })
      .level('Volumen −', 'Volumen +', [0, 5, 1, 2], { label: 'Vol', orientation: 'vertical' })
      .block('transport', media, [1, 5, 2, 1])
      .key('Pausa', [1, 6, 1, 1], { form: 'round' })
      .level('Canal −', 'Canal +', [3, 5, 1, 2], { label: 'CH', orientation: 'vertical' })
      .key('Silencio', [2, 6, 1, 1], { form: 'round' })
      .block('numpad', NUMPAD, [0, 7, 1, 1], { form: 'pop' })
      .key('Audiodescripción', [1, 7, 1, 1], { label: 'AD' })
      .key('Ajustes', [2, 7, 1, 1])
      .key('Info', [3, 7, 1, 1])
      .block('colors', colors, [0, 8, 2, 1], { form: 'pop' })
      .key('Salir', [2, 8, 1, 1])
      .key('Parar', [3, 8, 1, 1])
      .done();
  }
  d.key('Encender / apagar', [0, 0, 1, 1], { form: 'round' }).key('Ambilight', [1, 0, 1, 1]);
  apps(1);
  return d
    .block('dpad', dpad, [0, 2, 3, 3])
    .key('Volver', [3, 2, 1, 1], { form: 'round' })
    .key('Inicio', [3, 3, 1, 1], { form: 'round' })
    .key('Menú', [3, 4, 1, 1], { form: 'round' })
    .key('Fuentes', [2, 0, 2, 1])
    .level('Volumen −', 'Volumen +', [0, 5, 3, 1], { label: 'Volumen' })
    .key('Silencio', [3, 5, 1, 1], { form: 'round' })
    .level('Canal −', 'Canal +', [0, 6, 2, 1], { label: 'Canal' })
    .block('numpad', NUMPAD, [2, 6, 1, 1], { form: 'pop' })
    .key('Audiodescripción', [3, 6, 1, 1], { label: 'AD' })
    .key('Ajustes', [0, 7, 1, 1])
    .key('Guía', [1, 7, 1, 1])
    .key('Info', [2, 7, 1, 1])
    .key('Salir', [3, 7, 1, 1])
    .key('Pausa', [0, 8, 1, 1])
    .key('Parar', [1, 8, 1, 1])
    .block('colors', colors, [2, 8, 1, 1], { form: 'pop' })
    .block('transport', media, [3, 8, 1, 1], { form: 'pop' })
    .info('graph', [0, 9, 4, 2], 'Consumo', { period: '7d' })
    .done();
}

function light(design: StartDesign): ControlPiece[] {
  const d = new Draw();
  if (design === 'classic')
    return d
      .key('Encender / apagar', [0, 0, 2, 1])
      .key('Noche', [2, 0, 1, 1])
      .key('Temporizador', [3, 0, 1, 1])
      .level('Brillo −', 'Brillo +', [0, 1, 2, 1], { label: 'Brillo' })
      .level('Más frío', 'Más cálido', [2, 1, 2, 1], { label: 'Tono' })
      .done();
  if (design === 'modern')
    return d
      .put(
        'toggle',
        [0, 0, 2, 1],
        ['Encender / apagar'],
        { label: 'Luz', icon: 'mdi:lightbulb-outline', form: 'switch' },
        'power',
      )
      .key('Noche', [2, 0, 1, 1], { form: 'round' })
      .key('Temporizador', [3, 0, 1, 1], { form: 'round' })
      .level('Brillo −', 'Brillo +', [0, 1, 1, 3], {
        label: 'Brillo',
        orientation: 'vertical',
        icon: 'mdi:brightness-6',
      })
      .level('Más frío', 'Más cálido', [1, 1, 3, 1], { label: 'Tono', icon: 'mdi:thermometer' })
      .done();
  return d
    .put(
      'toggle',
      [0, 0, 2, 1],
      ['Encender / apagar'],
      { label: 'Luz', icon: 'mdi:lightbulb-outline', form: 'switch' },
      'power',
    )
    .info('indicator', [2, 0, 2, 1], 'Consumo', { form: 'display' })
    .level('Brillo −', 'Brillo +', [0, 1, 4, 1], { label: 'Brillo', icon: 'mdi:brightness-6' })
    .level('Más frío', 'Más cálido', [0, 2, 4, 1], { label: 'Tono', icon: 'mdi:thermometer' })
    .key('Noche', [0, 3, 2, 1])
    .key('Temporizador', [2, 3, 2, 1])
    .info('graph', [0, 4, 4, 2], 'Consumo', { period: '7d' })
    .done();
}

function fan(design: StartDesign): ControlPiece[] {
  const d = new Draw();
  if (design === 'classic')
    return d
      .key('Encender / apagar', [0, 0, 1, 1], { form: 'round' })
      .level('Velocidad −', 'Velocidad +', [1, 0, 2, 1], { label: 'Velocidad' })
      .key('Modo', [3, 0, 1, 1])
      .key('Girar', [0, 1, 1, 1])
      .key('Invierno / verano', [1, 1, 2, 1])
      .key('Temporizador', [3, 1, 1, 1])
      .done();
  if (design === 'modern')
    return d
      .key('Encender / apagar', [0, 0, 1, 1], { form: 'round' })
      .level('Velocidad −', 'Velocidad +', [1, 0, 3, 1], { label: 'Velocidad', icon: 'mdi:fan' })
      .lamp('Girar', [0, 1, 1, 1])
      .lamp('Invierno / verano', [1, 1, 1, 1])
      .key('Temporizador', [2, 1, 2, 1])
      .key('Modo', [0, 2, 4, 1])
      .done();
  return d
    .key('Encender / apagar', [0, 0, 1, 1], { form: 'round' })
    .level('Velocidad −', 'Velocidad +', [1, 0, 3, 1], { label: 'Velocidad', icon: 'mdi:fan' })
    .lamp('Girar', [0, 1, 1, 1])
    .lamp('Invierno / verano', [1, 1, 1, 1])
    .key('Modo', [2, 1, 1, 1])
    .key('Temporizador', [3, 1, 1, 1])
    .info('indicator', [0, 2, 4, 1], 'Consumo', { form: 'display' })
    .info('graph', [0, 3, 4, 2], 'Consumo', { period: '7d' })
    .done();
}

function cover(design: StartDesign): ControlPiece[] {
  const d = new Draw();
  if (design === 'classic')
    return d
      .key('Abrir', [0, 0, 1, 1])
      .key('Parar', [1, 0, 1, 1])
      .key('Cerrar', [2, 0, 1, 1])
      .key('Favorita', [3, 0, 1, 1])
      .level('Inclinar −', 'Inclinar +', [0, 1, 2, 1], { label: 'Inclinar' })
      .done();
  if (design === 'modern')
    return d
      .put(
        'slider',
        [0, 0, 2, 3],
        ['Cerrar', 'Abrir'],
        { label: 'Cortina', names: ['Cerrada', 'Abierta'], sendBy: 'level', form: 'window' },
        'window',
      )
      .key('Abrir', [2, 0, 1, 1], { form: 'round' })
      .key('Favorita', [3, 0, 1, 1], { form: 'round' })
      .key('Parar', [2, 1, 1, 1], { form: 'round' })
      .key('Cerrar', [2, 2, 1, 1], { form: 'round' })
      .level('Inclinar −', 'Inclinar +', [3, 1, 1, 2], { label: 'Inclinar', orientation: 'vertical' })
      .done();
  return d
    .put(
      'slider',
      [0, 0, 2, 3],
      ['Cerrar', 'Abrir'],
      { label: 'Cortina', names: ['Cerrada', 'Abierta'], sendBy: 'level', form: 'window' },
      'window',
    )
    .key('Abrir', [2, 0, 1, 1], { form: 'round' })
    .key('Parar', [3, 0, 1, 1], { form: 'round' })
    .key('Cerrar', [2, 1, 1, 1], { form: 'round' })
    .key('Favorita', [3, 1, 1, 1], { form: 'round' })
    .level('Inclinar −', 'Inclinar +', [2, 2, 2, 1], { label: 'Inclinar' })
    .info('graph', [0, 3, 4, 2], 'Posición', { period: '7d' })
    .done();
}

/** Common names of the same button in library files (Flipper-IRDB, SmartIR, IRremoteESP8266). */
const SYNONYMS: Record<string, string[]> = {
  'Encender / apagar': ['power', 'power_toggle', 'pwr', 'on_off', 'onoff', 'power_on_off'],
  'Volumen +': ['vol_up', 'volume_up', 'vol+', 'volup', 'vol_plus'],
  'Volumen −': ['vol_dn', 'vol_down', 'volume_down', 'vol-', 'voldown', 'vol_minus'],
  'Canal +': ['ch_up', 'channel_up', 'ch+', 'ch_next', 'chup', 'next_channel'],
  'Canal −': ['ch_dn', 'ch_down', 'channel_down', 'ch-', 'ch_prev', 'chdown', 'prev_channel'],
  Silencio: ['mute'],
  Arriba: ['up'],
  Abajo: ['down'],
  Izquierda: ['left'],
  Derecha: ['right'],
  OK: ['ok', 'enter', 'select', 'center'],
  Volver: ['back', 'return'],
  Inicio: ['home'],
  Menú: ['menu'],
  Info: ['info', 'information'],
  Guía: ['guide', 'epg'],
  Salir: ['exit'],
  Fuentes: ['source', 'input', 'sources'],
  Ajustes: ['settings', 'setup', 'options'],
  Reproducir: ['play'],
  Pausa: ['pause'],
  Parar: ['stop'],
  Adelantar: ['ff', 'fast_forward', 'forward', 'fwd'],
  Retroceder: ['rew', 'rewind', 'rwd'],
  Rojo: ['red'],
  Verde: ['green'],
  Amarillo: ['yellow'],
  Azul: ['blue'],
  Netflix: ['netflix'],
  YouTube: ['youtube'],
  'Prime Video': ['prime_video', 'amazon', 'prime'],
  Apps: ['apps', 'smart', 'smart_tv'],
  'Temperatura +': ['temp_up', 'temp+', 'temperature_up', 'tempup'],
  'Temperatura −': ['temp_dn', 'temp_down', 'temp-', 'temperature_down', 'tempdown'],
  Frío: ['cool', 'cooling'],
  Calor: ['heat', 'heating'],
  Seco: ['dry'],
  'Sólo ventilar': ['fan', 'fan_only'],
  Automático: ['auto'],
  Turbo: ['turbo', 'powerful', 'jet'],
  Eco: ['eco', 'econo', 'energy_saving'],
  Temporizador: ['timer'],
  'Velocidad +': ['speed_up', 'fan_speed_up', 'speed+'],
  'Velocidad −': ['speed_down', 'fan_speed_down', 'speed-'],
  Girar: ['swing', 'oscillate', 'rotate', 'osc'],
  Modo: ['mode'],
  Abrir: ['open', 'up'],
  Cerrar: ['close', 'down'],
  ...Object.fromEntries(
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(d => [
      `Número ${d}`,
      [d, `num_${d}`, `key_${d}`, `digit_${d}`, `number_${d}`],
    ]),
  ),
};
const SYNONYMS_BY_ID = new Map(Object.entries(SYNONYMS).map(([name, words]) => [wantedId(name), [name, ...words]]));
const looseName = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[−]/g, '-')
    .replace(/[^a-z0-9+-]+/g, '_')
    .replace(/^_+|_+$/g, '');
/** Library buttons that are buttons a design asks for: {library index: template name}. */
export function libraryNames(wanted: Wanted[], entries: { index: number; name: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<number>();
  for (const item of wanted) {
    const keys = [looseName(item.name), ...(SYNONYMS_BY_ID.get(item.id) ?? []).map(looseName)];
    const hit = entries.find(entry => !used.has(entry.index) && keys.includes(looseName(entry.name)));
    if (!hit) continue;
    out[String(hit.index)] = item.name;
    used.add(hit.index);
  }
  return out;
}

/** One starting design, as a layout that waits for every button it uses. */
export function template(kind: ApplianceKind, design: StartDesign): ControlPiece[] {
  return { ac, tv, light, fan, cover }[kind](design).map(piece => {
    const next = { ...piece };
    if (next.label && !next.brand) next.label = localName(next.label);
    if (next.options)
      next.options = next.options.map(option => ({ ...option, label: option.label && localName(option.label) }));
    if (next.wanted) next.wanted = next.wanted.map(item => ({ ...item, name: localName(item.name) }));
    return next;
  });
}
/** The buttons a design asks for, in the order the guide asks for them. */
export function learnOrder(kind: ApplianceKind, design: StartDesign): Wanted[] {
  return template(kind, design).find(piece => piece.type === 'canvas')?.wanted ?? [];
}
/** Pieces of a design, without the canvas. */
export const pieceCount = (kind: ApplianceKind, design: StartDesign): number =>
  template(kind, design).filter(piece => piece.type !== 'canvas').length;
/** Which appliance a remote is, from its symbol (null: no template). */
export function kindOfIcon(icon: string | null | undefined): ApplianceKind | null {
  return APPLIANCES.find(([, , glyph]) => glyph === icon)?.[0] ?? null;
}

/** A learned button with the name of a waited one takes its place in every piece; that one
 * leaves the list. Returns the new layout, or null when nothing changes. */
export function resolveWanted(
  layout: ControlPiece[] | null,
  learned: { id: string; name: string }[],
): ControlPiece[] | null {
  const canvas = layout?.find(piece => piece.type === 'canvas');
  if (!layout || !canvas?.wanted?.length) return null;
  const byName = new Map(learned.map(button => [button.name.trim().toLowerCase(), button.id]));
  const byKey = new Map(learned.map(button => [wantedId(button.name), button.id]));
  const swap = new Map<string, string>();
  for (const item of canvas.wanted) {
    const id = byName.get(item.name.trim().toLowerCase()) ?? byKey.get(item.id);
    if (id) swap.set(item.id, id);
  }
  if (!swap.size) return null;
  const to = (ref: string) => swap.get(ref) ?? ref;
  return layout.map(piece => {
    const next = structuredClone(piece);
    next.buttons = next.buttons.map(to);
    if (next.slots) next.slots = Object.fromEntries(Object.entries(next.slots).map(([slot, ref]) => [slot, to(ref)]));
    if (next.holdButton) next.holdButton = to(next.holdButton);
    if (next.sequence)
      next.sequence = next.sequence.map(step => ('button' in step ? { ...step, button: to(step.button) } : step));
    if (next.type === 'canvas') {
      next.wanted = (next.wanted ?? []).filter(item => !swap.has(item.id));
      if (!next.wanted.length) delete next.wanted;
    }
    return next;
  });
}

/** A design with the learned buttons in place; what is still missing waits with «!». */
export function applyTemplate(
  kind: ApplianceKind,
  design: StartDesign,
  learned: { id: string; name: string }[],
): ControlPiece[] {
  const layout = template(kind, design);
  return resolveWanted(layout, learned) ?? layout;
}
