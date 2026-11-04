import type { HomeManagerCard } from './home-manager-card.js';
import { themePalettes } from '../ui/theme.js';
import { renderPlanChoice } from './plan-views.js';
import { t } from '../i18n/index.js';
export const wallModeStyles = `.wall-exit{display:none;flex-shrink:0;align-items:center;justify-content:center;width:40px;height:40px;min-height:40px;padding:6px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);color:var(--hm-ink)}:host([data-wall=true]) .wall-exit{display:inline-flex}
:host([data-wall=true]){${Object.entries(themePalettes.dark)
  .map(([key, value]) => `--hm-preference-${key}:${value};`)
  .join('')}}:host([data-wall=true]) .shell{width:100vw;height:100dvh;border-radius:0}`;
export function syncWallMode(card: HomeManagerCard) {
  const shell = card.root.querySelector('.shell');
  if (card.dataset.wall === 'true' && card.root.fullscreenElement !== shell) {
    delete card.dataset.wall;
    card.fit(null, false);
    void renderPlanChoice(card);
    card.insights?.update(card);
  }
}
export async function toggleWallMode(card: HomeManagerCard) {
  if (card.dataset.wall === 'true') {
    await document.exitFullscreen?.();
    syncWallMode(card);
    return;
  }
  const shell = card.root.querySelector<HTMLElement>('.shell');
  if (!shell?.requestFullscreen) {
    card.status(t('El navegador no permite pantalla completa.'));
    return;
  }
  try {
    await shell.requestFullscreen();
    card.dataset.wall = 'true';
    card.fit(null, false);
    void renderPlanChoice(card);
    card.insights?.update(card);
  } catch {
    card.status(t('El navegador no permite pantalla completa.'));
  }
}
