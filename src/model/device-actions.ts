import type { ModelHass } from './types.js';

/** What a linked device can do (#96): programs, modes and its own actions, each usable
 * as a shortcut without designing a control first. */
export interface DeviceAction {
  /** Stable identity: entity, service and option. */
  key: string;
  group: 'program' | 'mode' | 'action';
  /** A person's name: the entity's, or a translation key for a robot action. */
  name: string;
  /** True when `name` is a translation key. */
  translate?: boolean;
  icon: string;
  action: { domain: string; service: string; target: { entity_id: string }; data?: { option: string } };
}
/** Shortcuts beside a symbol: the plan contract allows three (MAX_PINNED). */
export const MAX_SHORTCUTS = 3;
export const MAX_CONTROLS = 8;

const ROBOT: [string, string, string][] = [
  ['start', 'Empezar a limpiar', 'mdi:play'],
  ['pause', 'Pausar', 'mdi:pause'],
  ['return_to_base', 'Volver a la base', 'mdi:home-import-outline'],
  ['locate', 'Encontrar el robot', 'mdi:map-marker-question-outline'],
];

function friendly(entityId: string, hass?: ModelHass): string {
  const name = hass?.states[entityId]?.attributes?.friendly_name;
  return typeof name === 'string' && name.trim() ? name : entityId.replace(/^[^.]+\./, '').replace(/_/g, ' ');
}

/** The device's entities: the registry device when linked to one, else the bound entities. */
function entitiesOf(
  device: { bindings: { entityId: string | null; deviceId?: string; readings?: string[] } },
  hass?: ModelHass,
): string[] {
  const deviceId =
    device.bindings.deviceId ??
    (device.bindings.entityId ? hass?.entities?.[device.bindings.entityId]?.device_id : null);
  const own = deviceId
    ? Object.entries(hass?.entities ?? {})
        .filter(
          ([, entry]) => entry.device_id === deviceId && entry.entity_category !== 'diagnostic' && !entry.disabled_by,
        )
        .map(([id]) => id)
    : [];
  return [
    ...new Set([
      ...(device.bindings.entityId ? [device.bindings.entityId] : []),
      ...(device.bindings.readings ?? []),
      ...own,
    ]),
  ]
    .filter(id => !!hass?.states[id])
    .sort();
}

export function deviceActions(
  device: { bindings: { entityId: string | null; deviceId?: string; readings?: string[] } },
  hass?: ModelHass,
): DeviceAction[] {
  const result: DeviceAction[] = [];
  for (const entityId of entitiesOf(device, hass)) {
    const domain = entityId.split('.')[0];
    const target = { entity_id: entityId };
    if (domain === 'button' || domain === 'input_button')
      result.push({
        key: `${entityId}:press`,
        group: 'program',
        name: friendly(entityId, hass),
        icon: 'mdi:play-circle-outline',
        action: { domain, service: 'press', target },
      });
    else if (domain === 'scene' || domain === 'script')
      result.push({
        key: `${entityId}:turn_on`,
        group: 'program',
        name: friendly(entityId, hass),
        icon: domain === 'scene' ? 'mdi:palette-outline' : 'mdi:script-text-play-outline',
        action: { domain, service: 'turn_on', target },
      });
    else if (domain === 'select') {
      const options = hass?.states[entityId]?.attributes?.options;
      if (Array.isArray(options))
        for (const option of options.filter((item): item is string => typeof item === 'string').slice(0, 12))
          result.push({
            key: `${entityId}:select_option:${option}`,
            group: 'mode',
            name: `${friendly(entityId, hass)}: ${option}`,
            icon: 'mdi:tune-variant',
            action: { domain, service: 'select_option', target, data: { option } },
          });
    } else if (domain === 'vacuum')
      for (const [service, name, icon] of ROBOT)
        result.push({
          key: `${entityId}:${service}`,
          group: 'action',
          name,
          translate: true,
          icon,
          action: { domain, service, target },
        });
  }
  return result;
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'atajo';

/** The control id a shortcut uses on its symbol, stable for the same action. */
export function shortcutId(action: DeviceAction): string {
  let hash = 0;
  for (const character of action.key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `sc-${slug(action.key.split(':').slice(-1)[0] ?? 'a')}-${hash.toString(36)}`.slice(0, 64);
}

interface Plan {
  actions: Record<string, unknown>;
  catalog: {
    devices: {
      id: string;
      display: { pinned?: string[]; modules?: string[] };
      bindings: {
        controls?: { id: string; type: string; label: string; steps: { actionId: string; icon?: string }[] }[];
      };
    }[];
  };
}

/** Adds a one-tap control for the action, pinned beside the symbol, without touching others. */
export function addShortcut<T extends Plan>(plan: T, symbolId: string, action: DeviceAction, label: string): T {
  const next = structuredClone(plan);
  const device = next.catalog.devices.find(item => item.id === symbolId);
  if (!device) return plan;
  const id = shortcutId(action);
  const pinned = device.display.pinned ?? [];
  const controls = device.bindings.controls ?? [];
  if (pinned.includes(id)) return plan;
  if (pinned.length >= MAX_SHORTCUTS) throw new Error('shortcut_limit');
  const actionId = `${symbolId}-${id}`.slice(0, 64);
  next.actions[actionId] = structuredClone(action.action);
  if (!controls.some(control => control.id === id)) {
    if (controls.length >= MAX_CONTROLS) throw new Error('control_limit');
    device.bindings.controls = [...controls, { id, type: 'button', label, steps: [{ actionId, icon: action.icon }] }];
  }
  device.display.pinned = [...pinned, id];
  if (device.display.modules && !device.display.modules.includes('pinned'))
    device.display.modules = [...device.display.modules, 'pinned'];
  return next;
}

/** Takes the shortcut away and the control and action it created. */
export function removeShortcut<T extends Plan>(plan: T, symbolId: string, action: DeviceAction): T {
  const next = structuredClone(plan);
  const device = next.catalog.devices.find(item => item.id === symbolId);
  if (!device) return plan;
  const id = shortcutId(action);
  device.display.pinned = (device.display.pinned ?? []).filter(item => item !== id);
  if (!device.display.pinned.length) delete device.display.pinned;
  const control = device.bindings.controls?.find(item => item.id === id);
  device.bindings.controls = (device.bindings.controls ?? []).filter(item => item.id !== id);
  if (!device.bindings.controls.length) delete device.bindings.controls;
  for (const step of control?.steps ?? []) {
    const stillUsed = next.catalog.devices.some(other =>
      other.bindings.controls?.some(c => c.steps.some(s => s.actionId === step.actionId)),
    );
    if (!stillUsed) delete next.actions[step.actionId];
  }
  return next;
}
