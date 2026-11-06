import { escapeHTML as e, type Hass } from '../card/types.js';
import { t } from '../i18n/index.js';
import {
  diagnostics,
  type CameraResult,
  type DeviceResponse,
  type SignalCandidate,
  type SignalComparison,
  type SignalEvidence,
  type SignalSample,
  type SignalSheet,
  type SignalSummary,
  type SignalTarget,
} from '../integration/diagnostics.js';
import type { IrDevice } from '../integration/remotes.js';
import { installPanelComponents } from './panel-components.js';
import { confirmDialog } from './confirm-dialog.js';

const unknown = () => t('Desconocido');
const time = (value: number) => `${value.toLocaleString()} µs`;
const date = (value?: string | null) => (value ? new Date(value).toLocaleString() : unknown());
const cameraLabels = { visible: 'Emisión visible', not_visible: 'No visible', inconclusive: 'No concluyente' } as const;
const responseLabels = {
  confirmed: 'Respuesta confirmada',
  no_response: 'Sin respuesta del aparato',
  inconclusive: 'No concluyente',
} as const;
const echoLabels = {
  observed: 'Eco observado',
  not_observed: 'Eco no observado',
  indeterminate: 'Eco indeterminado',
} as const;
const integrityLabels: Record<string, string> = {
  received: 'Captura recibida',
  prepared: 'Representación preparada',
  legacy: 'Señal guardada anteriormente',
  possibly_truncated: 'Captura posiblemente truncada',
  unattributed: 'Receptor sin atribución',
  suspect: 'Captura sospechosa',
};

export class SignalPreview extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private key = '';
  constructor() {
    super();
    installPanelComponents(
      this.root,
      'signal-preview',
      `:host{display:block}.preview{border:1px solid var(--hm-line);border-radius:12px;padding:10px;display:grid;gap:7px}.preview svg{width:100%;height:30px;color:var(--hm-brand)}.meta{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center}.preview button{justify-self:start}`,
    );
  }
  configure(hass: Hass, target: SignalCandidate): void {
    const key = `${target.source}:${target.candidate_id}`;
    if (this.key === key) return;
    this.key = key;
    this.root.innerHTML = '';
    void diagnostics
      .summary(hass, target)
      .then(summary => {
        if (this.key === key && summary) this.render(summary, hass, target);
      })
      .catch(() => undefined); // RF learning remains usable with an older backend or an expired sample.
  }
  private render(data: SignalSummary, hass: Hass, target: SignalCandidate): void {
    const points = data.levels.map((level, index) => `${index},${28 - Math.max(0, Math.min(1, level)) * 25}`).join(' ');
    this.root.innerHTML = `<div class="preview"><div class="meta"><strong>${e(t(integrityLabels[data.integrity] ?? 'Captura recibida'))}</strong><span>${e(data.protocol ?? t('Protocolo desconocido'))}</span><span>${e(time(data.duration_us))} · ${data.count} ${e(t('duraciones'))}</span></div><svg viewBox="0 0 96 30" preserveAspectRatio="none" role="img" aria-label="${e(t('Vista previa de la señal'))}"><polyline fill="none" stroke="currentColor" vector-effect="non-scaling-stroke" points="${points}"/></svg><button type="button">${e(t('Abrir diagnóstico avanzado'))}</button></div>`;
    this.root.querySelector('button')?.addEventListener('click', () => openSignal(hass, target));
  }
}

type Tab = 'summary' | 'signal' | 'decode' | 'emission' | 'tests';
export type SignalTab = Tab;
type Trace = { label: string; sample: SignalSample; comparison?: SignalComparison };
const tabs: [Tab, string][] = [
  ['summary', 'Resumen'],
  ['signal', 'Señal'],
  ['decode', 'Decodificación'],
  ['emission', 'Emisión'],
  ['tests', 'Pruebas'],
];
const fieldNames: Record<string, string> = {
  protocol: 'Protocolo',
  bits: 'Bits',
  word_length: 'Longitud de palabra',
  hex: 'Hexadecimal',
  address: 'Dirección',
  command: 'Comando',
  data: 'Datos',
  toggle: 'Bit de alternancia',
  mode: 'Modo',
  inverted: 'Inversión',
  inverted_command: 'Comando invertido',
  base_us: 'Temporización base (µs)',
  repetitions: 'Repeticiones',
  carrier_hz: 'Portadora (Hz)',
  carrier_source: 'Origen de la portadora',
  repeats: 'Repeticiones',
  wait_us: 'Pausa entre señales (µs)',
  pulse_us: 'Pulso (µs)',
  nbits: 'Longitud de palabra',
  transmitter: 'Transmisor',
  measured_pulse_us: 'Pulso medido (µs)',
  wire_source: 'Ruta de envío',
};

