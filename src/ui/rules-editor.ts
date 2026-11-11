import { checkList, checkListStyles } from './check-list.js';
import { t } from '../i18n/index.js';
import { escapeHTML as e, type Configuration } from '../card/types.js';
import { readingName } from '../model/names.js';
import { evaluateVisualRules, promoteLegacyRule, type VisualRule } from '../model/visual-rules.js';
import type { ModelHass } from '../model/types.js';
import { confirmDialog } from './confirm-dialog.js';
import { appliesTo, limitsOf } from '../model/base-rules.js';
import { formatReading } from '../model/control-layout.js';

/** 0.13 Alerts (before "Rules"), as in the approved mockup: a short list with a switch
 * and the included ones apart; a new alert is built as a sentence (when [reading]
 * [<] [20 %] for [10 min]), how it looks and where, with a preview of the value right
 * now; a five-step guide points at each part. Alerts only show while the app is open:
 * they never send commands or notifications. The stored rules are the same as before. */

type BaseKind = 'safety' | 'battery' | 'unavailable' | 'highlight';
type Compare = 'lt' | 'gt' | 'out' | 'on' | 'off';
interface Row {
  key: string;
  rule: VisualRule;
  legacy?: { device: string; index: number };
  base?: { kind: BaseKind };
}
const glyph = (icon: string) => `<ha-icon icon="${e(icon)}" aria-hidden="true"></ha-icon>`;
const ib = (label: string, icon: string, attributes = '', variant = '') =>
  `<button type="button" class="ib${variant ? ` ${variant}` : ''}" aria-label="${e(label)}" title="${e(label)}" ${attributes}>${glyph(icon)}</button>`;
const LEVELS: [VisualRule['level'], string, string][] = [
  ['warning', 'mdi:alert-outline', 'Aviso'],
  ['alert', 'mdi:alert-octagon-outline', 'Alerta'],
  ['indicator', 'mdi:information-outline', 'Info'],
];
const GUIDE: [string, string, string][] = [
  ['#g-read', 'Qué mirar', 'Una lectura de un sensor. Ejemplo: la humedad de la maceta.'],
  ['#g-cmp', 'La condición', 'Menor que, mayor que, fuera de un rango, o detectado.'],
  ['#g-val', 'El límite', '20 % durante 10 minutos: así un pico suelto no avisa.'],
  ['#g-sev', 'Cómo se ve', 'Aviso, alerta o info. En el símbolo, en la barra de actividad o en Ahora.'],
  ['#g-prev', 'El resultado', 'La vista previa usa el valor de este momento.'],
];

