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
/** Controls a map device offers (contract V2, optional). They are named by how
 * they are operated, never by what they control: what each step does is an
 * action of the plan. Steps each type takes, as [minimum, maximum]; a slider
 * has none when it adjusts an entity's own value, else 2 to 12 stops. */
export const CONTROL_TYPES = Object.freeze(['button', 'cycle', 'slider', 'updown', 'select']);
export const CONTROL_STEPS = Object.freeze({
  button: [1, 1],
  cycle: [2, 4],
  slider: [0, 12],
  updown: [2, 2],
  select: [2, 8],
});
export const MAX_CONTROLS = 8;
export const MAX_PINNED = 3;
export const MAX_READINGS = 3;
export const SYMBOL_SIZES = Object.freeze(['s', 'm', 'l']);
export const SYMBOL_ARCHETYPES = Object.freeze([
  'actuator',
  'equipment',
  'sensor',
  'meter',
  'remote',
  'infrastructure',
]);
export const SYMBOL_SHOW = Object.freeze(['icon', 'value', 'both']);
export const MAX_ALERT_RULES = 4;
export const ALERT_RULE_LEVELS = Object.freeze(['alert', 'warning']);
/** What the person chose (D21); it decides the archetype and the sheet's sections. */
export const DEVICE_CATEGORIES = Object.freeze([
  'switch',
  'equipment',
  'remote',
  'meter',
  'plant',
  'alert',
  'presence',
  'infrastructure',
]);
/** Where a space's shape came from: copied from an SVG zone, or edited in the app (never overwritten). */
export const ROOM_SHAPE_SOURCES = Object.freeze(['svg', 'app']);
/** How much of the surroundings the room view shows around a space. */
export const ROOM_FRAMES = Object.freeze(['tight', 'normal', 'wide']);
/** A zone is one rectangle, or up to this many merged: an L is two. */
export const MAX_ROOM_RECTS = 12;
export const MAX_CONFIGURATION_BYTES = 3 * 1024 * 1024;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENTITY = /^[a-z][a-z0-9_]*\.[a-z0-9_]+(?![\s\S])/;
const REGISTRY_DEVICE = /^[A-Za-z0-9][A-Za-z0-9_-]*(?![\s\S])/;
const MDI_ICON = /^mdi:[a-z0-9]+(?:-[a-z0-9]+)*(?![\s\S])/;
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
function alertRules(value, path) {
  if (!Array.isArray(value) || value.length > MAX_ALERT_RULES) invalid(path, 'array of at most 4 alert rules required');
  value.forEach((rule, index) => {
    const at = `${path}[${index}]`;
    fields(rule, ['reading', 'level'], ['below', 'above', 'forMinutes'], at);
    entity(rule.reading, `${at}.reading`);
    one(rule.level, ALERT_RULE_LEVELS, `${at}.level`);
    for (const key of ['below', 'above', 'forMinutes'])
      if (Object.hasOwn(rule, key) && (typeof rule[key] !== 'number' || !Number.isFinite(rule[key])))
        invalid(`${at}.${key}`, 'finite number required');
    if (Object.hasOwn(rule, 'forMinutes') && rule.forMinutes < 0)
      invalid(`${at}.forMinutes`, 'nonnegative duration required');
  });
}
/** D22: a space's own rectangle, normalized to the plan like device positions. */
function roomShape(value, path) {
  fields(value, ['x', 'y', 'width', 'height'], [], path);
  for (const key of ['x', 'y', 'width', 'height'])
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1)
      invalid(`${path}.${key}`, 'finite number in [0,1] required');
  if (value.width <= 0 || value.height <= 0) invalid(path, 'a shape needs an area');
  if (value.x + value.width > 1 + 1e-9 || value.y + value.height > 1 + 1e-9)
    invalid(path, 'a shape stays inside the plan');
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

