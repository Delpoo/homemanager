/** What is really saved in this home, and what is wrong with it. Pure: geometry arrives already measured. */
export interface HealthRoom {
  id: string;
  label: string;
  shape?: unknown;
}
export interface HealthDevice {
  id: string;
  roomId: string | null;
  display: { label: string };
  bindings: { entityId: string | null };
}
export interface HealthConfiguration {
  rooms: HealthRoom[];
  catalog: { devices: HealthDevice[] };
  architecture: { content: string };
}
export interface HealthInput {
  /** Zones the drawing declares. */
  zones: readonly { id: string; label: string | null }[];
  /** The space each device is drawn in; null when it is on none, or on several. */
  drawnIn: Readonly<Record<string, string | null>>;
  /** The drawing's own title, when it has one. */
  title: string | null;
  /** Entities Home Assistant knows; without a session, bindings are not judged. */
  entities?: ReadonlySet<string>;
}
export type HealthIssue =
  /** A space with no zone and no shape: it cannot be framed nor hit. */
  | { kind: 'no-geometry'; roomId: string; label: string; devices: number }
  /** A zone of the drawing that no space uses. */
  | { kind: 'unused-zone'; zoneId: string; label: string }
  /** A device drawn in one space and assigned to another (or to none). */
  | { kind: 'misplaced'; deviceId: string; label: string; from: string | null; to: string }
  /** A device linked to an entity Home Assistant no longer has. */
  | { kind: 'missing-entity'; deviceId: string; label: string }
  /** A device drawn outside every space. */
  | { kind: 'outside'; deviceId: string; label: string }
  /** Two spaces with the same name. */
  | { kind: 'same-name'; label: string; rooms: string[] };

export interface PlanHealth {
  plan: { title: string | null; fingerprint: string; zones: number; spaces: number; devices: number };
  issues: HealthIssue[];
}

/** A short, stable fingerprint of the drawing, to tell versions apart at a glance. */
export function planFingerprint(content: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function planHealth(configuration: HealthConfiguration, input: HealthInput): PlanHealth {
  const zoneIds = new Set(input.zones.map(zone => zone.id));
  const { rooms } = configuration;
  const { devices } = configuration.catalog;
  const issues: HealthIssue[] = [];
  for (const room of rooms)
    if (!zoneIds.has(room.id) && !room.shape)
      issues.push({
        kind: 'no-geometry',
        roomId: room.id,
        label: room.label,
        devices: devices.filter(device => device.roomId === room.id).length,
      });
  for (const zone of input.zones)
    if (!rooms.some(room => room.id === zone.id))
      issues.push({ kind: 'unused-zone', zoneId: zone.id, label: zone.label?.trim() || zone.id });
  for (const device of devices) {
    const label = device.display.label;
    const drawn = input.drawnIn[device.id] ?? null;
    if (drawn && drawn !== device.roomId)
      issues.push({ kind: 'misplaced', deviceId: device.id, label, from: device.roomId, to: drawn });
    else if (!drawn && rooms.length) issues.push({ kind: 'outside', deviceId: device.id, label });
    const entityId = device.bindings.entityId;
    if (input.entities && entityId && !input.entities.has(entityId))
      issues.push({ kind: 'missing-entity', deviceId: device.id, label });
  }
  const byName = new Map<string, HealthRoom[]>();
  for (const room of rooms) {
    const key = room.label.trim().toLocaleLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), room]);
  }
  for (const same of byName.values())
    if (same.length > 1) issues.push({ kind: 'same-name', label: same[0].label, rooms: same.map(room => room.id) });
  return {
    plan: {
      title: input.title?.trim() || null,
      fingerprint: planFingerprint(configuration.architecture.content),
      zones: input.zones.length,
      spaces: rooms.length,
      devices: devices.length,
    },
    issues,
  };
}

/** Whether a problem has a one-tap fix: it decides nothing beyond what the row says. */
export function canFix(issue: HealthIssue): boolean {
  return (
    issue.kind === 'misplaced' || issue.kind === 'unused-zone' || (issue.kind === 'no-geometry' && issue.devices === 0)
  );
}
/**
 * Whether it also belongs in "fix everything safe". A zone with no space is not: an old
 * drawing has zones nobody wants, and adding them would bring back spaces that do not go.
 */
export const isSafeFix = (issue: HealthIssue): boolean => canFix(issue) && issue.kind !== 'unused-zone';

/** Applies the given fixes, returning a new configuration. Devices are never deleted. */
export function applyFixes<T extends HealthConfiguration>(configuration: T, issues: readonly HealthIssue[]): T {
  const next = structuredClone(configuration);
  for (const issue of issues) {
    if (!canFix(issue)) continue;
    if (issue.kind === 'unused-zone' && !next.rooms.some(room => room.id === issue.zoneId))
      next.rooms.push({ id: issue.zoneId, label: issue.label });
    if (issue.kind === 'no-geometry') next.rooms = next.rooms.filter(room => room.id !== issue.roomId);
  }
  // Zones become spaces first, so a device can move into one that was just added.
  for (const issue of issues)
    if (issue.kind === 'misplaced') {
      const device = next.catalog.devices.find(item => item.id === issue.deviceId);
      if (device && next.rooms.some(room => room.id === issue.to)) device.roomId = issue.to;
    }
  return next;
}
