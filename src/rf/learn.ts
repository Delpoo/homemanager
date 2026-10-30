import { t } from '../i18n/index.js';
import { escapeHTML as e, type Hass } from '../card/types.js';
import { installPanelComponents, panelIconAction } from '../ui/panel-components.js';
import { rfLearnStyles, rfText } from '../ui/rf-components.js';
import { ROLES, rf, type RfAbout, type RfCandidate, type RfRemote, type RfTransmitter } from '../integration/rf.js';
import { BUTTON_ICONS, buttonSuggestions, icon, roleLabel, iconLabel } from './catalog.js';

/** Learning buttons, in any order. The receiver listens while this panel is
 * open; each code heard is shown as it arrives, with why it is or is not
 * trusted yet. A trusted code can be tried (with the remote's settings, or the
 * measured ones for a new remote) and saved with a name, an icon and,
 * optionally, a role in a fan or light. When a try fails, one setting changes
 * at a time, and each attempt says what changed.
 *
 * A new remote (`draft`) is stored with its first button: its transmission
 * settings come from that code. */

interface Attempt {
  transmitter: string;
  pulse_us: number;
  repeats: number;
  reason: string;
  worked: boolean | null;
}

// The receiver's window is renewed while the panel stays open, up to this long.
const LISTEN_MS = 10 * 60 * 1000;
const WINDOW_SECONDS = 60;
// A "signal not recognised" notice stays this long after the last one.
const NOISE_MS = 3000;

