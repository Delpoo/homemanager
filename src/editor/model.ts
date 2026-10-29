import { t } from '../i18n/index.js';
import {
  KINDS,
  SERVICES,
  clone,
  type Action,
  type Configuration,
  type Device,
  type NativePanel,
  type Room,
  type StateSource,
} from '../card/types.js';
import { migrateConfiguration } from '../ha/migration.mjs';
import type { ViewBox } from '../card/geometry.js';

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENTITY = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const BAD_DATA =
  /^(?:entity_id|area_id|device_id|rf_codes?|ir_codes?|codes?|protocol|pulse_length|raw(?:_data)?|rc_switch|commands?|command_type)$/i;
function fail(message: string): never {
  throw new Error(message);
}
export function stableKey(value: string, label = 'ID'): string {
  if (!KEY.test(value) || value.length > 120 || UNSAFE.has(value))
    fail(t('{field}: usá un ID kebab-case válido.', { field: label }));
  return value;
}
function entity(value: string): string {
  if (!ENTITY.test(value) || value.length > 240 || value.endsWith('.all'))
    fail(t('La entidad debe ser explícita y tener formato dominio.nombre.'));
  return value;
}
function plainText(value: string, label: string): string {
  const text = value.trim();
  if (!text || text.length > 240 || /[\u0000-\u001f]/.test(text))
    fail(t('{field}: escribí un texto válido.', { field: label }));
  return text;
}
/** Explicitly reconstruct persistent fields; runtime readings never enter exports or drafts. */
export function persistentConfiguration(configuration: Configuration): Configuration {
  // Editing a V1 document upgrades the draft to V2; only an explicit save persists it.
  const next = migrateConfiguration<Configuration>(configuration);
  for (const device of next.catalog.devices) device.state = { value: 'unknown', confidence: 'unknown' };
  return next;
}
export function newDeviceId(label: string, configuration: Configuration): string {
  const slug = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 105)
    .replace(/-$/g, '');
  const base = !slug || UNSAFE.has(slug) ? 'device' : slug;
  let id = base,
    index = 2;
  while (configuration.catalog.devices.some(device => device.id === id)) id = `${base}-${index++}`;
  return id;
}
export function upsertDevice(
  configuration: Configuration,
  input: Device,
  options: { previousId?: string; allowFixedPosition?: boolean } = {},
): Configuration {
  const next = persistentConfiguration(configuration);
  const id = stableKey(input.id);
  const previous = options.previousId
    ? next.catalog.devices.find(device => device.id === options.previousId)
    : undefined;
  if (options.previousId && !previous) fail(t('El icono que querés editar ya no existe.'));
  if (previous && id !== previous.id) fail(t('El ID de un icono existente es inmutable.'));
  if (!previous && next.catalog.devices.some(device => device.id === id)) fail(t('Ese ID ya existe.'));
  if (
    (input.roomId !== null && !next.rooms.some(room => room.id === input.roomId)) ||
    !KINDS.includes(input.kind) ||
    !['fixed', 'editable', 'portable'].includes(input.mobility)
  )
    fail(t('Espacio, tipo o movilidad inválidos.'));
  for (const coordinate of [input.position.x, input.position.y])
    if (!Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1)
      fail(t('Las coordenadas deben estar entre 0 y 1.'));
  if (
    previous?.mobility === 'fixed' &&
    !options.allowFixedPosition &&
    (previous.position.x !== input.position.x ||
      previous.position.y !== input.position.y ||
      previous.roomId !== input.roomId)
  )
    fail(t('Usá la acción explícita de corregir ubicación para un elemento fijo.'));
  if (!/^mdi:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.display.icon)) fail(t('El icono debe ser un nombre mdi: válido.'));
  if (input.bindings.entityId) entity(input.bindings.entityId);
  for (const key of [input.bindings.primaryAction, input.bindings.advancedPopupId, input.bindings.remoteId ?? null])
    if (key !== null) stableKey(key, t('Referencia'));
  const quick = input.bindings.quickActions;
  if (quick && quick.length > 4) fail(t('Un dispositivo tiene como máximo 4 accesos rápidos.'));
  for (const item of quick ?? []) {
    stableKey(item.id, t('Referencia'));
    stableKey(item.actionId, t('Referencia'));
  }
  const device: Device = {
    id,
    roomId: input.roomId,
    kind: input.kind,
    position: { x: input.position.x, y: input.position.y },
    mobility: input.mobility,
    display: {
      label: plainText(input.display.label, t('Nombre')),
      icon: input.display.icon,
      ...(input.display.size && input.display.size !== 'm' ? { size: input.display.size } : {}),
      ...(input.display.pinned?.length ? { pinned: [...input.display.pinned] } : {}),
      ...(input.display.archetype ? { archetype: input.display.archetype } : {}),
      ...(input.display.show ? { show: input.display.show } : {}),
    },
    bindings: {
      entityId: input.bindings.entityId,
      primaryAction: input.bindings.primaryAction,
      advancedPopupId: input.bindings.advancedPopupId,
      ...(quick?.length
        ? {
            quickActions: quick.map(item => ({
              id: item.id,
              label: plainText(item.label, t('Nombre')),
              actionId: item.actionId,
            })),
          }
        : {}),
      ...(input.bindings.remoteId ? { remoteId: input.bindings.remoteId } : {}),
      ...(input.bindings.controls ? { controls: structuredClone(input.bindings.controls) } : {}),
      ...(input.bindings.tap !== undefined ? { tap: input.bindings.tap } : {}),
    },
    state: { value: 'unknown', confidence: 'unknown' },
  };
  if (previous) next.catalog.devices[next.catalog.devices.findIndex(device => device.id === id)] = device;
  else next.catalog.devices.push(device);
  return next;
}
/** Spaces are instance data. IDs are stable kebab-case keys matching the SVG
 * convention `room-${id}`; labels are free text and can be renamed at any time. */
