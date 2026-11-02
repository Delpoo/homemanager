import { t } from '../i18n/index.js';
import { clone, escapeHTML as e, type Configuration, type Hass } from '../card/types.js';
import { BLOCK_NAMES, type NowBlock, type NowBlockType } from '../model/now-panel.js';
import { controlsOf } from '../card/device-controls.js';
import { personName } from '../model/names.js';
export class NowPanelEditor extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private config!: Configuration;
  private hass?: Hass;
  private change!: (c: Configuration) => void;
  private mode: 'home' | 'wall' = 'home';
  private selected = '';
  configure(config: Configuration, hass: Hass | undefined, change: (c: Configuration) => void) {
    this.config = config;
    this.hass = hass;
    this.change = change;
    this.render();
  }
  private blocks(): NowBlock[] {
    return this.config.nowPanels?.[this.mode] ?? this.config.nowPanels?.home ?? [];
  }
  private write(blocks: NowBlock[]) {
    const config = clone(this.config);
    config.nowPanels ??= {};
    config.nowPanels[this.mode] = blocks;
    this.change(config);
  }
  private render() {
    if (!this.config) return;
    const blocks = this.blocks();
    const selected = blocks.find(b => b.id === this.selected);
    const options = (entries: { id: string; name: string }[], ids: string[] = []) =>
      entries
        .map(v => `<option value="${e(v.id)}"${ids.includes(v.id) ? ' selected' : ''}>${e(v.name)}</option>`)
        .join('');
    const devices = this.config.catalog.devices.map(d => ({ id: d.id, name: d.display.label }));
    const readings = Object.entries(this.hass?.states ?? {})
      .filter(([id]) => /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/.test(id) && !id.endsWith('.all'))
      .map(([id, state]) => ({
        id,
        name: personName(state.attributes.friendly_name) || id.split('.')[1].replaceAll('_', ' '),
      }));
    this.root.innerHTML = `<style>:host{display:block;min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere}*{box-sizing:border-box}button,input,select{font:inherit;min-height:44px;max-width:100%;padding:8px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-surface);color:var(--hm-ink)}label{display:grid;gap:6px;margin:10px 0}.row{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;padding:8px;border:1px solid var(--hm-line);border-radius:10px}.row>b{flex:1}.preview{padding:12px;background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:12px}fieldset{min-width:0}</style><label>${e(t('Configuración del panel'))}<select data-mode aria-label="${e(t('Configuración del panel'))}"><option value="home"${this.mode === 'home' ? ' selected' : ''}>${e(t('Casa'))}</option><option value="wall"${this.mode === 'wall' ? ' selected' : ''}>${e(t('Modo pared'))}</option></select></label><p>${e(t('Sin personalizar se conservan las secciones automáticas. El modo pared puede usar otra lista.'))}</p><button type="button" data-reset>${e(t('Usar panel automático'))}</button>${blocks.map(b => `<div class="row"><b>${e(b.title || t(BLOCK_NAMES[b.type]))}</b><button type="button" data-edit="${e(b.id)}">${e(t('Editar'))}</button><button type="button" data-move="${e(b.id)}" data-offset="-1">${e(t('Subir'))}</button><button type="button" data-move="${e(b.id)}" data-offset="1">${e(t('Bajar'))}</button><button type="button" data-remove="${e(b.id)}">${e(t('Quitar'))}</button></div>`).join('')}<label>${e(t('Agregar bloque'))}<select data-type>${Object.entries(
      BLOCK_NAMES,
    )
      .map(([type, name]) => `<option value="${type}">${e(t(name))}</option>`)
      .join('')}</select></label><button type="button" data-add>${e(t('Agregar bloque'))}</button>${
      selected
        ? `<fieldset><legend>${e(t('Editar bloque'))}</legend><label>${e(t('Título'))}<input data-field="title" value="${e(selected.title ?? '')}"></label>${['reading', 'readings'].includes(selected.type) ? `<label>${e(t('Lecturas'))}<select data-field="readings" aria-label="${e(t('Lecturas'))}"${selected.type === 'readings' ? ' multiple' : ''}>${options(readings, selected.readings)}</select></label>` : ''}${['alerts', 'active', 'energy'].includes(selected.type) ? `<label>${e(t('Dispositivos del bloque'))}<select data-field="devices" multiple>${options(devices, selected.devices)}</select></label><small>${e(t('Sin selección se incluyen todos los dispositivos.'))}</small>` : ''}${['control', 'shortcut'].includes(selected.type) ? `<label>${e(t('Dispositivo'))}<select data-field="deviceId"><option value="">${e(t('Sin dispositivo'))}</option>${options(devices, selected.deviceId ? [selected.deviceId] : [])}</select></label>` : ''}${
            selected.type === 'control'
              ? `<label>${e(t('Control'))}<select data-field="controlId"><option value="">${e(t('Elegí un control'))}</option>${options(
                  controlsOf(
                    this.config.catalog.devices.find(d => d.id === selected.deviceId) ?? ({ bindings: {} } as never),
                  ).map(c => ({ id: c.id, name: c.label })),
                  selected.controlId ? [selected.controlId] : [],
                )}</select></label>`
              : ''
          }${
            selected.type === 'shortcut'
              ? `<label>${e(t('Espacio'))}<select data-field="roomId"><option value="">${e(t('Sin espacio'))}</option>${options(
                  this.config.rooms.map(r => ({ id: r.id, name: r.label })),
                  selected.roomId ? [selected.roomId] : [],
                )}</select></label>`
              : ''
          }</fieldset>`
        : ''
    }<h4>${e(t('Vista previa'))}</h4><div class="preview">${
      blocks.length
        ? blocks
            .map(
              b =>
                `<section><b>${e(b.title || t(BLOCK_NAMES[b.type]))}</b><p>${e(
                  (b.readings ?? [])
                    .map(id => {
                      const s = this.hass?.states[id];
                      return s
                        ? [personName(s.attributes.friendly_name), s.state, s.attributes.unit_of_measurement]
                            .filter(Boolean)
                            .join(' ')
                        : t('No disponible');
                    })
                    .join(' · '),
                )}</p></section>`,
            )
            .join('')
        : e(t(this.config.nowPanels ? 'Nada por mostrar en este espacio' : 'Se conservan las secciones automáticas.'))
    }</div>`;
    this.root.querySelector<HTMLSelectElement>('[data-mode]')!.onchange = ev => {
      this.mode = (ev.target as HTMLSelectElement).value as 'home' | 'wall';
      this.selected = '';
      this.render();
    };
    this.root.querySelector<HTMLButtonElement>('[data-add]')!.onclick = () => {
      const type = this.root.querySelector<HTMLSelectElement>('[data-type]')!.value as NowBlockType;
      this.selected = 'block-' + crypto.randomUUID().slice(0, 8);
      this.write([...blocks, { id: this.selected, type }]);
    };
    this.root.querySelector<HTMLButtonElement>('[data-reset]')!.onclick = () => {
      const config = clone(this.config);
      if (config.nowPanels) {
        delete config.nowPanels[this.mode];
        if (!Object.keys(config.nowPanels).length) delete config.nowPanels;
      }
      this.change(config);
    };
    this.root.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(
      b =>
        (b.onclick = () => {
          this.selected = b.dataset.edit!;
          this.render();
        }),
    );
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-remove]')
      .forEach(b => (b.onclick = () => this.write(blocks.filter(v => v.id !== b.dataset.remove))));
    this.root.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(
      b =>
        (b.onclick = () => {
          const next = clone(blocks),
            i = next.findIndex(v => v.id === b.dataset.move),
            j = i + Number(b.dataset.offset);
          if (j >= 0 && j < next.length) {
            [next[i], next[j]] = [next[j], next[i]];
            this.write(next);
          }
        }),
    );
    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]').forEach(
      field =>
        (field.onchange = () => {
          const next = clone(blocks),
            block = next.find(b => b.id === this.selected)!;
          const key = field.dataset.field!;
          if (key === 'readings' || key === 'devices') {
            const values = [...(field as HTMLSelectElement).selectedOptions].map(o => o.value);
            if (key === 'devices' && !values.length) delete block.devices;
            else block[key] = values;
          } else if (['deviceId', 'controlId', 'roomId', 'title'].includes(key)) {
            if (field.value) (block as unknown as Record<string, string>)[key] = field.value;
            else delete (block as unknown as Record<string, string>)[key];
          }
          this.write(next);
        }),
    );
  }
}
if (!customElements.get('homemanager-now-panel-editor'))
  customElements.define('homemanager-now-panel-editor', NowPanelEditor);
