import { t } from '../i18n/index.js';
import { escapeHTML as e, type Hass } from '../card/types.js';
import {
  INDICATOR_TYPES,
  MAX_INDICATOR_RANGES,
  NO_DATA,
  defaultColors,
  effectsOf,
  indicatorColor,
  readingInfo,
  type Indicator,
  type IndicatorType,
  type ReadingInfo,
} from '../model/indicator.js';
import type { Device } from '../card/types.js';

/** Indicators module of the symbol sheet (0.13). The person picks what to show (ring,
 * border, icon colour, LED, number), which reading drives it and its colours; a big
 * preview shows the result, and "try a value" changes only the preview. */
export interface IndicatorDraft {
  list: Indicator[];
  selected: number;
  /** A value tried in the preview only, for the selected indicator's reading. */
  test?: string | number;
}
const LABELS: Record<IndicatorType, [string, string]> = {
  ring: ['Anillo', 'mdi:circle-double'],
  border: ['Borde', 'mdi:circle-outline'],
  icon: ['Color del icono', 'mdi:palette-outline'],
  led: ['LED', 'mdi:circle-medium'],
  number: ['Número', 'mdi:numeric'],
};
const KIND_LABEL: Record<ReadingInfo['kind'], string> = {
  number: 'Número',
  binary: 'Sí / no',
  enum: 'Estados',
  text: 'Texto',
};
/** Attributes worth a ring or a colour; the state of every linked entity is offered too. */
const NUMERIC_ATTRIBUTES = [
  'current_position',
  'current_tilt_position',
  'current_temperature',
  'temperature',
  'current_humidity',
  'humidity',
  'brightness',
  'percentage',
  'battery_level',
  'volume_level',
];
const glyph = (name: string) => `<ha-icon icon="${e(name)}" aria-hidden="true"></ha-icon>`;
const ib = (label: string, icon: string, attributes: string) =>
  `<button type="button" class="ib" aria-label="${e(label)}" title="${e(label)}" ${attributes}>${glyph(icon)}</button>`;
const sourceOf = (indicator: Pick<Indicator, 'entity' | 'attribute'>) =>
  indicator.attribute ? `${indicator.entity}#${indicator.attribute}` : indicator.entity;
const nameOf = (hass: Hass | undefined, source: string) => {
  const [entity, attribute] = source.split('#');
  const name = String(
    hass?.states[entity]?.attributes?.friendly_name ?? entity.replace(/^[^.]+\./, '').replace(/_/g, ' '),
  );
  return attribute ? `${name} › ${attribute.replace(/_/g, ' ')}` : name;
};
const colorInput = (value: string, attributes: string, label: string) =>
  `<label class="sw" style="--c:${/^#[0-9a-fA-F]{6}$/.test(value) ? value : NO_DATA}" title="${e(label)}"><input type="color" value="${e(value)}" aria-label="${e(label)}" ${attributes}></label>`;

/** Readings this symbol can use: each linked entity, and its useful numeric attributes. */
export function indicatorSources(entities: readonly string[], hass: Hass | undefined): string[] {
  const out: string[] = [];
  for (const entity of entities) {
    out.push(entity);
    const attributes = hass?.states[entity]?.attributes ?? {};
    for (const key of NUMERIC_ATTRIBUTES) if (typeof attributes[key] === 'number') out.push(`${entity}#${key}`);
  }
  return [...new Set(out)];
}

/** The reading as the preview should see it: the tried value replaces the real one. */
function previewHass(draft: IndicatorDraft, hass: Hass | undefined): Hass | undefined {
  const selected = draft.list[draft.selected];
  if (!selected || draft.test === undefined || !hass) return hass;
  const state = hass.states[selected.entity] ?? { state: 'unknown', attributes: {} };
  const next = selected.attribute
    ? { ...state, attributes: { ...state.attributes, [selected.attribute]: draft.test } }
    : { ...state, state: String(draft.test) };
  return { ...hass, states: { ...hass.states, [selected.entity]: next } } as Hass;
}

