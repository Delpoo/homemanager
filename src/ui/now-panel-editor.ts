import { shortId } from '../model/short-id.js';
import { t } from '../i18n/index.js';
import { clone, escapeHTML as e, type Configuration, type Hass } from '../card/types.js';
import { automaticBlocks, BLOCK_NAMES, configuredNow, type NowBlock, type NowBlockType } from '../model/now-panel.js';
import { nowSections } from '../model/now.js';
import { checkList, checkListStyles } from './check-list.js';
import { controlsOf } from '../card/device-controls.js';
import { personName } from '../model/names.js';
import { alertText } from './alert-components.js';
export class NowPanelEditor extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private config!: Configuration;
  private hass?: Hass;
  private change!: (c: Configuration) => void;
  // The old wall list (nowPanels.wall) is kept in the document but no longer edited (#61).
  private mode: 'home' = 'home';
  private selected = '';
  private gallery = false;
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
  /** The real Now with this draft, block by block: rows and values, not just titles (#62). */
  private previews(): Map<string, string> {
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
    const custom = configuredNow({ ...this.config, nowPanels: { home: this.editable() } }, this.hass, sections) ?? [];
    return new Map(
      custom.map(section => [
        section.block.id,
        section.rows.length
          ? `<ul>${section.rows
              .slice(0, 6)
              .map(
                row =>
                  `<li><span>${e(row.alert ? alertText(row.alert) : personName(row.name) || row.name)}</span>${row.value ? `<b>${e(row.value)}</b>` : ''}</li>`,
              )
              .join('')}</ul>`
          : `<p class="muted">${e(t('Sin filas ahora'))}</p>`,
      ]),
    );
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
    // 0.13: each block is a card with its live content and icon tools; a gallery adds more.
    const previews = this.previews();
    const tool = (label: string, icon: string, attributes: string) =>
      `<button type="button" class="ib" aria-label="${e(label)}" title="${e(label)}" ${attributes}><ha-icon icon="${icon}" aria-hidden="true"></ha-icon></button>`;
    const form = selected
      ? `<fieldset class="wset"><legend class="sr">${e(t('Editar bloque'))}</legend><label>${e(t('Título'))}<input data-field="title" value="${e(selected.title ?? '')}"></label>${['reading', 'readings'].includes(selected.type) ? `<label>${e(t('Lecturas'))}${selected.type === 'readings' ? `</label>${checkList('readings', t('Lecturas'), readings, selected.readings ?? [])}<label hidden>` : `<select data-field="readings" aria-label="${e(t('Lecturas'))}">${options(readings, selected.readings)}</select>`}</label>` : ''}${['alerts', 'active', 'energy'].includes(selected.type) ? `<label>${e(t('Dispositivos del bloque'))}</label>${checkList('devices', t('Dispositivos del bloque'), devices, selected.devices ?? [])}<label hidden></label><small>${e(t('Sin selección se incluyen todos los dispositivos.'))}</small>` : ''}${['control', 'shortcut'].includes(selected.type) ? `<label>${e(t('Dispositivo'))}<select data-field="deviceId"><option value="">${e(t('Sin dispositivo'))}</option>${options(devices, selected.deviceId ? [selected.deviceId] : [])}</select></label>` : ''}${
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
      : '';
    const cards = blocks
      .map(
        (b, index) =>
          `<section class="w${b.id === this.selected ? ' sel' : ''}" data-block="${e(b.id)}" draggable="true"><header><span class="grip" title="${e(t('Arrastrar para mover'))}"><ha-icon icon="mdi:drag-vertical" aria-hidden="true"></ha-icon></span><ha-icon icon="${BLOCK_ICONS[b.type]}" aria-hidden="true"></ha-icon><b>${e(b.title || t(BLOCK_NAMES[b.type]))}</b><span class="tools">${tool(t('Subir'), 'mdi:arrow-up', `data-move="${e(b.id)}" data-offset="-1"${index === 0 ? ' disabled' : ''}`)}${tool(t('Bajar'), 'mdi:arrow-down', `data-move="${e(b.id)}" data-offset="1"${index === blocks.length - 1 ? ' disabled' : ''}`)}${tool(t('Editar'), 'mdi:cog-outline', `data-edit="${e(b.id)}" aria-pressed="${b.id === this.selected}"`)}${tool(t('Quitar'), 'mdi:close', `data-remove="${e(b.id)}"`)}</span></header><div class="preview">${previews.get(b.id) ?? `<p class="muted">${e(t('Sin filas ahora'))}</p>`}</div>${b.id === this.selected ? form : ''}</section>`,
      )
      .join('');
    const gallery = this.gallery
      ? `<div class="gallery" role="group" aria-label="${e(t('Agregar bloque'))}">${(
          Object.keys(BLOCK_NAMES) as NowBlockType[]
        )
          .map(
            type =>
              `<button type="button" class="gcard" data-add-type="${type}"><ha-icon icon="${BLOCK_ICONS[type]}" aria-hidden="true"></ha-icon><span>${e(t(BLOCK_NAMES[type]))}</span></button>`,
          )
          .join('')}</div>`
      : '';
    this.root.innerHTML = `<style>${checkListStyles}${nowEditorStyles}</style><div class="nowh">${tool(t('Agregar bloque'), 'mdi:plus', `data-gallery aria-expanded="${this.gallery}"`)}${tool(t('Usar panel automático'), 'mdi:restore', 'data-reset')}</div>${gallery}<div class="widgets">${cards || `<p class="muted">${e(t('Nada por mostrar en este espacio'))}</p>`}</div>`;
    this.root.querySelector<HTMLButtonElement>('[data-gallery]')!.onclick = () => {
      this.gallery = !this.gallery;
      this.render();
    };
    this.root.querySelectorAll<HTMLButtonElement>('[data-add-type]').forEach(
      button =>
        (button.onclick = () => {
          this.selected = 'block-' + shortId();
          this.gallery = false;
          this.write([...blocks, { id: this.selected, type: button.dataset.addType as NowBlockType }]);
        }),
    );
    // Drag a card onto another to put it there.
    this.root.querySelectorAll<HTMLElement>('section.w').forEach(card => {
      card.ondragstart = event => event.dataTransfer?.setData('text/plain', card.dataset.block!);
      card.ondragover = event => event.preventDefault();
      card.ondrop = event => {
        event.preventDefault();
        const from = event.dataTransfer?.getData('text/plain');
        if (!from || from === card.dataset.block) return;
        const next = clone(blocks);
        const moved = next.splice(
          next.findIndex(v => v.id === from),
          1,
        )[0];
        next.splice(
          next.findIndex(v => v.id === card.dataset.block),
          0,
          moved,
        );
        this.write(next);
      };
    });
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
          this.selected = this.selected === b.dataset.edit ? '' : b.dataset.edit!;
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
const BLOCK_ICONS: Record<NowBlockType, string> = {
  alerts: 'mdi:bell-outline',
  climate: 'mdi:thermometer',
  reading: 'mdi:gauge',
  readings: 'mdi:format-list-bulleted',
  active: 'mdi:power',
  energy: 'mdi:lightning-bolt-outline',
  control: 'mdi:tune-variant',
  shortcut: 'mdi:star-outline',
};
const nowEditorStyles = `:host{display:block;min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere}*{box-sizing:border-box}
button,input,select{font:inherit;min-height:40px;max-width:100%;padding:6px 8px;border:1px solid color-mix(in srgb,var(--hm-ink) 24%,transparent);border-radius:10px;background:var(--hm-surface);color:var(--hm-ink)}
label{display:grid;gap:6px;margin:8px 0}fieldset{min-width:0;border:0;padding:0;margin:8px 0 0}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.ib{display:grid;place-items:center;width:36px;height:36px;min-height:36px;padding:0;border:0;border-radius:10px;background:transparent}.ib:hover:not(:disabled){background:var(--hm-surface-2)}.ib:disabled{opacity:.35}
.ib[aria-pressed=true],.ib[aria-expanded=true]{background:color-mix(in srgb,var(--hm-brand) 14%,transparent);color:var(--hm-brand)}.ib ha-icon{--mdc-icon-size:20px}
.nowh{display:flex;justify-content:flex-end;gap:2px;margin-bottom:8px}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin-bottom:12px;padding:10px;border-radius:14px;background:var(--hm-surface-2)}
.gcard{display:flex;flex-direction:column;align-items:center;gap:6px;min-height:76px;padding:10px 6px;border-radius:12px;font-size:12.5px;text-align:center}
.gcard ha-icon{--mdc-icon-size:26px;color:var(--hm-brand)}.gcard:hover{border-color:var(--hm-brand)}
.widgets{display:grid;gap:10px}
.w{border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface);padding:8px 10px 10px}.w.sel{border-color:var(--hm-brand);box-shadow:0 0 0 1px var(--hm-brand)}
.w header{display:flex;align-items:center;gap:6px}.w header>ha-icon{--mdc-icon-size:18px;color:var(--hm-brand)}.w header b{flex:1;min-width:0;font-weight:500}
.grip{display:grid;place-items:center;color:var(--hm-muted);cursor:grab}.grip ha-icon{--mdc-icon-size:18px}
.tools{display:flex}
.preview{font-size:13px}.preview ul{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:4px}
.preview li{display:flex;justify-content:space-between;gap:8px}.preview li b{font-weight:500;font-variant-numeric:tabular-nums}
.muted{color:var(--hm-muted);margin:6px 0 0}
`;
if (!customElements.get('homemanager-now-panel-editor'))
  customElements.define('homemanager-now-panel-editor', NowPanelEditor);
