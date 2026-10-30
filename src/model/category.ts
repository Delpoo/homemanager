import { archetypeOf } from './archetype.js';
import { entityOf } from './types.js';
import type { Category, ModelDevice, ModelHass } from './types.js';

/** D21: what the person chooses. The archetype, the tap and the sheet follow from it. */
export const CATEGORIES: readonly Category[] = [
  'switch',
  'equipment',
  'remote',
  'meter',
  'plant',
  'alert',
  'presence',
  'infrastructure',
];
/** Binary sensor classes that are an alert when on; any other binary sensor is presence or an opening. */
const ALERT_CLASSES = new Set(['moisture', 'smoke', 'gas', 'carbon_monoxide', 'safety', 'problem', 'tamper', 'heat']);

/** The stored category, else the one its archetype and entity suggest. Never changes the stored plan. */
export function categoryOf(device: ModelDevice, hass?: ModelHass): Category {
  if (device.display.category) return device.display.category;
  const archetype = archetypeOf(device, hass);
  const entity = entityOf(device, hass);
  const deviceClass = String(entity?.attributes?.device_class ?? '');
  if (archetype === 'actuator') return 'switch';
  if (archetype === 'sensor') return ALERT_CLASSES.has(deviceClass) ? 'alert' : 'presence';
  if (archetype === 'meter') return device.kind === 'plant' || deviceClass === 'conductivity' ? 'plant' : 'meter';
  return archetype;
}

export interface CategorySections {
  /** The control editor (D18), what a tap runs and the controls pinned next to the symbol. */
  controls: boolean;
  /** Icon, value or both in the symbol's body. */
  show: boolean;
  /** The RF remote drawn in the panel: a light or a fan can be RF too. */
  remote: boolean;
}
/** Only the sections a category uses. Data of the hidden ones is kept, never deleted. */
export function sectionsOf(category: Category): CategorySections {
  return {
    controls: category === 'switch' || category === 'equipment' || category === 'remote',
    show: category === 'meter' || category === 'plant',
    remote: category === 'switch' || category === 'equipment' || category === 'remote',
  };
}
