import { ROOM_IDS, KINDS, SERVICES, type CardConfig, type Configuration } from './types.js';
import { sanitizeArchitecture } from './geometry.js';
import { assertConfiguration } from '../ha/index.js';

const KEY=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENTITY=/^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;
const UNSAFE=new Set(['__proto__','prototype','constructor']);
function fail(message:string):never { throw new Error(message); }
export function record(value:unknown):value is Record<string,unknown> {
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
}
function obj(value:unknown,path:string):Record<string,unknown> { if(!record(value))fail(`${path}: se esperaba un objeto.`);return value; }
function exact(value:Record<string,unknown>,keys:string[],optional:string[]=[],path='Configuración'):void {
  if(keys.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!keys.includes(k)&&!optional.includes(k)))fail(`${path}: campos inesperados o incompletos.`);
}
function text(v:unknown,p:string,max=240):asserts v is string {if(typeof v!=='string'||!v.trim()||v.length>max)fail(`${p}: texto vacío o demasiado largo.`);}
function key(v:unknown,p:string):asserts v is string {text(v,p);if(!KEY.test(v)||UNSAFE.has(v))fail(`${p}: ID kebab-case no válido.`);}
function entity(v:unknown,p:string):asserts v is string {text(v,p);if(!ENTITY.test(v)||v.endsWith('.all'))fail(`${p}: entidad no válida.`);}
function member(v:unknown,values:readonly string[],p:string) {if(typeof v!=='string'||!values.includes(v))fail(`${p}: valor no admitido.`);}
function safeTree(value:unknown,depth=0):void {
  if(depth>100)fail('Documento demasiado profundo.');
  if(typeof value==='number'&&!Number.isFinite(value))fail('Números no finitos.');
  if(value&&typeof value==='object') {
    if(!Array.isArray(value)&&!record(value))fail('Sólo se admite JSON.');
    if(Object.getOwnPropertySymbols(value).length)fail('Sólo se admite JSON.');
    const descriptors=Object.getOwnPropertyDescriptors(value);
    for(const[k,descriptor]of Object.entries(descriptors)){if(!('value'in descriptor))fail('No se admiten getters ni setters.');if(UNSAFE.has(k))fail('Clave insegura.');if(Array.isArray(value)&&k==='length')continue;safeTree(descriptor.value,depth+1);}
  } else if(!['string','number','boolean'].includes(typeof value)&&value!==null)fail('Sólo se admite JSON.');
}
const BAD_DATA=/^(?:entity_id|device_id|area_id|rf_codes?|ir_codes?|codes?|protocol|pulse_length|raw(?:_data)?|rc_switch|commands?|command_type)$/i;
function actionData(v:unknown,depth=0):void {
  if(depth>10)fail('Los datos de acción superan 10 niveles.');
  if(typeof v==='string'&&(v.length>1024||/\{\{|\{%|<script|javascript\s*:|\b(?:eval|Function)\s*\(/i.test(v)))fail('Datos de acción no admitidos.');
  if(Array.isArray(v)){if(v.length>100)fail('Lista de datos demasiado larga.');v.forEach(x=>actionData(x,depth+1));}
  else if(v&&typeof v==='object'){const entries=Object.entries(v);if(entries.length>100)fail('Demasiados datos.');for(const[k,x]of entries){if(!k||k.length>100||BAD_DATA.test(k)||UNSAFE.has(k))fail('Clave de datos no permitida.');actionData(x,depth+1);}}
}
/** Schema shape + semantic policy. Pending HA entities are allowed; execution verifies the live session. */
export function validateConfiguration(input:unknown,options:{allowPending?:boolean}={}):Configuration {
  safeTree(input);
  // Use the same service/data policy as execution before admitting any persistent draft.
  assertConfiguration(input,{allowPending:true});
  const c=obj(input,'Configuración');exact(c,['schemaVersion','catalog','architecture','actions','panels','stateSources'],['commandTtlSeconds']);
  if(c.schemaVersion!==1)fail('Versión no admitida; se requiere migración explícita.');
  const cat=obj(c.catalog,'Catálogo');exact(cat,['schemaVersion','devices']);
  if(cat.schemaVersion!==1||!Array.isArray(cat.devices)||cat.devices.length>2000)fail('Catálogo V1 no válido.');
  const ids=new Set<string>();
  for(const raw of cat.devices){
    const d=obj(raw,'Dispositivo');exact(d,['id','roomId','kind','position','mobility','display','bindings','state']);
    key(d.id,'ID');if(ids.has(d.id))fail('ID de dispositivo duplicado.');ids.add(d.id);
    member(d.roomId,ROOM_IDS,'Habitación');member(d.kind,KINDS,'Tipo');member(d.mobility,['fixed','editable','portable'],'Movilidad');
    const p=obj(d.position,'Posición');exact(p,['x','y']);for(const n of [p.x,p.y])if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)fail('Posición fuera del viewBox normalizado.');
    const display=obj(d.display,'Visualización');exact(display,['label','icon']);text(display.label,'Nombre');text(display.icon,'Icono');
    if(!/^mdi:[a-z0-9-]+$/.test(display.icon))fail('El icono debe usar mdi:nombre.');
    const b=obj(d.bindings,'Asociaciones');exact(b,['entityId','primaryAction','advancedPopupId']);
    if(b.entityId!==null)entity(b.entityId,'Entidad');
    for(const k of ['primaryAction','advancedPopupId'])if(b[k]!==null)key(b[k],k);
    const state=obj(d.state,'Estado persistente');exact(state,['value','confidence']);if(state.value!=='unknown'||state.confidence!=='unknown')fail('La configuración persistente sólo admite estado unknown/unknown.');
  }
  const actions=obj(c.actions,'Acciones'),panels=obj(c.panels,'Paneles'),sources=obj(c.stateSources,'Fuentes');
  for(const map of [actions,panels,sources]){if(Object.keys(map).length>2000)fail('Mapa demasiado grande.');for(const k of Object.keys(map))key(k,'Clave');}
  for(const[id,raw]of Object.entries(actions)){
    const a=obj(raw,id);exact(a,['domain','service','target'],['data']);
    if(typeof a.domain!=='string'||!Object.hasOwn(SERVICES,a.domain))fail('Dominio de acción no permitido.');
    member(a.service,SERVICES[a.domain],'Servicio');const target=obj(a.target,'Destino');exact(target,['entity_id']);
    const targets=Array.isArray(target.entity_id)?target.entity_id:[target.entity_id];
    if(targets.length<1||targets.length>20||new Set(targets).size!==targets.length)fail('Destinos explícitos: entre 1 y 20, sin repetir.');
    for(const t of targets){entity(t,'Destino');if(!t.startsWith(`${a.domain}.`))fail('El dominio del destino no coincide con la acción.');}
    if(a.data!==undefined){obj(a.data,'Datos');safeTree(a.data);actionData(a.data);if(new TextEncoder().encode(JSON.stringify(a.data)).length>8192)fail('Datos de acción mayores a 8192 bytes.');}
  }
  for(const[id,raw]of Object.entries(panels)){
    const p=obj(raw,id);exact(p,['kind','title','controls']);member(p.kind,['device-controls','rf-fan'],'Panel');text(p.title,'Título');
    if(!Array.isArray(p.controls)||p.controls.length>100)fail('Controles de panel no válidos.');const controlIds=new Set();
    for(const rawControl of p.controls){const x=obj(rawControl,'Control');exact(x,['id','label','actionId']);key(x.id,'ID de control');text(x.label,'Control');key(x.actionId,'Acción del control');if(controlIds.has(x.id))fail('ID de control duplicado.');controlIds.add(x.id);
      const a=actions[x.actionId] as {domain?:string;service?:string}|undefined;
      if(!a&&!options.allowPending)fail('El control referencia una acción inexistente.');
      if(a&&p.kind==='rf-fan'&&(a.domain!=='script'||a.service!=='turn_on'))fail('Los paneles RF sólo pueden ejecutar scripts HA.');
    }
  }
  for(const[id,raw]of Object.entries(sources)){
    if(!ids.has(id))fail('Fuente de estado sin dispositivo.');const s=obj(raw,'Fuente');exact(s,['entityId','attribute','feedback']);entity(s.entityId,'Entidad de estado');
    if(s.attribute!==null){text(s.attribute,'Atributo',100);if(UNSAFE.has(s.attribute)||BAD_DATA.test(s.attribute))fail('Atributo no permitido.');}
    member(s.feedback,['measured','optimistic','transmitter'],'Feedback');
  }
  if(!options.allowPending)for(const raw of cat.devices){const d=raw as {bindings:{primaryAction:string|null;advancedPopupId:string|null}};
    if(d.bindings.primaryAction&&!Object.hasOwn(actions,d.bindings.primaryAction))fail('Acción pendiente: configurala antes de guardar.');
    if(d.bindings.advancedPopupId&&!Object.hasOwn(panels,d.bindings.advancedPopupId))fail('Panel pendiente: configuralo antes de guardar.');
  }
  if(c.commandTtlSeconds!==undefined&&(typeof c.commandTtlSeconds!=='number'||!Number.isInteger(c.commandTtlSeconds)||c.commandTtlSeconds<1||c.commandTtlSeconds>300))fail('TTL: entero entre 1 y 300 segundos.');
  const architecture=obj(c.architecture,'Arquitectura');exact(architecture,['format','content']);if(architecture.format!=='svg'||typeof architecture.content!=='string')fail('Se requiere arquitectura SVG inline.');
  const clean=sanitizeArchitecture(architecture.content);
  return {...structuredClone(c),architecture:{format:'svg',content:clean.content}} as unknown as Configuration;
}
export function validateCardConfig(value:unknown):CardConfig {
  safeTree(value);const c=obj(value,'Tarjeta');exact(c,['type','card_id','configuration'],['dashboard_path','dashboard_mode','title','room_labels']);
  if(c.type!=='custom:homemanager-card')fail('Tipo de tarjeta no válido.');key(c.card_id,'card_id');
  if(c.dashboard_path!==undefined&&(typeof c.dashboard_path!=='string'||!/^[a-z0-9][a-z0-9_-]{0,239}$/.test(c.dashboard_path)))fail('Ruta de dashboard no válida.');
  if(c.dashboard_mode!==undefined)member(c.dashboard_mode,['storage','yaml'],'Modo de dashboard');
  if(c.title!==undefined)text(c.title,'Título');
  if(c.room_labels!==undefined)for(const[k,v]of Object.entries(obj(c.room_labels,'Nombres de espacios'))){member(k,ROOM_IDS,'Espacio');text(v,'Nombre');}
  return {...structuredClone(c),configuration:validateConfiguration(c.configuration,{allowPending:true})}as unknown as CardConfig;
}
export function emptyConfiguration():Configuration {return {schemaVersion:1,catalog:{schemaVersion:1,devices:[]},architecture:{format:'svg',content:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700"></svg>'},actions:{},panels:{},stateSources:{}};}
