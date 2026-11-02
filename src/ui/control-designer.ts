import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import type { RfRemote, RfWidget, WidgetType } from '../integration/rf.js';
import { WIDGET_BUTTONS, WIDGET_SIZE, layoutOf, place, add, uniqueId, rows } from '../rf/layout.js';
import { widgetLabel, widgetHelp } from '../rf/catalog.js';
import { HomeManagerRfRemote } from '../rf/remote-view.js';
import { installPanelComponents } from './panel-components.js';
import { rfManagerStyles, rfWidgetDialog } from './rf-components.js';
import { iconPicker } from './icon-picker.js';
import { TaskScreen } from './task-screen.js';
import { confirmDialog } from './confirm-dialog.js';

export interface DesignerOptions {
  key: string;
  remote: RfRemote;
  controls?: { id: string; label: string }[];
  renderContent?: (piece: RfWidget) => HTMLElement | null;
  readValues?: HomeManagerRfRemote['readValues'];
  estimated: boolean;
  save(layout: RfWidget[] | null): Promise<void> | void;
}

/** One designer for both backends. It edits only layout/reference data;
 * preview has no sender, and a failed save keeps the previous design. */
export class ControlDesigner extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private options?: DesignerOptions;
  private remote?: RfRemote;
  private history: (RfWidget[] | null)[] = [];
  private draft?: RfWidget;
  private isNew = false;
  private alignedX?: number;
  private suspended = false;
  private baseline = '';
  private preview = false;
  private busy = false;
  private error = '';
  private canvas = new HomeManagerRfRemote();
  constructor() {
    super();
    installPanelComponents(
      this.root,
      'control-designer',
      rfManagerStyles +
        `
      :host{display:block;min-width:0}.toolbar{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
      .types{display:flex;flex-wrap:wrap;gap:6px}.types button{flex:1 1 110px}
      .canvas{max-width:520px;margin:auto;width:100%} .error-text:empty{display:none}
      .inspector{display:grid;gap:12px}.size{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      label{min-width:0}input,select{max-width:100%;box-sizing:border-box}
    `,
      false,
    );
    this.canvas.onLayout = layout => void this.commit(layout);
    this.canvas.onEdit = id => this.edit(id);
    this.canvas.onDelete = id => void this.removePiece(id);
  }
  configure(options: DesignerOptions): void {
    if (this.options?.key !== options.key) {
      this.history = [];
      this.draft = undefined;
      this.preview = false;
    }
    this.options = options;
    this.remote = structuredClone(options.remote);
    this.render();
  }
  private async commit(layout: RfWidget[] | null, undo = false): Promise<void> {
    if (!this.remote || !this.options || this.busy) return;
    if ((layout ?? []).some(w => w.y + w.h > 40) || (layout?.length ?? 0) > 64) {
      this.error = t('No queda espacio en el lienzo.');
      this.render();
      return;
    }
    const previous = structuredClone(this.remote.layout);
    this.busy = true;
    try {
      await this.options.save(layout);
      if (!undo) this.history.push(previous);
      this.remote.layout = structuredClone(layout);
      this.error = '';
      this.draft = undefined;
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
      this.render();
    }
  }
  private edit(id?: string): void {
    if (!this.remote || this.busy) return;
    if (this.draft && this.suspended && (id ? this.draft.id === id : this.isNew)) {
      this.suspended = false;
      this.render();
      return;
    }
    this.isNew = !id;
    this.suspended = false;
    this.alignedX = undefined;
    this.draft = id
      ? structuredClone(layoutOf(this.remote).find(w => w.id === id))
      : {
          id: uniqueId(layoutOf(this.remote), 'piece'),
          type: 'button',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          buttons: [''],
          label: null,
          icon: null,
        };
    this.baseline = JSON.stringify(this.draft);
    this.render();
  }
  private async removePiece(id: string): Promise<void> {
    const p = layoutOf(this.remote!).find(p => p.id === id);
    const name = p?.label ?? this.remote?.buttons.find(b => b.id === p?.buttons[0])?.name ?? t('Control');
    if (
      await confirmDialog(this.root, {
        title: t('¿Quitar «{name}» del control?', { name }),
        message: t('El botón y sus acciones se conservan.'),
        confirm: t('Quitar'),
      })
    )
      await this.commit(layoutOf(this.remote!).filter(w => w.id !== id));
  }
  private inspector(): string {
    const piece = this.draft;
    if (!piece || !this.options || this.suspended) return '';
    const [min, max] = WIDGET_BUTTONS[piece.type];
    const choices =
      piece.type === 'control'
        ? (this.options.controls ?? [])
        : this.remote!.buttons.map(b => ({ id: b.id, label: b.name }));
    const count = Math.max(min, piece.buttons.length);
    const slots = Array.from({ length: count }, (_, i) => {
      const label =
        piece.type === 'button' || piece.type === 'control'
          ? t('Botón')
          : piece.type === 'updown'
            ? [t('Bajar (-)'), t('Subir (+)')][i]
            : piece.type === 'toggle'
              ? [t('Encender (o el que alterna)'), t('Apagar (opcional)')][i]
              : t('Paso {number}', { number: i + 1 });
      return `<label>${e(label)}<select name="slot-${i}" data-slot-index="${i}" aria-label="${e(label)}"><option value="">${e(t('Elegí un botón'))}</option>${choices.map(c => `<option value="${e(c.id)}"${piece.buttons[i] === c.id ? ' selected' : ''}>${e(c.label)}</option>`).join('')}</select></label>${count > min ? `<button type="button" data-remove-slot="${i}">${e(t('Quitar paso'))}</button>` : ''}`;
    }).join('');
    const size = (key: 'w' | 'h', label: string, max: number) =>
      `<label>${e(label)}<select name="widget-${key}">${Array.from({ length: max }, (_, i) => `<option${piece[key] === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label>`;
    const types = (Object.keys(WIDGET_BUTTONS) as WidgetType[]).filter(k => k !== 'control' || this.options?.controls);
    return rfWidgetDialog(
      this.isNew ? t('Agregar elemento') : t('Editar elemento'),
      `
      <div class="inspector"><div class="types" role="group" aria-label="${e(t('Tipo'))}">${types.map(type => `<button type="button" data-type="${type}" aria-pressed="${piece.type === type}">${e(widgetLabel(type))}</button>`).join('')}</div>
      <p>${e(widgetHelp(piece.type))}</p><div class="slots">${slots}</div>${count < max ? `<button type="button" data-command="add-slot">${e(t('Agregar paso'))}</button>` : ''}
      <label>${e(t('Etiqueta (opcional)'))}<input name="widget-label" maxlength="40" value="${e(piece.label ?? '')}"></label>
      ${iconPicker(piece.icon ?? '', t('Icono (opcional)'), 'name="widget-icon" clearable')}
      ${
        piece.type === 'indicator'
          ? `<label>${e(t('Lectura que muestra'))}<select name="reading"><option value="">${e(t('Sin lectura'))}</option>${Object.keys(
              this.options.readValues?.() ?? {},
            )
              .map(
                id =>
                  `<option value="${e(id)}"${id === piece.reading ? ' selected' : ''}>${e(String(this.options?.readValues?.()[id]?.attributes?.friendly_name ?? id.replace(/^[^.]+\./, '').replace(/_/g, ' ')))}</option>`,
              )
              .join(
                '',
              )}</select></label><label>${e(t('Atributo (avanzado)'))}<input name="attribute" maxlength="80" value="${e(piece.attribute ?? '')}"></label>${this.options.estimated ? `<p>${e(t('Este valor es estimado; RF no confirma el estado físico.'))}</p>` : ''}`
          : ''
      }
      <div class="size">${size('w', t('Ancho'), 4)}${size('h', t('Alto'), 3)}</div>
      <div class="toolbar" aria-label="${e(t('Alinear'))}"><button type="button" data-align="left">${e(t('Izquierda'))}</button><button type="button" data-align="center">${e(t('Centro'))}</button><button type="button" data-align="right">${e(t('Derecha'))}</button></div>
      <p class="error-text" role="alert">${e(this.error)}</p></div>`,
      `<button type="button" data-command="widget-cancel">${e(t('Cancelar'))}</button><button type="button" data-command="widget-save">${e(t('Guardar'))}</button>`,
    );
  }
  private render(): void {
    if (!this.remote || !this.options) return;
    this.root.innerHTML = `<div class="toolbar"><button type="button" data-command="add-widget"${this.busy ? ' disabled' : ''}>${e(t('Agregar elemento'))}</button><button type="button" data-command="auto-layout">${e(t('Diseño automático'))}</button><button type="button" data-undo${!this.history.length || this.busy ? ' disabled' : ''}>${e(t('Deshacer diseño'))}</button><button type="button" data-preview aria-pressed="${this.preview}">${e(t('Vista previa'))}</button></div><p>${e(t('Arrastrá para mover; usá la esquina para cambiar el tamaño. Flechas para mover, Mayús y flechas para tamaño.'))}</p><div class="canvas"></div><p class="error-text" role="status">${e(this.error)}</p>${this.inspector()}`;
    this.canvas.estimated = this.options.estimated;
    this.canvas.preview = true;
    this.canvas.readValues = this.options.readValues;
    this.canvas.renderContent = this.options.renderContent;
    this.canvas.remote = this.remote;
    this.canvas.editing = !this.preview;
    this.root.querySelector('.canvas')!.append(this.canvas);
    this.root.querySelector('[data-command=add-widget]')?.addEventListener('click', () => this.edit());
    this.root.querySelector('[data-preview]')?.addEventListener('click', () => {
      this.preview = !this.preview;
      this.render();
    });
    this.root.querySelector('[data-undo]')?.addEventListener('click', () => {
      const layout = this.history.at(-1);
      if (layout !== undefined)
        void this.commit(layout, true).then(() => {
          if (!this.error) this.history.pop();
          this.render();
        });
    });
    this.root.querySelector('[data-command=auto-layout]')?.addEventListener('click', async () => {
      if (
        await confirmDialog(this.root, {
          title: t('¿Volver al diseño automático?'),
          message: t('Se reemplaza sólo la disposición; los botones y acciones se conservan.'),
          confirm: t('Volver'),
        })
      )
        await this.commit(null);
    });
    this.bindInspector();
  }
  private bindInspector(): void {
    if (!this.draft) return;
    const dialog = this.root.querySelector<TaskScreen>('homemanager-task-screen.editor');
    const read = () => {
      if (!this.draft) return;
      const value = (name: string) => this.root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? '';
      this.draft.label = value('widget-label') || null;
      this.draft.icon = value('widget-icon') || null;
      this.draft.w = Number(value('widget-w'));
      this.draft.h = Number(value('widget-h'));
      this.root
        .querySelectorAll<HTMLSelectElement>('[data-slot-index]')
        .forEach(s => (this.draft!.buttons[Number(s.dataset.slotIndex)] = s.value));
      if (value('reading')) this.draft.reading = value('reading');
      else delete this.draft.reading;
      if (value('attribute')) this.draft.attribute = value('attribute');
      else delete this.draft.attribute;
    };
    if (dialog) {
      dialog.onBack = () => {
        read();
        this.suspended = true;
        this.render();
      };
      dialog.show(this.root);
    }
    this.root.querySelectorAll<HTMLButtonElement>('[data-type]').forEach(b =>
      b.addEventListener('click', () => {
        read();
        const type = b.dataset.type as WidgetType;
        const [min, max] = WIDGET_BUTTONS[type];
        this.draft!.type = type;
        this.draft!.buttons = this.draft!.buttons.slice(0, max);
        while (this.draft!.buttons.length < min) this.draft!.buttons.push('');
        [this.draft!.w, this.draft!.h] = WIDGET_SIZE[type];
        this.render();
      }),
    );
    this.root.querySelector('[data-command=add-slot]')?.addEventListener('click', () => {
      read();
      this.draft!.buttons.push('');
      this.render();
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-remove-slot]').forEach(b =>
      b.addEventListener('click', () => {
        read();
        this.draft!.buttons.splice(Number(b.dataset.removeSlot), 1);
        this.render();
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-align]').forEach(b =>
      b.addEventListener('click', () => {
        read();
        this.draft!.x =
          b.dataset.align === 'left'
            ? 0
            : b.dataset.align === 'right'
              ? 4 - this.draft!.w
              : Math.floor((4 - this.draft!.w) / 2);
        this.alignedX = this.draft!.x;
        this.render();
      }),
    );
    this.root.querySelector('[data-command=widget-cancel]')?.addEventListener('click', async () => {
      read();
      if (
        JSON.stringify(this.draft) !== this.baseline &&
        !(await confirmDialog(this.root, {
          title: t('¿Descartar los cambios?'),
          message: t('Los cambios de esta pantalla todavía no se aplicaron.'),
          confirm: t('Descartar cambios'),
        }))
      )
        return;
      this.draft = undefined;
      this.error = '';
      this.render();
    });
    this.root.querySelector('[data-command=widget-save]')?.addEventListener('click', () => {
      read();
      const p = this.draft!;
      p.buttons = p.buttons.filter(Boolean);
      if (p.buttons.length < WIDGET_BUTTONS[p.type][0]) {
        this.error = t('Elegí al menos {count} botones.', { count: WIDGET_BUTTONS[p.type][0] });
        this.render();
        return;
      }
      const layout = layoutOf(this.remote!);
      let next = this.isNew
        ? add(layout, p)
        : place(
            layout.map(w => (w.id === p.id ? p : w)),
            p.id,
            p,
          );
      if (this.isNew && this.alignedX !== undefined) next = place(next, p.id, { x: this.alignedX });
      if (rows(next) > 40) {
        this.error = t('No queda espacio en el lienzo.');
        this.render();
        return;
      }
      void this.commit(next);
    });
  }
}
if (!customElements.get('homemanager-control-designer'))
  customElements.define('homemanager-control-designer', ControlDesigner);
