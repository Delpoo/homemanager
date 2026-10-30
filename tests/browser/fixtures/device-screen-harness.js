import './picker-harness.js';
const {card,hass}=window.testHarness;
const configuration=card.getConfiguration();
const stamp=new Date(Date.now()-5000).toISOString();
for(const state of Object.values(hass.states)){state.last_updated=stamp;state.last_changed=stamp;}
const meter=configuration.catalog.devices.find(item=>item.id==='power');
meter.roomId='kitchen';meter.position={x:.65,y:.82};meter.display.label='Medidor de energía';
meter.bindings={...meter.bindings,deviceId:'meter-six',entityId:'sensor.energy_meter_6ch_total_power',readings:['sensor.energy_meter_6ch_today','sensor.energy_meter_voltage','sensor.energy_meter_current']};
const sensor=configuration.catalog.devices.find(item=>item.id==='temperature');
sensor.bindings={...sensor.bindings,deviceId:'device-2',readings:['sensor.synthetic_2_humidity']};
sensor.display.label='Sensor de ambiente';
const climate=configuration.catalog.devices.find(item=>item.id==='cooling');
climate.bindings={...climate.bindings,deviceId:'device-3',entityId:'climate.synthetic_air',readings:['sensor.synthetic_3_temperature','sensor.synthetic_3_humidity']};
hass.states['climate.synthetic_air'].attributes={friendly_name:'Aire acondicionado',temperature:22,current_temperature:24.1,temperature_unit:'°C',min_temp:16,max_temp:30,target_temp_step:.5,supported_features:385,hvac_modes:['off','cool','heat','dry','fan_only'],hvac_action:'cooling'};
hass.services.climate={...hass.services.climate,turn_on:{},turn_off:{},set_temperature:{},set_hvac_mode:{}};
hass.states['binary_sensor.synthetic_leak'].state='on';
configuration.stateSources={};
for(const device of configuration.catalog.devices){
  if(device.bindings.entityId)configuration.stateSources[device.id]={entityId:device.bindings.entityId,attribute:null,feedback:'measured'};
}
const config={type:'custom:homemanager-card',card_id:'synthetic-device-screen',title:'Casa de prueba',dashboard_mode:'storage',configuration};
card.setConfig(config);card.hass={...hass};
window.testHarness.mutateRemote(dashboard=>{dashboard.views[0].cards[0]=structuredClone(config);});
window.deviceScreenHarnessReady=true;
