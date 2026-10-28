import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = fileURLToPath(new URL('../', import.meta.url));
const schemaNames = ['catalog', 'configuration', 'runtime-state'];
const schemas = Object.fromEntries(schemaNames.map(name => [name, JSON.parse(readFileSync(path.join(root, 'schemas', `${name}.schema.json`), 'utf8'))]));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
addFormats(ajv);
for (const name of schemaNames) ajv.addSchema(schemas[name], `${name}.schema.json`);
const validators = Object.fromEntries(schemaNames.map(name => [name, ajv.getSchema(`${name}.schema.json`)]));
// V1 stays compilable so migration tests can prove V1 input is genuine V1.
const legacy = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
addFormats(legacy);
for (const name of ['catalog', 'configuration']) legacy.addSchema(JSON.parse(readFileSync(path.join(root, 'schemas', 'v1', `${name}.schema.json`), 'utf8')), `${name}.schema.json`);
validators['catalog-v1'] = legacy.getSchema('catalog.schema.json');
validators['configuration-v1'] = legacy.getSchema('configuration.schema.json');
const dataDepth = value => value && typeof value === 'object' ? 1 + Math.max(0, ...Object.values(value).map(dataDepth)) : 0;

export function validateFoundation(kind, value) {
  const validate = validators[kind];
  if (!validate) throw new TypeError(`Unknown contract: ${kind}`);
  const valid = validate(value);
  const errors = valid ? [] : validate.errors.map(error => `${error.instancePath || '/'} ${error.message}`);
  if (!valid) return { valid: false, errors };
  const catalog = kind === 'catalog' ? value : kind === 'configuration' ? value.catalog : null;
  if (catalog) {
    const ids = new Set();
    for (const device of catalog.devices) {
      if (ids.has(device.id)) errors.push(`Duplicate device id: ${device.id}`);
      ids.add(device.id);
    }
  }
  if (kind === 'configuration') {
    const roomIds = new Set();
    for (const room of value.rooms) {
      if (roomIds.has(room.id)) errors.push(`Duplicate space id: ${room.id}`);
      roomIds.add(room.id);
    }
    for (const device of value.catalog.devices) if (device.roomId !== null && !roomIds.has(device.roomId)) errors.push(`Undeclared space: ${device.id}`);
    const actions = value.actions;
    const panels = value.panels;
    if (Buffer.byteLength(value.architecture.content, 'utf8') > 1_048_576) errors.push('Architecture exceeds 1 MiB UTF-8');
    for (const device of value.catalog.devices) {
      if (device.state.value !== 'unknown' || device.state.confidence !== 'unknown') errors.push(`Persisted state must be unknown: ${device.id}`);
      if (device.bindings.primaryAction && !Object.hasOwn(actions, device.bindings.primaryAction)) errors.push(`Unknown action reference: ${device.id}`);
      if (device.bindings.advancedPopupId && !Object.hasOwn(panels, device.bindings.advancedPopupId)) errors.push(`Unknown native panel reference: ${device.id}`);
    }
    for (const id of Object.keys(value.stateSources)) if (!catalog.devices.some(device => device.id === id)) errors.push(`Unknown state source device: ${id}`);
    for (const [id, action] of Object.entries(actions)) {
      const targets = Array.isArray(action.target.entity_id) ? action.target.entity_id : [action.target.entity_id];
      if (targets.some(target => typeof target !== 'string' || !target.startsWith(`${action.domain}.`))) errors.push(`Action domain/target mismatch: ${id}`);
      if (targets.some(target => target.endsWith('.all'))) errors.push(`Global action target is not permitted: ${id}`);
      if (action.domain === 'script' && action.service !== 'turn_on') errors.push(`Unsupported script service: ${id}`);
      if (action.data && (Buffer.byteLength(JSON.stringify(action.data), 'utf8') > 8192 || dataDepth(action.data) > 10)) errors.push(`Action data exceeds depth/size bounds: ${id}`);
    }
    for (const [id, panel] of Object.entries(panels)) {
      const controlIds = new Set();
      for (const control of panel.controls) {
        if (controlIds.has(control.id)) errors.push(`Duplicate native control id: ${id}/${control.id}`);
        controlIds.add(control.id);
        const action = actions[control.actionId];
        if (!action) errors.push(`Unknown control action: ${id}/${control.id}`);
        if (panel.kind === 'rf-fan' && action && (action.domain !== 'script' || action.service !== 'turn_on')) errors.push(`RF controls require existing HA scripts: ${id}/${control.id}`);
      }
    }
  }
  if (kind === 'runtime-state') {
    for (const [id, state] of Object.entries(value.states)) {
      if (!state.command) continue;
      const elapsed = Date.parse(state.command.expiresAt) - Date.parse(state.command.issuedAt);
      if (elapsed <= 0 || elapsed > 300_000) errors.push(`Invalid command lifetime: ${id}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const name of schemaNames) if (typeof validators[name] !== 'function') throw new Error(`Schema did not compile: ${name}`);
  console.log(`Compiled ${schemaNames.length} JSON Schema contracts. Runtime SVG sanitization and HA authorization remain implementation requirements.`);
}