export function upsertRoom(
  configuration: Configuration,
  input: Room,
  options: { previousId?: string } = {},
): Configuration {
  const next = persistentConfiguration(configuration);
  const id = stableKey(input.id, t('ID de espacio')),
    label = plainText(input.label, t('Nombre del espacio'));
  const index = options.previousId === undefined ? -1 : next.rooms.findIndex(room => room.id === options.previousId);
  if (options.previousId !== undefined && index < 0) fail(t('El espacio que querés editar ya no existe.'));
  if (index >= 0 && id !== options.previousId)
    fail(t('El ID de un espacio existente es inmutable; creá uno nuevo y mové los dispositivos.'));
  if (index < 0 && next.rooms.some(room => room.id === id)) fail(t('Ese espacio ya existe.'));
  if (index < 0 && next.rooms.length >= 200) fail(t('Se admite un máximo de 200 espacios.'));
  if (input.icon !== undefined && (!/^mdi:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.icon) || input.icon.length > 240))
    fail(t('El icono debe ser un nombre mdi: válido.'));
  const room: Room = { id, label, ...(input.icon !== undefined ? { icon: input.icon } : {}) };
  if (index >= 0) next.rooms[index] = room;
  else next.rooms.push(room);
  return next;
}
/** Removing a space never deletes devices: they stay on the plan without a space. */
export function removeRoom(
  configuration: Configuration,
  id: string,
): { configuration: Configuration; unassigned: string[] } {
  const next = persistentConfiguration(configuration);
  if (!next.rooms.some(room => room.id === id)) fail(t('Ese espacio ya no existe.'));
  next.rooms = next.rooms.filter(room => room.id !== id);
  const unassigned: string[] = [];
  for (const device of next.catalog.devices)
    if (device.roomId === id) {
      device.roomId = null;
      unassigned.push(device.id);
    }
  return { configuration: next, unassigned };
}
export function moveRoom(configuration: Configuration, id: string, offset: -1 | 1): Configuration {
  const next = persistentConfiguration(configuration),
    index = next.rooms.findIndex(room => room.id === id),
    target = index + offset;
  if (index < 0) fail(t('Ese espacio ya no existe.'));
  if (target < 0 || target >= next.rooms.length) return next;
  [next.rooms[index], next.rooms[target]] = [next.rooms[target], next.rooms[index]];
  return next;
}
export type PositionMode = 'drawing' | 'relative';
/** Replacing the plan with a different viewBox. 'drawing' keeps every device on
 * the same SVG point (right when the new file is the same drawing re-cropped or
 * extended); 'relative' keeps the normalized fractions (right when the drawing
 * was rescaled as a whole). Devices that fall outside the new viewBox are clamped
 * to its edge and reported, never dropped. */
