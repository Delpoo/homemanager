import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { installPanelComponents } from '../ui/panel-components.js';
import { rfRemoteStyles, rfText, remoteCell, remoteWidget, positionRemoteWidget } from '../ui/rf-components.js';
import type { RfButton, RfRemote, RfWidget } from '../integration/rf.js';
import { COLUMNS, MAX_HEIGHT, MAX_ROWS, buttonById, layoutOf, place, rows } from './layout.js';
import { icon } from './catalog.js';

/** A remote drawn as a remote: its widgets on a four-column grid.
 *
 * In use, every key sends its button's code and flashes; nothing claims a
 * physical state, because RF is one-way. In edit mode a widget is dragged to
 * move it, its corner resizes it, a tap opens its editor; with the keyboard,
 * arrows move it, Shift+arrows resize it, Enter edits and Delete removes.
 * The host persists changes (onLayout) and owns the editors. */

const ROW = 64;
const GAP = 10;

export class HomeManagerRfRemote extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private _remote: RfRemote | null = null;
  private _editing = false;
  private drag: {
    id: string;
    mode: 'move' | 'resize';
    pointer: number;
    offset: [number, number];
    box: Pick<RfWidget, 'x' | 'y' | 'w' | 'h'>;
    moved: boolean;
  } | null = null;
  /** Sends a button; rejects when Home Assistant refuses. */
  onPress?: (buttonId: string) => Promise<unknown>;
  /** A changed layout in edit mode, ready to save. */
  onLayout?: (layout: RfWidget[]) => void;
  onEdit?: (widgetId: string) => void;
  onDelete?: (widgetId: string) => void;

  constructor() {
    super();
    installPanelComponents(this.root, 'rf-remote-view', rfRemoteStyles(COLUMNS, ROW, GAP), false);
  }

  set remote(remote: RfRemote | null) {
    this._remote = remote;
    this.render();
  }
  get remote(): RfRemote | null {
    return this._remote;
  }
  set editing(editing: boolean) {
    this._editing = editing;
    this.render();
  }
  get editing(): boolean {
    return this._editing;
  }

  private layout(): RfWidget[] {
    return this._remote ? layoutOf(this._remote) : [];
  }

  // Rendering -------------------------------------------------------------

  private render(): void {
    const remote = this._remote;
    if (!remote) {
      this.root.innerHTML = '';
      return;
    }
    const layout = this.layout();
    const height = Math.max(1, rows(layout) + (this._editing ? 1 : 0));
    const cells = this._editing
      ? Array.from({ length: height * COLUMNS }, (_, index) =>
          remoteCell((index % COLUMNS) + 1, Math.floor(index / COLUMNS) + 1),
        ).join('')
      : '';
    const widgets = layout.map(widget => this.renderWidget(remote, widget)).join('');
    const empty = layout.length ? '' : `<p class="empty">${e(t('Este control todavía no tiene botones.'))}</p>`;
    this.root.innerHTML = `<div class="body${this._editing ? ' editing' : ''}"><div class="grid">${cells}${widgets}${empty}</div><p class="live" role="status" aria-live="polite"></p></div>`;
    this.bind();
  }

  private name(widget: RfWidget, remote: RfRemote): string {
    if (widget.label) return rfText(widget.label);
    return widget.buttons.map(id => buttonById(remote, id)?.name ?? t('Botón')).join(' / ');
  }

  private renderWidget(remote: RfRemote, widget: RfWidget): string {
    const buttons = widget.buttons.map(id => buttonById(remote, id)).filter((item): item is RfButton => !!item);
    const send = (button: RfButton, inner: string, label = button.name) =>
      `<button type="button" data-send="${e(button.id)}" aria-label="${e(rfText(label))}">${inner}</button>`;
    const key = (button: RfButton, text: string, glyph: string | null) =>
      `<button type="button" class="key" data-send="${e(button.id)}">${icon(glyph)}<span>${e(rfText(text))}</span></button>`;
    const cap = widget.label ? `<div class="cap">${e(rfText(widget.label))}</div>` : '';
    let content = '';
    switch (widget.type) {
      case 'button': {
        const [button] = buttons;
        if (button) content = key(button, widget.label ?? button.name, widget.icon ?? button.icon);
        break;
      }
      case 'toggle':
        content =
          buttons.length === 1
            ? key(buttons[0], widget.label ?? buttons[0].name, widget.icon ?? buttons[0].icon ?? 'mdi:power')
            : `${cap}<div class="row">${buttons.map(button => send(button, `${icon(button.icon)}${e(rfText(button.name))}`)).join('')}</div>`;
        break;
      case 'updown': {
        const [down, up] = buttons;
        if (down && up)
          content = `<div class="updown">${send(down, '−')}<div class="cap">${e(rfText(widget.label ?? `${down.name} / ${up.name}`))}</div>${send(up, '+')}</div>`;
        break;
      }
      case 'steps':
        content = `${cap}<div class="row">${buttons.map((button, index) => send(button, String(index + 1))).join('')}</div>`;
        break;
      case 'modes':
        content = `${cap}<div class="row">${buttons.map(button => send(button, e(rfText(button.name)))).join('')}</div>`;
        break;
    }
    const label = this.name(widget, remote);

    const tools = this._editing
      ? `<div class="tools"><button type="button" data-edit="${e(widget.id)}" aria-label="${e(t('Editar {name}', { name: label }))}" title="${e(t('Editar'))}">✎</button><button type="button" class="remove" data-remove="${e(widget.id)}" aria-label="${e(t('Eliminar {name}', { name: label }))}" title="${e(t('Eliminar'))}">✕</button></div><span class="resize" data-resize="${e(widget.id)}" title="${e(t('Arrastrá para cambiar el tamaño'))}"></span>`
      : '';
    const editable = this._editing
      ? ` tabindex="0" role="group" aria-roledescription="${e(t('elemento movible'))}" aria-label="${e(rfText(label))}"`
      : '';
    return remoteWidget(widget, editable, content, tools, this._editing);
  }

  // Use mode --------------------------------------------------------------

  private bind(): void {
    const root = this.root;
    if (!this._editing) {
      root
        .querySelectorAll<HTMLButtonElement>('[data-send]')
        .forEach(button => button.addEventListener('click', () => void this.send(button)));
      return;
    }
    root
      .querySelectorAll<HTMLButtonElement>('[data-edit]')
      .forEach(button => button.addEventListener('click', () => this.onEdit?.(button.dataset.edit!)));
    root
      .querySelectorAll<HTMLButtonElement>('[data-remove]')
      .forEach(button => button.addEventListener('click', () => this.onDelete?.(button.dataset.remove!)));
    root.querySelectorAll<HTMLElement>('.widget').forEach(widget => {
      widget.addEventListener('pointerdown', event => this.startDrag(event, widget));
      widget.addEventListener('keydown', event => this.key(event, widget.dataset.widget!));
    });
  }

  private async send(button: HTMLButtonElement): Promise<void> {
    const remote = this._remote;
    const id = button.dataset.send!;
    const name = (remote && buttonById(remote, id)?.name) ?? t('Botón');
    const live = this.root.querySelector<HTMLElement>('.live')!;
    button.classList.remove('sent', 'failed');
    try {
      await this.onPress?.(id);
      button.classList.add('sent');
      live.classList.remove('error');
      live.textContent = t('Enviado: {name}', { name: rfText(name) });
      window.setTimeout(() => button.classList.remove('sent'), 600);
    } catch (error) {
      button.classList.add('failed');
      live.classList.add('error');
      live.textContent = t('No se pudo enviar {name}: {message}', {
        name,
        message: (error as { message?: string })?.message ?? '',
      });
    }
  }

  // Edit mode -------------------------------------------------------------

  private cell(event: PointerEvent): [number, number] {
    const rect = this.root.querySelector<HTMLElement>('.grid')!.getBoundingClientRect();
    const column = (rect.width - GAP * (COLUMNS - 1)) / COLUMNS;
    const x = Math.floor((event.clientX - rect.left + GAP / 2) / (column + GAP));
    const y = Math.floor((event.clientY - rect.top + GAP / 2) / (ROW + GAP));
    return [Math.max(0, Math.min(COLUMNS - 1, x)), Math.max(0, Math.min(MAX_ROWS - 1, y))];
  }

  private startDrag(event: PointerEvent, element: HTMLElement): void {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || target.closest('.tools')) return;
    const widget = this.layout().find(item => item.id === element.dataset.widget);
    if (!widget) return;
    const mode = target.closest('[data-resize]') ? 'resize' : 'move';
    const [x, y] = this.cell(event);
    this.drag = {
      id: widget.id,
      mode,
      pointer: event.pointerId,
      offset: [x - widget.x, y - widget.y],
      box: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
      moved: false,
    };
    element.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const drag = this.drag;
      if (!drag || moveEvent.pointerId !== drag.pointer) return;
      const [cx, cy] = this.cell(moveEvent);
      const box =
        drag.mode === 'move'
          ? {
              ...drag.box,
              x: Math.max(0, Math.min(COLUMNS - drag.box.w, cx - drag.offset[0])),
              y: Math.max(0, cy - drag.offset[1]),
            }
          : {
              ...drag.box,
              w: Math.max(1, Math.min(COLUMNS - drag.box.x, cx - drag.box.x + 1)),
              h: Math.max(1, Math.min(MAX_HEIGHT, cy - drag.box.y + 1)),
            };
      if (box.x === drag.box.x && box.y === drag.box.y && box.w === drag.box.w && box.h === drag.box.h) return;
      drag.box = box;
      drag.moved = true;
      element.classList.add('dragging');
      positionRemoteWidget(element, box);
    };
    const end = (endEvent: PointerEvent) => {
      const drag = this.drag;
      if (!drag || endEvent.pointerId !== drag.pointer) return;
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', end);
      element.removeEventListener('pointercancel', end);
      this.drag = null;
      element.classList.remove('dragging');
      if (endEvent.type === 'pointercancel') this.render();
      else if (drag.moved) this.commit(drag.id, drag.box);
      else if (drag.mode === 'move') this.onEdit?.(drag.id);
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
  }

  private key(event: KeyboardEvent, id: string): void {
    if (event.target !== event.currentTarget) return;
    const widget = this.layout().find(item => item.id === id);
    if (!widget) return;
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (event.key === 'Enter' || event.key === ' ') this.onEdit?.(id);
    else if (event.key === 'Delete' || event.key === 'Backspace') this.onDelete?.(id);
    else if (step[event.key]) {
      const [dx, dy] = step[event.key];
      this.commit(
        id,
        event.shiftKey
          ? { ...widget, w: widget.w + dx, h: widget.h + dy }
          : { ...widget, x: widget.x + dx, y: widget.y + dy },
      );
      this.root.querySelector<HTMLElement>(`[data-widget="${CSS.escape(id)}"]`)?.focus();
    } else return;
    event.preventDefault();
  }

  private commit(id: string, box: Pick<RfWidget, 'x' | 'y' | 'w' | 'h'>): void {
    const remote = this._remote;
    if (!remote) return;
    const layout = place(layoutOf(remote), id, box);
    // Shown at once; the host saves it and sends back the stored remote.
    this._remote = { ...remote, layout };
    this.render();
    this.onLayout?.(layout);
  }
}

if (!customElements.get('homemanager-rf-remote')) customElements.define('homemanager-rf-remote', HomeManagerRfRemote);
