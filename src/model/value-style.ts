import { finiteNumber, type ModelDevice, type ModelHass } from './types.js';
import { stateName } from './names.js';

/** How one reading looks on the symbol (#92). Visual only: no rule, nothing is sent. */
export interface ValueRange {
  /** From this value up, until the next range. */
  from: number;
  color: string;
}
export interface ValueStyle {
  entity: string;
  /** Absent: as Home Assistant shows it (display_precision). */
  decimals?: number;
  /** Absent: shown. */
  unit?: boolean;
  /** A short name before the value, so each number says what it is. */
  label?: string;
  size?: 's' | 'm' | 'l';
  color?: string;
  ranges?: ValueRange[];
  /** A colored dot (LED) beside the value, following the ranges. */
  dot?: boolean;
}
export interface ShownValue {
  entity: string;
  text: string;
  /** Everything, for the tooltip and the screen reader: never cut silently. */
  full: string;
  label?: string;
  size: 's' | 'm' | 'l';
  color?: string;
  dot?: string;
}
/** A safe technical ceiling for the symbol; the device screen shows them all. */
export const MAX_SYMBOL_VALUES = 8;

const ABBREVIATE: Record<string, [string, number][]> = {
  W: [
    ['kW', 1e3],
    ['MW', 1e6],
  ],
  Wh: [
    ['kWh', 1e3],
    ['MWh', 1e6],
  ],
  VA: [['kVA', 1e3]],
  B: [
    ['kB', 1e3],
    ['MB', 1e6],
    ['GB', 1e9],
  ],
};
/** 1753 W → 1,75 kW: a legible size for the plan. */
export function abbreviate(value: number, unit: string): { value: number; unit: string } {
  const steps = ABBREVIATE[unit];
  if (!steps) return { value, unit };
  let chosen = { value, unit };
  for (const [name, factor] of steps) if (Math.abs(value) >= factor) chosen = { value: value / factor, unit: name };
  return chosen;
}

export function rangeColor(value: number, ranges: readonly ValueRange[] | undefined): string | undefined {
  if (!ranges?.length) return undefined;
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  let color: string | undefined;
  for (const range of sorted) if (value >= range.from) color = range.color;
  return color;
}

export function formatReading(
  state: string,
  unit: string,
  style: Pick<ValueStyle, 'decimals' | 'unit'>,
  language: string,
  precision?: number | null,
): string {
  const number = finiteNumber(state);
  if (number === null) return state;
  const shown = style.unit === false ? { value: number, unit: '' } : abbreviate(number, unit);
  const abbreviated = shown.unit !== unit;
  const digits = style.decimals ?? (abbreviated ? 2 : (precision ?? undefined));
  let text: string;
  try {
    text = new Intl.NumberFormat(language, {
      ...(digits === undefined
        ? { maximumFractionDigits: 3 }
        : { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    }).format(shown.value);
  } catch {
    text = String(shown.value);
  }
  return shown.unit ? `${text} ${shown.unit}` : text;
}

/** The readings a symbol shows, in order, formatted; empty when it has no value styles. */
export function shownValues(device: ModelDevice, hass: ModelHass | undefined): ShownValue[] {
  const language = hass?.locale?.language ?? hass?.language ?? 'es';
  return (device.display.values ?? []).slice(0, MAX_SYMBOL_VALUES).map(style => {
    const entity = hass?.states[style.entity];
    const unit =
      typeof entity?.attributes?.unit_of_measurement === 'string' ? entity.attributes.unit_of_measurement : '';
    const missing = !entity || ['unknown', 'unavailable'].includes(entity.state);
    const number = missing ? null : finiteNumber(entity.state);
    const text = missing
      ? '—'
      : number === null
        ? stateName(entity.state, hass)
        : formatReading(entity.state, unit, style, language, hass?.entities?.[style.entity]?.display_precision);
    const ranged = number === null ? undefined : rangeColor(number, style.ranges);
    return {
      entity: style.entity,
      text,
      full: style.label ? `${style.label} ${text}` : text,
      ...(style.label ? { label: style.label } : {}),
      size: style.size ?? 'm',
      ...(ranged && !style.dot ? { color: ranged } : style.color ? { color: style.color } : {}),
      ...(style.dot && ranged ? { dot: ranged } : {}),
    };
  });
}
