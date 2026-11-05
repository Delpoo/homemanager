import type { ModelDevice, ModelHass } from './types.js';
import { finiteNumber } from './types.js';

/** The automatic rules, one per type, with limits the person sets (#60). Absent: exactly
 * as in v0.11 (battery below 15 %, offline for more than 10 minutes, safety on). */
export interface BaseRules {
  battery?: { enabled?: boolean; below?: number };
  unavailable?: { enabled?: boolean; minutes?: number };
  safety?: { enabled?: boolean };
}
export interface BaseLimits {
  /** Below this battery percentage; null when the rule is off. */
  battery: number | null;
  /** After this many minutes offline; null when the rule is off. */
  unavailable: number | null;
  safety: boolean;
}
export const DEFAULT_LIMITS: BaseLimits = { battery: 15, unavailable: 10, safety: true };

export function limitsOf(rules: BaseRules | undefined): BaseLimits {
  return {
    battery: rules?.battery?.enabled === false ? null : (rules?.battery?.below ?? DEFAULT_LIMITS.battery),
    unavailable:
      rules?.unavailable?.enabled === false ? null : (rules?.unavailable?.minutes ?? DEFAULT_LIMITS.unavailable),
    safety: rules?.safety?.enabled !== false,
  };
}

/** A battery reading exists: an attribute of its entity or a battery entity of its registry device. */
export function hasBatteryEvidence(device: ModelDevice, hass?: ModelHass): boolean {
  const entityId = device.bindings.entityId;
  if (!entityId) return false;
  const attributes = hass?.states[entityId]?.attributes;
  if (
    attributes?.device_class === 'battery' ||
    finiteNumber(attributes?.battery_level) !== null ||
    finiteNumber(attributes?.battery) !== null
  )
    return true;
  const registry = hass?.entities?.[entityId]?.device_id;
  return (
    !!registry &&
    Object.entries(hass?.entities ?? {}).some(
      ([id, entry]) => entry.device_id === registry && hass?.states[id]?.attributes?.device_class === 'battery',
    )
  );
}

/** Which symbols each base rule can apply to: battery needs evidence, safety a binary sensor. */
export function appliesTo(
  kind: 'battery' | 'unavailable' | 'safety' | 'highlight',
  device: ModelDevice,
  hass?: ModelHass,
): boolean {
  const entityId = device.bindings.entityId;
  if (!entityId) return false;
  if (kind === 'battery') return hasBatteryEvidence(device, hass);
  if (kind === 'safety' || kind === 'highlight') return entityId.startsWith('binary_sensor.');
  return true;
}