export class HomeManagerRfLearn extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  hass?: Hass;
  /** The remote buttons are added to; null while it is a draft. */
  remote: RfRemote | null = null;
  draft: RfAbout | null = null;
  transmitters: RfTransmitter[] = [];
  /** Called with the remote id after every saved button. */
  onSaved?: (remoteId: string) => void;
  onClose?: () => void;

  private listen = '';
  private listening = false;
  private until = 0;
  private stopCapture: (() => void) | null = null;
  private candidate: RfCandidate | null = null;
  private noiseAt = 0;
  private name = '';
  private glyph = '';
  private assign = '';
  private trial: Attempt | null = null;
  private attempts: Attempt[] = [];
  private message = '';
  private failed = false;

  constructor() {
    super();
    installPanelComponents(this.root, 'rf-learn', rfLearnStyles, false);
  }

  /** Starts listening with this receiver. */
  start(receiver: string): void {
    this.listen = receiver;
    this.until = Date.now() + LISTEN_MS;
    this.reset();
    this.render();
    void this.capture();
  }

  /** Closes the receiver's window. The host calls it when the panel closes. */
  stop(): void {
    this.until = 0;
    const stop = this.stopCapture;
    this.stopCapture = null;
    this.listening = false;
    try {
      stop?.();
    } catch {
      /* the window may already be closed */
    }
  }

  private reset(): void {
    this.candidate = null;
    this.trial = null;
    this.attempts = [];
    this.name = '';
    this.glyph = '';
    this.assign = '';
  }

  private transmitterName(id: string): string {
    return rfText(this.transmitters.find(item => item.id === id)?.name, t('Receptor'));
  }

  private async capture(): Promise<void> {
    if (!this.hass || !this.listen) return;
    const stop = this.stopCapture;
    this.stopCapture = null;
    try {
      stop?.();
    } catch {
      /* already closed */
    }
    this.listening = true;
    try {
      this.stopCapture = await rf.capture(this.hass, this.listen, WINDOW_SECONDS, event => {
        if (event.done) {
          this.listening = false;
          this.stopCapture = null;
          if (Date.now() < this.until) void this.capture();
        } else if (event.noise) {
          this.noiseAt = Date.now();
          window.setTimeout(() => this.isConnected && this.render(), NOISE_MS + 50);
        } else if (event.candidate) {
          const next = event.candidate;
          // A code under test stays; another code replaces an untested one.
          if (this.trial && this.candidate?.candidate_id !== next.candidate_id) return;
          if (this.candidate?.candidate_id !== next.candidate_id) {
            this.trial = null;
            this.attempts = [];
          }
          this.candidate = next;
        }
        this.render();
      });
    } catch (error) {
      this.listening = false;
      this.report(error);
    }
    this.render();
  }

  private report(error: unknown): void {
    const code = (error as { code?: string })?.code;
    const message = (error as { message?: string })?.message;
    this.failed = true;
    this.message =
      code === 'invalid_code'
        ? t('Esta señal no coincide con las de este control. ¿Es del mismo control?')
        : code === 'candidate_not_found'
          ? t('La lectura venció. Pulsá el botón otra vez.')
          : message
            ? t('Home Assistant rechazó la operación: {message}', { message })
            : t('Algo falló.');
  }
  private say(message: string): void {
    this.failed = false;
    this.message = message;
  }

  // Rendering -------------------------------------------------------------

  private render(): void {
    const active = this.root.activeElement as HTMLInputElement | null;
    const focused = active?.name,
      caret = active?.selectionStart ?? null;
    const receivers = this.transmitters.filter(item => item.can_capture);
    const options = receivers
      .map(
        item =>
          `<option value="${e(item.id)}"${item.id === this.listen ? ' selected' : ''}>${e(rfText(item.name))}</option>`,
      )
      .join('');
    const status = `<p class="status${this.failed ? ' error' : ''}" role="status">${e(this.message)}</p>`;
    this.root.innerHTML = `<section class="sheet" aria-labelledby="learn-title"><div class="head"><h3 id="learn-title">${e(t('Aprender botones'))}</h3>${panelIconAction(t('Listo'), 'data-command="close"', 'mdi:check')}</div>
<label>${e(t('Escucha'))}<select name="listen">${options}</select></label>
${this.renderListen()}${this.candidate ? this.renderCandidate() : ''}${status}</section>`;
    this.bind();
    if (focused) {
      const field = this.root.querySelector<HTMLInputElement>(`[name="${CSS.escape(focused)}"]`);
      field?.focus();
      if (field && caret !== null && field.type === 'text') field.setSelectionRange(caret, caret);
    }
  }

  private renderListen(): string {
    const c = this.candidate;
    const receiver = this.transmitterName(this.listen);
    let dot = this.listening ? 'on' : '',
      title: string,
      detail: string;
    if (!this.listening) {
      title = t('El receptor dejó de escuchar.');
      detail = '';
    } else if (c?.confirmed) {
      dot = 'ok';
      title = t('Señal reconocida');
      detail =
        c.confirmed_by === 'frames'
          ? t('{frames} señales iguales en una pulsación.', { frames: c.burst_frames })
          : t('La misma señal en {bursts} pulsaciones.', { bursts: c.bursts });
    } else if (c) {
      dot = 'warn';
      title = t('Recibido, falta repetir');
      detail = t('{frames} señal(es). Mantené pulsado un momento o pulsalo otra vez.', { frames: c.frames });
    } else if (Date.now() - this.noiseAt < NOISE_MS) {
      dot = 'warn';
      title = t('Llega señal, pero no se reconoce');
      detail = t('Acercá el control a {receiver} o probá con otro receptor.', { receiver });
    } else {
      title = t('Pulsá un botón del control');
      detail = t('Cualquiera, en el orden que quieras. Escucha {receiver}.', { receiver });
    }
    const resume = this.listening ? '' : `<button type="button" data-command="listen">${e(t('Escuchar'))}</button>`;
    return `<div class="listen"><span class="pulse ${dot}" aria-hidden="true"></span><div class="text"><strong>${e(title)}</strong>${detail ? `<span class="muted">${e(detail)}</span>` : ''}</div>${resume}</div>`;
  }

  private roleOptions(): string {
    const parts = this.remote?.parts ?? [];
    if (!parts.length) return '';
    const name = (id: string) => this.remote?.buttons.find(button => button.id === id)?.name ?? t('Botón');
    const groups = parts
      .map(part => {
        const highest = Object.keys(part.roles).reduce(
          (max, role) => Math.max(max, Number(/^speed_(\d+)$/.exec(role)?.[1] ?? 0)),
          0,
        );
        const visible = ROLES[part.kind].filter(role => {
          const level = Number(/^speed_(\d+)$/.exec(role)?.[1] ?? 0);
          return !level || level <= Math.max(6, highest + 1);
        });
        const options = visible
          .map(role => {
            const value = `${part.id}:${role}`;
            const now = part.roles[role] ? ` · ${t('ahora: {name}', { name: name(part.roles[role]) })}` : '';
            return `<option value="${e(value)}"${value === this.assign ? ' selected' : ''}>${e(roleLabel(role) + now)}</option>`;
          })
          .join('');
        return `<optgroup label="${e(rfText(part.name))}">${options}</optgroup>`;
      })
      .join('');
    return `<label>${e(t('En Home Assistant (opcional)'))}<select name="role"><option value="">${e(t('Botón suelto'))}</option>${groups}</select></label>`;
  }

  private renderCandidate(): string {
    const c = this.candidate!;
    const badge = c.confirmed
      ? `<span class="badge ok">✓ ${e(t('Lista para aprender'))}</span>`
      : `<span class="badge warn">${e(t('Sin confirmar'))}</span>`;
    const details = `<details class="signal-details"><summary>${e(t('Detalles de la señal'))}</summary><p class="muted">${e(t('Tipo {protocol} · tamaño {bits} · pulso medido de la señal: {pulse} µs', { protocol: c.protocol, bits: c.nbits, pulse: c.pulse_us }))}</p></details>`;
    const known = c.known_as.length
      ? `<p class="muted">${e(t('Ya está guardado como: {names}', { names: c.known_as.map(value => rfText(value)).join(', ') }))}</p>`
      : '';
    if (!c.confirmed) return `<div class="code">${badge}${details}${known}</div>`;
    const suggestions = buttonSuggestions()
      .map(
        ([label, glyph]) =>
          `<button type="button" data-suggest="${e(label)}" data-icon="${e(glyph)}" aria-pressed="${label === this.name}">${e(label)}</button>`,
      )
      .join('');
    const icons = BUTTON_ICONS.map(
      glyph =>
        `<button type="button" data-glyph="${e(glyph)}" aria-pressed="${glyph === this.glyph}" aria-label="${e(iconLabel(glyph))}" title="${e(iconLabel(glyph))}">${icon(glyph) || e(glyph.slice(4, 6))}</button>`,
    ).join('');
    const form = `<label>${e(t('Nombre del botón'))}<input name="name" maxlength="80" value="${e(this.name)}" placeholder="${e(t('p. ej. Luz, Velocidad 3, Tono'))}"></label>
<div class="chips" role="group" aria-label="${e(t('Sugerencias de nombre'))}">${suggestions}</div>
<div class="chips icons" role="group" aria-label="${e(t('Icono'))}">${icons}</div>${this.roleOptions()}`;
    let action: string;
    if (this.trial) {
      action = `<div class="question"><p><strong>${e(t('¿El equipo reaccionó?'))}</strong></p><p class="muted">${e(t('Enviado por {transmitter} · {pulse} µs · {repeats} repeticiones', { transmitter: this.transmitterName(this.trial.transmitter), pulse: this.trial.pulse_us, repeats: this.trial.repeats }))}</p><div class="row"><button type="button" data-variant="primary" data-command="worked"${this.name.trim() ? '' : ' disabled'}>${e(t('Sí, guardar'))}</button><button type="button" data-command="failed">${e(t('No reaccionó'))}</button></div></div>`;
    } else {
      action = `<div class="row"><button type="button" data-variant="primary" data-command="try">${e(t('Probar'))}</button><button type="button" data-command="save"${this.name.trim() ? '' : ' disabled'}>${e(t('Guardar sin probar'))}</button></div>`;
    }
    const attempts = this.attempts.length
      ? `<ul class="attempts" aria-label="${e(t('Pruebas'))}">${this.attempts.map(item => `<li>${item.worked ? '✓' : '✗'} ${e(item.reason)} · ${e(t('{transmitter} · {pulse} µs · {repeats} repeticiones', { transmitter: this.transmitterName(item.transmitter), pulse: item.pulse_us, repeats: item.repeats }))}</li>`).join('')}</ul>`
      : '';
    return `<div class="code">${badge}${details}${known}${form}${action}${attempts}</div>`;
  }

  // Events --------------------------------------------------------------

  private bind(): void {
    const root = this.root;
    root
      .querySelectorAll<HTMLButtonElement>('[data-command]')
      .forEach(button => button.addEventListener('click', () => void this.command(button.dataset.command!)));
    root.querySelector<HTMLSelectElement>('select[name=listen]')?.addEventListener('change', event => {
      this.listen = (event.target as HTMLSelectElement).value;
      this.until = Date.now() + LISTEN_MS;
      this.reset();
      void this.capture();
    });
    root.querySelector<HTMLInputElement>('input[name=name]')?.addEventListener('input', event => {
      this.name = (event.target as HTMLInputElement).value;
      root
        .querySelectorAll<HTMLButtonElement>('[data-command=save],[data-command=worked]')
        .forEach(button => (button.disabled = !this.name.trim()));
    });
    root.querySelectorAll<HTMLButtonElement>('[data-suggest]').forEach(button =>
      button.addEventListener('click', () => {
        this.name = button.dataset.suggest!;
        this.glyph = button.dataset.icon!;
        this.render();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-glyph]').forEach(button =>
      button.addEventListener('click', () => {
        this.glyph = this.glyph === button.dataset.glyph ? '' : button.dataset.glyph!;
        this.render();
      }),
    );
    root
      .querySelector<HTMLSelectElement>('select[name=role]')
      ?.addEventListener('change', event => (this.assign = (event.target as HTMLSelectElement).value));
  }

  private async command(name: string): Promise<void> {
    try {
      switch (name) {
        case 'close':
          this.stop();
          this.onClose?.();
          return;
        case 'listen':
          this.until = Date.now() + LISTEN_MS;
          await this.capture();
          break;
        case 'try':
          await this.tryAttempt(this.firstAttempt());
          break;
        case 'failed':
          await this.nextVariant();
          break;
        case 'worked':
          await this.save(this.trial);
          break;
        case 'save':
          await this.save(null);
          break;
      }
    } catch (error) {
      this.report(error);
    }
    this.render();
  }

  /** A remote's buttons use its settings; a new remote starts from the measure. */
  private firstAttempt(): Attempt {
    const remote = this.remote,
      c = this.candidate!;
    return remote
      ? {
          transmitter: remote.transmitter,
          pulse_us: remote.pulse_us,
          repeats: remote.repeats,
          reason: t('Ajustes del control'),
          worked: null,
        }
      : { transmitter: this.listen, pulse_us: c.pulse_us, repeats: 5, reason: t('Pulso medido'), worked: null };
  }

  private async tryAttempt(attempt: Attempt): Promise<void> {
    await rf.test(this.hass!, this.candidate!.candidate_id, {
      transmitter: attempt.transmitter,
      pulse_us: attempt.pulse_us,
      repeats: attempt.repeats,
      wait_us: this.remote?.wait_us ?? 0,
    });
    this.trial = attempt;
    this.say(t('Señal enviada. Mirá el equipo.'));
  }

  /** One change at a time: other transmitters, then the neighbouring pulse
   * lengths, then more repeats. Combinations already tried are skipped. */
  private async nextVariant(): Promise<void> {
    if (this.trial) this.attempts.push({ ...this.trial, worked: false });
    const base = this.firstAttempt();
    const tried = (item: Attempt) =>
      this.attempts.some(
        done =>
          done.transmitter === item.transmitter && done.pulse_us === item.pulse_us && done.repeats === item.repeats,
      );
    const variants: Attempt[] = [
      ...this.transmitters.map(item => ({
        ...base,
        transmitter: item.id,
        reason: t('Otro transmisor: {name}', { name: rfText(item.name) }),
      })),
      { ...base, pulse_us: base.pulse_us + 50, reason: t('Pulso más largo (+50 µs)') },
      { ...base, pulse_us: Math.max(50, base.pulse_us - 50), reason: t('Pulso más corto (−50 µs)') },
      { ...base, repeats: 10, reason: t('Más repeticiones') },
      ...this.transmitters.map(item => ({
        ...base,
        transmitter: item.id,
        repeats: 10,
        reason: t('{name} con más repeticiones', { name: rfText(item.name) }),
      })),
    ];
    const next = variants.find(item => !tried(item));
    this.trial = null;
    if (!next) {
      this.failed = true;
      this.message = t(
        'Ninguna combinación funcionó. Acercá el transmisor al equipo, o aprendé el botón de nuevo con el control cerca del receptor.',
      );
      return;
    }
    await this.tryAttempt(next);
  }

  private async save(trial: Attempt | null): Promise<void> {
    const hass = this.hass!,
      c = this.candidate!;
    const name = this.name.trim();
    let remote = this.remote;
    let note = '';
    if (!remote) {
      // The first button fixes the remote's settings: what worked, or the measure.
      const settings = trial ?? this.firstAttempt();
      remote = await rf.saveRemote(hass, {
        name: this.draft?.name ?? name,
        icon: this.draft?.icon ?? null,
        description: this.draft?.description ?? null,
        transmitter: settings.transmitter,
        protocol: c.protocol,
        nbits: c.nbits,
        pulse_us: settings.pulse_us,
        repeats: settings.repeats,
        wait_us: 0,
        measured_pulse_us: c.pulse_us,
      });
      this.remote = remote;
      this.draft = null;
    } else if (
      trial &&
      (trial.transmitter !== remote.transmitter ||
        trial.pulse_us !== remote.pulse_us ||
        trial.repeats !== remote.repeats)
    ) {
      // What worked now becomes the remote's setting, for every button.
      remote = await rf.saveRemote(
        hass,
        { name: remote.name, transmitter: trial.transmitter, pulse_us: trial.pulse_us, repeats: trial.repeats },
        remote.id,
      );
      this.remote = remote;
      note = ` ${t('El control ahora usa {transmitter} · {pulse} µs · {repeats} repeticiones.', { transmitter: this.transmitterName(trial.transmitter), pulse: trial.pulse_us, repeats: trial.repeats })}`;
    }
    const [part, role] = this.assign ? this.assign.split(':') : [];
    await rf.saveButton(
      hass,
      remote.id,
      { name, icon: this.glyph || null },
      { candidateId: c.candidate_id, ...(part && role ? { role: { part, role } } : {}) },
    );
    this.reset();
    this.say(t('«{name}» guardado. Pulsá el siguiente botón.', { name }) + note);
    this.onSaved?.(remote.id);
  }
}

if (!customElements.get('homemanager-rf-learn')) customElements.define('homemanager-rf-learn', HomeManagerRfLearn);
