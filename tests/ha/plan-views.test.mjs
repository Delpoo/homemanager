import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { assertConfiguration } from '../../src/ha/validation.mjs';
const cases = JSON.parse(readFileSync('tests/fixtures/plan-views.json'));
const ajv = new Ajv({ strict: true, strictTypes: false });
addFormats(ajv);
ajv.addSchema(JSON.parse(readFileSync('schemas/catalog.schema.json')), 'catalog.schema.json');
const validate = ajv.compile(JSON.parse(readFileSync('schemas/configuration.schema.json')));
test('alternative references agree in JS and schema and preserve geometry', () => {
  for (const [expected, views] of [
    [true, cases.valid],
    [false, cases.invalid],
  ])
    for (const planViews of views) {
      const c = { ...structuredClone(cases.base), planViews };
      const before = structuredClone(c);
      assert.equal(validate(c), expected, JSON.stringify(validate.errors));
      if (expected) assert.deepEqual(assertConfiguration(c), c);
      else assert.throws(() => assertConfiguration(c));
      assert.deepEqual(c, before);
    }
});

test('optional Now panels agree in JS and schema; removed references remain displayable', () => {
  for (const [expected, panels] of [
    [true, cases.panelsValid],
    [false, cases.panelsInvalid],
  ])
    for (const nowPanels of panels) {
      const c = { ...structuredClone(cases.base), nowPanels };
      assert.equal(validate(c), expected, JSON.stringify(validate.errors));
      if (expected) assert.doesNotThrow(() => assertConfiguration(c));
      else assert.throws(() => assertConfiguration(c));
    }
});

test('automations with a button in Now agree in JS and schema', () => {
  for (const [expected, list] of [
    [true, cases.pinsValid],
    [false, cases.pinsInvalid],
  ])
    for (const pinnedAutomations of list) {
      const c = { ...structuredClone(cases.base), pinnedAutomations };
      assert.equal(validate(c), expected, JSON.stringify(pinnedAutomations));
      if (expected) assert.deepEqual(assertConfiguration(c), c);
      else assert.throws(() => assertConfiguration(c));
    }
});

test('the plan width in metres agrees in JS and schema', () => {
  for (const [expected, list] of [
    [true, cases.widthValid],
    [false, cases.widthInvalid],
  ])
    for (const planWidthMetres of list) {
      const c = { ...structuredClone(cases.base), planWidthMetres };
      assert.equal(validate(c), expected, JSON.stringify(planWidthMetres));
      if (expected) assert.deepEqual(assertConfiguration(c), c);
      else assert.throws(() => assertConfiguration(c));
    }
});
