import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { installPanelComponents } from '../ui/panel-components.js';
import { rfText, remoteCell, positionRemoteWidget } from '../ui/rf-components.js';
import type { RfButton, RfWidget } from '../integration/rf.js';
import type { DrawableRemote } from './layout.js';
import { MAX_HEIGHT, MAX_ROWS, buttonById, columnsOf, layoutOf, overlaps, place, rows } from './layout.js';
import {
  drawnPieces,
  gridOf,
  levelCount,
  levelFromReading,
  levelSends,
  levelText,
  readingValue,
  formatReading,
  sendByOf,
  stepLevel,
  type ControlPiece,
} from '../model/control-layout.js';
import {
  bodyVars,
  keyClasses,
  keyContent,
  keyStyles,
  historyChart,
  chartSource,
  chartFace,
  type KeyContext,
  keyWidget,
  remoteShell,
  remoteViewStyles,
} from '../ui/remote-keys.js';
import { controlViewStyles } from '../ui/control-view.js';
import { PERIOD_HOURS, type ChartPeriod, type HistorySample, type HistorySeries } from '../integration/history.js';

/** A designed control drawn as a remote: its pieces on their grid (0.13).
 *
 * In use, a key sends its learned button(s) and gives way under the finger; levels,
 * modes and switches remember what was sent (or follow a reading, when they have one).
 * Nothing claims a physical state beyond that: RF and IR are one-way.
 * In edit mode a piece is dragged to move it, its handles resize it, a tap chooses it;
 * with the keyboard, arrows move it, Shift+arrows resize it, Enter edits and Delete
 * removes. The host persists changes (onLayout) and owns the editors. */

const ROW = 64;
const GAP = 10;
type Box = Pick<RfWidget, 'x' | 'y' | 'w' | 'h'>;
type State = { levels: Record<string, number>; options: Record<string, number>; toggles: Record<string, boolean> };
const LEVEL_PIECES = ['updown', 'slider', 'steps', 'knob'];
const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

