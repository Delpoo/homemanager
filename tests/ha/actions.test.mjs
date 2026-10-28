import test from 'node:test';
import assert from 'node:assert/strict';
import {assertActionDefinition, discoverScriptSignatures, getActionAvailability, executeService} from '../../src/ha/actions.mjs';

// Synthetic session metadata only. Nothing here names an installation or radio command.
function action(domain = 'light', service = 'turn_on', data = {}) {
  return {domain,service,target:{entity_id:`${domain}.contract_control`},data};
}
function hassFor(definition, attributes = {}) {
  const ids = Array.isArray(definition.target.entity_id) ? definition.target.entity_id : [definition.target.entity_id];
  const calls = [];
  const hass = {
    connected:true, states:Object.fromEntries(ids.map(id=>[id,{state:'off',attributes}])),
    services:{[definition.domain]:{[definition.service]:{fields:{}}}}, calls,
    async callService(domain,service,data,target) {calls.push({domain,service,data,target});},
  };
  return hass;
}
function scriptSession() {
  const definition = action('script','turn_on',{variables:{mode:'quiet',level:2,enabled:true,note:'Literal text'}});
  const hass = hassFor(definition);
  hass.services.script.contract_control = {fields:{
    mode:{required:true,selector:{select:{options:[{label:'Quiet',value:'quiet'},'active']}}},
    level:{required:true,selector:{number:{min:1,max:3,step:1}}},
    enabled:{selector:{boolean:{}}},
    note:{selector:{text:{multiline:false}}},
  }};
  return {definition,hass};
}
function reason(definition,hass,options) {return getActionAvailability(definition,hass,options).reason;}

test('static action guard preserves exact shape and returns a defensive copy',()=>{
  const definition=action(),checked=assertActionDefinition(definition);
  assert.deepEqual(checked,definition);assert.notEqual(checked,definition);
  checked.target.entity_id='light.other_contract';assert.equal(definition.target.entity_id,'light.contract_control');
  for(const mutate of [a=>{a.extra=true;},a=>{delete a.target;},a=>{a.domain='vacuum';},a=>{a.service='reload';},a=>{a.transport='rf';},a=>{a.data=null;},a=>{a.data=undefined;}]) {
    const value=action();mutate(value);assert.throws(()=>assertActionDefinition(value));
  }
  let coerced=false;const value=action();value.domain={toString(){coerced=true;return 'light';}};
  assert.throws(()=>assertActionDefinition(value));assert.equal(coerced,false);
});

test('explicit destinations reject broad, mixed, duplicated and data-carried targets',()=>{
  for(const target of ['all','light.all','fan.contract_control',[],['light.contract_control','light.contract_control'],Array.from({length:21},(_,i)=>`light.contract_${i}`)]) {
    const definition=action();definition.target.entity_id=target;assert.throws(()=>assertActionDefinition(definition));
  }
  for(const data of [{entity_id:'light.other_contract'},{nested:{area_id:'contract'}},{variables:{device_id:'contract'}}]) assert.throws(()=>assertActionDefinition(action('light','turn_on',data)));
  const definition=action();definition.target={area_id:'contract'};assert.throws(()=>assertActionDefinition(definition));
});

test('data rejects unsafe keys, nonfinite values, executable templates, cycles and depth',()=>{
  for(const data of [JSON.parse('{"__proto__":{}}'),{value:NaN},{value:Infinity},{value:'{{ value }}'},{value:'{% if value %}'},{value:'javascript:example'},{raw_data:'fixture'},{value:()=>true}]) assert.throws(()=>assertActionDefinition(action('script','turn_on',{variables:data})));
  const cycle={};cycle.next=cycle;assert.throws(()=>assertActionDefinition(action('script','turn_on',{variables:cycle})));
  let deep={};for(let i=0;i<11;i++)deep={nested:deep};assert.throws(()=>assertActionDefinition(action('script','turn_on',{variables:deep})));
  const sparse=Array(1);assert.throws(()=>assertActionDefinition(action('script','turn_on',{variables:{value:sparse}})));
});