function preview(draft: IndicatorDraft, device: Device | undefined, hass: Hass | undefined): string {
  const fx = device
    ? effectsOf({ ...device, display: { ...device.display, indicators: draft.list } }, previewHass(draft, hass))
    : {};
  const ring = fx.ring
    ? `<span class="fx-ring" style="--p:${fx.ring.percent};--fa:${fx.ring.color};--fb:${fx.ring.empty};--fw:${fx.ring.width}px"></span>`
    : '';
  const style = `${fx.border ? `--fx-border:${fx.border};` : ''}${fx.icon ? `--fx-icon:${fx.icon};` : ''}`;
  return `<span class="fxsym${fx.border ? ' bordered' : ''}${fx.icon ? ' tinted' : ''}" style="${style}">${glyph(device?.display.icon ?? 'mdi:shape')}${ring}${fx.led ? `<span class="fx-led" style="--fc:${fx.led}"></span>` : ''}${fx.number ? `<span class="fx-num" data-position="${fx.number.position}">${e(fx.number.text)}</span>` : ''}</span>`;
}

function tryValue(draft: IndicatorDraft, info: ReadingInfo): string {
  if (info.kind === 'number') {
    const low = info.min ?? 0,
      high = info.max ?? 100;
    const now = typeof draft.test === 'number' ? draft.test : typeof info.value === 'number' ? info.value : low;
    return `<div class="fxtry" title="${e(t('Probá distintos valores: sólo cambia la vista previa'))}">${glyph('mdi:test-tube')}<input type="range" min="${low}" max="${high}" step="any" value="${now}" data-fx-test aria-label="${e(t('Probar valor'))}"><label class="num"><input type="number" value="${now}" data-fx-test aria-label="${e(t('Valor de prueba'))}"><span>${e(info.unit ?? '')}</span></label></div>`;
  }
  if (info.options?.length)
    return `<div class="fxtry">${glyph('mdi:test-tube')}<div class="chips">${info.options
      .map(
        option =>
          `<button type="button" class="chip" data-fx-test-state="${e(option)}" aria-pressed="${String(draft.test ?? info.value) === option}">${e(option)}</button>`,
      )
      .join('')}</div></div>`;
  return '';
}

function rules(indicator: Indicator, info: ReadingInfo, hit: string | undefined): string {
  let rows = '';
  if (info.kind === 'number') {
    rows =
      (indicator.ranges ?? [])
        .map(
          (range, index) =>
            `<div class="srow${hit !== undefined && range.name === hit ? ' hit' : ''}">${colorInput(range.color, `data-fx-range-color="${index}"`, t('Color'))}<label class="num"><input type="number" value="${range.from}" data-fx-range-from="${index}" aria-label="${e(t('Desde'))}"></label><span class="muted">${e(t('a'))}</span><label class="num"><input type="number" value="${range.to}" data-fx-range-to="${index}" aria-label="${e(t('Hasta'))}"></label><input class="rname" value="${e(range.name ?? '')}" maxlength="24" placeholder="${e(t('Nombre'))}" data-fx-range-name="${index}" aria-label="${e(t('Nombre del rango'))}">${ib(t('Quitar'), 'mdi:close', `data-fx-range-remove="${index}"`)}</div>`,
        )
        .join('') +
      ((indicator.ranges?.length ?? 0) < MAX_INDICATOR_RANGES
        ? `<button type="button" class="chip add" data-fx-range-add title="${e(t('Agregar rango'))}" aria-label="${e(t('Agregar rango'))}">${glyph('mdi:plus')}</button>`
        : '');
  } else if (info.options?.length) {
    rows = info.options
      .map(
        option =>
          `<div class="srow${String(info.value) === option ? ' hit' : ''}">${colorInput(indicator.states?.[option] ?? NO_DATA, `data-fx-state="${e(option)}"`, t('Color para {state}', { state: option }))}<span class="opt">${e(option)}</span></div>`,
      )
      .join('');
  }
  rows += `<div class="srow none">${colorInput(indicator.none ?? NO_DATA, 'data-fx-field="none"', t('Sin dato'))}<span class="opt muted">${e(t('Sin dato'))}</span></div>`;
  return `<div class="scale">${rows}</div>`;
}

