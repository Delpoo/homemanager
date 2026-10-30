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
  excluded: number;
  primaryEntityId: string;
}
export interface DeviceSelection {
  deviceId?: string;
  entityId: string;
  readings: string[];
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
export function usefulEntity(entityId: string, hass?: ModelHass): boolean {
  const entry = hass?.entities?.[entityId];
  return (
    !!hass?.states[entityId] &&
    !entry?.entity_category &&
    !entry?.hidden &&
    !entry?.hidden_by &&
    !entry?.disabled &&
    !entry?.disabled_by &&
    !EXCLUDED_DOMAINS.has(entityId.split('.')[0])
  );
}
function priority(reading: CatalogReading, archetype?: Archetype): number {
  const domain = reading.entityId.split('.')[0];
  if (!archetype || archetype === 'actuator' || archetype === 'equipment')
    if (!['sensor', 'binary_sensor'].includes(domain)) return -10;
  if (reading.deviceClass === 'power') return /(?:total|gesamt)/i.test(reading.name) ? 0 : 2;
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
    const readings = all
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
    if (!readings.length) continue;
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
      excluded: all.length - readings.length,
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
