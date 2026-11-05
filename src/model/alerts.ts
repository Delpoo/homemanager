import { limitsOf, type BaseRules } from './base-rules.js';
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

/** Configured category rules and the backward-compatible health/default alarm rules. */
export function alertsOf(
  device: ModelDevice,
  hass: ModelHass | undefined,
  now: number,
  context: AlertContext = {},
  baseRules?: BaseRules,
): DeviceAlert[] {
  const limits = limitsOf(baseRules);
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
  // Safety classes (leak, smoke, gas…) alert whatever category the person chose, as in 0.7.
  const legacyCritical = Object.hasOwn(CRITICAL, deviceClass);
  if (
    entityId.startsWith('binary_sensor.') &&
    entity.state === 'on' &&
    (alarmCategory || legacyCritical) &&
    !hasBinaryAlertOverride(device, hass) &&
    limits.safety &&
    !device.display.disabledBaseRules?.includes('safety')
  )
    add(
      entityId,
      Object.hasOwn(CRITICAL, deviceClass) ? (deviceClass as AlertRule) : 'binary',
      'critical',
      CRITICAL[deviceClass] ?? 'Alerta detectada',
    );
  if (
    entity.state === 'unavailable' &&
    limits.unavailable !== null &&
    !device.display.disabledBaseRules?.includes('unavailable')
  ) {
    // last_updated can advance while still unavailable; only last_changed proves its duration.
    const since = Date.parse(entity.last_changed ?? '');
    if (Number.isFinite(now) && Number.isFinite(since) && now - since > limits.unavailable * 60 * 1000)
      add(
        entityId,
        'unavailable',
        'warning',
        limits.unavailable === 10 ? 'No disponible desde hace más de 10 minutos' : 'Sin conexión desde hace un rato',
      );
  }
  const batterySources = new Map<string, number>();
  const rememberBattery = (id: string, source: ModelEntity) => {
    if (source.state === 'unknown' || source.state === 'unavailable') return;
    const battery =
      source.attributes?.device_class === 'battery'
        ? finiteNumber(source.state)
        : finiteNumber(source.attributes?.battery_level ?? source.attributes?.battery);
    if (limits.battery !== null && battery !== null && battery >= 0 && battery < limits.battery)
      batterySources.set(id, battery);
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
  if (battery && !device.display.disabledBaseRules?.includes('battery'))
    add(battery, 'battery', 'warning', 'Batería baja');
  return alerts;
}

export function summarizeAlerts(alerts: readonly DeviceAlert[]) {
  return {
    count: alerts.length,
    level: alerts.some(alert => alert.level === 'critical') ? ('critical' as const) : ('warning' as const),
  };
}

/** Missing evidence is not recovery. Used by the activity feed, separate from visibility. */
export function alertCleared(alert: DeviceAlert, device: ModelDevice, hass: ModelHass, baseRules?: BaseRules): boolean {
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
    return battery !== null && battery >= (limitsOf(baseRules).battery ?? 0) && battery <= 100;
  }
  return alert.entityId.startsWith('binary_sensor.') && source.state === 'off';
}
