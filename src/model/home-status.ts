import type { ModelHass } from './types.js';

/** Home status (#74): everything that does not work, beyond the plan's geometry, each with
 * the place to fix it. Pure: the editor adds the geometry issues of plan-health. */
export type StatusIssue =
  | { kind: 'unlinked'; deviceId: string; label: string }
  | { kind: 'offline'; deviceId: string; label: string }
  | { kind: 'unknown-state'; deviceId: string; label: string }
  | { kind: 'remote-missing'; deviceId: string; label: string; source?: 'ir' }
  | { kind: 'view-image'; viewId: string; name: string; mode: 'light' | 'dark' }
  | { kind: 'rule-target'; ruleId: string; name: string }
  | { kind: 'storage'; percent: number };

export interface StatusConfiguration {
  catalog: {
    devices: {
      id: string;
      display: { label: string; standalone?: true };
      bindings: { entityId: string | null; deviceId?: string; remoteId?: string | null; irRemoteId?: string | null };
    }[];
  };
  planViews?: { id: string; name: string; light?: unknown; dark?: unknown }[];
  rules?: { id: string; name: string; sources: { reading: string }[]; symbols: string[] }[];
}

/** The order of the list: what breaks a control first, then what only looks wrong. */
export const STATUS_ORDER: StatusIssue['kind'][] = [
  'storage',
  'remote-missing',
  'offline',
  'unlinked',
  'rule-target',
  'unknown-state',
  'view-image',
];

export function homeStatus(
  configuration: StatusConfiguration,
  hass: ModelHass | undefined,
  extra: { remotes?: ReadonlySet<string>; irRemotes?: ReadonlySet<string>; storageShare?: number } = {},
): StatusIssue[] {
  const issues: StatusIssue[] = [];
  const devices = configuration.catalog.devices;
  for (const device of devices) {
    const { label } = device.display;
    const { entityId, deviceId, remoteId, irRemoteId } = device.bindings;
    if (!entityId && !deviceId && !remoteId && !irRemoteId && !device.display.standalone)
      issues.push({ kind: 'unlinked', deviceId: device.id, label });
    const state = entityId ? hass?.states[entityId]?.state : undefined;
    if (state === 'unavailable') issues.push({ kind: 'offline', deviceId: device.id, label });
    else if (state === 'unknown') issues.push({ kind: 'unknown-state', deviceId: device.id, label });
    if (remoteId && extra.remotes && !extra.remotes.has(remoteId))
      issues.push({ kind: 'remote-missing', deviceId: device.id, label });
    if (irRemoteId && extra.irRemotes && !extra.irRemotes.has(irRemoteId))
      issues.push({ kind: 'remote-missing', deviceId: device.id, label, source: 'ir' });
  }
  for (const view of configuration.planViews ?? [])
    for (const mode of ['light', 'dark'] as const)
      if (!view[mode]) issues.push({ kind: 'view-image', viewId: view.id, name: view.name, mode });
  const ids = new Set(devices.map(device => device.id));
  for (const rule of configuration.rules ?? [])
    if (rule.symbols.some(id => !ids.has(id)) || (hass && rule.sources.some(source => !hass.states[source.reading])))
      issues.push({ kind: 'rule-target', ruleId: rule.id, name: rule.name });
  if ((extra.storageShare ?? 0) >= 0.8)
    issues.push({ kind: 'storage', percent: Math.round(extra.storageShare! * 100) });
  return issues.sort((a, b) => STATUS_ORDER.indexOf(a.kind) - STATUS_ORDER.indexOf(b.kind));
}
