import { t } from '../i18n/index.js';
import { escapeHTML as esc, type Configuration, type Device, type DeviceControl, type Hass } from '../card/types.js';
import { cycleIndex, nextIndex, sliderSource, stepLabel } from '../card/device-controls.js';
import { commandFor, type Command } from '../panels/controls.js';

/**
 * Draws one device control, full size (panel) or compact (next to the symbol
 * on the plan). It never calls Home Assistant itself: the host runs steps and
 * values through the adapter and reports what was sent.
 */
export interface ControlHost {
  configuration: Configuration;
  device: Device;
  hass(): Hass | undefined;
  availability(actionId: string): { available: boolean; reason?: string };
  /** Sends one step; the host remembers it as the current one. Resolves to an
   * error message when it was not sent. */
  run(control: DeviceControl, index: number): Promise<string | null>;
  remembered(control: DeviceControl): number | undefined;
  /** Slider without steps: the value command for its entity. */
  sendValue(control: DeviceControl, entityId: string, command: Command): Promise<string | null>;
  valueAvailability(entityId: string, command: Command): { available: boolean; reason?: string };
  /** Reason text for an unavailable control. */
  reason(code?: string): string;
}

export const controlViewStyles = `
.cv{display:grid;gap:8px}
.cv-title{font-size:14px;font-weight:500;display:flex;justify-content:space-between;gap:8px}
.cv-title output{color:var(--hm-muted);font-variant-numeric:tabular-nums}
.cv-row{display:flex;flex-wrap:wrap;gap:6px}
.cv-row>button{flex:1 1 auto;min-width:64px;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.cv-row>button[aria-pressed=true]{background:var(--hm-accent);border-color:var(--hm-accent);color:var(--hm-on-accent)}
.cv-row ha-icon{--mdc-icon-size:20px}
.cv-updown{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.cv-stops{display:flex;gap:4px;padding:4px;border-radius:999px;background:var(--hm-surface);touch-action:none;user-select:none}
.cv-stops button{flex:1 1 0;min-width:0;min-height:40px;border:0;border-radius:999px;background:transparent;font-weight:600;color:var(--hm-muted);padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cv-stops button[aria-pressed=true]{background:var(--hm-accent);color:var(--hm-on-accent)}
.cv-stops button.preview{outline:2px solid var(--hm-accent);outline-offset:-2px}
.cv input[type=range]{width:100%}
.cv.compact{display:flex;gap:4px;align-items:center}
.cv.compact>button,.cv.compact .cv-updown button{width:34px;height:34px;min-height:34px;min-width:34px;padding:0;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:600;background:var(--hm-bg);border:1px solid var(--hm-line)}
.cv.compact>button.text{width:auto;border-radius:999px;padding:0 10px;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cv.compact ha-icon{--mdc-icon-size:18px}
.cv.compact .cv-updown{grid-template-columns:1fr;gap:2px}
.cv.compact .cv-updown button{width:30px;height:24px;min-height:24px;border-radius:8px}
.cv.compact .cv-row>button{min-width:0;min-height:30px;padding:0 8px;border-radius:999px;font-size:12px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cv-track{position:relative;border-radius:999px;background:var(--hm-surface);border:1px solid var(--hm-line);touch-action:none;cursor:pointer;overflow:hidden}
.cv-track.vertical{width:30px;height:88px}
.cv-track.horizontal{width:104px;height:30px}
.cv-fill{position:absolute;left:0;bottom:0;background:color-mix(in srgb,var(--hm-accent) 55%,transparent);pointer-events:none}
.cv-track.vertical .cv-fill{width:100%}
.cv-track.horizontal .cv-fill{height:100%;top:0}
.cv-track:focus-visible{outline:3px solid var(--hm-accent);outline-offset:2px}
.cv-track[aria-disabled=true]{opacity:.5;cursor:default}
`;

const icon = (name?: string) =>
  name && customElements.get('ha-icon') ? `<ha-icon icon="${esc(name)}"></ha-icon>` : '';

export class ControlView {
  readonly element = document.createElement('div');
  private pending = false;
  /** Slider: the fraction (0..1) the user is dragging, null when idle. */
  private dragging: number | null = null;

