import { entityOf, finiteNumber } from './types.js';
import type { ModelDevice, ModelEntity, ModelHass } from './types.js';
import { categoryOf } from './category.js';
import {
  configuredAlertCleared,
  configuredAlertsOf,
  hasBinaryAlertOverride,
  type AlertContext,
} from './alert-rules.js';
export { observeAlertRules, presenceHighlightOf } from './alert-rules.js';
export type { AlertContext, AlertObservation } from './alert-rules.js';

export type AlertLevel = 'critical' | 'warning';
export type AlertRule =
  | 'moisture'
  | 'smoke'
  | 'gas'
  | 'carbon_monoxide'
  | 'safety'
  | 'problem'
  | 'battery'
  | 'unavailable'
  | 'threshold'
  | 'presence'
  | 'binary';
export interface DeviceAlert {
  id: string;
  deviceId: string;
  roomId: string | null;
  entityId: string;
  rule: AlertRule;
  level: AlertLevel;
  /** Spanish source key: the view translates it, keeping this module independent. */
  message: string;
  /** Human reading label for a configured condition; no entity identifier is shown. */
  readingLabel?: string;
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

/** Configured category rules and the backward-compatible health/default alarm rules. */
export function alertsOf(
  device: ModelDevice,
  hass: ModelHass | undefined,
  now: number,
  context: AlertContext = {},
): DeviceAlert[] {
  if (hass?.connection?.connected === false) return [];
  const alerts: DeviceAlert[] = configuredAlertsOf(device, hass, now, context).map(alert => ({
    id: `${device.id}:configured:${alert.key}`,
    deviceId: device.id,
    roomId: device.roomId,
    entityId: alert.reading,
    rule: alert.rule,
    level: alert.level,
    message:
      alert.rule === 'binary'
        ? (CRITICAL[String(hass?.states[alert.reading]?.attributes?.device_class ?? '')] ?? alert.message)
        : alert.message,
    readingLabel: alert.readingLabel,
  }));
  const entityId = device.bindings.entityId;
  const entity = entityOf(device, hass);
  if (!entityId || !entity) return alerts;
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
  const alarmCategory = categoryOf(device, hass) === 'alert';
  const legacyCritical = device.display.category === undefined && Object.hasOwn(CRITICAL, deviceClass);
  if (
    entityId.startsWith('binary_sensor.') &&
    entity.state === 'on' &&
    (alarmCategory || legacyCritical) &&
    !hasBinaryAlertOverride(device, hass)
  )
    add(
      entityId,
      Object.hasOwn(CRITICAL, deviceClass) ? (deviceClass as AlertRule) : 'binary',
      'critical',
      CRITICAL[deviceClass] ?? 'Alerta detectada',
    );
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

/** Missing evidence is not recovery. Used by the activity feed, separate from visibility. */
export function alertCleared(alert: DeviceAlert, device: ModelDevice, hass: ModelHass): boolean {
  if (hass.connection?.connected === false) return false;
  const prefix = `${device.id}:configured:`;
  if (alert.id.startsWith(prefix)) return configuredAlertCleared(device, alert.id.slice(prefix.length), hass);
  const source = hass.states[alert.entityId];
  if (!source || ['unknown', 'unavailable'].includes(source.state)) return false;
  if (alert.rule === 'unavailable') return true;
  if (alert.rule === 'battery') {
    const battery =
      source.attributes?.device_class === 'battery'
        ? finiteNumber(source.state)
        : finiteNumber(source.attributes?.battery_level ?? source.attributes?.battery);
    return battery !== null && battery >= 15 && battery <= 100;
  }
  return alert.entityId.startsWith('binary_sensor.') && source.state === 'off';
}