export class HomeManagerRfRemote extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private _remote: DrawableRemote | null = null;
  private _editing = false;
  private drag: {
    ids: string[];
    mode: 'move' | 'resize';
    edges: string;
    pointer: number;
    start: [number, number];
    boxes: Map<string, Box>;
    moved: boolean;
  } | null = null;
  /** Sends a button; rejects when Home Assistant refuses. */
  onPress?: (buttonId: string) => Promise<unknown>;
  /** A changed layout in edit mode, ready to save. */
  onLayout?: (layout: RfWidget[]) => void;
  onEdit?: (widgetId: string) => void;
  onDelete?: (widgetId: string) => void;
  /** Designer: a tap chooses a piece (Shift adds it); empty space lets go. */
  onSelect?: (widgetId: string | null, add: boolean) => void;
  onDuplicate?: (widgetIds: string[]) => void;
  /** HA adapter: an existing control kept as a piece is drawn by its own renderer. */
  renderContent?: (widget: RfWidget) => HTMLElement | null;
  readValues?: () => Record<string, { state: string; attributes?: Record<string, unknown> }>;
  estimated = true;
  preview = false;
  private _selected: string[] = [];
  private state: State = { levels: {}, options: {}, toggles: {} };
  /** Recent numeric readings of each chart, newest last (only while open). */
  private charts = new Map<string, {
    key: string; series?: HistorySeries; live: HistorySample[]; loading: boolean; retryAt: number;
  }>();
  /** 0.13: a chart's past, from Home Assistant's recorder; the host knows how to ask. */
  history?: (entityId: string, period: ChartPeriod, attribute?: string) => Promise<HistorySeries>;
  private holdTimer = 0;
  private held = false;

  constructor() {
    super();
    installPanelComponents(
      this.root,
      'rf-remote-view',
      remoteViewStyles(ROW, GAP) + keyStyles + controlViewStyles,
      false,
    );
  }

  set remote(remote: DrawableRemote | null) {
    if (remote?.id !== this._remote?.id) {
      this.state = this.loadState(remote?.id);
      this.charts.clear();
    }
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
  set selected(ids: string[]) {
    this._selected = [...ids];
    this.markSelection();
  }
  get selected(): string[] {
    return this._selected;
  }

  private layout(): RfWidget[] {
    return this._remote ? layoutOf(this._remote) : [];
  }
  private columns(): number {
    return columnsOf(this.layout());
  }

  // What each piece is at -------------------------------------------------

  private storeKey(id = this._remote?.id): string {
    return `homemanager-remote-state:${id ?? ''}`;
  }
  private loadState(id?: string): State {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storeKey(id)) ?? 'null') as State | null;
      if (saved && typeof saved === 'object')
        return { levels: saved.levels ?? {}, options: saved.options ?? {}, toggles: saved.toggles ?? {} };
    } catch {
      /* a private window keeps it only while open */
    }
    return { levels: {}, options: {}, toggles: {} };
  }
  private saveState(): void {
    try {
      localStorage.setItem(this.storeKey(), JSON.stringify(this.state));
    } catch {
      /* a private window keeps it only while open */
    }
  }
  private entity(piece: ControlPiece) {
    return piece.reading ? this.readValues?.()[piece.reading] : undefined;
  }
  private context(remote: DrawableRemote): KeyContext {
    return {
      name: ref => rfText(buttonById(remote, ref)?.name ?? t('Botón')),
      icon: ref => buttonById(remote, ref)?.icon ?? null,
      level: piece => {
        const entity = this.entity(piece);
        if (entity) {
          const value = piece.attribute ? String(entity.attributes?.[piece.attribute] ?? '') : entity.state;
          const level = levelFromReading(piece, value);
          if (level !== null) return level;
        }
        return this.state.levels[piece.id] ?? -1;
      },
      on: piece => {
        const entity = this.entity(piece);
        if (entity) return ['on', 'true', 'open', 'playing', 'home'].includes(entity.state.toLowerCase());
        return this.state.toggles[piece.id] ?? false;
      },
      option: piece => {
        const entity = this.entity(piece);
        if (entity) {
          const value = (
            piece.attribute ? String(entity.attributes?.[piece.attribute] ?? '') : entity.state
          ).toLowerCase();
          const index = piece.buttons.findIndex(
            (ref, j) => (piece.options?.[j]?.label ?? buttonById(remote, ref)?.name ?? '').toLowerCase() === value,
          );
          if (index >= 0) return index;
        }
        return this.state.options[piece.id] ?? -1;
      },
      reading: piece => {
        const raw = readingValue(piece, this.readValues?.());
        const chart = piece.chart;
        const digits = chart?.digits;
        const number = raw.trim() ? Number(raw) : NaN;
        const value = digits !== undefined && Number.isFinite(number)
          ? new Intl.NumberFormat(undefined, chart?.precision === 'significant'
              ? { maximumSignificantDigits: Math.max(1, digits) }
              : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(number)
          : formatReading(raw);
        const unit = chart?.unit ?? (piece.attribute ? '' : String(this.entity(piece)?.attributes?.unit_of_measurement ?? ''));
        return { value, unit: value === '—' ? '' : unit };
      },
      samples: () => [],
      chart: piece => this.chart(piece),
    };
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
    this.loadHistory(layout);
    const columns = this.columns();
    const grid = gridOf(all);
    const height = Math.max(1, grid.rows ?? rows(all) + (this._editing ? 1 : 0));
    const cells = this._editing
      ? Array.from({ length: height * columns }, (_, index) =>
          remoteCell((index % columns) + 1, Math.floor(index / columns) + 1),
        ).join('')
      : '';
    const ctx = this.context(remote);
    const widgets = layout.map(widget => this.renderWidget(widget, ctx)).join('');
    const empty = layout.length ? '' : `<p class="empty">${e(t('Este control todavía no tiene botones.'))}</p>`;
    const look = bodyVars(all.find(piece => piece.type === 'canvas'));
    const gap = columns <= 6 ? 10 : columns <= 12 ? 6 : 3;
    this.root.innerHTML = remoteShell(look, this._editing, columns, gap, `${cells}${widgets}${empty}`);
    for (const widget of layout) {
      if (widget.type !== 'control') continue;
      const content = this.renderContent?.(widget);
      if (content) this.root.querySelector(`[data-content="${CSS.escape(widget.id)}"]`)?.append(content);
    }
    this.bind();
    this.markSelection();
    this.onState?.();
  }

  /** Told after every redraw, so whoever shows the state elsewhere (a ring on the plan) follows. */
  onState?: () => void;
  /** How far up its levels a piece is, from 0 to 1; null when it has no levels or nothing is known. */
  levelShare(pieceId: string): number | null {
    const remote = this._remote;
    const piece = this.piece(pieceId);
    if (!remote || !piece || !LEVEL_PIECES.includes(piece.type)) return null;
    const count = levelCount(piece);
    const level = this.context(remote).level(piece);
    if (count < 2 || level < 0) return null;
    return level / (count - 1);
  }

  private chart(piece: RfWidget) {
    const entry = this.charts.get(piece.id);
    const to = Date.now();
    const from = to - PERIOD_HOURS[piece.period ?? '24h'] * 3600000;
    const samples = [...(entry?.series?.samples ?? []), ...(entry?.live ?? [])]
      .filter(point => point.at >= from);
    return {
      from, to, samples,
      status: entry?.loading ? 'loading' as const :
        entry?.retryAt || this.entity(chartSource(piece))?.state === 'unavailable' ? 'offline' as const : 'ready' as const,
    };
  }

  private loadHistory(layout: RfWidget[]): void {
    const active = new Set(layout.filter(piece => chartSource(piece).reading).map(piece => piece.id));
    for (const id of this.charts.keys()) if (!active.has(id)) this.charts.delete(id);
    for (const piece of layout) {
      const { reading, attribute } = chartSource(piece);
      if (!reading) continue;
      const key = JSON.stringify([reading, piece.period ?? '24h', attribute]);
      const previous = this.charts.get(piece.id);
      const entry = previous?.key === key ? previous : { key, live: [], loading: false, retryAt: 0 };
      this.charts.set(piece.id, entry);
      if (!this.history || entry.loading || entry.series || entry.retryAt > Date.now()) continue;
      entry.loading = true;
      void this.history(reading, piece.period ?? '24h', attribute)
        .then(series => { entry.series = series; entry.retryAt = 0; })
        .catch(() => { entry.retryAt = Date.now() + 15000; })
        .finally(() => {
          entry.loading = false;
          if (this.charts.get(piece.id) !== entry) return;
          const current = this.piece(piece.id);
          if (current) this.updateChart(current);
        });
    }
  }

  private updateChart(piece: RfWidget): void {
    const target = this.root.querySelector<HTMLElement>(`[data-spark="${CSS.escape(piece.id)}"]`);
    if (target) target.innerHTML = historyChart(piece, this.chart(piece));
  }

  private renderWidget(widget: RfWidget, ctx: KeyContext): string {
    const on = widget.type === 'toggle' && ctx.on(widget);
    const content =
      widget.type === 'control' && this.renderContent
        ? `<div class="kembed" data-content="${e(widget.id)}"></div>`
        : keyContent(widget, ctx);
    const label = widget.label ?? widget.buttons.map(id => ctx.name(id)).join(' / ');
    const designer = this.hasAttribute('data-designer');
    const tools =
      this._editing && !designer
        ? `<div class="tools"><button type="button" data-edit="${e(widget.id)}" aria-label="${e(t('Editar {name}', { name: label }))}" title="${e(t('Editar'))}">✎</button><button type="button" class="remove" data-remove="${e(widget.id)}" aria-label="${e(t('Eliminar {name}', { name: label }))}" title="${e(t('Eliminar'))}">✕</button></div><span class="resize se" data-resize="se" title="${e(t('Arrastrá para cambiar el tamaño'))}"></span>`
        : this._editing
          ? `<span class="resize e" data-resize="e" aria-hidden="true"></span><span class="resize s" data-resize="s" aria-hidden="true"></span><span class="resize se" data-resize="se" aria-hidden="true"></span>`
          : '';
    const editable = this._editing
      ? ` tabindex="0" role="group" aria-roledescription="${e(t('elemento movible'))}" aria-label="${e(rfText(label))}"`
      : '';
    const withChart = widget.type !== 'graph' && !!widget.chart?.reading;
    return keyWidget(widget, keyClasses(widget, on) + (withChart ? ' key-with-chart' : ''), editable,
      content + (withChart ? chartFace(widget, ctx, true) : ''), tools, this._editing);
  }

  /** The chosen pieces are outlined; one alone gets its handles and mini bar. */
  private markSelection(): void {
    const chosen = new Set(this._selected);
    this.root.querySelectorAll<HTMLElement>('.widget').forEach(node => {
      node.classList.toggle('selected', chosen.has(node.dataset.widget!));
      node.classList.toggle('alone', chosen.size === 1 && chosen.has(node.dataset.widget!));
    });
    this.root.querySelector('.mini')?.remove();
    if (!this._editing || !this.hasAttribute('data-designer') || !chosen.size) return;
    const last = this.root.querySelector<HTMLElement>(`[data-widget="${CSS.escape(this._selected.at(-1)!)}"]`);
    last?.insertAdjacentHTML(
      'beforeend',
      `<div class="mini"><button type="button" data-mini="duplicate" aria-label="${e(t('Duplicar'))}" title="${e(t('Duplicar'))} · Ctrl+D"><ha-icon icon="mdi:content-duplicate"></ha-icon></button><button type="button" class="danger" data-mini="remove" aria-label="${e(t('Quitar'))}" title="${e(t('Quitar'))} · Supr"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button></div>`,
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-mini]').forEach(button => {
      button.addEventListener('pointerdown', event => event.stopPropagation());
      button.addEventListener('click', () => {
        if (button.dataset.mini === 'duplicate') this.onDuplicate?.([...this._selected]);
        else for (const id of this._selected) this.onDelete?.(id);
      });
    });
  }

  // Use mode --------------------------------------------------------------

  private bind(): void {
    const root = this.root;
    if (!this._editing) {
      root.querySelectorAll<HTMLElement>('.widget').forEach(element => {
        element.addEventListener('click', event => this.tap(event, element));
        element.addEventListener('pointerdown', event => this.hold(event, element));
        element.addEventListener('keydown', event => {
          const target = (event.target as HTMLElement).closest<HTMLElement>('[data-op=track]');
          const piece = this.piece(element.dataset.widget!);
          if (!target || !piece) return;
          const max = levelCount(piece) - 1;
          if (max < 0) return;
          const current = Number(target.getAttribute('aria-valuenow'));
          const change = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[event.key];
          const value = event.key === 'Home' ? 0 : event.key === 'End' ? max :
            change === undefined ? null : Math.max(0, Math.min(max, current + change));
          if (value === null) return;
          event.preventDefault();
          target.dataset.v = String(value);
          void this.operate(piece, target, element);
        });
        element.addEventListener('change', event => {
          const select = (event.target as HTMLElement).closest<HTMLSelectElement>('select[data-op=pick]');
          const piece = this.piece(element.dataset.widget!);
          if (select && piece && select.value !== '') void this.chooseOption(piece, Number(select.value), element);
        });
      });
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
    root.querySelector('.grid')?.addEventListener('pointerdown', event => {
      if (!(event.target as HTMLElement).closest('.widget')) this.onSelect?.(null, false);
    });
  }

  private piece(id: string): RfWidget | undefined {
    return this.layout().find(item => item.id === id);
  }

  private say(message: string, error = false): void {
    const live = this.root.querySelector<HTMLElement>('.live');
    if (!live) return;
    live.classList.toggle('error', error);
    live.textContent = message;
  }

  /** Sends in order, one after another; what a piece is at changes only once it went out. */
  private async send(refs: string[], element: HTMLElement | null, name: string): Promise<boolean> {
    if (!refs.length) return false;
    if (this.preview) {
      this.say(t('Vista previa: no se envían comandos.'));
      return false;
    }
    const piece = element ? this.piece(element.dataset.widget!) : undefined;
    element?.classList.remove('failed', 'press', 'flash');
    try {
      for (const [index, ref] of refs.entries()) {
        if (index) await wait(250);
        await this.onPress?.(ref);
      }
      if (element && piece?.anim !== 'none') {
        void element.offsetWidth;
        element.classList.add(piece?.anim === 'flash' ? 'flash' : 'press');
      }
      this.say(t('Enviado: {name}', { name: rfText(name) }));
      return true;
    } catch (error) {
      element?.classList.add('failed');
      this.say(
        t('No se pudo enviar {name}: {message}', {
          name: rfText(name),
          message: (error as { message?: string })?.message ?? '',
        }),
        true,
      );
      return false;
    }
  }

  private names(refs: string[]): string {
    const remote = this._remote;
    return refs.map(ref => (remote && buttonById(remote, ref)?.name) ?? t('Botón')).join(' → ');
  }

  /** Long press: repeats, or sends the other button (0.13). */
  private hold(event: PointerEvent, element: HTMLElement): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-op]');
    const piece = this.piece(element.dataset.widget!);
    window.clearTimeout(this.holdTimer);
    this.held = false;
    if (!target || !piece?.hold || !['press', 'inc', 'dec'].includes(target.dataset.op!)) return;
    const stop = () => {
      window.clearTimeout(this.holdTimer);
      target.removeEventListener('pointerup', stop);
      target.removeEventListener('pointerleave', stop);
      target.removeEventListener('pointercancel', stop);
    };
    target.addEventListener('pointerup', stop);
    target.addEventListener('pointerleave', stop);
    target.addEventListener('pointercancel', stop);
    if (piece.hold === 'other' && piece.holdButton) {
      this.holdTimer = window.setTimeout(() => {
        this.held = true;
        void this.send([piece.holdButton!], element, this.names([piece.holdButton!]));
      }, 550);
      return;
    }
    const repeat = () => {
      this.held = true;
      void this.operate(piece, target, element).then(() => {
        if (target.isConnected || this.root.contains(element)) this.holdTimer = window.setTimeout(repeat, 220);
      });
    };
    this.holdTimer = window.setTimeout(repeat, 450);
  }

  private tap(event: MouseEvent, element: HTMLElement): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-op]');
    const piece = this.piece(element.dataset.widget!);
    if (!target || !piece || target.dataset.op === 'pick') return;
    if (this.held) {
      this.held = false;
      return;
    }
    if (target.dataset.op === 'track') {
      const box = target.getBoundingClientRect();
      const vertical = piece.orientation === 'vertical';
      const share = vertical ? 1 - (event.clientY - box.top) / box.height : (event.clientX - box.left) / box.width;
      target.dataset.v = String(Math.round(Math.max(0, Math.min(1, share)) * Math.max(0, levelCount(piece) - 1)));
    }
    void this.operate(piece, target, element);
  }

  private async operate(piece: RfWidget, target: HTMLElement, element: HTMLElement): Promise<void> {
    const op = target.dataset.op!;
    const value = Number(target.dataset.v);
    const ctx = this.context(this._remote!);
    const label = piece.label ?? this.names(piece.buttons.slice(0, 1));
    switch (op) {
      case 'press':
        await this.send(piece.buttons.slice(0, 1), element, label);
        return;
      case 'toggle': {
        const next = !ctx.on(piece);
        const ref = piece.buttons.length > 1 && !next ? piece.buttons[1] : piece.buttons[0];
        if (await this.send([ref], element, this.names([ref]))) {
          this.state.toggles[piece.id] = next;
          this.saveState();
          this.render();
        }
        return;
      }
      case 'preset':
        await this.runPreset(piece, element);
        return;
      case 'slot': {
        const ref = piece.slots?.[target.dataset.v ?? ''];
        if (ref) await this.send([ref], element, this.names([ref]));
        return;
      }
      case 'mode':
        await this.chooseOption(piece, value, element);
        return;
      case 'cycle': {
        const current = ctx.option(piece);
        const next = current < 0 ? 0 : (current + 1) % piece.buttons.length;
        await this.chooseOption(piece, next, element);
        return;
      }
      case 'inc':
      case 'dec':
      case 'set':
      case 'track':
        await this.moveLevel(piece, op, value, element);
        return;
    }
  }

  private async chooseOption(piece: RfWidget, index: number, element: HTMLElement): Promise<void> {
    const ref = piece.buttons[index];
    if (!ref) return;
    const name = piece.options?.[index]?.label ?? this.names([ref]);
    if (await this.send([ref], element, name)) {
      this.state.options[piece.id] = index;
      this.saveState();
      this.render();
    }
  }

  /** A level piece: up, down or straight to a level; it stops at the ends unless it wraps. */
  private async moveLevel(piece: RfWidget, op: string, value: number, element: HTMLElement): Promise<void> {
    const ctx = this.context(this._remote!);
    const count = levelCount(piece);
    const current = ctx.level(piece);
    const mode = sendByOf(piece);
    let target: number;
    if (op === 'inc' || op === 'dec') {
      const delta = op === 'inc' ? 1 : -1;
      if (current < 0) {
        // Nothing known yet: one press says which way; a level of its own starts at the first.
        if (mode === 'level') target = 0;
        else {
          const ref = mode === 'advance' ? piece.buttons[0] : op === 'inc' ? piece.buttons[1] : piece.buttons[0];
          await this.send([ref], element, this.names([ref]));
          return;
        }
      } else target = stepLevel(piece, current, delta);
      if (target === current) {
        this.say(t('Ya está en el límite'));
        return;
      }
    } else target = Math.max(0, Math.min(Math.max(0, count - 1), value));
    const refs = levelSends(piece, Math.max(0, current), target, op === 'inc' ? 1 : op === 'dec' ? -1 : undefined);
    if (current >= 0 && !refs.length) return;
    const name = count ? `${piece.label ?? ''} ${levelText(piece, target)}`.trim() : this.names(refs);
    if (await this.send(refs.length ? refs : piece.buttons.slice(0, 1), element, name)) {
      if (count) {
        this.state.levels[piece.id] = target;
        this.saveState();
      }
      const restoreTrack = op === 'track' && element.contains(this.root.activeElement);
      this.render();
      if (restoreTrack) {
        this.root.querySelector<HTMLElement>(`[data-widget="${CSS.escape(piece.id)}"] [data-op="track"]`)?.focus();
      }
    }
  }

  /** A sequence sends its steps in order; a pause waits; nothing claims the result. */
  private async runPreset(widget: RfWidget, element: HTMLElement): Promise<void> {
    if (!widget.sequence) return;
    if (this.preview) {
      this.say(t('Vista previa: no se envían comandos.'));
      return;
    }
    element.classList.add('running');
    const name = rfText(widget.label ?? t('Secuencia'));
    try {
      for (const step of widget.sequence) {
        if ('wait' in step) await wait(step.wait);
        else
          for (let time = 0; time < (step.times ?? 1); time++) {
            await this.onPress?.(step.button);
            await wait(250);
          }
      }
      this.say(t('Enviado: {name}', { name }));
    } catch (error) {
      this.say(
        t('No se pudo enviar {name}: {message}', { name, message: (error as { message?: string })?.message ?? '' }),
        true,
      );
    } finally {
      element.classList.remove('running');
    }
  }

  updateIndicators(): void {
    const remote = this._remote;
    if (!remote) return;
    const layout = this.layout();
    this.loadHistory(layout);
    const ctx = this.context(remote);
    for (const piece of layout) {
      const source = chartSource(piece);
      const raw = readingValue(source, this.readValues?.());
      if (source.reading) {
        const entry = this.charts.get(piece.id);
        const number = raw.trim() ? Number(raw) : NaN;
        const value = Number.isFinite(number) ? number : null;
        if (entry && entry.live.at(-1)?.value !== value) {
          entry.live.push({ at: Date.now(), value });
          entry.live = entry.live.slice(-120);
        }
        this.updateChart(piece);
      }
      const output = this.root.querySelector<HTMLElement>(`[data-reading="${CSS.escape(piece.id)}"]`);
      if (output) {
        const { value, unit } = ctx.reading(piece.chart?.reading ? source : piece);
        output.innerHTML = `${e(value)}${unit ? ` <em>${e(unit)}</em>` : ''}`;
      }
    }
    // Pieces that follow a reading (a switch, a level, a mode) are redrawn when it changes.
    if (this._editing) return;
    const followed = layout.filter(piece => piece.reading && !['indicator', 'graph'].includes(piece.type));
    const stamp = JSON.stringify(
      followed.map(piece => {
        const entity = this.entity(piece);
        return piece.attribute ? entity?.attributes?.[piece.attribute] : entity?.state;
      }),
    );
    if (followed.length && stamp !== this.followStamp) {
      this.followStamp = stamp;
      this.render();
    }
  }
  private followStamp = '';

  // Edit mode -------------------------------------------------------------

  /** The cell under a point, for dropping on the grid (0.13). */
  cellAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const grid = this.root.querySelector<HTMLElement>('.grid');
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom + 80) return null;
    const [x, y] = this.cell({ clientX, clientY });
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
    if (event.button !== 0 || target.closest('.tools,.mini')) return;
    const id = element.dataset.widget!;
    const widget = this.piece(id);
    if (!widget) return;
    const designer = this.hasAttribute('data-designer');
    const handle = target.closest<HTMLElement>('[data-resize]');
    if (designer && !handle) {
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        this.onSelect?.(id, true);
        return;
      }
    }
    // Chosen when let go: choosing redraws the designer, which would drop the drag.
    const choose = designer && !handle && !this._selected.includes(id);
    const ids = designer && !handle && this._selected.includes(id) ? [...this._selected] : [id];
    const boxes = new Map(
      ids
        .map(item => this.piece(item))
        .filter((item): item is RfWidget => !!item)
        .map(item => [item.id, { x: item.x, y: item.y, w: item.w, h: item.h }]),
    );
    this.drag = {
      ids,
      mode: handle ? 'resize' : 'move',
      edges: handle?.dataset.resize ?? '',
      pointer: event.pointerId,
      start: this.cell(event),
      boxes,
      moved: false,
    };
    element.setPointerCapture(event.pointerId);
    event.preventDefault();
    let latest = new Map(boxes);
    const move = (moveEvent: PointerEvent) => {
      const drag = this.drag;
      if (!drag || moveEvent.pointerId !== drag.pointer) return;
      const [cx, cy] = this.cell(moveEvent);
      const dx = cx - drag.start[0],
        dy = cy - drag.start[1];
      const next = new Map<string, Box>();
      for (const [key, box] of drag.boxes)
        next.set(
          key,
          drag.mode === 'move'
            ? {
                ...box,
                x: Math.max(0, Math.min(this.columns() - box.w, box.x + dx)),
                y: Math.max(0, Math.min(MAX_ROWS - box.h, box.y + dy)),
              }
            : {
                ...box,
                w: drag.edges.includes('e') ? Math.max(1, Math.min(this.columns() - box.x, box.w + dx)) : box.w,
                h: drag.edges.includes('s') ? Math.max(1, Math.min(MAX_HEIGHT, box.h + dy)) : box.h,
              },
        );
      if ([...next].every(([key, box]) => JSON.stringify(box) === JSON.stringify(latest.get(key)))) return;
      latest = next;
      drag.moved = true;
      for (const [key, box] of next) {
        const node = this.root.querySelector<HTMLElement>(`[data-widget="${CSS.escape(key)}"]`);
        if (!node) continue;
        node.classList.add('dragging');
        positionRemoteWidget(node, box);
      }
    };
    const end = (endEvent: PointerEvent) => {
      const drag = this.drag;
      if (!drag || endEvent.pointerId !== drag.pointer) return;
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', end);
      element.removeEventListener('pointercancel', end);
      this.drag = null;
      if (endEvent.type === 'pointercancel') this.render();
      else if (drag.moved) this.commitMany(latest);
      else if (!designer && drag.mode === 'move') this.onEdit?.(id);
      else if (!choose) this.render();
      if (choose) this.onSelect?.(id, false);
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
  }

  private key(event: KeyboardEvent, id: string): void {
    if (event.target !== event.currentTarget) return;
    const widget = this.piece(id);
    if (!widget) return;
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const designer = this.hasAttribute('data-designer');
    if (event.key === 'Enter' || event.key === ' ') {
      if (designer) this.onSelect?.(id, event.shiftKey);
      else this.onEdit?.(id);
    } else if (event.key === 'Delete' || event.key === 'Backspace') this.onDelete?.(id);
    else if ((event.key === 'd' || event.key === 'D') && (event.ctrlKey || event.metaKey) && designer)
      this.onDuplicate?.(this._selected.includes(id) ? [...this._selected] : [id]);
    else if (step[event.key]) {
      const [dx, dy] = step[event.key];
      const ids = designer && this._selected.includes(id) && !event.shiftKey ? this._selected : [id];
      const boxes = new Map<string, Box>();
      for (const item of ids) {
        const piece = this.piece(item);
        if (!piece) continue;
        boxes.set(
          item,
          event.shiftKey
            ? { x: piece.x, y: piece.y, w: piece.w + dx, h: piece.h + dy }
            : { x: piece.x + dx, y: piece.y + dy, w: piece.w, h: piece.h },
        );
      }
      this.commitMany(boxes);
      this.root.querySelector<HTMLElement>(`[data-widget="${CSS.escape(id)}"]`)?.focus();
    } else return;
    event.preventDefault();
  }

  /** One piece pushes what it lands on down; several move together only onto free cells. */
  private commitMany(boxes: Map<string, Box>): void {
    const remote = this._remote;
    if (!remote) return;
    let layout = layoutOf(remote);
    if (boxes.size === 1) {
      const [[id, box]] = [...boxes];
      layout = place(layout, id, box);
    } else {
      const columns = this.columns();
      const others = drawnPieces(layout).filter(piece => !boxes.has(piece.id));
      const fits = [...boxes.values()].every(
        box =>
          box.x >= 0 &&
          box.y >= 0 &&
          box.w >= 1 &&
          box.x + box.w <= columns &&
          box.y + box.h <= MAX_ROWS &&
          !others.some(piece => overlaps(piece, box)),
      );
      if (fits) layout = layout.map(piece => (boxes.has(piece.id) ? { ...piece, ...boxes.get(piece.id)! } : piece));
    }
    // Shown at once; the host saves it and sends back the stored remote.
    this._remote = { ...remote, layout };
    this.render();
    this.onLayout?.(layout);
  }
}

if (!customElements.get('homemanager-rf-remote')) customElements.define('homemanager-rf-remote', HomeManagerRfRemote);
