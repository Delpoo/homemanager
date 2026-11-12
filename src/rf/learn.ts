import { iconPicker } from '../ui/icon-picker.js';
import { t } from '../i18n/index.js';
import { escapeHTML as e, type Hass } from '../card/types.js';
import { installPanelComponents, panelIconAction } from '../ui/panel-components.js';
import { rfLearnStyles, rfLearnRingStyles, rfText } from '../ui/rf-components.js';
import { iconButton, miniWave, sidePanelStyles } from '../ui/side-panel.js';
import { ROLES, rf, type RfAbout, type RfCandidate, type RfRemote, type RfTransmitter } from '../integration/rf.js';
import { buttonSuggestions, icon, roleLabel } from './catalog.js';
import { learningProgress } from '../model/learning-progress.js';
import { learningPanelStyles } from '../ui/learning-components.js';
import { SignalPreview } from '../ui/signal-workbench.js';
import { diagnostics } from '../integration/diagnostics.js';

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
  private readonly signal = new SignalPreview();
  hass?: Hass;
  /** The remote buttons are added to; null while it is a draft. */
  remote: RfRemote | null = null;
  draft: RfAbout | null = null;
  transmitters: RfTransmitter[] = [];
  /** Called with the remote id after every saved button. */
  onSaved?: (remoteId: string) => void;
  onClose?: () => void;
  inline = false;
  receiverOnline?: (id: string) => boolean;
  private guided = true;
  private target = '';

  /** An always-visible panel is idle until the user starts a capture. */
  prepare(receiver: string): void {
    this.stop();
    this.readings.clear();
    this.listen = receiver;
    this.target = '';
    this.reset();
    this.render();
  }

  private listen = '';
  private listening = false;
  private until = 0;
  private stopCapture: (() => void) | null = null;
  private captureGeneration = 0;
  private candidate: RfCandidate | null = null;
  private unclassified = '';
  private readonly readings = new Map<string, RfCandidate>();
  private chosenReading = '';
  private noiseAt = 0;
  private name = '';
  private glyph = '';
  private assign = '';
  private trial: Attempt | null = null;
  private testing = false;
  private saving = false;
  private attempts: Attempt[] = [];
  private message = '';
  private failed = false;

  constructor() {
    super();
    installPanelComponents(
      this.root,
      'rf-learn',
      rfLearnStyles + learningPanelStyles + sidePanelStyles + rfLearnRingStyles,
      false,
    );
  }

  /** Starts listening with this receiver. */
  start(receiver: string): void {
    this.readings.clear();
    this.listen = receiver;
    this.until = Date.now() + LISTEN_MS;
    this.reset();
    if (this.guided && this.target.trim()) this.name = this.target.trim();
    this.render();
    void this.capture();
  }

  /** Closes the receiver's window. The host calls it when the panel closes. */
  stop(): void {
    this.until = 0;
    this.captureGeneration += 1;
    const stop = this.stopCapture;
    this.stopCapture = null;
    this.listening = false;
    this.releaseCapture(stop);
  }

  private releaseCapture(stop: (() => void) | null): void {
    try {
      stop?.();
    } catch {
      /* the window may already be closed */
    }
  }

  /** Returning from the parent page keeps the candidate, trial and typed name. */
  resume(): void {
    this.render();
  }

  private reset(): void {
    this.candidate = null;
    this.unclassified = '';
    this.chosenReading = '';
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
    const generation = ++this.captureGeneration;
    const stop = this.stopCapture;
    this.stopCapture = null;
    this.releaseCapture(stop);
    if (this.hass.connection?.connected === false || this.receiverOnline?.(this.listen) === false) {
      this.listening = false;
      this.say(t('El receptor está desconectado. Conectalo y volvé a empezar.'));
      this.render();
      return;
    }
    this.listening = true;
    try {
      const unsubscribe = await rf.capture(
        this.hass,
        this.listen,
        WINDOW_SECONDS,
        event => {
          if (generation !== this.captureGeneration) return;
          if (event.done) {
            this.captureGeneration += 1;
            this.listening = false;
            this.stopCapture = null;
            if (Date.now() < this.until) void this.capture();
          } else if (event.noise) {
            this.noiseAt = Date.now();
            this.unclassified = event.signal_id ?? '';
            window.setTimeout(() => this.isConnected && this.render(), NOISE_MS + 50);
          } else if (event.candidate) {
            const next = event.candidate;
            if (!this.guided && next.confirmed) {
              this.readings.set(next.candidate_id, next);
              if (this.readings.size > 8) this.readings.delete(this.readings.keys().next().value!);
            }
            if (this.chosenReading && this.chosenReading !== next.candidate_id) {
              this.render();
              return;
            }
            if (this.guided && this.candidate?.confirmed && this.candidate.candidate_id !== next.candidate_id) return;
            // A code under test stays; another code replaces an untested one.
            if (this.trial && this.candidate?.candidate_id !== next.candidate_id) return;
            if (this.candidate?.candidate_id !== next.candidate_id) {
              this.trial = null;
              this.attempts = [];
            }
            this.candidate = next;
          }
          this.render();
        },
        true,
      );
      if (generation !== this.captureGeneration) {
        this.releaseCapture(unsubscribe);
        return;
      }
      this.stopCapture = unsubscribe;
    } catch (error) {
      if (generation !== this.captureGeneration) return;
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
    const status = `<p class="status${this.failed ? ' error' : ''}" role="status">${e(this.message)}</p>`;
    const available =
      receivers.some(r => this.receiverOnline?.(r.id) !== false) && this.hass?.connection?.connected !== false;
    const progress = learningProgress(this.candidate);
    // 0.13: the receiver is a big ring to tap; the button to learn is named first in
    // guided mode, any button is taken in free mode. Words live in tooltips.
    const idle = !this.listening && !this.candidate;
    const target =
      this.guided && idle
        ? `<label class="target">${e(t('Botón que querés aprender'))}<input name="target" maxlength="80" value="${e(this.target)}" placeholder="${e(this.nextName())}"></label><button type="button" class="next" data-command="guided-start"${!available ? ' disabled' : ''}>${icon('mdi:access-point')}${e(t('Empezar'))}</button>`
        : '';
    const evidence =
      this.guided && this.candidate
        ? `<div class="evidence" role="status"><label>${e(t('Señales iguales en esta pulsación: {count}', { count: progress.frames }))}<progress max="3" value="${Math.min(3, progress.frames)}"></progress></label><label>${e(t('Pulsaciones separadas: {count}', { count: progress.presses }))}<progress max="2" value="${Math.min(2, progress.presses)}"></progress></label></div>`
        : '';
    const help = !available
      ? `<div class="empty-state">${icon('mdi:access-point-off')}<span>${e(t('No hay un receptor disponible. En Equipos RF, conectá un equipo con el paquete RF y elegilo para aprender.'))}</span><button type="button" class="next" data-open-devices>${e(t('Abrir Equipos RF'))}</button></div>`
      : '';
    const queue =
      !this.guided && (this.readings.size > 1 || (!this.candidate && this.readings.size > 0))
        ? `<label>${e(t('Capturas pendientes'))}<select name="reading"><option value="">${e(t('Última lectura'))}</option>${[...this.readings.values()].map((item, index) => `<option value="${e(item.candidate_id)}"${this.chosenReading === item.candidate_id ? ' selected' : ''}>${e(t('Captura {count}', { count: index + 1 }))} · ${item.nbits} ${e(t('bits'))}</option>`).join('')}</select></label>`
        : '';
    const modes = `<div class="seg modes" role="group" aria-label="${e(t('Modo'))}">${[
      [true, t('Modo guiado'), 'mdi:target'],
      [false, t('Modo libre'), 'mdi:gesture-tap-button'],
    ]
      .map(([guided, label, glyph]) =>
        iconButton(
          label as string,
          glyph as string,
          `aria-pressed="${this.guided === guided}"${this.guided === guided ? '' : ' data-command="learning-mode"'}`,
        ),
      )
      .join('')}</div>`;
    const listeners = receivers
      .map(
        item =>
          `<button type="button" class="chip" data-listen="${e(item.id)}" aria-pressed="${item.id === this.listen}">${icon('mdi:chip')}${e(rfText(item.name))}</button>`,
      )
      .join('');
    this.root.innerHTML = `<section class="sheet learn" aria-label="${e(t('Aprender botones'))}">${modes}${help}
${this.renderListen()}${target}${listeners ? `<div class="row-icon" role="group" aria-label="${e(t('Escucha'))}">${icon('mdi:ear-hearing')}<div class="chips">${listeners}</div></div>` : ''}${evidence}${queue}${this.candidate ? this.renderCandidate() : this.unclassified ? '<div data-signal-preview></div>' : ''}${status}<div class="learn-foot"><span class="grow"></span>${iconButton(t('Listo'), 'mdi:check', 'data-command="close"', 'primary')}</div></section>`;
    this.bind();
    const signalId = this.candidate?.candidate_id ?? this.unclassified;
    if (signalId && this.hass) {
      this.root.querySelector('[data-signal-preview]')?.append(this.signal);
      this.signal.configure(this.hass, { source: 'rf', candidate_id: signalId });
    }
    if (focused) {
      const field = this.root.querySelector<HTMLInputElement>(`[name="${CSS.escape(focused)}"]`);
      field?.focus();
      if (field && caret !== null && field.type === 'text') field.setSelectionRange(caret, caret);
    }
  }

  /** The first suggested name this remote does not use yet. */
  private nextName(): string {
    const used = new Set((this.remote?.buttons ?? []).map(button => button.name));
    return buttonSuggestions().find(([label]) => !used.has(label))?.[0] ?? t('Botón');
  }

  private renderListen(): string {
    const c = this.candidate;
    const receiver = this.transmitterName(this.listen);
    // Guided mode always names the chosen button; free mode accepts any (#64).
    const chosen = this.guided ? this.target.trim() : '';
    let dot = this.listening ? 'on' : '',
      title: string,
      detail: string;
    if (!this.listening) {
      title = this.guided && !this.until ? t('Elegí qué botón vas a aprender.') : t('El receptor dejó de escuchar.');
      detail = '';
    } else if (c?.confirmed) {
      dot = 'ok';
      title = chosen ? t('«{button}» reconocido', { button: chosen }) : t('Señal reconocida');
      detail =
        c.confirmed_by === 'frames'
          ? t('{frames} señales iguales en una pulsación.', { frames: c.burst_frames })
          : t('La misma señal en {bursts} pulsaciones.', { bursts: c.bursts });
    } else if (c) {
      dot = 'warn';
      title = chosen ? t('«{button}» recibido, falta repetir', { button: chosen }) : t('Recibido, falta repetir');
      detail = chosen
        ? t('{frames} señal(es). Mantené pulsado «{button}» un momento o pulsalo otra vez.', {
            frames: c.frames,
            button: chosen,
          })
        : t('{frames} señal(es). Mantené pulsado un momento o pulsalo otra vez.', { frames: c.frames });
    } else if (Date.now() - this.noiseAt < NOISE_MS) {
      dot = 'warn';
      title = t('Llega señal, pero no se reconoce');
      detail = chosen
        ? t('Acercá el control a {receiver} y pulsá «{button}» otra vez, o probá con otro receptor.', {
            receiver,
            button: chosen,
          })
        : t('Acercá el control a {receiver} o probá con otro receptor.', { receiver });
    } else if (chosen) {
      title = t('Pulsá «{button}» en el control', { button: chosen });
      detail = t('Apuntá a {receiver}. Mantené pulsado un momento.', { receiver });
    } else {
      title = t('Pulsá un botón del control');
      detail = t('Cualquiera, en el orden que quieras. Escucha {receiver}.', { receiver });
    }
    const tap = this.listening ? '' : this.guided && !this.until ? '' : ' data-command="listen"';
    const glyph = dot === 'ok' ? 'mdi:check' : dot === 'warn' ? 'mdi:alert-outline' : 'mdi:access-point';
    return `<div class="listen ${dot}"><button type="button" class="ring${this.listening ? ' on' : ''}"${tap} aria-label="${e(this.listening ? title : t('Escuchar'))}"${tap ? '' : ' tabindex="-1"'}><span class="waves" aria-hidden="true"><i></i><i></i><i></i></span><span class="core">${icon(glyph)}</span></button><div class="text"><strong>${e(title)}</strong>${detail ? `<span class="muted">${e(detail)}</span>` : ''}</div></div>`;
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
    const badge = `<div class="cap-head"><span class="dot ${c.confirmed ? 'ok' : 'warn'}"></span>${miniWave(c.candidate_id, 72)}<span class="badge ${c.confirmed ? 'ok' : 'warn'}">${c.confirmed ? `✓ ${e(t('Lista para aprender'))}` : e(t('Sin confirmar'))}</span></div>`;
    const details = `<details class="signal-details"><summary>${e(t('Detalles de la señal'))}</summary><p class="muted">${e(t('Tipo {protocol} · tamaño {bits} · pulso medido de la señal: {pulse} µs', { protocol: c.protocol, bits: c.nbits, pulse: c.pulse_us }))}</p></details><div data-signal-preview></div>`;
    const known = c.known_as.length
      ? `<p class="muted">${e(t('Ya está guardado como: {names}', { names: c.known_as.map(value => rfText(value)).join(', ') }))}</p>`
      : '';
    if (!c.confirmed) return `<div class="code">${badge}${details}${known}</div>`;
    // Five names this remote does not use yet: the rest are typed.
    const used = new Set((this.remote?.buttons ?? []).map(button => button.name));
    const suggestions = buttonSuggestions()
      .filter(([label]) => !used.has(label) || label === this.name)
      .slice(0, 5)
      .map(
        ([label, glyph]) =>
          `<button type="button" data-suggest="${e(label)}" data-icon="${e(glyph)}" aria-pressed="${label === this.name}">${e(label)}</button>`,
      )
      .join('');
    const icons = iconPicker(this.glyph, t('Icono'), 'clearable data-learning-icon');
    const form = `<div class="name-row">${icons}<label>${e(t('Nombre del botón'))}<input name="name" maxlength="80" value="${e(this.name)}" placeholder="${e(t('p. ej. Luz, Velocidad 3, Tono'))}"></label></div>
<div class="chips" role="group" aria-label="${e(t('Sugerencias de nombre'))}">${suggestions}</div>${this.roleOptions()}`;
    const action = `<div class="row"><button type="button" class="next" data-command="try"${this.testing || this.saving ? ' disabled' : ''}>${icon('mdi:play')}${e(t('Probar'))}</button><span class="grow"></span>${iconButton(t(this.trial ? 'Guardar señal' : 'Guardar sin probar'), 'mdi:content-save-outline', `data-command="save"${this.name.trim() && !this.saving ? '' : ' disabled'}`)}</div>${
      this.trial
        ? `<div class="question"><p><strong>${e(t('Verificación opcional'))}</strong></p><p class="muted">${e(t('Enviado por {transmitter} · {pulse} µs · {repeats} repeticiones', { transmitter: this.transmitterName(this.trial.transmitter), pulse: this.trial.pulse_us, repeats: this.trial.repeats }))}</p><div class="chips">
        <button type="button" class="chip" data-command="worked" aria-pressed="${this.trial.worked === true}">${e(t('Reaccionó'))}</button>
        <button type="button" class="chip" data-command="failed" aria-pressed="${this.trial.worked === false}">${e(t('No reaccionó'))}</button>
        <button type="button" class="chip" data-command="inconclusive">${e(t('No concluyente'))}</button>
        <button type="button" class="chip" data-command="variant">${e(t('Probar otra combinación'))}</button></div></div>`
        : ''
    }`;
    const attempts = this.attempts.length
      ? `<ul class="attempts" aria-label="${e(t('Pruebas'))}">${this.attempts.map(item => `<li>${item.worked === null ? '—' : item.worked ? '✓' : '✗'} ${e(item.reason)} · ${e(t('{transmitter} · {pulse} µs · {repeats} repeticiones', { transmitter: this.transmitterName(item.transmitter), pulse: item.pulse_us, repeats: item.repeats }))}</li>`).join('')}</ul>`
      : '';
    return `<div class="code">${badge}${details}${known}${form}${action}${attempts}</div>`;
  }

  // Events --------------------------------------------------------------

  private bind(): void {
    const root = this.root;
    root.querySelector<HTMLSelectElement>('[name=reading]')?.addEventListener('change', event => {
      const selected = (event.target as HTMLSelectElement).value;
      this.reset();
      this.chosenReading = selected;
      this.candidate = selected ? (this.readings.get(selected) ?? null) : ([...this.readings.values()].at(-1) ?? null);
      this.render();
    });
    root
      .querySelectorAll<HTMLButtonElement>('[data-command]')
      .forEach(button => button.addEventListener('click', () => void this.command(button.dataset.command!)));
    root
      .querySelector('[data-open-devices]')
      ?.addEventListener('click', () =>
        this.dispatchEvent(new CustomEvent('homemanager-rf-open-devices', { bubbles: true, composed: true })),
      );
    root.querySelector<HTMLInputElement>('[name=target]')?.addEventListener('input', event => {
      this.target = (event.target as HTMLInputElement).value;
      const button = root.querySelector<HTMLButtonElement>('[data-command=guided-start]');
      if (button)
        button.disabled =
          !this.listen || this.receiverOnline?.(this.listen) === false || this.hass?.connection?.connected === false;
    });
    this.bindForm();
    root
      .querySelectorAll<HTMLButtonElement>('[data-listen]')
      .forEach(chip => chip.addEventListener('click', () => this.listenWith(chip.dataset.listen!)));
  }

  /** Another receiver: a running capture moves to it; guided mode waits for its button. */
  private listenWith(receiver: string): void {
    {
      const wasActive = this.until > 0;
      this.listen = receiver;
      this.until = Date.now() + LISTEN_MS;
      this.reset();
      if (this.guided && !this.target.trim() && !wasActive) {
        this.until = 0;
        this.render();
      } else {
        if (this.guided) this.name = this.target.trim();
        void this.capture();
      }
    }
  }

  private bindForm(): void {
    const root = this.root;
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
    root.querySelector<HTMLInputElement>('[data-learning-icon]')?.addEventListener('change', event => {
      this.glyph = (event.target as HTMLInputElement).value;
    });
    root
      .querySelector<HTMLSelectElement>('select[name=role]')
      ?.addEventListener('change', event => (this.assign = (event.target as HTMLSelectElement).value));
  }

  private async command(name: string): Promise<void> {
    try {
      switch (name) {
        case 'guided-start':
          // Without a typed name, the next suggested one (shown in the field).
          if (!this.target.trim()) this.target = this.nextName();
          this.start(this.listen);
          return;
        case 'learning-mode':
          this.guided = !this.guided;
          if (!this.guided && !this.listening && this.listen) {
            this.until = Date.now() + LISTEN_MS;
            await this.capture();
          }
          break;
        case 'close':
          this.stop();
          this.render();
          this.onClose?.();
          return;
        case 'listen':
          this.until = Date.now() + LISTEN_MS;
          await this.capture();
          break;
        case 'try':
          await this.tryAttempt({ ...(this.trial ?? this.firstAttempt()), worked: null });
          break;
        case 'failed':
        case 'worked':
        case 'inconclusive':
          if (!this.trial || !this.candidate || !this.hass) break;
          await diagnostics.candidateNote(
            this.hass,
            { source: 'rf', candidate_id: this.candidate.candidate_id },
            name === 'worked' ? 'confirmed' : name === 'failed' ? 'no_response' : 'inconclusive',
          );
          this.trial.worked = name === 'inconclusive' ? null : name === 'worked';
          this.say(t('Observación registrada.'));
          break;
        case 'variant':
          if (!this.testing && !this.saving) await this.nextVariant();
          break;
        case 'save':
          if (this.saving || !this.name.trim()) return;
          this.saving = true;
          this.render();
          try {
            await this.save(this.trial?.worked ? this.trial : null);
          } finally {
            this.saving = false;
          }
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
    if (this.testing || this.saving || !this.candidate) return;
    const candidateId = this.candidate.candidate_id;
    this.testing = true;
    this.render();
    try {
      await rf.test(this.hass!, candidateId, {
        transmitter: attempt.transmitter,
        pulse_us: attempt.pulse_us,
        repeats: attempt.repeats,
        wait_us: this.remote?.wait_us ?? 0,
      });
      if (this.candidate?.candidate_id === candidateId && !this.saving) {
        this.trial = attempt;
        this.say(t('Señal enviada. Mirá el equipo.'));
      }
    } catch (error) {
      if (this.candidate?.candidate_id === candidateId && !this.saving) this.report(error);
    } finally {
      this.testing = false;
    }
  }

  /** One change at a time: other transmitters, then the neighbouring pulse
   * lengths, then more repeats. Combinations already tried are skipped. */
  private async nextVariant(): Promise<void> {
    if (this.trial) this.attempts.push({ ...this.trial });
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
    this.target = '';
    if (this.guided) this.stop();
    this.readings.delete(c.candidate_id);
    this.reset();
    this.say(t('«{name}» guardado. Pulsá el siguiente botón.', { name }) + note);
    this.onSaved?.(remote.id);
  }
}

if (!customElements.get('homemanager-rf-learn')) customElements.define('homemanager-rf-learn', HomeManagerRfLearn);
