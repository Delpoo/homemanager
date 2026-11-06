import { finiteNumber, type ModelDevice, type ModelHass } from './types.js';

/** Indicators (0.13): visual marks on a symbol driven by one Home Assistant reading.
 * Visual only — nothing here sends a command or decides an alert. A symbol has at
 * most one of each type. The reading is an entity's state or one of its attributes. */
export type IndicatorType = 'ring' | 'border' | 'icon' | 'led' | 'number';
export const INDICATOR_TYPES: IndicatorType[] = ['ring', 'border', 'icon', 'led', 'number'];
export interface IndicatorRange {
  from: number;
  to: number;
  color: string;
  name?: string;
}
export interface Indicator {
  type: IndicatorType;
  entity: string;
  attribute?: string;
  /** Kept but not drawn. */
  hidden?: boolean;
  /** Ring: empty at min, full at max; its thickness in px. */
  min?: number;
  max?: number;
  width?: number;
  /** Ring with one colour: the full part and the empty part. Without `fill`, ranges colour it. */
  fill?: string;
  empty?: string;
  /** Numbers: a colour per range (inclusive). */
  ranges?: IndicatorRange[];
  /** Yes/no and states: a colour per state. */
  states?: Record<string, string>;
  /** No data (unknown, unavailable, missing). */
  none?: string;
  /** Number: where it sits. */
  position?: 'tr' | 'br' | 'b';
}
export const MAX_INDICATOR_RANGES = 8;
export const MAX_INDICATOR_STATES = 16;
export const NO_DATA = '#9AA59F';

export type ReadingKind = 'number' | 'binary' | 'enum' | 'text';
export interface ReadingInfo {
  kind: ReadingKind;
  value: string | number | null;
  unit?: string;
  min?: number;
  max?: number;
  /** Known states, for yes/no and lists, with what Home Assistant calls them. */
  options?: string[];
  /** How the kind was found, said in the editor's tooltip. */
  how: string;
}
const BINARY_DOMAINS = ['binary_sensor', 'switch', 'light', 'fan', 'input_boolean', 'siren', 'automation'];
const STATES: Record<string, string[]> = {
  cover: ['open', 'opening', 'closing', 'closed'],
  lock: ['locked', 'unlocked', 'locking', 'unlocking', 'jammed', 'open'],
  vacuum: ['docked', 'cleaning', 'returning', 'paused', 'idle', 'error'],
  media_player: ['off', 'on', 'idle', 'playing', 'paused', 'standby'],
  alarm_control_panel: ['disarmed', 'armed_home', 'armed_away', 'armed_night', 'pending', 'triggered'],
  person: ['home', 'not_home'],
  device_tracker: ['home', 'not_home'],
  sun: ['above_horizon', 'below_horizon'],
};
const missing = (value: unknown) =>
  value === undefined || value === null || value === 'unknown' || value === 'unavailable';

/** What a reading is, from Home Assistant: its domain, device class, unit and value. */
export function readingInfo(hass: ModelHass | undefined, entity: string, attribute?: string): ReadingInfo {
  const state = hass?.states[entity];
  const domain = entity.split('.')[0];
  const raw = attribute ? state?.attributes?.[attribute] : state?.state;
  const attributes = (state?.attributes ?? {}) as Record<string, unknown>;
  const unit = attribute ? undefined : (attributes.unit_of_measurement as string | undefined);
  const value = missing(raw) ? null : (raw as string | number);
  const number = finiteNumber(value);
  const deviceClass = String(attributes.device_class ?? '');
  if (!attribute && BINARY_DOMAINS.includes(domain))
    return { kind: 'binary', value, options: ['on', 'off'], how: `${domain} › on/off` };
  const list = attribute
    ? undefined
    : Array.isArray(attributes.options)
      ? (attributes.options as unknown[]).map(String)
      : domain === 'climate' && Array.isArray(attributes.hvac_modes)
        ? (attributes.hvac_modes as unknown[]).map(String)
        : STATES[domain];
  if (list?.length)
    return { kind: 'enum', value, options: list.slice(0, MAX_INDICATOR_STATES), how: `${domain} › ${list.length}` };
  if (number !== null || typeof attributes.state_class === 'string' || unit) {
    const [low, high] = numericSpan(deviceClass, unit, attributes, attribute);
    return { kind: 'number', value: number ?? null, unit, min: low, max: high, how: deviceClass || unit || 'number' };
  }
  return { kind: 'text', value, how: domain };
}
function numericSpan(
  deviceClass: string,
  unit: string | undefined,
  attributes: Record<string, unknown>,
  attribute?: string,
): [number, number] {
  const min = finiteNumber(attributes.min),
    max = finiteNumber(attributes.max);
  if (!attribute && min !== null && max !== null && max > min) return [min, max];
  if (unit === '%' || ['battery', 'humidity', 'moisture'].includes(deviceClass) || attribute?.endsWith('position'))
    return [0, 100];
  if (deviceClass === 'temperature' || attribute?.includes('temperature')) return [-10, 50];
  if (deviceClass === 'power') return [0, 5000];
  return [0, 100];
}

