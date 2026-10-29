import { t } from '../i18n/index.js';
import { CONTROL_STEPS } from '../ha/validation.mjs';
import { entityControls, type Control as EntityControl } from '../panels/controls.js';
import type { Action, Configuration, ControlType, Device, DeviceControl, Hass, HassEntity } from './types.js';

/**
 * The controls of a map device, by how they are operated (pulsador, ciclo,
 * deslizador, subir/bajar, selector). What a step does is always an action of
 * the plan, so every press goes through the adapter's checks; only a slider
 * without steps adjusts the live value of an entity, like the native panel.
 * Pure functions: rendering lives in src/ui/control-view.ts.
 */

export { CONTROL_STEPS };
export const CONTROL_TYPES: ControlType[] = ['button', 'cycle', 'slider', 'updown', 'select'];
export const TYPE_ICONS: Record<ControlType, string> = {
  button: 'mdi:gesture-tap-button',
  cycle: 'mdi:sync',
  slider: 'mdi:tune-vertical-variant',
  updown: 'mdi:unfold-more-horizontal',
  select: 'mdi:format-list-bulleted',
};
export function typeLabel(type: ControlType): string {
  return {
    button: t('Pulsador'),
    cycle: t('Ciclo'),
    slider: t('Deslizador'),
    updown: t('Subir / bajar'),
    select: t('Selector'),
  }[type];
}
export function typeHint(type: ControlType): string {
  return {
    button: t('Un toque, una acción.'),
    cycle: t('De 2 a 4 acciones: cada toque envía la siguiente.'),
    slider: t('Una barra: ajusta el valor de una entidad o recorre de 2 a 12 pasos.'),
    updown: t('Dos botones: uno sube y otro baja.'),
    select: t('De 2 a 8 opciones: se elige una.'),
  }[type];
}

/** The device's controls; a 0.5 plan's hold shortcuts read as buttons. */
export function controlsOf(device: Device): DeviceControl[] {
  if (device.bindings.controls) return device.bindings.controls;
  return (device.bindings.quickActions ?? []).map(item => ({
    id: item.id,
    type: 'button',
    label: item.label,
    steps: [{ actionId: item.actionId }],
  }));
}

/** What a tap on the symbol runs. Without `tap`, a plan keeps its primary action. */
export function tapControl(device: Device): DeviceControl | null {
  const tap = device.bindings.tap;
  if (tap === undefined)
    return device.bindings.primaryAction
      ? { id: 'tap', type: 'button', label: device.display.label, steps: [{ actionId: device.bindings.primaryAction }] }
      : null;
  return tap === null ? null : (controlsOf(device).find(control => control.id === tap) ?? null);
}

export function pinnedControls(device: Device): DeviceControl[] {
  const controls = controlsOf(device);
  return (device.display.pinned ?? []).flatMap(id => controls.filter(control => control.id === id));
}

/** Label of a step: its own, else what its action does. */
export function stepLabel(control: DeviceControl, index: number, configuration?: Configuration): string {
  const step = control.steps[index];
  if (!step) return control.label;
  if (step.label) return step.label;
  if (control.type === 'button') return control.label;
  const action = configuration?.actions[step.actionId];
  return action ? serviceLabel(action.service, action.domain) : step.actionId;
}

export function serviceLabel(service: string, domain?: string): string {
  if (domain === 'script' && service === 'turn_on') return t('Ejecutar');
  return (
    {
      turn_on: t('Encender'),
      turn_off: t('Apagar'),
      toggle: t('Alternar'),
      press: t('Pulsar'),
      open_cover: t('Abrir'),
      close_cover: t('Cerrar'),
      stop_cover: t('Detener'),
    }[service] ?? service
  );
}

/** State a step leaves its target in, when its service says so. */
const RESULT: Record<string, string> = { turn_on: 'on', turn_off: 'off', open_cover: 'open', close_cover: 'closed' };

/**
 * Which step of a cycle is the current one: the step whose result matches the
 * live state of its target, when every step declares one; else the last step
 * this browser sent; -1 when nothing is known yet. The next tap sends the one after.
 */
export function cycleIndex(
  control: DeviceControl,
  configuration: Configuration,
  hass: Hass | undefined,
  remembered: number | undefined,
): number {
  const results = control.steps.map(step => {
    const action = configuration.actions[step.actionId];
    const target = action && typeof action.target.entity_id === 'string' ? action.target.entity_id : null;
    return action && target && RESULT[action.service] ? { state: RESULT[action.service], target } : null;
  });
  if (results.every(Boolean)) {
    const found = results.findIndex(result => hass?.states[result!.target]?.state === result!.state);
    if (found >= 0) return found;
  }
  return remembered !== undefined && remembered < control.steps.length ? remembered : -1;
}