function labelValue(value: unknown): string {
  if (value === null || value === undefined) return unknown();
  if (typeof value === 'boolean') return value ? t('Sí') : t('No');
  if (value === 'estimated') return t('Estimada');
  if (value === 'known') return t('Configurada');
  if (value === 'unknown') return unknown();
  return String(value);
}

function fields(values: Record<string, unknown>): string {
  return `<dl>${Object.entries(values)
    .map(([key, value]) => `<div><dt>${e(t(fieldNames[key] ?? key))}</dt><dd>${e(labelValue(value))}</dd></div>`)
    .join('')}</dl>`;
}

function metric(diff: SignalComparison): string {
  return `${t('{different} diferencias en {compared} duraciones comparables', { different: diff.different, compared: diff.compared })} · ${t('Δ longitud {count}', { count: diff.length_delta })} · ${t('{count} diferencias de signo', { count: diff.opposite_sign })} · ${t('Bloques comparados {reference} / {observed}', { reference: diff.reference_blocks, observed: diff.observed_blocks })}${diff.polarity_inverted ? ` · ${t('Polaridad opuesta')}` : ''}`;
}

const palettes = ['#467a57', '#486eab', '#a25e30', '#885a9c'];
const sum = (values: number[]) => values.reduce((total, value) => total + Math.abs(value), 0);
function leading(values: number[]): number {
  const firstMark = values.findIndex(value => value > 0);
  return firstMark > 0 ? sum(values.slice(0, firstMark)) : 0;
}

