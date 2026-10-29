import { entityOf, finiteNumber } from './types.js';
import type { Archetype, ModelDevice, ModelEntity, ModelHass, SymbolLayer } from './types.js';

export const ARCHETYPES: readonly Archetype[] = [
  'actuator',
  'equipment',
  'sensor',
  'meter',
  'remote',
  'infrastructure',
];
const DEFAULTS: Record<string, Archetype> = {
  light: 'actuator',
  switch: 'actuator',
  fan: 'actuator',
  curtain: 'actuator',
  lock: 'actuator',
  ac: 'equipment',
  purifier: 'equipment',
  robot: 'equipment',
  appliance: 'equipment',
  media: 'equipment',
  sensor: 'sensor',
  plant: 'meter',
  energy: 'meter',
  infra: 'infrastructure',
  camera: 'equipment',
  other: 'equipment',
};
const METER_CLASSES = new Set([
  'temperature',
  'humidity',
  'power',
  'energy',
  'apparent_power',
  'reactive_power',
  'voltage',
  'current',
  'battery',
  'illuminance',
  'pressure',
  'atmospheric_pressure',
  'carbon_dioxide',
  'volatile_organic_compounds',
  'pm1',
  'pm10',
  'pm25',
  'aqi',
  'moisture',
  'conductivity',
  'water',
  'volume',
  'weight',
]);
const ENERGY_CLASSES = new Set(['power', 'energy', 'apparent_power', 'reactive_power', 'voltage', 'current']);

/** All kind decisions live here; consumers only receive presentation semantics. */
export function archetypeOf(device: ModelDevice, hass?: ModelHass): Archetype {
  if (device.display.archetype) return device.display.archetype;
  const entity = entityOf(device, hass);
  const remote = entity?.attributes?.homemanager_remote ?? entity?.attributes?.homemanager_remote_button;
  if (device.bindings.remoteId || (typeof remote === 'string' && remote.length > 0)) return 'remote';
  const domain = device.bindings.entityId?.split('.')[0];
  if (device.kind === 'sensor') {
    if (domain === 'binary_sensor') return 'sensor';
    const deviceClass = entity?.attributes?.device_class;
    if (
      domain === 'sensor' &&
      (METER_CLASSES.has(String(deviceClass)) ||
        finiteNumber(entity?.state) !== null ||
        typeof entity?.attributes?.unit_of_measurement === 'string')
    )
      return 'meter';
  }
  return DEFAULTS[device.kind] ?? 'equipment';
}

/** Layer selection, cooling tone and levels are kind-specific model decisions too. */
export function presentationOf(device: ModelDevice, hass?: ModelHass) {
  const archetype = archetypeOf(device, hass);
  const entity = entityOf(device, hass);
  const deviceClass = String(entity?.attributes?.device_class ?? '');
  const layer: SymbolLayer =
    archetype === 'infrastructure'
      ? 'infrastructure'
      : device.kind === 'energy' || (archetype === 'meter' && ENERGY_CLASSES.has(deviceClass))
        ? 'energy'
        : archetype === 'sensor' || archetype === 'meter'
          ? 'sensors'
          : 'controls';
  return { archetype, layer, cool: device.kind === 'ac', level: levelOf(device, entity) };
}

function levelOf(device: ModelDevice, entity?: ModelEntity): number | null {
  const attributes = entity?.attributes;
  const raw =
    device.kind === 'light'
      ? finiteNumber(attributes?.brightness)
      : device.kind === 'curtain'
        ? finiteNumber(attributes?.current_position)
        : device.kind === 'fan'
          ? finiteNumber(attributes?.percentage)
          : null;
  return raw === null ? null : Math.max(0, Math.min(1, raw / (device.kind === 'light' ? 255 : 100)));
}

export function activeStateOf(device: ModelDevice, value: string): boolean {
  if (device.kind === 'lock') return ['unlocked', 'unlocking', 'locking'].includes(value);
  if (device.kind === 'curtain') return ['open', 'opening', 'closing'].includes(value);
  return [
    'on',
    'cool',
    'heat',
    'heat_cool',
    'auto',
    'dry',
    'fan_only',
    'cleaning',
    'playing',
    'home',
    'returning',
    'running',
  ].includes(value);
}

/** Suggestions never overwrite an explicit room icon. Names are generic, not instance data. */
export function suggestedRoomIcon(label: string): string {
  const name = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  for (const [pattern, icon] of [
    [/living|sala|salon|lounge/, 'mdi:sofa'],
    [/cocina|kitchen/, 'mdi:pot-steam'],
    [/dormitorio|habitacion|bedroom/, 'mdi:bed'],
    [/bano|bath|shower/, 'mdi:shower'],
    [/oficina|escritorio|office|study/, 'mdi:desk'],
    [/balcon|terraza|jardin|balcony|garden/, 'mdi:flower'],
  ] as const)
    if (pattern.test(name)) return icon;
  return 'mdi:floor-plan';
}
