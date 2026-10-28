/** Configuration migrations. Pure data transforms: no DOM, no HA access, no I/O.
 *
 * V1 fixed a closed vocabulary of twelve room IDs taken from the first real
 * installation. V2 makes spaces instance data: `rooms` is an ordered list of
 * {id,label} and each device references one of them (or null when its location
 * is still unknown). The SVG zone convention `room-${id}` is unchanged, so a V1
 * plan keeps working without editing the drawing.
 *
 * Migration is in-memory and non-destructive: reading V1 never writes anything.
 * The upgraded document is persisted only by the next explicit save.
 */

export const CURRENT_SCHEMA_VERSION = 2;

/** The V1 vocabulary, kept ONLY to migrate V1 documents. Never used for validation. */
export const LEGACY_V1_ROOM_IDS = Object.freeze(['living','dining','kitchen','office','master-bedroom','bath-2','master-bath','balcony','entry','hallway','dbst','ac-ledge']);

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNSAFE = new Set(['__proto__','prototype','constructor']);

/** "master-bedroom" -> "Master bedroom". Only a neutral default; instances rename. */
export function humanizeRoomId(id) {
  const words = String(id).split('-').filter(Boolean).join(' ');
  return words ? words[0].toUpperCase() + words.slice(1) : 'Space';
}

/** Zone IDs referenced with the room-${id} convention, read from serialized SVG
 * text without a DOM. Used for migration defaults only; rendering still parses
 * and sanitizes the SVG before trusting any geometry. */
export function zoneIdsInSvgText(content) {
  const ids = [];
  if (typeof content !== 'string') return ids;
  for (const match of content.matchAll(/\sid\s*=\s*(["'])room-([a-z0-9]+(?:-[a-z0-9]+)*)\1/g)) if (!ids.includes(match[2]) && !UNSAFE.has(match[2])) ids.push(match[2]);
  return ids;
}

function plainRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

/** Returns a V2 clone. V2 input is returned as a clone; unknown versions are
 * returned untouched so validation reports them instead of guessing.
 * `roomLabels` carries the V1 card-level `room_labels` map, if any. */
export function migrateConfiguration(input, { roomLabels } = {}) {
  if (!plainRecord(input) || input.schemaVersion !== 1) return structuredClone(input);
  const next = structuredClone(input);
  const labels = plainRecord(roomLabels) ? roomLabels : {};
  const devices = plainRecord(next.catalog) && Array.isArray(next.catalog.devices) ? next.catalog.devices : [];
  const used = devices.map(device => plainRecord(device) ? device.roomId : undefined).filter(id => typeof id === 'string');
  const zones = zoneIdsInSvgText(plainRecord(next.architecture) ? next.architecture.content : '');
  // Legacy order first (it was the V1 navigation order), then anything else in use.
  const order = [...LEGACY_V1_ROOM_IDS.filter(id => used.includes(id) || zones.includes(id)), ...used.filter(id => !LEGACY_V1_ROOM_IDS.includes(id))];
  const rooms = [];
  for (const id of order) {
    if (rooms.some(room => room.id === id) || !ID.test(id) || UNSAFE.has(id)) continue;
    const label = typeof labels[id] === 'string' && labels[id].trim() ? labels[id].trim().slice(0, 240) : humanizeRoomId(id);
    rooms.push({ id, label });
  }
  next.schemaVersion = 2;
  next.rooms = rooms;
  if (plainRecord(next.catalog)) next.catalog.schemaVersion = 2;
  return next;
}
