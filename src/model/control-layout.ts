/** Shared visual vocabulary. References are RF button IDs, plan action IDs,
 * or (only for `control`) IDs of an existing device control. No commands here. */
export type PieceType =
  | 'button'
  | 'toggle'
  | 'updown'
  | 'steps'
  | 'modes'
  | 'cycle'
  | 'slider'
  | 'indicator'
  | 'title'
  | 'separator'
  | 'control'
  // 0.13 free designer
  | 'knob'
  | 'preset'
  | 'graph'
  /** Not drawn: says how many columns and rows the grid has (at most one). */
  | 'canvas'
  // 0.13 ready-made blocks: each key sends the learned button of its slot.
  | 'dpad'
  | 'numpad'
  | 'transport'
  | 'colors';
/** One step of a preset: a learned button (optionally several times) or a pause. */
export type PieceStep = { button: string; times?: number } | { wait: number };
export interface ControlPiece {
  id: string;
  type: PieceType;
  x: number;
  y: number;
  w: number;
  h: number;
  buttons: string[];
  label: string | null;
  icon: string | null;
  reading?: string;
  attribute?: string;
  /** 0.13 look: background and text colours (#RRGGBB), shape, what is hidden. */
  bg?: string;
  fg?: string;
  shape?: 'round' | 'square';
  hideIcon?: boolean;
  hideLabel?: boolean;
  /** Pair, slider and steps can stand upright. */
  orientation?: 'vertical';
  /** Preset only: what it sends, in order. */
  sequence?: PieceStep[];
  // 0.13 designer, second part (piece_look.py): all optional.
  fontSize?: number;
  fontWeight?: 400 | 500 | 700;
  iconSize?: number;
  border?: string;
  /** Colour of what is on or chosen. */
  active?: string;
  /** Corner radius in pixels; 999 is a pill. On the canvas, the body's corners. */
  radius?: number;
  /** Raised when absent. */
  relief?: 'flat' | 'outline';
  /** Sinks when absent. */
  anim?: 'flash' | 'none';
  /** A brand or app key: its mark and colour come from the catalogue. */
  brand?: string;
  hold?: 'repeat' | 'other';
  holdButton?: string;
  /** Levels: numbers from min to max, or names. */
  values?: { min: number; max: number; step: number; unit?: string };
  names?: string[];
  /** Past the last level (or option) it starts again instead of stopping. */
  wrap?: boolean;
  /** Levels: two buttons (up/down), one that advances, or one per level. */
  sendBy?: 'updown' | 'advance' | 'level';
  /** Levels: what the middle shows. Modes: 'list' folds the options. */
  display?: 'value' | 'name' | 'dots' | 'text' | 'list';
  valueSize?: number;
  /** Modes and cycle: text and icon of each option, beside its button. */
  options?: { label?: string | null; icon?: string | null }[];
  /** Blocks: which learned button each key sends. */
  slots?: Record<string, string>;
  period?: '1h' | '24h' | '7d' | '30d';
  chart?: {
    reading?: string;
    attribute?: string;
    scale?: 'auto' | 'fixed' | 'log';
    min?: number;
    max?: number;
    style?: 'area' | 'line';
    precision?: 'decimals' | 'significant';
    digits?: number;
    unit?: string;
  };
  /** Canvas only. */
  theme?: RemoteTheme;
  gap?: number;
}
export type RemoteTheme = 'grafito' | 'claro' | 'arena' | 'vidrio';
export const REMOTE_THEMES: RemoteTheme[] = ['grafito', 'claro', 'arena', 'vidrio'];
export const LEVEL_TYPES: PieceType[] = ['updown', 'slider', 'steps', 'knob'];
export const MAX_LEVELS = 24;
/** The keys of each block, in drawing order, with their name and icon. */
export const BLOCK_SLOTS: Record<'dpad' | 'numpad' | 'transport' | 'colors', [string, string, string][]> = {
  dpad: [
    ['up', 'Arriba', 'mdi:chevron-up'],
    ['down', 'Abajo', 'mdi:chevron-down'],
    ['left', 'Izquierda', 'mdi:chevron-left'],
    ['right', 'Derecha', 'mdi:chevron-right'],
    ['ok', 'OK', ''],
  ],
  numpad: [
    ...'123456789'.split('').map((n): [string, string, string] => [n, n, '']),
    ['dash', '-/--', ''],
    ['0', '0', ''],
    ['enter', 'Entrar', 'mdi:keyboard-return'],
  ],
  transport: [
    ['prev', 'Anterior', 'mdi:skip-previous'],
    ['rew', 'Retroceder', 'mdi:rewind'],
    ['play', 'Reproducir / pausa', 'mdi:play-pause'],
    ['ff', 'Adelantar', 'mdi:fast-forward'],
    ['next', 'Siguiente', 'mdi:skip-next'],
  ],
  colors: [
    ['red', 'Rojo', ''],
    ['green', 'Verde', ''],
    ['yellow', 'Amarillo', ''],
    ['blue', 'Azul', ''],
  ],
};
export const isBlock = (type: PieceType): type is keyof typeof BLOCK_SLOTS => type in BLOCK_SLOTS;
export const sendByOf = (piece: ControlPiece): 'updown' | 'advance' | 'level' =>
  piece.sendBy ?? (piece.type === 'updown' ? 'updown' : 'level');