export class RulesEditor extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private configuration?: Configuration;
  private hass?: ModelHass;
  private changed?: (next: Configuration) => void;
  /** What is open: the list, one alert, or one included alert. */
  private view: 'list' | 'edit' | 'base' = 'list';
  private selected = '';
  private draft?: VisualRule;
  private undo?: Configuration;
  private creatingFor?: string;
  private picking: '' | 'reading' | 'symbol' = '';
  /** The condition chosen, even before its number is typed. */
  private compare?: Compare;
  private guide = 0;
  private error = '';
  configure(configuration: Configuration, hass: ModelHass | undefined, changed: (next: Configuration) => void): void {
    const repaint = !this.configuration || JSON.stringify(this.configuration) !== JSON.stringify(configuration);
    this.configuration = structuredClone(configuration);
    this.hass = hass;
    this.changed = changed;
    if (repaint || !this.root.childElementCount) this.render();
    else if (this.view === 'edit') this.paintPreview();
  }
  /** A new alert for one symbol (from its sheet). */
  createFor(id?: string): void {
    this.creatingFor = id;
    this.newRule();
  }
  /** Opens one alert (from a symbol's sheet). */
  openRule(id: string): void {
    const row = this.rows().find(item => item.rule.id === id || item.key === id);
    if (!row) return;
    this.open(row);
  }

  // Rows ---------------------------------------------------------------------

  private rows(): Row[] {
    if (!this.configuration) return [];
    const rows: Row[] = (this.configuration.rules ?? []).map(rule => ({ key: rule.id, rule }));
    for (const device of this.configuration.catalog.devices) {
      for (const [index, rule] of (device.display.alerts ?? []).entries())
        rows.push({
          key: `legacy:${device.id}:${index}`,
          legacy: { device: device.id, index },
          rule: {
            id: `legacy-${device.id}-${index}`,
            name: `${device.display.label} · ${readingName(rule.reading, this.hass)}`,
            enabled: rule.enabled !== false,
            sources: [
              {
                reading: rule.reading,
                ...(rule.reading !== device.bindings.entityId && device.bindings.deviceId
                  ? { deviceId: device.bindings.deviceId }
                  : {}),
              },
            ],
            symbols: [device.id],
            level: rule.level,
            ...(rule.below !== undefined ? { below: rule.below } : {}),
            ...(rule.above !== undefined ? { above: rule.above } : {}),
            ...(rule.forMinutes !== undefined ? { forMinutes: rule.forMinutes } : {}),
          },
        });
    }
    const limits = limitsOf(this.configuration.baseRules);
    const devices = this.configuration.catalog.devices;
    for (const kind of ['safety', 'battery', 'unavailable', 'highlight'] as const) {
      const applicable = devices.filter(device => appliesTo(kind, device, this.hass));
      if (!applicable.length) continue;
      rows.push({
        key: `base:${kind}`,
        base: { kind },
        rule: {
          id: `base-${kind}`,
          name: t(
            {
              battery: 'Batería baja',
              unavailable: 'Sin conexión',
              safety: 'Detección de seguridad',
              highlight: 'Resaltar al detectar',
            }[kind],
          ),
          enabled:
            kind === 'highlight'
              ? applicable.some(device => device.display.highlight === true)
              : kind === 'safety'
                ? limits.safety
                : limits[kind] !== null,
          sources: [],
          symbols: applicable.map(device => device.id),
          level: kind === 'safety' ? 'alert' : kind === 'highlight' ? 'indicator' : 'warning',
        },
      });
    }
    return rows;
  }
  private unit(id: string): string {
    const unit = this.hass?.states[id]?.attributes?.unit_of_measurement;
    return typeof unit === 'string' ? unit : '';
  }
  /** "Humedad < 20 % · 10 min · 1 símbolo" */
  private summary(row: Row): string {
    const rule = row.rule;
    if (row.base) {
      const rules = this.configuration!.baseRules ?? {};
      const count = rule.symbols.length;
      const symbols = t(count === 1 ? '1 símbolo' : '{count} símbolos', { count });
      if (row.base.kind === 'battery') return `< ${rules.battery?.below ?? 15} % · ${symbols}`;
      if (row.base.kind === 'unavailable') return `> ${rules.unavailable?.minutes ?? 10} min · ${symbols}`;
      return symbols;
    }
    const source = rule.sources[0]?.reading;
    const name = source ? readingName(source, this.hass) : t('Sin lectura');
    const unit = source ? this.unit(source) : '';
    const value = (n: number) => `${n}${unit ? ` ${unit}` : ''}`;
    const condition =
      rule.state !== undefined || source?.startsWith('binary_sensor.')
        ? `${name} = ${t(rule.state === 'off' ? 'sin detectar' : 'detectado')}`
        : rule.below !== undefined && rule.above !== undefined
          ? `${name} < ${value(rule.below)} · > ${value(rule.above)}`
          : rule.below !== undefined
            ? `${name} < ${value(rule.below)}`
            : rule.above !== undefined
              ? `${name} > ${value(rule.above)}`
              : name;
    const more = rule.sources.length > 1 ? ` +${rule.sources.length - 1}` : '';
    const time = rule.forMinutes ? `${rule.forMinutes} min` : t('en el momento');
    const count = rule.symbols.length;
    return [
      `${condition}${more}`,
      time,
      ...(count ? [t(count === 1 ? '1 símbolo' : '{count} símbolos', { count })] : []),
    ].join(' · ');
  }

  // Changes -------------------------------------------------------------------

  private newRule(): void {
    let index = 1;
    while (this.configuration?.rules?.some(r => r.id === `rule-${index}`)) index++;
    this.selected = '';
    this.view = 'edit';
    this.guide = 0;
    this.error = '';
    this.compare = undefined;
    this.draft = {
      id: `rule-${index}`,
      name: '',
      enabled: true,
      sources: [],
      symbols: this.creatingFor ? [this.creatingFor] : [],
      level: 'warning',
      below: undefined,
    };
    delete this.draft.below;
    this.render();
  }
  private open(row: Row): void {
    this.selected = row.key;
    this.view = row.base ? 'base' : 'edit';
    this.draft = row.base ? undefined : structuredClone(row.rule);
    this.compare = undefined;
    this.guide = 0;
    this.error = '';
    this.picking = '';
    this.render();
  }
  private commit(next: Configuration): void {
    this.undo = structuredClone(this.configuration);
    this.configuration = next;
    this.changed?.(next);
  }
  private toggle(row: Row): void {
    const next = structuredClone(this.configuration!);
    if (row.base) {
      const kind = row.base.kind;
      if (kind === 'highlight') {
        for (const d of next.catalog.devices)
          if (appliesTo('highlight', d, this.hass)) d.display.highlight = !row.rule.enabled;
      } else next.baseRules = { ...next.baseRules, [kind]: { ...next.baseRules?.[kind], enabled: !row.rule.enabled } };
    } else if (row.legacy)
      next.catalog.devices.find(d => d.id === row.legacy!.device)!.display.alerts![row.legacy.index].enabled =
        !row.rule.enabled;
    else next.rules!.find(rule => rule.id === row.rule.id)!.enabled = !row.rule.enabled;
    this.commit(next);
    this.render();
  }
  private compareOf(rule: VisualRule): Compare {
    const binary = this.binary(rule);
    if (this.compare && (binary ? ['on', 'off'] : ['lt', 'gt', 'out']).includes(this.compare)) return this.compare;
    if (binary || rule.state !== undefined) return rule.state === 'off' ? 'off' : 'on';
    if (rule.below !== undefined && rule.above !== undefined) return 'out';
    return rule.above !== undefined ? 'gt' : 'lt';
  }
  private binary(rule: VisualRule): boolean {
    return rule.sources[0]?.reading.startsWith('binary_sensor.') ?? false;
  }
  /** Checks a draft before it is saved; returns the message to show, or ''. */
  private problem(rule: VisualRule): string {
    if (!rule.sources.length) return t('Elegí al menos una lectura.');
    const binary = this.binary(rule);
    if (rule.sources.some(s => s.reading.startsWith('binary_sensor.') !== binary))
      return t('Elegí lecturas del mismo tipo.');
    if (!binary && rule.below === undefined && rule.above === undefined) return t('Escribí el límite.');
    if (!rule.name.trim()) return t('Escribí un nombre para la alerta.');
    return '';
  }
  private save(): void {
    const rule = this.draft;
    if (!rule) return;
    if (!rule.name.trim() && rule.sources[0]) rule.name = readingName(rule.sources[0].reading, this.hass);
    const problem = this.problem(rule);
    if (problem) {
      this.error = problem;
      this.render();
      return;
    }
    const row = this.rows().find(item => item.key === this.selected);
    let next = structuredClone(this.configuration!);
    if (row?.legacy) next = promoteLegacyRule(next, row.legacy.device, row.legacy.index, rule);
    else {
      const rules = next.rules ?? [];
      const at = rules.findIndex(r => r.id === rule.id);
      next.rules = at >= 0 ? rules.map(r => (r.id === rule.id ? rule : r)) : [...rules, rule];
    }
    this.commit(next);
    this.back();
  }
  private back(): void {
    this.view = 'list';
    this.draft = undefined;
    this.selected = '';
    this.creatingFor = undefined;
    this.compare = undefined;
    this.picking = '';
    this.guide = 0;
    this.error = '';
    this.render();
  }
  private async removeRule(trigger: HTMLElement): Promise<void> {
    const row = this.rows().find(item => item.key === this.selected);
    if (!row) return;
    const ok = await confirmDialog(this.root, {
      title: t('¿Borrar alerta?'),
      message: t('Se puede deshacer. No se modifican dispositivos de Home Assistant.'),
      trigger,
    });
    if (!ok) return;
    const next = structuredClone(this.configuration!);
    if (row.legacy)
      next.catalog.devices.find(d => d.id === row.legacy!.device)!.display.alerts!.splice(row.legacy.index, 1);
    else next.rules = next.rules?.filter(r => r.id !== row.rule.id);
    this.commit(next);
    this.back();
  }
  private duplicate(): void {
    if (!this.draft) return;
    let index = 1;
    while (this.configuration?.rules?.some(r => r.id === `rule-${index}`)) index++;
    this.draft = {
      ...structuredClone(this.draft),
      id: `rule-${index}`,
      name: t('{name} (copia)', { name: this.draft.name }),
    };
    this.selected = '';
    this.render();
  }

  // Rendering -----------------------------------------------------------------

  private render(): void {
    if (!this.configuration) return;
    const body =
      this.view === 'edit' && this.draft
        ? this.editor(this.draft)
        : this.view === 'base'
          ? this.baseEditor()
          : this.list();
    this.root.innerHTML = `<style>${styles}${checkListStyles}</style>${body}<div class="guide-host"></div>`;
    this.bind();
    if (this.view === 'edit') this.paintPreview();
    this.paintGuide();
  }

  private list(): string {
    const rows = this.rows();
    const mine = rows.filter(row => !row.base);
    const base = rows.filter(row => row.base);
    const row = (item: Row) =>
      `<div class="li" data-level="${e(item.rule.level)}"><span class="dot" aria-hidden="true"></span><button type="button" class="t" data-open="${e(item.key)}"><b>${e(item.rule.name)}</b><span>${e(this.summary(item))}</span></button>${item.base ? ib(t('Cambiar límite'), 'mdi:pencil-outline', `data-open="${e(item.key)}"`) : ''}<input type="checkbox" role="switch" aria-label="${e(item.rule.name)}" data-toggle="${e(item.key)}"${item.rule.enabled ? ' checked' : ''}></div>`;
    return `<div class="lbl"><span>${e(t('Mis alertas'))}</span><span class="grow"></span>${this.undo ? ib(t('Deshacer'), 'mdi:undo', 'data-undo') : ''}${ib(t('Guía paso a paso'), 'mdi:school-outline', 'data-guide')}${ib(t('Nueva alerta'), 'mdi:plus', 'data-new')}</div><div class="list">${mine.map(row).join('') || `<p class="empty">—</p>`}</div>${base.length ? `<div class="lbl"><span>${e(t('Incluidas'))}</span></div><div class="list">${base.map(row).join('')}</div>` : ''}`;
  }

  private editor(rule: VisualRule): string {
    const binary = this.binary(rule);
    const compare = this.compareOf(rule);
    const source = rule.sources[0]?.reading;
    const unit = source ? this.unit(source) : '';
    const compares: [Compare, string, string][] = binary
      ? [
          ['on', 'mdi:checkbox-marked-circle-outline', 'Detectado'],
          ['off', 'mdi:checkbox-blank-circle-outline', 'Sin detectar'],
        ]
      : [
          ['lt', 'mdi:less-than', 'Menor que'],
          ['gt', 'mdi:greater-than', 'Mayor que'],
          ['out', 'mdi:arrow-expand-horizontal', 'Fuera de rango'],
        ];
    const number = (name: 'below' | 'above', label: string, value?: number) =>
      `<input type="number" step="any" name="${name}" value="${value ?? ''}" aria-label="${e(t(label))}">`;
    const limit = binary
      ? ''
      : `<span class="pill" id="g-val">${compare === 'out' ? `${number('below', 'Menos de', rule.below)}<span>–</span>${number('above', 'Más de', rule.above)}` : compare === 'gt' ? number('above', 'Más de', rule.above) : number('below', 'Menos de', rule.below)}${unit ? `<span class="u">${e(unit)}</span>` : ''}</span>`;
    const readingLabel = source
      ? `${readingName(source, this.hass)}${rule.sources.length > 1 ? ` +${rule.sources.length - 1}` : ''}`
      : t('Elegir lectura');
    const options = Object.keys(this.hass?.states ?? {}).filter(
      id =>
        /^(sensor|binary_sensor)\./.test(id) &&
        !this.hass?.entities?.[id]?.disabled_by &&
        !this.hass?.entities?.[id]?.hidden_by,
    );
    const readingPicker =
      this.picking === 'reading'
        ? `<div class="pop">${checkList(
            'sources',
            t('Lecturas'),
            [...new Set([...options, ...rule.sources.map(s => s.reading)])].map(id => ({
              id,
              name: readingName(id, this.hass),
            })),
            rule.sources.map(s => s.reading),
          )}</div>`
        : '';
    const devices = this.configuration!.catalog.devices;
    const symbolPicker =
      this.picking === 'symbol'
        ? `<div class="pop">${checkList(
            'symbols',
            t('Símbolos'),
            devices.map(d => ({ id: d.id, name: d.display.label })),
            rule.symbols,
          )}</div>`
        : '';
    const opts: ['badge' | 'highlight' | 'bar' | 'now', string, string, boolean][] = [
      ['badge', 'mdi:bell-badge-outline', 'Insignia en el símbolo', rule.badge !== false],
      ['highlight', 'mdi:selection-ellipse', 'Resaltar el símbolo', rule.highlight === true],
      ['bar', 'mdi:message-alert-outline', 'Mensaje en la barra de actividad', rule.bar !== false],
      ['now', 'mdi:view-dashboard-outline', 'Mostrar en Ahora', rule.now !== false],
    ];
    const existing = this.rows().some(item => item.key === this.selected);
    return `<div class="dh">${ib(t('Volver'), 'mdi:arrow-left', 'data-back')}<input class="title-in" name="name" maxlength="240" value="${e(rule.name)}" placeholder="${e(source ? readingName(source, this.hass) : t('Nueva alerta'))}" aria-label="${e(t('Nombre de la alerta'))}">${ib(t('Guía paso a paso'), 'mdi:school-outline', 'data-guide')}</div>
    <div class="dbody">
      <div class="lbl">${glyph('mdi:eye-outline')}<span>${e(t('Cuando'))}</span></div>
      <div class="sentence"><button type="button" class="pill" id="g-read" data-pick="reading" aria-expanded="${this.picking === 'reading'}" title="${e(t('Qué lectura mirar'))}">${glyph('mdi:gauge')}<span>${e(readingLabel)}</span>${glyph('mdi:chevron-down')}</button>
        <span class="seg" id="g-cmp" role="radiogroup" aria-label="${e(t('Condición'))}">${compares.map(([value, icon, label]) => `<button type="button" role="radio" data-compare="${value}" aria-checked="${compare === value}" aria-label="${e(t(label))}" title="${e(t(label))}">${glyph(icon)}</button>`).join('')}</span>
        ${limit}
        <span class="pill" id="g-dur" title="${e(t('Durante'))}">${glyph('mdi:timer-outline')}<input type="number" min="0" step="1" name="forMinutes" value="${rule.forMinutes ?? ''}" placeholder="0" aria-label="${e(t('Durante (minutos)'))}"><span class="u">min</span></span></div>
      ${readingPicker}
      <div class="lbl">${glyph('mdi:bell-outline')}<span>${e(t('Entonces'))}</span></div>
      <div id="g-sev" class="then"><div class="sev" role="radiogroup" aria-label="${e(t('Nivel'))}">${LEVELS.map(([value, icon, label]) => `<button type="button" role="radio" data-level="${value}" aria-checked="${rule.level === value}">${glyph(icon)}<span>${e(t(label))}</span></button>`).join('')}</div>
        <div class="row"><div class="seg">${opts.map(([key, icon, label, on]) => `<button type="button" data-opt="${key}" aria-pressed="${on}" aria-label="${e(t(label))}" title="${e(t(label))}">${glyph(icon)}</button>`).join('')}</div><span class="grow"></span><label class="swc" title="${e(t('Color'))}"><input type="color" name="color" value="${e(rule.color ?? '#4f7d60')}" aria-label="${e(t('Color'))}"></label></div></div>
      <div class="lbl">${glyph('mdi:map-marker-outline')}<span>${e(t('En'))}</span></div>
      <div class="chips" id="g-where">${rule.symbols
        .map(id => devices.find(d => d.id === id))
        .filter(d => !!d)
        .map(
          d =>
            `<span class="chip">${glyph(d!.display.icon)}<span>${e(d!.display.label)}</span><button type="button" data-unsymbol="${e(d!.id)}" aria-label="${e(t('Quitar {name}', { name: d!.display.label }))}">${glyph('mdi:close')}</button></span>`,
        )
        .join(
          '',
        )}<button type="button" class="chip add" data-pick="symbol" aria-expanded="${this.picking === 'symbol'}" aria-label="${e(t('Agregar símbolo'))}" title="${e(t('Agregar símbolo'))}">${glyph('mdi:plus')}</button></div>
      ${symbolPicker}
      <div class="preview" id="g-prev" role="status"></div>
      <p class="error" role="alert">${e(this.error)}</p>
    </div>
    <div class="dfoot">${existing ? ib(t('Borrar alerta'), 'mdi:trash-can-outline', 'data-delete', 'danger') : ''}${existing ? ib(t('Duplicar'), 'mdi:content-copy', 'data-duplicate') : ''}<span class="grow"></span>${ib(t('Listo'), 'mdi:check', 'data-save', 'primary')}</div>`;
  }

  /** The value right now, and whether the alert would show. */
  private paintPreview(): void {
    const host = this.root.querySelector<HTMLElement>('#g-prev');
    const rule = this.draft;
    if (!host || !rule) return;
    const source = rule.sources[0]?.reading;
    const symbol = this.configuration!.catalog.devices.find(d => d.id === rule.symbols[0]);
    let on = false;
    try {
      if (!this.problem({ ...rule, name: rule.name || 'x' }))
        on =
          evaluateVisualRules([{ ...rule, enabled: true }], this.configuration!.catalog.devices, this.hass, Date.now())
            .results.length > 0;
    } catch {
      on = false;
    }
    const entity = source ? this.hass?.states[source] : undefined;
    const since = entity?.last_changed
      ? Math.max(0, Math.round((Date.now() - Date.parse(entity.last_changed)) / 60000))
      : null;
    const missing = !entity || ['unknown', 'unavailable'].includes(entity.state);
    const value = missing
      ? t('Sin dato')
      : `${formatReading(entity!.state)}${source && this.unit(source) ? ` ${this.unit(source)}` : ''}`;
    const ago =
      since === null
        ? ''
        : since < 1
          ? ` · ${t('recién')}`
          : since < 120
            ? ` · ${t('hace {count} min', { count: since })}`
            : ` · ${t('hace {count} h', { count: Math.round(since / 60) })}`;
    host.dataset.level = rule.level;
    host.classList.toggle('on', on);
    host.innerHTML = `<span class="psym" style="${rule.color ? `--c:${e(rule.color)}` : ''}">${glyph(symbol?.display.icon ?? 'mdi:bell-outline')}${on && rule.badge !== false ? `<span class="bdg">${glyph('mdi:exclamation-thick')}</span>` : ''}</span><div><b>${e(t(on ? 'Ahora se activaría' : 'Ahora no se activa'))}</b><small>${e(source ? `${readingName(source, this.hass)} ${value}${ago}` : t('Elegí qué lectura mirar.'))}</small></div>`;
  }

  /** An included alert: its limit and the symbols it covers. */
  private baseEditor(): string {
    const row = this.rows().find(item => item.key === this.selected);
    if (!row?.base) return this.list();
    const kind = row.base.kind;
    const configuration = this.configuration!;
    const applicable = configuration.catalog.devices.filter(device => appliesTo(kind, device, this.hass));
    const chosen = applicable
      .filter(device =>
        kind === 'highlight' ? device.display.highlight === true : !device.display.disabledBaseRules?.includes(kind),
      )
      .map(device => device.id);
    const rules = configuration.baseRules ?? {};
    const limit =
      kind === 'battery'
        ? `<div class="sentence"><span class="pill">${glyph('mdi:battery-low')}<span>&lt;</span><input type="number" name="base-limit" min="1" max="100" step="1" value="${rules.battery?.below ?? 15}" aria-label="${e(t('Avisar con menos de (%)'))}"><span class="u">%</span></span></div>`
        : kind === 'unavailable'
          ? `<div class="sentence"><span class="pill">${glyph('mdi:lan-disconnect')}<span>&gt;</span><input type="number" name="base-limit" min="1" max="1440" step="1" value="${rules.unavailable?.minutes ?? 10}" aria-label="${e(t('Avisar después de (minutos)'))}"><span class="u">min</span></span></div>`
          : '';
    return `<div class="dh">${ib(t('Volver'), 'mdi:arrow-left', 'data-back')}<b class="title">${e(row.rule.name)}</b></div><div class="dbody">${limit}${checkList(
      'base-devices',
      kind === 'highlight' ? t('Símbolos que se resaltan') : t('Símbolos que cubre'),
      applicable.map(device => ({ id: device.id, name: device.display.label })),
      chosen,
    )}</div><div class="dfoot"><span class="grow"></span>${ib(t('Listo'), 'mdi:check', 'data-base-apply', 'primary')}</div>`;
  }
  private applyBase(): void {
    const row = this.rows().find(item => item.key === this.selected);
    if (!row?.base) return;
    const kind = row.base.kind;
    const next = structuredClone(this.configuration!);
    const included = new Set(
      [...this.root.querySelectorAll<HTMLInputElement>('input[data-check-field="base-devices"]:checked')].map(
        box => box.value,
      ),
    );
    for (const device of next.catalog.devices) {
      if (!appliesTo(kind, device, this.hass)) continue;
      if (kind === 'highlight') {
        if (included.has(device.id)) device.display.highlight = true;
        else if (device.display.highlight !== undefined) device.display.highlight = false;
        continue;
      }
      const disabled = new Set(device.display.disabledBaseRules ?? []);
      if (included.has(device.id)) disabled.delete(kind);
      else disabled.add(kind);
      if (disabled.size) device.display.disabledBaseRules = [...disabled];
      else delete device.display.disabledBaseRules;
    }
    const limit = Number(this.root.querySelector<HTMLInputElement>('[name=base-limit]')?.value);
    if (kind === 'battery' && Number.isFinite(limit) && limit >= 1 && limit <= 100)
      next.baseRules = { ...next.baseRules, battery: { ...next.baseRules?.battery, below: Math.round(limit) } };
    if (kind === 'unavailable' && Number.isFinite(limit) && limit >= 1 && limit <= 1440)
      next.baseRules = {
        ...next.baseRules,
        unavailable: { ...next.baseRules?.unavailable, minutes: Math.round(limit) },
      };
    this.commit(next);
    this.back();
  }

  // The guide: five steps that point at each part ---------------------------

  private paintGuide(): void {
    const host = this.root.querySelector<HTMLElement>('.guide-host');
    this.root.querySelectorAll('.gfocus').forEach(node => node.classList.remove('gfocus'));
    if (!host) return;
    if (!this.guide || this.view !== 'edit') {
      host.innerHTML = '';
      return;
    }
    const [selector, title, text] = GUIDE[this.guide - 1];
    const target = this.root.querySelector<HTMLElement>(selector);
    target?.classList.add('gfocus');
    target?.scrollIntoView({ block: 'nearest' });
    host.innerHTML = `<div class="guide" role="dialog" aria-label="${e(t('Guía'))}"><b>${e(t(title))}</b><p>${e(t(text))}</p><footer><span>${this.guide} / ${GUIDE.length}</span><span class="grow"></span>${this.guide > 1 ? `<button type="button" class="ghost" data-guide-step="-1">${e(t('Anterior'))}</button>` : `<button type="button" class="ghost" data-guide-step="0">${e(t('Salir'))}</button>`}<button type="button" class="primary" data-guide-step="${this.guide < GUIDE.length ? 1 : 0}">${e(t(this.guide < GUIDE.length ? 'Siguiente' : 'Listo'))}</button></footer></div>`;
    host.querySelectorAll<HTMLButtonElement>('[data-guide-step]').forEach(button =>
      button.addEventListener('click', () => {
        const step = Number(button.dataset.guideStep);
        this.guide = step === 0 ? 0 : this.guide + step;
        this.paintGuide();
      }),
    );
  }

  // Events --------------------------------------------------------------------

  private bind(): void {
    const root = this.root;
    const on = (selector: string, work: (element: HTMLElement) => void, type = 'click') =>
      root
        .querySelectorAll<HTMLElement>(selector)
        .forEach(element => element.addEventListener(type, () => work(element)));
    const rows = this.rows();
    on('[data-new]', () => {
      this.creatingFor = undefined;
      this.newRule();
    });
    on('[data-open]', element => {
      const row = rows.find(item => item.key === element.dataset.open);
      if (row) this.open(row);
    });
    on('[data-toggle]', element => this.toggle(rows.find(row => row.key === element.dataset.toggle)!), 'change');
    on('[data-undo]', () => {
      if (!this.undo) return;
      const next = this.undo;
      this.undo = structuredClone(this.configuration);
      this.configuration = next;
      this.changed?.(next);
      this.render();
    });
    on('[data-guide]', () => {
      if (this.view !== 'edit') this.newRule();
      this.guide = 1;
      this.paintGuide();
    });
    on('[data-back]', () => this.back());
    on('[data-base-apply]', () => this.applyBase());
    on('[data-save]', () => this.save());
    on('[data-delete]', element => void this.removeRule(element));
    on('[data-duplicate]', () => this.duplicate());
    // Search inside the pickers.
    root.querySelectorAll<HTMLInputElement>('input[data-check-search]').forEach(
      search =>
        (search.oninput = () => {
          const query = search.value.trim().toLowerCase();
          search
            .closest('.check-list')
            ?.querySelectorAll<HTMLElement>('label[data-name]')
            .forEach(row => (row.hidden = !!query && !row.dataset.name!.includes(query)));
        }),
    );
    const rule = this.draft;
    if (!rule) return;
    const keep = (paint = false) => {
      this.error = '';
      if (paint) this.render();
      else this.paintPreview();
    };
    on(
      '[name=name]',
      element => {
        rule.name = (element as HTMLInputElement).value;
      },
      'input',
    );
    on('[data-pick]', element => {
      const what = element.dataset.pick as 'reading' | 'symbol';
      this.picking = this.picking === what ? '' : what;
      this.render();
    });
    on(
      'input[data-check-field=sources]',
      () => {
        rule.sources = [...root.querySelectorAll<HTMLInputElement>('input[data-check-field=sources]:checked')].map(
          box => ({
            reading: box.value,
            ...(this.hass?.entities?.[box.value]?.device_id
              ? { deviceId: this.hass.entities[box.value].device_id! }
              : {}),
          }),
        );
        // A detection has a state, a number has limits.
        if (this.binary(rule)) {
          delete rule.below;
          delete rule.above;
          rule.state = rule.state ?? 'on';
        } else delete rule.state;
        const label = root.querySelector('#g-read span');
        if (label && rule.sources[0])
          label.textContent = `${readingName(rule.sources[0].reading, this.hass)}${rule.sources.length > 1 ? ` +${rule.sources.length - 1}` : ''}`;
        keep();
      },
      'change',
    );
    on(
      'input[data-check-field=symbols]',
      () => {
        rule.symbols = [...root.querySelectorAll<HTMLInputElement>('input[data-check-field=symbols]:checked')].map(
          box => box.value,
        );
        keep();
      },
      'change',
    );
    on('[data-unsymbol]', element => {
      rule.symbols = rule.symbols.filter(id => id !== element.dataset.unsymbol);
      keep(true);
    });
    on('[data-compare]', element => {
      const compare = element.dataset.compare as Compare;
      this.compare = compare;
      if (compare === 'on' || compare === 'off') rule.state = compare;
      else {
        const value = rule.below ?? rule.above;
        if (compare === 'lt') {
          rule.below = rule.below ?? value;
          delete rule.above;
        } else if (compare === 'gt') {
          rule.above = rule.above ?? value;
          delete rule.below;
        } else {
          rule.below = rule.below ?? value ?? 0;
          rule.above = rule.above ?? value ?? 0;
        }
        if (rule.below === undefined) delete rule.below;
        if (rule.above === undefined) delete rule.above;
      }
      keep(true);
    });
    on(
      '[name=below],[name=above],[name=forMinutes]',
      element => {
        const input = element as HTMLInputElement;
        const key = input.name as 'below' | 'above' | 'forMinutes';
        const number = Number(input.value);
        if (input.value.trim() === '' || !Number.isFinite(number) || (key === 'forMinutes' && number < 0))
          delete rule[key];
        else rule[key] = key === 'forMinutes' ? Math.round(number) : number;
        if (key === 'forMinutes' && !rule.forMinutes) delete rule.forMinutes;
        keep();
      },
      'input',
    );
    on('[data-level]', element => {
      rule.level = element.dataset.level as VisualRule['level'];
      keep(true);
    });
    on('[data-opt]', element => {
      const key = element.dataset.opt as 'badge' | 'highlight' | 'bar' | 'now';
      const now = key === 'highlight' ? rule.highlight === true : rule[key] !== false;
      rule[key] = !now;
      keep(true);
    });
    on(
      '[name=color]',
      element => {
        rule.color = (element as HTMLInputElement).value;
        keep();
      },
      'input',
    );
  }
}
if (!customElements.get('homemanager-rules-editor')) customElements.define('homemanager-rules-editor', RulesEditor);

