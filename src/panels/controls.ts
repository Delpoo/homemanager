import { presentationSuggestion } from '../model/archetype.js';
import { t } from '../i18n/index.js';
import type { HassEntity } from '../card/types.js';

/**
 * Capability model for native panels. Pure functions: from an HA entity (state,
 * attributes, supported_features) derive the controls that make sense for it,
 * and from a control + value derive the service call. Execution never happens
 * here: the adapter re-validates every command against its allowlist and the
 * live capabilities before calling HA (src/ha/actions.mjs).
 *
 * Feature flags follow HA Core (fan/cover/climate/light constants).
 */

export interface Command {
  service: string;
  data?: Record<string, unknown>;
}
interface Base {
  id: string;
  label: string;
}
export type Control =
  | (Base & { kind: 'toggle'; value: boolean | null; on: Command; off: Command })
  | (Base & {
      kind: 'range';
      min: number;
      max: number;
      step: number;
      value: number | null;
      unit: string;
      service: string;
      field: string;
      /** Extra fixed data merged into the command (never user-controlled). */
      scale?: 'percent';
    })
  | (Base & {
      /** Discrete levels (fan speeds). Every stop sends, including the current one. */
      kind: 'steps';
      count: number;
      /** Whether a 0 ("off") stop is offered. */
      off: boolean;
      /** 0 = off, 1..count, null = unknown. */
      value: number | null;
    })
  | (Base & {
      kind: 'stepper';
      min: number;
      max: number;
      step: number;
      value: number | null;
      unit: string;
      service: string;
      field: string;
    })
  | (Base & {
      kind: 'select';
      options: { value: string; label: string }[];
      value: string | null;
      service: string;
      field: string;
    })
  | (Base & { kind: 'buttons'; buttons: { id: string; label: string; icon: string; command: Command }[] })
  | (Base & { kind: 'script'; fields: ScriptFieldControl[] })
  | (Base & { kind: 'reading'; value: string; unit: string });

export interface ScriptFieldControl {
  name: string;
  label: string;
  type: 'select' | 'number' | 'boolean' | 'text';
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  default?: unknown;
}

const FAN = { SET_SPEED: 1, OSCILLATE: 2, DIRECTION: 4, PRESET_MODE: 8, TURN_OFF: 16, TURN_ON: 32 } as const;
const COVER = { OPEN: 1, CLOSE: 2, SET_POSITION: 4, STOP: 8 } as const;
const CLIMATE = {
  TARGET_TEMPERATURE: 1,
  FAN_MODE: 8,
  PRESET_MODE: 16,
  SWING_MODE: 32,
  TURN_OFF: 128,
  TURN_ON: 256,
} as const;
const BRIGHTNESS_MODES = ['brightness', 'color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'white'];

const has = (attributes: Record<string, unknown>, flag: number) => {
  const value = attributes.supported_features;
  return Number.isSafeInteger(value) && ((value as number) & flag) === flag;
};
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length <= 100).slice(0, 50)
    : [];
// Unknown state still accepts commands (assumed-state/RF devices); unavailable does not.
const live = (entity: HassEntity) => entity.state !== 'unavailable';
const options = (values: string[]) => values.map(value => ({ value, label: humanize(value) }));