test('action-data size is bounded by UTF-8 bytes, not character count',()=>{
  const data={variables:Object.fromEntries(Array.from({length:6},(_,i)=>[`field${i}`,'界'.repeat(500)]))};
  assert.throws(()=>assertActionDefinition(action('script','turn_on',data)),error=>error.code==='data_too_large');
  assert.throws(()=>assertActionDefinition(action('script','turn_on',{variables:{note:'a'.repeat(1025)}})),error=>error.code==='unsafe_data');
});

test('HA service registry, connection and accessible valid target state are required',()=>{
  const definition=action(),hass=hassFor(definition);
  assert.deepEqual(getActionAvailability(definition,hass),{available:true});
  assert.equal(reason(definition,null),'ha_unavailable');
  assert.equal(reason(definition,{...hass,connected:false}),'ha_unavailable');
  assert.equal(reason(definition,{...hass,services:{}}),'service_missing');
  assert.equal(reason(definition,{...hass,states:{}}),'entity_missing');
  for(const state of ['unknown','unavailable','']) assert.equal(reason(definition,{...hass,states:{'light.contract_control':{state}}}),'entity_unavailable');
});

test('fan actions require current advertised feature bits, types and preset values',()=>{
  const definition=action('fan','set_percentage',{percentage:60}),hass=hassFor(definition,{supported_features:1});
  assert.equal(getActionAvailability(definition,hass).available,true);
  assert.equal(reason(definition,hassFor(definition,{supported_features:0})),'capability_missing');
  assert.equal(reason(action('fan','set_percentage',{percentage:'60'}),hass),'unsupported_data');
  assert.equal(reason(action('fan','set_percentage',{percentage:60.5}),hass),'unsupported_data');
  const preset=action('fan','set_preset_mode',{preset_mode:'quiet'});
  assert.equal(getActionAvailability(preset,hassFor(preset,{supported_features:8,preset_modes:['quiet']})).available,true);
  assert.equal(reason(preset,hassFor(preset,{supported_features:8,preset_modes:['active']})),'unsupported_value');
  const turn=action('fan','turn_on');assert.equal(reason(turn,hassFor(turn,{supported_features:1})),'capability_missing');
  assert.equal(getActionAvailability(turn,hassFor(turn,{supported_features:32})).available,true);
  const oscillate=action('fan','oscillate',{oscillating:true});assert.equal(getActionAvailability(oscillate,hassFor(oscillate,{supported_features:2})).available,true);
  assert.equal(reason(action('fan','oscillate',{oscillating:'yes'}),hass),'unsupported_data');
});

test('cover and climate actions enforce advertised capabilities and ranges',()=>{
  const cover=action('cover','set_cover_position',{position:50});
  assert.equal(getActionAvailability(cover,hassFor(cover,{supported_features:4})).available,true);
  assert.equal(reason(cover,hassFor(cover,{supported_features:3})),'capability_missing');
  assert.equal(reason(action('cover','set_cover_position',{position:101}),hassFor(cover,{supported_features:4})),'unsupported_data');
  const temperature=action('climate','set_temperature',{temperature:22});
  assert.equal(getActionAvailability(temperature,hassFor(temperature,{supported_features:1,min_temp:16,max_temp:30})).available,true);
  assert.equal(reason(temperature,hassFor(temperature,{supported_features:1,min_temp:24,max_temp:30})),'unsupported_value');
  assert.equal(reason(temperature,hassFor(temperature,{supported_features:1})),'capability_missing');
  const mode=action('climate','set_hvac_mode',{hvac_mode:'cool'});
  assert.equal(getActionAvailability(mode,hassFor(mode,{hvac_modes:['off','cool']})).available,true);
  assert.equal(reason(mode,hassFor(mode,{hvac_modes:['off','heat']})),'unsupported_value');
});

