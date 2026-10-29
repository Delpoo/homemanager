import { assertActionDefinition } from './actions.mjs';
import { migrateConfiguration } from './migration.mjs';

// Spaces are instance data since V2 (see migration.mjs); there is no room vocabulary here.
export const KINDS = Object.freeze([
  'light',
  'fan',
  'curtain',
  'ac',
  'sensor',
  'switch',
  'robot',
  'purifier',
  'plant',
  'infra',
  'energy',
  'media',
  'lock',
  'camera',
  'appliance',
  'other',
]);
export const MAX_ROOMS = 200;
export const MAX_CONFIGURATION_BYTES = 3 * 1024 * 1024;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENTITY = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;
const UNSAFE = new Set(['__proto__', 'prototype', 'constructor']);
const RESERVED_DATA_KEY =
  /^(?:entity_id|device_id|area_id|rf_codes?|ir_codes?|codes?|protocol|pulse_length|raw(?:_data)?|rc_switch|commands?|command_type)$/i;
const encoder = new TextEncoder();

export class ConfigurationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'ConfigurationError';
    this.code = 'invalid-configuration';
    this.issues = issues;
  }
}
function invalid(path, detail) {
  throw new ConfigurationError(`${path}: ${detail}`, [
    { path, code: 'invalid-format', severity: 'error', message: detail },
  ]);
}
function plain(value, path) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid(path, 'plain object required');
}
function fields(value, required, optional, path) {
  plain(value, path);
  const missing = required.filter(key => !Object.hasOwn(value, key));
  const extra = Object.keys(value).filter(key => ![...required, ...optional].includes(key));
  if (missing.length || extra.length) invalid(path, `missing [${missing.join(',')}]; extra [${extra.join(',')}]`);
}
function text(value, path, max = 240) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    invalid(path, `nonempty string, max ${max} required`);
}
function id(value, path) {
  text(value, path);
  if (!ID.test(value) || UNSAFE.has(value)) invalid(path, 'safe kebab-case identifier required');
}
function entity(value, path) {
  text(value, path);
  if (!ENTITY.test(value) || value.endsWith('.all')) invalid(path, 'explicit entity ID required');
}
function one(value, values, path) {
  if (!values.includes(value)) invalid(path, 'unsupported value');
}
function position(value, path) {
  fields(value, ['x', 'y'], [], path);
  for (const key of ['x', 'y'])
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1)
      invalid(`${path}.${key}`, 'finite number in [0,1] required');
}

/** Inspect descriptors before reading values: imported objects may contain getters.
 * Runtime-only APIs never evaluate imported data or accept cyclic/non-JSON input.
 */
function safeJson(value, path = 'configuration', depth = 0, ancestors = new Set()) {
  if (depth > 24) invalid(path, 'configuration nesting exceeds 24');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid(path, 'nonfinite value');
    return;
  }
  if (typeof value !== 'object') invalid(path, 'JSON data required');
  if (ancestors.has(value)) invalid(path, 'cyclic input');
  if (Object.getOwnPropertySymbols(value).length) invalid(path, 'symbol keys forbidden');
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) invalid(path, 'custom array prototype forbidden');
  } else plain(value, path);
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (Array.isArray(value) && key === 'length') continue;
    if (UNSAFE.has(key)) invalid(path, 'unsafe object key');
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable)
      invalid(path, 'accessors and hidden fields forbidden');
    if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)) invalid(path, 'extra array property');
    safeJson(descriptor.value, `${path}.${key}`, depth + 1, ancestors);
  }
  if (Array.isArray(value) && Object.keys(value).length !== value.length) invalid(path, 'sparse array');
  ancestors.delete(value);
}
function map(value, path, limit = 2000) {
  plain(value, path);
  if (Object.keys(value).length > limit) invalid(path, `map exceeds ${limit} entries`);
  for (const key of Object.keys(value)) id(key, `${path} key`);
}

