import { t } from '../i18n/index.js';
import {
  CONTROL_STEPS,
  CONTROL_TYPES,
  TYPE_ICONS,
  controlsOf,
  offIcon,
  serviceLabel,
  suggestControls,
  typeHint,
  typeLabel,
} from '../card/device-controls.js';
import {
  escapeHTML as esc,
  type Action,
  type Configuration,
  type ControlType,
  type Device,
  type DeviceControl,
  type SymbolSize,
} from '../card/types.js';
import { iconButton } from '../ui/icon-button.js';
import { iconPicker } from '../ui/icon-picker.js';
import { helpTip } from '../ui/help-tip.js';
import { upsertAction } from './model.js';

/**
 * The part of a device sheet that says how the symbol is used: what a tap does,
 * which controls the device has (by how they are operated), which ones are
 * pinned next to the symbol and how big it is. Everything is visible and
 * editable: a new device starts with suggested controls, never hidden defaults.
 *
 * Steps reference plan actions; a suggestion (`new:domain.service:entity`)
 * becomes an action when the sheet is saved.
 */
export interface SheetModel {
  /** Device the model belongs to ('' for a new one). */
  key: string;
  controls: DeviceControl[];
  tap: string | null;
  pinned: string[];
  size: SymbolSize;
}
export interface Suggestion {
  value: string;
  label: string;
  /** Group heading (the entity it acts on). */
  group: string;
}
export const MAX_CONTROLS = 8;
export const MAX_PINNED = 3;
const NEW = /^new:([a-z_]+)\.([a-z_]+):([a-z0-9_]+\.[a-z0-9_]+)$/;

export function sheetFromDevice(device: Device | undefined, key: string, configuration?: Configuration): SheetModel {
  const controls = device ? structuredClone(controlsOf(device)) : [];
  let tap: string | null = null;
  if (device?.bindings.tap !== undefined) tap = device.bindings.tap ?? null;
  else if (device?.bindings.primaryAction) {
    // A 0.5 plan: its primary action becomes a visible button control.
    const id = uniqueControlId(controls, 'tap');
    const action = configuration?.actions[device.bindings.primaryAction];
    controls.unshift({
      id,
      type: 'button',
      label: action ? serviceLabel(action.service, action.domain) : t('Al tocar'),
      steps: [{ actionId: device.bindings.primaryAction }],
    });
    tap = id;
  }
  return {
    key,
    controls,
    tap,
    pinned: [...(device?.display.pinned ?? [])],
    size: device?.display.size ?? 'm',
  };
}

/** The sheet as a new device from an entity would start: suggested controls. */
export function suggestedSheet(
  key: string,
  deviceId: string,
  entityId: string | null,
  icon: string,
  canCall: (domain: string, service: string) => boolean,
): SheetModel {
  if (!entityId) return { key, controls: [], tap: null, pinned: [], size: 'm' };
  const suggested = suggestControls(deviceId, entityId, icon, canCall);
  const controls = suggested.controls.map(control => ({
    ...control,
    steps: control.steps.map(step => {
      const action = suggested.actions[step.actionId];
      return { ...step, actionId: `new:${action.domain}.${action.service}:${entityId}` };
    }),
  }));
  return { key, controls, tap: suggested.tap, pinned: [], size: 'm' };
}

export function uniqueControlId(controls: DeviceControl[], base: string): string {
  const stem =
    base
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'control';
  let id = stem,
    index = 2;
  while (controls.some(control => control.id === id)) id = `${stem}-${index++}`;
  return id;
}

/** A new control of a type, prefilled with the suggestions that fit it. */
export function addControl(model: SheetModel, type: ControlType, suggestions: Suggestion[], icon: string): void {
  if (model.controls.length >= MAX_CONTROLS) return;
  const pick = (service: string) => suggestions.find(item => item.value.split(':')[1]?.endsWith(`.${service}`));
  const [min] = CONTROL_STEPS[type];
  let steps: DeviceControl['steps'] = [];
  if (type === 'cycle') {
    const on = pick('turn_on') ?? pick('open_cover'),
      off = pick('turn_off') ?? pick('close_cover');
    steps = [
      { actionId: on?.value ?? '', label: on?.label, icon },
      { actionId: off?.value ?? '', label: off?.label, icon: offIcon(icon) },
    ];
  } else if (type === 'button') steps = [{ actionId: (pick('toggle') ?? suggestions[0])?.value ?? '' }];
  else steps = Array.from({ length: min }, () => ({ actionId: '' }));
  const control: DeviceControl = {
    id: uniqueControlId(model.controls, typeLabel(type)),
    type,
    label: typeLabel(type),
    steps: steps.map(step =>
      Object.fromEntries(Object.entries(step).filter(([, value]) => value !== undefined)),
    ) as DeviceControl['steps'],
  };
  if (type === 'slider') control.orientation = 'vertical';
  if (type === 'updown')
    control.steps = [
      { actionId: '', label: t('Subir') },
      { actionId: '', label: t('Bajar') },
    ];
  model.controls.push(control);
  if (model.tap === null && (type === 'button' || type === 'cycle') && model.controls.length === 1)
    model.tap = control.id;
}

