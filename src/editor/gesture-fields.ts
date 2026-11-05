import { t } from '../i18n/index.js';
import { escapeHTML as esc } from '../card/types.js';
import type { GestureAction, GestureBinding } from '../model/gestures.js';

/** Gestures › extra fields for the new actions (#97): a Home Assistant page, a link or an
 * app with its fallback, or a short menu of 2 to 4 choices. */
const SIMPLE: [GestureAction['action'], string][] = [
  ['panel', 'Abrir el control completo'],
  ['screen', 'Abrir su pantalla'],
  ['more-info', 'Abrir la ficha de Home Assistant'],
  ['navigate', 'Abrir una página de Home Assistant'],
  ['url', 'Abrir un enlace o una app'],
];

export function newGestureAction(kind: string): GestureAction {
  switch (kind) {
    case 'navigate':
      return { action: 'navigate', path: '/config/devices/dashboard' };
    case 'url':
      return { action: 'url', url: 'https://www.home-assistant.io', fallback: 'more-info' };
    case 'choose':
      return {
        action: 'choose',
        options: [
          { label: t('Control completo'), do: { action: 'panel' } },
          { label: t('Ficha de Home Assistant'), do: { action: 'more-info' } },
        ],
      };
    default:
      return { action: kind as GestureAction['action'] };
  }
}

const field = (gesture: string, key: string, label: string, value: string, extra = '') =>
  `<label class="field">${esc(label)}<input data-gesture-for="${gesture}" data-gesture-field="${key}" value="${esc(value)}"${extra}></label>`;

export function gestureExtra(gesture: 'tap' | 'hold', binding: GestureBinding | undefined): string {
  if (!binding || typeof binding !== 'object') return '';
  if (binding.action === 'navigate')
    return field(
      gesture,
      'path',
      t('Página de Home Assistant'),
      binding.path ?? '',
      ' placeholder="/config/devices/dashboard"',
    );
  if (binding.action === 'url') {
    const fallback = binding.fallback ?? '';
    return `${field(gesture, 'url', t('Enlace o app'), binding.url ?? '', ' placeholder="https://… o app://…"')}${field(gesture, 'mobileUrl', t('En el teléfono (opcional)'), binding.mobileUrl ?? '')}<label class="field">${esc(t('Si no se puede abrir'))}<select data-gesture-for="${gesture}" data-gesture-field="fallback">${[
      ['', t('Nada')],
      ['more-info', t('Abrir la ficha de Home Assistant')],
      ['screen', t('Abrir su pantalla')],
      ['panel', t('Abrir el control completo')],
      ['navigate', t('Abrir una página de Home Assistant')],
    ]
      .map(
        ([value, label]) => `<option value="${value}"${value === fallback ? ' selected' : ''}>${esc(label)}</option>`,
      )
      .join(
        '',
      )}</select></label>${fallback === 'navigate' ? field(gesture, 'fallbackPath', t('Página de Home Assistant'), binding.fallbackPath ?? '') : ''}<p class="note">${esc(t('Por seguridad sólo se abren enlaces https y de apps, y siempre por un toque tuyo. Si la app no está instalada, se usa la alternativa.'))}</p>`;
  }
  if (binding.action === 'choose') {
    const options = binding.options ?? [];
    return `<div class="choose-options">${options
      .map(
        (item, index) =>
          `<div class="choose-row"><input aria-label="${esc(t('Nombre de la opción {n}', { n: index + 1 }))}" data-gesture-for="${gesture}" data-choice-index="${index}" data-choice-field="label" maxlength="40" value="${esc(item.label)}"><select aria-label="${esc(t('Qué hace la opción {n}', { n: index + 1 }))}" data-gesture-for="${gesture}" data-choice-index="${index}" data-choice-field="do">${SIMPLE.map(([value, label]) => `<option value="${value}"${value === item.do.action ? ' selected' : ''}>${esc(t(label))}</option>`).join('')}</select>${item.do.action === 'navigate' ? `<input aria-label="${esc(t('Página de Home Assistant'))}" data-gesture-for="${gesture}" data-choice-index="${index}" data-choice-field="path" value="${esc(item.do.path ?? '')}">` : ''}${item.do.action === 'url' ? `<input aria-label="${esc(t('Enlace o app'))}" data-gesture-for="${gesture}" data-choice-index="${index}" data-choice-field="url" value="${esc(item.do.url ?? '')}">` : ''}${options.length > 2 ? `<button type="button" data-gesture-for="${gesture}" data-choice-remove="${index}" aria-label="${esc(t('Quitar opción'))}">×</button>` : ''}</div>`,
      )
      .join(
        '',
      )}${options.length < 4 ? `<button type="button" data-gesture-for="${gesture}" data-choice-add>${esc(t('+ Agregar opción'))}</button>` : ''}</div>`;
  }
  return '';
}

/** One change in the extra fields; undefined when nothing changes. */
export function gestureFieldChange(
  current: GestureBinding | undefined,
  target: HTMLElement,
): GestureAction | undefined {
  if (!current || typeof current !== 'object') return undefined;
  const next: GestureAction = structuredClone(current);
  const input = target as HTMLInputElement;
  const key = target.dataset.gestureField;
  if (key === 'fallback') {
    if (input.value) next.fallback = input.value as GestureAction['fallback'];
    else delete next.fallback;
    if (next.fallback === 'navigate') next.fallbackPath ??= '/config/devices/dashboard';
    else delete next.fallbackPath;
    return next;
  }
  if (key === 'path' || key === 'url' || key === 'mobileUrl' || key === 'fallbackPath') {
    const value = input.value.trim();
    if (value) next[key] = value;
    else delete next[key];
    return next;
  }
  const options = next.options ?? [];
  if (target.hasAttribute('data-choice-add') && options.length < 4) {
    options.push({ label: t('Pantalla'), do: { action: 'screen' } });
    next.options = options;
    return next;
  }
  if (target.dataset.choiceRemove !== undefined && options.length > 2) {
    options.splice(Number(target.dataset.choiceRemove), 1);
    return next;
  }
  const item = options[Number(target.dataset.choiceIndex)];
  if (!item) return undefined;
  switch (target.dataset.choiceField) {
    case 'label':
      item.label = input.value.trim().slice(0, 40) || item.label;
      return next;
    case 'do':
      item.do = newGestureAction(input.value);
      return next;
    case 'path':
      item.do = { action: 'navigate', path: input.value.trim() };
      return next;
    case 'url':
      item.do = { action: 'url', url: input.value.trim() };
      return next;
  }
  return undefined;
}

export const gestureFieldStyles = `.gesture-extra{display:grid;gap:6px;margin:4px 0 10px}.choose-options{display:grid;gap:6px}.choose-row{display:flex;gap:6px;flex-wrap:wrap}.choose-row input{flex:1;min-width:120px}`;
