import type { HomeManagerCard } from './home-manager-card.js';
import { alignedBox, choosePlanImage } from '../model/plan-views.js';
import { readImage, imageUrl } from '../integration/images.js';
import { effectiveDark } from '../ui/theme-choice.js';
import { t } from '../i18n/index.js';
const chosen = new WeakMap<HomeManagerCard, string>();
const generations = new WeakMap<HomeManagerCard, number>();
const key = (card: HomeManagerCard) => 'homemanager-plan-view:' + (card.config?.home_id ?? card.config?.card_id ?? '');
export async function renderPlanChoice(card: HomeManagerCard): Promise<void> {
  const host = card.root.querySelector<HTMLElement>('.architecture');
  if (!host || !card.draft || !card.svg) return;
  const generation = (generations.get(card) ?? 0) + 1;
  generations.set(card, generation);
  let id = chosen.get(card);
  if (id === undefined) {
    try {
      id = localStorage.getItem(key(card)) ?? '';
    } catch {
      id = '';
    }
    chosen.set(card, id);
  }
  const views = card.draft.planViews ?? [];
  let controls = card.root.querySelector<HTMLElement>('.plan-choices');
  if (!controls) {
    controls = document.createElement('div');
    controls.className = 'plan-choices';
    controls.style.cssText = 'position:absolute;top:10px;left:60px;z-index:4;max-width:calc(100% - 130px)';
    card.viewport.append(controls);
  }
  controls.replaceChildren();
  controls.hidden = !views.length;
  if (views.length) {
    const label = document.createElement('label');
    label.textContent = t('Alternativa del plano');
    const select = document.createElement('select');
    select.setAttribute('aria-label', t('Alternativa del plano'));
    select.style.cssText =
      'max-width:100%;min-height:40px;background:var(--hm-surface);color:var(--hm-ink);border:1px solid var(--hm-line);border-radius:10px';
    for (const v of [{ id: '', name: t('Plano original') }, ...views]) {
      const o = document.createElement('option');
      o.value = v.id;
      o.textContent = v.name;
      select.append(o);
    }
    select.value = views.some(v => v.id === id) ? id! : '';
    select.onchange = () => {
      chosen.set(card, select.value);
      try {
        localStorage.setItem(key(card), select.value);
      } catch {}
      void renderPlanChoice(card);
    };
    label.append(select);
    controls.append(label);
  }
  host.querySelector('.plan-image')?.remove();
  const emptyOriginal = card.root.querySelector<HTMLElement>('.empty');
  if (emptyOriginal) emptyOriginal.hidden = card.svg.children.length > 0;
  card.svg.style.opacity = '';
  host.style.background = '';
  const view = views.find(v => v.id === id);
  if (!view) return;
  const dark = effectiveDark(card._hass?.themes?.darkMode === true);
  const selected = choosePlanImage(view, dark);
  host.style.background = selected.background;
  if (!selected.image) return;
  if (!alignedBox(selected.image.box, [card.box.x, card.box.y, card.box.width, card.box.height])) {
    const note = document.createElement('small');
    note.textContent = t('El encuadre del plano cambió. Revisá la alternativa en Ajustes.');
    controls.append(note);
    return;
  }
  try {
    const data = await readImage(card._hass, selected.image);
    if (generations.get(card) !== generation || !host.isConnected) return;
    const img = document.createElement('img');
    img.className = 'plan-image';
    img.alt = view.name;
    img.src = imageUrl(data);
    img.style.cssText = 'position:absolute;object-fit:fill;pointer-events:none;';
    const [x, y, w, h] = selected.image.box;
    img.style.left = ((x - card.box.x) / card.box.width) * 100 + '%';
    img.style.top = ((y - card.box.y) / card.box.height) * 100 + '%';
    img.style.width = (w / card.box.width) * 100 + '%';
    img.style.height = (h / card.box.height) * 100 + '%';
    host.append(img);
    card.svg.style.opacity = '0';
    const empty = card.root.querySelector<HTMLElement>('.empty');
    if (empty) empty.hidden = true;
    if (selected.fallback) {
      const note = document.createElement('small');
      note.textContent = t('Falta la imagen de este modo; se usa la otra.');
      controls.append(note);
    }
  } catch {
    const note = document.createElement('small');
    note.setAttribute('role', 'status');
    note.textContent = t('No se pudo cargar la imagen. Se conserva el plano original.');
    controls.append(note);
  }
}
