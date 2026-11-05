import type { HomeManagerCard } from './home-manager-card.js';
import { t } from '../i18n/index.js';

/** One full-screen view (#61), replacing the old wall mode by the owner's decision of
 * 2026-11-04. It looks the same as usual, only bigger: no forced theme, no own Now panel.
 * When the browser refuses or lacks the Fullscreen API (HA app, iPhone, many tablets),
 * the card covers the whole window instead; both ways leave the same way. */
export const fullscreenStyles = `:host([data-fullscreen=window]) .shell{position:fixed;inset:0;z-index:2147483000;width:100vw;height:100dvh;max-height:none;border-radius:0}`;

export function isFullscreen(card: HomeManagerCard): boolean {
  return card.dataset.fullscreen === 'native' || card.dataset.fullscreen === 'window';
}

/** Keeps the ⛶ button saying what it will do. */
export function paintFullscreenButton(card: HomeManagerCard): void {
  const on = isFullscreen(card);
  for (const button of card.root.querySelectorAll<HTMLButtonElement>('[data-command=fullscreen]')) {
    const label = on ? t('Salir de pantalla completa') : t('Pantalla completa');
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', label);
    button.title = label;
    button.querySelector('ha-icon')?.setAttribute('icon', on ? 'mdi:fullscreen-exit' : 'mdi:fullscreen');
  }
}

function changed(card: HomeManagerCard): void {
  paintFullscreenButton(card);
  card.fit(null, false);
  card.insights?.update(card);
}

/** The browser left native full screen (Escape, a gesture): follow it. */
export function syncFullscreen(card: HomeManagerCard): void {
  if (card.dataset.fullscreen !== 'native') return;
  if (card.root.fullscreenElement === card.root.querySelector('.shell')) return;
  delete card.dataset.fullscreen;
  changed(card);
}

export async function exitFullscreen(card: HomeManagerCard): Promise<void> {
  const mode = card.dataset.fullscreen;
  delete card.dataset.fullscreen;
  if (mode === 'native' && document.fullscreenElement) await document.exitFullscreen?.().catch(() => {});
  changed(card);
}

export async function toggleFullscreen(card: HomeManagerCard): Promise<void> {
  if (isFullscreen(card)) {
    await exitFullscreen(card);
    return;
  }
  const shell = card.root.querySelector<HTMLElement>('.shell');
  if (!shell) return;
  try {
    if (!shell.requestFullscreen) throw new Error('unsupported');
    await shell.requestFullscreen();
    card.dataset.fullscreen = 'native';
  } catch {
    // Not allowed here: take the whole window instead, with a short, non-blocking note.
    card.dataset.fullscreen = 'window';
    card.status(
      t('Este navegador no permite pantalla completa: la vista ocupa toda la ventana. Tocá ⛶ o Escape para salir.'),
    );
  }
  changed(card);
}
