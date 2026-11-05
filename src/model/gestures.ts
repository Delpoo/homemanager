import type { ModelDevice } from './types.js';
import { archetypeOf } from './archetype.js';
import type { ModelHass } from './types.js';

export interface GestureAction {
  action: 'screen' | 'panel' | 'native' | 'none' | 'control' | 'more-info' | 'navigate' | 'url' | 'choose';
  controlId?: string;
  /** #97: a Home Assistant page, such as /config/devices/dashboard. */
  path?: string;
  /** #97: an https link or an app link; a phone can use its own. */
  url?: string;
  mobileUrl?: string;
  /** #97: what happens when the link cannot open. */
  fallback?: 'screen' | 'panel' | 'more-info' | 'navigate';
  fallbackPath?: string;
  /** #97: a short menu of 2 to 4 gestures. */
  options?: { label: string; icon?: string; do: GestureAction }[];
}
export type GestureBinding = string | null | GestureAction;
export type ResolvedGesture =
  | { action: 'screen' | 'panel' | 'native' | 'none' | 'more-info'; missing?: boolean }
  | { action: 'navigate'; path: string }
  | { action: 'url'; url: string; mobileUrl?: string; fallback?: GestureAction['fallback']; fallbackPath?: string }
  | { action: 'choose'; options: { label: string; icon?: string; do: GestureAction }[] }
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
  return resolveAction(choice, device);
}

/** The gesture, as the card runs it. A link is opened only from a person's tap (#97). */
export function resolveAction(choice: GestureAction, device: ModelDevice): ResolvedGesture {
  switch (choice.action) {
    case 'control':
      return device.bindings.controls?.some(c => c.id === choice.controlId)
        ? { action: 'control', controlId: choice.controlId! }
        : { action: 'screen', missing: true };
    case 'native':
      return device.bindings.advancedPopupId ? { action: 'native' } : { action: 'screen', missing: true };
    case 'more-info':
      return device.bindings.entityId ? { action: 'more-info' } : { action: 'screen', missing: true };
    case 'navigate':
      return choice.path && safePath(choice.path)
        ? { action: 'navigate', path: choice.path }
        : { action: 'screen', missing: true };
    case 'url':
      return choice.url && safeLink(choice.url)
        ? {
            action: 'url',
            url: choice.url,
            ...(choice.mobileUrl && safeLink(choice.mobileUrl) ? { mobileUrl: choice.mobileUrl } : {}),
            ...(choice.fallback ? { fallback: choice.fallback } : {}),
            ...(choice.fallbackPath && safePath(choice.fallbackPath) ? { fallbackPath: choice.fallbackPath } : {}),
          }
        : { action: 'screen', missing: true };
    case 'choose':
      return choice.options?.length
        ? { action: 'choose', options: choice.options }
        : { action: 'screen', missing: true };
    default:
      return { action: choice.action };
  }
}
const BLOCKED = /^(?:javascript|data|file|vbscript|about|blob|chrome|http|ms-[a-z-]+):/i;
/** Only https links and app links; never javascript:, data: or file:. */
export function safeLink(url: string): boolean {
  return /^(?:https:\/\/[^\s"'<>]{1,500}|[a-z][a-z0-9+.-]{1,30}:[^\s"'<>]{1,500})$/i.test(url) && !BLOCKED.test(url);
}
export function safePath(path: string): boolean {
  return /^\/(?!\/)[A-Za-z0-9/_\-.?=&%#]{0,200}$/.test(path);
}
