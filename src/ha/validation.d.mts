import type { Configuration, DeviceKind } from './types.js';
export const KINDS: readonly DeviceKind[];
export const MAX_ROOMS: number;
export const MAX_CONFIGURATION_BYTES: number;
export interface ConfigurationIssue {path:string;code:string;severity:'error'|'pending';message:string}
export class ConfigurationError extends Error {code:'invalid-configuration';issues:ConfigurationIssue[]}
export function inspectConfiguration(configuration:unknown,options?:{allowPending?:boolean}):{valid:boolean;issues:ConfigurationIssue[];configuration?:Configuration};
/** Accepts V1 or V2 input and returns a validated V2 clone. */
export function assertConfiguration(configuration:unknown,options?:{allowPending?:boolean}):Configuration;