/** How many levels a piece has: its names, its numbers, or (old pieces) one per button. */
export function levelCount(piece: ControlPiece): number {
  if (piece.names) return piece.names.length;
  if (piece.values) return Math.floor((piece.values.max - piece.values.min) / piece.values.step) + 1;
  return sendByOf(piece) === 'level' ? piece.buttons.length : 0;
}
/** The text of a level: "24°", "Media", or its number when nothing says more. */
export function levelText(piece: ControlPiece, index: number): string {
  if (piece.names) return piece.names[index] ?? '';
  if (piece.values) return `${piece.values.min + index * piece.values.step}${piece.values.unit ?? ''}`;
  return String(index + 1);
}
/** The level after a step up or down: it stops at the ends, or wraps when told to. */
export function stepLevel(piece: ControlPiece, index: number, delta: number): number {
  const count = levelCount(piece);
  if (!count) return index;
  const next = index + delta;
  if (next >= count) return piece.wrap ? 0 : count - 1;
  if (next < 0) return piece.wrap ? count - 1 : 0;
  return next;
}
/** What a move from one level to another sends, in order. */
export function levelSends(piece: ControlPiece, from: number, to: number, direction?: number): string[] {
  if (from === to) return [];
  const mode = sendByOf(piece);
  if (mode === 'level') return piece.buttons[to] ? [piece.buttons[to]] : [];
  const count = levelCount(piece);
  if (mode === 'advance') {
    // One button that advances: as many presses as levels ahead (round the end when it wraps).
    const ahead = count ? (to - from + count) % count : 1;
    return Array.from({ length: Math.max(1, ahead) }, () => piece.buttons[0]).filter(Boolean);
  }
  const [down, up] = piece.buttons;
  // A step crossing an end keeps the direction of the key that was pressed.
  // Choosing a level directly still sends the full distance to that level.
  if (piece.wrap && count > 1 && direction && stepLevel(piece, from, direction) === to)
    return [direction > 0 ? up : down].filter(Boolean);
  const button = to > from ? up : down;
  const times = Math.abs(to - from);
  return Array.from({ length: times }, () => button).filter(Boolean);
}
/** Which level a reading means: a number on the scale, or one of the names. */
export function levelFromReading(piece: ControlPiece, value: string): number | null {
  if (piece.names) {
    const index = piece.names.findIndex(name => name.toLowerCase() === value.trim().toLowerCase());
    return index >= 0 ? index : null;
  }
  const number = Number(value);
  if (!piece.values || !Number.isFinite(number)) return null;
  const index = Math.round((number - piece.values.min) / piece.values.step);
  return Math.max(0, Math.min(levelCount(piece) - 1, index));
}
/** Grid limits shared with the three validators (rf_model.py, validation.py, validation.mjs). */
export const DEFAULT_COLUMNS = 4;
export const MAX_COLUMNS = 30;
export const MAX_GRID_ROWS = 40;
export const MAX_PIECE_HEIGHT = 12;
export const MAX_SEQUENCE = 24;
/** The grid a layout is drawn on: its canvas piece, or four columns. */
export function gridOf(layout: readonly ControlPiece[]): { columns: number; rows: number | null } {
  const canvas = layout.find(piece => piece.type === 'canvas');
  return canvas ? { columns: canvas.w, rows: canvas.h } : { columns: DEFAULT_COLUMNS, rows: null };
}
/** The pieces that are drawn (everything but the canvas). */
export const drawnPieces = <T extends ControlPiece>(layout: readonly T[]): T[] =>
  layout.filter(piece => piece.type !== 'canvas');