function controls(device, path) {
  const list = device.bindings.controls;
  const types = new Map();
  if (Object.hasOwn(device.bindings, 'controls')) {
    if (!Array.isArray(list) || list.length > MAX_CONTROLS)
      invalid(`${path}.bindings.controls`, `array of at most ${MAX_CONTROLS} controls required`);
    list.forEach((control, index) => {
      const at = `${path}.bindings.controls[${index}]`;
      fields(control, ['id', 'type', 'label', 'steps'], ['entityId', 'orientation'], at);
      id(control.id, `${at}.id`);
      if (types.has(control.id)) invalid(`${at}.id`, 'duplicate identifier');
      one(control.type, CONTROL_TYPES, `${at}.type`);
      types.set(control.id, control.type);
      text(control.label, `${at}.label`, 80);
      const [min, max] = CONTROL_STEPS[control.type];
      if (!Array.isArray(control.steps) || control.steps.length < min || control.steps.length > max)
        invalid(`${at}.steps`, `${min} to ${max} steps required`);
      if (control.type === 'slider' && control.steps.length === 1)
        invalid(`${at}.steps`, 'a slider has no steps or at least 2');
      control.steps.forEach((step, position) => {
        const where = `${at}.steps[${position}]`;
        fields(step, ['actionId'], ['label', 'icon'], where);
        id(step.actionId, `${where}.actionId`);
        if (Object.hasOwn(step, 'label')) text(step.label, `${where}.label`, 80);
        if (Object.hasOwn(step, 'icon')) text(step.icon, `${where}.icon`);
      });
      if (Object.hasOwn(control, 'entityId')) {
        if (control.type !== 'slider' || control.steps.length)
          invalid(`${at}.entityId`, 'only a slider without steps adjusts an entity');
        entity(control.entityId, `${at}.entityId`);
      }
      if (Object.hasOwn(control, 'orientation')) {
        if (control.type !== 'slider') invalid(`${at}.orientation`, 'only a slider has an orientation');
        one(control.orientation, ['vertical', 'horizontal'], `${at}.orientation`);
      }
    });
  }
  if (Object.hasOwn(device.bindings, 'tap') && device.bindings.tap !== null) {
    const type = types.get(device.bindings.tap);
    if (type !== 'button' && type !== 'cycle')
      invalid(`${path}.bindings.tap`, 'must name a button or cycle control of this device');
  }
  if (Object.hasOwn(device.display, 'pinned')) {
    const pinned = device.display.pinned;
    if (!Array.isArray(pinned) || pinned.length > MAX_PINNED || new Set(pinned).size !== pinned.length)
      invalid(`${path}.display.pinned`, `at most ${MAX_PINNED} distinct controls`);
    for (const item of pinned)
      if (!types.has(item)) invalid(`${path}.display.pinned`, 'must name controls of this device');
  }
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
    fields(room, ['id', 'label'], ['icon', 'shape', 'rects', 'shapeSource', 'frame', 'nav'], path);
    id(room.id, `${path}.id`);
    text(room.label, `${path}.label`);
    if (Object.hasOwn(room, 'icon')) {
      text(room.icon, `${path}.icon`);
      if (!MDI_ICON.test(room.icon)) invalid(`${path}.icon`, 'MDI icon identifier required');
    }
    if (Object.hasOwn(room, 'shape')) roomShape(room.shape, `${path}.shape`);
    if (Object.hasOwn(room, 'shapeSource')) {
      one(room.shapeSource, ROOM_SHAPE_SOURCES, `${path}.shapeSource`);
      if (!Object.hasOwn(room, 'shape')) invalid(`${path}.shapeSource`, 'a shape source needs a shape');
    }
    if (Object.hasOwn(room, 'rects')) {
      if (!Object.hasOwn(room, 'shape')) invalid(`${path}.rects`, 'rectangles need the shape that holds them');
      if (!Array.isArray(room.rects) || room.rects.length < 2 || room.rects.length > MAX_ROOM_RECTS)
        invalid(`${path}.rects`, `from 2 to ${MAX_ROOM_RECTS} rectangles required`);
      room.rects.forEach((rect, at) => roomShape(rect, `${path}.rects[${at}]`));
    }
    if (Object.hasOwn(room, 'frame')) one(room.frame, ROOM_FRAMES, `${path}.frame`);
    if (Object.hasOwn(room, 'nav')) {
      fields(room.nav, [], ['skip', 'hidden'], `${path}.nav`);
      if (Object.hasOwn(room.nav, 'skip') && typeof room.nav.skip !== 'boolean')
        invalid(`${path}.nav.skip`, 'boolean required');
      if (Object.hasOwn(room.nav, 'hidden')) {
        if (!Array.isArray(room.nav.hidden) || room.nav.hidden.length > MAX_ROOMS)
          invalid(`${path}.nav.hidden`, `array of at most ${MAX_ROOMS} space IDs required`);
        room.nav.hidden.forEach((item, at) => id(item, `${path}.nav.hidden[${at}]`));
        if (new Set(room.nav.hidden).size !== room.nav.hidden.length)
          invalid(`${path}.nav.hidden`, 'unique space IDs required');
      }
    }
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
    fields(
      device.display,
      ['label', 'icon'],
      ['size', 'pinned', 'archetype', 'show', 'category', 'alerts', 'highlight'],
      `${path}.display`,
    );
    text(device.display.label, `${path}.display.label`);
    text(device.display.icon, `${path}.display.icon`);
    if (Object.hasOwn(device.display, 'size')) one(device.display.size, SYMBOL_SIZES, `${path}.display.size`);
    if (Object.hasOwn(device.display, 'archetype'))
      one(device.display.archetype, SYMBOL_ARCHETYPES, `${path}.display.archetype`);
    if (Object.hasOwn(device.display, 'show')) one(device.display.show, SYMBOL_SHOW, `${path}.display.show`);
    if (Object.hasOwn(device.display, 'category'))
      one(device.display.category, DEVICE_CATEGORIES, `${path}.display.category`);
    if (Object.hasOwn(device.display, 'alerts')) alertRules(device.display.alerts, `${path}.display.alerts`);
    if (Object.hasOwn(device.display, 'highlight') && typeof device.display.highlight !== 'boolean')
      invalid(`${path}.display.highlight`, 'boolean required');
    fields(
      device.bindings,
      ['entityId', 'primaryAction', 'advancedPopupId'],
      ['quickActions', 'remoteId', 'controls', 'tap', 'deviceId', 'readings'],
      `${path}.bindings`,
    );
    if (Object.hasOwn(device.bindings, 'deviceId')) {
      text(device.bindings.deviceId, `${path}.bindings.deviceId`);
      if (!REGISTRY_DEVICE.test(device.bindings.deviceId) || UNSAFE.has(device.bindings.deviceId))
        invalid(`${path}.bindings.deviceId`, 'registry device identifier required');
    }
    if (Object.hasOwn(device.bindings, 'readings')) {
      const readings = device.bindings.readings;
      if (!Array.isArray(readings) || readings.length > MAX_READINGS)
        invalid(`${path}.bindings.readings`, 'array of at most 3 additional readings required');
      for (const reading of readings) entity(reading, `${path}.bindings.readings`);
      if (new Set(readings).size !== readings.length || readings.includes(device.bindings.entityId))
        invalid(`${path}.bindings.readings`, 'additional readings must be unique and exclude the principal');
      if (readings.length && !device.bindings.deviceId)
        invalid(`${path}.bindings.readings`, 'additional readings require a registry device');
    }
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
    controls(device, path);
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
    for (const control of device.bindings.controls ?? [])
      control.steps.forEach((step, index) => {
        if (!Object.hasOwn(configuration.actions, step.actionId))
          pending(`catalog.${device.id}.bindings.controls.${control.id}.${index}`, 'Action is absent; step disabled');
      });
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