/** The colour the indicator shows now, and the range or state that chose it. */
export function indicatorColor(indicator: Indicator, info: ReadingInfo): { color: string; name?: string } {
  const none = indicator.none ?? NO_DATA;
  if (info.value === null) return { color: none };
  if (indicator.type === 'ring' && indicator.fill) return { color: indicator.fill };
  if (info.kind === 'number' && typeof info.value === 'number') {
    const value = info.value;
    const hit = (indicator.ranges ?? []).find(range => value >= range.from && value <= range.to);
    return hit ? { color: hit.color, name: hit.name } : { color: none };
  }
  const color = indicator.states?.[String(info.value)];
  return color ? { color, name: String(info.value) } : { color: none };
}

/** Suggested colours for a reading: three even ranges for a number, one per state. */
export function defaultColors(info: ReadingInfo): Pick<Indicator, 'ranges' | 'states'> {
  if (info.kind === 'number') {
    const low = info.min ?? 0,
      high = info.max ?? 100,
      third = Math.round((high - low) / 3);
    return {
      ranges: [
        { from: low, to: low + third - 1, color: '#4F8FBF' },
        { from: low + third, to: low + 2 * third - 1, color: '#3F8F5F' },
        { from: low + 2 * third, to: high, color: '#D98B1F' },
      ],
    };
  }
  if (info.kind === 'binary') return { states: { on: '#3F8F5F', off: '#9AA59F' } };
  const palette = ['#4F7A5A', '#D98B1F', '#4F8FBF', '#D0453A', '#6F6BB8', '#3E9C9C', '#C9A66B', '#B2577F'];
  return {
    states: Object.fromEntries((info.options ?? []).map((state, index) => [state, palette[index % palette.length]])),
  };
}

/** What the symbol draws for its indicators. */
export interface Effects {
  ring?: { percent: number; color: string; empty: string; width: number };
  border?: string;
  icon?: string;
  led?: string;
  number?: { text: string; position: 'tr' | 'br' | 'b' };
}
export function effectsOf(device: ModelDevice, hass: ModelHass | undefined): Effects {
  const effects: Effects = {};
  for (const indicator of (device.display as { indicators?: Indicator[] }).indicators ?? []) {
    if (indicator.hidden) continue;
    const info = readingInfo(hass, indicator.entity, indicator.attribute);
    const { color } = indicatorColor(indicator, info);
    switch (indicator.type) {
      case 'ring': {
        if (info.kind !== 'number') break;
        const low = indicator.min ?? info.min ?? 0,
          high = indicator.max ?? info.max ?? 100;
        const value = typeof info.value === 'number' ? info.value : low;
        const percent = high > low ? Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100)) : 0;
        effects.ring = {
          percent: Math.round(percent),
          color,
          empty: indicator.empty ?? '#E3E7E1',
          width: indicator.width ?? 4,
        };
        break;
      }
      case 'border':
        effects.border = color;
        break;
      case 'icon':
        effects.icon = color;
        break;
      case 'led':
        effects.led = color;
        break;
      case 'number': {
        const value = info.value;
        effects.number = {
          text:
            value === null
              ? '—'
              : typeof value === 'number'
                ? String(Math.round(value * 10) / 10)
                : String(value).slice(0, 6),
          position: indicator.position ?? 'tr',
        };
        break;
      }
    }
  }
  return effects;
}
