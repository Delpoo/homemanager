import { t } from '../i18n/index.js';
import { escapeHTML, type Hass } from '../card/types.js';

/** Searchable entity selector. It enhances a plain text input (so typing an ID
 * still works and forms keep their values) with a listbox of the session's
 * entities, matched by friendly name, entity ID and area, accents ignored. */

export interface EntityMatch {
  entityId: string;
  name: string;
  area: string | null;
  state: string;
}
/** Domains that never represent a device on a plan. */
const NOT_DEVICES = new Set([
  'update',
  'automation',
  'zone',
  'person',
  'sun',
  'tts',
  'stt',
  'conversation',
  'event',
  'todo',
  'image',
  'wake_word',
  'assist_satellite',
  'tag',
  'calendar',
  'weather',
  'notify',
  'ai_task',
]);
/** Things a person operates come first, then readings, then everything else. */
const CONTROLLABLE = new Set([
  'light',
  'fan',
  'climate',
  'cover',
  'switch',
  'vacuum',
  'media_player',
  'lock',
  'humidifier',
  'water_heater',
  'valve',
  'lawn_mower',
  'siren',
  'alarm_control_panel',
  'camera',
  'remote',
  'script',
  'button',
  'scene',
  'input_boolean',
  'input_button',
  'input_select',
  'select',
  'number',
  'input_number',
]);
const READINGS = new Set(['sensor', 'binary_sensor', 'device_tracker']);

/** 0 = operable, 1 = reading, 2 = other, 3 = diagnostic/config/hidden. */
export function relevanceOf(hass: Hass | undefined, entityId: string): number {
  const entry = hass?.entities?.[entityId];
  if (entry?.hidden || entry?.entity_category) return 3;
  const domain = entityId.split('.')[0];
  return CONTROLLABLE.has(domain) ? 0 : READINGS.has(domain) ? 1 : 2;
}

const fold = (value: string) => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function areaOf(hass: Hass | undefined, entityId: string): string | null {
  const entry = hass?.entities?.[entityId];
  const areaId = entry?.area_id ?? (entry?.device_id ? hass?.devices?.[entry.device_id]?.area_id : null);
  return (areaId && hass?.areas?.[areaId]?.name) || null;
}
export function friendlyName(hass: Hass | undefined, entityId: string): string {
  const name = hass?.states[entityId]?.attributes?.friendly_name;
  return typeof name === 'string' && name.trim() ? name.trim() : entityId;
}

export function searchEntities(
  hass: Hass | undefined,
  query: string,
  domains: string[] = [],
  limit = 40,
): EntityMatch[] {
  if (!hass?.states) return [];
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  const results: (EntityMatch & { score: number; relevance: number })[] = [];
  for (const entityId of Object.keys(hass.states)) {
    const domain = entityId.split('.')[0];
    if (domains.length ? !domains.includes(domain) : NOT_DEVICES.has(domain)) continue;
    const name = friendlyName(hass, entityId),
      area = areaOf(hass, entityId);
    const haystack = fold(`${name} ${entityId} ${area ?? ''}`);
    if (!tokens.every(token => haystack.includes(token))) continue;
    const folded = fold(name);
    const score = !tokens.length ? 3 : fold(entityId) === tokens.join(' ') ? 0 : folded.startsWith(tokens[0]) ? 1 : 2;
    const relevance = relevanceOf(hass, entityId);
    results.push({ entityId, name, area, state: hass.states[entityId].state, score, relevance });
  }
  return results
    .sort((a, b) => a.score - b.score || a.relevance - b.relevance || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ score: _score, relevance: _relevance, ...match }) => match);
}

export const pickerStyles = `.picker-host{position:relative}
.picker{position:absolute;left:0;right:0;top:100%;margin:4px 0 0;z-index:20;max-height:320px;overflow:auto;overscroll-behavior:contain;background:var(--hm-bg);color:var(--hm-text);border:1px solid var(--hm-line);border-radius:12px;box-shadow:var(--hm-shadow);padding:4px}
.picker[popover]{position:fixed;inset:auto;margin:0}
.picker [role=option]{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:8px 10px;border-radius:8px;cursor:pointer}
.picker [role=option][aria-selected=true],.picker [role=option]:hover{background:var(--hm-surface)}
.picker .name{font-size:14px;color:var(--hm-text)}
.picker .meta{grid-column:1/-1;font-size:12px;color:var(--hm-muted);overflow-wrap:anywhere}
.picker .state{font-size:12px;color:var(--hm-muted)}
.picker .none{padding:10px;font-size:13px;color:var(--hm-muted)}`;

