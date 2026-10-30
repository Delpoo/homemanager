import type {
  Configuration,
  ControlType,
  DeviceCategory,
  DeviceKind,
  SymbolArchetype,
  SymbolShow,
  SymbolSize,
} from './types.js';
export const KINDS: readonly DeviceKind[];
export const MAX_ROOMS: number;
export const MAX_CONFIGURATION_BYTES: number;
export const CONTROL_TYPES: readonly ControlType[];
export const CONTROL_STEPS: Readonly<Record<ControlType, readonly [number, number]>>;
export const MAX_CONTROLS: number;
export const MAX_PINNED: number;
export const MAX_READINGS: number;
export const MAX_ALERT_RULES: number;
export const ALERT_RULE_LEVELS: readonly ('alert' | 'warning')[];
export const SYMBOL_SIZES: readonly SymbolSize[];
export const SYMBOL_ARCHETYPES: readonly SymbolArchetype[];
export const SYMBOL_SHOW: readonly SymbolShow[];
export const DEVICE_CATEGORIES: readonly DeviceCategory[];
export const ROOM_SHAPE_SOURCES: readonly ('svg' | 'app')[];
export const ROOM_FRAMES: readonly ('tight' | 'normal' | 'wide')[];
export const MAX_ROOM_RECTS: number;
export interface ConfigurationIssue {
  path: string;
  code: string;
  severity: 'error' | 'pending';
  message: string;
}
export class ConfigurationError extends Error {
  code: 'invalid-configuration';
  issues: ConfigurationIssue[];
}
export function inspectConfiguration(
  configuration: unknown,
  options?: { allowPending?: boolean },
): { valid: boolean; issues: ConfigurationIssue[]; configuration?: Configuration };
/** Accepts V1 or V2 input and returns a validated V2 clone. */
export function assertConfiguration(configuration: unknown, options?: { allowPending?: boolean }): Configuration;