function waveform(traces: Trace[], start: number, span: number, align: boolean, a: number, b: number): string {
  const width = 860;
  const height = traces.length * 66 + 25;
  const x = (at: number) => Math.max(0, Math.min(width, ((at - start) / span) * width));
  const axis = Array.from({ length: 5 }, (_, index) => {
    const xx = (index * width) / 4;
    return `<path d="M${xx} 17V${height}" stroke="#b6c3b9" opacity=".45"/><text x="${index === 0 ? 3 : index === 4 ? xx - 3 : xx}" y="13" text-anchor="${index === 0 ? 'start' : index === 4 ? 'end' : 'middle'}" fill="#405048">${e(time(Math.round(start + (index * span) / 4)))}</text>`;
  }).join('');
  const selection = `<rect x="${x(Math.min(a, b))}" y="17" width="${Math.abs(x(b) - x(a))}" height="${height - 17}" fill="#c79539" opacity=".16"/>`;
  const lines = traces
    .map(({ sample, label, comparison }, index) => {
      const top = 32 + index * 66;
      const path = [];
      const errorMarkers = [];
      const unusual = new Set([
        ...sample.analysis.discontinuities,
        ...(comparison?.indices.map(value => value + comparison.start[1]) ?? []),
      ]);
      let from = align ? -leading(sample.timings_us) : 0;
      for (const [i, duration] of sample.timings_us.entries()) {
        const to = from + Math.abs(duration);
        if (to >= start && from <= start + span) {
          const y = top + (duration > 0 ? 10 : 31);
          path.push(`${path.length ? 'L' : 'M'}${x(from).toFixed(2)} ${y}H${x(to).toFixed(2)}`);
          if (unusual.has(i)) errorMarkers.push(`<circle cx="${x(from)}" cy="${y}" r="3" fill="#c55243"/>`);
        }
        from = to;
      }
      const color = palettes[index % palettes.length];
      return `<text x="5" y="${top + 3}" fill="#334339">${e(label)}</text><path d="M0 ${top + 31}H${width}" stroke="#b6c3b9" opacity=".5"/><path d="${path.join('')}" fill="none" stroke="${color}" stroke-width="1.65" vector-effect="non-scaling-stroke"/>${errorMarkers.join('')}`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${e(t('Pulsos y pausas en el tiempo'))}"><rect width="100%" height="100%" fill="#f6f8f4"/><g font-family="system-ui,sans-serif" font-size="13">${axis}${selection}${lines}</g></svg>`;
}

function histogram(sample: SignalSample): string {
  const bins = sample.analysis.histogram;
  const max = Math.max(1, ...bins.flatMap(bin => [bin.marks, bin.spaces]));
  return `<h4>${e(t('Histograma de duraciones'))}</h4><div class="histogram" role="list" aria-label="${e(t('Pulsos y pausas por intervalo'))}">${bins.map(bin => `<div role="listitem"><span>${bin.low_us}–${bin.high_us} µs</span><span class="bars"><i style="--share:${(bin.marks / max) * 100}%"></i><i style="--share:${(bin.spaces / max) * 100}%"></i></span><span>${bin.marks} / ${bin.spaces}</span></div>`).join('')}</div><p class="muted">${e(t('Pulsos / pausas · medición digital del receptor'))}</p>`;
}

class SignalWorkbench extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private readonly dialog = document.createElement('dialog');
  private sheet?: SignalSheet;
  private learning?: SignalEvidence;
  private tab: Tab = 'summary';
  private receivers: IrDevice[] = [];
  private emitters: IrDevice[] = [];
  private trial = '';
  private emitter = '';
  private external = '';
  private self = '';
  private busy = false;
  private message = '';
  private failed = false;
  private zoom = 1;
  private offset = 0;
  private frame = -1;
  private block = 0;
  private align = true;
  private a = 0;
  private b = 0;
  private pointerStart: number | null = null;
  private returnFocus?: HTMLElement;
  private hass!: Hass;
  private target!: SignalTarget;

  constructor() {
    super();
    installPanelComponents(
      this.root,
      'signal-workbench',
      `
      dialog{width:min(920px,calc(100vw - 24px));max-height:calc(100dvh - 24px);box-sizing:border-box;padding:0;color:var(--hm-ink);background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:16px;overscroll-behavior:contain}
      dialog::backdrop{background:rgba(19,27,22,.53)} header,main{padding:16px}header{display:flex;gap:12px;justify-content:space-between;align-items:center;border-bottom:1px solid var(--hm-line)}
      header h2,p,h3,h4{margin:0}main,section,form,details[open]{display:grid;gap:10px}.tabs,.actions{display:flex;flex-wrap:wrap;gap:6px}.tabs button[aria-pressed=true]{background:var(--hm-brand);color:var(--hm-on-brand,#fff)}
      .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,175px),1fr));gap:10px}.cols label,form label{display:grid;gap:4px;min-width:0}select,input,textarea{min-width:0;width:100%;box-sizing:border-box}
      .signal-chart{min-width:0;touch-action:pan-y}.signal-chart svg{display:block;width:100%;height:auto;border-radius:8px}.muted{color:var(--hm-muted)}.error{color:var(--hm-alert)}
      dl{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:7px 14px}dd{margin:2px 0 0;overflow-wrap:anywhere}dt{color:var(--hm-muted);font-size:.9em}
      .source,.row,details{border:1px solid var(--hm-line);border-radius:10px;padding:10px}.row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}.row small{color:var(--hm-muted)}
      summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:10em;overflow:auto;margin:0}.histogram>div{display:grid;grid-template-columns:8em minmax(0,1fr) 4em;align-items:center;gap:8px;margin:4px 0}.bars{display:grid;gap:2px}.bars i{width:var(--share);height:5px;background:var(--hm-brand)}.bars i+i{background:var(--hm-cool,#4f8fbf)}
      @media(max-width:520px){header,main{padding:10px}.signal-chart svg text{font-size:19px}.tabs button{flex:1 1 90px}.histogram>div{grid-template-columns:6.5em minmax(0,1fr) 3em}}
    `,
    );
    this.root.append(this.dialog);
    this.dialog.addEventListener('close', () => {
      this.remove();
      this.returnFocus?.focus();
    });
  }

  open(hass: Hass, target: SignalTarget, tab?: SignalTab): void {
    this.hass = hass;
    this.target = target;
    if (tab) this.tab = tab;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.render();
    this.dialog.showModal();
    void this.run(async () => {
      if ('candidate_id' in target) this.learning = await diagnostics.candidate(hass, target);
      else {
        await this.loadSheet();
        try {
          ({ emitters: this.emitters, receivers: this.receivers } = await diagnostics.devices(hass, target.source));
          if (!this.emitters.some(device => device.id === this.emitter) && this.emitters.length === 1)
            this.emitter = this.emitters[0].id;
        } catch {
          /* Stored evidence remains available with the nodes offline. */
        }
      }
    });
  }

  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.failed = false;
    this.message = '';
    this.render();
    try {
      await work();
    } catch (error) {
      this.failed = true;
      this.message = (error as Error)?.message || t('Algo falló.');
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async loadSheet(): Promise<void> {
    if (!('remote_id' in this.target)) return;
    this.sheet = await diagnostics.sheet(this.hass, this.target, this.trial || undefined);
    if (!this.emitter) this.emitter = this.sheet.emitter;
  }

  private get evidence(): SignalEvidence | undefined {
    return this.sheet ?? this.learning;
  }

  private traces(): Trace[] {
    const traces: Trace[] = [];
    const evidence = this.evidence;
    if (evidence?.original) traces.push({ label: t('Original'), sample: evidence.original });
    if (evidence?.prepared)
      traces.push({ label: t('Preparada'), sample: evidence.prepared, comparison: evidence.comparison ?? undefined });
    for (const [role, seen] of Object.entries(this.sheet?.observed ?? {})) {
      const index = Math.min(this.block, seen.blocks.length - 1);
      if (seen.blocks[index])
        traces.push({
          label: role === 'self' ? t('Auto-eco') : t('Observada por B'),
          sample: seen.blocks[index],
          comparison: seen.comparisons[index],
        });
    }
    return traces;
  }

  private currentWindow(): { start: number; span: number; total: number } {
    const traces = this.traces();
    const raw = traces[0]?.sample.timings_us ?? [];
    const frame = traces[0]?.sample.analysis.frames[this.frame];
    const base = frame ? sum(raw.slice(0, frame.start)) - (this.align ? leading(raw) : 0) : 0;
    const total = frame
      ? sum(raw.slice(frame.start, frame.end))
      : Math.max(1, ...traces.map(item => item.sample.analysis.duration_us));
    const span = Math.max(1, total / this.zoom);
    return { start: Math.max(0, base + ((total - span) * this.offset) / 100), span, total };
  }

  private paintWave(): void {
    const chart = this.dialog.querySelector<HTMLElement>('.signal-chart');
    if (!chart) return;
    const { start, span } = this.currentWindow();
    const low = Math.floor(start);
    const high = Math.ceil(start + span);
    this.a = Math.min(high, Math.max(low, this.a));
    this.b = Math.min(high, Math.max(low, this.b));
    for (const cursor of this.dialog.querySelectorAll<HTMLInputElement>('[data-cursor]')) {
      cursor.min = String(low);
      cursor.max = String(high);
      cursor.value = String(cursor.dataset.cursor === 'a' ? this.a : this.b);
    }
    chart.innerHTML = waveform(this.traces(), start, span, this.align, this.a, this.b);
    const measure = this.dialog.querySelector<HTMLOutputElement>('[data-measure]');
    if (measure) measure.value = `${t('Intervalo seleccionado')} · ${time(Math.abs(this.b - this.a))}`;
  }

  private summary(): string {
    const traces = this.traces();
    if (!traces.length) return `<p>${e(t('Todavía no hay una captura original guardada.'))}</p>`;
    const identity = this.sheet?.identity;
    return `<section>${identity ? fields({ Control: identity.remote_name, Botón: identity.button_name, Icono: identity.icon, Transporte: identity.source.toUpperCase(), Identificador: identity.button_id }) : ''}
      ${this.sheet && !this.sheet.original ? `<p>${e(t('Todavía no hay una captura original guardada.'))}</p>` : ''}
      ${traces.map(({ label, sample }) => `<section class="source"><h3>${e(label)}</h3>${fields({ Estado: t(integrityLabels[sample.integrity] ?? 'Desconocido'), [sample.integrity === 'prepared' ? 'Transmisor' : 'Receptor']: sample.node, Fecha: date(sample.at), Formato: 'µs · +/−', 'Duración (µs)': sample.analysis.duration_us, Duraciones: sample.analysis.count, Transiciones: sample.analysis.transitions, 'Temporización base (µs)': sample.analysis.decoded?.base_us ?? sample.analysis.base_us, 'Dispersión (µs)': sample.analysis.spread_us, Bloques: sample.analysis.frames.length, Pulsaciones: sample.receptions?.presses, 'Tramas reconocidas': sample.receptions?.frames })}<p class="muted">${e(t(label === t('Preparada') ? 'Tiempos calculados para el envío' : 'Tiempos medidos por el receptor · tramas inferidas'))}</p></section>`).join('')}</section>`;
  }

  private signal(): string {
    const traces = this.traces();
    if (!traces.length) return this.summary();
    const reference = traces[0].sample;
    const comparison = this.evidence?.comparison;
    const maxBlocks = Math.max(0, ...Object.values(this.sheet?.observed ?? {}).map(item => item.blocks.length));
    return `<section><div class="cols"><label>${e(t('Trama'))}<select data-frame><option value="-1">${e(t('Señal completa'))}</option>${reference.analysis.frames.map((frame, index) => `<option value="${index}"${index === this.frame ? ' selected' : ''}>${e(t('Trama {count}', { count: index + 1 }))}${frame.gap_us ? ` · ${e(time(frame.gap_us))}` : ''}</option>`).join('')}</select></label>
      <label>${e(t('Zoom'))}<input data-zoom type="range" min="1" max="24" value="${this.zoom}"></label><label>${e(t('Desplazamiento'))}<input data-offset type="range" min="0" max="100" value="${this.offset}"></label>
      ${maxBlocks > 1 ? `<label>${e(t('Bloque observado'))}<select data-block>${Array.from({ length: maxBlocks }, (_, index) => `<option value="${index}"${index === this.block ? ' selected' : ''}>${index + 1}</option>`).join('')}</select></label>` : ''}</div>
      <label class="row"><input data-align type="checkbox" style="width:auto"${this.align ? ' checked' : ''}>${e(t('Alinear al primer pulso'))}</label>
      <div class="signal-chart"></div><output data-measure></output><div class="cols">${['a', 'b'].map((key, index) => `<label>${e(t('Cursor'))} ${index + 1}<input data-cursor="${key}" type="range" min="0" max="${Math.ceil(this.currentWindow().start + this.currentWindow().span)}" value="${index ? this.b : this.a}"></label>`).join('')}</div>
      <div class="actions"><button type="button" data-export="svg">${e(t('Exportar SVG'))}</button><button type="button" data-export="png">${e(t('Exportar PNG'))}</button></div>
      ${comparison ? `<p>${e(t('Original frente a preparada'))} · ${e(metric(comparison))}</p>` : ''}${traces
        .filter(trace => trace.comparison)
        .map(trace => `<p>${e(trace.label)} · ${e(metric(trace.comparison!))}</p>`)
        .join('')}
      ${this.echoes()}
      <p class="muted">${e(t('Tolerancia por duración: 120 µs o 25 %, lo que sea mayor. Los puntos marcan discontinuidades o diferencias.'))}</p>
      ${histogram(reference)}<details><summary>${e(t('Tiempos crudos originales y preparados'))}</summary>${traces.map(trace => `<div><strong>${e(trace.label)}</strong><pre>${e(trace.sample.timings_us.join(', '))}</pre></div>`).join('')}</details></section>`;
  }

  private decode(): string {
    const traces = this.traces();
    const expected = this.evidence?.prepared?.analysis.decoded;
    return `<section>${
      traces
        .map(({ label, sample }) => {
          const decoded = sample.analysis.decoded;
          const diff =
            decoded && expected && label !== t('Preparada')
              ? decoded.protocol !== expected.protocol
                ? t('Protocolo distinto al preparado')
                : decoded.bits === expected.bits
                  ? t('Bits iguales a la preparación')
                  : t('Bits distintos a la preparación')
              : '';
          return `<section class="source"><h3>${e(label)} · ${e(t('Decodificado'))}</h3>${decoded ? fields(decoded) : `<p>${e(t('Protocolo desconocido. Se conserva la captura digital.'))}</p>`}${diff ? `<p>${e(diff)}</p>` : ''}</section>`;
        })
        .join('') || this.summary()
    }</section>`;
  }

  private options(items: IrDevice[], selected: string): string {
    return items
      .map(
        device =>
          `<option value="${e(device.id)}"${device.id === selected ? ' selected' : ''}>${e(device.name)}</option>`,
      )
      .join('');
  }

  private emission(): string {
    const prepared = this.evidence?.prepared;
    return `<section>${prepared ? `<h3>${e(t('Emisión configurada'))}</h3>${fields(prepared.settings ?? {})}` : `<p>${e(t('Usá Probar en el aprendizaje para revisar la preparación del envío.'))}</p>`}
      ${
        this.sheet
          ? `<div class="cols"><label>${e(t('Transmisor'))}<select data-device="emitter"><option value="">${e(t('Elegí un equipo'))}</option>${this.options(this.emitters, this.emitter)}</select></label>
      <label>${e(t('Auto-eco'))}<select data-device="self"><option value="">${e(t('Sin observación'))}</option>${this.options(this.receivers, this.self)}</select></label>
      <label>${e(t('Receptor independiente B'))}<select data-device="external"><option value="">${e(t('Sin observación'))}</option>${this.options(this.receivers, this.external)}</select></label></div>
      <p class="muted">${e(t('Para auto-eco, elegí el receptor del mismo nodo. Para B, elegí otro nodo. Ambos son opcionales.'))}</p>
      <button type="button" data-send${this.busy || !this.emitters.some(device => device.id === this.emitter) ? ' disabled' : ''}>${e(t('Solicitar emisión de prueba'))}</button>
      ${this.echoes()}
      <p class="muted">${e(t('B observa a través de su propio receptor. El eco no mide la potencia ni confirma la reacción del equipo.'))}</p>`
          : ''
      }</section>`;
  }

  private echoes(): string {
    return Object.entries(this.sheet?.observed ?? {})
      .map(
        ([role, data]) =>
          `<p>${e(role === 'self' ? t('Auto-eco') : t('Receptor independiente B'))} · ${e(data.receiver)} · ${e(t(echoLabels[data.status] ?? 'Eco indeterminado'))} (${data.blocks.length})</p>`,
      )
      .join('');
  }

  private tests(): string {
    if (!this.sheet)
      return `<section>${this.learning?.prepared ? `<p>${e(t('Emisión solicitada'))} · ${e(date(this.learning.prepared.at))}</p>` : ''}<p>${e(t('Guardá el botón para conservar sus pruebas.'))}</p></section>`;
    const rows = this.sheet.history
      .map(
        row =>
          `<div class="row"><strong>${e(t(row.camera ? cameraLabels[row.camera] : row.response ? responseLabels[row.response] : row.status === 'sent' ? 'Emisión solicitada' : 'Observación'))}</strong><small>${e(date(row.at))}</small>${row.emitter ? `<small>${e(this.emitters.find(device => device.id === row.emitter)?.name ?? row.emitter)}</small>` : ''}${row.camera && row.response ? `<span>${e(t(responseLabels[row.response]))}</span>` : ''}${row.note ? `<span>${e(row.note)}</span>` : ''}${row.snapshot ? `<button type="button" data-trial="${e(row.id)}">${e(t('Ver comparación'))}</button>` : ''}</div>`,
      )
      .join('');
    return `<section><form data-observation>${
      this.target.source === 'ir'
        ? `<details><summary>${e(t('Comprobar con la cámara del teléfono'))}</summary>
      <ol><li>${e(t('Apuntá el LED de un mando IR físico a la cámara y pulsá un botón. Comprobá que la pantalla muestra un destello.'))}</li><li>${e(t('Con la misma cámara, apuntá al LED del transmisor y solicitá la emisión de prueba en la pestaña Emisión.'))}</li><li>${e(t('Registrá lo que viste. Si el mando físico tampoco se ve, probá la cámara frontal u otro teléfono y elegí No concluyente si sigue igual.'))}</li></ol>
      <p>${e(t('Algunas cámaras filtran infrarrojos. Ver luz no verifica la secuencia, la portadora ni las temporizaciones.'))}</p>
      <label>${e(t('Resultado de cámara'))}<select name="camera"><option value="">${e(t('Sin observación'))}</option>${Object.entries(
        cameraLabels,
      )
        .map(([key, text]) => `<option value="${key}">${e(t(text))}</option>`)
        .join('')}</select></label></details>`
        : ''
    }
      <label>${e(t('Respuesta del aparato'))}<select name="response"><option value="">${e(t('Pendiente de comprobar'))}</option>${Object.entries(
        responseLabels,
      )
        .map(([key, text]) => `<option value="${key}">${e(t(text))}</option>`)
        .join('')}</select></label>
      <label>${e(t('Observación'))}<textarea name="note" rows="2" maxlength="240"></textarea></label><button type="submit"${this.busy ? ' disabled' : ''}>${e(t('Guardar observación'))}</button></form>
      <h3>${e(t('Historial del botón'))}</h3>${rows || `<p>${e(t('Todavía no hay pruebas guardadas.'))}</p>`}
      ${rows ? `<button type="button" data-clear>${e(t('Limpiar historial'))}</button>` : ''}</section>`;
  }

  private render(): void {
    const title = this.sheet
      ? `${this.sheet.identity.remote_name} · ${this.sheet.identity.button_name}`
      : t('Diagnóstico de señal');
    this.dialog.setAttribute('aria-labelledby', 'signal-title');
    const panel =
      this.tab === 'summary'
        ? this.summary()
        : this.tab === 'signal'
          ? this.signal()
          : this.tab === 'decode'
            ? this.decode()
            : this.tab === 'emission'
              ? this.emission()
              : this.tests();
    this.dialog.innerHTML = `<header><h2 id="signal-title">${e(title)}</h2><button type="button" data-close>${e(t('Cerrar'))}</button></header><main>
      <nav class="tabs" aria-label="${e(t('Diagnóstico de señal'))}">${tabs.map(([tab, text]) => `<button type="button" data-tab="${tab}" aria-pressed="${tab === this.tab}">${e(t(text))}</button>`).join('')}</nav>
      ${this.trial ? `<div class="row">${e(t('Comparación guardada'))}<button type="button" data-trial="">${e(t('Volver a la señal actual'))}</button></div>` : ''}${panel}
      <p role="status"${this.failed ? ' class="error"' : ''}>${e(this.message || (this.busy ? t('Cargando…') : ''))}</p></main>`;
    this.bind();
    this.paintWave();
  }

  private bind(): void {
    const find = <T extends HTMLElement>(selector: string) => this.dialog.querySelector<T>(selector);
    find('[data-close]')?.addEventListener('click', () => this.dialog.close());
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button =>
      button.addEventListener('click', () => {
        this.tab = button.dataset.tab as Tab;
        this.render();
        find(`[data-tab="${this.tab}"]`)?.focus();
      }),
    );
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-trial]').forEach(button =>
      button.addEventListener(
        'click',
        () =>
          void this.run(async () => {
            this.trial = button.dataset.trial ?? '';
            this.frame = -1;
            this.block = 0;
            await this.loadSheet();
            this.tab = 'signal';
          }),
      ),
    );
    for (const key of ['emitter', 'self', 'external'] as const) {
      find<HTMLSelectElement>(`[data-device="${key}"]`)?.addEventListener('change', event => {
        this[key] = (event.target as HTMLSelectElement).value;
        const send = find<HTMLButtonElement>('[data-send]');
        if (send) send.disabled = !this.emitter || this.busy;
      });
    }
    find('[data-send]')?.addEventListener(
      'click',
      () =>
        void this.run(async () => {
          if (!('remote_id' in this.target)) return;
          const result = await diagnostics.run(this.hass, this.target, {
            emitter: this.emitter,
            ...(this.self ? { self: this.self } : {}),
            ...(this.external ? { external: this.external } : {}),
          });
          this.trial = result.id ?? '';
          this.frame = -1;
          this.block = 0;
          this.message = t(
            result.saved
              ? 'Emisión solicitada. Comprobá el aparato por separado.'
              : 'Emisión solicitada. El historial no se pudo guardar.',
          );
          await this.loadSheet();
          this.tab = 'signal';
        }),
    );
    find<HTMLFormElement>('[data-observation]')?.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const camera = data.get('camera') as CameraResult | null;
      const response = data.get('response') as DeviceResponse | null;
      const note = String(data.get('note') ?? '').trim();
      void this.run(async () => {
        if (!('remote_id' in this.target)) return;
        await diagnostics.note(this.hass, this.target, {
          ...(camera ? { camera } : {}),
          ...(response ? { response } : {}),
          ...(note ? { note } : {}),
          ...(this.trial ? { trial_id: this.trial } : {}),
        });
        await this.loadSheet();
        this.message = t('Observación guardada');
      });
    });
    find('[data-clear]')?.addEventListener(
      'click',
      () =>
        void (async () => {
          if (
            !(await confirmDialog(this.root, {
              title: t('¿Limpiar las pruebas del botón?'),
              message: t('La captura y el botón se conservan.'),
              confirm: t('Limpiar historial'),
            }))
          )
            return;
          await this.run(async () => {
            if (!('remote_id' in this.target)) return;
            await diagnostics.clear(this.hass, this.target);
            this.trial = '';
            await this.loadSheet();
          });
        })(),
    );
    for (const [selector, key] of [
      ['[data-frame]', 'frame'],
      ['[data-block]', 'block'],
    ] as const)
      find<HTMLSelectElement>(selector)?.addEventListener('change', event => {
        this[key] = Number((event.target as HTMLSelectElement).value);
        this.render();
      });
    for (const [selector, key] of [
      ['[data-zoom]', 'zoom'],
      ['[data-offset]', 'offset'],
      ['[data-cursor="a"]', 'a'],
      ['[data-cursor="b"]', 'b'],
    ] as const)
      find<HTMLInputElement>(selector)?.addEventListener('input', event => {
        this[key] = Number((event.target as HTMLInputElement).value);
        this.paintWave();
      });
    find<HTMLInputElement>('[data-align]')?.addEventListener('change', event => {
      this.align = (event.target as HTMLInputElement).checked;
      this.paintWave();
    });
    const chart = find<HTMLElement>('.signal-chart');
    const position = (event: PointerEvent) => {
      const box = chart!.getBoundingClientRect();
      const { start, span } = this.currentWindow();
      return Math.round(start + Math.max(0, Math.min(1, (event.clientX - box.left) / Math.max(1, box.width))) * span);
    };
    chart?.addEventListener('pointerdown', event => {
      this.pointerStart = position(event);
      chart.setPointerCapture(event.pointerId);
    });
    chart?.addEventListener('pointerup', event => {
      if (this.pointerStart === null) return;
      this.a = this.pointerStart;
      this.b = position(event);
      this.pointerStart = null;
      this.render();
    });
    chart?.addEventListener('pointercancel', () => {
      this.pointerStart = null;
    });
    this.dialog
      .querySelectorAll<HTMLButtonElement>('[data-export]')
      .forEach(button => button.addEventListener('click', () => void this.download(button.dataset.export === 'png')));
  }

  private async download(png: boolean): Promise<void> {
    const { start, span } = this.currentWindow();
    const svg = waveform(this.traces(), start, span, this.align, this.a, this.b);
    const save = (blob: Blob, suffix: string) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `homemanager-senal.${suffix}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    if (!png) {
      save(blob, 'svg');
      return;
    }
    const url = URL.createObjectURL(blob);
    const image = new Image();
    try {
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width * 2;
      canvas.height = image.height * 2;
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(result => {
        if (result) save(result, 'png');
      }, 'image/png');
    } catch {
      this.message = t('No se pudo exportar la señal');
      this.failed = true;
      this.render();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Opens the technical sheet; Controls › Test opens it on Emission or Tests (0.13). */
export function openSignal(hass: Hass, target: SignalTarget, tab?: SignalTab): void {
  const sheet = new SignalWorkbench();
  document.body.append(sheet);
  sheet.open(hass, target, tab);
}

if (!customElements.get('homemanager-signal-preview'))
  customElements.define('homemanager-signal-preview', SignalPreview);
if (!customElements.get('homemanager-signal-workbench'))
  customElements.define('homemanager-signal-workbench', SignalWorkbench);
