import { HomeAssistantAdapter } from '../ha/index.js';
import { HomeManagerEditor, LovelaceConfigurationStore } from '../editor/index.js';
import { openPanel } from '../panels/native-panel.js';
import { validateCardConfig, validateConfiguration, emptyConfiguration } from './configuration.js';
import { sanitizeArchitecture, fitCamera, zoomCamera, roomBounds, roomAt, type Camera, type ViewBox } from './geometry.js';
import { ROOM_IDS, clone, escapeHTML as e, type Configuration, type CardConfig, type Device, type Hass, type RuntimeState, type RoomId } from './types.js';
import { styles } from './styles.js';

const LABELS:Record<RoomId,string>={living:'Sala',dining:'Comedor',kitchen:'Cocina',office:'Oficina','master-bedroom':'Dormitorio','bath-2':'Baño 2','master-bath':'Baño principal',balcony:'Balcón',entry:'Entrada',hallway:'Pasillo',dbst:'DBST','ac-ledge':'Zona técnica'};
const ROOM_ICONS=['▣','◉','♨','▤','▱','◧','◨','☀','⇥','↔','▥','⚙'];
const KIND_ICONS:Record<string,string>={light:'☼',fan:'✣',curtain:'▥',ac:'❄',sensor:'◌',switch:'⏻',robot:'◉',purifier:'≋',plant:'♧',infra:'⚙',energy:'ϟ'};
const CONFIDENCE:Record<string,string>={confirmed:'Confirmado',estimated:'Estimado',sent:'Comando aceptado',unknown:'Desconocido',error:'Error'};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const layer=(d:Device)=>d.kind==='infra'?'infrastructure':d.kind==='energy'?'energy':d.kind==='sensor'||d.kind==='plant'?'sensors':'controls';
interface Adapter {
 configure(c:Configuration):void;setHass(h:Hass|null):void;subscribe(fn:(s:RuntimeState)=>void):()=>void;getSnapshot():RuntimeState;
 executeAction(id:string,deviceId?:string):Promise<unknown>;executePrimary(id:string):Promise<unknown>;
 getActionAvailability(id:string):{available:boolean;reason?:string};dispose():void;
}
export class HomeManagerCard extends HTMLElement {
  private config?:CardConfig;
  private draft?:Configuration;
  private saved?:Configuration;
  private _hass?:Hass;
  private adapter?:Adapter;
  private unsubscribe?:()=>void;
  private runtime:RuntimeState={schemaVersion:1,states:{}};
  private editor?:HomeManagerEditor;
  private store?:LovelaceConfigurationStore;
  private editing=false;private loading=false;private saving=false;
  private selected:string|null=null;private fixedPermit:string|null=null;
  private history:Configuration[]=[];private future:Configuration[]=[];
  private box:ViewBox={x:0,y:0,width:1000,height:700};
  private camera:Camera={x:0,y:0,scale:1};private baseScale=1;
  private svg?:SVGSVGElement;private currentRoom:RoomId|null=null;
  private enabledLayers=new Set(['controls','sensors','infrastructure','energy']);
  private pointers=new Map<number,{x:number;y:number}>();
  private gesture?:{kind:'pan';x:number;y:number;camera:Camera}|{kind:'pinch';distance:number;camera:Camera;center:{x:number;y:number}}|{kind:'device';id:string;start:{x:number;y:number};position:{x:number;y:number};before:Configuration;moved:boolean};
  private observer?:ResizeObserver;private frame=0;private generation=0;
  private panel?:ReturnType<typeof openPanel>;
  private verifiedFeedbackEntities=new Set<string>();
  private readonly root=this.attachShadow({mode:'open'});
  static getConfigElement():HTMLElement {return document.createElement('homemanager-editor');}
  static getStubConfig():CardConfig {return {type:'custom:homemanager-card',card_id:typeof crypto.randomUUID==='function'?crypto.randomUUID():`map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`,dashboard_mode:'storage',configuration:emptyConfiguration()};}
  getCardSize():number {return 10;}
  getGridOptions(){return {columns:24,rows:12,min_columns:6,min_rows:6};}
  getConfiguration():Configuration {return clone(this.saved??emptyConfiguration());}
  getDraftConfiguration():Configuration {return clone(this.draft??emptyConfiguration());}
  /** Integration/session evidence only. Never serialized or inferred from the configured feedback label. */
  setVerifiedFeedbackEntities(ids:Iterable<string>):void {this.verifiedFeedbackEntities=new Set(ids);if(this.saved)this.setupAdapter(this.saved);}
  set hass(value:Hass){this._hass=value;this.adapter?.setHass(value);if(this.editor)this.editor.hass=value;this.refreshState();this.updateControls();}
  get hass():Hass|undefined{return this._hass;}
  setConfig(value:unknown):void {
    const next=validateCardConfig(value);
    if(this.editing&&this.dirty){if(!same(next.configuration,this.saved))this.status('La configuración cambió fuera de esta edición. Tu borrador se conserva; exportalo antes de recargar.');return;}
    this.generation++;this.config=next;this.saved=clone(next.configuration);this.draft=clone(next.configuration);
    this.editing=false;this.history=[];this.future=[];this.selected=null;this.fixedPermit=null;
    this.setupAdapter(next.configuration);this.render();
  }
  connectedCallback(){if(this.config){if(!this.adapter)this.setupAdapter(this.saved!);if(!this.root.childElementCount)this.render();else{this.observer?.observe(this.viewport);this.queuePosition();}}}
  disconnectedCallback(){this.generation++;this.observer?.disconnect();this.unsubscribe?.();this.adapter?.dispose();this.adapter=undefined;this.panel?.close();cancelAnimationFrame(this.frame);this.pointers.clear();this.gesture=undefined;}
  private get dirty(){return !same(this.draft,this.saved);}
  private setupAdapter(configuration:Configuration){
    this.unsubscribe?.();this.adapter?.dispose();this.adapter=undefined;this.runtime={schemaVersion:1,states:{}};
    try{
      const validated=validateConfiguration(configuration,{allowPending:true});
      this.adapter=new HomeAssistantAdapter({configuration:validated,verifiedFeedbackEntities:this.verifiedFeedbackEntities}) as unknown as Adapter;
      this.unsubscribe=this.adapter.subscribe(s=>{this.runtime=s;this.refreshState();});
      this.adapter.setHass(this._hass??null);this.runtime=this.adapter.getSnapshot();
    }catch{/* Pending references remain visible and disabled until completed in the editor. */}
  }
  private icon(command:string,label:string,symbol:string,extra=''){return `<button class="icon" type="button" data-command="${command}" title="${e(label)}" aria-label="${e(label)}" ${extra}>${symbol}</button>`;}
  private render(){
    if(!this.config||!this.draft)return;
    this.observer?.disconnect();this.panel?.close();
    this.root.innerHTML=`<style>${styles}</style><section class="shell"><header class="header"><span class="logo" aria-hidden="true">⌂</span><h1>${e(this.config.title??'HomeManager')}</h1><span class="spacer"></span>${this.icon('info','Información','ⓘ')}${this.icon('edit','Editar plano','✎','aria-pressed="false"')}${this.icon('fullscreen','Pantalla completa','⛶')}</header><div class="workspace"><nav class="rooms" aria-label="Espacios">${this.icon('all','Encuadrar todo','▦')}</nav><div class="viewport" tabindex="0" role="group" aria-label="Plano interactivo"><div class="architecture"></div><div class="overlay"></div><div class="empty" hidden>Agregá una arquitectura SVG desde el editor.</div><div class="zoom">${this.icon('out','Alejar','−')}${this.icon('in','Acercar','+')}</div></div><nav class="layers" aria-label="Capas">${[['controls','Controles','⏻'],['sensors','Sensores','◌'],['infrastructure','Infraestructura','⚙'],['energy','Energía','ϟ']].map(([id,label,icon])=>this.icon(`layer-${id}`,label,icon,`aria-pressed="${this.enabledLayers.has(id)}"`)).join('')}</nav></div><div class="editor-wrap" hidden><div class="editbar">${this.icon('undo','Deshacer','↶')}${this.icon('redo','Rehacer','↷')}${this.icon('save-info','Información del guardado','ⓘ')}<span class="space"></span><button data-command="discard" type="button">Descartar cambios</button><button data-command="save" class="save" type="button" data-dirty="false">Guardar cambios</button></div><div class="selection"></div><div class="editor"></div></div><div class="status" role="status" aria-live="polite"></div></section>`;
    this.root.addEventListener('click',this.onClick);
    this.root.addEventListener('keydown',this.key as EventListener);
    const viewport=this.viewport;
    viewport.addEventListener('pointerdown',this.pointerDown);viewport.addEventListener('pointermove',this.pointerMove);viewport.addEventListener('pointerup',this.pointerUp);viewport.addEventListener('pointercancel',this.pointerCancel);
    viewport.addEventListener('wheel',this.wheel,{passive:false});
    this.mountArchitecture();this.renderMarkers();this.observer=new ResizeObserver(()=>{if(!this.gesture)this.fit(this.currentRoom);});this.observer.observe(viewport);this.fit(null);this.updateControls();
  }
  private get viewport(){return this.root.querySelector('.viewport') as HTMLDivElement;}
  private mountArchitecture(){
    if(!this.draft)return;const result=sanitizeArchitecture(this.draft.architecture.content);this.box=result.box;this.svg=result.svg;
    const host=this.root.querySelector('.architecture') as HTMLElement;host.style.left=`${this.box.x}px`;host.style.top=`${this.box.y}px`;host.style.width=`${this.box.width}px`;host.style.height=`${this.box.height}px`;
    const inner=document.createElement('div');inner.attachShadow({mode:'open'}).append(this.svg);host.replaceChildren(inner);
    this.svg.setAttribute('width',String(this.box.width));this.svg.setAttribute('height',String(this.box.height));
    const nav=this.root.querySelector('.rooms')!;nav.querySelectorAll('[data-room]').forEach(n=>n.remove());
    for(const [i,id]of ROOM_IDS.entries()){
      const has=!!this.svg.querySelector(`[id="room-${id}"]`);if(!has&&!this.draft.catalog.devices.some(d=>d.roomId===id))continue;
      const label=this.config?.room_labels?.[id]??LABELS[id];const b=document.createElement('button');b.className='icon';b.type='button';b.dataset.room=id;b.title=`Encuadrar ${label}`;b.setAttribute('aria-label',`Encuadrar ${label}`);b.innerHTML=ROOM_ICONS[i];nav.append(b);
    }
    (this.root.querySelector('.empty') as HTMLElement).hidden=this.svg.children.length>0;
  }
  private fit(room:RoomId|null){
    if(!this.svg||!this.viewport)return;const r=this.viewport.getBoundingClientRect();if(!r.width||!r.height)return;
    const bounds=room?roomBounds(this.svg,room):this.box;
    if(!bounds){this.status('Esta habitación no tiene una zona SVG válida. Revisá su ID en el editor de arquitectura.');return;}
    this.currentRoom=room;this.camera=fitCamera(bounds,{width:r.width,height:r.height},room?34:24);this.baseScale=fitCamera(this.box,{width:r.width,height:r.height},24).scale;this.queuePosition();
    this.root.querySelectorAll('[data-room]').forEach(b=>b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.room===room)));
  }
  private renderMarkers(){
    const overlay=this.root.querySelector('.overlay');if(!overlay||!this.draft)return;
    overlay.innerHTML=this.draft.catalog.devices.filter(d=>this.editing||this.enabledLayers.has(layer(d))).map(d=>`<div class="marker ${d.id===this.selected?'selected':''} ${this.editing&&(d.mobility!=='fixed'||this.fixedPermit===d.id)?'editable':''}" data-id="${e(d.id)}"><button type="button" class="primary" aria-label="Acción principal de ${e(d.display.label)}" title="${e(d.display.label)}">${customElements.get('ha-icon')?`<ha-icon icon="${e(d.display.icon)}"></ha-icon>`:KIND_ICONS[d.kind]??'◉'}</button><span class="state-dot" aria-hidden="true"></span><button class="detail" type="button" aria-label="Detalles de ${e(d.display.label)}" title="Detalles de ${e(d.display.label)}">⋯</button></div>`).join('');
    this.refreshState();this.queuePosition();this.updateSelection();
  }
  private queuePosition(){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.positionMarkers());}
  private positionMarkers(){
    const architecture=this.root.querySelector('.architecture') as HTMLElement|null;
    if(architecture)architecture.style.transform=`translate(${this.camera.x+(this.box.x*this.camera.scale)-this.box.x}px,${this.camera.y+(this.box.y*this.camera.scale)-this.box.y}px) scale(${this.camera.scale})`;
    const byId=new Map(this.draft?.catalog.devices.map(d=>[d.id,d]));
    this.root.querySelectorAll<HTMLElement>('.marker').forEach(m=>{const d=byId.get(m.dataset.id!);if(!d)return;m.style.left=`${this.camera.x+(this.box.x+d.position.x*this.box.width)*this.camera.scale}px`;m.style.top=`${this.camera.y+(this.box.y+d.position.y*this.box.height)*this.camera.scale}px`;});
  }
  private refreshState(){
    this.root.querySelectorAll<HTMLElement>('.marker').forEach(m=>{const d=this.draft?.catalog.devices.find(d=>d.id===m.dataset.id);if(!d)return;const state=this.runtime.states[d.id];const confidence=state?.confidence??'unknown';m.dataset.confidence=confidence;
      const main=m.querySelector('button.primary')!;const availability=d.bindings.primaryAction?this.adapter?.getActionAvailability(d.bindings.primaryAction):undefined;
      main.setAttribute('title',`${d.display.label} · ${CONFIDENCE[confidence]}${!this.editing&&!availability?.available?' · Acción pendiente o no disponible':''}`);
      main.setAttribute('aria-description',`${CONFIDENCE[confidence]}: ${state?.value??'unknown'}`);
      // Keep selection reachable in edit mode; normal unavailable controls cannot dispatch.
      (main as HTMLButtonElement).disabled=!this.editing&&!availability?.available;
    });
    const d=this.draft?.catalog.devices.find(d=>d.id===this.selected);if(d&&this.panel){const s=this.runtime.states[d.id];if(s)this.panel.update(s);}
  }
  private onClick=(event:Event)=>{
    const target=(event.target as Element).closest<HTMLElement>('button');if(!target)return;
    const marker=target.closest<HTMLElement>('.marker');if(marker){const id=marker.dataset.id!;if(this.editing){this.select(id);return;}if(target.classList.contains('detail'))this.showDetails(id,target);else void this.act(id);return;}
    const room=target.dataset.room as RoomId|undefined;if(room){this.fit(room);return;}
    const command=target.dataset.command;if(!command)return;
    if(command.startsWith('layer-')){const id=command.slice(6);if(this.enabledLayers.has(id))this.enabledLayers.delete(id);else this.enabledLayers.add(id);target.setAttribute('aria-pressed',String(this.enabledLayers.has(id)));this.renderMarkers();return;}
    switch(command){case'edit':void this.toggleEdit();break;case'all':this.fit(null);break;case'in':this.zoom(1.3);break;case'out':this.zoom(1/1.3);break;case'fullscreen':void(this.root.querySelector('.shell') as HTMLElement).requestFullscreen?.().catch(()=>this.status('El navegador no permite pantalla completa.'));break;case'info':this.info();break;case'save-info':this.info(true);break;case'save':void this.save();break;case'discard':this.discard();break;case'undo':this.undo();break;case'redo':this.redo();break;case'fixed':this.fixedPermit=this.selected;this.renderMarkers();this.status('Reubicación explícita habilitada para este dispositivo fijo durante esta edición.');break;}
  };
  private async executeAction(action:string,id:string){const result=await this.adapter?.executeAction(action,id);if(result&&typeof result==='object'&&'ok'in result&&result.ok===false)throw new Error(String('reason'in result?result.reason:'Acción no disponible.'));}
  private async act(id:string){const d=this.draft?.catalog.devices.find(d=>d.id===id);if(!d||this.editing||!this.adapter)return;const action=d.bindings.primaryAction;if(!action)return;try{await this.executeAction(action,id);}catch(error){this.status(error instanceof Error?error.message:'No se pudo ejecutar la acción.');}finally{this.refreshState();}}
  private showDetails(id:string,returnFocus:HTMLElement){
    const d=this.draft?.catalog.devices.find(d=>d.id===id);if(!d||!this.draft)return;this.selected=id;this.panel?.close();
    const panel=d.bindings.advancedPopupId?this.draft.panels[d.bindings.advancedPopupId]:undefined;
    if(!panel){this.dialog('Detalles del dispositivo',`<p>${e(d.display.label)}</p><p>${e(CONFIDENCE[this.runtime.states[id]?.confidence??'unknown'])}</p><p>${d.bindings.advancedPopupId?'Panel nativo pendiente: '+e(d.bindings.advancedPopupId):'Sin panel nativo asociado.'}</p>`,[{label:'Cerrar',action:()=>{}}]);return;}
    this.panel=openPanel({panel,device:d,state:this.runtime.states[id]??{value:'unknown',confidence:'unknown',observedAt:null,sourceEntityId:null,command:null},configuration:this.draft,availability:(actionId:string)=>this.adapter?.getActionAvailability(actionId)??{available:false,reason:'Acción pendiente.'},onAction:async(actionId:string)=>{if(!this.editing)await this.executeAction(actionId,id);},returnFocus});
  }
  private async toggleEdit(){
    if(this.loading||this.saving)return;if(this.editing){if(this.dirty){this.status('Guardá o descartá los cambios antes de salir del editor.');return;}this.editing=false;this.updateControls();this.renderMarkers();return;}
    if(!this.config||this._hass?.user?.is_admin!==true){this.status('La edición compartida requiere una cuenta administradora de Home Assistant.');return;}
    const mode=this._hass.panels?.[this.config.dashboard_path??'lovelace']?.config?.mode??this.config.dashboard_mode;
    if(mode!=='storage'){this.status(mode==='yaml'?'Este dashboard usa YAML y es de sólo lectura.':'No se pudo confirmar el modo storage del dashboard.');return;}
    this.loading=true;this.updateControls();const generation=this.generation;
    try{
      this.store=new LovelaceConfigurationStore(()=>this._hass,{cardId:this.config.card_id,dashboardPath:this.config.dashboard_path,dashboardMode:this.config.dashboard_mode});
      const current=await this.store.load();if(generation!==this.generation||!this.isConnected)return;
      this.saved=clone(current);this.draft=clone(current);this.config.configuration=clone(current);this.editing=true;this.fixedPermit=null;this.history=[];this.future=[];
      this.mountEditor();this.mountArchitecture();this.fit(null);this.renderMarkers();this.status('');
    }catch(error){this.status(error instanceof Error?error.message:'No se pudo cargar el editor.');}finally{this.loading=false;this.updateControls();}
  }
  private mountEditor(){
    const host=this.root.querySelector('.editor')!;this.editor=document.createElement('homemanager-editor') as HomeManagerEditor;this.editor.embedded=true;
    if(this._hass)this.editor.hass=this._hass;this.editor.setConfig({...this.config!,configuration:this.draft!});this.editor.selectedDeviceId=this.selected;
    this.editor.addEventListener('config-changed',(event:Event)=>{event.stopPropagation();if(!this.editing||this.saving)return;const next=(event as CustomEvent<{config:CardConfig}>).detail.config.configuration;this.change(next,false);});host.replaceChildren(this.editor);
  }
  private select(id:string){this.selected=id;if(this.editor)this.editor.selectedDeviceId=id;this.renderMarkers();}
  private updateSelection(){const host=this.root.querySelector('.selection');if(!host)return;const d=this.draft?.catalog.devices.find(d=>d.id===this.selected);host.innerHTML=d?`<span>${e(d.display.label)}</span>${d.mobility==='fixed'&&this.fixedPermit!==d.id?'<button type="button" data-command="fixed">Reubicar dispositivo fijo</button>':''}`:'';}
  private change(next:Configuration,syncEditor=true){
    try{const valid=validateConfiguration(next,{allowPending:true});if(same(valid,this.draft))return;this.history.push(clone(this.draft!));if(this.history.length>40)this.history.shift();this.future=[];const architectureChanged=valid.architecture.content!==this.draft?.architecture.content;this.draft=valid;this.fixedPermit=null;
      if(architectureChanged){this.mountArchitecture();this.fit(null);}if(syncEditor&&this.editor){this.editor.setConfig({...this.config!,configuration:this.draft});this.editor.selectedDeviceId=this.selected;}this.renderMarkers();this.updateControls();
    }catch(error){this.status(error instanceof Error?error.message:'Borrador no válido.');}
  }
  private discard(){if(!this.saved||this.saving)return;this.draft=clone(this.saved);this.history=[];this.future=[];this.fixedPermit=null;this.mountEditor();this.mountArchitecture();this.renderMarkers();this.updateControls();this.status('Cambios descartados.');}
  private undo(){if(!this.history.length||this.saving)return;this.future.push(clone(this.draft!));this.draft=this.history.pop()!;this.syncDraft();}
  private redo(){if(!this.future.length||this.saving)return;this.history.push(clone(this.draft!));this.draft=this.future.pop()!;this.syncDraft();}
  private syncDraft(){this.fixedPermit=null;this.mountEditor();this.mountArchitecture();this.renderMarkers();this.updateControls();}
  private async save(reviewed=false){
    if(!this.editing||!this.dirty||this.saving||!this.store)return;
    const changes=this.draft!.catalog.devices.filter(d=>this.saved!.catalog.devices.some(old=>old.id===d.id&&old.roomId!==d.roomId));
    if(changes.length&&!reviewed){this.dialog('Revisar cambios de habitación',`<p>${changes.map(d=>e(d.display.label)).join(', ')}</p><p>Se guarda la ubicación visual. Las entidades, áreas de Home Assistant, scripts y rutas de control conservan sus asociaciones.</p>`,[{label:'Volver a editar',action:()=>{}},{label:'Guardar ubicación visual',action:()=>{void this.save(true);}}]);return;}
    try{
      const next=validateConfiguration(this.draft);this.saving=true;this.updateControls();const generation=this.generation;await this.store.save(next);if(generation!==this.generation||!this.isConnected)return;
      this.saved=clone(next);this.draft=clone(next);this.config!.configuration=clone(next);this.history=[];this.future=[];this.fixedPermit=null;this.setupAdapter(next);this.status('Guardado en Home Assistant.');this.dispatchEvent(new CustomEvent('homemanager-saved',{detail:{configuration:clone(next)},bubbles:true,composed:true}));
    }catch(error){this.status(`${error instanceof Error?error.message:'No se pudo guardar.'} El borrador sigue pendiente.`);}finally{this.saving=false;this.refreshState();this.updateControls();}
  }
  private updateControls(){
    const edit=this.root.querySelector<HTMLButtonElement>('[data-command=edit]');if(edit){edit.setAttribute('aria-pressed',String(this.editing));edit.disabled=this.loading||this.saving;}
    const wrap=this.root.querySelector<HTMLElement>('.editor-wrap');if(wrap)wrap.hidden=!this.editing;
    const save=this.root.querySelector<HTMLButtonElement>('[data-command=save]');if(save){save.dataset.dirty=String(this.dirty);save.disabled=!this.dirty||this.loading||this.saving||this._hass?.user?.is_admin!==true;save.textContent=this.saving?'Guardando…':'Guardar cambios';}
    const undo=this.root.querySelector<HTMLButtonElement>('[data-command=undo]');if(undo)undo.disabled=!this.history.length||this.saving;
    const redo=this.root.querySelector<HTMLButtonElement>('[data-command=redo]');if(redo)redo.disabled=!this.future.length||this.saving;
    const discard=this.root.querySelector<HTMLButtonElement>('[data-command=discard]');if(discard)discard.disabled=this.saving||!this.dirty;
    this.updateSelection();
  }
  private status(message:string){const host=this.root.querySelector('.status');if(host)host.textContent=message;}
  private info(storage=false){this.dialog(storage?'Guardado compartido':'HomeManager',storage?'<p>El guardado requiere administrador y dashboard Lovelace storage. Sólo se anuncia guardado después de leer la configuración confirmada por HA.</p><p>Usá un único editor activo. La API guarda el dashboard completo y no ofrece una revisión atómica entre clientes. Ante conflicto se conserva el borrador para exportarlo.</p>':'<p>Un toque en el icono ejecuta su acción principal; los tres puntos abren el detalle local. Arrastrá el fondo para desplazar y usá dos dedos para zoom.</p><p>En edición, mover un icono conserva sus asociaciones de HA. Los equipos fijos requieren habilitar su reubicación explícitamente.</p><dl class="confidence-list"><dt>Confirmado</dt><dd>Feedback medido y verificado.</dd><dt>Estimado</dt><dd>Lectura sin confirmación independiente.</dd><dt>Comando aceptado</dt><dd>HA aceptó la llamada; el efecto físico no está confirmado.</dd><dt>Desconocido / error</dt><dd>Sin evidencia válida o llamada fallida.</dd></dl>',[{label:'Cerrar',action:()=>{}}]);}
  private dialog(title:string,body:string,actions:{label:string;action:()=>void}[]){
    const previous=this.root.activeElement as HTMLElement|null;const dialog=document.createElement('dialog');dialog.innerHTML=`<h2>${e(title)}</h2>${body}<div class="actions"></div>`;const heading=dialog.querySelector('h2')!;heading.id='hm-dialog-title';dialog.setAttribute('aria-labelledby',heading.id);
    const actionHost=dialog.querySelector('.actions')!;actions.forEach(item=>{const b=document.createElement('button');b.type='button';b.textContent=item.label;b.addEventListener('click',()=>{dialog.close();item.action();});actionHost.append(b);});dialog.addEventListener('close',()=>{dialog.remove();previous?.focus();},{once:true});this.root.append(dialog);dialog.showModal();
  }
  private point(event:{clientX:number;clientY:number}){const r=this.viewport.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top};}
  private pointerDown=(event:PointerEvent)=>{
    if(event.button!==0||this.saving)return;const target=event.target as Element;if(target.closest('.zoom'))return;
    const p=this.point(event);this.pointers.set(event.pointerId,p);const marker=target.closest<HTMLElement>('.marker');
    if(marker){if(!this.editing){this.pointers.delete(event.pointerId);return;}const d=this.draft?.catalog.devices.find(d=>d.id===marker.dataset.id);if(!d)return;this.selected=d.id;if(this.editor)this.editor.selectedDeviceId=d.id;this.updateSelection();if(d.mobility==='fixed'&&this.fixedPermit!==d.id){this.pointers.delete(event.pointerId);return;}
      this.gesture={kind:'device',id:d.id,start:p,position:{...d.position},before:clone(this.draft!),moved:false};marker.classList.add('dragging');
    }else if(this.pointers.size===2){this.beginPinch();}else this.gesture={kind:'pan',x:p.x,y:p.y,camera:{...this.camera}};
    this.viewport.setPointerCapture(event.pointerId);
  };
  private beginPinch(){const pts=[...this.pointers.values()];this.gesture={kind:'pinch',distance:Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y),center:{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2},camera:{...this.camera}};}
  private pointerMove=(event:PointerEvent)=>{
    if(!this.pointers.has(event.pointerId)||!this.gesture)return;const p=this.point(event);this.pointers.set(event.pointerId,p);const g=this.gesture;
    if(g.kind==='device'){const d=this.draft?.catalog.devices.find(d=>d.id===g.id);if(!d)return;const dx=p.x-g.start.x,dy=p.y-g.start.y;if(Math.hypot(dx,dy)>3)g.moved=true;
      d.position={x:Math.min(1,Math.max(0,g.position.x+dx/this.camera.scale/this.box.width)),y:Math.min(1,Math.max(0,g.position.y+dy/this.camera.scale/this.box.height))};this.updateControls();
    }else if(g.kind==='pan')this.camera={...g.camera,x:g.camera.x+p.x-g.x,y:g.camera.y+p.y-g.y};
    else if(this.pointers.size>=2&&g.distance>0){const pts=[...this.pointers.values()];const center={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};this.camera=zoomCamera(g.camera,Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)/g.distance,g.center,this.baseScale*.5,this.baseScale*16);this.camera.x+=center.x-g.center.x;this.camera.y+=center.y-g.center.y;}
    this.queuePosition();
  };
  private pointerUp=(event:PointerEvent)=>{
    const g=this.gesture;this.pointers.delete(event.pointerId);if(this.viewport.hasPointerCapture(event.pointerId))this.viewport.releasePointerCapture(event.pointerId);
    if(g?.kind==='device'){
      if(g.moved){this.history.push(g.before);if(this.history.length>40)this.history.shift();this.future=[];const d=this.draft!.catalog.devices.find(d=>d.id===g.id)!;const detected=this.svg?roomAt(this.svg,d.position,this.box):null;if(detected)d.roomId=detected;
        if(this.editor){this.editor.setConfig({...this.config!,configuration:this.draft!});this.editor.selectedDeviceId=g.id;}this.fixedPermit=null;
      }this.renderMarkers();this.updateControls();
    }
    this.gesture=undefined;if(this.pointers.size===1){const p=[...this.pointers.values()][0];this.gesture={kind:'pan',x:p.x,y:p.y,camera:{...this.camera}};}
  };
  private pointerCancel=(event:PointerEvent)=>{if(this.gesture?.kind==='device'){this.draft=this.gesture.before;this.renderMarkers();this.updateControls();}this.pointers.delete(event.pointerId);this.gesture=undefined;};
  private wheel=(event:WheelEvent)=>{event.preventDefault();if(this.gesture?.kind==='device')return;this.currentRoom=null;this.camera=zoomCamera(this.camera,Math.exp(-event.deltaY*.0015),this.point(event),this.baseScale*.5,this.baseScale*16);this.queuePosition();};
  private zoom(factor:number){const r=this.viewport.getBoundingClientRect();this.currentRoom=null;this.camera=zoomCamera(this.camera,factor,{x:r.width/2,y:r.height/2},this.baseScale*.5,this.baseScale*16);this.queuePosition();}
  private key=(event:KeyboardEvent)=>{
    const target=event.composedPath()[0] as HTMLElement;if(['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable)return;
    if(this.editing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?this.redo():this.undo();return;}
    if(this.editing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();this.redo();return;}
    if(target.closest?.('.marker')&&this.editing&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      const d=this.draft?.catalog.devices.find(d=>d.id===target.closest<HTMLElement>('.marker')!.dataset.id);if(!d||d.mobility==='fixed'&&this.fixedPermit!==d.id)return;event.preventDefault();const next=clone(this.draft!);const device=next.catalog.devices.find(x=>x.id===d.id)!;const step=event.shiftKey?.01:.002;
      device.position.x=Math.min(1,Math.max(0,d.position.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0)));device.position.y=Math.min(1,Math.max(0,d.position.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)));this.selected=d.id;this.change(next);(this.root.querySelector(`[data-id="${d.id}"] .primary`)as HTMLElement)?.focus();return;
    }
    if(target!==this.viewport)return;const shift=event.shiftKey?60:25;
    if(event.key==='+'||event.key==='='){event.preventDefault();this.zoom(1.2);}else if(event.key==='-'){event.preventDefault();this.zoom(1/1.2);}else if(event.key==='Home'){event.preventDefault();this.fit(null);}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();this.camera.x+=event.key==='ArrowLeft'?shift:event.key==='ArrowRight'?-shift:0;this.camera.y+=event.key==='ArrowUp'?shift:event.key==='ArrowDown'?-shift:0;this.queuePosition();}
  };
}