export function nextIndex(control: DeviceControl, current: number): number {
  return control.type === 'cycle' ? (current + 1) % control.steps.length : 0;
}

/** Live adjustable value behind a slider without steps (brightness, speed, position…). */
export function sliderSource(
  control: DeviceControl,
  device: Device,
  getEntity: (entityId: string) => HassEntity | undefined,
): { entityId: string; control: Extract<EntityControl, { kind: 'range' | 'steps' }> } | null {
  if (control.type !== 'slider' || control.steps.length) return null;
  const entityId = control.entityId ?? device.bindings.entityId;
  if (!entityId) return null;
  const found = entityControls(entityId, getEntity(entityId)).find(
    (item): item is Extract<EntityControl, { kind: 'range' | 'steps' }> =>
      item.kind === 'range' || item.kind === 'steps',
  );
  return found ? { entityId, control: found } : null;
}

/** Controls a new device starts with, from what its entity offers. They are
 * ordinary controls the user sees and can change, never hidden defaults. */
export function suggestControls(
  deviceId: string,
  entityId: string,
  icon: string,
  canCall: (domain: string, service: string) => boolean,
): { actions: Record<string, Action>; controls: DeviceControl[]; tap: string | null } {
  const domain = entityId.split('.')[0];
  const actions: Record<string, Action> = {};
  const action = (service: string): string => {
    const id = `${deviceId}-${service.replace(/_/g, '-')}`.slice(0, 120);
    actions[id] = { domain: domain as Action['domain'], service, target: { entity_id: entityId } };
    return id;
  };
  const controls: DeviceControl[] = [];
  const pair = (on: string, off: string, onLabel: string, offLabel: string, offIcon: string) =>
    controls.push({
      id: 'power',
      type: 'cycle',
      label: t('{on} / {off}', { on: onLabel, off: offLabel }),
      steps: [
        { actionId: action(on), label: onLabel, icon },
        { actionId: action(off), label: offLabel, icon: offIcon },
      ],
    });
  if (canCall(domain, 'turn_on') && canCall(domain, 'turn_off') && domain !== 'climate' && domain !== 'script')
    pair('turn_on', 'turn_off', t('Encender'), t('Apagar'), offIcon(icon));
  else if (domain === 'cover' && canCall('cover', 'open_cover') && canCall('cover', 'close_cover'))
    pair('open_cover', 'close_cover', t('Abrir'), t('Cerrar'), icon);
  else if (domain === 'button' && canCall('button', 'press'))
    controls.push({ id: 'press', type: 'button', label: t('Pulsar'), steps: [{ actionId: action('press') }] });
  else if (domain === 'script' && canCall('script', 'turn_on'))
    controls.push({ id: 'run', type: 'button', label: t('Ejecutar'), steps: [{ actionId: action('turn_on') }] });
  const tap = controls.find(control => control.type === 'cycle' || control.type === 'button')?.id ?? null;
  return { actions, controls, tap };
}

/** "Off" variants that exist in Material Design Icons; others keep the same icon. */
const OFF_ICONS: Record<string, string> = {
  'mdi:lightbulb': 'mdi:lightbulb-off',
  'mdi:lightbulb-outline': 'mdi:lightbulb-off-outline',
  'mdi:lightbulb-on': 'mdi:lightbulb-off',
  'mdi:fan': 'mdi:fan-off',
  'mdi:power': 'mdi:power-off',
  'mdi:power-plug': 'mdi:power-plug-off',
  'mdi:television': 'mdi:television-off',
  'mdi:toggle-switch': 'mdi:toggle-switch-off',
  'mdi:volume-high': 'mdi:volume-off',
  'mdi:bell': 'mdi:bell-off',
  'mdi:lamp': 'mdi:lamp-outline',
  'mdi:ceiling-light': 'mdi:ceiling-light-outline',
  'mdi:floor-lamp': 'mdi:floor-lamp-outline',
  'mdi:water': 'mdi:water-off',
  'mdi:air-conditioner': 'mdi:air-conditioner',
};
export function offIcon(icon: string): string {
  return OFF_ICONS[icon] ?? icon;
}

/** Every action id a device's controls (and legacy bindings) can run. */
export function actionIdsOf(device: Device): string[] {
  const ids = new Set<string>();
  if (device.bindings.primaryAction) ids.add(device.bindings.primaryAction);
  for (const control of controlsOf(device)) for (const step of control.steps) ids.add(step.actionId);
  return [...ids];
}
