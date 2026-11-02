import type { ModelDevice } from './types.js';
import { archetypeOf } from './archetype.js';
import type { ModelHass } from './types.js';

export interface GestureAction {
  action: 'screen' | 'panel' | 'native' | 'none' | 'control';
  controlId?: string;
}
export type GestureBinding = string | null | GestureAction;
export type ResolvedGesture =
  | { action: 'screen' | 'panel' | 'native' | 'none'; missing?: boolean }
  | { action: 'control'; controlId: string }
  | { action: 'legacy'; actionId: string };
/** Absent bindings retain the old behavior. Deleted controls are a safe screen fallback. */
export function resolveGesture(device: ModelDevice, gesture: 'tap' | 'hold', hass?: ModelHass): ResolvedGesture {
  const binding = device.bindings[gesture];
  if (binding === undefined) {
    if (gesture === 'hold') return { action: 'panel' };
    if (archetypeOf(device, hass) === 'remote') return { action: 'panel' };
    return device.bindings.primaryAction
      ? { action: 'legacy', actionId: device.bindings.primaryAction }
      : { action: 'panel' };
  }
  if (binding === null) return { action: 'panel' };
  const choice: GestureAction = typeof binding === 'string' ? { action: 'control', controlId: binding } : binding;
  if (choice.action === 'control')
    return device.bindings.controls?.some(c => c.id === choice.controlId)
      ? { action: 'control', controlId: choice.controlId! }
      : { action: 'screen', missing: true };
  if (choice.action === 'native' && !device.bindings.advancedPopupId) return { action: 'screen', missing: true };
  return { action: choice.action };
}