const styles = `
:host{display:block;container-type:inline-size;color:var(--hm-text);position:relative}
*{box-sizing:border-box}
button,input{font:inherit;color:inherit}
[hidden]{display:none!important}
.lbl{display:flex;align-items:center;gap:6px;margin:14px 0 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--hm-muted)}
.lbl:first-child{margin-top:2px}.lbl ha-icon{--mdc-icon-size:16px}.grow{flex:1}
.ib{display:grid;place-items:center;width:36px;height:36px;min-height:36px;padding:0;border:0;border-radius:10px;background:transparent;color:var(--hm-ink);cursor:pointer;flex:none}
.ib:hover{background:var(--hm-surface-2)}.ib ha-icon{--mdc-icon-size:20px}.ib.danger{color:var(--hm-alert)}
.ib.primary{background:var(--hm-brand);color:var(--hm-on-accent);width:44px;height:44px;border-radius:50%}
.list{display:grid;gap:2px}
.li{display:flex;align-items:center;gap:8px;padding:4px 4px 4px 10px;border-radius:12px}
.li:hover{background:var(--hm-surface-2)}
.dot{width:10px;height:10px;border-radius:50%;flex:none;background:var(--hm-warn)}
[data-level=alert] .dot{background:var(--hm-alert)}[data-level=indicator] .dot{background:var(--hm-accent,var(--hm-brand))}
.li .t{flex:1;min-width:0;display:grid;gap:1px;text-align:left;border:0;background:transparent;padding:6px 0;cursor:pointer}
.li .t b{font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.li .t span{font-size:12px;color:var(--hm-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{margin:4px 10px;color:var(--hm-muted)}
input[role=switch]{appearance:none;-webkit-appearance:none;width:42px;min-width:42px;height:24px;margin:0;border-radius:12px;background:var(--hm-line);position:relative;cursor:pointer;flex:none}
input[role=switch]::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--hm-surface);box-shadow:var(--hm-shadow);transition:left .15s}
input[role=switch]:checked{background:var(--hm-brand)}input[role=switch]:checked::after{left:21px}
.dh{display:flex;align-items:center;gap:6px;padding-bottom:8px;border-bottom:1px solid var(--hm-line)}
.title-in{flex:1;min-width:0;min-height:40px;padding:4px 10px;border:1px solid transparent;border-radius:10px;background:transparent;font-size:16px;font-weight:500}
.title-in:hover,.title-in:focus{border-color:var(--hm-line);background:var(--hm-surface)}
.dh .title{flex:1;font-size:16px;font-weight:500}
.dbody{display:flex;flex-direction:column;gap:4px;padding:6px 0 10px}
.sentence{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.pill{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 10px;border:1px solid var(--hm-line);border-radius:999px;background:var(--hm-surface);font-size:13px}
button.pill{cursor:pointer}.pill ha-icon{--mdc-icon-size:17px;color:var(--hm-brand)}
.pill input{width:64px;min-height:32px;border:0;background:transparent;padding:0;text-align:right}
.pill input:focus{outline:none}.pill .u{color:var(--hm-muted)}
.seg{display:inline-flex;gap:2px;padding:3px;border-radius:12px;background:var(--hm-surface-2)}
.seg button{display:grid;place-items:center;width:34px;height:32px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--hm-muted);cursor:pointer}
.seg button[aria-checked=true],.seg button[aria-pressed=true]{background:var(--hm-surface);color:var(--hm-ink);box-shadow:var(--hm-shadow)}
.seg ha-icon{--mdc-icon-size:18px}
.then{display:flex;flex-direction:column;gap:10px}.then .row{display:flex;align-items:center;gap:8px}
.sev{display:flex;gap:6px;flex-wrap:wrap}
.sev button{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border:1px solid var(--hm-line);border-radius:999px;background:var(--hm-surface);cursor:pointer}
.sev button[data-level=warning]{--c:var(--hm-warn)}.sev button[data-level=alert]{--c:var(--hm-alert)}.sev button[data-level=indicator]{--c:var(--hm-accent,var(--hm-brand))}
.sev button ha-icon{--mdc-icon-size:17px;color:var(--c)}
.sev button[aria-checked=true]{border-color:var(--c);background:color-mix(in srgb,var(--c) 14%,var(--hm-surface))}
.swc{position:relative;display:block;width:30px;height:30px;border-radius:50%;overflow:hidden;border:1px solid var(--hm-line)}
.swc input{position:absolute;inset:-6px;width:calc(100% + 12px);height:calc(100% + 12px);border:0;padding:0;cursor:pointer}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 4px 0 10px;border:1px solid var(--hm-line);border-radius:999px;background:var(--hm-surface);font-size:13px}
.chip ha-icon{--mdc-icon-size:16px}.chip button{display:grid;place-items:center;width:26px;height:26px;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer;color:var(--hm-muted)}
.chip.add{padding:0 10px;cursor:pointer;color:var(--hm-brand)}
.pop{padding:8px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);margin:4px 0}
.pop input[type=search]{min-height:36px;padding:4px 10px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-bg)}
.pop legend{display:none}
.preview{display:flex;align-items:center;gap:12px;margin-top:12px;padding:12px;border-radius:14px;background:var(--hm-surface-2)}
.preview b{display:block;font-weight:500}.preview small{color:var(--hm-muted)}
.psym{position:relative;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--hm-surface);color:var(--c,var(--hm-brand));box-shadow:var(--hm-shadow);flex:none}
.preview.on[data-level=warning] .psym{box-shadow:0 0 0 3px var(--hm-warn)}.preview.on[data-level=alert] .psym{box-shadow:0 0 0 3px var(--hm-alert)}.preview.on[data-level=indicator] .psym{box-shadow:0 0 0 3px var(--hm-accent,var(--hm-brand))}
.bdg{position:absolute;top:-4px;right:-4px;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--hm-warn);color:#fff}
.preview[data-level=alert] .bdg{background:var(--hm-alert)}.bdg ha-icon{--mdc-icon-size:13px}
.error{margin:6px 0 0;color:var(--hm-alert);font-size:13px}.error:empty{display:none}
.dfoot{display:flex;align-items:center;gap:6px;padding-top:10px;border-top:1px solid var(--hm-line)}
.gfocus{position:relative;z-index:2;box-shadow:0 0 0 3px var(--hm-brand)!important;border-radius:12px}
.guide{position:sticky;bottom:8px;z-index:5;margin-top:10px;padding:14px;border-radius:14px;background:var(--hm-ink);color:var(--hm-bg);box-shadow:var(--hm-shadow)}
.guide p{margin:6px 0 10px;font-size:13px;line-height:1.45;opacity:.9}
.guide footer{display:flex;align-items:center;gap:8px;font-size:12px}
.guide button{min-height:32px;padding:0 12px;border:0;border-radius:9px;cursor:pointer}
.guide .primary{background:var(--hm-brand);color:var(--hm-on-accent)}.guide .ghost{background:transparent;color:inherit;opacity:.85}
`;
