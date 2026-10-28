import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {assertConfiguration,inspectConfiguration,ROOM_IDS} from '../../src/ha/validation.mjs';
const make=()=>({schemaVersion:1,catalog:{schemaVersion:1,devices:[{id:'sample-light',roomId:'living',kind:'light',position:{x:.5,y:.5},mobility:'editable',display:{label:'Sample',icon:'mdi:lightbulb'},bindings:{entityId:'light.sample',primaryAction:null,advancedPopupId:null},state:{value:'unknown',confidence:'unknown'}}]},architecture:{format:'svg',content:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'},actions:{},panels:{},stateSources:{},commandTtlSeconds:30});
const ajv=new Ajv2020({strict:true,strictTypes:false});addFormats(ajv);
for(const name of ['catalog','configuration','runtime-state'])ajv.addSchema(JSON.parse(readFileSync(new URL(`../../schemas/${name}.schema.json`,import.meta.url))),`${name}.schema.json`);
const schema=ajv.getSchema('configuration.schema.json');

test('accepted configuration conforms to committed schema, with all shared rooms',()=>{
  for(const roomId of ROOM_IDS){const config=make();config.catalog.devices[0].roomId=roomId;assert(schema(assertConfiguration(config)),JSON.stringify(schema.errors));}
});
test('unknown/extra/missing fields and ephemeral state fail before using imported data',()=>{
  for(const mutate of [c=>{delete c.actions;},c=>{c.token='sample';},c=>{c.catalog.devices[0].state.value='on';},c=>{c.catalog.devices[0].position.x=Infinity;},c=>{c.catalog.devices[0].bindings.extra=true;},c=>{c.commandTtlSeconds=0;},c=>{c.commandTtlSeconds=301;},c=>{c.catalog.devices.push(c.catalog.devices[0]);}]){const config=make();mutate(config);assert.throws(()=>assertConfiguration(config));}
});
test('pending references are explicit and disabled or can be rejected for strict review',()=>{
  const config=make();config.catalog.devices[0].bindings.primaryAction='missing-action';config.catalog.devices[0].bindings.advancedPopupId='missing-panel';
  const result=inspectConfiguration(config);assert.equal(result.valid,true);assert.equal(result.issues.length,2);assert(result.issues.every(i=>i.severity==='pending'));
  assert.throws(()=>assertConfiguration(config,{allowPending:false}));assert(schema(config));
});
test('panels only reference actions and RF panels only call explicit scripts',()=>{
  const config=make();config.actions['sample-action']={domain:'light',service:'turn_on',target:{entity_id:'light.sample'}};
  config.panels['sample-panel']={kind:'rf-fan',title:'Sample',controls:[{id:'control',label:'Sample',actionId:'sample-action'}]};
  assert.throws(()=>assertConfiguration(config));config.panels['sample-panel'].kind='device-controls';assertConfiguration(config);
  config.panels['sample-panel'].controls.push(config.panels['sample-panel'].controls[0]);assert.throws(()=>assertConfiguration(config));
});
test('unsafe objects, getters, sparse/cyclic inputs fail without evaluating getters',()=>{
  const config=make();let read=0;Object.defineProperty(config,'actions',{enumerable:true,get(){read++;return{};}});assert.throws(()=>assertConfiguration(config));assert.equal(read,0);
  const unsafe=make();unsafe.actions=JSON.parse('{"constructor":{}}');assert.throws(()=>assertConfiguration(unsafe));
  const cyclic=make();cyclic.catalog.devices.push(cyclic);assert.throws(()=>assertConfiguration(cyclic));
  const sparse=make();sparse.catalog.devices=new Array(1);assert.throws(()=>assertConfiguration(sparse));
});
test('UTF-8 architecture byte bound is independent of character count',()=>{
  const config=make();config.architecture.content='é'.repeat(524289);assert.throws(()=>assertConfiguration(config));
});
