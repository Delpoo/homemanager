import { t } from '../i18n/index.js';
import { clone, escapeHTML as e, type Configuration, type Hass } from '../card/types.js';
import { automaticBlocks, BLOCK_NAMES, configuredNow, type NowBlock, type NowBlockType } from '../model/now-panel.js';
import { nowSections } from '../model/now.js';
import { checkList, checkListStyles } from './check-list.js';
import { controlsOf } from '../card/device-controls.js';
import { personName } from '../model/names.js';
export class NowPanelEditor extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private config!: Configuration;
  private hass?: Hass;
  private change!: (c: Configuration) => void;
  // The old wall list (nowPanels.wall) is kept in the document but no longer edited (#61).
  private mode: 'home' = 'home';
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
  /** The list to edit: once customized, its own; before that, what Now shows today (#62). */
  private editable(): NowBlock[] {
    return this.config.nowPanels?.home !== undefined ? this.blocks() : automaticBlocks();
  }
  private write(blocks: NowBlock[]) {
    const config = clone(this.config);
    config.nowPanels ??= {};
    config.nowPanels[this.mode] = blocks;
    this.change(config);
  }
  /** The real Now with this draft: rows and values, not just titles (#62). */
  private preview(): string {
    const sections = nowSections(
      this.config.catalog.devices,
      this.config.rooms,
      this.hass,
      Date.now(),
      null,
      {},
      {},
      this.config.baseRules,
    );
    const custom = configuredNow({ ...this.config, nowPanels: { home: this.editable() } }, this.hass, sections);
    if (!custom?.length) return e(t('Nada por mostrar en este espacio'));
    return custom
      .map(
        section =>
          `<section><b>${e(t(section.title))}</b>${
            section.rows.length
              ? `<ul>${section.rows
                  .slice(0, 6)
                  .map(row => `<li>${e(personName(row.name) || row.name)}${row.value ? ` · ${e(row.value)}` : ''}</li>`)
                  .join('')}</ul>`
              : `<p>${e(t('Sin filas ahora'))}</p>`
          }</section>`,
      )
      .join('');
  }
  private render() {
    if (!this.config) return;
    const blocks = this.editable();
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
    this.root.innerHTML = `<style>${checkListStyles}:host{display:block;min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere}*{box-sizing:border-box}button,input,select{font:inherit;min-height:44px;max-width:100%;padding:8px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-surface);color:var(--hm-ink)}label{display:grid;gap:6px;margin:10px 0}.row{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;padding:8px;border:1px solid var(--hm-line);border-radius:10px}.row>b{flex:1}.preview{padding:12px;background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:12px}fieldset{min-width:0}</style><p>${e(t('Sin personalizar se conservan las secciones automáticas.'))}</p><button type="button" data-reset>${e(t('Usar panel automático'))}</button>${blocks.map(b => `<div class="row"><b>${e(b.title || t(BLOCK_NAMES[b.type]))}</b><button type="button" data-edit="${e(b.id)}">${e(t('Editar'))}</button><button type="button" data-move="${e(b.id)}" data-offset="-1">${e(t('Subir'))}</button><button type="button" data-move="${e(b.id)}" data-offset="1">${e(t('Bajar'))}</button><button type="button" data-remove="${e(b.id)}">${e(t('Quitar'))}</button></div>`).join('')}<label>${e(t('Agregar bloque'))}<select data-type>${Object.entries(
      BLOCK_NAMES,
    )
      .map(([type, name]) => `<option value="${type}">${e(t(name))}</option>`)
      .join('')}</select></label><button type="button" data-add>${e(t('Agregar bloque'))}</button>${
      selected
        ? `<fieldset><legend>${e(t('Editar bloque'))}</legend><label>${e(t('Título'))}<input data-field="title" value="${e(selected.title ?? '')}"></label>${['reading', 'readings'].includes(selected.type) ? `<label>${e(t('Lecturas'))}${selected.type === 'readings' ? `</label>${checkList('readings', t('Lecturas'), readings, selected.readings ?? [])}<label hidden>` : `<select data-field="readings" aria-label="${e(t('Lecturas'))}">${options(readings, selected.readings)}</select>`}</label>` : ''}${['alerts', 'active', 'energy'].includes(selected.type) ? `<label>${e(t('Dispositivos del bloque'))}</label>${checkList('devices', t('Dispositivos del bloque'), devices, selected.devices ?? [])}<label hidden></label><small>${e(t('Sin selección se incluyen todos los dispositivos.'))}</small>` : ''}${['control', 'shortcut'].includes(selected.type) ? `<label>${e(t('Dispositivo'))}<select data-field="deviceId"><option value="">${e(t('Sin dispositivo'))}</option>${options(devices, selected.deviceId ? [selected.deviceId] : [])}</select></label>` : ''}${
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
    }<h4>${e(t('Vista previa'))}</h4><div class="preview">${this.preview()}</div>`;
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
    // Check lists (#62): ticking a box updates the block at once.
    this.root.querySelectorAll<HTMLInputElement>('input[data-check-field]').forEach(
      box =>
        (box.onchange = () => {
          const next = clone(blocks),
            block = next.find(b => b.id === this.selected)!;
          const key = box.dataset.checkField as 'readings' | 'devices';
          const values = [
            ...this.root.querySelectorAll<HTMLInputElement>(`input[data-check-field="${key}"]:checked`),
          ].map(item => item.value);
          if (key === 'devices' && !values.length) delete block.devices;
          else block[key] = values;
          this.write(next);
        }),
    );
    this.root.querySelectorAll<HTMLInputElement>('input[data-check-search]').forEach(
      search =>
        (search.oninput = () => {
          const query = search.value.trim().toLowerCase();
          search
            .closest('.check-list')
            ?.querySelectorAll<HTMLElement>('label[data-name]')
            .forEach(row => (row.hidden = !!query && !row.dataset.name!.includes(query)));
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
            if (block.type === 'readings' && key === 'readings') return;
            if (key === 'devices' && !values.length) delete block.devices;
            else block[key] = values;
          } else if (['deviceId', 'controlId', 'roomId', 'title'].includes(key)) {
            if (field.value) (block as unknown as Record<string, string>)[key] = field.value;
            else delete (block as unknown as Record<string, string>)[key];
            if (block.type === 'shortcut' && field.value) {
              if (key === 'deviceId') delete block.roomId;
              if (key === 'roomId') delete block.deviceId;
            }
          }
          this.write(next);
        }),
    );
  }
}
if (!customElements.get('homemanager-now-panel-editor'))
  customElements.define('homemanager-now-panel-editor', NowPanelEditor);
