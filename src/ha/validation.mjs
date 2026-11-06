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
/** No fixed limit of three any more (#91): a safe technical ceiling of 31 besides the main one. */
export const MAX_READINGS = 31;
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
export const MAX_ALERT_RULES = 2000;
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
/** 0.13: a space's own outline, rings of points (outer first, then holes). */
export const MAX_OUTLINE_RINGS = 8;
export const MAX_OUTLINE_POINTS = 200;
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
/** Plan 0.12 (#92, #93, #94): how a symbol and its values look. All optional. */
function symbolLook(display, path) {
  const hex = (value, where) => {
    if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) invalid(where, 'hex color required');
  };
  const range = (value, min, max, where) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
      invalid(where, `number between ${min} and ${max} required`);
  };
  if (Object.hasOwn(display, 'values')) {
    const values = display.values;
    if (!Array.isArray(values) || values.length > 8) invalid(`${path}.values`, 'at most 8 values');
    const seen = new Set();
    values.forEach((value, index) => {
      const where = `${path}.values[${index}]`;
      fields(value, ['entity'], ['decimals', 'unit', 'label', 'size', 'color', 'ranges', 'dot'], where);
      entity(value.entity, `${where}.entity`);
      if (seen.has(value.entity)) invalid(where, 'each reading once');
      seen.add(value.entity);
      if (
        Object.hasOwn(value, 'decimals') &&
        (!Number.isInteger(value.decimals) || value.decimals < 0 || value.decimals > 3)
      )
        invalid(`${where}.decimals`, '0 to 3 decimals');
      if (Object.hasOwn(value, 'unit') && typeof value.unit !== 'boolean') invalid(`${where}.unit`, 'boolean required');
      if (Object.hasOwn(value, 'dot') && typeof value.dot !== 'boolean') invalid(`${where}.dot`, 'boolean required');
      if (
        Object.hasOwn(value, 'label') &&
        (typeof value.label !== 'string' || !value.label.trim() || value.label.length > 16)
      )
        invalid(`${where}.label`, 'short label required');
      if (Object.hasOwn(value, 'size')) one(value.size, ['s', 'm', 'l'], `${where}.size`);
      if (Object.hasOwn(value, 'color')) hex(value.color, `${where}.color`);
      if (Object.hasOwn(value, 'ranges')) {
        if (!Array.isArray(value.ranges) || value.ranges.length > 6) invalid(`${where}.ranges`, 'at most 6 ranges');
        value.ranges.forEach((item, at) => {
          fields(item, ['from', 'color'], [], `${where}.ranges[${at}]`);
          range(item.from, -1e9, 1e9, `${where}.ranges[${at}].from`);
          hex(item.color, `${where}.ranges[${at}].color`);
        });
      }
    });
  }
  if (Object.hasOwn(display, 'valuePlace'))
    one(display.valuePlace, ['inside', 'beside', 'below'], `${path}.valuePlace`);
  // 0.13 indicators: visual marks from one reading; at most one of each type.
  if (Object.hasOwn(display, 'indicators')) {
    const list = display.indicators;
    if (!Array.isArray(list) || list.length > 5) invalid(`${path}.indicators`, 'at most 5 indicators');
    const types = new Set();
    list.forEach((item, index) => {
      const where = `${path}.indicators[${index}]`;
      fields(
        item,
        ['type', 'entity'],
        ['attribute', 'hidden', 'min', 'max', 'width', 'fill', 'empty', 'ranges', 'states', 'none', 'position'],
        where,
      );
      one(item.type, ['ring', 'border', 'icon', 'led', 'number'], `${where}.type`);
      if (types.has(item.type)) invalid(where, 'one indicator of each type');
      types.add(item.type);
      entity(item.entity, `${where}.entity`);
      if (
        Object.hasOwn(item, 'attribute') &&
        (typeof item.attribute !== 'string' || !/^[A-Za-z0-9_]{1,80}$/.test(item.attribute))
      )
        invalid(`${where}.attribute`, 'attribute name required');
      if (Object.hasOwn(item, 'hidden') && typeof item.hidden !== 'boolean') invalid(`${where}.hidden`, 'boolean');
      for (const key of ['min', 'max']) if (Object.hasOwn(item, key)) range(item[key], -1e9, 1e9, `${where}.${key}`);
      if (Object.hasOwn(item, 'min') && Object.hasOwn(item, 'max') && item.min >= item.max)
        invalid(where, 'min below max');
      if (Object.hasOwn(item, 'width') && (!Number.isInteger(item.width) || item.width < 2 || item.width > 10))
        invalid(`${where}.width`, '2 to 10');
      for (const key of ['fill', 'empty', 'none']) if (Object.hasOwn(item, key)) hex(item[key], `${where}.${key}`);
      if (Object.hasOwn(item, 'position')) one(item.position, ['tr', 'br', 'b'], `${where}.position`);
      if (Object.hasOwn(item, 'ranges')) {
        if (!Array.isArray(item.ranges) || item.ranges.length > 8) invalid(`${where}.ranges`, 'at most 8 ranges');
        item.ranges.forEach((part, at) => {
          const there = `${where}.ranges[${at}]`;
          fields(part, ['from', 'to', 'color'], ['name'], there);
          range(part.from, -1e9, 1e9, `${there}.from`);
          range(part.to, -1e9, 1e9, `${there}.to`);
          if (part.from > part.to) invalid(there, 'from not above to');
          hex(part.color, `${there}.color`);
          if (Object.hasOwn(part, 'name') && (typeof part.name !== 'string' || part.name.length > 24))
            invalid(`${there}.name`, 'short name');
        });
      }
      if (Object.hasOwn(item, 'states')) {
        const states = item.states;
        if (!states || typeof states !== 'object' || Array.isArray(states) || Object.keys(states).length > 16)
          invalid(`${where}.states`, 'at most 16 states');
        for (const [key, color] of Object.entries(states)) {
          if (!/^[A-Za-z0-9_ .-]{1,40}$/.test(key) || UNSAFE.has(key)) invalid(`${where}.states`, 'state name');
          hex(color, `${where}.states.${key}`);
        }
      }
    });
  }
  if (Object.hasOwn(display, 'scale')) range(display.scale, 0.5, 2.5, `${path}.scale`);
  if (Object.hasOwn(display, 'roomScale')) range(display.roomScale, 0.5, 2.5, `${path}.roomScale`);
  if (Object.hasOwn(display, 'opacity')) range(display.opacity, 0, 100, `${path}.opacity`);
  if (Object.hasOwn(display, 'shape')) one(display.shape, ['circle', 'pill', 'dot', 'icon'], `${path}.shape`);
  // #95: a drawing or a shortcut that needs no device link.
  if (Object.hasOwn(display, 'standalone') && display.standalone !== true)
    invalid(`${path}.standalone`, 'true or absent');
}
/** Plan 0.12 (#97): links that may open, and Home Assistant pages. Never javascript:, data: or file:. */
const BLOCKED_SCHEMES = /^(?:javascript|data|file|vbscript|about|blob|chrome|ms-[a-z-]+):/i;
const LINK = /^(?:https:\/\/[^\s"'<>]{1,500}|[a-z][a-z0-9+.-]{1,30}:[^\s"'<>]{1,500})$/i;
const HA_PATH = /^\/(?!\/)[A-Za-z0-9/_\-.?=&%#]{0,200}$/;
function link(value, at) {
  if (typeof value !== 'string' || !LINK.test(value) || BLOCKED_SCHEMES.test(value) || /^http:/i.test(value))
    invalid(at, 'https link or app link required');
}
function haPath(value, at) {
  if (typeof value !== 'string' || !HA_PATH.test(value)) invalid(at, 'Home Assistant path required');
}
function gestureAction(binding, at, choose) {
  fields(binding, ['action'], ['controlId', 'path', 'url', 'mobileUrl', 'fallback', 'fallbackPath', 'options'], at);
  const kinds = ['screen', 'panel', 'native', 'none', 'control', 'more-info', 'navigate', 'url'];
  one(binding.action, choose ? [...kinds, 'choose'] : kinds, at);
  const only = (key, kind) => {
    if (Object.hasOwn(binding, key) && binding.action !== kind) invalid(at, `${key} only belongs to ${kind}`);
  };
  only('controlId', 'control');
  only('path', 'navigate');
  for (const key of ['url', 'mobileUrl', 'fallback', 'fallbackPath']) only(key, 'url');
  only('options', 'choose');
  if (binding.action === 'control') id(binding.controlId, at + '.controlId');
  if (binding.action === 'navigate') haPath(binding.path, `${at}.path`);
  if (binding.action === 'url') {
    link(binding.url, `${at}.url`);
    if (Object.hasOwn(binding, 'mobileUrl')) link(binding.mobileUrl, `${at}.mobileUrl`);
    if (Object.hasOwn(binding, 'fallback'))
      one(binding.fallback, ['screen', 'panel', 'more-info', 'navigate'], `${at}.fallback`);
    if (Object.hasOwn(binding, 'fallbackPath')) {
      if (binding.fallback !== 'navigate') invalid(at, 'fallbackPath only belongs to a navigate fallback');
      haPath(binding.fallbackPath, `${at}.fallbackPath`);
    } else if (binding.fallback === 'navigate') invalid(at, 'fallbackPath required');
  }
  if (binding.action === 'choose') {
    const options = binding.options;
    if (!Array.isArray(options) || options.length < 2 || options.length > 4) invalid(`${at}.options`, '2 to 4 options');
    options.forEach((item, index) => {
      const where = `${at}.options[${index}]`;
      fields(item, ['label', 'do'], ['icon'], where);
      if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 40)
        invalid(`${where}.label`, 'short label');
      if (
        Object.hasOwn(item, 'icon') &&
        (typeof item.icon !== 'string' || !/^mdi:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.icon))
      )
        invalid(`${where}.icon`, 'mdi icon');
      gestureAction(item.do, `${where}.do`, false);
    });
  }
}
function entity(value, path) {
  text(value, path);
  if (!ENTITY.test(value) || value.endsWith('.all')) invalid(path, 'explicit entity ID required');
}
function one(value, values, path) {
  if (!values.includes(value)) invalid(path, 'unsupported value');
}
function alertRules(value, path) {
  if (!Array.isArray(value) || value.length > MAX_ALERT_RULES)
    invalid(path, `array of at most ${MAX_ALERT_RULES} alert rules required`);
  value.forEach((rule, index) => {
    const at = `${path}[${index}]`;
    fields(rule, ['reading', 'level'], ['below', 'above', 'forMinutes', 'enabled'], at);
    entity(rule.reading, `${at}.reading`);
    one(rule.level, ALERT_RULE_LEVELS, `${at}.level`);
    if (Object.hasOwn(rule, 'enabled') && typeof rule.enabled !== 'boolean')
      invalid(at + '.enabled', 'boolean required');
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
  for (const gesture of ['tap', 'hold']) {
    const binding = device.bindings[gesture];
    if (binding === undefined || binding === null) continue;
    const at = `${path}.bindings.${gesture}`;
    if (typeof binding === 'string') {
      id(binding, at);
      if (gesture === 'tap' && !['button', 'cycle'].includes(types.get(binding)))
        invalid(at, 'must name a button or cycle control of this device');
    } else {
      gestureAction(binding, at, true);
    }
  }
  if (Object.hasOwn(device.display, 'attached')) assertAttached(device.display.attached, `${path}.display.attached`);
  if (Object.hasOwn(device.display, 'pinned')) {
    const pinned = device.display.pinned;
    if (!Array.isArray(pinned) || pinned.length > MAX_PINNED || new Set(pinned).size !== pinned.length)
      invalid(`${path}.display.pinned`, `at most ${MAX_PINNED} distinct controls`);
    for (const item of pinned)
      if (!types.has(item)) invalid(`${path}.display.pinned`, 'must name controls of this device');
  }
}

/** 0.13: pieces of the device's control drawn next to its symbol, where they were
 * dragged, with their own size and look. Offsets and sizes are pixels at the
 * symbol's own size; the piece is named by its id in the control's layout. */
export const MAX_ATTACHED = 6;
export function assertAttached(list, path) {
  if (!Array.isArray(list) || list.length > MAX_ATTACHED) invalid(path, `at most ${MAX_ATTACHED} pieces`);
  const ids = new Set();
  const between = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
  for (const item of list) {
    fields(item, ['id', 'piece', 'dx', 'dy', 'w', 'h'], ['locked', 'fixedSize', 'look'], path);
    for (const key of ['id', 'piece'])
      if (typeof item[key] !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(item[key]) || UNSAFE.has(item[key]))
        invalid(path, `invalid ${key}`);
    if (ids.has(item.id)) invalid(path, 'ids must be unique');
    ids.add(item.id);
    if (!between(item.dx, -600, 600) || !between(item.dy, -600, 600)) invalid(path, 'invalid offset');
    if (!between(item.w, 24, 480) || !between(item.h, 20, 320)) invalid(path, 'invalid size');
    if (item.locked !== undefined && item.locked !== true) invalid(path, 'invalid locked');
    if (item.fixedSize !== undefined && item.fixedSize !== true) invalid(path, 'invalid fixedSize');
    if (item.look === undefined) continue;
    const look = item.look;
    fields(look, [], ['fontSize', 'valueSize', 'bg', 'fg', 'radius', 'relief', 'opacity'], path);
    if (look.fontSize !== undefined && !between(look.fontSize, 8, 40)) invalid(path, 'invalid fontSize');
    if (look.valueSize !== undefined && !between(look.valueSize, 12, 40)) invalid(path, 'invalid valueSize');
    for (const key of ['bg', 'fg'])
      if (look[key] !== undefined && (typeof look[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(look[key])))
        invalid(path, `invalid ${key}`);
    if (look.radius !== undefined && !between(look.radius, 0, 60) && look.radius !== 999)
      invalid(path, 'invalid radius');
    if (look.relief !== undefined && !['raised', 'flat', 'outline'].includes(look.relief))
      invalid(path, 'invalid relief');
    if (look.opacity !== undefined && !between(look.opacity, 30, 100)) invalid(path, 'invalid opacity');
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
    ['commandTtlSeconds', 'rules', 'planViews', 'nowPanels', 'symbolSizes', 'initialView', 'baseRules'],
    'configuration',
  );
  if (configuration.schemaVersion !== 2)
    invalid('schemaVersion', 'expected 2 (V1 documents are migrated before validation)');
  if (!Array.isArray(configuration.rooms) || configuration.rooms.length > MAX_ROOMS)
    invalid('rooms', `array of at most ${MAX_ROOMS} spaces required`);
  const roomIds = new Set();
  configuration.rooms.forEach((room, index) => {
    const path = `rooms[${index}]`;
    fields(room, ['id', 'label'], ['icon', 'shape', 'rects', 'outline', 'shapeSource', 'frame', 'nav', 'areaId'], path);
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
    if (Object.hasOwn(room, 'outline')) {
      if (room.shapeSource !== 'app') invalid(`${path}.outline`, 'an outline is a shape of the app');
      if (Object.hasOwn(room, 'rects')) invalid(`${path}.outline`, 'an outline replaces the rectangles');
      if (!Array.isArray(room.outline) || room.outline.length < 1 || room.outline.length > MAX_OUTLINE_RINGS)
        invalid(`${path}.outline`, `from 1 to ${MAX_OUTLINE_RINGS} rings required`);
      room.outline.forEach((ring, at) => {
        if (!Array.isArray(ring) || ring.length < 3 || ring.length > MAX_OUTLINE_POINTS)
          invalid(`${path}.outline[${at}]`, `from 3 to ${MAX_OUTLINE_POINTS} points required`);
        ring.forEach((point, n) => {
          if (
            !Array.isArray(point) ||
            point.length !== 2 ||
            point.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
          )
            invalid(`${path}.outline[${at}][${n}]`, 'a point [x, y] inside the plan (0–1) required');
        });
      });
    }
    if (Object.hasOwn(room, 'frame')) one(room.frame, ROOM_FRAMES, `${path}.frame`);
    if (Object.hasOwn(room, 'areaId')) text(room.areaId, `${path}.areaId`);
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
      [
        'size',
        'pinned',
        'attached',
        'archetype',
        'show',
        'category',
        'alerts',
        'highlight',
        'modules',
        'layer',
        'disabledBaseRules',
        'color',
        'values',
        'indicators',
        'valuePlace',
        'scale',
        'roomScale',
        'opacity',
        'shape',
        'standalone',
      ],
      `${path}.display`,
    );
    symbolLook(device.display, `${path}.display`);
    text(device.display.label, `${path}.display.label`);
    text(device.display.icon, `${path}.display.icon`);
    if (
      Object.hasOwn(device.display, 'color') &&
      (typeof device.display.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(device.display.color))
    )
      invalid(path + '.display.color', 'hex color required');
    if (Object.hasOwn(device.display, 'size')) one(device.display.size, SYMBOL_SIZES, `${path}.display.size`);
    if (Object.hasOwn(device.display, 'archetype'))
      one(device.display.archetype, SYMBOL_ARCHETYPES, `${path}.display.archetype`);
    if (Object.hasOwn(device.display, 'show')) one(device.display.show, SYMBOL_SHOW, `${path}.display.show`);
    if (Object.hasOwn(device.display, 'category'))
      one(device.display.category, DEVICE_CATEGORIES, `${path}.display.category`);
    if (Object.hasOwn(device.display, 'modules')) {
      const modules = device.display.modules;
      if (!Array.isArray(modules) || modules.length > 7 || new Set(modules).size !== modules.length)
        invalid(`${path}.display.modules`, 'unique module list required');
      for (const module of modules)
        one(
          module,
          ['device', 'indicators', 'gestures', 'control', 'pinned', 'native', 'rules'],
          `${path}.display.modules`,
        );
    }
    if (Object.hasOwn(device.display, 'layer'))
      one(device.display.layer, ['controls', 'sensors', 'energy', 'infrastructure'], `${path}.display.layer`);
    if (Object.hasOwn(device.display, 'disabledBaseRules')) {
      const list = device.display.disabledBaseRules;
      if (!Array.isArray(list) || list.length > 3 || new Set(list).size !== list.length)
        invalid(path, 'unique base rule list required');
      for (const key of list) one(key, ['safety', 'battery', 'unavailable'], path);
    }
    if (Object.hasOwn(device.display, 'alerts')) alertRules(device.display.alerts, `${path}.display.alerts`);
    if (Object.hasOwn(device.display, 'highlight') && typeof device.display.highlight !== 'boolean')
      invalid(`${path}.display.highlight`, 'boolean required');
    fields(
      device.bindings,
      ['entityId', 'primaryAction', 'advancedPopupId'],
      ['quickActions', 'remoteId', 'irRemoteId', 'controls', 'tap', 'deviceId', 'readings', 'hold', 'layout'],
      `${path}.bindings`,
    );
    if (Object.hasOwn(device.bindings, 'layout'))
      assertControlLayout(device.bindings.layout, `${path}.bindings.layout`);
    if (Object.hasOwn(device.bindings, 'deviceId')) {
      text(device.bindings.deviceId, `${path}.bindings.deviceId`);
      if (!REGISTRY_DEVICE.test(device.bindings.deviceId) || UNSAFE.has(device.bindings.deviceId))
        invalid(`${path}.bindings.deviceId`, 'registry device identifier required');
    }
    if (Object.hasOwn(device.bindings, 'readings')) {
      const readings = device.bindings.readings;
      if (!Array.isArray(readings) || readings.length > MAX_READINGS)
        invalid(`${path}.bindings.readings`, 'array of at most 31 additional readings required');
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
    const infrared = device.bindings.irRemoteId;
    if (infrared != null && (typeof infrared !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(infrared)))
      invalid(`${path}.bindings.irRemoteId`, 'invalid infrared remote ID');
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
  // Plan 0.12 (#94): symbol size by view and zoom, and the initial view. Optional.
  const between = (value, min, max, where) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
      invalid(where, `number between ${min} and ${max} required`);
  };
  if (Object.hasOwn(configuration, 'symbolSizes')) {
    const sizes = configuration.symbolSizes;
    fields(sizes, ['house', 'room', 'min', 'max'], [], 'configuration.symbolSizes');
    for (const key of ['house', 'room', 'min', 'max'])
      between(sizes[key], 0.5, 2.5, `configuration.symbolSizes.${key}`);
  }
  // Plan 0.12 (#60): the automatic rules' switches and limits. Absent: as before.
  if (Object.hasOwn(configuration, 'baseRules')) {
    const rules = configuration.baseRules;
    fields(rules, [], ['battery', 'unavailable', 'safety'], 'configuration.baseRules');
    const toggle = (rule, at) => {
      if (Object.hasOwn(rule, 'enabled') && typeof rule.enabled !== 'boolean') invalid(at, 'boolean required');
    };
    if (Object.hasOwn(rules, 'battery')) {
      fields(rules.battery, [], ['enabled', 'below'], 'configuration.baseRules.battery');
      toggle(rules.battery, 'configuration.baseRules.battery.enabled');
      if (Object.hasOwn(rules.battery, 'below'))
        between(rules.battery.below, 1, 100, 'configuration.baseRules.battery.below');
    }
    if (Object.hasOwn(rules, 'unavailable')) {
      fields(rules.unavailable, [], ['enabled', 'minutes'], 'configuration.baseRules.unavailable');
      toggle(rules.unavailable, 'configuration.baseRules.unavailable.enabled');
      if (Object.hasOwn(rules.unavailable, 'minutes'))
        between(rules.unavailable.minutes, 1, 1440, 'configuration.baseRules.unavailable.minutes');
    }
    if (Object.hasOwn(rules, 'safety')) {
      fields(rules.safety, [], ['enabled'], 'configuration.baseRules.safety');
      toggle(rules.safety, 'configuration.baseRules.safety.enabled');
    }
  }
  if (Object.hasOwn(configuration, 'initialView')) {
    const view = configuration.initialView;
    fields(view, ['room', 'x', 'y', 'zoom'], ['planView'], 'configuration.initialView');
    if (
      view.room !== null &&
      (typeof view.room !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(view.room) || view.room.length > 64)
    )
      invalid('configuration.initialView.room', 'space id or null required');
    between(view.x, -1, 2, 'configuration.initialView.x');
    between(view.y, -1, 2, 'configuration.initialView.y');
    between(view.zoom, 0.5, 16, 'configuration.initialView.zoom');
    if (
      Object.hasOwn(view, 'planView') &&
      (typeof view.planView !== 'string' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(view.planView) ||
        view.planView.length > 64)
    )
      invalid('configuration.initialView.planView', 'plan view id required');
  }
  if (Object.hasOwn(configuration, 'nowPanels')) {
    fields(configuration.nowPanels, [], ['home', 'wall'], 'nowPanels');
    for (const [mode, blocks] of Object.entries(configuration.nowPanels)) {
      if (!Array.isArray(blocks) || blocks.length > 32) invalid('nowPanels', 'at most 32 blocks');
      const ids = new Set();
      for (const block of blocks) {
        fields(
          block,
          ['id', 'type'],
          ['title', 'devices', 'readings', 'deviceId', 'controlId', 'roomId'],
          'nowPanels.block',
        );
        id(block.id, 'nowPanels.id');
        if (
          ids.has(block.id) ||
          !['alerts', 'climate', 'reading', 'readings', 'active', 'energy', 'control', 'shortcut'].includes(block.type)
        )
          invalid('nowPanels', 'invalid block');
        ids.add(block.id);
        if (block.title !== undefined) text(block.title, 'nowPanels.title');
        for (const key of ['deviceId', 'controlId', 'roomId'])
          if (block[key] !== undefined) id(block[key], 'nowPanels.' + key);
        for (const key of ['devices', 'readings'])
          if (block[key] !== undefined) {
            const values = block[key];
            if (
              !Array.isArray(values) ||
              values.length > (key === 'devices' ? 2000 : 200) ||
              new Set(values).size !== values.length
            )
              invalid('nowPanels', 'invalid selection');
            for (const value of values) {
              if (key === 'devices') id(value, 'nowPanels.device');
              else if (
                typeof value !== 'string' ||
                value.length > 240 ||
                !/^[a-z][a-z0-9_]*\.[a-z0-9_]+$/.test(value) ||
                value.endsWith('.all')
              )
                invalid('nowPanels', 'explicit entity reading required');
            }
          }
      }
    }
  }
  if (Object.hasOwn(configuration, 'planViews')) {
    const views = configuration.planViews;
    if (!Array.isArray(views) || views.length > 12) invalid('planViews', 'at most 12 alternatives');
    const ids = new Set();
    for (const view of views) {
      fields(view, ['id', 'name'], ['light', 'dark', 'lightBackground', 'darkBackground'], 'planViews');
      id(view.id, 'planViews.id');
      text(view.name, 'planViews.name');
      if (ids.has(view.id) || (!view.light && !view.dark)) invalid('planViews', 'unique IDs and an image required');
      ids.add(view.id);
      for (const mode of ['light', 'dark']) {
        const image = view[mode];
        if (Object.hasOwn(view, mode)) {
          fields(image, ['scope', 'sha256', 'format', 'box'], [], 'planViews.image');
          if (
            typeof image.scope !== 'string' ||
            image.scope.length > 64 ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(image.scope) ||
            typeof image.sha256 !== 'string' ||
            !/^[a-f0-9]{64}$/.test(image.sha256) ||
            !['svg', 'png', 'jpg'].includes(image.format) ||
            !Array.isArray(image.box) ||
            image.box.length !== 4 ||
            image.box.some((v, i) => !Number.isFinite(v) || Math.abs(v) > 1e7 || (i > 1 && v <= 0))
          )
            invalid('planViews.image', 'invalid image reference');
        }
        const bg = view[mode + 'Background'];
        if (bg !== undefined && (typeof bg !== 'string' || !/^(#[0-9a-fA-F]{6}|transparent)$/.test(bg)))
          invalid('planViews.background', 'invalid color');
      }
    }
  }
  if (Object.hasOwn(configuration, 'rules')) {
    if (!Array.isArray(configuration.rules) || configuration.rules.length > 2000)
      invalid('rules', 'at most 2000 rules');
    const ids = new Set();
    for (const rule of configuration.rules) {
      fields(
        rule,
        ['id', 'name', 'enabled', 'sources', 'symbols', 'level'],
        ['below', 'above', 'state', 'forMinutes', 'badge', 'highlight', 'color', 'bar', 'now'],
        'rules',
      );
      id(rule.id, 'rules.id');
      if (ids.has(rule.id)) invalid('rules.id', 'duplicate rule');
      ids.add(rule.id);
      text(rule.name, 'rules.name');
      for (const key of ['enabled', 'badge', 'highlight', 'bar', 'now'])
        if (Object.hasOwn(rule, key) && typeof rule[key] !== 'boolean') invalid('rules.' + key, 'boolean required');
      one(rule.level, ['alert', 'warning', 'indicator'], 'rules.level');
      for (const key of ['below', 'above', 'forMinutes'])
        if (
          Object.hasOwn(rule, key) &&
          (typeof rule[key] !== 'number' || !Number.isFinite(rule[key]) || (key === 'forMinutes' && rule[key] < 0))
        )
          invalid('rules.' + key, 'finite number required');
      if (rule.color !== undefined && (typeof rule.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(rule.color)))
        invalid('rules.color', 'hex color required');
      if (!Array.isArray(rule.sources) || !rule.sources.length || rule.sources.length > 2000)
        invalid('rules.sources', '1 to 2000 explicit readings');
      const readings = new Set();
      let binary;
      for (const source of rule.sources) {
        fields(source, ['reading'], ['deviceId'], 'rules.source');
        entity(source.reading, 'rules.source.reading');
        if (!/^(sensor|binary_sensor)\./.test(source.reading) || readings.has(source.reading))
          invalid('rules.sources', 'distinct sensor readings required');
        readings.add(source.reading);
        const isBinary = source.reading.startsWith('binary_sensor.');
        if (binary !== undefined && binary !== isBinary) invalid('rules.sources', 'group must share a condition type');
        binary = isBinary;
        if (source.deviceId !== undefined) {
          text(source.deviceId, 'rules.source.deviceId');
          if (!REGISTRY_DEVICE.test(source.deviceId) || UNSAFE.has(source.deviceId))
            invalid('rules.source.deviceId', 'registry ID required');
        }
      }
      if (binary) {
        if (rule.below !== undefined || rule.above !== undefined)
          invalid('rules', 'binary rules do not use thresholds');
        if (rule.state !== undefined) one(rule.state, ['on', 'off'], 'rules.state');
      } else if (rule.state !== undefined || (rule.below === undefined && rule.above === undefined))
        invalid('rules', 'numeric condition required');
      if (
        !Array.isArray(rule.symbols) ||
        rule.symbols.length > 2000 ||
        new Set(rule.symbols).size !== rule.symbols.length
      )
        invalid('rules.symbols', 'unique symbol list required');
      for (const symbol of rule.symbols) id(symbol, 'rules.symbols');
    }
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

/** How a designed piece looks and behaves (0.13 designer, second part). Mirrors
 * custom_components/homemanager/piece_look.py; everything is optional. */
export const BLOCK_SLOTS = {
  dpad: ['up', 'down', 'left', 'right', 'ok'],
  numpad: ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'dash', '0', 'enter'],
  transport: ['prev', 'rew', 'play', 'ff', 'next'],
  colors: ['red', 'green', 'yellow', 'blue'],
};
const LEVEL_TYPES = ['updown', 'slider', 'steps', 'knob'];
const MODE_TYPES = ['modes', 'cycle'];
const MAX_LEVELS = 24;
export const PIECE_LOOK_KEYS = [
  'fontSize',
  'fontWeight',
  'iconSize',
  'border',
  'active',
  'radius',
  'relief',
  'anim',
  'brand',
  'hold',
  'holdButton',
  'values',
  'names',
  'wrap',
  'sendBy',
  'display',
  'valueSize',
  'options',
  'slots',
  'period',
  'theme',
  'gap',
];
const between = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
const shortText = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const HEX = /^#[0-9a-fA-F]{6}$/;
export function pieceLevelCount(p) {
  if (Array.isArray(p.names)) return p.names.length;
  const v = p.values;
  if (
    v &&
    typeof v === 'object' &&
    between(v.min, -9999, 9999) &&
    between(v.max, -9999, 9999) &&
    between(v.step, 1, 9999)
  )
    return Math.floor((v.max - v.min) / v.step) + 1;
  return null;
}
export const pieceSendBy = p => p.sendBy ?? (p.type === 'updown' ? 'updown' : 'level');
/** How many learned buttons a piece uses, given what it says about itself. */
export function pieceInputs(p, fallback) {
  if (BLOCK_SLOTS[p.type]) return [0, BLOCK_SLOTS[p.type].length];
  if (!LEVEL_TYPES.includes(p.type)) return fallback;
  const mode = pieceSendBy(p);
  if (mode === 'updown') return [2, 2];
  if (mode === 'advance') return [1, 1];
  const count = pieceLevelCount(p);
  return count === null ? [2, MAX_LEVELS] : [count, count];
}
function assertPieceLook(p, path, isRef) {
  const kind = p.type;
  const drawn = kind !== 'canvas';
  const level = LEVEL_TYPES.includes(kind);
  const check = (ok, key) => {
    if (!ok) invalid(path, `invalid ${key}`);
  };
  for (const key of PIECE_LOOK_KEYS) {
    if (p[key] === undefined) continue;
    const value = p[key];
    if (key === 'fontSize') check(drawn && between(value, 8, 40), key);
    else if (key === 'fontWeight') check(drawn && [400, 500, 700].includes(value), key);
    else if (key === 'iconSize') check(drawn && between(value, 12, 64), key);
    else if (key === 'border' || key === 'active') check(drawn && typeof value === 'string' && HEX.test(value), key);
    else if (key === 'radius') check(between(value, 0, 60) || (drawn && value === 999), key);
    else if (key === 'relief') check(drawn && ['flat', 'outline'].includes(value), key);
    else if (key === 'anim') check(drawn && ['flash', 'none'].includes(value), key);
    else if (key === 'brand') check(kind === 'button' && shortText(value, 40), key);
    else if (key === 'hold')
      check((value === 'repeat' && (kind === 'button' || level)) || (value === 'other' && kind === 'button'), key);
    else if (key === 'holdButton') check(p.hold === 'other' && typeof value === 'string' && isRef(value), key);
    else if (key === 'values') {
      check(level && p.names === undefined && value && typeof value === 'object' && !Array.isArray(value), key);
      const keys = Object.keys(value);
      check(
        ['min', 'max', 'step'].every(k => keys.includes(k)) &&
          keys.every(k => ['min', 'max', 'step', 'unit'].includes(k)),
        key,
      );
      check(between(value.min, -9999, 9999) && between(value.max, -9999, 9999) && value.min < value.max, key);
      check(between(value.step, 1, 9999) && Math.floor((value.max - value.min) / value.step) + 1 <= 1000, key);
      check(value.unit === undefined || (typeof value.unit === 'string' && value.unit.length <= 6), key);
    } else if (key === 'names')
      check(
        level &&
          Array.isArray(value) &&
          value.length >= 2 &&
          value.length <= MAX_LEVELS &&
          value.every(name => shortText(name, 20)),
        key,
      );
    else if (key === 'wrap') check((level || MODE_TYPES.includes(kind)) && typeof value === 'boolean', key);
    else if (key === 'sendBy') check(level && ['updown', 'advance', 'level'].includes(value), key);
    else if (key === 'display')
      check(
        (level && ['value', 'name', 'dots', 'text'].includes(value)) || (kind === 'modes' && value === 'list'),
        key,
      );
    else if (key === 'valueSize') check(level && between(value, 12, 40), key);
    else if (key === 'options') {
      check(MODE_TYPES.includes(kind) && Array.isArray(value) && value.length === p.buttons.length, key);
      for (const option of value) {
        check(
          option &&
            typeof option === 'object' &&
            Object.keys(option).every(k => k === 'label' || k === 'icon') &&
            (option.label === undefined || option.label === null || shortText(option.label, 20)) &&
            (option.icon === undefined ||
              option.icon === null ||
              (typeof option.icon === 'string' && MDI_ICON.test(option.icon))),
          key,
        );
      }
    } else if (key === 'slots') {
      check(
        BLOCK_SLOTS[kind] &&
          value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          Object.keys(value).every(k => BLOCK_SLOTS[kind].includes(k)),
        key,
      );
      check(
        Object.values(value).every(ref => typeof ref === 'string' && isRef(ref)),
        key,
      );
    } else if (key === 'period') check(kind === 'graph' && ['1h', '24h', '7d'].includes(value), key);
    else if (key === 'theme') check(kind === 'canvas' && ['grafito', 'claro', 'arena', 'vidrio'].includes(value), key);
    else if (key === 'gap') check(kind === 'canvas' && between(value, 2, 24), key);
  }
  check(p.hold !== 'other' || p.holdButton !== undefined, 'holdButton');
  if (level && pieceSendBy(p) === 'level') check((pieceLevelCount(p) ?? 0) <= MAX_LEVELS, 'levels');
  if (BLOCK_SLOTS[kind]) {
    const sent = new Set(Object.values(p.slots ?? {}));
    check(
      new Set(p.buttons).size === p.buttons.length &&
        p.buttons.length === sent.size &&
        p.buttons.every(ref => sent.has(ref)),
      'slots',
    );
  }
}

/** Same optional visual layout as the RF designer; this contains references, never service definitions. */
export function assertControlLayout(layout, path = 'layout') {
  const counts = {
    button: [1, 1],
    toggle: [1, 2],
    updown: [2, 2],
    steps: [2, 12],
    modes: [2, 8],
    cycle: [2, 4],
    slider: [2, 12],
    indicator: [0, 0],
    title: [0, 0],
    separator: [0, 0],
    control: [1, 1],
    knob: [2, 12],
    preset: [1, 12],
    graph: [0, 0],
    canvas: [0, 0],
    ...Object.fromEntries(Object.entries(BLOCK_SLOTS).map(([kind, keys]) => [kind, [0, keys.length]])),
  };
  if (!Array.isArray(layout) || layout.length > 64) invalid(path, 'array of at most 64 pieces required');
  // 0.13: an optional canvas piece sets the grid (2-30 columns, 2-40 rows).
  const canvases = layout.filter(p => p && typeof p === 'object' && p.type === 'canvas');
  if (canvases.length > 1) invalid(path, 'at most one canvas');
  const columns = canvases.length ? canvases[0].w : 4;
  if (!Number.isInteger(columns) || columns < 2 || columns > 30) invalid(path, 'invalid canvas');
  const ids = new Set();
  for (const p of layout) {
    fields(
      p,
      ['id', 'type', 'x', 'y', 'w', 'h', 'buttons', 'label', 'icon'],
      [
        'reading',
        'attribute',
        'bg',
        'fg',
        'shape',
        'hideIcon',
        'hideLabel',
        'orientation',
        'sequence',
        ...PIECE_LOOK_KEYS,
      ],
      path,
    );
    if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(p.id) || UNSAFE.has(p.id) || ids.has(p.id))
      invalid(path, 'unique piece id required');
    ids.add(p.id);
    one(p.type, Object.keys(counts), path);
    const canvas = p.type === 'canvas';
    for (const [k, low, high] of canvas
      ? [
          ['x', 0, 0],
          ['y', 0, 0],
          ['w', 2, 30],
          ['h', 2, 40],
        ]
      : [
          ['x', 0, columns - 1],
          ['y', 0, 39],
          ['w', 1, columns - p.x],
          ['h', 1, 12],
        ])
      if (!Number.isInteger(p[k]) || p[k] < low || p[k] > high) invalid(path, 'invalid piece bounds');
    if (!Array.isArray(p.buttons)) invalid(path, 'invalid piece inputs');
    const [min, max] = pieceInputs(p, counts[p.type]);
    if (p.buttons.length < min || p.buttons.length > max) invalid(path, 'invalid piece inputs');
    for (const ref of p.buttons) id(ref, path);
    assertPieceLook(p, path, ref => {
      id(ref, path);
      return true;
    });
    if (p.label !== null) text(p.label, path, 40);
    if (p.icon !== null && (typeof p.icon !== 'string' || !MDI_ICON.test(p.icon))) invalid(path, 'invalid icon');
    if (p.reading !== undefined) entity(p.reading, path);
    if (p.attribute !== undefined && (typeof p.attribute !== 'string' || !/^[a-zA-Z0-9_]{1,80}$/.test(p.attribute)))
      invalid(path, 'invalid attribute');
    for (const key of ['bg', 'fg'])
      if (p[key] !== undefined && (typeof p[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(p[key])))
        invalid(path, `invalid ${key}`);
    if (p.shape !== undefined && p.shape !== 'round' && p.shape !== 'square') invalid(path, 'invalid shape');
    for (const key of ['hideIcon', 'hideLabel'])
      if (p[key] !== undefined && typeof p[key] !== 'boolean') invalid(path, `invalid ${key}`);
    if (
      p.orientation !== undefined &&
      (p.orientation !== 'vertical' || !['updown', 'slider', 'steps'].includes(p.type))
    )
      invalid(path, 'invalid orientation');
    if (p.type === 'preset' || p.sequence !== undefined) {
      if (p.type !== 'preset' || !Array.isArray(p.sequence) || p.sequence.length < 1 || p.sequence.length > 24)
        invalid(path, 'a preset needs 1-24 steps');
      for (const step of p.sequence) {
        const keys = step && typeof step === 'object' ? Object.keys(step) : [];
        if (keys.length === 1 && keys[0] === 'wait') {
          if (!Number.isInteger(step.wait) || step.wait < 50 || step.wait > 5000) invalid(path, 'invalid wait');
        } else if (
          keys.includes('button') &&
          keys.every(key => key === 'button' || key === 'times') &&
          p.buttons.includes(step.button) &&
          (step.times === undefined || (Number.isInteger(step.times) && step.times >= 1 && step.times <= 10))
        ) {
          /* a learned button of this preset */
        } else invalid(path, 'invalid preset step');
      }
    }
  }
}
