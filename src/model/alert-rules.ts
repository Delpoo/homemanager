import { categoryOf } from './category.js';
import { readingName } from './names.js';
import { finiteNumber, type AlertRuleConfig, type ModelDevice, type ModelEntity, type ModelHass } from './types.js';

export interface AlertObservation {
  readonly since: number;
  readonly observedAt: number;
  readonly side: 'below' | 'above' | 'on';
}
/** Runtime evidence only. This is never serialized into a device or configuration. */
export type AlertContext = Readonly<Record<string, AlertObservation>>;
export interface ConfiguredAlert {
  key: string;
  reading: string;
  readingLabel: string;
  rule: 'threshold' | 'presence' | 'binary';
  level: 'critical' | 'warning';
  message: string;
}

/** A direct principal binding is evidence; auxiliary readings need registry membership. */
export function alertReading(device: ModelDevice, reading: string, hass?: ModelHass): ModelEntity | undefined {
  if (!hass || hass.connection?.connected === false) return undefined;
  if (reading === device.bindings.entityId) return hass.states[reading];
  const registryDevice =
    device.bindings.deviceId ??
    (device.bindings.entityId ? hass.entities?.[device.bindings.entityId]?.device_id : undefined);
  return registryDevice && hass.entities?.[reading]?.device_id === registryDevice ? hass.states[reading] : undefined;
}

function applicable(device: ModelDevice, rule: AlertRuleConfig, hass?: ModelHass): boolean {
  const category = categoryOf(device, hass);
  if (!['alert', 'presence', 'plant', 'meter'].includes(category)) return false;
  if (!['alert', 'warning'].includes(rule.level)) return false;
  const binary = rule.reading.startsWith('binary_sensor.');
  const bounds = rule.below !== undefined || rule.above !== undefined;
  if (binary) return !bounds && (category === 'alert' || category === 'presence');
  return bounds && (category === 'plant' || category === 'meter');
}

function condition(rule: AlertRuleConfig, source: ModelEntity | undefined): 'below' | 'above' | 'on' | null {
  if (!source || ['unknown', 'unavailable'].includes(source.state)) return null;
  if (rule.reading.startsWith('binary_sensor.')) return source.state === 'on' ? 'on' : null;
  const value = finiteNumber(source.state);
  if (value === null) return null;
  if (typeof rule.below === 'number' && Number.isFinite(rule.below) && value < rule.below) return 'below';
  if (typeof rule.above === 'number' && Number.isFinite(rule.above) && value > rule.above) return 'above';
  return null;
}

/** The condition's identity excludes severity and delay: editing either does not invent a new crossing. */
function keyOf(device: ModelDevice, rule: AlertRuleConfig, hass?: ModelHass): string {
  return JSON.stringify([
    device.id,
    device.bindings.entityId,
    device.bindings.deviceId ?? null,
    categoryOf(device, hass),
    rule.reading,
    rule.below ?? null,
    rule.above ?? null,
  ]);
}
function stableSince(source: ModelEntity, now: number): number | null {
  const stamp = Date.parse(source.last_changed ?? '');
  return Number.isFinite(now) && Number.isFinite(stamp) && stamp <= now ? stamp : null;
}

/** Pure reducer. Value changes that remain below/above the limits keep the condition's start.
 * Unknown readings, lost association, disconnection and removed conditions discard their evidence. */
export function observeAlertRules(
  devices: readonly ModelDevice[],
  hass: ModelHass | undefined,
  now: number,
  previous: AlertContext = {},
): AlertContext {
  const next: Record<string, AlertObservation> = {};
  if (!hass || hass.connection?.connected === false || !Number.isFinite(now)) return next;
  for (const device of devices)
    for (const rule of device.display.alerts ?? []) {
      if (!applicable(device, rule, hass)) continue;
      const source = alertReading(device, rule.reading, hass);
      const side = condition(rule, source);
      if (!side) continue;
      const key = keyOf(device, rule, hass),
        prior = previous[key];
      const validPrior =
        prior &&
        Number.isFinite(prior.since) &&
        Number.isFinite(prior.observedAt) &&
        prior.since <= prior.observedAt &&
        prior.observedAt <= now &&
        prior.side === side;
      next[key] = {
        since: validPrior ? prior.since : prior ? now : (stableSince(source!, now) ?? now),
        observedAt: now,
        side,
      };
    }
  return next;
}

function mature(rule: AlertRuleConfig, source: ModelEntity, now: number, observation?: AlertObservation): boolean {
  const minutes = rule.forMinutes ?? 0;
  if (!Number.isFinite(minutes) || minutes < 0) return false;
  if (minutes === 0) return true;
  if (!Number.isFinite(now)) return false;
  const since =
    observation && observation.since <= observation.observedAt && observation.observedAt <= now
      ? observation.since
      : stableSince(source, now);
  // Division avoids overflowing when a valid, very large duration is configured.
  return since !== null && Number.isFinite(since) && since <= now && (now - since) / 60000 >= minutes;
}

export function configuredAlertsOf(
  device: ModelDevice,
  hass: ModelHass | undefined,
  now: number,
  context: AlertContext = {},
): ConfiguredAlert[] {
  const found = new Map<string, ConfiguredAlert>();
  for (const rule of device.display.alerts ?? []) {
    if (!applicable(device, rule, hass)) continue;
    const source = alertReading(device, rule.reading, hass),
      state = condition(rule, source);
    if (!state || !source) continue;
    const key = keyOf(device, rule, hass);
    if (!mature(rule, source, now, context[key]?.side === state ? context[key] : undefined)) continue;
    const alert: ConfiguredAlert = {
      key,
      reading: rule.reading,
      readingLabel: readingName(rule.reading, hass),
      rule: state === 'on' ? (categoryOf(device, hass) === 'presence' ? 'presence' : 'binary') : 'threshold',
      level: rule.level === 'alert' ? 'critical' : 'warning',
      message:
        state === 'below'
          ? 'Lectura por debajo del límite'
          : state === 'above'
            ? 'Lectura por encima del límite'
            : categoryOf(device, hass) === 'presence'
              ? 'Presencia o apertura detectada'
              : 'Alerta detectada',
    };
    if (!found.has(key) || alert.level === 'critical') found.set(key, alert);
  }
  return [...found.values()];
}

/** Only a valid, associated reading can prove that a previously active condition cleared. */
export function configuredAlertCleared(device: ModelDevice, key: string, hass?: ModelHass): boolean {
  const rule = device.display.alerts?.find(item => applicable(device, item, hass) && keyOf(device, item, hass) === key);
  if (!rule) return false;
  const source = alertReading(device, rule.reading, hass);
  if (!source || ['unknown', 'unavailable'].includes(source.state)) return false;
  if (rule.reading.startsWith('binary_sensor.')) return source.state === 'off';
  return finiteNumber(source.state) !== null && condition(rule, source) === null;
}

/** A configured principal binary condition replaces the category's immediate default. */
export function hasBinaryAlertOverride(device: ModelDevice, hass?: ModelHass): boolean {
  return (device.display.alerts ?? []).some(
    rule =>
      rule.reading === device.bindings.entityId &&
      rule.reading.startsWith('binary_sensor.') &&
      applicable(device, rule, hass),
  );
}

export function presenceHighlightOf(device: ModelDevice, hass?: ModelHass): boolean {
  const reading = device.bindings.entityId;
  return (
    categoryOf(device, hass) === 'presence' &&
    device.display.highlight === true &&
    !!reading?.startsWith('binary_sensor.') &&
    alertReading(device, reading, hass)?.state === 'on'
  );
}
