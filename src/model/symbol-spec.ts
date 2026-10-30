import { activeStateOf, presentationOf } from './archetype.js';
import { alertsOf, summarizeAlerts } from './alerts.js';
import { entityOf, finiteNumber } from './types.js';
import type { AlertLevel } from './alerts.js';
import type {
  Archetype,
  DisplayShow,
  ModelDevice,
  ModelEntity,
  ModelHass,
  ModelRuntime,
  SymbolLayer,
} from './types.js';

export interface SymbolSpec {
  archetype: Archetype;
  body: { show: DisplayShow; icon: string | null; value: string | null; fullValue: string | null };
  ring: { active: true; level: number | null; tone: 'active' | 'cool' } | null;
  badge: { count: number; level: AlertLevel } | null;
  health: 'unavailable' | 'estimated' | 'unknown' | null;
  tap: 'control' | 'panel' | 'remote';
  hold: 'panel' | null;
  label: string;
  tag: string | null;
  layer: SymbolLayer;
  size: 's' | 'm' | 'l';
}

const SENSOR_ICONS: Record<string, [string, string]> = {
  door: ['mdi:door-closed', 'mdi:door-open'],
  window: ['mdi:window-closed', 'mdi:window-open'],
  garage_door: ['mdi:garage', 'mdi:garage-open'],
  opening: ['mdi:door-closed', 'mdi:door-open'],
  moisture: ['mdi:water-off', 'mdi:water-alert'],
  smoke: ['mdi:smoke-detector', 'mdi:smoke-detector-alert'],
  motion: ['mdi:motion-sensor-off', 'mdi:motion-sensor'],
  occupancy: ['mdi:home-outline', 'mdi:home-account'],
};

export function symbolSpec(
  device: ModelDevice,
  hass: ModelHass | undefined,
  now: number,
  runtime?: ModelRuntime,
): SymbolSpec {
  const { archetype, layer, cool, level } = presentationOf(device, hass);
  const entity = entityOf(device, hass);
  const show = device.display.show ?? (archetype === 'meter' ? 'value' : 'icon');
  const alerts = alertsOf(device, hass, now);
  const live =
    runtime?.value && !['unknown', 'unavailable'].includes(runtime.value)
      ? runtime.value
      : (entity?.state ?? 'unknown');
  const available = !!entity && entity.state !== 'unavailable';
  const unknown = !entity || entity.state === 'unknown';
  // Ordinary HA readings are not a health problem merely because no independent
  // confirmation source was configured. Assumed state and pending sends are.
  const estimated = entity?.attributes?.assumed_state === true || runtime?.confidence === 'sent';
  const iconPair = archetype === 'sensor' ? SENSOR_ICONS[String(entity?.attributes?.device_class ?? '')] : undefined;
  const icon = iconPair && ['on', 'off'].includes(live) ? iconPair[live === 'on' ? 1 : 0] : device.display.icon;
  const extraId = archetype === 'meter' ? device.bindings.readings?.[0] : undefined;
  const extra =
    extraId &&
    device.bindings.deviceId &&
    hass?.entities?.[extraId]?.device_id === device.bindings.deviceId &&
    !!device.bindings.entityId &&
    hass.entities[device.bindings.entityId]?.device_id === device.bindings.deviceId
      ? hass.states[extraId]
      : undefined;
  const fullValue =
    show !== 'icon' ? `${formattedValue(entity, hass)}${extra ? ` · ${formattedValue(extra, hass)}` : ''}` : null;
  const max = extra ? 25 : 9;
  const bodyValue = fullValue && fullValue.length > max ? `${fullValue.slice(0, max - 1)}…` : fullValue;
  const ringAllowed = archetype === 'actuator' || archetype === 'equipment';
  const confidence = runtime?.confidence;
  // A sent/unknown command never manufactures activity from the requested action.
  const active = available && !unknown && activeStateOf(device, live) && confidence !== 'error';
  const health = entity?.state === 'unavailable' ? 'unavailable' : estimated ? 'estimated' : unknown ? 'unknown' : null;
  const configuredControl =
    device.bindings.tap !== undefined ? device.bindings.tap !== null : !!device.bindings.primaryAction;
  return {
    archetype,
    body: { show, icon: show === 'value' ? null : icon, value: bodyValue, fullValue },
    ring: ringAllowed && active ? { active: true, level, tone: cool ? 'cool' : 'active' } : null,
    badge: alerts.length ? summarizeAlerts(alerts) : null,
    health,
    tap: archetype === 'remote' ? 'remote' : configuredControl ? 'control' : 'panel',
    hold: ['actuator', 'equipment', 'remote'].includes(archetype) ? 'panel' : null,
    label: device.display.label,
    tag: archetype === 'equipment' ? equipmentTag(entity, hass) : null,
    layer,
    size: device.display.size ?? 'm',
  };
}

/** HA's own formatter wins. A broken formatter cannot break an entire plan. */
export function formattedValue(entity: ModelEntity | undefined, hass?: ModelHass): string {
  if (!entity || ['unknown', 'unavailable'].includes(entity.state)) return '—';
  if (hass?.formatEntityState) {
    try {
      const value = hass.formatEntityState(entity);
      if (typeof value === 'string' && value.trim()) return value;
    } catch {
      /* Fall through to the numeric value with its declared unit. */
    }
  }
  const number = finiteNumber(entity.state);
  if (number === null) return entity.state;
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(hass?.locale?.language ?? hass?.language ?? 'es', {
      maximumFractionDigits: 3,
    }).format(number);
  } catch {
    formatted = String(number);
  }
  const unit = typeof entity.attributes?.unit_of_measurement === 'string' ? entity.attributes.unit_of_measurement : '';
  return unit ? `${formatted} ${unit}` : formatted;
}

function equipmentTag(entity: ModelEntity | undefined, hass?: ModelHass): string | null {
  if (!entity || ['unknown', 'unavailable', 'off'].includes(entity.state)) return null;
  const setpoint = finiteNumber(entity.attributes?.temperature);
  if (setpoint !== null) return `${setpoint}°`;
  const mode = entity.attributes?.preset_mode ?? entity.attributes?.hvac_action;
  if (typeof mode === 'string' && mode) return mode.slice(0, 16);
  return formattedValue(entity, hass).slice(0, 16);
}
