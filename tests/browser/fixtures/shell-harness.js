import './harness.js';
// Entirely fictional: the drawing is adapted from docs/vision-mockup.html.
const {card,hass}=window.testHarness;
const configuration=card.getConfiguration();
configuration.rooms=[['living','Living','mdi:sofa'],['hall','Entrada','mdi:door'],['office','Oficina','mdi:desk'],['bedroom','Dormitorio','mdi:bed'],['bath','Baño','mdi:shower'],['bath-two','Baño dos','mdi:shower'],['kitchen','Cocina','mdi:pot-steam'],['balcony','Balcón','mdi:flower']].map(([id,label,icon])=>({id,label,icon}));
const shapes=[['living','M20 20H290V190H200V380H20Z','#EFEBDD'],['hall','M200 190H290V380H200Z','#EFEBDD'],['office','M290 20H440V170H290Z','#E4D3B4'],['bedroom','M440 20H580V230H440Z','#E4D3B4'],['bath','M290 170H440V280H290Z','#D9E0D9'],['bath-two','M440 230H580V310H440Z','#D9E0D9'],['kitchen','M290 280H440V380H290Z','#EFEBDD'],['balcony','M440 310H580V380H440Z','#DCE3D3']];
configuration.architecture.content=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><g stroke="#55665B" stroke-width="6" stroke-linejoin="round">${shapes.map(([id,d,fill])=>`<path id="room-${id}" d="${d}" fill="${fill}"><title>${configuration.rooms.find(room=>room.id===id).label}</title></path>`).join('')}</g><g fill="none" stroke="#55665B" stroke-opacity=".35" stroke-width="2"><rect x="40" y="40" width="70" height="120" rx="10"/><rect x="140" y="80" width="90" height="50" rx="6"/><rect x="40" y="240" width="120" height="70" rx="8"/><rect x="460" y="50" width="100" height="120" rx="8"/><rect x="310" y="40" width="110" height="40" rx="6"/></g></svg>`;
const device=(id,roomId,kind,x,y,label,icon,entityId,primaryAction=null)=>({id,roomId,kind,position:{x:x/600,y:y/400},mobility:'editable',display:{label,icon},bindings:{entityId,primaryAction,advancedPopupId:null},state:{value:'unknown',confidence:'unknown'}});
configuration.catalog.devices=[device('lamp','living','light',95,70,'Luz Living','mdi:lightbulb','light.synthetic_light','synthetic-light-toggle'),device('fan','living','fan',150,105,'Ventilador Living','mdi:fan',null,'synthetic-fan-command'),device('temperature','living','sensor',160,300,'Temperatura Living','mdi:thermometer','sensor.synthetic_temperature'),device('leak','kitchen','sensor',365,330,'Fuga Cocina','mdi:water-alert','binary_sensor.synthetic_leak'),device('cooling','bedroom','ac',510,120,'Aire Dormitorio','mdi:air-conditioner','climate.synthetic_cooling'),device('remote','bedroom','switch',480,200,'Mando de prueba','mdi:remote',null),device('hub','balcony','infra',540,345,'Puente de prueba','mdi:hub-outline','sensor.synthetic_hub')];
configuration.catalog.devices.find(item=>item.id==='remote').bindings.remoteId='synthetic-remote';
configuration.catalog.devices.push(device('power','office','energy',400,60,'Potencia de prueba','mdi:lightning-bolt-outline','sensor.synthetic_power'));
configuration.stateSources={};configuration.commandTtlSeconds=30;
const stamp=new Date().toISOString();
hass.themes={darkMode:false};hass.states['light.synthetic_light']={state:'on',attributes:{},last_updated:stamp,last_changed:stamp};
hass.states['sensor.synthetic_temperature']={state:'23.4',attributes:{device_class:'temperature',unit_of_measurement:'°C'},last_updated:stamp,last_changed:stamp};
hass.states['binary_sensor.synthetic_leak']={state:'off',attributes:{device_class:'moisture'},last_updated:stamp,last_changed:stamp};
hass.states['climate.synthetic_cooling']={state:'cool',attributes:{temperature:22},last_updated:stamp,last_changed:stamp};
hass.states['sensor.synthetic_hub']={state:'online',attributes:{},last_updated:stamp,last_changed:stamp};
hass.states['sensor.synthetic_power']={state:'1.79',attributes:{device_class:'power',unit_of_measurement:'kW'},last_updated:stamp,last_changed:stamp};
hass.formatEntityState=entity=>entity.attributes?.device_class==='temperature'?'23,4°':entity.attributes?.device_class==='power'?'1,79 kW':entity.state;
card.setConfig({type:'custom:homemanager-card',card_id:'synthetic-shell',title:'Casa de prueba',dashboard_mode:'storage',configuration});card.hass={...hass};
// The synthetic server must serve the same new document when edit mode opens.
window.testHarness.mutateRemote(dashboard=>{dashboard.views[0].cards[0]={type:'custom:homemanager-card',card_id:'synthetic-shell',title:'Casa de prueba',dashboard_mode:'storage',configuration:structuredClone(configuration)};});
window.shellHarnessReady=true;
