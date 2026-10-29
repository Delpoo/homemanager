/** Plan reconciliation uses hit-test results supplied by geometry, never the DOM. */
export interface ImportRoom {
  id: string;
  label: string;
  icon?: string;
}
export interface ImportDevice {
  id: string;
  roomId: string | null;
}
export interface ImportConfiguration {
  rooms: ImportRoom[];
  catalog: { devices: ImportDevice[] };
}
export interface PlanZone {
  id: string;
  label: string | null;
}
export type ZonesAt = Readonly<Record<string, readonly string[]>>;
export interface PlanImportReport {
  moves: { deviceId: string; from: string | null; to: string }[];
  orphans: { roomId: string; label: string; devices: string[]; suggestion: string | null }[];
  newZones: { id: string; label: string }[];
  ambiguous: { deviceId: string; zones: string[] }[];
  outside: { deviceId: string }[];
}

export function planImportReport(
  configuration: ImportConfiguration,
  zonesAt: ZonesAt,
  newZones: readonly PlanZone[],
): PlanImportReport {
  const zones = new Map(newZones.map(zone => [zone.id, zone]));
  const hits = new Map(
    configuration.catalog.devices.map(device => [
      device.id,
      [...new Set(zonesAt[device.id] ?? [])].filter(id => zones.has(id)),
    ]),
  );
  const report: PlanImportReport = { moves: [], orphans: [], newZones: [], ambiguous: [], outside: [] };
  for (const device of configuration.catalog.devices) {
    const at = hits.get(device.id)!;
    if (at.length === 0) report.outside.push({ deviceId: device.id });
    else if (at.length > 1) report.ambiguous.push({ deviceId: device.id, zones: [...at] });
    else if (at[0] !== device.roomId) report.moves.push({ deviceId: device.id, from: device.roomId, to: at[0] });
  }
  for (const room of configuration.rooms) {
    if (zones.has(room.id)) continue;
    const devices = configuration.catalog.devices.filter(device => device.roomId === room.id);
    const first = devices.length ? hits.get(devices[0].id)! : [];
    const suggestion =
      first.length === 1 &&
      devices.every(device => {
        const at = hits.get(device.id)!;
        return at.length === 1 && at[0] === first[0];
      })
        ? first[0]
        : null;
    report.orphans.push({ roomId: room.id, label: room.label, devices: devices.map(device => device.id), suggestion });
  }
  for (const zone of zones.values())
    if (!configuration.rooms.some(room => room.id === zone.id))
      report.newZones.push({ id: zone.id, label: zone.label?.trim() || zone.id });
  return report;
}

/** Explicit merge (or explicit unassignment with null), preserving every other field and stable ID. */
export function mergeRoom<T extends ImportConfiguration>(configuration: T, from: string, to: string | null): T {
  if (!configuration.rooms.some(room => room.id === from)) throw new Error('unknown-source-room');
  if (to !== null && !configuration.rooms.some(room => room.id === to)) throw new Error('unknown-target-room');
  const next = structuredClone(configuration);
  if (from === to) return next;
  for (const device of next.catalog.devices) if (device.roomId === from) device.roomId = to;
  next.rooms = next.rooms.filter(room => room.id !== from);
  return next;
}