function selectedEditor(draft: IndicatorDraft, sources: string[], hass: Hass | undefined): string {
  const indicator = draft.list[draft.selected];
  if (!indicator) return '';
  const source = sourceOf(indicator);
  const info = readingInfo(hass, indicator.entity, indicator.attribute);
  const { color, name } = indicatorColor(indicator, info);
  const options = [...new Set([source, ...sources])]
    .map(item => `<option value="${e(item)}"${item === source ? ' selected' : ''}>${e(nameOf(hass, item))}</option>`)
    .join('');
  const shown = info.value === null ? t('Sin dato') : `${info.value}${info.unit ? ` ${info.unit}` : ''}`;
  const now = `<div class="nowline">${glyph('mdi:arrow-right-bottom')}<span>${e(t('Ahora'))} <b>${e(shown)}</b></span>${indicator.type !== 'number' ? `<span>→</span><span class="dot" style="--c:${color}"></span><span>${e(name ?? '')}</span>` : ''}${ib(`${t('Tipo detectado')}: ${t(KIND_LABEL[info.kind])} · ${info.how}`, 'mdi:information-outline', 'tabindex="-1"')}</div>`;
  let body = '';
  if (indicator.type === 'ring') {
    const fixed = !!indicator.fill;
    body = `<div class="grid4">${glyph('mdi:arrow-expand-horizontal')}<label class="num" title="${e(t('Vacío en'))}"><input type="number" value="${indicator.min ?? info.min ?? 0}" data-fx-field="min" aria-label="${e(t('Mínimo'))}"></label><span class="muted">${e(t('a'))}</span><label class="num" title="${e(t('Lleno en'))}"><input type="number" value="${indicator.max ?? info.max ?? 100}" data-fx-field="max" aria-label="${e(t('Máximo'))}"></label></div>
      <div class="fxrow2">${glyph('mdi:format-line-weight')}<input type="range" min="2" max="10" value="${indicator.width ?? 4}" data-fx-field="width" aria-label="${e(t('Grosor'))}"><label class="num"><input type="number" min="2" max="10" value="${indicator.width ?? 4}" data-fx-field="width" aria-label="${e(t('Grosor'))}"><span>px</span></label></div>
      <div class="fxrow2">${glyph('mdi:palette-outline')}<div class="seg">${ib(t('Un color'), 'mdi:circle', `data-fx-mode="fixed" aria-pressed="${fixed}"`)}${ib(t('Color según el valor'), 'mdi:gradient-horizontal', `data-fx-mode="rules" aria-pressed="${!fixed}"`)}</div><span class="swpair">${fixed ? colorInput(indicator.fill!, 'data-fx-field="fill"', t('Parte llena')) : ''}${colorInput(indicator.empty ?? '#E3E7E1', 'data-fx-field="empty"', t('Parte vacía'))}</span></div>
      ${fixed ? '' : rules(indicator, info, name)}`;
  } else if (indicator.type === 'number') {
    body = `<div class="fxrow2">${glyph('mdi:format-superscript')}<div class="seg">${(
      [
        ['tr', 'mdi:arrow-top-right', t('Arriba a la derecha')],
        ['br', 'mdi:arrow-bottom-right', t('Abajo a la derecha')],
        ['b', 'mdi:arrow-down', t('Debajo')],
      ] as const
    )
      .map(([value, icon, label]) =>
        ib(label, icon, `data-fx-position="${value}" aria-pressed="${(indicator.position ?? 'tr') === value}"`),
      )
      .join('')}</div></div>`;
  } else body = rules(indicator, info, name);
  return `<div class="fxed"><label class="srcpill">${glyph('mdi:database-arrow-right-outline')}<select data-fx-source aria-label="${e(t('Lectura'))}">${options}</select></label>${now}${body}</div>${tryValue(draft, info)}`;
}

