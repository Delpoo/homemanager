import { archetypeOf, presentationSuggestion } from './archetype.js';
import { formattedValue } from './symbol-spec.js';
import { areaName, deviceName, entityAreaId, foldName, nameWord, personName, readingName } from './names.js';
import type { Archetype, ModelDevice, ModelHass } from './types.js';

export interface CatalogReading {
  entityId: string;
  name: string;
  value: string;
  deviceClass: string;
  areaId: string | null;
  icon: string;
}
export interface CatalogDevice {
  deviceId: string;
  name: string;
  areaId: string | null;
  area: string;
  manufacturer: string;
  model: string;
  integration: string;
  icon: string;
  inPlan: boolean;
  readings: CatalogReading[];
  /** Programs, scenes, scripts and device options: things it can do, not readings (#91). */
  actions: CatalogReading[];
  excluded: number;
  primaryEntityId: string;
}
export interface DeviceSelection {
  deviceId?: string;
  entityId: string;
  readings: string[];
}

/** Compact suggestions from §7; every other useful reading remains available in the fold. */
export function pickerReadings(device: CatalogDevice): { primary: CatalogReading[]; additional: CatalogReading[] } {
  const primary = device.readings.find(reading => reading.entityId === device.primaryEntityId)!;
  const isChannel = (reading: CatalogReading) => /^(?:canal|channel|kanal)\s*\d/i.test(reading.name);
  const summary = device.readings.find(
    reading =>
      reading.entityId !== primary.entityId &&
      !isChannel(reading) &&
      reading.deviceClass === (primary.deviceClass === 'power' ? 'energy' : 'humidity'),
  );
  const channels = device.readings
    .filter(reading => isChannel(reading) && reading.deviceClass === primary.deviceClass)
    .slice(0, 2);
  const secondary = device.readings
    .filter(reading => ['voltage', 'current'].includes(reading.deviceClass))
    .sort((a, b) => Number(a.deviceClass === 'current') - Number(b.deviceClass === 'current'));
  const preferred = [...channels, ...secondary];
  return {
    primary: [primary, ...(summary ? [summary] : [])],
    additional: [...preferred, ...device.readings.filter(reading => !preferred.includes(reading))],
  };
}
const EXCLUDED_DOMAINS = new Set([
  'update',
  'automation',
  'zone',
  'person',
  'sun',
  'tts',
  'stt',
  'conversation',
  'event',
  'todo',
  'image',
  'wake_word',
  'assist_satellite',
  'tag',
  'calendar',
  'notify',
  'ai_task',
]);
/** What a device can do rather than measure (#91, #96). */
export const ACTION_DOMAINS = new Set([
  'button',
  'scene',
  'script',
  'select',
  'number',
  'input_button',
  'input_select',
  'input_number',
]);
export function isActionEntity(entityId: string): boolean {
  return ACTION_DOMAINS.has(entityId.split('.')[0]);
}
export function usefulEntity(entityId: string, hass?: ModelHass): boolean {
  const entry = hass?.entities?.[entityId];
  // A configuration option (the mop mode of a robot, say) is offered as an action.
  const category = entry?.entity_category;
  return (
    !!hass?.states[entityId] &&
    (!category || (category === 'config' && isActionEntity(entityId))) &&
    !entry?.hidden &&
    !entry?.hidden_by &&
    !entry?.disabled &&
    !entry?.disabled_by &&
    !EXCLUDED_DOMAINS.has(entityId.split('.')[0])
  );
}
function priority(reading: CatalogReading, archetype?: Archetype): number {
  const domain = reading.entityId.split('.')[0];
  // A robot's own state ("Docked") says more than any of its sensors.
  if (['vacuum', 'lawn_mower'].includes(domain)) return -20;
  if (!archetype || archetype === 'actuator' || archetype === 'equipment')
    if (!['sensor', 'binary_sensor'].includes(domain)) return -10;
  if (reading.deviceClass === 'power') return /^(?:canal|channel|kanal)\s*\d/i.test(reading.name) ? 2 : 0;
  if (reading.deviceClass === 'temperature') return 1;
  if (!['sensor', 'binary_sensor'].includes(domain)) return 2;
  if (reading.deviceClass === 'energy') return 3;
  if (reading.deviceClass === 'humidity') return 4;
  if (domain === 'binary_sensor') return 5;
  return 6;
}
/** A registry device is one result regardless of how many entities it owns. */
export function deviceCatalog(
  hass: ModelHass | undefined,
  plan: readonly ModelDevice[] = [],
  archetype?: Archetype,
): CatalogDevice[] {
  if (!hass) return [];
  const grouped = new Map<string, string[]>();
  for (const [id, entry] of Object.entries(hass.entities ?? {})) {
    if (entry.device_id) grouped.set(entry.device_id, [...(grouped.get(entry.device_id) ?? []), id]);
  }
  const result: CatalogDevice[] = [];
  for (const [deviceId, device] of Object.entries(hass.devices ?? {})) {
    const all = grouped.get(deviceId) ?? [];
    const useful = all
      .filter(id => usefulEntity(id, hass))
      .map(entityId => {
        const entity = hass.states[entityId];
        return {
          entityId,
          name: readingName(entityId, hass),
          value: personName(formattedValue(entity, hass), nameWord('unknown', hass)),
          deviceClass: String(entity.attributes?.device_class ?? ''),
          areaId: entityAreaId(entityId, hass),
          icon: presentationSuggestion(entityId, entity).icon,
        };
      });
    const readings = useful.filter(reading => !isActionEntity(reading.entityId));
    const actions = useful.filter(reading => isActionEntity(reading.entityId));
    if (!readings.length && !actions.length) continue;
    // A device that only acts (a set of buttons) still links: by its first action.
    if (!readings.length) readings.push(actions[0]);
    // Infer the group's semantics from its most useful control/measurement, not its first registry entry.
    readings.sort((a, b) => priority(a, archetype) - priority(b, archetype) || a.name.localeCompare(b.name));
    const first = readings[0];
    const presentation = presentationSuggestion(first.entityId, hass.states[first.entityId]);
    const inferred =
      archetype ??
      archetypeOf(
        {
          id: 'suggestion',
          roomId: null,
          kind: presentation.kind,
          display: { label: '', icon: presentation.icon },
          bindings: { entityId: first.entityId },
        },
        hass,
      );
    readings.sort((a, b) => priority(a, inferred) - priority(b, inferred) || a.name.localeCompare(b.name));
    const primary = readings[0];
    const areaId = primary.areaId ?? device.area_id ?? null;
    result.push({
      deviceId,
      name: deviceName(device, hass),
      areaId,
      area: areaName(areaId, hass),
      manufacturer: personName(device.manufacturer),
      model: personName(device.model),
      integration: personName(hass.entities?.[primary.entityId]?.platform),
      icon: presentationSuggestion(primary.entityId, hass.states[primary.entityId]).icon,
      inPlan: plan.some(
        item =>
          item.bindings.deviceId === deviceId ||
          (!!item.bindings.entityId && hass.entities?.[item.bindings.entityId]?.device_id === deviceId),
      ),
      readings,
      actions: actions.filter(action => !readings.includes(action)),
      excluded: all.length - useful.length,
      primaryEntityId: primary.entityId,
    });
  }
  return result;
}
export function searchDevices(
  catalog: readonly CatalogDevice[],
  query: string,
  unplacedOnly = false,
  preferredArea?: string,
): CatalogDevice[] {
  const tokens = foldName(query).split(/\s+/).filter(Boolean);
  return catalog
    .filter(
      device =>
        (!unplacedOnly || !device.inPlan) &&
        tokens.every(token =>
          foldName(`${device.name} ${device.area} ${device.manufacturer} ${device.model}`).includes(token),
        ),
    )
    .sort(
      (a, b) =>
        Number(a.inPlan) - Number(b.inPlan) ||
        Number(b.area === preferredArea) - Number(a.area === preferredArea) ||
        a.area.localeCompare(b.area) ||
        a.name.localeCompare(b.name),
    );
}
/** Registry membership is live evidence; losing it reports a problem without rewriting a plan. */
export function bindingIssues(
  bindings: ModelDevice['bindings'],
  hass?: ModelHass,
): { code: string; entityId?: string }[] {
  if (!bindings.deviceId || !hass?.entities || !hass.devices) return [];
  const result: { code: string; entityId?: string }[] = [];
  if (!hass.devices[bindings.deviceId]) result.push({ code: 'device-missing' });
  for (const entityId of [bindings.entityId, ...(bindings.readings ?? [])].filter((id): id is string => !!id)) {
    const entry = hass.entities[entityId];
    if (!entry || !hass.states[entityId]) result.push({ code: 'reading-missing', entityId });
    else if (entry.device_id !== bindings.deviceId) result.push({ code: 'device-mismatch', entityId });
    else if (!usefulEntity(entityId, hass)) result.push({ code: 'reading-excluded', entityId });
  }
  return result;
}