function shape(configuration) {
  safeJson(configuration);
  // HA's websocket accepts at most 4 MiB per incoming message (aiohttp default) and
  // a Lovelace save sends the WHOLE dashboard, JSON-escaped. Keep headroom.
  if (encoder.encode(JSON.stringify(configuration)).byteLength > MAX_CONFIGURATION_BYTES)
    invalid('configuration', 'document exceeds 3 MiB');
  fields(
    configuration,
    ['schemaVersion', 'rooms', 'catalog', 'architecture', 'actions', 'panels', 'stateSources'],
    ['commandTtlSeconds'],
    'configuration',
  );
  if (configuration.schemaVersion !== 2)
    invalid('schemaVersion', 'expected 2 (V1 documents are migrated before validation)');
  if (!Array.isArray(configuration.rooms) || configuration.rooms.length > MAX_ROOMS)
    invalid('rooms', `array of at most ${MAX_ROOMS} spaces required`);
  const roomIds = new Set();
  configuration.rooms.forEach((room, index) => {
    const path = `rooms[${index}]`;
    fields(room, ['id', 'label'], [], path);
    id(room.id, `${path}.id`);
    text(room.label, `${path}.label`);
    if (roomIds.has(room.id)) invalid(`${path}.id`, 'duplicate space identifier');
    roomIds.add(room.id);
  });
  const catalog = configuration.catalog;
  fields(catalog, ['schemaVersion', 'devices'], [], 'catalog');
  if (catalog.schemaVersion !== 2 || !Array.isArray(catalog.devices) || catalog.devices.length > 2000)
    invalid('catalog', 'V2 array of at most 2000 devices required');
  const deviceIds = new Set();
  catalog.devices.forEach((device, index) => {
    const path = `catalog.devices[${index}]`;
    fields(device, ['id', 'roomId', 'kind', 'position', 'mobility', 'display', 'bindings', 'state'], [], path);
    id(device.id, `${path}.id`);
    if (deviceIds.has(device.id)) invalid(`${path}.id`, 'duplicate identifier');
    deviceIds.add(device.id);
    if (device.roomId !== null) {
      id(device.roomId, `${path}.roomId`);
      if (!roomIds.has(device.roomId)) invalid(`${path}.roomId`, 'space is not declared in rooms');
    }
    one(device.kind, KINDS, `${path}.kind`);
    one(device.mobility, ['fixed', 'editable', 'portable'], `${path}.mobility`);
    position(device.position, `${path}.position`);
    fields(device.display, ['label', 'icon'], [], `${path}.display`);
    text(device.display.label, `${path}.display.label`);
    text(device.display.icon, `${path}.display.icon`);
    fields(
      device.bindings,
      ['entityId', 'primaryAction', 'advancedPopupId'],
      ['quickActions', 'remoteId'],
      `${path}.bindings`,
    );
    for (const key of ['entityId', 'primaryAction', 'advancedPopupId', 'remoteId'])
      if (device.bindings[key] !== null && device.bindings[key] !== undefined) {
        if (key === 'entityId') entity(device.bindings[key], `${path}.bindings.${key}`);
        else id(device.bindings[key], `${path}.bindings.${key}`);
      }
    if (Object.hasOwn(device.bindings, 'quickActions')) {
      const quick = device.bindings.quickActions;
      if (!Array.isArray(quick) || quick.length > 4)
        invalid(`${path}.bindings.quickActions`, 'array of at most 4 quick actions required');
      const quickIds = new Set();
      quick.forEach((item, position) => {
        const at = `${path}.bindings.quickActions[${position}]`;
        fields(item, ['id', 'label', 'actionId'], [], at);
        id(item.id, `${at}.id`);
        text(item.label, `${at}.label`, 80);
        id(item.actionId, `${at}.actionId`);
        if (quickIds.has(item.id)) invalid(`${at}.id`, 'duplicate identifier');
        quickIds.add(item.id);
      });
    }
    fields(device.state, ['value', 'confidence'], [], `${path}.state`);
    if (device.state.value !== 'unknown' || device.state.confidence !== 'unknown')
      invalid(`${path}.state`, 'persisted state must remain unknown/unknown');
  });
  fields(configuration.architecture, ['format', 'content'], [], 'architecture');
  if (configuration.architecture.format !== 'svg') invalid('architecture.format', 'expected svg');
  text(configuration.architecture.content, 'architecture.content', 1048576);
  if (encoder.encode(configuration.architecture.content).byteLength > 1048576)
    invalid('architecture.content', 'SVG exceeds 1 MiB UTF-8');
  // XML parsing, element/style profile and resolved internal references belong to
  // the frontend sanitizer at import AND rendering boundaries, not this module.
  map(configuration.actions, 'actions');
  for (const [key, action] of Object.entries(configuration.actions)) {
    try {
      assertActionDefinition(action);
    } catch (error) {
      invalid(`actions.${key}`, error.message);
    }
  }
  map(configuration.panels, 'panels');
  for (const [key, panel] of Object.entries(configuration.panels)) {
    fields(panel, ['kind', 'title', 'controls'], [], `panels.${key}`);
    one(panel.kind, ['device-controls', 'rf-fan'], `panels.${key}.kind`);
    text(panel.title, `panels.${key}.title`);
    if (!Array.isArray(panel.controls) || panel.controls.length > 100)
      invalid(`panels.${key}.controls`, 'array of at most 100 controls required');
    const controls = new Set();
    for (const control of panel.controls) {
      fields(control, ['id', 'label', 'actionId'], [], `panels.${key}.control`);
      id(control.id, `panels.${key}.control.id`);
      text(control.label, `panels.${key}.control.label`);
      id(control.actionId, `panels.${key}.control.actionId`);
      if (controls.has(control.id)) invalid(`panels.${key}.controls`, 'duplicate control ID');
      controls.add(control.id);
      const action = configuration.actions[control.actionId];
      if (panel.kind === 'rf-fan' && action && (action.domain !== 'script' || action.service !== 'turn_on'))
        invalid(`panels.${key}`, 'RF panel controls must reference script.turn_on actions');
    }
  }
  map(configuration.stateSources, 'stateSources');
  for (const [key, source] of Object.entries(configuration.stateSources)) {
    if (!deviceIds.has(key)) invalid(`stateSources.${key}`, 'device is absent from catalog');
    fields(source, ['entityId', 'attribute', 'feedback'], [], `stateSources.${key}`);
    entity(source.entityId, `stateSources.${key}.entityId`);
    if (source.attribute !== null) {
      text(source.attribute, `stateSources.${key}.attribute`, 100);
      if (UNSAFE.has(source.attribute) || RESERVED_DATA_KEY.test(source.attribute))
        invalid(`stateSources.${key}.attribute`, 'unsafe attribute');
    }
    one(source.feedback, ['measured', 'optimistic', 'transmitter'], `stateSources.${key}.feedback`);
  }
  if (
    configuration.commandTtlSeconds !== undefined &&
    (!Number.isInteger(configuration.commandTtlSeconds) ||
      configuration.commandTtlSeconds < 1 ||
      configuration.commandTtlSeconds > 300)
  )
    invalid('commandTtlSeconds', 'integer in [1,300] required');
}