export function indicatorsEditor(
  draft: IndicatorDraft,
  device: Device | undefined,
  entities: readonly string[],
  hass: Hass | undefined,
): string {
  const sources = indicatorSources(entities, hass);
  const rows = draft.list
    .map((indicator, index) => {
      const info = readingInfo(hass, indicator.entity, indicator.attribute);
      const [label, icon] = LABELS[indicator.type];
      return `<div class="fxitem${index === draft.selected ? ' sel' : ''}"><button type="button" class="fxpick" data-fx-select="${index}"><span class="ico-tile">${glyph(icon)}</span><span class="t"><b>${e(t(label))}</b><span>${e(nameOf(hass, sourceOf(indicator)))} · ${e(t(KIND_LABEL[info.kind]))}</span></span></button>${ib(indicator.hidden ? t('Mostrar') : t('Ocultar'), indicator.hidden ? 'mdi:eye-off-outline' : 'mdi:eye-outline', `data-fx-toggle="${index}"`)}${ib(t('Quitar'), 'mdi:trash-can-outline', `data-fx-remove="${index}"`)}</div>`;
    })
    .join('');
  const missing = INDICATOR_TYPES.filter(type => !draft.list.some(item => item.type === type));
  const add = missing.length
    ? `<div class="addmods">${missing
        .map(type => {
          const [label, icon] = LABELS[type];
          return `<button type="button" data-fx-add="${type}" title="${e(t(label))}"${sources.length ? '' : ' disabled'}>${glyph('mdi:plus')}${glyph(icon)}<span>${e(t(label))}</span></button>`;
        })
        .join('')}</div>`
    : '';
  return `<div class="fxprev">${preview(draft, device, hass)}</div><div class="fxlist">${rows}</div>${selectedEditor(draft, sources, hass)}${add}`;
}

