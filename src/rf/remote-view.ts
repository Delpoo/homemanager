import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { installPanelComponents } from '../ui/panel-components.js';
import {
  rfRemoteStyles,
  rfText,
  remoteCell,
  remoteWidget,
  positionRemoteWidget,
  remoteGrid,
  remoteBody,
  remotePieceStyles,
  knobDial,
  sparkline,
} from '../ui/rf-components.js';
import type { RfButton, RfWidget } from '../integration/rf.js';
import type { DrawableRemote } from './layout.js';
import { MAX_HEIGHT, MAX_ROWS, buttonById, columnsOf, layoutOf, place, rows } from './layout.js';
import { icon } from './catalog.js';
import { drawnPieces, readingValue } from '../model/control-layout.js';
import { controlViewStyles } from '../ui/control-view.js';

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
  private _remote: DrawableRemote | null = null;
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
  /** HA adapter embeds the existing control renderer, preserving service checks. */
  renderContent?: (widget: RfWidget) => HTMLElement | null;
  readValues?: () => Record<string, { state: string; attributes?: Record<string, unknown> }>;
  estimated = true;
  preview = false;
  private sentSteps = new Map<string, number>();
  /** Recent numeric readings of each chart, newest last (only while open). */
  private samples = new Map<string, number[]>();

  constructor() {
    super();
    installPanelComponents(
      this.root,
      'rf-remote-view',
      rfRemoteStyles(4, ROW, GAP) +
        remotePieceStyles +
        controlViewStyles +
        `
      [data-reading]{font-size:24px;font-weight:500;text-align:center;line-height:1.1}
      .content>small,.content>strong{text-align:center}.content>input[type=range]{width:100%;min-width:0;accent-color:var(--hm-brand)}
    `,
      false,
    );
  }

  set remote(remote: DrawableRemote | null) {
    if (remote?.id !== this._remote?.id) this.sentSteps.clear();
    this._remote = remote;
    this.render();
  }
  get remote(): DrawableRemote | null {
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
  private columns(): number {
    return columnsOf(this.layout());
  }

  // Rendering -------------------------------------------------------------

  private render(): void {
    const remote = this._remote;
    if (!remote) {
      this.root.innerHTML = '';
      return;
    }
    const all = this.layout();
    const layout = drawnPieces(all);
    const columns = this.columns();
    const height = Math.max(1, rows(all) + (this._editing ? 1 : 0));
    const cells = this._editing
      ? Array.from({ length: height * columns }, (_, index) =>
          remoteCell((index % columns) + 1, Math.floor(index / columns) + 1),
        ).join('')
      : '';
    const widgets = layout.map(widget => this.renderWidget(remote, widget)).join('');
    const empty = layout.length ? '' : `<p class="empty">${e(t('Este control todavía no tiene botones.'))}</p>`;
    this.root.innerHTML = remoteBody(
      columns,
      `body${this._editing ? ' editing' : ''}`,
      `${remoteGrid(columns, `${cells}${widgets}${empty}`)}<p class="live" role="status" aria-live="polite"></p>`,
    );
    for (const widget of layout) {
      const content = this.renderContent?.(widget);
      if (content) this.root.querySelector(`[data-content="${widget.id}"]`)?.append(content);
    }
    this.bind();
  }

  private name(widget: RfWidget, remote: DrawableRemote): string {
    if (widget.label) return rfText(widget.label);
    return widget.buttons.map(id => buttonById(remote, id)?.name ?? t('Botón')).join(' / ');
  }

  private renderWidget(remote: DrawableRemote, widget: RfWidget): string {
    const buttons = widget.buttons.map(id => buttonById(remote, id)).filter((item): item is RfButton => !!item);
    const send = (button: RfButton, inner: string, label = button.name) =>
      `<button type="button" data-send="${e(button.id)}" aria-label="${e(rfText(label))}">${inner}</button>`;
    // 0.13: an icon or a text can be hidden; the name stays for screen readers.
    const key = (button: RfButton, text: string, glyph: string | null) =>
      `<button type="button" class="key" data-send="${e(button.id)}"${widget.hideLabel ? ` aria-label="${e(rfText(text))}"` : ''}>${widget.hideIcon ? '' : icon(glyph)}${widget.hideLabel ? '' : `<span>${e(rfText(text))}</span>`}</button>`;
    const cap = widget.label && !widget.hideLabel ? `<div class="cap">${e(rfText(widget.label))}</div>` : '';
    let content = '';
    switch (widget.type) {
      case 'indicator':
        content = `${cap}${icon(widget.icon)}<output data-reading="${e(widget.id)}">${e(readingValue(widget, this.readValues?.()))}</output>${this.estimated ? `<small>${e(t('Estimado'))}</small>` : ''}`;
        break;
      case 'title':
        content = `<strong>${icon(widget.icon)}${e(widget.label ?? '')}</strong>`;
        break;
      case 'separator':
        content = '<hr>';
        break;
      case 'knob': {
        const reached = this.sentSteps.get(widget.id) ?? -1;
        const next = buttons[(reached + 1) % buttons.length];
        if (next)
          content = `<button type="button" class="knob" data-send="${e(next.id)}" data-cycle="${e(widget.id)}" aria-label="${e(`${this.name(widget, remote)} · ${next.name}`)}">${knobDial(reached + 1, buttons.length, reached >= 0 ? String(reached + 1) : '–')}</button>${cap}`;
        break;
      }
      case 'preset':
        content = `<button type="button" class="key" data-preset="${e(widget.id)}" aria-label="${e(this.name(widget, remote))}">${widget.hideIcon ? '' : icon(widget.icon ?? 'mdi:playlist-play')}${widget.hideLabel ? '' : `<span>${e(rfText(widget.label ?? t('Preset')))}</span>`}</button>`;
        break;
      case 'graph':
        content = `${cap}<output data-reading="${e(widget.id)}">${e(readingValue(widget, this.readValues?.()))}</output><span data-spark="${e(widget.id)}">${sparkline(this.samples.get(widget.id) ?? [])}</span>`;
        break;
      case 'cycle': {
        const index = ((this.sentSteps.get(widget.id) ?? -1) + 1) % buttons.length;
        const button = buttons[index];
        if (button)
          content = key(button, widget.label ?? button.name, widget.icon ?? button.icon).replace(
            '<button',
            `<button data-cycle="${e(widget.id)}" aria-label="${e(`${widget.label ?? ''} ${button.name}`.trim())}"`,
          );
        break;
      }
      case 'slider':
        content = `${cap}<input type="range" data-discrete="${e(widget.id)}" min="0" max="${buttons.length - 1}" step="1" value="${this.sentSteps.get(widget.id) ?? 0}" aria-label="${e(this.name(widget, remote))}">`;
        break;
      case 'control':
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
          content =
            widget.orientation === 'vertical'
              ? `<div class="updown">${send(up, '+')}<div class="cap">${e(rfText(widget.label ?? `${down.name} / ${up.name}`))}</div>${send(down, '−')}</div>`
              : `<div class="updown">${send(down, '−')}<div class="cap">${e(rfText(widget.label ?? `${down.name} / ${up.name}`))}</div>${send(up, '+')}</div>`;
        break;
      }
      case 'steps':
        content = `${cap}<div class="row">${buttons.map((button, index) => send(button, String(index + 1))).join('')}</div>`;
        break;
      case 'modes':
        content = `${cap}<div class="row">${buttons.map(button => send(button, e(rfText(button.name)))).join('')}</div>`;
        break;
    }
    if (this.renderContent && !['indicator', 'title', 'separator', 'graph', 'preset', 'knob'].includes(widget.type))
      content = `<div data-content="${e(widget.id)}"></div>`;
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
      root.querySelectorAll<HTMLInputElement>('[data-discrete]').forEach(input =>
        input.addEventListener('change', () => {
          const widget = this.layout().find(w => w.id === input.dataset.discrete);
          const index = Number(input.value);
          if (!widget || !widget.buttons[index]) return;
          const button = document.createElement('button');
          button.dataset.send = widget.buttons[index];
          void this.send(button).then(() => this.render());
        }),
      );
      root
        .querySelectorAll<HTMLButtonElement>('[data-send]')
        .forEach(button => button.addEventListener('click', () => void this.send(button)));
      root
        .querySelectorAll<HTMLButtonElement>('[data-preset]')
        .forEach(button => button.addEventListener('click', () => void this.runPreset(button)));
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
    if (this.preview) {
      live.textContent = t('Vista previa: no se envían comandos.');
      return;
    }
    button.classList.remove('sent', 'failed');
    button.disabled = true;
    try {
      await this.onPress?.(id);
      for (const widget of this.layout())
        if (widget.buttons.includes(id)) this.sentSteps.set(widget.id, widget.buttons.indexOf(id));
      button.classList.add('sent');
      live.classList.remove('error');
      live.textContent = t('Enviado: {name}', { name: rfText(name) });
      window.setTimeout(() => button.classList.remove('sent'), 600);
      const cycle = this.layout().find(w => w.id === button.dataset.cycle);
      if (cycle && remote) {
        const next = buttonById(
          remote,
          cycle.buttons[((this.sentSteps.get(cycle.id) ?? -1) + 1) % cycle.buttons.length],
        );
        if (next) {
          button.dataset.send = next.id;
          button.setAttribute('aria-label', `${cycle.label ?? ''} ${next.name}`.trim());
          button.innerHTML = `${icon(cycle.icon ?? next.icon)}<span>${e(rfText(cycle.label ?? next.name))}</span>`;
        }
      }
    } catch (error) {
      button.classList.add('failed');
      live.classList.add('error');
      live.textContent = t('No se pudo enviar {name}: {message}', {
        name,
        message: (error as { message?: string })?.message ?? '',
      });
    } finally {
      button.disabled = false;
    }
  }

  /** A preset sends its steps in order; a pause waits; nothing claims the result. */
  private async runPreset(button: HTMLButtonElement): Promise<void> {
    const widget = this.layout().find(item => item.id === button.dataset.preset);
    const live = this.root.querySelector<HTMLElement>('.live')!;
    if (!widget?.sequence) return;
    if (this.preview) {
      live.textContent = t('Vista previa: no se envían comandos.');
      return;
    }
    const element = button.closest('.widget');
    element?.classList.add('running');
    button.disabled = true;
    try {
      for (const step of widget.sequence) {
        if ('wait' in step) await new Promise(resolve => window.setTimeout(resolve, step.wait));
        else
          for (let time = 0; time < (step.times ?? 1); time++) {
            await this.onPress?.(step.button);
            await new Promise(resolve => window.setTimeout(resolve, 250));
          }
      }
      live.classList.remove('error');
      live.textContent = t('Enviado: {name}', { name: rfText(widget.label ?? t('Preset')) });
    } catch (error) {
      live.classList.add('error');
      live.textContent = t('No se pudo enviar {name}: {message}', {
        name: rfText(widget.label ?? t('Preset')),
        message: (error as { message?: string })?.message ?? '',
      });
    } finally {
      element?.classList.remove('running');
      button.disabled = false;
    }
  }

  updateIndicators(): void {
    for (const piece of this.layout()) {
      const output = this.root.querySelector<HTMLOutputElement>(`[data-reading="${piece.id}"]`);
      const value = readingValue(piece, this.readValues?.());
      if (output) output.textContent = value;
      if (piece.type !== 'graph') continue;
      const number = Number(value);
      if (!Number.isFinite(number)) continue;
      const list = this.samples.get(piece.id) ?? [];
      if (list.at(-1) !== number) list.push(number);
      this.samples.set(piece.id, list.slice(-48));
      const spark = this.root.querySelector<HTMLElement>(`[data-spark="${piece.id}"]`);
      if (spark) spark.innerHTML = sparkline(list);
    }
  }

  // Edit mode -------------------------------------------------------------

  /** The cell under a point, for dropping a learned button on the grid (0.13). */
  cellAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const grid = this.root.querySelector<HTMLElement>('.grid');
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top) return null;
    const [x, y] = this.cell({ clientX, clientY } as PointerEvent);
    return { x, y };
  }

  private cell(event: Pick<PointerEvent, 'clientX' | 'clientY'>): [number, number] {
    const grid = this.root.querySelector<HTMLElement>('.grid')!;
    const rect = grid.getBoundingClientRect();
    const computed = getComputedStyle(grid);
    const columns = this.columns();
    const gap = parseFloat(computed.columnGap) || GAP;
    const row = parseFloat(computed.gridAutoRows) || ROW;
    const column = (rect.width - gap * (columns - 1)) / columns;
    const x = Math.floor((event.clientX - rect.left + gap / 2) / (column + gap));
    const y = Math.floor((event.clientY - rect.top + gap / 2) / (row + gap));
    return [Math.max(0, Math.min(columns - 1, x)), Math.max(0, Math.min(MAX_ROWS - 1, y))];
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
              x: Math.max(0, Math.min(this.columns() - drag.box.w, cx - drag.offset[0])),
              y: Math.max(0, cy - drag.offset[1]),
            }
          : {
              ...drag.box,
              w: Math.max(1, Math.min(this.columns() - drag.box.x, cx - drag.box.x + 1)),
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
