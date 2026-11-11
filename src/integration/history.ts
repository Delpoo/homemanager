import type { Hass } from '../ha/types.js';

/** 0.13 charts: the numeric history of one reading, from Home Assistant's recorder.
 * Read-only; at most 60 points (bucket averages), kept for a minute. */
export const PERIOD_HOURS = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 } as const;
export type ChartPeriod = keyof typeof PERIOD_HOURS;
const MAX_POINTS = 60;
export type HistorySample = { at: number; value: number | null };
export type HistorySeries = { samples: HistorySample[]; from: number; to: number };
const cache = new WeakMap<Pick<Hass, 'callWS'>, Map<string, { at: number; series: Promise<HistorySeries> }>>();

type Row = {
  s?: unknown;
  state?: unknown;
  a?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  lu?: number;
  lc?: number;
  last_updated?: string;
  last_changed?: string;
};

/** Averages a long list into at most `max` buckets, keeping its shape. */
export function downsample(values: number[], max = MAX_POINTS): number[] {
  if (values.length <= max) return values;
  const size = values.length / max;
  return Array.from({ length: max }, (_, index) => {
    const part = values.slice(Math.floor(index * size), Math.floor((index + 1) * size));
    return part.reduce((sum, value) => sum + value, 0) / Math.max(1, part.length);
  });
}

/** The numbers a list of recorder rows holds (its state, or one attribute). */
export function rowNumbers(rows: Row[], attribute?: string): number[] {
  return rows.map(row => rowNumber(row, attribute)).filter((value): value is number => value !== null);
}

function rowNumber(row: Row, attribute?: string): number | null {
  const raw = attribute ? (row.a ?? row.attributes)?.[attribute] : (row.s ?? row.state);
  if (typeof raw !== 'number' && (typeof raw !== 'string' || !raw.trim())) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function historySeries(
  hass: Pick<Hass, 'callWS'> | undefined,
  entityId: string,
  period: ChartPeriod = '24h',
  attribute?: string,
): Promise<HistorySeries> {
  const to = Date.now();
  const from = to - PERIOD_HOURS[period] * 3600000;
  if (!hass?.callWS) return Promise.reject(new Error('Recorder unavailable'));
  const key = JSON.stringify([entityId, period, attribute]);
  const entries = cache.get(hass) ?? new Map();
  cache.set(hass, entries);
  const hit = entries.get(key);
  if (hit && to - hit.at < 60000) return hit.series;
  const series = hass
    .callWS<Record<string, Row[]>>({
      type: 'history/history_during_period',
      start_time: new Date(from).toISOString(),
      entity_ids: [entityId],
      minimal_response: !attribute,
      no_attributes: !attribute,
      significant_changes_only: false,
    })
    .then(result => {
      const rows = result?.[entityId] ?? [];
      const points = rows
        .map(row => {
          const seconds = row.lu ?? row.lc;
          return {
            at: typeof seconds === 'number' ? seconds * 1000 : Date.parse(row.last_updated ?? row.last_changed ?? ''),
            value: rowNumber(row, attribute),
          };
        })
        .filter(point => Number.isFinite(point.at) && point.at <= to)
        .sort((a, b) => a.at - b.at);
      const samples: HistorySample[] = [];
      // Preserve time and unavailable intervals while bounding the plot.
      for (const point of points) {
        const at = Math.max(from, point.at);
        const previous = samples.at(-1);
        if (
          previous &&
          Math.floor(((at - from) / (to - from)) * MAX_POINTS) ===
            Math.floor(((previous.at - from) / (to - from)) * MAX_POINTS) &&
          (previous.value === null) === (point.value === null)
        ) {
          samples[samples.length - 1] = { at, value: point.value };
        } else samples.push({ at, value: point.value });
      }
      return { from, to, samples: samples.slice(-240) };
    })
    .catch(error => {
      if (entries.get(key)?.series === series) entries.delete(key);
      throw error;
    });
  entries.set(key, { at: to, series });
  if (entries.size > 128) entries.delete(entries.keys().next().value!);
  return series;
}

/** Numeric compatibility helper for consumers that only need the series shape. */
export async function historyPoints(
  hass: Pick<Hass, 'callWS'> | undefined,
  entityId: string,
  period: ChartPeriod = '24h',
  attribute?: string,
): Promise<number[]> {
  try {
    const { samples } = await historySeries(hass, entityId, period, attribute);
    return downsample(samples.flatMap(point => (point.value === null ? [] : [point.value])));
  } catch {
    return [];
  }
}
