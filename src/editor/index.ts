import { validateConfiguration } from '../card/configuration.js';
import { sanitizeArchitecture } from '../card/geometry.js';
import { KINDS, ROOM_IDS, SERVICES, clone, escapeHTML as esc, type Action, type CardConfig, type Configuration, type Device, type Hass, type NativePanel } from '../card/types.js';
import { newDeviceId, pendingReferences, persistentConfiguration, removeDevice, summarizeImport, upsertAction, upsertDevice, upsertPanel, upsertStateSource } from './model.js';
export { LovelaceConfigurationStore } from './storage.js';
export * from './model.js';

const css = `:host{display:block;font:14px system-ui,sans-serif;color:var(--primary-text-color,#243c34)}*{box-sizing:border-box}[hidden]{display:none!important}button,input,select,textarea{font:inherit;color:inherit}button{cursor:pointer;background:var(--card-background-color,#fff);border:1px solid #c9d4cc;border-radius:9px;padding:9px 12px;min-height:44px}button:hover{background:#edf3ed}button:disabled{opacity:.5;cursor:default}input,select,textarea{width:100%;min-height:44px;border:1px solid #c9d4cc;border-radius:8px;background:var(--card-background-color,#fff);padding:8px}input[type=checkbox]{width:20px;min-height:20px}textarea{font:12px ui-monospace,monospace;min-height:85px;resize:vertical}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #4384b1;outline-offset:2px}.editor{padding:14px;max-width:980px;margin:auto}h2{font-size:18px;margin:0 0 15px}h3{font-size:14px;margin:0}.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.toolbar select{flex:1;min-width:160px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.field{display:flex;flex-direction:column;gap:6px;font-size:12px}.full{grid-column:1/-1}.actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:14px}.primary{background:#276b52;color:white;border-color:#276b52}.danger{color:#a43b31}.section{margin-top:15px;border:1px solid #dce4dd;border-radius:10px;padding:12px}.section>summary{cursor:pointer;font-weight:600;min-height:30px;line-height:30px}.section-body{margin-top:10px}.note{font-size:12px;line-height:1.6;color:#64766a}.pending{color:#946722}.status{font-size:12px;line-height:1.6;padding:10px;margin-top:10px;background:#f8eedc;border-radius:9px}.status:empty{display:none}.check{display:flex;align-items:flex-start;gap:9px;font-size:12px;line-height:1.6;margin-top:10px}.controls{display:flex;flex-direction:column;gap:9px;margin-top:10px}.control-row{display:grid;grid-template-columns:1fr 1fr 1.2fr auto;gap:7px;align-items:end;padding:9px;background:#f2f5ef;border-radius:8px}.control-row button{padding:8px}.preview{padding:12px;margin-top:12px;border:1px solid #b8cbb9;border-radius:9px;background:#f1f6ed}.preview ul{padding-left:20px;font-size:12px;line-height:1.7}.file{font-size:12px}.readonly{font-size:11px;color:#6d7b72}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:580px){.editor{padding:10px}.grid{grid-template-columns:1fr}.full{grid-column:auto}.control-row{grid-template-columns:1fr 1fr}.control-row label:nth-child(3){grid-column:1/-1}.control-row button{grid-column:2;justify-self:end}.toolbar button{flex:1}.actions button{flex:1}.section{padding:10px}}`;
const option = (value: string, text: string, selected: string) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(text)}</option>`;
const input = (name: string, label: string, value: unknown, extra = '') => `<label class="field">${label}<input name="${name}" aria-label="${label}" value="${esc(value)}" ${extra}></label>`;
function value(form: FormData, name: string): string { const item = form.get(name); if (item !== null && typeof item !== 'string') throw new Error('El formulario debe contener texto.'); return (item ?? '').trim(); }

/** Configuration-only editor. It never calls an HA action or interprets an imported command. */
export class HomeManagerEditor extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private config?: CardConfig;
  private _hass?: Hass;
  private _selectedDeviceId: string | null = null;
  private _embedded = false;
  private adding = false;
  private allowFixedPosition = false;
  private actionId = '';
  private panelId = '';
  private panelRows: NativePanel['controls'] = [];
  private confirmDelete = false;
  private importGeneration = 0;
  private imported?: { configuration: Configuration; summary: ReturnType<typeof summarizeImport>; viewBoxChanged: boolean; backedUp: boolean };
  private openSections = new Set<string>();
  constructor() {
    super();
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('change', this.onChange);
    this.root.addEventListener('submit', this.onSubmit);
    this.root.addEventListener('toggle', event => { const target = event.target as HTMLDetailsElement; if (target.id) target.open ? this.openSections.add(target.id) : this.openSections.delete(target.id); }, true);
  }
  setConfig(config: CardConfig): void {
    const next = { ...clone(config), configuration: validateConfiguration(persistentConfiguration(config.configuration), { allowPending: true }) };
    if (this.config && JSON.stringify(this.config) === JSON.stringify(next)) return;
    this.config = next;
    if (!this._selectedDeviceId || !next.configuration.catalog.devices.some(device => device.id === this._selectedDeviceId)) this._selectedDeviceId = next.configuration.catalog.devices[0]?.id ?? null;
    this.render();
  }
  set hass(hass: Hass) { this._hass = hass; this.updateEntityOptions(); }
  get hass(): Hass | undefined { return this._hass; }
  set selectedDeviceId(id: string | null) { if (id === this._selectedDeviceId) return; this._selectedDeviceId = id; this.adding = false; this.allowFixedPosition = false; this.confirmDelete = false; this.render(); }
  get selectedDeviceId(): string | null { return this._selectedDeviceId; }
  set embedded(value: boolean) { if (this._embedded === value) return; this._embedded = value; this.render(); }
  get embedded(): boolean { return this._embedded; }
  getConfiguration(): Configuration | undefined { return this.config ? persistentConfiguration(this.config.configuration) : undefined; }
  private get configuration(): Configuration { if (!this.config) throw new Error('Falta la configuración de HomeManager.'); return this.config.configuration; }
  private device(): Device | undefined { return this.configuration.catalog.devices.find(device => device.id === this._selectedDeviceId); }
  private notice(message: string): void { const status = this.root.querySelector('.status'); if (status) status.textContent = message; }
  private emit(configuration: Configuration): void {
    const clean = validateConfiguration(persistentConfiguration(configuration), { allowPending: true });
    this.config = { ...this.config!, configuration: clean };
    this.dispatchEvent(new CustomEvent('config-changed', { bubbles: true, composed: true, detail: { config: clone(this.config) } }));
    this.render();
    this.notice('Borrador actualizado. Usá el guardado explícito de la tarjeta o del dashboard.');
  }
  private section(id: string, title: string, body: string): string { return `<details class="section" id="${id}"${this.openSections.has(id) ? ' open' : ''}><summary>${title}</summary><div class="section-body">${body}</div></details>`; }
  private render(): void {
    if (!this.config) { this.root.innerHTML = `<style>${css}</style><div class="editor">Configuración pendiente.</div>`; return; }
    const configuration = this.configuration, selected = this.adding ? undefined : this.device();
    const pending = pendingReferences(configuration, this._hass?.states);
    this.root.innerHTML = `<style>${css}</style><div class="editor">${this._embedded ? '' : '<h2>HomeManager · configuración</h2>'}<div class="toolbar"><label class="sr" for="device-select">Dispositivo</label><select id="device-select" aria-label="Dispositivo"><option value="">Seleccionar icono</option>${configuration.catalog.devices.map(device => option(device.id, device.display.label, selected?.id ?? '')).join('')}</select><button type="button" data-command="add">Agregar icono</button>${selected ? '<button type="button" class="danger" data-command="delete">Eliminar icono</button>' : ''}</div>
      ${this.confirmDelete && selected ? `<div class="preview"><p class="note">Se elimina sólo el icono y su fuente de estado en este plano. Las entidades, acciones y paneles reutilizables permanecen.</p><button type="button" class="danger" data-command="confirm-delete">Confirmar eliminación</button><button type="button" data-command="cancel-delete">Cancelar</button></div>` : ''}
      ${selected || this.adding || !configuration.catalog.devices.length ? this.deviceForm(selected) : '<p class="note">Seleccioná un icono o agregá uno.</p>'}
      ${this.section('state-section', 'Fuente de estado', this.stateForm(selected))}
      ${this.section('actions-section', 'Acciones lógicas', this.actionForm())}
      ${this.section('panels-section', 'Paneles nativos', this.panelForm())}
      ${pending.length ? this.section('pending-section', `Referencias pendientes (${pending.length})`, `<ul class="note pending">${pending.map(text => `<li>${esc(text)}</li>`).join('')}</ul><p class="note">No se ejecutan referencias ausentes. Las referencias lógicas deben resolverse antes del guardado definitivo.</p>`) : ''}
      ${this.section('import-section', 'Importar y exportar', this.importForm())}
      <div class="status" role="status" aria-live="polite"></div><datalist id="entity-options"></datalist></div>`;
    this.updateEntityOptions();
  }
  private roomOptions(selected: string): string { return ROOM_IDS.map(id => option(id, this.config?.room_labels?.[id] ?? id, selected)).join(''); }
  private deviceForm(device?: Device): string {
    const fixed = device?.mobility === 'fixed' && !this.allowFixedPosition;
    const actions = Object.keys(this.configuration.actions), panels = Object.keys(this.configuration.panels);
    const actionId = device?.bindings.primaryAction ?? '', panelId = device?.bindings.advancedPopupId ?? '';
    return `<form id="device-form"><div class="grid">${input('label', 'Nombre del dispositivo', device?.display.label ?? '', 'required maxlength="240"')}${input('id', 'ID del dispositivo', device?.id ?? '', device ? 'readonly' : 'placeholder="Automático si se deja vacío"')}${input('icon', 'Icono del dispositivo', device?.display.icon ?? 'mdi:lightbulb-outline', 'required')}<label class="field">Tipo de dispositivo<select name="kind" aria-label="Tipo de dispositivo">${KINDS.map(kind => option(kind, kind, device?.kind ?? 'light')).join('')}</select></label><label class="field">Movilidad del dispositivo<select name="mobility" aria-label="Movilidad del dispositivo">${['fixed', 'editable', 'portable'].map(mobility => option(mobility, mobility, device?.mobility ?? 'editable')).join('')}</select></label><label class="field">Habitación del dispositivo<select name="roomId" aria-label="Habitación del dispositivo" data-location${fixed ? ' disabled' : ''}>${this.roomOptions(device?.roomId ?? 'living')}</select></label>${input('x', 'Posición X', device?.position.x ?? .5, `type="number" min="0" max="1" step="0.001" required data-location${fixed ? ' disabled' : ''}`)}${input('y', 'Posición Y', device?.position.y ?? .5, `type="number" min="0" max="1" step="0.001" required data-location${fixed ? ' disabled' : ''}`)}${input('entityId', 'Entidad del dispositivo', device?.bindings.entityId ?? '', 'list="entity-options" placeholder="Sin vincular"')}<label class="field">Acción principal<select name="primaryAction" aria-label="Acción principal">${option('', 'Sin acción', actionId)}${actionId && !actions.includes(actionId) ? option(actionId, `${actionId} · pendiente`, actionId) : ''}${actions.map(key => option(key, key, actionId)).join('')}</select></label><label class="field">Panel nativo<select name="panelId" aria-label="Panel nativo">${option('', 'Sin panel', panelId)}${panelId && !panels.includes(panelId) ? option(panelId, `${panelId} · pendiente`, panelId) : ''}${panels.map(key => option(key, key, panelId)).join('')}</select></label></div>${fixed ? '<button type="button" data-command="correct-fixed">Corregir ubicación fija</button>' : ''}<div class="actions"><button class="primary" type="submit">Aplicar dispositivo</button></div></form>`;
  }
  private stateForm(device?: Device): string {
    if (!device) return '<p class="note">Seleccioná un icono para declarar su fuente.</p>';
    const source = this.configuration.stateSources[device.id];
    return `<form id="state-form"><div class="grid">${input('entityId', 'Entidad de estado', source?.entityId ?? device.bindings.entityId ?? '', 'list="entity-options" placeholder="Sin fuente"')}${input('attribute', 'Atributo de estado', source?.attribute ?? '', 'placeholder="Estado principal si se deja vacío"')}<label class="field">Tipo de feedback<select name="feedback" aria-label="Tipo de feedback">${['optimistic', 'measured', 'transmitter'].map(kind => option(kind, kind, source?.feedback ?? 'optimistic')).join('')}</select></label></div><label class="check"><input type="checkbox" name="verified" aria-label="Revisé la fuente independiente"><span>Para measured: revisé que la fuente sea independiente. Esta elección no demuestra el estado físico ni sustituye la verificación de la integración.</span></label><div class="actions"><button type="submit" class="primary">Aplicar fuente</button></div></form>`;
  }
  private actionForm(): string {
    const action = this.configuration.actions[this.actionId], domain = action?.domain ?? 'light';
    const targets = action ? Array.isArray(action.target.entity_id) ? action.target.entity_id.join(', ') : action.target.entity_id : '';
    return `<label class="field">Acción a editar<select aria-label="Acción a editar" id="action-select">${option('', 'Nueva acción', this.actionId)}${Object.keys(this.configuration.actions).map(key => option(key, key, this.actionId)).join('')}</select></label><form id="action-form"><div class="grid">${input('actionId', 'ID de acción', this.actionId, this.actionId ? 'required readonly' : 'required')}<label class="field">Dominio<select name="domain" aria-label="Dominio">${Object.keys(SERVICES).map(key => option(key, key, domain)).join('')}</select></label><label class="field">Servicio<select name="service" aria-label="Servicio">${SERVICES[domain].map(service => option(service, service, action?.service ?? SERVICES[domain][0])).join('')}</select></label>${input('targets', 'Destinos de la acción', targets, 'required placeholder="dominio.entidad; separá varios con comas"')}<label class="field full">Datos de la acción<textarea name="data" aria-label="Datos de la acción" maxlength="8192">${esc(JSON.stringify(action?.data ?? {}, null, 2))}</textarea></label></div><p class="note">Destinos explícitos; sin códigos de radio ni plantillas. Los scripts requieren comprobar sus parámetros y firma en HA.</p><div class="actions"><button type="submit" class="primary">Aplicar acción</button></div></form>`;
  }
  private controlRows(): string {
    return this.panelRows.map((control, index) => `<div class="control-row">${input(`control-id-${index}`, `ID de control ${index + 1}`, control.id, 'required')}${input(`control-label-${index}`, `Nombre de control ${index + 1}`, control.label, 'required')}<label class="field">Acción de control ${index + 1}<select name="control-action-${index}" aria-label="Acción de control ${index + 1}">${option('', 'Elegir acción', control.actionId)}${control.actionId && !Object.hasOwn(this.configuration.actions, control.actionId) ? option(control.actionId, `${control.actionId} · pendiente`, control.actionId) : ''}${Object.keys(this.configuration.actions).map(key => option(key, key, control.actionId)).join('')}</select></label><button type="button" data-command="remove-control" data-index="${index}" aria-label="Quitar control ${index + 1}">×</button></div>`).join('');
  }
  private updateControlRows(): void {
    // Keep the other form values intact while adding/removing a row.
    const group = this.root.querySelector('#panel-form .controls');
    if (group) group.innerHTML = this.controlRows();
  }
  private panelForm(): string {
    const panel = this.configuration.panels[this.panelId];
    return `<label class="field">Panel a editar<select id="panel-select" aria-label="Panel a editar">${option('', 'Nuevo panel', this.panelId)}${Object.keys(this.configuration.panels).map(key => option(key, key, this.panelId)).join('')}</select></label><form id="panel-form"><div class="grid">${input('panelId', 'ID de panel', this.panelId, this.panelId ? 'required readonly' : 'required')}${input('title', 'Título del panel', panel?.title ?? '', 'required')}<label class="field">Tipo de panel<select name="kind" aria-label="Tipo de panel">${option('device-controls', 'Controles de dispositivo', panel?.kind ?? 'device-controls')}${option('rf-fan', 'Ventilador RF mediante scripts HA', panel?.kind ?? 'device-controls')}</select></label></div><div class="controls" role="group" aria-label="Controles del panel">${this.controlRows()}</div><button type="button" data-command="add-control">Agregar control</button><div class="actions"><button type="submit" class="primary">Aplicar panel</button></div></form>`;
  }
  private importForm(): string {
    const imported = this.imported;
    return `<div class="toolbar"><button type="button" data-command="export">Exportar JSON</button><label class="file">Importar JSON o SVG<input type="file" aria-label="Importar JSON o SVG" accept=".json,.svg,application/json,image/svg+xml" id="import-file"></label></div>${imported ? `<div class="preview"><h3>Resumen de importación</h3><ul><li>Iconos nuevos: ${imported.summary.added.length}</li><li>Iconos eliminados: ${imported.summary.removed.length}</li><li>Iconos modificados: ${imported.summary.changed.length}</li><li>Acciones: ${imported.summary.actions}; paneles: ${imported.summary.panels}</li><li>Arquitectura: ${imported.summary.architectureChanged ? 'se reemplaza' : 'se conserva'}</li></ul>${imported.viewBoxChanged ? '<p class="note pending">El viewBox cambió. Exportá una copia y revisá/migrá las posiciones antes de aplicar.</p>' : ''}<div class="actions"><button type="button" data-command="cancel-import">Cancelar importación</button><button type="button" data-command="backup">Exportar copia actual</button><button type="button" class="primary" data-command="apply-import"${imported.viewBoxChanged && !imported.backedUp ? ' disabled' : ''}>Aplicar importación al borrador</button></div></div>` : ''}`;
  }
  private updateEntityOptions(): void {
    const list = this.root.querySelector('#entity-options');
    if (list) list.innerHTML = Object.keys(this._hass?.states ?? {}).sort().map(id => `<option value="${esc(id)}">${esc(this._hass?.states[id].attributes.friendly_name ?? id)}</option>`).join('');
  }
  private captureRows(): NativePanel['controls'] {
    const form = this.root.querySelector<HTMLFormElement>('#panel-form'); if (!form) return this.panelRows;
    const data = new FormData(form);
    return this.panelRows.map((_, index) => ({ id: value(data, `control-id-${index}`), label: value(data, `control-label-${index}`), actionId: value(data, `control-action-${index}`) }));
  }
  private onClick = (event: Event): void => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-command]'); if (!button || button.disabled || !this.config) return;
    try {
      switch (button.dataset.command) {
        case 'add': this.adding = true; this._selectedDeviceId = null; this.allowFixedPosition = false; this.confirmDelete = false; this.render(); break;
        case 'delete': this.confirmDelete = true; this.render(); break;
        case 'cancel-delete': this.confirmDelete = false; this.render(); break;
        case 'confirm-delete': if (this._selectedDeviceId) { const next = removeDevice(this.configuration, this._selectedDeviceId); this._selectedDeviceId = next.catalog.devices[0]?.id ?? null; this.confirmDelete = false; this.emit(next); } break;
        case 'correct-fixed': this.allowFixedPosition = true; for (const field of this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-location]')) field.disabled = false; button.disabled = true; this.root.querySelector<HTMLInputElement>('[name=x]')?.focus(); break;
        case 'add-control': { const rows = this.captureRows(); let index = rows.length + 1; while (rows.some(row => row.id === `control-${index}`)) index++; this.panelRows = [...rows, { id: `control-${index}`, label: '', actionId: '' }]; this.updateControlRows(); this.root.querySelector<HTMLInputElement>(`[name="control-label-${this.panelRows.length - 1}"]`)?.focus(); break; }
        case 'remove-control': this.panelRows = this.captureRows().filter((_, index) => index !== Number(button.dataset.index)); this.updateControlRows(); break;
        case 'export': this.download(); break;
        case 'backup': this.download(); if (this.imported) this.imported.backedUp = true; this.render(); break;
        case 'cancel-import': this.imported = undefined; this.render(); break;
        case 'apply-import': if (this.imported) { const next = this.imported.configuration; this.imported = undefined; this.emit(next); } break;
      }
    } catch (error) { this.notice(error instanceof Error ? error.message : String(error)); }
  };
  private onChange = (event: Event): void => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (!this.config) return;
    if (target.id === 'device-select') { this._selectedDeviceId = target.value || null; this.adding = false; this.allowFixedPosition = false; this.confirmDelete = false; this.render(); }
    else if (target.id === 'action-select') { this.actionId = target.value; this.render(); }
    else if (target.id === 'panel-select') { this.panelId = target.value; this.panelRows = clone(this.configuration.panels[this.panelId]?.controls ?? []); this.render(); }
    else if (target.name === 'domain') { const service = this.root.querySelector<HTMLSelectElement>('[name=service]'), services = SERVICES[target.value] ?? []; if (service) service.innerHTML = services.map(value => option(value, value, services[0])).join(''); }
    else if (target.id === 'import-file') void this.importFile((target as HTMLInputElement).files?.[0]);
  };
  private onSubmit = (event: Event): void => {
    event.preventDefault(); const form = event.target as HTMLFormElement; if (!this.config) return;
    try {
      const data = new FormData(form);
      // Named inputs such as name="id" clobber HTMLFormElement.id in browsers.
      const formId = form.getAttribute('id');
      if (formId === 'device-form') {
        const previous = this.adding ? undefined : this.device(), label = value(data, 'label');
        const fixed = previous?.mobility === 'fixed' && !this.allowFixedPosition;
        if (!fixed && (!value(data, 'x') || !value(data, 'y'))) throw new Error('Completá las dos coordenadas.');
        const device: Device = { id: previous?.id ?? (value(data, 'id') || newDeviceId(label, this.configuration)), display: { label, icon: value(data, 'icon') }, kind: value(data, 'kind') as Device['kind'], roomId: fixed ? previous.roomId : value(data, 'roomId') as Device['roomId'], mobility: value(data, 'mobility') as Device['mobility'], position: fixed ? clone(previous.position) : { x: Number(value(data, 'x')), y: Number(value(data, 'y')) }, bindings: { entityId: value(data, 'entityId') || null, primaryAction: value(data, 'primaryAction') || null, advancedPopupId: value(data, 'panelId') || null }, state: { value: 'unknown', confidence: 'unknown' } };
        const next = upsertDevice(this.configuration, device, { previousId: previous?.id, allowFixedPosition: this.allowFixedPosition }); this._selectedDeviceId = device.id; this.adding = false; this.allowFixedPosition = false; this.emit(next);
      } else if (formId === 'action-form') {
        const targets = value(data, 'targets').split(',').map(value => value.trim()).filter(Boolean);
        const action: Action = { domain: value(data, 'domain') as Action['domain'], service: value(data, 'service'), target: { entity_id: targets.length === 1 ? targets[0] : targets }, data: JSON.parse(value(data, 'data') || '{}') };
        this.actionId = value(data, 'actionId'); this.emit(upsertAction(this.configuration, this.actionId, action));
      } else if (formId === 'state-form') {
        if (!this._selectedDeviceId) throw new Error('Seleccioná un icono.');
        const entityId = value(data, 'entityId'), feedback = value(data, 'feedback');
        if (entityId && feedback === 'measured' && data.get('verified') !== 'on') throw new Error('Revisá y marcá la fuente independiente antes de declarar measured.');
        this.emit(upsertStateSource(this.configuration, this._selectedDeviceId, entityId ? { entityId, attribute: value(data, 'attribute') || null, feedback: feedback as 'measured' | 'optimistic' | 'transmitter' } : null));
      } else if (formId === 'panel-form') {
        this.panelRows = this.captureRows(); this.panelId = value(data, 'panelId'); this.emit(upsertPanel(this.configuration, this.panelId, { kind: value(data, 'kind') as NativePanel['kind'], title: value(data, 'title'), controls: this.panelRows }));
      }
    } catch (error) { this.notice(error instanceof Error ? error.message : String(error)); }
  };
  private async importFile(file?: File): Promise<void> {
    const generation = ++this.importGeneration;
    if (!file || !this.config) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('El archivo excede 5 MiB.');
      const source = await file.text();
      if (generation !== this.importGeneration) return;
      let candidate: Configuration;
      if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
        const safe = sanitizeArchitecture(source); candidate = { ...persistentConfiguration(this.configuration), architecture: { format: 'svg', content: safe.content } };
      } else candidate = persistentConfiguration(JSON.parse(source));
      const clean = validateConfiguration(candidate, { allowPending: true });
      const previousBox = sanitizeArchitecture(this.configuration.architecture.content).box, nextBox = sanitizeArchitecture(clean.architecture.content).box;
      this.imported = { configuration: clean, summary: summarizeImport(this.configuration, clean), viewBoxChanged: JSON.stringify(previousBox) !== JSON.stringify(nextBox), backedUp: false };
      this.openSections.add('import-section'); this.render();
    } catch (error) { if (generation === this.importGeneration) this.notice(error instanceof Error ? error.message : String(error)); }
  }
  private download(): void {
    const content = validateConfiguration(persistentConfiguration(this.configuration), { allowPending: true });
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'homemanager-configuration.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

if (!customElements.get('homemanager-editor')) customElements.define('homemanager-editor', HomeManagerEditor);