/** Missing references stay visible as disabled pending items. Strict export/review
 * may pass allowPending:false. Neither mode executes actions or sanitizes SVG.
 */
export function inspectConfiguration(input, { allowPending = true } = {}) {
  const issues = [];
  let configuration;
  try {
    safeJson(input);
    configuration = migrateConfiguration(input);
    shape(configuration);
  } catch (error) {
    return {
      valid: false,
      issues: error.issues ?? [
        { path: 'configuration', code: 'invalid-format', severity: 'error', message: error.message },
      ],
    };
  }
  const pending = (path, message) =>
    issues.push({ path, code: 'unresolved-reference', severity: allowPending ? 'pending' : 'error', message });
  for (const device of configuration.catalog.devices) {
    if (device.bindings.primaryAction && !Object.hasOwn(configuration.actions, device.bindings.primaryAction))
      pending(`catalog.${device.id}.bindings.primaryAction`, 'Action is absent; execution disabled');
    if (device.bindings.advancedPopupId && !Object.hasOwn(configuration.panels, device.bindings.advancedPopupId))
      pending(`catalog.${device.id}.bindings.advancedPopupId`, 'Native panel is absent; control disabled');
    for (const item of device.bindings.quickActions ?? [])
      if (!Object.hasOwn(configuration.actions, item.actionId))
        pending(`catalog.${device.id}.bindings.quickActions.${item.id}`, 'Action is absent; quick action disabled');
  }
  for (const [key, panel] of Object.entries(configuration.panels))
    for (const control of panel.controls)
      if (!Object.hasOwn(configuration.actions, control.actionId))
        pending(`panels.${key}.${control.id}`, 'Action is absent; control disabled');
  return { valid: !issues.some(issue => issue.severity === 'error'), issues, configuration };
}
/** Accepts V1 or V2 input and always returns a validated V2 clone. */
export function assertConfiguration(configuration, options) {
  const result = inspectConfiguration(configuration, options);
  if (!result.valid)
    throw new ConfigurationError(
      result.issues.map(issue => `${issue.path}: ${issue.message}`).join('; '),
      result.issues,
    );
  return result.configuration;
}
