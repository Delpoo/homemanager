// Tests read in Spanish, as for a Home Assistant user whose language is es.
globalThis.__homemanagerLanguage = 'es';
import './ha-icon.js';
import '../../../dist/homemanager.js';

// This entire apartment, inventory and HA session are synthetic test data.
// The mock's localStorage simulates a shared HA server across page reloads.
// The product card must never use this as its persistence fallback.
const key = 'homemanager-synthetic-dashboard';
const architecture = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 1000 700"><title>Synthetic geometry</title><rect x="20" y="30" width="980" height="680" rx="12" fill="#f7f5ee" stroke="#415d51" stroke-width="5"/><rect id="room-living" x="30" y="40" width="440" height="620" fill="#e1e9df" stroke="#415d51"/><rect id="room-kitchen" x="500" y="40" width="470" height="285" fill="#ece3cf" stroke="#415d51"/><rect id="room-office" x="500" y="355" width="470" height="305" fill="#dce8e8" stroke="#415d51"/></svg>';
const device = (id, roomId, kind, x, y, mobility, label, icon, entityId, primaryAction, advancedPopupId) => ({
  id,roomId,kind,position:{x,y},mobility,display:{label,icon},
  bindings:{entityId,primaryAction,advancedPopupId},state:{value:'unknown',confidence:'unknown'}
});
const original = {
  type:'custom:homemanager-card',card_id:'synthetic-card',dashboard_mode:'storage',title:'HomeManager',
  room_labels:{living:'Espacio A',kitchen:'Espacio B',office:'Espacio C'},
  configuration:{
    schemaVersion:1,architecture:{format:'svg',content:architecture},
    catalog:{schemaVersion:1,devices:[
      device('synthetic-light','living','light',0.25,0.33,'editable','Luz de prueba','mdi:lightbulb','light.synthetic_light','synthetic-light-toggle','synthetic-light-panel'),
      device('synthetic-fan','kitchen','fan',0.72,0.22,'fixed','Ventilador de prueba','mdi:fan',null,'synthetic-fan-command','synthetic-fan-panel'),
      device('synthetic-sensor','office','sensor',0.72,0.72,'portable','Temperatura de prueba','mdi:thermometer','sensor.synthetic_temperature',null,null)
    ]},
    actions:{
      'synthetic-light-toggle':{domain:'light',service:'toggle',target:{entity_id:'light.synthetic_light'}},
      'synthetic-fan-command':{domain:'script',service:'turn_on',target:{entity_id:'script.synthetic_fan'}}
    },
    panels:{
      'synthetic-light-panel':{kind:'device-controls',title:'Control sintético',controls:[{id:'toggle',label:'Alternar luz de prueba',actionId:'synthetic-light-toggle'}]},
      'synthetic-fan-panel':{kind:'rf-fan',title:'Ventilador sintético',controls:[{id:'run',label:'Ejecutar script de prueba',actionId:'synthetic-fan-command'}]}
    },
    stateSources:{
      'synthetic-light':{entityId:'light.synthetic_light',attribute:null,feedback:'optimistic'},
      'synthetic-sensor':{entityId:'sensor.synthetic_temperature',attribute:null,feedback:'optimistic'}
    },commandTtlSeconds:1
  }
};
let dashboard;
try{dashboard=JSON.parse(localStorage.getItem(key)||'null');}catch{}
dashboard ||= {title:'Synthetic dashboard',views:[{title:'Synthetic view',cards:[structuredClone(original),{type:'markdown',content:'Synthetic unrelated card'}]}]};
const calls=[],wsCalls=[],events=[];
const flags={failSave:false,failRead:false,readbackMismatch:false};
const stamp=new Date().toISOString();
const hass={
  language:'es',locale:{language:'es'},user:{id:'synthetic-admin',is_admin:true},connection:{connected:true},panels:{lovelace:{config:{mode:'storage'}}},
  states:{
    'light.synthetic_light':{state:'off',attributes:{friendly_name:'Synthetic light'},last_updated:stamp,last_changed:stamp},
    'script.synthetic_fan':{state:'off',attributes:{friendly_name:'Synthetic script'},last_updated:stamp,last_changed:stamp},
    'sensor.synthetic_temperature':{state:'23',attributes:{friendly_name:'Synthetic temperature',unit_of_measurement:'°C'},last_updated:stamp,last_changed:stamp},
    'light.synthetic_spare':{state:'off',attributes:{friendly_name:'Synthetic spare light'},last_updated:stamp,last_changed:stamp}
  },
  services:{light:{toggle:{fields:{}},turn_on:{fields:{}},turn_off:{fields:{}}},script:{turn_on:{fields:{variables:{}}},synthetic_fan:{fields:{}}}},
  async callService(domain,service,data,target){
    if(!this.connection.connected) throw new Error('Synthetic disconnected session');
    calls.push(structuredClone({domain,service,data:data||{},target:target||null}));
    return {};
  },
  async callWS(message){
    wsCalls.push(structuredClone(message));
    if(!this.connection.connected) throw new Error('Synthetic disconnected session');
    if(message.type==='lovelace/config'){
      if(flags.failRead)throw new Error('Synthetic read failure');
      return structuredClone(dashboard);
    }
    if(message.type==='lovelace/config/save'){
      if(!this.user.is_admin)throw new Error('Unauthorized');
      if(this.panels.lovelace.config.mode!=='storage')throw new Error('YAML read only');
      if(flags.failSave)throw new Error('Synthetic save failure');
      dashboard=structuredClone(message.config);
      if(flags.readbackMismatch)dashboard.views[0].cards[0].configuration.catalog.devices[0].display.label='Synthetic remote overwrite';
      localStorage.setItem(key,JSON.stringify(dashboard));
      return null;
    }
    throw new Error(`Unsupported synthetic request ${message.type}`);
  }
};
await customElements.whenDefined('homemanager-card');
const card=document.createElement('homemanager-card');
card.setConfig(structuredClone(dashboard.views[0].cards[0]));
card.hass=hass;
for(const eventName of ['config-changed','homemanager-saved','homemanager-configuration-saved'])card.addEventListener(eventName,e=>events.push({type:e.type,detail:e.detail}));
document.querySelector('#mount').append(card);
window.testHarness={
  card,hass,calls,wsCalls,events,flags,original:structuredClone(original),
  get config(){return structuredClone(dashboard.views[0].cards[0]);},
  get dashboard(){return structuredClone(dashboard);},
  setAdmin(value){hass.user.is_admin=value;card.hass={...hass};},
  setMode(value){hass.panels.lovelace.config.mode=value;const config={...dashboard.views[0].cards[0],dashboard_mode:value};card.setConfig(structuredClone(config));card.hass={...hass};},
  setConnected(value){hass.connection.connected=value;card.hass={...hass};},
  mutateRemote(callback){callback(dashboard);localStorage.setItem(key,JSON.stringify(dashboard));},
  updateState(entityId,state,attributes={}){hass.states[entityId]={state,attributes,last_updated:new Date().toISOString()};card.hass={...hass};},
  reset(){localStorage.removeItem(key);location.reload();}
};
window.testHarnessReady=true;
