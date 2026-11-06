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
  | 'canvas';
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
};
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
