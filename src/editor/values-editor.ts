import { t } from '../i18n/index.js';
import { escapeHTML as esc, type Hass } from '../card/types.js';
import { readingName } from '../model/names.js';
import { MAX_SYMBOL_VALUES, type ValueStyle } from '../model/value-style.js';

/** Indicators › Values on the symbol (#91, #92): pick readings, order them, and say how
 * each looks. Kept as a draft in the sheet; the symbol previews it live. */
export interface ValuesDraft {
  values: ValueStyle[];
  place: 'inside' | 'beside' | 'below';
}

const option = (value: string, label: string, selected: string) =>
  `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;

export function valuesEditor(draft: ValuesDraft, candidates: readonly string[], hass: Hass | undefined): string {
  if (!candidates.length)
    return `<p class="note">${esc(t('Vinculá un dispositivo para elegir qué valores se ven en el símbolo.'))}</p>`;
  const chosen = draft.values.map(value => value.entity);
  const order = [...chosen, ...candidates.filter(id => !chosen.includes(id))];
  const full = chosen.length >= MAX_SYMBOL_VALUES;
  const rows = order
    .map(id => {
      const style = draft.values.find(value => value.entity === id);
      const index = chosen.indexOf(id);
      const name = readingName(id, hass);
      const head = `<div class="value-row-head"><label class="check"><input type="checkbox" data-value-pick="${esc(id)}"${style ? ' checked' : ''}${!style && full ? ' disabled' : ''}><span>${esc(name)}</span></label>${style ? `<button type="button" class="value-move" data-value-move="-1" data-value-entity="${esc(id)}" aria-label="${esc(t('Subir {name}', { name }))}"${index === 0 ? ' disabled' : ''}>↑</button><button type="button" class="value-move" data-value-move="1" data-value-entity="${esc(id)}" aria-label="${esc(t('Bajar {name}', { name }))}"${index === chosen.length - 1 ? ' disabled' : ''}>↓</button>` : ''}</div>`;
      if (!style) return `<div class="value-row">${head}</div>`;
      const ranges = style.ranges ?? [];
      const field = (key: string, label: string, control: string) =>
        `<label class="field">${esc(label)}${control.replace('<', `<`).replace(/^<(\w+)/, `<$1 data-value-field="${key}" data-value-entity="${esc(id)}"`)}</label>`;
      return `<div class="value-row" data-chosen="true">${head}<details class="value-look"${index === 0 ? '' : ''}><summary>${esc(t('Cómo se ve'))}</summary><div class="grid">
        ${field('decimals', t('Decimales'), `<select>${option('', t('Como en Home Assistant'), String(style.decimals ?? ''))}${[0, 1, 2, 3].map(n => option(String(n), String(n), String(style.decimals ?? ''))).join('')}</select>`)}
        ${field('label', t('Etiqueta corta'), `<input maxlength="16" value="${esc(style.label ?? '')}" placeholder="${esc(t('p. ej. Temp.'))}">`)}
        ${field('size', t('Tamaño de letra'), `<select>${option('s', t('Chica'), style.size ?? 'm')}${option('m', t('Normal'), style.size ?? 'm')}${option('l', t('Grande'), style.size ?? 'm')}</select>`)}
        ${field('color', t('Color'), `<input type="color" value="${esc(style.color ?? '#4f7a5a')}">`)}
        <label class="check"><input type="checkbox" data-value-field="unit" data-value-entity="${esc(id)}"${style.unit === false ? '' : ' checked'}><span>${esc(t('Mostrar la unidad'))}</span></label>
        <label class="check"><input type="checkbox" data-value-field="auto-color" data-value-entity="${esc(id)}"${style.color ? '' : ' checked'}><span>${esc(t('Color automático'))}</span></label>
        </div><fieldset class="value-ranges"><legend>${esc(t('Colores por rango'))}</legend><p class="note">${esc(t('Sólo cambia cómo se ve: no avisa ni envía nada.'))}</p>${ranges
          .map(
            (range, at) =>
              `<div class="range-row"><label>${esc(t('Desde'))}<input type="number" step="any" data-value-range="from" data-range-index="${at}" data-value-entity="${esc(id)}" value="${range.from}"></label><input type="color" aria-label="${esc(t('Color del rango'))}" data-value-range="color" data-range-index="${at}" data-value-entity="${esc(id)}" value="${esc(range.color)}"><button type="button" data-value-range-remove="${at}" data-value-entity="${esc(id)}" aria-label="${esc(t('Quitar rango'))}">×</button></div>`,
          )
          .join(
            '',
          )}${ranges.length < 6 ? `<button type="button" data-value-range-add data-value-entity="${esc(id)}">${esc(t('+ Agregar rango'))}</button>` : ''}<label class="check"><input type="checkbox" data-value-field="dot" data-value-entity="${esc(id)}"${style.dot ? ' checked' : ''}><span>${esc(t('Punto de color junto al valor'))}</span></label></fieldset></details></div>`;
    })
    .join('');
  return `<div class="values-editor"><p class="note">${esc(t('El primero va en el cuerpo del símbolo y los demás debajo. Hasta {count} en el símbolo; la pantalla del dispositivo los muestra todos.', { count: MAX_SYMBOL_VALUES }))}</p><label class="field">${esc(t('Dónde van los valores'))}<select data-value-place>${option('inside', t('Dentro del símbolo'), draft.place)}${option('beside', t('Al lado'), draft.place)}${option('below', t('Debajo'), draft.place)}</select></label>${rows}</div>`;
}

/** Applies one change from the editor's controls; returns undefined when it is not ours. */
export function valuesChange(draft: ValuesDraft, target: HTMLElement): ValuesDraft | undefined {
  const next: ValuesDraft = { place: draft.place, values: draft.values.map(value => ({ ...value })) };
  const entity = target.dataset.valueEntity ?? target.dataset.valuePick;
  const style = next.values.find(value => value.entity === entity);
  const input = target as HTMLInputElement;
  if (target.hasAttribute('data-value-place')) {
    next.place = input.value as ValuesDraft['place'];
    return next;
  }
  if (target.dataset.valuePick) {
    if (input.checked && !style && next.values.length < MAX_SYMBOL_VALUES)
      next.values.push({ entity: target.dataset.valuePick });
    if (!input.checked) next.values = next.values.filter(value => value.entity !== target.dataset.valuePick);
    return next;
  }
  if (!style) return undefined;
  if (target.dataset.valueMove) {
    const index = next.values.indexOf(style),
      to = index + Number(target.dataset.valueMove);
    if (to < 0 || to >= next.values.length) return next;
    next.values.splice(index, 1);
    next.values.splice(to, 0, style);
    return next;
  }
  if (target.hasAttribute('data-value-range-add')) {
    const last = style.ranges?.at(-1);
    style.ranges = [...(style.ranges ?? []), { from: last ? last.from + 10 : 0, color: last ? '#d98b1f' : '#3f8f5f' }];
    return next;
  }
  if (target.dataset.valueRangeRemove !== undefined) {
    style.ranges = (style.ranges ?? []).filter((_, at) => at !== Number(target.dataset.valueRangeRemove));
    if (!style.ranges.length) delete style.ranges;
    return next;
  }
  if (target.dataset.valueRange) {
    const at = Number(target.dataset.rangeIndex);
    const range = style.ranges?.[at];
    if (!range) return undefined;
    if (target.dataset.valueRange === 'from') {
      const number = Number(input.value);
      if (input.value.trim() === '' || !Number.isFinite(number)) return undefined;
      range.from = number;
    } else range.color = input.value;
    return next;
  }
  switch (target.dataset.valueField) {
    case 'decimals':
      if (input.value === '') delete style.decimals;
      else style.decimals = Number(input.value);
      return next;
    case 'label':
      if (input.value.trim()) style.label = input.value.trim().slice(0, 16);
      else delete style.label;
      return next;
    case 'size':
      if (input.value === 'm') delete style.size;
      else style.size = input.value as 's' | 'l';
      return next;
    case 'color':
      style.color = input.value;
      return next;
    case 'auto-color':
      if (input.checked) delete style.color;
      else style.color ??= '#4f7a5a';
      return next;
    case 'unit':
      if (input.checked) delete style.unit;
      else style.unit = false;
      return next;
    case 'dot':
      if (input.checked) style.dot = true;
      else delete style.dot;
      return next;
  }
  return undefined;
}

export const valuesEditorStyles = `
.values-editor{display:grid;gap:8px}.value-row{border:1px solid var(--hm-line);border-radius:10px;padding:6px 10px}.value-row[data-chosen=true]{background:var(--hm-surface)}
.value-row-head{display:flex;align-items:center;gap:6px}.value-row-head .check{flex:1;margin:0}.value-move{min-height:44px;min-width:44px;padding:0}
.value-look>summary{cursor:pointer;min-height:44px;line-height:44px;font-size:12px;color:var(--hm-accent)}
.value-ranges{border:1px solid var(--hm-line);border-radius:8px;margin:8px 0 0;padding:6px 10px}.range-row{display:flex;gap:6px;align-items:end;margin:4px 0}.range-row label{flex:1;display:grid;gap:4px;font-size:12px}.range-row input[type=color]{width:52px;padding:2px}
`;
