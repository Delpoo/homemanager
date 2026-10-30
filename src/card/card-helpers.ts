import { t } from '../i18n/index.js';
import { presentationOf } from '../model/archetype.js';
import { type Configuration, type Device, type Hass, type RuntimeState } from './types.js';
export const confidenceLabel = (confidence: string) =>
  (
    ({
      confirmed: t('Confirmado'),
      estimated: t('Estimado'),
      sent: t('Comando aceptado'),
      unknown: t('Desconocido'),
      error: t('Error'),
    }) as Record<string, string>
  )[confidence] ?? t('Desconocido');
export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Screen distance under which two markers would overlap: they are grouped instead. */
// 44 px marker + its detail badge overhang (7 px) + a little air.
export const GROUP_DISTANCE = 54;
export const LONG_PRESS_MS = 480;
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** The dashboard this card is shown in, from the URL, when it is a Lovelace panel.
 * An explicit dashboard_path still wins; undefined means the default dashboard. */
export function currentDashboardPath(hass: Hass): string | undefined {
  const segment = location.pathname.split('/').filter(Boolean)[0];
  if (!segment || segment === 'lovelace') return undefined;
  const panel = hass.panels?.[segment];
  return panel &&
    (panel.component_name === undefined || panel.component_name === 'lovelace') &&
    /^[a-z0-9][a-z0-9_-]{0,239}$/.test(segment)
    ? segment
    : undefined;
}
export const layer = (d: Device, hass?: Hass) => presentationOf(d, hass).layer;
export interface Adapter {
  configure(c: Configuration): void;
  setHass(h: Hass | null): void;
  subscribe(fn: (s: RuntimeState) => void): () => void;
  getSnapshot(): RuntimeState;
  executeAction(id: string, deviceId?: string): Promise<unknown>;
  executePrimary(id: string): Promise<unknown>;
  getActionAvailability(id: string): { available: boolean; reason?: string };
  getEntityCommandAvailability(
    deviceId: string,
    command: { service: string; data?: Record<string, unknown> },
    entityId?: string,
  ): { available: boolean; reason?: string };
  executeEntityCommand(
    deviceId: string,
    command: { service: string; data?: Record<string, unknown> },
    entityId?: string,
  ): Promise<unknown>;
  dispose(): void;
}
