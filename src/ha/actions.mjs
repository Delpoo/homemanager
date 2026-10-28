/** Guarded session-based HA calls. HA remains the authority for permissions.
 * Feature constants checked against HA Core 2026.10.4 fan/cover/climate/light.
 * This module never evaluates action data or constructs a transport connection.
 */
const OWN = (value, key) => Object.hasOwn(value, key);
const UNSAFE = new Set(['__proto__', 'prototype', 'constructor']);
const BLOCKED_DATA =
  /^(?:entity_id|device_id|area_id|rf_codes?|ir_codes?|codes?|protocol|pulse_length|raw(?:_data)?|rc_switch|commands?|command_type)$/i;
const EXECUTABLE = /{{|{%|<\s*script\b|javascript\s*:|\b(?:eval|Function)\s*\(/i;
const ENTITY = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;
const SERVICES = Object.freeze({
  light: ['turn_on', 'turn_off', 'toggle'],
  fan: ['turn_on', 'turn_off', 'toggle', 'set_percentage', 'set_preset_mode', 'set_direction', 'oscillate'],
  cover: ['open_cover', 'close_cover', 'stop_cover', 'set_cover_position'],
  climate: [
    'turn_on',
    'turn_off',
    'set_temperature',
    'set_hvac_mode',
    'set_fan_mode',
    'set_preset_mode',
    'set_swing_mode',
  ],
  switch: ['turn_on', 'turn_off', 'toggle'],
  button: ['press'],
  script: ['turn_on'],
});
const SCRIPT_PROOFS = new WeakMap();
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function plain(value, code = 'invalid_action') {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail(code);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || UNSAFE.has(key) || !descriptor?.enumerable || !OWN(descriptor, 'value')) fail(code);
  }
  return value;
}
function exact(value, allowed, required = [], code = 'invalid_action') {
  plain(value, code);
  if (Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !OWN(value, key))) fail(code);
}
function denseArray(value, maximum, code) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    fail(code);
  const result = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !OWN(descriptor, 'value')) fail(code);
    result.push(descriptor.value);
  }
  return result;
}
function dataJson(value, depth = 0, parents = new Set()) {
  if (depth > 10) fail('unsafe_data');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('unsafe_data');
    return;
  }
  if (typeof value === 'string') {
    if (value.length > 1024 || EXECUTABLE.test(value)) fail('unsafe_data');
    return;
  }
  if (parents.has(value)) fail('unsafe_data');
  parents.add(value);
  if (Array.isArray(value)) {
    for (const item of denseArray(value, 100, 'unsafe_data')) dataJson(item, depth + 1, parents);
  } else {
    plain(value, 'unsafe_data');
    const keys = Object.keys(value);
    if (keys.length > 100) fail('unsafe_data');
    for (const key of keys) {
      if (!key || key.length > 100 || BLOCKED_DATA.test(key)) fail('unsafe_data');
      dataJson(value[key], depth + 1, parents);
    }
  }
  parents.delete(value);
}
function numeric(value, minimum, maximum, integer = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  )
    fail('unsupported_data');
}
function text(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024) fail('unsupported_data');
}
function dataKeys(data, allowed, required = []) {
  exact(data, allowed, required, 'unsupported_data');
}
function schemaData(action) {
  const data = OWN(action, 'data') ? action.data : {};
  if (action.domain === 'script') {
    dataKeys(data, ['variables']);
    if (data.variables !== undefined) plain(data.variables, 'unsupported_data');
    return;
  }
  if (action.domain === 'light') {
    const allowed =
      action.service === 'turn_on'
        ? ['brightness', 'brightness_pct', 'color_temp_kelvin', 'rgb_color', 'transition']
        : action.service === 'turn_off'
          ? ['transition']
          : [];
    dataKeys(data, allowed);
    if (OWN(data, 'brightness')) numeric(data.brightness, 0, 255, true);
    if (OWN(data, 'brightness_pct')) numeric(data.brightness_pct, 0, 100);
    if (OWN(data, 'brightness') && OWN(data, 'brightness_pct')) fail('unsupported_data');
    if (OWN(data, 'color_temp_kelvin')) numeric(data.color_temp_kelvin, 1, Number.MAX_SAFE_INTEGER, true);
    if (OWN(data, 'rgb_color')) {
      if (!Array.isArray(data.rgb_color) || data.rgb_color.length !== 3) fail('unsupported_data');
      data.rgb_color.forEach(value => numeric(value, 0, 255, true));
    }
    if (OWN(data, 'color_temp_kelvin') && OWN(data, 'rgb_color')) fail('unsupported_data');
    if (OWN(data, 'transition')) numeric(data.transition, 0, 6553);
    return;
  }
  if (action.domain === 'fan') {
    const field = {
      set_percentage: 'percentage',
      set_preset_mode: 'preset_mode',
      set_direction: 'direction',
      oscillate: 'oscillating',
    }[action.service];
    dataKeys(
      data,
      field ? [field] : action.service === 'turn_on' ? ['percentage', 'preset_mode'] : [],
      field ? [field] : [],
    );
    if (OWN(data, 'percentage')) numeric(data.percentage, 0, 100, true);
    if (OWN(data, 'preset_mode')) text(data.preset_mode);
    if (OWN(data, 'direction') && !['forward', 'reverse'].includes(data.direction)) fail('unsupported_data');
    if (OWN(data, 'oscillating') && typeof data.oscillating !== 'boolean') fail('unsupported_data');
    if (OWN(data, 'percentage') && OWN(data, 'preset_mode')) fail('unsupported_data');
    return;
  }
  if (action.domain === 'cover') {
    dataKeys(
      data,
      action.service === 'set_cover_position' ? ['position'] : [],
      action.service === 'set_cover_position' ? ['position'] : [],
    );
    if (OWN(data, 'position')) numeric(data.position, 0, 100, true);
    return;
  }
  if (action.domain === 'climate') {
    const field = {
      set_hvac_mode: 'hvac_mode',
      set_fan_mode: 'fan_mode',
      set_preset_mode: 'preset_mode',
      set_swing_mode: 'swing_mode',
    }[action.service];
    dataKeys(
      data,
      field
        ? [field]
        : action.service === 'set_temperature'
          ? ['temperature', 'target_temp_low', 'target_temp_high', 'hvac_mode']
          : [],
      field ? [field] : [],
    );
    if (field) text(data[field]);
    if (action.service === 'set_temperature') {
      const single = OWN(data, 'temperature'),
        low = OWN(data, 'target_temp_low'),
        high = OWN(data, 'target_temp_high');
      if ((!single && !(low && high)) || (single && (low || high))) fail('unsupported_data');
      for (const name of ['temperature', 'target_temp_low', 'target_temp_high'])
        if (OWN(data, name)) numeric(data[name], -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      if (low && data.target_temp_low > data.target_temp_high) fail('unsupported_data');
      if (OWN(data, 'hvac_mode')) text(data.hvac_mode);
    }
    return;
  }
  dataKeys(data, []);
}

/** Pure static guard. Does not look up HA, execute anything, or trust a binding. */
export function assertActionDefinition(action) {
  exact(action, ['domain', 'service', 'target', 'data'], ['domain', 'service', 'target']);
  if (
    typeof action.domain !== 'string' ||
    typeof action.service !== 'string' ||
    !OWN(SERVICES, action.domain) ||
    !SERVICES[action.domain].includes(action.service)
  )
    fail('action_not_allowed');
  exact(action.target, ['entity_id'], ['entity_id']);
  const targets = Array.isArray(action.target.entity_id)
    ? denseArray(action.target.entity_id, 20, 'invalid_target')
    : [action.target.entity_id];
  if (targets.length < 1 || targets.length > 20 || new Set(targets).size !== targets.length) fail('invalid_target');
  for (const target of targets)
    if (
      typeof target !== 'string' ||
      target.length > 240 ||
      !ENTITY.test(target) ||
      !target.startsWith(`${action.domain}.`) ||
      target.endsWith('.all')
    )
      fail('invalid_target');
  const data = OWN(action, 'data') ? action.data : {};
  plain(data, 'unsafe_data');
  dataJson(data);
  if (bytes(data) > 8192) fail('data_too_large');
  schemaData(action);
  return structuredClone(action);
}

function feature(attributes, flag) {
  const value = attributes.supported_features;
  if (!Number.isSafeInteger(value) || value < 0 || (value & flag) !== flag) fail('capability_missing');
}
function listed(attributes, name, value) {
  const values = attributes[name];
  if (!Array.isArray(values) || !values.includes(value)) fail('unsupported_value');
}
function boundedAttribute(attributes, name, value) {
  const minimum = attributes[`min_${name}`],
    maximum = attributes[`max_${name}`];
  if (
    typeof minimum !== 'number' ||
    typeof maximum !== 'number' ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum > maximum
  )
    fail('capability_missing');
  if (value < minimum || value > maximum) fail('unsupported_value');
}
function capabilities(action, entity) {
  const a = entity.attributes ?? {},
    data = action.data ?? {},
    service = action.service;
  if (action.domain === 'fan') {
    feature(
      a,
      { turn_on: 32, turn_off: 16, toggle: 48, set_percentage: 1, set_preset_mode: 8, set_direction: 4, oscillate: 2 }[
        service
      ],
    );
    if (OWN(data, 'percentage')) feature(a, 1);
    if (OWN(data, 'preset_mode')) {
      feature(a, 8);
      listed(a, 'preset_modes', data.preset_mode);
    }
  } else if (action.domain === 'cover') {
    feature(a, { open_cover: 1, close_cover: 2, set_cover_position: 4, stop_cover: 8 }[service]);
  } else if (action.domain === 'climate') {
    const flag = { turn_on: 256, turn_off: 128, set_fan_mode: 8, set_preset_mode: 16, set_swing_mode: 32 }[service];
    if (flag) feature(a, flag);
    for (const [key, list] of [
      ['hvac_mode', 'hvac_modes'],
      ['fan_mode', 'fan_modes'],
      ['preset_mode', 'preset_modes'],
      ['swing_mode', 'swing_modes'],
    ])
      if (OWN(data, key)) listed(a, list, data[key]);
    if (OWN(data, 'temperature')) feature(a, 1);
    if (OWN(data, 'target_temp_low')) feature(a, 2);
    for (const key of ['temperature', 'target_temp_low', 'target_temp_high'])
      if (OWN(data, key)) boundedAttribute(a, 'temp', data[key]);
  } else if (action.domain === 'light') {
    const modes = Array.isArray(a.supported_color_modes) ? a.supported_color_modes : [];
    if (
      (OWN(data, 'brightness') || OWN(data, 'brightness_pct')) &&
      !modes.some(mode => ['brightness', 'color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'white'].includes(mode))
    )
      fail('capability_missing');
    if (OWN(data, 'rgb_color') && !modes.some(mode => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(mode)))
      fail('capability_missing');
    if (OWN(data, 'color_temp_kelvin')) {
      if (!modes.includes('color_temp')) fail('capability_missing');
      boundedAttribute(a, 'color_temp_kelvin', data.color_temp_kelvin);
    }
    if (OWN(data, 'transition')) feature(a, 32);
  }
}

function selectorField(field) {
  plain(field, 'script_signature_invalid');
  if (field.required !== undefined && typeof field.required !== 'boolean') fail('script_signature_invalid');
  const selector = field.selector;
  plain(selector, 'script_signature_invalid');
  const names = Object.keys(selector);
  if (names.length !== 1) fail('script_signature_invalid');
  const name = names[0],
    options = selector[name];
  plain(options, 'script_signature_invalid');
  const descriptor = { type: '', required: field.required === true };
  if (name === 'boolean') descriptor.type = 'boolean';
  else if (name === 'text') {
    if (options.multiple === true) fail('script_signature_invalid');
    descriptor.type = 'string';
  } else if (name === 'number') {
    descriptor.type = options.step === 1 ? 'integer' : 'number';
    for (const [key, target] of [
      ['min', 'minimum'],
      ['max', 'maximum'],
    ])
      if (options[key] !== undefined) {
        if (typeof options[key] !== 'number' || !Number.isFinite(options[key])) fail('script_signature_invalid');
        descriptor[target] = options[key];
      }
    if (descriptor.minimum !== undefined && descriptor.maximum !== undefined && descriptor.minimum > descriptor.maximum)
      fail('script_signature_invalid');
  } else if (name === 'select') {
    if (
      options.multiple === true ||
      options.custom_value === true ||
      !Array.isArray(options.options) ||
      !options.options.length ||
      options.options.length > 100
    )
      fail('script_signature_invalid');
    descriptor.type = 'string';
    descriptor.enum = denseArray(options.options, 100, 'script_signature_invalid').map(option => {
      const value = typeof option === 'string' ? option : plain(option, 'script_signature_invalid').value;
      text(value);
      if (EXECUTABLE.test(value)) fail('script_signature_invalid');
      return value;
    });
    if (new Set(descriptor.enum).size !== descriptor.enum.length) fail('script_signature_invalid');
    Object.freeze(descriptor.enum);
  } else fail('script_signature_invalid');
  return Object.freeze(descriptor);
}
function inspectScriptEntry(entry) {
  plain(entry, 'script_signature_invalid');
  const rawFields = OWN(entry, 'fields') ? entry.fields : {};
  plain(rawFields, 'script_signature_invalid');
  if (Object.keys(rawFields).length > 100) fail('script_signature_invalid');
  const fields = Object.create(null),
    fingerprint = [];
  for (const name of Object.keys(rawFields).sort()) {
    if (!name || name.length > 100 || BLOCKED_DATA.test(name)) fail('script_signature_invalid');
    fields[name] = selectorField(rawFields[name]);
    const raw = rawFields[name];
    dataJson(raw.selector);
    if (OWN(raw, 'default')) dataJson(raw.default);
    fingerprint.push([name, fields[name], raw.selector, OWN(raw, 'default') ? { default: raw.default } : {}]);
  }
  return { fields: Object.freeze(fields), fingerprint: JSON.stringify(fingerprint) };
}

/** Discover per-script signatures from the current session registry. The generic
 * script.turn_on variables field is deliberately insufficient. Unsupported
 * selectors leave that script absent. Proof is kept in memory, outside config.
 */
export function discoverScriptSignatures(hass) {
  const result = Object.create(null),
    registry = hass?.services?.script;
  if (!registry || typeof registry !== 'object') return Object.freeze(result);
  for (const name of Object.keys(registry)) {
    if (SERVICES.script.includes(name) || ['turn_off', 'toggle', 'reload'].includes(name) || !/^[a-z0-9_]+$/.test(name))
      continue;
    const entityId = `script.${name}`;
    if (entityId.length > 240 || !OWN(hass.states ?? {}, entityId)) continue;
    try {
      const declaration = registry[name],
        inspected = inspectScriptEntry(declaration);
      const signature = Object.freeze({ verified: true, fields: inspected.fields });
      SCRIPT_PROOFS.set(signature, { entityId, declaration, fingerprint: inspected.fingerprint });
      result[entityId] = signature;
    } catch {
      /* Incomplete/unsupported session metadata keeps execution disabled. */
    }
  }
  return Object.freeze(result);
}
function scriptData(action, entityId, hass, signatures) {
  const signature = signatures && OWN(signatures, entityId) ? signatures[entityId] : null;
  const proof = signature && SCRIPT_PROOFS.get(signature);
  if (!signature || signature.verified !== true || !proof || proof.entityId !== entityId)
    fail('script_signature_unverified');
  const current = hass.services.script[entityId.slice('script.'.length)];
  if (current !== proof.declaration) fail('script_signature_stale');
  let inspected;
  try {
    inspected = inspectScriptEntry(current);
  } catch {
    fail('script_signature_stale');
  }
  if (inspected.fingerprint !== proof.fingerprint) fail('script_signature_stale');
  const values = action.data?.variables ?? {};
  if (Object.keys(values).some(name => !OWN(signature.fields, name))) fail('script_data_invalid');
  for (const [name, descriptor] of Object.entries(signature.fields)) {
    if (!OWN(values, name)) {
      if (descriptor.required) fail('script_data_invalid');
      continue;
    }
    const value = values[name];
    if (
      descriptor.type === 'number' || descriptor.type === 'integer'
        ? typeof value !== 'number' ||
          !Number.isFinite(value) ||
          (descriptor.type === 'integer' && !Number.isInteger(value))
        : typeof value !== descriptor.type
    )
      fail('script_data_invalid');
    if (descriptor.enum && !descriptor.enum.includes(value)) fail('script_data_invalid');
    if (descriptor.minimum !== undefined && value < descriptor.minimum) fail('script_data_invalid');
    if (descriptor.maximum !== undefined && value > descriptor.maximum) fail('script_data_invalid');
  }
}
function validated(action, hass, options) {
  const checked = assertActionDefinition(action);
  if (!hass || hass.connected === false || typeof hass.callService !== 'function') fail('ha_unavailable');
  if (!OWN(hass.services ?? {}, checked.domain) || !OWN(hass.services[checked.domain] ?? {}, checked.service))
    fail('service_missing');
  const targets = Array.isArray(checked.target.entity_id) ? checked.target.entity_id : [checked.target.entity_id];
  for (const id of targets) {
    if (!OWN(hass.states ?? {}, id)) fail('entity_missing');
    const entity = hass.states[id];
    if (
      !entity ||
      typeof entity.state !== 'string' ||
      !entity.state.trim() ||
      ['unknown', 'unavailable'].includes(entity.state)
    )
      fail('entity_unavailable');
    capabilities(checked, entity);
    if (checked.domain === 'script')
      scriptData(checked, id, hass, options.scriptSignatures ?? discoverScriptSignatures(hass));
  }
  return checked;
}

export function getActionAvailability(action, hass, options = {}) {
  try {
    validated(action, hass, options);
    return { available: true };
  } catch (error) {
    return { available: false, reason: typeof error?.code === 'string' ? error.code : 'invalid_action' };
  }
}

/** No target/data overrides are accepted. A resolved promise proves API
 * acceptance only. No exception payload or service data is logged/persisted.
 */
export async function executeService(action, hass, options = {}) {
  const checked = validated(action, hass, options);
  try {
    await hass.callService(
      checked.domain,
      checked.service,
      structuredClone(checked.data ?? {}),
      structuredClone(checked.target),
    );
  } catch {
    fail('ha_service_error');
  }
  return { ok: true };
}
