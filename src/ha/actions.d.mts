import type {ActionDefinition, Availability, Hass, ScriptSignatures} from './types.ts';
export interface ActionOptions { scriptSignatures?: ScriptSignatures }
export function assertActionDefinition(action: unknown): ActionDefinition;
export function discoverScriptSignatures(hass: Hass|null|undefined): ScriptSignatures;
export function getActionAvailability(action: unknown, hass: Hass|null|undefined, options?: ActionOptions): Availability;
export function executeService(action: unknown, hass: Hass, options?: ActionOptions): Promise<{ok:true}>;
