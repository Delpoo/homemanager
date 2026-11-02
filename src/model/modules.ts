import { categoryOf, sectionsOf } from './category.js';
import type { ModelDevice, ModelHass } from './types.js';

export const MODULES = ['device', 'indicators', 'gestures', 'control', 'pinned', 'native', 'rules'] as const;
export type ModuleId = (typeof MODULES)[number];
export const MODULE_LABELS: Record<ModuleId, string> = {
  device: 'Dispositivo',
  indicators: 'Indicadores',
  gestures: 'Gestos',
  control: 'Control',
  pinned: 'Junto al símbolo',
  native: 'Panel nativo',
  rules: 'Reglas',
};

/** Legacy categories suggest initial blocks only. Reading never mutates the plan. */
export function modulesOf(device: ModelDevice, hass?: ModelHass): ModuleId[] {
  if (device.display.modules) return [...device.display.modules];
  const sections = sectionsOf(categoryOf(device, hass));
  const found = new Set<ModuleId>(['device', 'gestures', 'rules']);
  if (sections.show || device.display.show === 'value' || device.display.show === 'both') found.add('indicators');
  if (sections.controls || device.bindings.controls?.length || device.bindings.remoteId) found.add('control');
  if (device.display.pinned?.length) found.add('pinned');
  if (device.bindings.advancedPopupId) found.add('native');
  return MODULES.filter(id => found.has(id));
}

/** No category gates a capability. Dependencies are explained, never hidden. */
export function moduleChoices(device: ModelDevice, hass?: ModelHass) {
  const present = modulesOf(device, hass);
  return MODULES.map(id => ({
    id,
    present: present.includes(id),
    reason:
      id === 'pinned' && !device.bindings.controls?.length && !device.bindings.remoteId ? 'Necesita un control' : null,
  }));
}
