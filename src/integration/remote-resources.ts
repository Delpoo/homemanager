import type { Hass } from '../card/types.js';
import type { IrDevice, IrRemote } from './remotes.js';
import type { RfWidget } from './rf.js';

export type AbsoluteState = Record<string, string | number | boolean>;
export type Capability = {
  type: 'number' | 'boolean' | 'select' | 'time';
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  mode?: string;
};
export interface Schedule {
  id: string;
  enabled: boolean;
  time: string;
  days: number[];
  zone: string;
  power: boolean;
  state: AbsoluteState;
  next: string | null;
  last?: string;
  result?: string;
}
export interface AbsoluteControl {
  id: string;
  name: string;
  brand: string;
  model: string;
  emitter: string;
  profile: string;
  capabilities: Record<string, Capability>;
  state: AbsoluteState;
  requested?: { state: AbsoluteState; at: string; status: 'sent' } | null;
  preset?: AbsoluteState | null;
  schedules: Schedule[];
  layout?: RfWidget[] | null;
  powerful?: string;
  powerful_configured?: boolean;
  /** 0.14 · whole states saved to run with one tap (up to six). */
  programs?: { id: string; name: string; icon: string | null; state: AbsoluteState }[];
}
export interface Resources {
  controls: AbsoluteControl[];
  emitters: IrDevice[];
  learned: IrRemote[];
  profiles: string[];
  zone: string;
}
export interface CatalogRow {
  index: number;
  name: string;
  supported: boolean;
  fingerprint: string | null;
}
type Command =
  | 'create'
  | 'configure'
  | 'send'
  | 'preset'
  | 'schedule'
  | 'remove'
  | 'design'
  | 'link-powerful'
  | 'powerful'
  | 'program'
  | 'run-program';

function ws<T>(hass: Hass, path: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!hass.callWS) return Promise.reject(new Error('not connected'));
  return hass.callWS({ type: 'homemanager/remotes/' + path, ...args });
}
/** 0.14 · a kept infrared catalog file. */
export interface IrLibrary {
  id: string;
  name: string;
  source: string;
  brand: string;
  model: string;
  count: number;
}
/** A library button a captured signal probably is. */
export interface LibraryMatch {
  library_id: string;
  library: string;
  brand: string;
  model: string;
  index: number;
  entry: string;
  score: number;
}
export const remoteResources = {
  libraries: (hass: Hass) => ws<IrLibrary[]>(hass, 'libraries/list'),
  addLibrary: (hass: Hass, fields: Record<string, unknown>) => ws<IrLibrary>(hass, 'libraries/add', fields),
  removeLibrary: (hass: Hass, library_id: string) =>
    ws<Record<string, never>>(hass, 'libraries/remove', { library_id }),
  libraryEntries: (hass: Hass, library_id: string) =>
    ws<{ index: number; name: string }[]>(hass, 'libraries/entries', { library_id }),
  matchLibrary: (hass: Hass, candidate_id: string) => ws<LibraryMatch[]>(hass, 'libraries/match', { candidate_id }),
  bringLibrary: (hass: Hass, fields: Record<string, unknown>) =>
    ws<{ id: string; added: number; duplicates: number }>(hass, 'libraries/bring', fields),
  list: (hass: Hass) => ws<Resources>(hass, 'resources'),
  command: (hass: Hass, command: Command, fields: Record<string, unknown> = {}, control_id?: string) =>
    ws<AbsoluteControl>(hass, 'absolute', { command, fields, ...(control_id ? { control_id } : {}) }),
  preview: (hass: Hass, source: string, document: string) =>
    ws<CatalogRow[]>(hass, 'catalog/preview', { source, document }),
  import: (hass: Hass, fields: Record<string, unknown>) =>
    ws<{ id: string; added: number; duplicates: number }>(hass, 'catalog/import', fields),
};
