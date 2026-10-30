import { usefulEntity } from './device-catalog.js';
import { foldName, personName, readingName } from './names.js';
import type { ModelDevice, ModelHass } from './types.js';
import { snapToGrid, type Point, type RoomShape } from './room-shapes.js';

/**
 * Stage 5 of 0.10: each space can point at a Home Assistant area, and the devices of
 * that area are offered for it. Pure: creating areas and reading the registry happen elsewhere.
 */
export const CREATE_AREA = 'create';
export const NO_AREA = '';

interface LinkableRoom {
  id: string;
  label: string;
  areaId?: string;
}
type Areas = Readonly<Record<string, { name?: string }>>;

/** The same place in the languages a home is usually named in. Only ever a suggestion. */
const SAME_PLACE: readonly (readonly string[])[] = [
  ['sala', 'salon', 'living', 'lounge', 'estar'],
  ['comedor', 'dining'],
  ['cocina', 'kitchen'],
  ['dormitorio', 'habitacion', 'pieza', 'bedroom'],
  ['bano', 'toilette', 'bathroom', 'toilet'],
  ['oficina', 'estudio', 'escritorio', 'office', 'study'],
  ['balcon', 'terraza', 'balcony', 'terrace'],
  ['entrada', 'recibidor', 'entry', 'entrance'],
  ['pasillo', 'corredor', 'hall', 'hallway', 'corridor'],
  ['garaje', 'cochera', 'garage'],
  ['lavadero', 'laundry'],
  ['jardin', 'patio', 'garden', 'yard'],
];
const placesOf = (name: string): Set<number> => {
  const words = foldName(name).split(/[^a-z0-9]+/);
  return new Set(SAME_PLACE.flatMap((group, index) => (group.some(word => words.includes(word)) ? [index] : [])));
};
const nameOf = (areas: Areas, id: string) => areas[id]?.name ?? '';

/**
 * What to offer for each space: the area it already has, one with its very name, or one
 * that means the same place when nothing else competes for it. Two bathrooms and one
 * "Bathroom" area stay undecided on purpose: each is offered its own new area.
 */
export function suggestAreas(rooms: readonly LinkableRoom[], areas: Areas): Record<string, string> {
  const result: Record<string, string> = {};
  const taken = new Set<string>();
  for (const room of rooms)
    if (room.areaId && areas[room.areaId]) {
      result[room.id] = room.areaId;
      taken.add(room.areaId);
    }
  const free = () => Object.keys(areas).filter(id => !taken.has(id));
  for (const room of rooms) {
    if (result[room.id]) continue;
    const same = free().find(id => foldName(nameOf(areas, id)) === foldName(room.label));
    if (same) {
      result[room.id] = same;
      taken.add(same);
    }
  }
  const undecided = rooms.filter(room => !result[room.id]);
  const claims = new Map(undecided.map(room => [room.id, placesOf(room.label)]));
  for (const room of undecided) {
    const places = claims.get(room.id)!;
    const close = free().filter(id => [...placesOf(nameOf(areas, id))].some(place => places.has(place)));
    const rivals = undecided.filter(
      other => other.id !== room.id && [...claims.get(other.id)!].some(place => places.has(place)),
    );
    if (close.length === 1 && !rivals.length) {
      result[room.id] = close[0];
      taken.add(close[0]);
    } else result[room.id] = CREATE_AREA;
  }
  return result;
}

/** Spaces that would share an area: its devices could not say which one they belong to. */
export function sharedAreas(choices: Readonly<Record<string, string>>): string[] {
  const chosen = Object.values(choices).filter(value => value !== CREATE_AREA && value !== NO_AREA);
  return [...new Set(chosen.filter((value, index) => chosen.indexOf(value) !== index))];
}

/** Writes each space's link. A space not mentioned keeps its own. */
export function withAreaLinks<T extends { rooms: LinkableRoom[] }>(
  configuration: T,
  links: Readonly<Record<string, string | null>>,
): T {
  return {
    ...configuration,
    rooms: configuration.rooms.map(room => {
      if (!Object.hasOwn(links, room.id)) return room;
      const { areaId: _old, ...rest } = room;
      const areaId = links[room.id];
      return areaId ? { ...rest, areaId } : rest;
    }),
  };
}

/** A registry device, or an entity that belongs to no device. */
export interface ProposedDevice {
  deviceId: string;
  name: string;
  areaId: string | null;
  inPlan: boolean;
  primaryEntityId: string;
}
export interface AreaProposal {
  roomId: string;
  label: string;
  devices: ProposedDevice[];
}
const LOOSE = 'entity:';
export const isLooseEntity = (deviceId: string): boolean => deviceId.startsWith(LOOSE);
/**
 * Entities placed in an area directly, with no device: template lights, helpers. The
 * device catalog cannot list them, and an area's proposal would miss them.
 */
export function looseEntities(hass: ModelHass | undefined, plan: readonly ModelDevice[]): ProposedDevice[] {
  return Object.entries(hass?.entities ?? {}).flatMap(([entityId, entry]) => {
    if (entry.device_id || !entry.area_id || !usefulEntity(entityId, hass)) return [];
    const friendly = hass?.states[entityId]?.attributes?.friendly_name;
    return [
      {
        deviceId: `${LOOSE}${entityId}`,
        name: personName(typeof friendly === 'string' ? friendly : undefined, readingName(entityId, hass)),
        areaId: entry.area_id,
        inPlan: plan.some(item => item.bindings.entityId === entityId),
        primaryEntityId: entityId,
      },
    ];
  });
}
/** The devices of each linked area that the plan does not have yet. */
export function areaProposals(rooms: readonly LinkableRoom[], catalog: readonly ProposedDevice[]): AreaProposal[] {
  return rooms.flatMap(room => {
    if (!room.areaId) return [];
    const devices = catalog
      .filter(device => device.areaId === room.areaId && !device.inPlan)
      .sort((a, b) => a.name.localeCompare(b.name));
    return devices.length ? [{ roomId: room.id, label: room.label, devices }] : [];
  });
}

/** Where new devices start inside a space: spread over its largest rectangle, never on top of each other. */
export function spreadInRoom(rects: readonly RoomShape[], count: number): Point[] {
  const area = (rect: RoomShape) => rect.width * rect.height;
  const rect = [...rects].sort((a, b) => area(b) - area(a))[0] ?? { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  return Array.from({ length: count }, (_, index) => ({
    x: snapToGrid(rect.x + ((index % columns) + 0.5) * (rect.width / columns)),
    y: snapToGrid(rect.y + (Math.floor(index / columns) + 0.5) * (rect.height / rows)),
  }));
}
