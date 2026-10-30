import { entityOf, finiteNumber } from './types.js';
import type { ModelDevice, ModelEntity, ModelHass } from './types.js';

export type AlertLevel = 'critical' | 'warning';
export type AlertRule =
  | 'moisture'
  | 'smoke'
  | 'gas'
  | 'carbon_monoxide'
  | 'safety'
  | 'problem'
  | 'battery'
  | 'unavailable';
export interface DeviceAlert {
  id: string;
  deviceId: string;
  roomId: string | null;
  entityId: string;
  rule: AlertRule;
  level: AlertLevel;
  /** Spanish source key: the view translates it, keeping this module independent. */
  message: string;
}
const CRITICAL: Record<string, string> = {
  moisture: 'Fuga detectada',
  smoke: 'Humo detectado',
  gas: 'Gas detectado',
  carbon_monoxide: 'Monóxido de carbono detectado',
  safety: 'Alerta de seguridad',
  problem: 'Problema detectado',
};
const unavailableAfter = 10 * 60 * 1000;

/** Only enabled-by-default 0.7 rules. Door timers and custom ranges belong to 0.9. */
export function alertsOf(device: ModelDevice, hass: ModelHass | undefined, now: number): DeviceAlert[] {
  const entityId = device.bindings.entityId;
  const entity = entityOf(device, hass);
  if (!entityId || !entity) return [];
  const alerts: DeviceAlert[] = [];
  const add = (sourceId: string, rule: AlertRule, level: AlertLevel, message: string) =>
    alerts.push({
      id: `${device.id}:${sourceId}:${rule}`,
      deviceId: device.id,
      roomId: device.roomId,
      entityId: sourceId,
      rule,
      level,
      message,
    });
  const deviceClass = String(entity.attributes?.device_class ?? '');
  if (entityId.startsWith('binary_sensor.') && entity.state === 'on' && Object.hasOwn(CRITICAL, deviceClass))
    add(entityId, deviceClass as AlertRule, 'critical', CRITICAL[deviceClass]);
  if (entity.state === 'unavailable') {
    // last_updated can advance while still unavailable; only last_changed proves its duration.
    const since = Date.parse(entity.last_changed ?? '');
    if (Number.isFinite(now) && Number.isFinite(since) && now - since > unavailableAfter)
      add(entityId, 'unavailable', 'warning', 'No disponible desde hace más de 10 minutos');
  }
  const batterySources = new Map<string, number>();
  const rememberBattery = (id: string, source: ModelEntity) => {
    if (source.state === 'unknown' || source.state === 'unavailable') return;
    const battery =
      source.attributes?.device_class === 'battery'
        ? finiteNumber(source.state)
        : finiteNumber(source.attributes?.battery_level ?? source.attributes?.battery);
    if (battery !== null && battery >= 0 && battery < 15) batterySources.set(id, battery);
  };
  rememberBattery(entityId, entity);
  // Registry membership is evidence of association; never infer a battery from entity names.
  const registryDevice = hass?.entities?.[entityId]?.device_id;
  if (registryDevice)
    for (const [id, registry] of Object.entries(hass?.entities ?? {})) {
      const source = hass?.states[id];
      if (id !== entityId && registry.device_id === registryDevice && source?.attributes?.device_class === 'battery')
        rememberBattery(id, source);
    }
  // A battery attribute and its related entity describe one warning, not two alerts.
  const battery = [...batterySources.keys()].find(id => id !== entityId) ?? [...batterySources.keys()][0];
  if (battery) add(battery, 'battery', 'warning', 'Batería baja');
  return alerts;
}

export function summarizeAlerts(alerts: readonly DeviceAlert[]) {
  return {
    count: alerts.length,
    level: alerts.some(alert => alert.level === 'critical') ? ('critical' as const) : ('warning' as const),
  };
}