export function remapPositions(
  configuration: Configuration,
  from: ViewBox,
  to: ViewBox,
  mode: PositionMode,
): { configuration: Configuration; clamped: string[] } {
  const next = persistentConfiguration(configuration),
    clamped: string[] = [];
  for (const box of [from, to])
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0)
      fail(t('viewBox no válido para migrar posiciones.'));
  if (mode !== 'drawing' && mode !== 'relative') fail(t('Modo de migración de posiciones no válido.'));
  if (
    mode === 'relative' ||
    (from.x === to.x && from.y === to.y && from.width === to.width && from.height === to.height)
  )
    return { configuration: next, clamped };
  for (const device of next.catalog.devices) {
    const x = (from.x + device.position.x * from.width - to.x) / to.width,
      y = (from.y + device.position.y * from.height - to.y) / to.height;
    const cx = Math.min(1, Math.max(0, x)),
      cy = Math.min(1, Math.max(0, y));
    if (cx !== x || cy !== y) clamped.push(device.id);
    device.position = { x: Math.round(cx * 1e6) / 1e6, y: Math.round(cy * 1e6) / 1e6 };
  }
  return { configuration: next, clamped };
}
export function removeDevice(configuration: Configuration, id: string): Configuration {
  const next = persistentConfiguration(configuration);
  if (!next.catalog.devices.some(device => device.id === id)) fail(t('Ese icono ya no existe.'));
  next.catalog.devices = next.catalog.devices.filter(device => device.id !== id);
  delete next.stateSources[id];
  // Reusable actions/panels and real HA entities deliberately remain intact.
  return next;
}
function validateData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(t('Los datos deben ser un objeto JSON.'));
  let bytes: number;
  try {
    bytes = new TextEncoder().encode(JSON.stringify(data)).length;
  } catch {
    fail(t('Los datos no son JSON válido.'));
  }
  if (bytes! > 8192) fail(t('Los datos exceden 8192 bytes.'));
  function check(value: unknown, depth: number): void {
    if (depth > 10) fail(t('Los datos exceden la profundidad máxima de 10.'));
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail(t('No se admiten números no finitos.'));
      return;
    }
    if (typeof value === 'string') {
      if (value.length > 1024 || /\{\{|\{%|\$\{|javascript\s*:|<script\b|=>|\b(?:eval|Function)\s*\(/i.test(value))
        fail(t('No se admiten plantillas ni código ejecutable en los datos.'));
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 100) fail(t('Una lista excede 100 elementos.'));
      value.forEach(item => check(item, depth + 1));
      return;
    }
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
      fail(t('Los datos deben ser JSON.'));
    const entries = Object.entries(value);
    if (entries.length > 100) fail(t('Un objeto excede 100 campos.'));
    for (const [key, item] of entries) {
      if (!key || key.length > 100 || UNSAFE.has(key) || BAD_DATA.test(key))
        fail(`Campo de datos no permitido: ${key}.`);
      check(item, depth + 1);
    }
  }
  check(data, 0);
  return clone(data as Record<string, unknown>);
}
export function upsertAction(configuration: Configuration, key: string, input: Action): Configuration {
  stableKey(key, t('ID de acción'));
  if (!Object.hasOwn(SERVICES, input.domain) || !SERVICES[input.domain].includes(input.service))
    fail(t('Dominio o servicio no permitido.'));
  if (!input.target || Object.keys(input.target).some(key => key !== 'entity_id'))
    fail(t('Definí únicamente destinos entity_id explícitos.'));
  const targets = Array.isArray(input.target.entity_id) ? input.target.entity_id : [input.target.entity_id];
  if (!targets.length || targets.length > 20 || new Set(targets).size !== targets.length)
    fail(t('Elegí entre 1 y 20 destinos únicos.'));
  for (const target of targets)
    if (typeof target !== 'string' || entity(target).split('.')[0] !== input.domain)
      fail(t('Cada destino debe pertenecer al dominio de la acción.'));
  const action: Action = {
    domain: input.domain,
    service: input.service,
    target: { entity_id: Array.isArray(input.target.entity_id) ? [...targets] : targets[0] },
  };
  if (input.data !== undefined) action.data = validateData(input.data) as Action['data'];
  const next = persistentConfiguration(configuration);
  next.actions[key] = action;
  return next;
}
export function upsertStateSource(
  configuration: Configuration,
  deviceId: string,
  source: StateSource | null,
): Configuration {
  const next = persistentConfiguration(configuration);
  if (!next.catalog.devices.some(device => device.id === deviceId)) fail(t('Seleccioná un icono existente.'));
  if (source === null) {
    delete next.stateSources[deviceId];
    return next;
  }
  entity(source.entityId);
  if (
    source.attribute !== null &&
    (!source.attribute ||
      source.attribute.length > 100 ||
      UNSAFE.has(source.attribute) ||
      BAD_DATA.test(source.attribute))
  )
    fail(t('El atributo no es válido.'));
  if (!['measured', 'optimistic', 'transmitter'].includes(source.feedback))
    fail(t('Elegí un tipo de feedback válido.'));
  next.stateSources[deviceId] = { entityId: source.entityId, attribute: source.attribute, feedback: source.feedback };
  return next;
}
export function upsertPanel(configuration: Configuration, key: string, panel: NativePanel): Configuration {
  stableKey(key, t('ID de panel'));
  if (
    !['device-controls', 'rf-fan'].includes(panel.kind) ||
    !Array.isArray(panel.controls) ||
    panel.controls.length > 100
  )
    fail(t('Panel o cantidad de controles inválidos.'));
  const ids = new Set<string>();
  const controls = panel.controls.map(control => {
    stableKey(control.id, t('ID de control'));
    stableKey(control.actionId, t('Referencia de acción'));
    if (ids.has(control.id)) fail(t('Los IDs de controles deben ser únicos dentro del panel.'));
    ids.add(control.id);
    const action = configuration.actions[control.actionId];
    if (panel.kind === 'rf-fan' && action && (action.domain !== 'script' || action.service !== 'turn_on'))
      fail(t('Un panel RF sólo puede usar acciones script.turn_on.'));
    return { id: control.id, label: plainText(control.label, t('Nombre del control')), actionId: control.actionId };
  });
  const next = persistentConfiguration(configuration);
  next.panels[key] = { kind: panel.kind, title: plainText(panel.title, t('Título')), controls };
  return next;
}
export function pendingReferences(configuration: Configuration, states: Record<string, unknown> = {}): string[] {
  const pending: string[] = [];
  for (const device of configuration.catalog.devices) {
    if (device.bindings.entityId && !Object.hasOwn(states, device.bindings.entityId))
      pending.push(t('{id}: entidad {ref} pendiente', { id: device.id, ref: device.bindings.entityId }));
    if (device.bindings.primaryAction && !Object.hasOwn(configuration.actions, device.bindings.primaryAction))
      pending.push(t('{id}: acción {ref} pendiente', { id: device.id, ref: device.bindings.primaryAction }));
    if (device.bindings.advancedPopupId && !Object.hasOwn(configuration.panels, device.bindings.advancedPopupId))
      pending.push(t('{id}: panel {ref} pendiente', { id: device.id, ref: device.bindings.advancedPopupId }));
  }
  for (const [key, panel] of Object.entries(configuration.panels))
    for (const control of panel.controls)
      if (!Object.hasOwn(configuration.actions, control.actionId))
        pending.push(t('{id}: acción {ref} pendiente', { id: key, ref: control.actionId }));
  for (const [key, source] of Object.entries(configuration.stateSources))
    if (!Object.hasOwn(states, source.entityId))
      pending.push(t('{id}: fuente {ref} pendiente', { id: key, ref: source.entityId }));
  for (const [key, action] of Object.entries(configuration.actions)) {
    const targets = Array.isArray(action.target.entity_id) ? action.target.entity_id : [action.target.entity_id];
    for (const target of targets)
      if (!Object.hasOwn(states, target)) pending.push(t('{id}: destino {ref} pendiente', { id: key, ref: target }));
  }
  return pending;
}
export interface ImportSummary {
  added: string[];
  removed: string[];
  changed: string[];
  actions: number;
  panels: number;
  architectureChanged: boolean;
  roomsAdded: string[];
  roomsRemoved: string[];
}
export function summarizeImport(before: Configuration, after: Configuration): ImportSummary {
  const previous = new Map(before.catalog.devices.map(device => [device.id, device]));
  const incoming = new Map(after.catalog.devices.map(device => [device.id, device]));
  return {
    added: [...incoming.keys()].filter(id => !previous.has(id)),
    removed: [...previous.keys()].filter(id => !incoming.has(id)),
    changed: [...incoming]
      .filter(
        ([id, device]) =>
          previous.has(id) &&
          JSON.stringify({ ...device, state: undefined }) !== JSON.stringify({ ...previous.get(id), state: undefined }),
      )
      .map(([id]) => id),
    actions: Object.keys(after.actions).length,
    panels: Object.keys(after.panels).length,
    architectureChanged: before.architecture.content !== after.architecture.content,
    roomsAdded: after.rooms.filter(room => !before.rooms.some(old => old.id === room.id)).map(room => room.id),
    roomsRemoved: before.rooms.filter(room => !after.rooms.some(next => next.id === room.id)).map(room => room.id),
  };
}
