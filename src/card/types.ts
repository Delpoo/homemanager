/** Persistent V1 types. Live values never belong in Configuration. */
export const ROOM_IDS = ['living','dining','kitchen','office','master-bedroom','bath-2','master-bath','balcony','entry','hallway','dbst','ac-ledge'] as const;
export const KINDS = ['light','fan','curtain','ac','sensor','switch','robot','purifier','plant','infra','energy'] as const;
export type RoomId = typeof ROOM_IDS[number];
export type DeviceKind = typeof KINDS[number];
export type Confidence = 'confirmed'|'estimated'|'sent'|'unknown'|'error';
export interface Device {
  id:string; roomId:RoomId; kind:DeviceKind; position:{x:number;y:number}; mobility:'fixed'|'editable'|'portable';
  display:{label:string;icon:string};
  bindings:{entityId:string|null;primaryAction:string|null;advancedPopupId:string|null};
  state:{value:string;confidence:Confidence};
}
export type JsonValue=null|boolean|number|string|JsonValue[]|{[key:string]:JsonValue};
export interface Action { domain:'light'|'fan'|'cover'|'climate'|'switch'|'button'|'script'; service:string; target:{entity_id:string|string[]}; data?:Record<string,JsonValue> }
export interface NativePanel { kind:'device-controls'|'rf-fan'; title:string; controls:{id:string;label:string;actionId:string}[] }
export interface StateSource { entityId:string; attribute:string|null; feedback:'measured'|'optimistic'|'transmitter' }
export interface Configuration {
  schemaVersion:1;
  catalog:{schemaVersion:1;devices:Device[]};
  architecture:{format:'svg';content:string};
  actions:Record<string,Action>; panels:Record<string,NativePanel>; stateSources:Record<string,StateSource>;
  commandTtlSeconds?:number;
}
export interface CardConfig {
  type:'custom:homemanager-card'; card_id:string; configuration:Configuration;
  dashboard_path?:string; dashboard_mode?:'storage'|'yaml'; title?:string;
  room_labels?:Partial<Record<RoomId,string>>;
}
export interface HassEntity {state:string;attributes:Record<string,unknown>;last_updated?:string;last_changed?:string}
export interface Hass {
  states:Record<string,HassEntity>;
  connected?:boolean;
  services?:Record<string,Record<string,{fields?:Record<string,unknown>;[key:string]:unknown}>>;
  user?:{id?:string;is_admin?:boolean};
  panels?:Record<string,{config?:{mode?:string}}>;
  connection?:{connected?:boolean};
  callWS?<T=unknown>(message:Record<string,unknown>):Promise<T>;
  callService?(domain:string,service:string,data?:Record<string,unknown>,target?:{entity_id:string|string[]}):Promise<unknown>;
}
export interface RuntimeDeviceState {
  value:string; confidence:Confidence; observedAt:string|null; sourceEntityId:string|null;
  command:null|{id:string;actionId:string;issuedAt:string;expiresAt:string;baselineLastUpdated:string|null;status:'sent'|'error'};
}
export interface RuntimeState {schemaVersion:1;states:Record<string,RuntimeDeviceState>}
export const SERVICES:Record<string,readonly string[]> = {
  light:['turn_on','turn_off','toggle'],fan:['turn_on','turn_off','toggle','set_percentage','set_preset_mode','set_direction','oscillate'],
  cover:['open_cover','close_cover','stop_cover','set_cover_position'],climate:['turn_on','turn_off','set_temperature','set_hvac_mode','set_fan_mode','set_preset_mode','set_swing_mode'],
  switch:['turn_on','turn_off','toggle'],button:['press'],script:['turn_on']
};
export function clone<T>(value:T):T { return structuredClone(value); }
export function escapeHTML(value:unknown):string { return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
