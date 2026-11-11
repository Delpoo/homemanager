import type { Hass } from '../ha/types.js';

/** 0.13 charts: the numeric history of one reading, from Home Assistant's recorder.
 * Read-only; at most 60 points (bucket averages), kept for a minute. */
export const PERIOD_HOURS = { '1h': 1, '24h': 24, '7d': 168 } as const;
export type ChartPeriod = keyof typeof PERIOD_HOURS;
const MAX_POINTS = 60;
const cache = new Map<string, { at: number; points: Promise<number[]> }>();

type Row = { s?: unknown; state?: unknown; a?: Record<string, unknown>; attributes?: Record<string, unknown> };

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
  return rows
    .map(row => (attribute ? (row.a ?? row.attributes)?.[attribute] : (row.s ?? row.state)))
    .map(value => (typeof value === 'number' ? value : Number(value)))
    .filter(value => Number.isFinite(value));
}

export function historyPoints(
  hass: Pick<Hass, 'callWS'> | undefined,
  entityId: string,
  period: ChartPeriod = '24h',
  attribute?: string,
): Promise<number[]> {
  if (!hass?.callWS) return Promise.resolve([]);
  const key = `${entityId}|${period}|${attribute ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.points;
  const points = hass
    .callWS<Record<string, Row[]>>({
      type: 'history/history_during_period',
      start_time: new Date(Date.now() - PERIOD_HOURS[period] * 3600000).toISOString(),
      entity_ids: [entityId],
      minimal_response: !attribute,
      no_attributes: !attribute,
      significant_changes_only: false,
    })
    .then(result => downsample(rowNumbers(result?.[entityId] ?? [], attribute)))
    .catch(() => []);
  cache.set(key, { at: Date.now(), points });
  return points;
}
