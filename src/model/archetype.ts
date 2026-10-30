import { entityOf, finiteNumber } from './types.js';
import type { Archetype, Category, ModelDevice, ModelEntity, ModelHass, SymbolLayer } from './types.js';

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

/** A chosen category (D21) decides the archetype before anything stored or inferred. */
const CATEGORY_ARCHETYPE: Record<Category, Archetype> = {
  switch: 'actuator',
  equipment: 'equipment',
  remote: 'remote',
  meter: 'meter',
  plant: 'meter',
  alert: 'sensor',
  presence: 'sensor',
  infrastructure: 'infrastructure',
};

/** All kind decisions live here; consumers only receive presentation semantics. */
export function archetypeOf(device: ModelDevice, hass?: ModelHass): Archetype {
  if (device.display.category) return CATEGORY_ARCHETYPE[device.display.category];
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

/** Generic entity-to-kind suggestions share the same model boundary. */
export function presentationSuggestion(
  entityId: string,
  entity: ModelEntity | undefined,
): { kind: string; icon: string } {
  const domain = entityId.split('.')[0];
  const icon =
    typeof entity?.attributes?.icon === 'string' && /^mdi:[a-z0-9-]+$/.test(entity.attributes.icon)
      ? entity.attributes.icon
      : null;
  const deviceClass = typeof entity?.attributes?.device_class === 'string' ? entity.attributes.device_class : '';
  const byDomain: Record<string, [string, string]> = {
    light: ['light', 'mdi:lightbulb'],
    switch: ['switch', 'mdi:power-socket-eu'],
    fan: ['fan', 'mdi:fan'],
    cover: ['curtain', 'mdi:curtains'],
    climate: ['ac', 'mdi:air-conditioner'],
    vacuum: ['robot', 'mdi:robot-vacuum'],
    media_player: ['media', 'mdi:television'],
    lock: ['lock', 'mdi:lock'],
    camera: ['camera', 'mdi:cctv'],
    sensor: [
      'sensor',
      deviceClass === 'temperature'
        ? 'mdi:thermometer'
        : deviceClass === 'humidity'
          ? 'mdi:water-percent'
          : deviceClass === 'power' || deviceClass === 'energy'
            ? 'mdi:flash'
            : 'mdi:gauge',
    ],
    binary_sensor: [
      'sensor',
      deviceClass === 'door' || deviceClass === 'window' || deviceClass === 'opening'
        ? 'mdi:door'
        : deviceClass === 'moisture'
          ? 'mdi:water-alert'
          : deviceClass === 'motion'
            ? 'mdi:motion-sensor'
            : 'mdi:checkbox-blank-circle-outline',
    ],
    script: ['switch', 'mdi:script-text-play'],
    button: ['switch', 'mdi:gesture-tap-button'],
  };
  const [kind, fallback] = byDomain[domain] ?? ['other', 'mdi:shape'];
  return {
    kind: kind === 'sensor' && (deviceClass === 'power' || deviceClass === 'energy') ? 'energy' : kind,
    icon: icon ?? fallback,
  };
}
