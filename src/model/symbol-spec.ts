import { validColor, symbolTones, readableColor } from './color.js';
import type { VisualResult } from './visual-rules.js';
import { activeStateOf, presentationOf } from './archetype.js';
import { alertsOf, presenceHighlightOf, summarizeAlerts, type AlertContext } from './alerts.js';
import { entityOf, finiteNumber } from './types.js';
import { stateName } from './names.js';
import { shownValues, type ShownValue } from './value-style.js';
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
  color?: { light: string; dark: string };
  archetype: Archetype;
  body: { show: DisplayShow; icon: string | null; value: string | null; fullValue: string | null };
  ring: { active: true; level: number | null; tone: 'active' | 'cool' } | null;
  highlight: boolean;
  badge: { count: number; level: AlertLevel | 'indicator'; color?: string } | null;
  health: 'unavailable' | 'estimated' | 'unknown' | null;
  tap: 'control' | 'panel' | 'remote';
  hold: 'panel' | null;
  label: string;
  tag: string | null;
  layer: SymbolLayer;
  size: 's' | 'm' | 'l';
  /** Chosen readings with their look (#92); empty keeps the old single value. */
  values: ShownValue[];
  place: 'inside' | 'beside' | 'below';
  /** #93: the type only suggests the shape; any symbol can pick another. */
  shape: 'circle' | 'pill' | 'dot' | 'icon';
  /** #93: free size (1 = medium) and background opacity in %, when chosen. */
  scale: number | null;
  opacity: number | null;
  /** #95: linked to Home Assistant, not yet, or needs no link. */
  link: 'linked' | 'unlinked' | null;
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
  context: AlertContext = {},
  rules: readonly VisualResult[] = [],
  baseRules?: import('./base-rules.js').BaseRules,
): SymbolSpec {
  const { archetype, layer, cool, level } = presentationOf(device, hass);
  const entity = entityOf(device, hass);
  const show = device.display.show ?? (archetype === 'meter' ? 'value' : 'icon');
  const effects = rules.filter(result => result.rule.symbols.includes(device.id));
  const alerts = [
    ...alertsOf(device, hass, now, context, baseRules),
    ...effects
      .filter(result => result.rule.badge !== false && result.rule.level !== 'indicator')
      .map(result => result.alert),
  ];
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
  const ringAllowed = device.display.modules !== undefined || archetype === 'actuator' || archetype === 'equipment';
  const confidence = runtime?.confidence;
  // A sent/unknown command never manufactures activity from the requested action.
  const active = available && !unknown && activeStateOf(device, live) && confidence !== 'error';
  // An intentionally unlinked symbol or a stateless remote is not a failed device.
  const health =
    entity?.state === 'unavailable'
      ? 'unavailable'
      : estimated
        ? 'estimated'
        : unknown && !!device.bindings.entityId
          ? 'unknown'
          : null;
  const configuredControl =
    device.bindings.tap !== undefined ? device.bindings.tap !== null : !!device.bindings.primaryAction;
  return {
    archetype,
    ...(validColor(device.display.color) ? { color: symbolTones(device.display.color) } : {}),
    body: { show, icon: show === 'value' ? null : icon, value: bodyValue, fullValue },
    ring: ringAllowed && active ? { active: true, level, tone: cool ? 'cool' : 'active' } : null,
    highlight: presenceHighlightOf(device, hass) || effects.some(result => result.rule.highlight === true),
    badge: alerts.length
      ? summarizeAlerts(alerts)
      : effects.some(result => result.rule.level === 'indicator' && result.rule.badge !== false)
        ? {
            count: effects.filter(result => result.rule.level === 'indicator' && result.rule.badge !== false).length,
            level: 'indicator',
            color: readableColor(
              effects.find(result => result.rule.level === 'indicator')?.rule.color ?? '#4f7a5a',
              '#ffffff',
            ),
          }
        : null,
    health,
    tap: archetype === 'remote' ? 'remote' : configuredControl ? 'control' : 'panel',
    hold: ['actuator', 'equipment', 'remote'].includes(archetype) ? 'panel' : null,
    label: device.display.label,
    tag: archetype === 'equipment' ? equipmentTag(entity, hass) : null,
    layer,
    size: device.display.size ?? 'm',
    values: shownValues(device, hass),
    place: device.display.valuePlace ?? 'inside',
    shape: device.display.shape ?? (archetype === 'infrastructure' ? 'dot' : 'circle'),
    scale: device.display.scale ?? null,
    opacity: device.display.opacity ?? null,
    link: device.display.standalone
      ? null
      : device.bindings.entityId || device.bindings.deviceId || device.bindings.remoteId || device.bindings.irRemoteId
        ? 'linked'
        : 'unlinked',
  };
}

/** HA's own formatter wins. A broken formatter cannot break an entire plan. */
export function formattedValue(entity: ModelEntity | undefined, hass?: ModelHass): string {
  if (!entity || ['unknown', 'unavailable'].includes(entity.state)) return '—';
  if (hass?.formatEntityState) {
    try {
      const value = hass.formatEntityState(entity);
      if (typeof value === 'string' && value.trim()) return value === entity.state ? stateName(value, hass) : value;
    } catch {
      /* Fall through to the numeric value with its declared unit. */
    }
  }
  const number = finiteNumber(entity.state);
  if (number === null) return stateName(entity.state, hass);
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
  if (typeof mode === 'string' && mode) return stateName(mode, hass).slice(0, 16);
  return formattedValue(entity, hass).slice(0, 16);
}