/** Applies one change from the editor; null when the target is not one of its fields. */
export function indicatorsChange(
  draft: IndicatorDraft,
  target: HTMLElement,
  entities: readonly string[],
  hass: Hass | undefined,
): IndicatorDraft | null {
  const next: IndicatorDraft = structuredClone(draft);
  const current = next.list[next.selected];
  const data = target.dataset;
  const value = (target as HTMLInputElement).value;
  const info = () => readingInfo(hass, current!.entity, current!.attribute);
  if (data.fxAdd) {
    const source = indicatorSources(entities, hass).find(item => {
      const [entity, attribute] = item.split('#');
      return data.fxAdd !== 'ring' || readingInfo(hass, entity, attribute).kind === 'number';
    });
    if (!source) return null;
    const [entity, attribute] = source.split('#');
    const reading = readingInfo(hass, entity, attribute);
    const type = data.fxAdd as IndicatorType;
    const item: Indicator = {
      type,
      entity,
      ...(attribute ? { attribute } : {}),
      ...(type === 'number' ? { position: 'tr' as const } : defaultColors(reading)),
      ...(type === 'ring'
        ? { min: reading.min ?? 0, max: reading.max ?? 100, width: 4, fill: '#4F7A5A', empty: '#E3E7E1' }
        : {}),
    };
    next.list.push(item);
    next.selected = next.list.length - 1;
    delete next.test;
    return next;
  }
  if (data.fxSelect !== undefined) {
    next.selected = Number(data.fxSelect);
    delete next.test;
    return next;
  }
  if (data.fxToggle !== undefined) {
    const item = next.list[Number(data.fxToggle)];
    if (item.hidden) delete item.hidden;
    else item.hidden = true;
    return next;
  }
  if (data.fxRemove !== undefined) {
    next.list.splice(Number(data.fxRemove), 1);
    next.selected = Math.max(0, Math.min(next.selected, next.list.length - 1));
    delete next.test;
    return next;
  }
  if (!current) return null;
  if (target.hasAttribute('data-fx-source')) {
    const [entity, attribute] = value.split('#');
    current.entity = entity;
    if (attribute) current.attribute = attribute;
    else delete current.attribute;
    const reading = info();
    delete current.ranges;
    delete current.states;
    if (current.type !== 'number') Object.assign(current, defaultColors(reading));
    if (current.type === 'ring') Object.assign(current, { min: reading.min ?? 0, max: reading.max ?? 100 });
    delete next.test;
    return next;
  }
  if (data.fxField) {
    const field = data.fxField as 'min' | 'max' | 'width' | 'fill' | 'empty' | 'none';
    if (field === 'fill' || field === 'empty' || field === 'none') current[field] = value.toUpperCase();
    else {
      const number = Number(value);
      if (!Number.isFinite(number)) return null;
      if (field === 'width') current.width = Math.max(2, Math.min(10, Math.round(number)));
      else current[field] = number;
      if (current.min !== undefined && current.max !== undefined && current.min >= current.max) return null;
    }
    return next;
  }
  if (data.fxMode) {
    if (data.fxMode === 'fixed') current.fill = current.fill ?? '#4F7A5A';
    else {
      delete current.fill;
      if (!current.ranges?.length) Object.assign(current, defaultColors(info()));
    }
    return next;
  }
  if (data.fxPosition) {
    current.position = data.fxPosition as 'tr' | 'br' | 'b';
    return next;
  }
  if (data.fxState !== undefined) {
    current.states = { ...current.states, [data.fxState]: value.toUpperCase() };
    return next;
  }
  const at = (key: string) => Number(data[key]);
  if (data.fxRangeColor !== undefined) current.ranges![at('fxRangeColor')].color = value.toUpperCase();
  else if (data.fxRangeFrom !== undefined || data.fxRangeTo !== undefined) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    const range = current.ranges![at(data.fxRangeFrom !== undefined ? 'fxRangeFrom' : 'fxRangeTo')];
    if (data.fxRangeFrom !== undefined) range.from = number;
    else range.to = number;
    if (range.from > range.to) return null;
  } else if (data.fxRangeName !== undefined) {
    const range = current.ranges![at('fxRangeName')];
    if (value.trim()) range.name = value.trim().slice(0, 24);
    else delete range.name;
  } else if (data.fxRangeRemove !== undefined) current.ranges!.splice(at('fxRangeRemove'), 1);
  else if (target.hasAttribute('data-fx-range-add')) {
    const last = current.ranges?.at(-1);
    const from = last ? last.to + 1 : (info().min ?? 0);
    current.ranges = [...(current.ranges ?? []), { from, to: from + 10, color: '#4F7A5A' }];
  } else if (target.hasAttribute('data-fx-test')) {
    const number = Number(value);
    if (Number.isFinite(number)) next.test = number;
  } else if (data.fxTestState !== undefined) next.test = data.fxTestState;
  else return null;
  return next;
}