export function removeControl(model: SheetModel, index: number): void {
  const [removed] = model.controls.splice(index, 1);
  if (!removed) return;
  if (model.tap === removed.id) model.tap = null;
  model.pinned = model.pinned.filter(id => id !== removed.id);
}

/** Options of a step's action select: suggestions grouped by entity, then the plan's actions. */
export function actionOptionsHtml(
  selected: string,
  suggestions: Suggestion[],
  actionOptions: { id: string; label: string }[],
): string {
  const option = (value: string, text: string) =>
    `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(text)}</option>`;
  const groups = new Map<string, Suggestion[]>();
  for (const item of suggestions) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  const known = actionOptions.some(item => item.id === selected) || suggestions.some(item => item.value === selected);
  return `${option('', t('Elegir acción…'))}${selected && !known ? option(selected, t('{id} · pendiente', { id: selected })) : ''}${[...groups].map(([group, items]) => `<optgroup label="${esc(group)}">${items.map(item => option(item.value, item.label)).join('')}</optgroup>`).join('')}${actionOptions.length ? `<optgroup label="${esc(t('Acciones del plano'))}">${actionOptions.map(item => option(item.id, item.label)).join('')}</optgroup>` : ''}`;
}

/** Renders the section. `actionOptions` lists the plan's actions by id. */
export function renderControlsEditor(
  model: SheetModel,
  suggestions: Suggestion[],
  actionOptions: { id: string; label: string }[],
): string {
  const tapChoices = model.controls.filter(control => control.type === 'button' || control.type === 'cycle');
  const option = (value: string, text: string, selected: string) =>
    `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(text)}</option>`;
  const actionSelect = (selected: string, label: string, at: string) =>
    `<select ${at} data-field="action" aria-label="${esc(label)}">${actionOptionsHtml(selected, suggestions, actionOptions)}</select>`;
  const cards = model.controls
    .map((control, index) => {
      const [min, max] = CONTROL_STEPS[control.type];
      const at = `data-ctl="${index}"`;
      const valueMode = control.type === 'slider' && !control.steps.length;
      const pinned = model.pinned.includes(control.id);
      const stepName = (position: number) =>
        control.type === 'updown' ? [t('Subir'), t('Bajar')][position] : t('Paso {n}', { n: position + 1 });
      const actionLabel = (position: number) =>
        control.type === 'button'
          ? t('Acción de {control}', { control: control.label })
          : t('{control}: acción de {step}', { control: control.label, step: stepName(position) });
      const rows = valueMode
        ? `<label class="field">${esc(t('Entidad que ajusta'))}<input ${at} data-field="entity" data-entity-picker="" value="${esc(control.entityId ?? '')}" placeholder="${esc(t('La del dispositivo'))}" aria-label="${esc(t('Entidad que ajusta {name}', { name: control.label }))}"></label>`
        : control.steps
            .map(
              (step, position) =>
                `<div class="ctl-step">${control.type === 'cycle' || control.type === 'select' || control.type === 'button' ? iconPicker(step.icon ?? '', t('Icono de {step}', { step: stepName(position) }), `${at} data-step="${position}" data-field="icon"`) : `<span class="ctl-step-name">${esc(stepName(position))}</span>`}${actionSelect(step.actionId, actionLabel(position), `${at} data-step="${position}"`)}${control.type === 'button' ? '' : `<input ${at} data-step="${position}" data-field="step-label" maxlength="80" value="${esc(step.label ?? '')}" placeholder="${esc(stepName(position))}" aria-label="${esc(t('{control}: nombre de {step}', { control: control.label, step: stepName(position) }))}">`}${control.steps.length > Math.max(min, control.type === 'slider' ? 2 : 0) ? iconButton('ctl-step-remove', t('Quitar {step}', { step: stepName(position) }), 'close', `${at} data-step="${position}" class="hm-icon-button small"`) : ''}</div>`,
            )
            .join('');
      const more =
        !valueMode && control.steps.length < max && control.type !== 'button' && control.type !== 'updown'
          ? `<button type="button" class="ctl-add-step" data-command="ctl-step-add" ${at}>${esc(t('Agregar paso'))}</button>`
          : '';
      const slider =
        control.type === 'slider'
          ? `<div class="ctl-options"><div class="seg" role="group" aria-label="${esc(t('Qué recorre'))}"><button type="button" data-command="ctl-mode" data-mode="value" ${at} aria-pressed="${valueMode}">${esc(t('Valor de una entidad'))}</button><button type="button" data-command="ctl-mode" data-mode="steps" ${at} aria-pressed="${!valueMode}">${esc(t('Pasos'))}</button></div><div class="seg" role="group" aria-label="${esc(t('Orientación'))}"><button type="button" data-command="ctl-orientation" data-orientation="vertical" ${at} aria-pressed="${(control.orientation ?? 'vertical') === 'vertical'}" aria-label="${esc(t('Vertical'))}" title="${esc(t('Vertical'))}">↕</button><button type="button" data-command="ctl-orientation" data-orientation="horizontal" ${at} aria-pressed="${control.orientation === 'horizontal'}" aria-label="${esc(t('Horizontal'))}" title="${esc(t('Horizontal'))}">↔</button></div></div>`
          : '';
      return `<div class="ctl" ${at}><div class="ctl-bar"><ha-icon icon="${TYPE_ICONS[control.type]}" title="${esc(typeLabel(control.type))}"></ha-icon><input ${at} data-field="label" maxlength="80" required value="${esc(control.label)}" aria-label="${esc(t('Nombre del control ({type})', { type: typeLabel(control.type) }))}">${model.tap === control.id ? `<span class="ctl-badge">${esc(t('Al tocar'))}</span>` : ''}${iconButton('ctl-pin', pinned ? t('Quitar del plano') : t('Mostrar en el plano'), 'pin', `${at} aria-pressed="${pinned}" class="hm-icon-button small"${!pinned && model.pinned.length >= MAX_PINNED ? ' disabled' : ''}`)}${iconButton('ctl-remove', t('Quitar control {name}', { name: control.label }), 'trash', `${at} data-danger="true" class="hm-icon-button small"`)}</div><p class="note ctl-hint">${esc(typeHint(control.type))}</p>${slider}<div class="ctl-steps">${rows}</div>${more}</div>`;
    })
    .join('');
  const add = CONTROL_TYPES.map(
    type =>
      `<button type="button" data-command="ctl-add" data-type="${type}" title="${esc(typeHint(type))}"${model.controls.length >= MAX_CONTROLS ? ' disabled' : ''}><ha-icon icon="${TYPE_ICONS[type]}"></ha-icon>${esc(typeLabel(type))}</button>`,
  ).join('');
  return `<section class="ctl-section" id="device-controls" aria-labelledby="ctl-title">
<div class="ctl-top"><label class="field"><span class="field-title">${esc(t('Al tocar el símbolo'))}${helpTip(t('Al tocar el símbolo'), t('Un pulsador envía siempre su acción; un ciclo envía la siguiente de sus acciones en cada toque y el símbolo muestra el icono de la última. Mantener pulsado abre siempre el panel.'))}</span><select data-sheet="tap" aria-label="${esc(t('Al tocar el símbolo'))}">${option('', t('Abrir el panel'), model.tap ?? '')}${tapChoices.map(control => option(control.id, control.label === typeLabel(control.type) ? control.label : `${control.label} · ${typeLabel(control.type)}`, model.tap ?? '')).join('')}</select></label>
</div>
<h3 id="ctl-title" class="field-title">${esc(t('Controles'))}${helpTip(t('Controles'), t('Se eligen por cómo se usan, no por lo que controlan: lo que hace cada paso es una acción. Aparecen en el panel; con el alfiler, hasta 3 quedan también junto al símbolo en el plano.'))}</h3>
${cards || `<p class="note">${esc(t('Sin controles. Agregá uno por cómo se usa:'))}</p>`}
<div class="ctl-add" role="group" aria-label="${esc(t('Agregar control'))}">${add}</div></section>`;
}

