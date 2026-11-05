import { DEFAULT_GRID_STEP, validStep } from '../model/move-grid.js';
import type { HomeManagerCard } from './home-manager-card.js';

const KEY = 'homemanager:grid-step';

/** The grid step chosen in Settings › Appearance; a per-browser convenience. */
export function gridStep(): number {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === null ? DEFAULT_GRID_STEP : validStep(stored);
  } catch {
    return DEFAULT_GRID_STEP;
  }
}
export function setGridStep(step: number): void {
  try {
    localStorage.setItem(KEY, String(validStep(step)));
  } catch {
    /* Without storage the default stays. */
  }
}

/** A soft grid over the plan, shown only while a symbol moves. */
export function showMoveGrid(card: HomeManagerCard, on: boolean): void {
  let grid = card.root.querySelector<HTMLElement>('.move-grid');
  const step = gridStep();
  if (!on || !step) {
    if (grid) grid.hidden = true;
    return;
  }
  if (!grid) {
    grid = document.createElement('div');
    grid.className = 'move-grid';
    grid.setAttribute('aria-hidden', 'true');
    card.viewport.append(grid);
  }
  const { camera, box } = card;
  const width = box.width * camera.scale,
    height = box.height * camera.scale;
  grid.hidden = false;
  grid.style.left = `${camera.x + box.x * camera.scale}px`;
  grid.style.top = `${camera.y + box.y * camera.scale}px`;
  grid.style.width = `${width}px`;
  grid.style.height = `${height}px`;
  grid.style.backgroundSize = `${width * step}px ${height * step}px`;
}

export const moveGridStyles = `.move-grid{position:absolute;z-index:1;pointer-events:none;background-image:linear-gradient(to right,color-mix(in srgb,var(--hm-edit) 35%,transparent) 1px,transparent 1px),linear-gradient(to bottom,color-mix(in srgb,var(--hm-edit) 35%,transparent) 1px,transparent 1px)}`;