export const indicatorsEditorStyles = `
.fxprev{display:grid;place-items:center;padding:18px 0 12px;border-radius:14px;background:var(--hm-surface-2)}
.fxsym{position:relative;display:grid;place-items:center;width:84px;height:84px;border-radius:50%;background:var(--hm-surface);box-shadow:var(--hm-shadow)}
.fxsym ha-icon{--mdc-icon-size:40px;color:var(--hm-brand)}
.fxsym.bordered{box-shadow:0 0 0 4px var(--fx-border),var(--hm-shadow)}.fxsym.tinted ha-icon{color:var(--fx-icon)}
.fxsym .fx-ring{position:absolute;inset:calc(-1 * var(--fw) - 4px);border-radius:50%;background:conic-gradient(var(--fa) calc(var(--p) * 1%),var(--fb) 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - var(--fw)),#000 calc(100% - var(--fw) + 1px));mask:radial-gradient(farthest-side,transparent calc(100% - var(--fw)),#000 calc(100% - var(--fw) + 1px))}
.fxsym .fx-led{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--fc);box-shadow:0 0 0 2px var(--hm-surface),0 0 8px var(--fc)}
.fxsym .fx-num{position:absolute;min-width:24px;height:22px;padding:0 6px;border-radius:11px;background:var(--hm-ink);color:var(--hm-surface);font-size:12px;font-weight:700;line-height:22px;text-align:center}
.fxsym .fx-num[data-position=tr]{top:-6px;right:-12px}.fxsym .fx-num[data-position=br]{bottom:-6px;right:-12px}.fxsym .fx-num[data-position=b]{bottom:-26px;left:50%;transform:translateX(-50%)}
.fxlist{display:grid;gap:2px}
.fxitem{display:flex;align-items:center;gap:2px;border-radius:10px}.fxitem.sel{background:color-mix(in srgb,var(--hm-brand) 10%,transparent)}
.fxpick{flex:1;min-width:0;display:flex;align-items:center;gap:10px;min-height:46px;padding:4px 6px;border:0;background:transparent;text-align:left}
.fxpick .t{display:flex;flex-direction:column;min-width:0}.fxpick .t b{font-weight:500}.fxpick .t span{font-size:12px;color:var(--hm-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ico-tile{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:var(--hm-surface-2);color:var(--hm-brand)}.ico-tile ha-icon{--mdc-icon-size:18px}
.fxed{display:grid;gap:10px;padding:10px;border:1px solid var(--hm-line);border-radius:12px}
.srcpill{display:flex;align-items:center;gap:8px;color:var(--hm-muted)}.srcpill select{flex:1}
.nowline{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--hm-muted)}.nowline b{color:var(--hm-ink)}
.nowline .dot{width:12px;height:12px;border-radius:50%;background:var(--c)}
.nowline .ib{width:28px;height:28px;min-height:28px;margin-left:auto}
.grid4{display:grid;grid-template-columns:24px 1fr auto 1fr;align-items:center;gap:8px;color:var(--hm-muted)}
.grid4 .num input{width:100%}
.fxrow2{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:8px;color:var(--hm-muted)}
.fxrow2 input[type=range]{padding:0;border:0;background:transparent;accent-color:var(--hm-brand)}
.swpair{display:flex;gap:6px}
.scale{display:grid;gap:6px}
.srow{display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:8px}.srow.hit{background:color-mix(in srgb,var(--hm-brand) 12%,transparent)}
.fx-host .sw{position:relative;flex:none;overflow:hidden;width:26px;height:26px;border-radius:50%;border:1px solid color-mix(in srgb,var(--hm-ink) 18%,transparent);background:var(--c)}
.fx-host .sw input{position:absolute;inset:0;width:100%;height:100%;min-height:0;padding:0;border:0;opacity:0;cursor:pointer}
.srow .num{padding:0 4px}.srow .num input{width:46px;text-align:center}.srow .rname{flex:1 1 60px;min-width:40px;min-height:34px;padding:2px 8px}.srow .opt{flex:1}
.srow .ib{width:30px;height:30px;min-height:30px}
.fxtry{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:8px;color:var(--hm-muted)}
.fxtry input[type=range]{padding:0;border:0;background:transparent;accent-color:var(--hm-brand)}
.chip{display:inline-flex;align-items:center;min-height:32px;padding:4px 10px;border:1px solid var(--hm-line);border-radius:999px;background:var(--hm-surface);font-size:12.5px}
.chip[aria-pressed=true]{border-color:var(--hm-brand);color:var(--hm-brand)}.chip.add{border-style:dashed;color:var(--hm-muted)}.chip ha-icon{--mdc-icon-size:16px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.muted{color:var(--hm-muted)}
`;
