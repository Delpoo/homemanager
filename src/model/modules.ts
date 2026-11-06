import { categoryOf, sectionsOf } from './category.js';
import { deviceActions } from './device-actions.js';
import type { ModelDevice, ModelHass } from './types.js';

export const MODULES = ['device', 'indicators', 'gestures', 'control', 'pinned', 'native', 'rules'] as const;
export type ModuleId = (typeof MODULES)[number];
export const MODULE_LABELS: Record<ModuleId, string> = {
  device: 'Dispositivo',
  indicators: 'Indicadores',
  gestures: 'Gestos',
  control: 'Control',
  pinned: 'Junto al símbolo',
  native: 'Panel avanzado',
  rules: 'Reglas',
};

/** Legacy categories suggest initial blocks only. Reading never mutates the plan. */
export function modulesOf(device: ModelDevice, hass?: ModelHass): ModuleId[] {
  if (device.display.modules) return [...device.display.modules];
  const sections = sectionsOf(categoryOf(device, hass));
  const found = new Set<ModuleId>(['device', 'gestures', 'rules']);
  if (sections.show || device.display.show === 'value' || device.display.show === 'both') found.add('indicators');
  if (sections.controls || device.bindings.controls?.length || device.bindings.remoteId || device.bindings.irRemoteId)
    found.add('control');
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
    // A device with programs or actions needs no designed control first (#96).
    reason:
      id === 'pinned' &&
      !device.bindings.controls?.length &&
      !device.bindings.remoteId &&
      !device.bindings.irRemoteId &&
      !deviceActions(device, hass).length
        ? 'Necesita un control'
        : null,
  }));
}
