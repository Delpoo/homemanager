import { checkList, checkListStyles } from './check-list.js';
import { t } from '../i18n/index.js';
import { escapeHTML as e, type Configuration } from '../card/types.js';
import { readingName } from '../model/names.js';
import { evaluateVisualRules, promoteLegacyRule, type VisualRule } from '../model/visual-rules.js';
import type { ModelHass } from '../model/types.js';
import { confirmDialog } from './confirm-dialog.js';
import { appliesTo, limitsOf } from '../model/base-rules.js';

type BaseKind = 'safety' | 'battery' | 'unavailable' | 'highlight';

interface Row {
  key: string;
  rule: VisualRule;
  legacy?: { device: string; index: number };
  base?: { kind: BaseKind };
}
/** One retained editor for global, legacy and automatic rules. No service API is available here. */
export class RulesEditor extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private configuration?: Configuration;
  private hass?: ModelHass;
  private changed?: (next: Configuration) => void;
  private selected = '';
  private draft?: VisualRule;
  private undo?: Configuration;
  private creatingFor?: string;
  configure(configuration: Configuration, hass: ModelHass | undefined, changed: (next: Configuration) => void): void {
    const repaint = !this.configuration || JSON.stringify(this.configuration) !== JSON.stringify(configuration);
    this.configuration = structuredClone(configuration);
    this.hass = hass;
    this.changed = changed;
    if (repaint || !this.root.childElementCount) this.render();
  }
  createFor(id?: string): void {
    this.creatingFor = id;
    this.newRule();
  }
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
    // One row per automatic rule, not one per device (#60).
    const limits = limitsOf(this.configuration.baseRules);
    const devices = this.configuration.catalog.devices;
    const names: Record<BaseKind, string> = {
      battery: t('Batería baja · menos de {value} %', {
        value: limits.battery ?? this.configuration.baseRules?.battery?.below ?? 15,
      }),
      unavailable: t('Sin conexión · más de {value} minutos', {
        value: limits.unavailable ?? this.configuration.baseRules?.unavailable?.minutes ?? 10,
      }),
      safety: t('Detección de seguridad'),
      highlight: t('Resaltar al detectar'),
    };
    for (const kind of ['safety', 'battery', 'unavailable', 'highlight'] as const) {
      const applicable = devices.filter(device => appliesTo(kind, device, this.hass));
      if (!applicable.length) continue;
      rows.push({
        key: `base:${kind}`,
        base: { kind },
        rule: {
          id: `base-${kind}`,
          name: names[kind],
          enabled:
            kind === 'highlight'
              ? applicable.some(device => device.display.highlight === true)
              : kind === 'safety'
                ? limits.safety
                : limits[kind] !== null,
          sources: [],
          symbols: applicable.map(device => device.id),
          level: kind === 'safety' ? 'alert' : 'warning',
        },
      });
    }
    return rows;
  }
  /** A base rule: its switch, its limit and the symbols it covers (#60). */
  private baseForm(kind: BaseKind): string {
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
        ? `<label>${e(t('Avisar con menos de (%)'))}<input type="number" name="base-limit" min="1" max="100" step="1" value="${rules.battery?.below ?? 15}"></label>`
        : kind === 'unavailable'
          ? `<label>${e(t('Avisar después de (minutos)'))}<input type="number" name="base-limit" min="1" max="1440" step="1" value="${rules.unavailable?.minutes ?? 10}"></label>`
          : '';
    const explain: Record<BaseKind, string> = {
      battery: 'Sólo cuenta en los símbolos con una lectura de batería.',
      unavailable: 'Avisa cuando un dispositivo deja de responder durante ese tiempo.',
      safety: 'Fugas, humo, gas y otras detecciones de seguridad de los sensores binarios.',
      highlight: 'Resalta el símbolo mientras su sensor detecta algo. Elegí en cuáles.',
    };
    return `<form class="base-form" data-base-kind="${kind}"><p class="note">${e(t(explain[kind]))}</p>${limit}${checkList(
      'base-devices',
      kind === 'highlight' ? t('Símbolos que se resaltan') : t('Símbolos que cubre'),
      applicable.map(device => ({ id: device.id, name: device.display.label })),
      chosen,
    )}<button type="button" data-base-apply class="primary">${e(t('Aplicar'))}</button></form>`;
  }
  private applyBase(form: HTMLFormElement): void {
    const kind = form.dataset.baseKind as BaseKind;
    const next = structuredClone(this.configuration!);
    const included = new Set(
      [...form.querySelectorAll<HTMLInputElement>('input[data-check-field="base-devices"]:checked')].map(
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
      // Exclusions stay per device, as before (disabledBaseRules).
      const disabled = new Set(device.display.disabledBaseRules ?? []);
      if (included.has(device.id)) disabled.delete(kind);
      else disabled.add(kind);
      if (disabled.size) device.display.disabledBaseRules = [...disabled];
      else delete device.display.disabledBaseRules;
    }
    const limit = Number(form.querySelector<HTMLInputElement>('[name=base-limit]')?.value);
    if (kind === 'battery' && Number.isFinite(limit) && limit >= 1 && limit <= 100) {
      next.baseRules = { ...next.baseRules, battery: { ...next.baseRules?.battery, below: Math.round(limit) } };
    }
    if (kind === 'unavailable' && Number.isFinite(limit) && limit >= 1 && limit <= 1440) {
      next.baseRules = {
        ...next.baseRules,
        unavailable: { ...next.baseRules?.unavailable, minutes: Math.round(limit) },
      };
    }
    this.commit(next);
  }
  private newRule(): void {
    let index = 1;
    while (this.configuration?.rules?.some(r => r.id === `rule-${index}`)) index++;
    this.selected = '';
    this.draft = {
      id: `rule-${index}`,
      name: '',
      enabled: true,
      sources: [],
      symbols: this.creatingFor ? [this.creatingFor] : [],
      level: 'warning',
    };
    this.render();
  }
  private commit(next: Configuration): void {
    this.undo = structuredClone(this.configuration);
    this.configuration = next;
    this.draft = undefined;
    this.changed?.(next);
    this.render();
  }
  private toggle(row: Row): void {
    const next = structuredClone(this.configuration!);
    if (row.base) {
      const kind = row.base.kind;
      if (kind === 'highlight') {
        // Off turns every highlight off; on turns it on where its sensor can detect.
        for (const d of next.catalog.devices)
          if (appliesTo('highlight', d, this.hass)) d.display.highlight = !row.rule.enabled;
      } else next.baseRules = { ...next.baseRules, [kind]: { ...next.baseRules?.[kind], enabled: !row.rule.enabled } };
    } else if (row.legacy)
      next.catalog.devices.find(d => d.id === row.legacy!.device)!.display.alerts![row.legacy.index].enabled =
        !row.rule.enabled;
    else next.rules!.find(rule => rule.id === row.rule.id)!.enabled = !row.rule.enabled;
    this.commit(next);
  }
  private render(): void {
    if (!this.configuration) return;
    const rows = this.rows(),
      row = rows.find(row => row.key === this.selected);
    const rule = this.draft ?? row?.rule;
    const options = Object.keys(this.hass?.states ?? {}).filter(
      id =>
        /^(sensor|binary_sensor)\./.test(id) &&
        !this.hass?.entities?.[id]?.disabled_by &&
        !this.hass?.entities?.[id]?.hidden_by,
    );
    const number = (name: string, label: string, value?: number) =>
      `<label>${e(t(label))}<input type="number" name="${name}" step="any"${name === 'forMinutes' ? ' min="0"' : ''} value="${value ?? ''}"></label>`;
    const check = (name: string, label: string, value: boolean) =>
      `<label class="switch"><span>${e(t(label))}</span><input type="checkbox" name="${name}"${value ? ' checked' : ''}></label>`;
    this.root.innerHTML = `<style>${checkListStyles}.level-dot{flex:none;margin-left:12px;width:10px;height:10px;border-radius:50%;background:var(--hm-muted)}.row[data-level=alert] .level-dot{background:var(--hm-alert)}.row[data-level=warning] .level-dot{background:var(--hm-warn)}.row[data-level=indicator] .level-dot{background:var(--hm-accent)}input[role=switch]{appearance:none;-webkit-appearance:none;width:44px;min-width:44px;height:26px;min-height:26px;padding:0;border-radius:13px;background:var(--hm-line);position:relative;cursor:pointer}input[role=switch]::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:var(--hm-surface);box-shadow:var(--hm-shadow);transition:left .15s}input[role=switch]:checked{background:var(--hm-accent)}input[role=switch]:checked::after{left:21px}:host{display:block;color:var(--hm-text)}*{box-sizing:border-box}button,input,select{font:inherit;color:inherit;background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:10px;min-height:44px;padding:8px}button{cursor:pointer}[hidden]{display:none!important}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid var(--hm-brand)}.layout{display:grid;grid-template-columns:minmax(260px,320px) minmax(0,720px);gap:18px}.list{display:flex;flex-direction:column;gap:8px;max-height:calc(100dvh - 220px);overflow:auto;overscroll-behavior:contain;align-self:start}.row{display:flex;align-items:center;border:1px solid var(--hm-line);border-radius:12px}.row button{flex:1;min-width:0;text-align:left;border:0;background:transparent}.row input{margin:8px;width:20px;min-height:20px;flex:none;accent-color:var(--hm-brand)}.row[aria-current=true]{background:color-mix(in srgb,var(--hm-brand) 12%,var(--hm-surface))}small{display:block;color:var(--hm-muted)}form{display:grid;gap:14px}label{display:grid;gap:6px}input,select{max-width:100%;width:100%}select[multiple]{height:125px}.conditions{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}fieldset{border:1px solid var(--hm-line);border-radius:14px;padding:14px;display:grid;gap:10px;min-width:0}.switch{display:flex;align-items:center;justify-content:space-between}.switch input{width:22px;min-height:24px}.actions{display:flex;gap:8px;flex-wrap:wrap}.note{font-size:12px;color:var(--hm-muted);line-height:1.5}.error{color:var(--hm-alert)}@media(max-width:850px){.layout{grid-template-columns:1fr}.list{max-height:220px;overflow:auto}.conditions{grid-template-columns:1fr}}</style>
    <p class="note">${e(t('Las reglas sólo avisan e indican mientras la app está abierta. No envían comandos ni notificaciones.'))}</p><div class="layout"><div class="list"><button type="button" data-new>${e(t('+ Nueva regla'))}</button>${rows.map(item => `<div class="row" aria-current="${item.key === this.selected}" data-level="${e(item.rule.level)}"><span class="level-dot" aria-hidden="true"></span><button type="button" data-edit="${e(item.key)}">${e(item.rule.name)}<small>${e(t(item.base ? 'Regla base' : item.legacy ? 'Aviso conservado' : item.rule.level === 'indicator' ? 'Sólo indicador' : item.rule.level === 'alert' ? 'Alerta' : 'Aviso'))}</small></button><input type="checkbox" role="switch" aria-label="${e(item.rule.name)}" data-toggle="${e(item.key)}"${item.rule.enabled ? ' checked' : ''}></div>`).join('')}<button type="button" data-undo${this.undo ? '' : ' hidden'}>${e(t('Deshacer regla'))}</button></div><div>${
      row?.base
        ? this.baseForm(row.base.kind)
        : rule
          ? `<form><label>${e(t('Nombre de la regla'))}<input name="name" maxlength="240" value="${e(rule.name)}" required></label><div class="conditions"><fieldset><legend>${e(t('Cuando'))}</legend>${checkList(
              'sources',
              t('Lecturas del grupo'),
              [...new Set([...options, ...rule.sources.map(s => s.reading)])].map(id => ({
                id,
                name: readingName(id, this.hass),
              })),
              rule.sources.map(s => s.reading),
            )}<p class="note">${e(t('Se cumple si cualquiera de las lecturas elegidas cumple la condición.'))}</p>${number('below', 'Menos de', rule.below)}${number('above', 'Más de', rule.above)}<label>${e(t('Detección'))}<select name="state"><option value="on"${rule.state !== 'off' ? ' selected' : ''}>${e(t('Detectado / abierto'))}</option><option value="off"${rule.state === 'off' ? ' selected' : ''}>${e(t('Sin detectar / cerrado'))}</option></select></label>${number('forMinutes', 'Durante (minutos)', rule.forMinutes)}<output data-preview aria-live="polite"></output></fieldset><fieldset><legend>${e(t('Entonces se ve'))}</legend><label>${e(t('Nivel'))}<select name="level">${['alert', 'warning', 'indicator'].map(level => `<option value="${level}"${level === rule.level ? ' selected' : ''}>${e(t(level === 'alert' ? 'Alerta' : level === 'warning' ? 'Aviso' : 'Sólo indicador'))}</option>`).join('')}</select></label>${check('badge', 'Insignia en el símbolo', rule.badge !== false)}${check('highlight', 'Resaltar símbolo', rule.highlight === true)}<label>${e(t('Color'))}<input type="color" name="color" value="${e(rule.color ?? '#4f7d60')}"></label>${check('bar', 'Mensaje en la barra', rule.bar !== false)}${check('now', 'Aparece en Ahora', rule.now !== false)}</fieldset></div><fieldset><legend>${e(t('Se muestra en estos símbolos'))}</legend>${this.configuration.catalog.devices.map(d => check(`symbol:${d.id}`, d.display.label, rule.symbols.includes(d.id))).join('')}<p class="note">${e(t('Sin símbolos también puede aparecer en la barra y en Ahora.'))}</p></fieldset><div class="error" role="status"></div><div class="actions"><button type="submit">${e(t('Guardar regla'))}</button>${row ? `<button type="button" data-delete>${e(t('Borrar regla'))}</button>` : ''}</div></form>`
          : `<p>${e(t('Elegí una regla o creá una nueva.'))}</p>`
    }</div></div>`;
    this.root.querySelector('[data-new]')?.addEventListener('click', () => this.newRule());
    const baseForm = this.root.querySelector<HTMLFormElement>('form.base-form');
    baseForm?.querySelector('[data-base-apply]')?.addEventListener('click', () => this.applyBase(baseForm));
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-edit]'))
      button.onclick = () => {
        this.selected = button.dataset.edit!;
        this.draft = undefined;
        this.render();
      };
    for (const input of this.root.querySelectorAll<HTMLInputElement>('[data-toggle]'))
      input.onchange = () => this.toggle(rows.find(row => row.key === input.dataset.toggle)!);
    this.root.querySelector('[data-undo]')?.addEventListener('click', () => {
      if (this.undo) {
        const next = this.undo;
        this.undo = structuredClone(this.configuration);
        this.configuration = next;
        this.draft = undefined;
        this.changed?.(next);
        this.render();
      }
    });
    this.root.querySelector('[data-delete]')?.addEventListener(
      'click',
      event =>
        void confirmDialog(this.root, {
          title: t('¿Borrar regla?'),
          message: t('Se puede deshacer. No se modifican dispositivos de Home Assistant.'),
          trigger: event.target as HTMLElement,
        }).then(ok => {
          if (!ok || !row) return;
          const next = structuredClone(this.configuration!);
          if (row.legacy)
            next.catalog.devices.find(d => d.id === row.legacy!.device)!.display.alerts!.splice(row.legacy.index, 1);
          else next.rules = next.rules?.filter(r => r.id !== row.rule.id);
          this.selected = '';
          this.commit(next);
        }),
    );
    const form = this.root.querySelector('form');
    // The readings are a check list with a search box (#62).
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
    const preview = () => {
      if (!form || !rule) return;
      try {
        const selected = [...form.querySelectorAll<HTMLInputElement>('input[data-check-field=sources]:checked')];
        const binary = selected[0]?.value.startsWith('binary_sensor.');
        for (const name of ['below', 'above']) {
          const field = form.querySelector<HTMLInputElement>(`[name=${name}]`)!;
          field.closest('label')!.hidden = !!binary;
          field.disabled = !!binary;
        }
        form.querySelector('[name=state]')!.closest('label')!.hidden = !binary;
        const value = this.readForm(form, rule);
        const result = evaluateVisualRules([value], this.configuration!.catalog.devices, this.hass, Date.now());
        form.querySelector('output')!.textContent =
          value.sources
            .map(s => `${readingName(s.reading, this.hass)}: ${this.hass?.states[s.reading]?.state ?? t('Sin dato')}`)
            .join(' · ') +
          ' · ' +
          t(result.results.length ? 'Se cumple ahora' : 'No se cumple ahora');
      } catch {
        form.querySelector('output')!.textContent = t('Completá una condición para ver la vista previa.');
      }
    };
    form?.addEventListener('input', preview);
    form?.addEventListener('change', preview);
    preview();
    form?.addEventListener('submit', event => {
      event.preventDefault();
      if (!rule) return;
      try {
        const value = this.readForm(form, rule);
        let next = structuredClone(this.configuration!);
        if (row?.legacy) {
          next = promoteLegacyRule(next, row.legacy.device, row.legacy.index, value);
        } else {
          next.rules = [...(next.rules ?? []).filter(r => r.id !== value.id), value];
        }
        this.selected = row?.legacy ? next.rules!.at(-1)!.id : value.id;
        this.commit(next);
      } catch (error) {
        form.querySelector('.error')!.textContent = t(error instanceof Error ? error.message : String(error));
      }
    });
  }
  private readForm(form: HTMLFormElement, base: VisualRule): VisualRule {
    const data = new FormData(form),
      sources = [...form.querySelectorAll<HTMLInputElement>('input[data-check-field=sources]:checked')].map(option => ({
        reading: option.value,
        ...(this.hass?.entities?.[option.value]?.device_id
          ? { deviceId: this.hass.entities[option.value].device_id! }
          : {}),
      }));
    if (!sources.length) throw new Error(t('Elegí al menos una lectura.'));
    const binary = sources[0]?.reading.startsWith('binary_sensor.');
    if (!sources.length || sources.some(s => s.reading.startsWith('binary_sensor.') !== binary))
      throw new Error('Elegí lecturas del mismo tipo.');
    const { below, above, forMinutes, state, ...rest } = base;
    const rule: VisualRule = {
      ...rest,
      name: String(data.get('name') ?? '').trim(),
      sources,
      symbols: this.configuration!.catalog.devices.filter(d => data.has('symbol:' + d.id)).map(d => d.id),
      level: String(data.get('level')) as VisualRule['level'],
      badge: data.has('badge'),
      highlight: data.has('highlight'),
      bar: data.has('bar'),
      now: data.has('now'),
      color: String(data.get('color')),
    };
    if (!rule.name) throw new Error('Escribí un nombre para la regla.');
    for (const key of ['below', 'above', 'forMinutes'] as const) {
      const raw = String(data.get(key) ?? '');
      if (raw.trim() && (!binary || key === 'forMinutes')) {
        const n = Number(raw);
        if (!Number.isFinite(n) || (key === 'forMinutes' && n < 0))
          throw new Error('Revisá los límites y la duración de los avisos.');
        rule[key] = n;
      }
    }
    if (binary) rule.state = String(data.get('state')) as 'on' | 'off';
    else if (rule.below === undefined && rule.above === undefined)
      throw new Error('Elegí al menos un límite para cada aviso de lectura.');
    return rule;
  }
}
if (!customElements.get('homemanager-rules-editor')) customElements.define('homemanager-rules-editor', RulesEditor);
