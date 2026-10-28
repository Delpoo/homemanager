import type { Configuration } from './types.js';
export const ROOM_IDS: readonly string[];
export interface ConfigurationIssue {path:string;code:string;severity:'error'|'pending';message:string}
export class ConfigurationError extends Error {code:'invalid-configuration';issues:ConfigurationIssue[]}
export function inspectConfiguration(configuration:unknown,options?:{allowPending?:boolean}):{valid:boolean;issues:ConfigurationIssue[]};
export function assertConfiguration(configuration:unknown,options?:{allowPending?:boolean}):Configuration;