/** Size belongs to the common base, including symbols without a controls section. */
export function renderSymbolSize(current: SymbolSize): string {
  const sizes: [SymbolSize, string][] = [
    ['s', t('Chico')],
    ['m', t('Mediano')],
    ['l', t('Grande')],
  ];
  return `<div class="field symbol-size"><span class="field-title">${esc(t('Tamaño en el plano'))}</span><div class="seg" role="group" aria-label="${esc(t('Tamaño en el plano'))}">${sizes.map(([size, label]) => `<button type="button" data-command="sheet-size" data-size="${size}" aria-pressed="${current === size}">${esc(label)}</button>`).join('')}</div></div>`;
}

export const controlsEditorStyles = `
.ctl-section{display:grid;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid var(--hm-line)}
.ctl-section h3{font-size:14px;margin:4px 0 0}
.ctl-top{display:grid;gap:10px}
.seg{display:flex;gap:4px;flex-wrap:wrap}.seg button{flex:1 1 auto;min-height:40px;padding:6px 10px}
.seg button[aria-pressed=true]{background:var(--hm-accent);border-color:var(--hm-accent);color:var(--hm-on-accent)}
.ctl{display:grid;gap:8px;padding:10px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface)}
.ctl-bar{display:flex;align-items:center;gap:6px}.ctl-bar ha-icon{flex:0 0 24px;color:var(--hm-muted)}.ctl-bar input{flex:1;min-width:0}
.ctl-badge{font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px;background:var(--hm-accent);color:var(--hm-on-accent);white-space:nowrap}
.ctl-hint{margin:0}
.ctl-steps{display:grid;gap:6px}
.ctl-step{display:flex;gap:6px;align-items:center}.ctl-step select{flex:1.3;min-width:0}.ctl-step input{flex:1;min-width:0}
.ctl-step-name{flex:0 0 52px;font-size:12px;color:var(--hm-muted)}
.ctl-options{display:flex;gap:8px;flex-wrap:wrap}.ctl-options .seg:first-child{flex:1}
.ctl-add{display:flex;flex-wrap:wrap;gap:6px}.ctl-add button{display:inline-flex;align-items:center;gap:6px;flex:1 1 auto}
.ctl-add ha-icon{--mdc-icon-size:20px}
.ctl-add-step{justify-self:start}
@media(max-width:420px){.ctl-step{flex-wrap:wrap}.ctl-step select{flex-basis:calc(100% - 50px)}}`;

