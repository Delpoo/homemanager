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
  | 'control';
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
}
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
