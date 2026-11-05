/** Moving symbols on a grid (#90). Steps are fractions of the plan's width and height;
 * 0 moves freely. Old positions are left alone until the symbol is moved. */
export const GRID_STEPS = [0, 0.005, 0.01, 0.025] as const;
export const DEFAULT_GRID_STEP = 0.01;

const fine = (value: number) => Math.round(value * 1e6) / 1e6;

export function validStep(value: unknown): number {
  const step = Number(value);
  return (GRID_STEPS as readonly number[]).includes(step) ? step : DEFAULT_GRID_STEP;
}

/** The nearest grid point; free (only rounded) without a step or with Alt held. */
export function snapToStep(value: number, step: number, free = false): number {
  if (!step || free) return fine(value);
  return fine(Math.round(value / step) * step);
}

/** One arrow key press: one cell, five with Shift; without a grid, the old fine nudge. */
export function keyStep(step: number, shift: boolean): number {
  const base = step || 0.002;
  return shift ? base * 5 : base;
}

/** How many unsaved changes the edit strip announces. */
export function unsavedCount(history: number, dirty: boolean): number {
  return dirty ? Math.max(1, history) : 0;
}