/** Applies a field edit; returns whether the section must be repainted. */
export function editField(model: SheetModel, target: HTMLInputElement | HTMLSelectElement | HTMLElement): boolean {
  if (target.dataset.sheet === 'tap') {
    model.tap = (target as HTMLSelectElement).value || null;
    return true;
  }
  const control = model.controls[Number(target.dataset.ctl)];
  if (!control) return false;
  const step = target.dataset.step === undefined ? undefined : control.steps[Number(target.dataset.step)];
  const value = 'value' in target ? String((target as HTMLInputElement).value ?? '') : '';
  switch (target.dataset.field) {
    case 'label':
      control.label = value;
      return false;
    case 'action':
      if (step) step.actionId = value;
      return false;
    case 'step-label':
      if (step) {
        if (value.trim()) step.label = value;
        else delete step.label;
      }
      return false;
    case 'icon':
      if (step) {
        if (value) step.icon = value;
        else delete step.icon;
      }
      return false;
    case 'entity':
      if (value.trim()) control.entityId = value.trim();
      else delete control.entityId;
      return false;
  }
  return false;
}

/** Applies a button of the section; returns whether it handled it. */
export function editCommand(model: SheetModel, button: HTMLElement, suggestions: Suggestion[], icon: string): boolean {
  const control = model.controls[Number(button.dataset.ctl)];
  switch (button.dataset.command) {
    case 'ctl-add':
      addControl(model, button.dataset.type as ControlType, suggestions, icon);
      return true;
    case 'ctl-remove':
      removeControl(model, Number(button.dataset.ctl));
      return true;
    case 'ctl-pin':
      if (!control) return false;
      if (model.pinned.includes(control.id)) model.pinned = model.pinned.filter(id => id !== control.id);
      else if (model.pinned.length < MAX_PINNED) model.pinned.push(control.id);
      return true;
    case 'ctl-step-add':
      if (control && control.steps.length < CONTROL_STEPS[control.type][1]) control.steps.push({ actionId: '' });
      return true;
    case 'ctl-step-remove':
      control?.steps.splice(Number(button.dataset.step), 1);
      return true;
    case 'ctl-mode':
      if (!control) return false;
      if (button.dataset.mode === 'value') control.steps = [];
      else {
        delete control.entityId;
        if (control.steps.length < 2) control.steps = [{ actionId: '' }, { actionId: '' }];
      }
      return true;
    case 'ctl-orientation':
      if (control) control.orientation = button.dataset.orientation === 'horizontal' ? 'horizontal' : 'vertical';
      return true;
    case 'sheet-size':
      model.size = (button.dataset.size as SymbolSize) ?? 'm';
      return true;
  }
  return false;
}