  constructor(
    readonly control: DeviceControl,
    private readonly host: ControlHost,
    private readonly compact: boolean,
  ) {
    this.element.className = `cv${compact ? ' compact' : ''}`;
    this.element.dataset.control = control.id;
    this.render();
  }

  private label(index: number): string {
    return stepLabel(this.control, index, this.host.configuration);
  }
  private current(): number {
    const { control, host } = this;
    if (control.type === 'cycle') return cycleIndex(control, host.configuration, host.hass(), host.remembered(control));
    return host.remembered(control) ?? -1;
  }

  private render(): void {
    const { control } = this;
    const name = esc(control.label);
    const title = this.compact ? '' : `<div class="cv-title"><span>${name}</span><output></output></div>`;
    const steps = control.steps;
    let body = '';
    if (control.type === 'button') {
      const glyph = icon(steps[0]?.icon);
      body = this.compact
        ? `<button type="button" data-step="0" class="${glyph ? '' : 'text'}" aria-label="${name}" title="${name}">${glyph || name}</button>`
        : `<div class="cv-row"><button type="button" data-step="0">${glyph}${esc(this.label(0))}</button></div>`;
    } else if (control.type === 'cycle') {
      body = this.compact
        ? `<button type="button" data-next class="${steps.some(step => step.icon) ? '' : 'text'}"></button>`
        : `<div class="cv-row" role="group" aria-label="${name}">${steps.map((step, index) => `<button type="button" data-step="${index}">${icon(step.icon)}${esc(this.label(index))}</button>`).join('')}</div>`;
    } else if (control.type === 'updown') {
      body = `<div class="cv-updown"><button type="button" data-step="0" aria-label="${esc(t('{label}: {step}', { label: control.label, step: this.label(0) }))}" title="${esc(this.label(0))}">${this.compact ? '▲' : `▲ ${esc(this.label(0))}`}</button><button type="button" data-step="1" aria-label="${esc(t('{label}: {step}', { label: control.label, step: this.label(1) }))}" title="${esc(this.label(1))}">${this.compact ? '▼' : `▼ ${esc(this.label(1))}`}</button></div>`;
    } else if (control.type === 'select') {
      body = `<div class="cv-row" role="group" aria-label="${name}">${steps.map((step, index) => `<button type="button" data-step="${index}" title="${esc(this.label(index))}">${icon(step.icon)}${esc(this.label(index))}</button>`).join('')}</div>`;
    } else if (!this.compact && steps.length) {
      body = `<div class="cv-stops" role="group" aria-label="${name}">${steps.map((step, index) => `<button type="button" data-step="${index}" aria-label="${esc(this.label(index))}">${esc(step.label ?? String(index + 1))}</button>`).join('')}</div>`;
    } else if (!this.compact) {
      body = `<input type="range" aria-label="${name}">`;
    } else {
      const orientation = control.orientation ?? 'vertical';
      body = `<div class="cv-track ${orientation}" role="slider" tabindex="0" aria-label="${name}" aria-orientation="${orientation}"><div class="cv-fill"></div></div>`;
    }
    this.element.innerHTML = title + body;
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('button[data-step]'))
      button.addEventListener('click', event => {
        // Stops of a slider send on release (pointer); a click with detail 0 is the keyboard.
        if (control.type === 'slider' && (event as MouseEvent).detail !== 0) return;
        void this.run(Number(button.dataset.step));
      });
    this.element.querySelector('button[data-next]')?.addEventListener('click', () => {
      void this.run(nextIndex(control, this.current()));
    });
    const stops = this.element.querySelector<HTMLElement>('.cv-stops');
    if (stops) this.bindStops(stops);
    const range = this.element.querySelector<HTMLInputElement>('input[type=range]');
    if (range)
      range.addEventListener('change', () => {
        void this.sendValue(Number(range.value));
      });
    const track = this.element.querySelector<HTMLElement>('.cv-track');
    if (track) this.bindTrack(track);
    this.refresh();
  }

  /** Live values and availability; cheap, called on every state change. */
  refresh(): void {
    const { control, host } = this;
    const current = this.current();
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('button[data-step]')) {
      const index = Number(button.dataset.step);
      const availability = host.availability(control.steps[index]?.actionId ?? '');
      button.disabled = this.pending || !availability.available;
      button.title = availability.available ? this.label(index) : host.reason(availability.reason);
      if (control.type !== 'button' && control.type !== 'updown')
        button.setAttribute('aria-pressed', String(index === current));
    }
    const next = this.element.querySelector<HTMLButtonElement>('button[data-next]');
    if (next) {
      const upcoming = nextIndex(control, current);
      const shown = current >= 0 ? control.steps[current] : undefined;
      const availability = host.availability(control.steps[upcoming]?.actionId ?? '');
      next.disabled = this.pending || !availability.available;
      next.innerHTML = icon(shown?.icon ?? control.steps[upcoming]?.icon) || esc(this.label(upcoming));
      const text = t('{label}: tocar envía {step}', { label: control.label, step: this.label(upcoming) });
      next.setAttribute('aria-label', text);
      next.title = availability.available ? text : host.reason(availability.reason);
    }
    const source = sliderSource(control, host.device, id => host.hass()?.states[id]);
    const output = this.element.querySelector('output');
    const range = this.element.querySelector<HTMLInputElement>('input[type=range]');
    const track = this.element.querySelector<HTMLElement>('.cv-track');
    if (range || track) {
      const { min, max, step, value } = this.bounds(source);
      const probe = source ? this.command(source, value ?? max) : null;
      const availability = source && probe ? host.valueAvailability(source.entityId, probe) : { available: false };
      if (range) {
        range.min = String(min);
        range.max = String(max);
        range.step = String(step);
        if (value !== null && this.element.ownerDocument.activeElement !== range) range.value = String(value);
        range.disabled = this.pending || !availability.available;
      }
      if (track) {
        track.setAttribute('aria-valuemin', String(min));
        track.setAttribute('aria-valuemax', String(max));
        if (value !== null) track.setAttribute('aria-valuenow', String(value));
        track.setAttribute('aria-disabled', String(this.pending || !availability.available));
        if (this.dragging === null) this.fill(track, value === null || max === min ? 0 : (value - min) / (max - min));
      }
      if (output)
        output.textContent =
          value === null
            ? '—'
            : `${value}${source?.control.kind === 'range' && source.control.unit ? ` ${source.control.unit}` : ''}`;
      if (!availability.available && 'reason' in availability && track)
        track.title = host.reason(availability.reason as string);
    } else if (output) output.textContent = current >= 0 && control.type !== 'button' ? this.label(current) : '';
    if (track && control.steps.length) {
      const fraction = current < 0 ? 0 : (current + 1) / control.steps.length;
      if (this.dragging === null) this.fill(track, fraction);
      const availability = host.availability(control.steps[0]?.actionId ?? '');
      track.setAttribute('aria-disabled', String(this.pending || !availability.available));
      track.setAttribute('aria-valuemin', '1');
      track.setAttribute('aria-valuemax', String(control.steps.length));
      if (current >= 0) track.setAttribute('aria-valuetext', this.label(current));
    }
  }

  private bounds(source: ReturnType<typeof sliderSource>): {
    min: number;
    max: number;
    step: number;
    value: number | null;
  } {
    if (!source) return { min: 0, max: 100, step: 1, value: null };
    const control = source.control;
    if (control.kind === 'range')
      return { min: control.min, max: control.max, step: control.step, value: control.value };
    return { min: control.off ? 0 : 1, max: control.count, step: 1, value: control.value };
  }
  private command(source: NonNullable<ReturnType<typeof sliderSource>>, value: number): Command {
    return commandFor(source.control, source.control.kind === 'steps' ? Math.round(value) : value);
  }

  private fill(track: HTMLElement, fraction: number): void {
    const fill = track.querySelector<HTMLElement>('.cv-fill')!;
    const percent = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    if (track.classList.contains('vertical')) fill.style.height = percent;
    else fill.style.width = percent;
  }

  private async run(index: number): Promise<void> {
    if (this.pending || !this.control.steps[index]) return;
    this.pending = true;
    this.refresh();
    try {
      await this.host.run(this.control, index);
    } finally {
      this.pending = false;
      if (this.element.isConnected) this.refresh();
    }
  }
  private async sendValue(value: number): Promise<void> {
    const source = sliderSource(this.control, this.host.device, id => this.host.hass()?.states[id]);
    if (!source || this.pending) return;
    this.pending = true;
    this.refresh();
    try {
      await this.host.sendValue(this.control, source.entityId, this.command(source, value));
    } finally {
      this.pending = false;
      if (this.element.isConnected) this.refresh();
    }
  }

  /** Stops: tap any to send it; dragging previews and sends once on release. */
  private bindStops(track: HTMLElement): void {
    let preview: number | null = null;
    const at = (x: number) => {
      let best: number | null = null,
        distance = Infinity;
      for (const button of track.querySelectorAll<HTMLButtonElement>('[data-step]')) {
        const rect = button.getBoundingClientRect(),
          gap = Math.abs(x - (rect.left + rect.width / 2));
        if (gap < distance) [best, distance] = [Number(button.dataset.step), gap];
      }
      return best;
    };
    const mark = (index: number | null) => {
      preview = index;
      for (const button of track.querySelectorAll<HTMLButtonElement>('[data-step]'))
        button.classList.toggle('preview', Number(button.dataset.step) === index);
    };
    track.addEventListener('pointerdown', event => {
      if (event.button !== 0 || (event.target as HTMLButtonElement).disabled) return;
      track.setPointerCapture?.(event.pointerId);
      mark(at(event.clientX));
    });
    track.addEventListener('pointermove', event => {
      if (preview !== null) mark(at(event.clientX));
    });
    track.addEventListener('pointerup', () => {
      const index = preview;
      mark(null);
      if (index !== null) void this.run(index);
    });
    track.addEventListener('pointercancel', () => mark(null));
  }

  /** Compact slider: drag along the bar, sent once on release; arrows step it. */
  private bindTrack(track: HTMLElement): void {
    const vertical = track.classList.contains('vertical');
    const steps = this.control.steps.length;
    const fractionAt = (event: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      const raw = vertical ? (rect.bottom - event.clientY) / rect.height : (event.clientX - rect.left) / rect.width;
      return Math.max(0, Math.min(1, raw));
    };
    const commit = (fraction: number) => {
      if (steps) void this.run(Math.max(0, Math.min(steps - 1, Math.ceil(fraction * steps) - 1)));
      else {
        const source = sliderSource(this.control, this.host.device, id => this.host.hass()?.states[id]);
        const { min, max, step } = this.bounds(source);
        void this.sendValue(Math.round((min + fraction * (max - min)) / step) * step);
      }
    };
    track.addEventListener('pointerdown', event => {
      if (event.button !== 0 || track.getAttribute('aria-disabled') === 'true') return;
      event.stopPropagation();
      track.setPointerCapture?.(event.pointerId);
      this.dragging = fractionAt(event);
      this.fill(track, this.dragging);
    });
    track.addEventListener('pointermove', event => {
      if (this.dragging === null) return;
      this.dragging = fractionAt(event);
      this.fill(track, this.dragging);
    });
    track.addEventListener('pointerup', () => {
      const fraction = this.dragging;
      this.dragging = null;
      if (fraction !== null) commit(fraction);
    });
    track.addEventListener('pointercancel', () => {
      this.dragging = null;
      this.refresh();
    });
    track.addEventListener('keydown', event => {
      const delta = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[event.key];
      if (!delta || track.getAttribute('aria-disabled') === 'true') return;
      event.preventDefault();
      event.stopPropagation();
      if (steps) {
        const current = this.current();
        void this.run(Math.max(0, Math.min(steps - 1, (current < 0 ? 0 : current) + delta)));
      } else {
        const source = sliderSource(this.control, this.host.device, id => this.host.hass()?.states[id]);
        const { min, max, step, value } = this.bounds(source);
        const jump = Math.max(step, (max - min) / 10);
        void this.sendValue(Math.max(min, Math.min(max, (value ?? min) + delta * jump)));
      }
    });
  }
}
