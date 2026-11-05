import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';

/** A list of checkboxes with a search box (#62): instead of a native multiple select,
 * which needs Ctrl+click on a PC and is awkward on a phone. */
export function checkList(
  field: string,
  label: string,
  items: readonly { id: string; name: string }[],
  chosen: readonly string[],
): string {
  const sorted = [...items].sort(
    (a, b) => Number(chosen.includes(b.id)) - Number(chosen.includes(a.id)) || a.name.localeCompare(b.name),
  );
  return `<fieldset class="check-list"><legend>${e(label)}</legend><input type="search" data-check-search aria-label="${e(t('Buscar en {label}', { label }))}" placeholder="${e(t('Buscar'))}"><div class="check-rows">${sorted
    .map(
      item =>
        `<label class="check-row" data-name="${e(item.name.toLowerCase())}"><input type="checkbox" data-check-field="${e(field)}" value="${e(item.id)}"${chosen.includes(item.id) ? ' checked' : ''}><span>${e(item.name)}</span></label>`,
    )
    .join('')}</div></fieldset>`;
}

export const checkListStyles = `.check-list{display:grid;gap:6px;min-width:0}.check-rows{max-height:240px;overflow:auto;display:grid;gap:2px}.check-row{display:flex!important;align-items:center;gap:10px;min-height:44px;margin:0!important;padding:0 6px;border-radius:8px}.check-row:hover{background:var(--hm-surface-2)}.check-row input{width:20px;min-height:20px}.check-row[hidden]{display:none!important}`;
