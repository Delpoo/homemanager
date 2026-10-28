import { KINDS, ROOM_IDS, SERVICES, clone, type Action, type Configuration, type Device, type NativePanel, type StateSource } from '../card/types.js';

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENTITY = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const BAD_DATA = /^(?:entity_id|area_id|device_id|rf_codes?|ir_codes?|codes?|protocol|pulse_length|raw(?:_data)?|rc_switch|commands?|command_type)$/i;
function fail(message: string): never { throw new Error(message); }
export function stableKey(value: string, label = 'ID'): string {
  if (!KEY.test(value) || value.length > 120 || UNSAFE.has(value)) fail(`${label}: usá un ID kebab-case válido.`);
  return value;
}
function entity(value: string): string {
  if (!ENTITY.test(value) || value.length > 240 || value.endsWith('.all')) fail('La entidad debe ser explícita y tener formato dominio.nombre.');
  return value;
}
function plainText(value: string, label: string): string {
  const text = value.trim(); if (!text || text.length > 240 || /[\u0000-\u001f]/.test(text)) fail(`${label}: escribí un texto válido.`); return text;
}
/** Explicitly reconstruct persistent fields; runtime readings never enter exports or drafts. */
export function persistentConfiguration(configuration: Configuration): Configuration {
  const next = clone(configuration);
  for (const device of next.catalog.devices) device.state = { value: 'unknown', confidence: 'unknown' };
  return next;
}
export function newDeviceId(label: string, configuration: Configuration): string {
  const slug = label.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 105).replace(/-$/g, '');
  const base = !slug || UNSAFE.has(slug) ? 'device' : slug;
  let id = base, index = 2;
  while (configuration.catalog.devices.some(device => device.id === id)) id = `${base}-${index++}`;
  return id;
}
export function upsertDevice(configuration: Configuration, input: Device, options: { previousId?: string; allowFixedPosition?: boolean } = {}): Configuration {
  const next = persistentConfiguration(configuration);
  const id = stableKey(input.id);
  const previous = options.previousId ? next.catalog.devices.find(device => device.id === options.previousId) : undefined;
  if (options.previousId && !previous) fail('El icono que querés editar ya no existe.');
  if (previous && id !== previous.id) fail('El ID de un icono existente es inmutable.');
  if (!previous && next.catalog.devices.some(device => device.id === id)) fail('Ese ID ya existe.');
  if (!ROOM_IDS.includes(input.roomId) || !KINDS.includes(input.kind) || !['fixed', 'editable', 'portable'].includes(input.mobility)) fail('Habitación, tipo o movilidad inválidos.');
  for (const coordinate of [input.position.x, input.position.y]) if (!Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1) fail('Las coordenadas deben estar entre 0 y 1.');
  if (previous?.mobility === 'fixed' && !options.allowFixedPosition && (previous.position.x !== input.position.x || previous.position.y !== input.position.y || previous.roomId !== input.roomId)) fail('Usá la acción explícita de corregir ubicación para un elemento fijo.');
  if (!/^mdi:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.display.icon)) fail('El icono debe ser un nombre mdi: válido.');
  if (input.bindings.entityId) entity(input.bindings.entityId);
  for (const key of [input.bindings.primaryAction, input.bindings.advancedPopupId]) if (key !== null) stableKey(key, 'Referencia');
  const device: Device = { id, roomId: input.roomId, kind: input.kind, position: { x: input.position.x, y: input.position.y }, mobility: input.mobility, display: { label: plainText(input.display.label, 'Nombre'), icon: input.display.icon }, bindings: { entityId: input.bindings.entityId, primaryAction: input.bindings.primaryAction, advancedPopupId: input.bindings.advancedPopupId }, state: { value: 'unknown', confidence: 'unknown' } };
  if (previous) next.catalog.devices[next.catalog.devices.findIndex(device => device.id === id)] = device;
  else next.catalog.devices.push(device);
  return next;
}
export function removeDevice(configuration: Configuration, id: string): Configuration {
  const next = persistentConfiguration(configuration);
  if (!next.catalog.devices.some(device => device.id === id)) fail('Ese icono ya no existe.');
  next.catalog.devices = next.catalog.devices.filter(device => device.id !== id);
  delete next.stateSources[id];
  // Reusable actions/panels and real HA entities deliberately remain intact.
  return next;
}
function validateData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Los datos deben ser un objeto JSON.');
  let bytes: number;
  try { bytes = new TextEncoder().encode(JSON.stringify(data)).length; } catch { fail('Los datos no son JSON válido.'); }
  if (bytes! > 8192) fail('Los datos exceden 8192 bytes.');
  function check(value: unknown, depth: number): void {
    if (depth > 10) fail('Los datos exceden la profundidad máxima de 10.');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail('No se admiten números no finitos.'); return; }
    if (typeof value === 'string') { if (value.length > 1024 || /\{\{|\{%|\$\{|javascript\s*:|<script\b|=>|\b(?:eval|Function)\s*\(/i.test(value)) fail('No se admiten plantillas ni código ejecutable en los datos.'); return; }
    if (Array.isArray(value)) { if (value.length > 100) fail('Una lista excede 100 elementos.'); value.forEach(item => check(item, depth + 1)); return; }
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('Los datos deben ser JSON.');
    const entries = Object.entries(value);
    if (entries.length > 100) fail('Un objeto excede 100 campos.');
    for (const [key, item] of entries) {
      if (!key || key.length > 100 || UNSAFE.has(key) || BAD_DATA.test(key)) fail(`Campo de datos no permitido: ${key}.`);
      check(item, depth + 1);
    }
  }
  check(data, 0); return clone(data as Record<string, unknown>);
}
export function upsertAction(configuration: Configuration, key: string, input: Action): Configuration {
  stableKey(key, 'ID de acción');
  if (!Object.hasOwn(SERVICES, input.domain) || !SERVICES[input.domain].includes(input.service)) fail('Dominio o servicio no permitido.');
  if (!input.target || Object.keys(input.target).some(key => key !== 'entity_id')) fail('Definí únicamente destinos entity_id explícitos.');
  const targets = Array.isArray(input.target.entity_id) ? input.target.entity_id : [input.target.entity_id];
  if (!targets.length || targets.length > 20 || new Set(targets).size !== targets.length) fail('Elegí entre 1 y 20 destinos únicos.');
  for (const target of targets) if (typeof target !== 'string' || entity(target).split('.')[0] !== input.domain) fail('Cada destino debe pertenecer al dominio de la acción.');
  const action: Action = { domain: input.domain, service: input.service, target: { entity_id: Array.isArray(input.target.entity_id) ? [...targets] : targets[0] } };
  if (input.data !== undefined) action.data = validateData(input.data) as Action['data'];
  const next = persistentConfiguration(configuration); next.actions[key] = action; return next;
}
export function upsertStateSource(configuration: Configuration, deviceId: string, source: StateSource | null): Configuration {
  const next = persistentConfiguration(configuration);
  if (!next.catalog.devices.some(device => device.id === deviceId)) fail('Seleccioná un icono existente.');
  if (source === null) { delete next.stateSources[deviceId]; return next; }
  entity(source.entityId);
  if (source.attribute !== null && (!source.attribute || source.attribute.length > 100 || UNSAFE.has(source.attribute) || BAD_DATA.test(source.attribute))) fail('El atributo no es válido.');
  if (!['measured', 'optimistic', 'transmitter'].includes(source.feedback)) fail('Elegí un tipo de feedback válido.');
  next.stateSources[deviceId] = { entityId: source.entityId, attribute: source.attribute, feedback: source.feedback }; return next;
}
export function upsertPanel(configuration: Configuration, key: string, panel: NativePanel): Configuration {
  stableKey(key, 'ID de panel');
  if (!['device-controls', 'rf-fan'].includes(panel.kind) || !Array.isArray(panel.controls) || panel.controls.length > 100) fail('Panel o cantidad de controles inválidos.');
  const ids = new Set<string>();
  const controls = panel.controls.map(control => {
    stableKey(control.id, 'ID de control'); stableKey(control.actionId, 'Referencia de acción');
    if (ids.has(control.id)) fail('Los IDs de controles deben ser únicos dentro del panel.'); ids.add(control.id);
    const action = configuration.actions[control.actionId];
    if (panel.kind === 'rf-fan' && action && (action.domain !== 'script' || action.service !== 'turn_on')) fail('Un panel RF sólo puede usar acciones script.turn_on.');
    return { id: control.id, label: plainText(control.label, 'Nombre del control'), actionId: control.actionId };
  });
  const next = persistentConfiguration(configuration); next.panels[key] = { kind: panel.kind, title: plainText(panel.title, 'Título'), controls }; return next;
}
export function pendingReferences(configuration: Configuration, states: Record<string, unknown> = {}): string[] {
  const pending: string[] = [];
  for (const device of configuration.catalog.devices) {
    if (device.bindings.entityId && !Object.hasOwn(states, device.bindings.entityId)) pending.push(`${device.id}: entidad ${device.bindings.entityId} pendiente`);
    if (device.bindings.primaryAction && !Object.hasOwn(configuration.actions, device.bindings.primaryAction)) pending.push(`${device.id}: acción ${device.bindings.primaryAction} pendiente`);
    if (device.bindings.advancedPopupId && !Object.hasOwn(configuration.panels, device.bindings.advancedPopupId)) pending.push(`${device.id}: panel ${device.bindings.advancedPopupId} pendiente`);
  }
  for (const [key, panel] of Object.entries(configuration.panels)) for (const control of panel.controls) if (!Object.hasOwn(configuration.actions, control.actionId)) pending.push(`${key}: acción ${control.actionId} pendiente`);
  for (const [key, source] of Object.entries(configuration.stateSources)) if (!Object.hasOwn(states, source.entityId)) pending.push(`${key}: fuente ${source.entityId} pendiente`);
  for (const [key, action] of Object.entries(configuration.actions)) {
    const targets = Array.isArray(action.target.entity_id) ? action.target.entity_id : [action.target.entity_id];
    for (const target of targets) if (!Object.hasOwn(states, target)) pending.push(`${key}: destino ${target} pendiente`);
  }
  return pending;
}
export interface ImportSummary { added: string[]; removed: string[]; changed: string[]; actions: number; panels: number; architectureChanged: boolean }
export function summarizeImport(before: Configuration, after: Configuration): ImportSummary {
  const previous = new Map(before.catalog.devices.map(device => [device.id, device]));
  const incoming = new Map(after.catalog.devices.map(device => [device.id, device]));
  return { added: [...incoming.keys()].filter(id => !previous.has(id)), removed: [...previous.keys()].filter(id => !incoming.has(id)), changed: [...incoming].filter(([id, device]) => previous.has(id) && JSON.stringify({ ...device, state: undefined }) !== JSON.stringify({ ...previous.get(id), state: undefined })).map(([id]) => id), actions: Object.keys(after.actions).length, panels: Object.keys(after.panels).length, architectureChanged: before.architecture.content !== after.architecture.content };
}
