import { cameraForView, viewFromCamera, type InitialView } from '../model/symbol-scale.js';
import { t } from '../i18n/index.js';
import type { HomeManagerCard } from './home-manager-card.js';

/** This screen's own initial view (#94), for a fixed tablet say: a per-browser choice. */
function localKey(card: HomeManagerCard): string {
  return `homemanager:view:${card.home?.homeId ?? card.config?.card_id ?? 'card'}`;
}
export function localView(card: HomeManagerCard): InitialView | undefined {
  try {
    const raw = localStorage.getItem(localKey(card));
    const view = raw ? (JSON.parse(raw) as InitialView) : undefined;
    return view && typeof view.zoom === 'number' && typeof view.x === 'number' ? view : undefined;
  } catch {
    return undefined;
  }
}
export function initialViewOf(card: HomeManagerCard): InitialView | undefined {
  return localView(card) ?? card.draft?.initialView;
}
/** Shows the saved view; false when there is none. */
export function applyInitialView(card: HomeManagerCard, animate = true): boolean {
  const view = initialViewOf(card);
  const rect = card.viewport?.getBoundingClientRect();
  if (!view || !rect?.width || !rect.height || !card.svg) return false;
  if (view.room && card.draft?.rooms.some(room => room.id === view.room)) card.fit(view.room, false);
  else card.fit(null, false);
  card.moveCamera(cameraForView(view, card.box, card.baseScale, rect), animate);
  return true;
}
/** Saves what is on screen: for everyone in the plan, or only on this screen. */
export function currentView(card: HomeManagerCard): InitialView | undefined {
  const rect = card.viewport?.getBoundingClientRect();
  if (!rect?.width || !rect.height) return undefined;
  return viewFromCamera(card.camera, card.box, card.baseScale, rect, card.currentRoom ?? null);
}
export function saveLocalView(card: HomeManagerCard, view: InitialView | null): void {
  try {
    if (view) localStorage.setItem(localKey(card), JSON.stringify(view));
    else localStorage.removeItem(localKey(card));
    card.status(
      view ? t('Vista inicial guardada en este equipo.') : t('Este equipo vuelve a usar la vista inicial del plano.'),
    );
  } catch {
    card.status(t('Este navegador no permite guardar la vista inicial.'));
  }
}