/** "heat_cool" -> "Heat cool"; HA's own translations are not available to cards. */
export function humanize(value: string): string {
  const text = value.replace(/_/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
}

export function domainOf(entityId: string): string {
  return entityId.split('.')[0] ?? '';
}

/** Controls for one entity, in display order. Unavailable entities get none. */
export function entityControls(entityId: string, entity: HassEntity | undefined, scriptFields?: unknown): Control[] {
  if (!entity || !live(entity)) return [];
  const a = entity.attributes ?? {};
  const domain = domainOf(entityId);
  const controls: Control[] = [];
  const power = (on: Command, off: Command) =>
    controls.push({
      kind: 'toggle',
      id: 'power',
      label: t('Encendido'),
      // Unknown is shown as neither on nor off (assumed-state devices).
      value: entity.state === 'off' ? false : entity.state === 'unknown' ? null : true,
      on,
      off,
    });

  if (domain === 'light') {
    power({ service: 'turn_on' }, { service: 'turn_off' });
    const modes = list(a.supported_color_modes);
    if (modes.some(mode => BRIGHTNESS_MODES.includes(mode))) {
      const brightness = num(a.brightness);
      controls.push({
        kind: 'range',
        id: 'brightness',
        label: t('Brillo'),
        min: 1,
        max: 100,
        step: 1,
        value: entity.state === 'on' && brightness !== null ? Math.max(1, Math.round((brightness / 255) * 100)) : null,
        unit: '%',
        service: 'turn_on',
        field: 'brightness_pct',
      });
    }
    const min = num(a.min_color_temp_kelvin),
      max = num(a.max_color_temp_kelvin);
    if (modes.includes('color_temp') && min !== null && max !== null && min < max)
      controls.push({
        kind: 'range',
        id: 'color-temp',
        label: t('Temperatura de color'),
        min,
        max,
        step: 50,
        value: num(a.color_temp_kelvin),
        unit: 'K',
        service: 'turn_on',
        field: 'color_temp_kelvin',
      });
  } else if (domain === 'switch') {
    power({ service: 'turn_on' }, { service: 'turn_off' });
  } else if (domain === 'fan') {
    if (has(a, FAN.TURN_ON) && has(a, FAN.TURN_OFF)) power({ service: 'turn_on' }, { service: 'turn_off' });
    const percentageStep = num(a.percentage_step) ?? 1;
    const count = Math.round(100 / percentageStep);
    if (has(a, FAN.SET_SPEED) && count >= 2 && count <= 12) {
      const percentage = num(a.percentage);
      controls.push({
        kind: 'steps',
        id: 'speed',
        label: t('Velocidad'),
        count,
        off: has(a, FAN.TURN_OFF),
        value:
          entity.state === 'off'
            ? 0
            : percentage === null
              ? null
              : percentage <= 0
                ? 0
                : Math.max(1, Math.min(count, Math.round((percentage * count) / 100))),
      });
    } else if (has(a, FAN.SET_SPEED)) {
      const step = percentageStep;
      controls.push({
        kind: 'range',
        id: 'speed',
        label: t('Velocidad'),
        min: 0,
        max: 100,
        step: step > 0 && step <= 100 ? step : 1,
        value: num(a.percentage),
        unit: '%',
        service: 'set_percentage',
        field: 'percentage',
      });
    }
    const presets = list(a.preset_modes);
    if (has(a, FAN.PRESET_MODE) && presets.length)
      controls.push({
        kind: 'select',
        id: 'preset',
        label: t('Modo'),
        options: options(presets),
        value: typeof a.preset_mode === 'string' ? a.preset_mode : null,
        service: 'set_preset_mode',
        field: 'preset_mode',
      });
    if (has(a, FAN.OSCILLATE))
      controls.push({
        kind: 'toggle',
        id: 'oscillate',
        label: t('Oscilación'),
        value: typeof a.oscillating === 'boolean' ? a.oscillating : null,
        on: { service: 'oscillate', data: { oscillating: true } },
        off: { service: 'oscillate', data: { oscillating: false } },
      });
    if (has(a, FAN.DIRECTION))
      controls.push({
        kind: 'select',
        id: 'direction',
        label: t('Dirección'),
        options: [
          { value: 'forward', label: t('Normal') },
          { value: 'reverse', label: t('Inversa') },
        ],
        value: typeof a.direction === 'string' ? a.direction : null,
        service: 'set_direction',
        field: 'direction',
      });
  } else if (domain === 'cover') {
    const buttons: { id: string; label: string; icon: string; command: Command }[] = [];
    if (has(a, COVER.OPEN))
      buttons.push({ id: 'open', label: t('Abrir'), icon: '▲', command: { service: 'open_cover' } });
    if (has(a, COVER.STOP))
      buttons.push({ id: 'stop', label: t('Detener'), icon: '■', command: { service: 'stop_cover' } });
    if (has(a, COVER.CLOSE))
      buttons.push({ id: 'close', label: t('Cerrar'), icon: '▼', command: { service: 'close_cover' } });
    if (buttons.length) controls.push({ kind: 'buttons', id: 'movement', label: t('Movimiento'), buttons });
    if (has(a, COVER.SET_POSITION))
      controls.push({
        kind: 'range',
        id: 'position',
        label: t('Posición'),
        min: 0,
        max: 100,
        step: 1,
        value: num(a.current_position),
        unit: '%',
        service: 'set_cover_position',
        field: 'position',
      });
  } else if (domain === 'climate') {
    if (has(a, CLIMATE.TURN_ON) && has(a, CLIMATE.TURN_OFF)) power({ service: 'turn_on' }, { service: 'turn_off' });
    const modes = list(a.hvac_modes);
    if (modes.length)
      controls.push({
        kind: 'select',
        id: 'hvac',
        label: t('Modo'),
        options: options(modes),
        value: entity.state,
        service: 'set_hvac_mode',
        field: 'hvac_mode',
      });
    const min = num(a.min_temp),
      max = num(a.max_temp);
    if (has(a, CLIMATE.TARGET_TEMPERATURE) && min !== null && max !== null && min < max)
      controls.push({
        kind: 'stepper',
        id: 'temperature',
        label: t('Temperatura objetivo'),
        min,
        max,
        step: num(a.target_temp_step) ?? 0.5,
        value: num(a.temperature),
        unit: typeof a.temperature_unit === 'string' ? a.temperature_unit : '°',
        service: 'set_temperature',
        field: 'temperature',
      });
    for (const [flag, key, current, service, field, label] of [
      [CLIMATE.FAN_MODE, 'fan_modes', 'fan_mode', 'set_fan_mode', 'fan_mode', t('Ventilación')],
      [CLIMATE.PRESET_MODE, 'preset_modes', 'preset_mode', 'set_preset_mode', 'preset_mode', t('Preajuste')],
      [CLIMATE.SWING_MODE, 'swing_modes', 'swing_mode', 'set_swing_mode', 'swing_mode', t('Oscilación')],
    ] as const) {
      const values = list(a[key]);
      if (has(a, flag) && values.length)
        controls.push({
          kind: 'select',
          id: field,
          label,
          options: options(values),
          value: typeof a[current] === 'string' ? (a[current] as string) : null,
          service,
          field,
        });
    }
  } else if (domain === 'button') {
    controls.push({
      kind: 'buttons',
      id: 'press',
      label: t('Acción'),
      buttons: [{ id: 'press', label: t('Pulsar'), icon: '●', command: { service: 'press' } }],
    });
  } else if (domain === 'script') {
    controls.push({
      kind: 'script',
      id: 'run',
      label: t('Ejecutar script'),
      fields: scriptFieldControls(scriptFields),
    });
  } else {
    // Sensors and anything without a supported service: read-only.
    controls.push({
      kind: 'reading',
      id: 'reading',
      label: t('Lectura'),
      value: entity.state,
      unit: typeof a.unit_of_measurement === 'string' ? a.unit_of_measurement : '',
    });
  }
  return controls;
}

/** HA script field selectors -> form controls. Unsupported selectors are skipped;
 * the adapter then refuses to run a script whose required field has no value. */
export function scriptFieldControls(fields: unknown): ScriptFieldControl[] {
  if (!fields || typeof fields !== 'object') return [];
  const result: ScriptFieldControl[] = [];
  for (const [name, raw] of Object.entries(fields as Record<string, unknown>).slice(0, 20)) {
    const field = raw as {
      name?: unknown;
      required?: unknown;
      default?: unknown;
      selector?: Record<string, Record<string, unknown> | null>;
    };
    const selector = field?.selector && typeof field.selector === 'object' ? field.selector : {};
    const kind = Object.keys(selector)[0];
    const config = (kind ? selector[kind] : null) ?? {};
    const base = {
      name,
      label: typeof field.name === 'string' ? field.name : humanize(name),
      required: field.required === true,
      default: field.default,
    };
    if (kind === 'select') {
      const values = (Array.isArray(config.options) ? config.options : [])
        .map(option => (typeof option === 'string' ? option : (option as { value?: unknown })?.value))
        .filter((value): value is string => typeof value === 'string');
      if (values.length && config.multiple !== true) result.push({ ...base, type: 'select', options: values });
    } else if (kind === 'number')
      result.push({
        ...base,
        type: 'number',
        min: num(config.min) ?? undefined,
        max: num(config.max) ?? undefined,
        step: num(config.step) ?? 1,
      });
    else if (kind === 'boolean') result.push({ ...base, type: 'boolean' });
    else if (kind === 'text' && config.multiple !== true) result.push({ ...base, type: 'text' });
  }
  return result;
}

/** The service call for a control value. Ranges in percent are integers. */
export function commandFor(control: Control, value: unknown): Command {
  switch (control.kind) {
    case 'toggle':
      return value ? control.on : control.off;
    case 'range':
    case 'stepper': {
      const number = Math.min(control.max, Math.max(control.min, Number(value)));
      if (!Number.isFinite(number)) throw new Error(t('Valor fuera de rango.'));
      const rounded =
        control.unit === '%' || control.step >= 1
          ? Math.round(number)
          : Math.round(number / control.step) * control.step;
      return { service: control.service, data: { [control.field]: Number(rounded.toFixed(4)) } };
    }
    case 'steps': {
      const level = Number(value);
      if (!Number.isInteger(level) || level < (control.off ? 0 : 1) || level > control.count)
        throw new Error(t('Valor fuera de rango.'));
      // Same rounding as Home Assistant (ranged_value_to_percentage), so the fan
      // maps it back to exactly this level.
      return { service: 'set_percentage', data: { percentage: Math.floor((level * 100) / control.count) } };
    }
    case 'select': {
      if (!control.options.some(option => option.value === value)) throw new Error(t('Opción no disponible.'));
      return { service: control.service, data: { [control.field]: value } };
    }
    case 'script': {
      const variables = (value ?? {}) as Record<string, unknown>;
      return Object.keys(variables).length ? { service: 'turn_on', data: { variables } } : { service: 'turn_on' };
    }
    default:
      throw new Error(t('Este control no envía comandos.'));
  }
}

/** Primary tap behaviour for a freshly bound entity; null means "open the panel". */
export function defaultPrimaryCommand(entityId: string, entity: HassEntity | undefined): Command | null {
  const domain = domainOf(entityId);
  if (domain === 'light' || domain === 'switch') return { service: 'toggle' };
  if (
    domain === 'fan' &&
    entity &&
    has(entity.attributes ?? {}, FAN.TURN_ON) &&
    has(entity.attributes ?? {}, FAN.TURN_OFF)
  )
    return { service: 'toggle' };
  if (domain === 'button') return { service: 'press' };
  if (domain === 'script') return { service: 'turn_on' };
  return null;
}

/** Device kind and icon suggested by an entity, for one-step binding. */
export function suggestPresentation(entityId: string, entity: HassEntity | undefined): { kind: string; icon: string } {
  return presentationSuggestion(entityId, entity);
}

/** Whether a runtime value means "on/active" for styling (never a confirmation). */
export function isActiveValue(value: string | undefined): boolean {
  return (
    !!value &&
    [
      'on',
      'open',
      'opening',
      'heat',
      'cool',
      'heat_cool',
      'auto',
      'dry',
      'fan_only',
      'playing',
      'cleaning',
      'unlocked',
    ].includes(value)
  );
}