test('light options require actual color modes and features; unknown fields fail closed',()=>{
  const definition=action('light','turn_on',{brightness_pct:30});
  assert.equal(getActionAvailability(definition,hassFor(definition,{supported_color_modes:['brightness']})).available,true);
  assert.equal(reason(definition,hassFor(definition,{supported_color_modes:['onoff']})),'capability_missing');
  const color=action('light','turn_on',{color_temp_kelvin:3000});
  assert.equal(getActionAvailability(color,hassFor(color,{supported_color_modes:['color_temp'],min_color_temp_kelvin:2000,max_color_temp_kelvin:6000})).available,true);
  const transition=action('light','turn_off',{transition:2});assert.equal(reason(transition,hassFor(transition,{supported_features:0})),'capability_missing');
  assert.equal(reason(action('light','turn_on',{profile:'unverified-profile'}),hassFor(definition)),'unsupported_data');
});

test('script discovery uses actual per-script typed selectors and excludes generic-only metadata',()=>{
  const {definition,hass}=scriptSession();
  const signatures=discoverScriptSignatures(hass);
  assert.deepEqual(Object.keys(signatures),['script.contract_control']);
  assert.equal(signatures['script.contract_control'].verified,true);
  assert.deepEqual(signatures['script.contract_control'].fields.level,{type:'integer',required:true,minimum:1,maximum:3});
  assert.equal(getActionAvailability(definition,hass,{scriptSignatures:signatures}).available,true);
  delete hass.services.script.contract_control;
  assert.equal(reason(definition,hass),'script_signature_unverified');
});

test('script signatures cannot be invented or reused after registry schema changes',()=>{
  const {definition,hass}=scriptSession(),signatures=discoverScriptSignatures(hass);
  const invented={'script.contract_control':{verified:true,fields:{}}};
  assert.equal(reason(definition,hass,{scriptSignatures:invented}),'script_signature_unverified');
  hass.services.script.contract_control={...hass.services.script.contract_control};
  assert.equal(reason(definition,hass,{scriptSignatures:signatures}),'script_signature_stale');
  const next=discoverScriptSignatures(hass);hass.services.script.contract_control.fields.level.selector.number.max=1;
  assert.equal(reason(definition,hass,{scriptSignatures:next}),'script_signature_stale');
});

test('unsupported script selectors and missing field selectors remain disabled',()=>{
  for(const field of [{required:true},{selector:{entity:{}}},{selector:{select:{options:['quiet'],multiple:true}}},{selector:{select:{options:['quiet'],custom_value:true}}}]) {
    const {definition,hass}=scriptSession();hass.services.script.contract_control.fields.mode=field;
    assert.equal(reason(definition,hass),'script_signature_unverified');
  }
});

test('script data obeys discovered required fields, scalar types, enums and bounds',()=>{
  for(const variables of [{mode:'quiet'},{mode:'quiet',level:4},{mode:'quiet',level:2.5},{mode:'missing',level:2},{mode:'quiet',level:2,enabled:'yes'},{mode:'quiet',level:2,extra:'not-declared'}]) {
    const {definition,hass}=scriptSession();definition.data={variables};
    assert.equal(reason(definition,hass),'script_data_invalid');
  }
});

test('execution sends only the validated action through the existing HA session',async()=>{
  const definition=action(),hass=hassFor(definition);
  assert.deepEqual(await executeService(definition,hass),{ok:true});
  assert.deepEqual(hass.calls,[{domain:'light',service:'turn_on',data:{},target:{entity_id:'light.contract_control'}}]);
  definition.target.entity_id='light.changed_after';assert.equal(hass.calls[0].target.entity_id,'light.contract_control');
});

test('HA permission rejection is a rejected operation and does not leak raw failure text',async()=>{
  const definition=action(),hass=hassFor(definition);
  hass.callService=async()=>{throw new Error('synthetic private failure detail');};
  await assert.rejects(executeService(definition,hass),error=>error.code==='ha_service_error'&&error.message==='ha_service_error');
});
