import { type CardConfig, type Configuration } from './types.js';
import { sanitizeArchitecture } from './geometry.js';
import { assertConfiguration, migrateConfiguration } from '../ha/index.js';

const KEY=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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
/** Single validation path: the HA adapter's validator owns shape, references,
 * actions and limits (accepting V1 and returning V2); this layer only adds the
 * presentation rules and the DOM-based SVG sanitizer. */
export function validateConfiguration(input:unknown,options:{allowPending?:boolean;roomLabels?:Record<string,string>}={}):Configuration {
  let c:Configuration;
  try{c=assertConfiguration(options.roomLabels?migrateConfiguration(input,{roomLabels:options.roomLabels}):input,{allowPending:options.allowPending??false}) as unknown as Configuration;}
  catch(error){
    const issue=(error as {issues?:{path:string;message:string;code:string}[]}).issues?.[0];
    if(issue?.code==='unresolved-reference')fail(`Referencia pendiente (${issue.path}): configurala antes de guardar.`);
    fail(`Configuración no válida${issue?` en ${issue.path}: ${issue.message}`:`: ${error instanceof Error?error.message:String(error)}`}.`);
  }
  for(const d of c.catalog.devices)if(!/^mdi:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.display.icon))fail('El icono debe usar mdi:nombre.');
  const clean=sanitizeArchitecture(c.architecture.content);
  return {...c,architecture:{format:'svg',content:clean.content}};
}
export function validateCardConfig(value:unknown):CardConfig {
  safeTree(value);const c=obj(value,'Tarjeta');exact(c,['type','card_id','configuration'],['dashboard_path','dashboard_mode','title','room_labels']);
  if(c.type!=='custom:homemanager-card')fail('Tipo de tarjeta no válido.');key(c.card_id,'card_id');
  if(c.dashboard_path!==undefined&&(typeof c.dashboard_path!=='string'||!/^[a-z0-9][a-z0-9_-]{0,239}$/.test(c.dashboard_path)))fail('Ruta de dashboard no válida.');
  if(c.dashboard_mode!==undefined)member(c.dashboard_mode,['storage','yaml'],'Modo de dashboard');
  if(c.title!==undefined)text(c.title,'Título');
  let roomLabels:Record<string,string>|undefined;
  if(c.room_labels!==undefined){roomLabels={};for(const[k,v]of Object.entries(obj(c.room_labels,'Nombres de espacios'))){key(k,'Espacio');text(v,'Nombre');roomLabels[k]=v;}}
  // room_labels only seeds labels while migrating a V1 document; V2 keeps them in configuration.rooms.
  return {...structuredClone(c),configuration:validateConfiguration(c.configuration,{allowPending:true,roomLabels})}as unknown as CardConfig;
}
export function emptyConfiguration():Configuration {return {schemaVersion:2,rooms:[],catalog:{schemaVersion:2,devices:[]},architecture:{format:'svg',content:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700"></svg>'},actions:{},panels:{},stateSources:{}};}