export const PIECE_INPUTS: Record<PieceType, [number, number]> = {
  button: [1, 1],
  toggle: [1, 2],
  updown: [2, 2],
  steps: [2, 12],
  modes: [2, 8],
  cycle: [2, 4],
  slider: [2, 12],
  indicator: [0, 0],
  title: [0, 0],
  separator: [0, 0],
  control: [1, 1],
  knob: [2, 12],
  preset: [1, 12],
  graph: [0, 0],
  canvas: [0, 0],
  dpad: [0, 5],
  numpad: [0, 12],
  transport: [0, 5],
  colors: [0, 4],
};
/** How many learned buttons a piece uses, given what it says about itself (piece_look.py). */
export function pieceInputs(piece: ControlPiece): [number, number] {
  if (!LEVEL_TYPES.includes(piece.type)) return PIECE_INPUTS[piece.type];
  const mode = sendByOf(piece);
  if (mode === 'updown') return [2, 2];
  if (mode === 'advance') return [1, 1];
  const count = piece.names?.length ?? (piece.values ? levelCount(piece) : null);
  return count === null ? [2, MAX_LEVELS] : [count, count];
}
export const PIECE_SIZE: Record<PieceType, [number, number]> = {
  button: [1, 1],
  toggle: [2, 1],
  updown: [2, 1],
  steps: [4, 1],
  modes: [4, 1],
  cycle: [2, 1],
  slider: [4, 1],
  indicator: [1, 1],
  title: [4, 1],
  separator: [4, 1],
  control: [4, 2],
  knob: [2, 2],
  preset: [1, 1],
  graph: [4, 2],
  canvas: [4, 1],
  dpad: [3, 3],
  numpad: [3, 4],
  transport: [3, 1],
  colors: [3, 1],
};
/** Reading migration only: controls/actions remain in their original contract. */
export function layoutFromControls(controls: readonly { id: string; label: string }[]): ControlPiece[] {
  return controls.map((c, i) => ({
    id: `c-${i + 1}`,
    type: 'control',
    x: 0,
    y: i * 3,
    w: 4,
    h: 3,
    buttons: [c.id],
    label: c.label,
    icon: null,
  }));
}
export function readingValue(
  piece: ControlPiece,
  entities: Record<string, { state: string; attributes?: Record<string, unknown> }> = {},
): string {
  const entity = piece.reading ? entities[piece.reading] : undefined;
  const value = piece.attribute ? entity?.attributes?.[piece.attribute] : entity?.state;
  return (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'string' ? String(value) : '—';
}

/** 0.13: a piece of a device's control drawn next to its symbol on the plan, where it
 * was dragged. Offsets and sizes are pixels at the symbol's own size; it grows with the
 * symbol unless fixedSize. Its look can differ from the control's. */
export interface AttachedPiece {
  id: string;
  /** The piece's id in the device's control layout (its remote or its own design). */
  piece: string;
  dx: number;
  dy: number;
  w: number;
  h: number;
  locked?: true;
  fixedSize?: true;
  look?: {
    fontSize?: number;
    valueSize?: number;
    bg?: string;
    fg?: string;
    radius?: number;
    relief?: 'raised' | 'flat' | 'outline';
    /** Percent, 30 to 100. */
    opacity?: number;
  };
}
export const MAX_ATTACHED = 6;
/** The piece as drawn on the plan: the control's piece with the attached look on top. */
export function attachedLook(piece: ControlPiece, attached: AttachedPiece): ControlPiece {
  const look = attached.look ?? {};
  const merged: ControlPiece = { ...piece, x: 0, y: 0, w: 1, h: 1 };
  if (look.fontSize) merged.fontSize = look.fontSize;
  if (look.valueSize) merged.valueSize = look.valueSize;
  if (look.bg) merged.bg = look.bg;
  if (look.fg) merged.fg = look.fg;
  if (look.radius !== undefined) {
    merged.radius = look.radius;
    delete merged.shape;
  }
  if (look.relief === 'raised') delete merged.relief;
  else if (look.relief) merged.relief = look.relief;
  // Pieces that stand upright keep standing upright; one cell holds the whole piece.
  return merged;
}

/** 0.13 "Design only": a design carried to another remote. Each learned button is
 * looked up there by its name; a piece that would lose what it needs is left out. */
export function mapLayout(
  layout: readonly ControlPiece[],
  from: readonly { id: string; name: string }[],
  to: readonly { id: string; name: string }[],
): { layout: ControlPiece[]; left: number } {
  const key = (name: string) => name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const target = new Map(to.map(button => [key(button.name), button.id]));
  const names = new Map(from.map(button => [button.id, button.name]));
  const map = (ref: string) => {
    const name = names.get(ref);
    return name === undefined ? undefined : target.get(key(name));
  };
  let left = 0;
  const out: ControlPiece[] = [];
  for (const original of layout) {
    const piece: ControlPiece = structuredClone(original) as ControlPiece;
    if (isBlock(piece.type)) {
      const slots = Object.fromEntries(
        Object.entries(piece.slots ?? {}).flatMap(([slot, ref]) => {
          const mapped = map(ref);
          return mapped ? [[slot, mapped]] : [];
        }),
      );
      piece.slots = slots;
      piece.buttons = [...new Set(Object.values(slots))];
      out.push(piece);
      continue;
    }
    const buttons = piece.buttons.map(map);
    if (buttons.some(ref => !ref)) {
      left++;
      continue;
    }
    piece.buttons = buttons as string[];
    if (piece.sequence)
      piece.sequence = piece.sequence.map(step => ('button' in step ? { ...step, button: map(step.button)! } : step));
    if (piece.holdButton) {
      const hold = map(piece.holdButton);
      if (hold) piece.holdButton = hold;
      else {
        delete piece.holdButton;
        delete piece.hold;
      }
    }
    out.push(piece);
  }
  return { layout: out, left };
}

/** A reading as people read it: 1012 W, 23.5 °C, 0.42 — not 1012.0631103515625. */
export function formatReading(value: string): string {
  const number = Number(value);
  if (value.trim() === '' || !Number.isFinite(number) || !/\.\d{3,}/.test(value)) return value;
  const digits = Math.abs(number) >= 100 ? 0 : Math.abs(number) >= 10 ? 1 : 2;
  return String(Number(number.toFixed(digits)));
}