/** Adds a simple action under an id derived from `base`, or reuses the action
 * that already does exactly the same; another action with that id is never
 * repurposed (a numbered id is used instead). */
export function placeAction(
  configuration: Configuration,
  base: string,
  action: Action,
): { configuration: Configuration; id: string } {
  const stem = base.replace(/-+/g, '-').slice(0, 110);
  const same = (found?: Action) =>
    found?.domain === action.domain &&
    found.service === action.service &&
    JSON.stringify(found.target.entity_id) === JSON.stringify(action.target.entity_id) &&
    !Object.keys(found.data ?? {}).length;
  let id = stem;
  for (let index = 2; Object.hasOwn(configuration.actions, id) && !same(configuration.actions[id]); index++)
    id = `${stem}-${index}`;
  return {
    configuration: Object.hasOwn(configuration.actions, id) ? configuration : upsertAction(configuration, id, action),
    id,
  };
}

/** Turns the model into the device's controls, creating the suggested actions.
 * Steps without an action are dropped; a control left without enough steps is
 * reported by name instead of being saved half-done. */
export function resolveSheet(
  model: SheetModel,
  configuration: Configuration,
  deviceId: string,
  suggestions: Suggestion[],
): {
  configuration: Configuration;
  controls: DeviceControl[];
  tap: string | null;
  pinned: string[];
  size: SymbolSize;
  incomplete: string[];
} {
  let next = configuration;
  const labels = new Map(suggestions.map(item => [item.value, item.label]));
  const incomplete: string[] = [];
  const controls: DeviceControl[] = [];
  for (const control of model.controls) {
    const steps = control.steps.flatMap(step => {
      let actionId = step.actionId;
      if (!actionId) return [];
      const created = NEW.exec(actionId);
      if (created) {
        const [, domain, service, entityId] = created;
        const placed = placeAction(
          next,
          `${deviceId}-${entityId.split('.')[1].replace(/_/g, '-')}-${service.replace(/_/g, '-')}`,
          { domain: domain as Action['domain'], service, target: { entity_id: entityId } },
        );
        next = placed.configuration;
        actionId = placed.id;
      }
      const label =
        step.label?.trim() || (created && control.type !== 'button' ? labels.get(step.actionId) : undefined);
      return [{ actionId, ...(label ? { label: label.slice(0, 80) } : {}), ...(step.icon ? { icon: step.icon } : {}) }];
    });
    const [min] = CONTROL_STEPS[control.type];
    const sliderValue = control.type === 'slider' && !control.steps.length;
    if ((!sliderValue && steps.length < Math.max(min, control.type === 'slider' ? 2 : 1)) || !control.label.trim()) {
      incomplete.push(control.label.trim() || typeLabel(control.type));
      continue;
    }
    controls.push({
      id: control.id,
      type: control.type,
      label: control.label.trim().slice(0, 80),
      steps,
      ...(sliderValue && control.entityId ? { entityId: control.entityId } : {}),
      ...(control.type === 'slider' ? { orientation: control.orientation ?? 'vertical' } : {}),
    });
  }
  const ids = new Set(controls.map(control => control.id));
  return {
    configuration: next,
    controls,
    tap: model.tap && ids.has(model.tap) ? model.tap : null,
    pinned: model.pinned.filter(id => ids.has(id)),
    size: model.size,
    incomplete,
  };
}

/** Readable name of a plan action for the selects: what it does, on what. */
export function actionName(action: Action, name: (entityId: string) => string): string {
  const target = Array.isArray(action.target.entity_id) ? action.target.entity_id : [action.target.entity_id];
  return `${serviceLabel(action.service, action.domain)} · ${target.map(name).join(', ')}`;
}