let sequence = 0;
/** Turns `<input data-entity-picker="light,switch">` into a combobox. Selecting an
 * option sets the entity ID and fires input/change, exactly like typing it. */
export function enhanceEntityInput(input: HTMLInputElement, getHass: () => Hass | undefined): void {
  if (input.dataset.pickerReady) return;
  input.dataset.pickerReady = 'true';
  const domains = (input.dataset.entityPicker ?? '').split(',').filter(Boolean);
  const host = input.parentElement!;
  host.classList.add('picker-host');
  const list = document.createElement('div');
  list.className = 'picker';
  list.id = `hm-picker-${++sequence}`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  // In the top layer a scrolling sheet never clips the list.
  const layered = typeof list.showPopover === 'function';
  if (layered) list.setAttribute('popover', 'manual');
  host.append(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  input.autocomplete = 'off';
  let matches: EntityMatch[] = [],
    active = -1;
  const close = () => {
    if (layered && list.matches(':popover-open')) list.hidePopover();
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const choose = (match: EntityMatch) => {
    input.value = match.entityId;
    close();
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  };
  const paint = () => {
    list.innerHTML = matches.length
      ? matches
          .map(
            (match, index) =>
              `<div role="option" id="${list.id}-${index}" aria-selected="${index === active}" data-index="${index}"><span class="name">${escapeHTML(match.name)}</span><span class="state">${escapeHTML(match.state)}</span><span class="meta">${escapeHTML(match.entityId)}${match.area ? ` · ${escapeHTML(match.area)}` : ''}</span></div>`,
          )
          .join('')
      : `<div class="none">${escapeHTML(t('No hay entidades que coincidan.'))}</div>`;
    if (active >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
    else input.removeAttribute('aria-activedescendant');
  };
  /** With nothing typed (or the current entity still shown) every entity is
   * offered, the current one first; typing filters. The list scrolls. */
  const open = (query: string) => {
    const hass = getHass();
    matches = searchEntities(hass, query, domains, 200);
    const current = input.value.trim();
    if (!query && current && hass?.states[current]) {
      const index = matches.findIndex(match => match.entityId === current);
      const [chosen] = index >= 0 ? matches.splice(index, 1) : searchEntities(hass, current, domains, 1);
      if (chosen) matches.unshift(chosen);
    }
    active = -1;
    list.hidden = false;
    if (layered) {
      if (!list.matches(':popover-open')) list.showPopover();
      const box = input.getBoundingClientRect();
      const below = innerHeight - box.bottom - 12,
        above = box.top - 12;
      const height = Math.min(320, Math.max(below, above));
      list.style.left = `${box.left}px`;
      list.style.width = `${box.width}px`;
      list.style.maxHeight = `${Math.max(120, height)}px`;
      list.style.top =
        below >= 160 || below >= above
          ? `${box.bottom + 4}px`
          : `${Math.max(12, box.top - 4 - Math.min(320, height))}px`;
    }
    input.setAttribute('aria-expanded', 'true');
    paint();
  };
  input.addEventListener('focus', () => {
    // Typing replaces the current entity instead of appending to its ID.
    input.select();
    open('');
  });
  input.addEventListener('click', () => {
    if (list.hidden) open('');
  });
  input.addEventListener('input', event => {
    if (event.isTrusted) open(input.value);
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  // A fixed list would drift away from the field if the sheet scrolled under it.
  input.getRootNode().addEventListener(
    'scroll',
    event => {
      if (!list.hidden && !list.contains(event.target as Node)) close();
    },
    true,
  );
  input.addEventListener('keydown', event => {
    if (list.hidden && event.key === 'ArrowDown') return open('');
    if (list.hidden) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = Math.max(0, Math.min(matches.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
      paint();
      list.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  });
  // mousedown (not click) so the input does not blur before the choice lands.
  list.addEventListener('mousedown', event => {
    const option = (event.target as Element).closest<HTMLElement>('[role=option]');
    if (!option) return;
    event.preventDefault();
    choose(matches[Number(option.dataset.index)]);
  });
}
