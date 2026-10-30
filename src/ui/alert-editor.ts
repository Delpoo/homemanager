import { t } from '../i18n/index.js';
import {
  alertReadingChoices,
  plantAlertSuggestions,
  settingApplies,
  type AlertReadingChoice,
  type AlertSettingsDraft,
} from '../model/alert-settings.js';
import type { Category, ModelDevice, ModelHass } from '../model/types.js';
import { uiEscape as e, uiIcon, uiNotice } from './components.js';
import { installPanelComponents, panelField, panelIconAction } from './panel-components.js';

/** §6/§12: condition rows, visible choices, and compact editors shared by any inspector. */
export class AlertEditor extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private draft?: AlertSettingsDraft;
  private device?: ModelDevice;
  private category: Category = 'switch';
  private choices: AlertReadingChoice[] = [];
  private expanded = new Set<number>();
  private binary = -1;
  constructor() {
    super();
    installPanelComponents(this.root, 'alert-editor', alertEditorStyles);
    this.root.addEventListener('click', event => this.onAction(event));
    this.root.addEventListener('input', event => this.input(event));
    this.root.addEventListener('change', event => this.input(event));
  }
  configure(draft: AlertSettingsDraft, device: ModelDevice, category: Category, hass?: ModelHass): void {
    this.draft = draft;
    this.device = device;
    this.category = category;
    this.choices = alertReadingChoices(device, hass);
    if (category === 'plant')
      for (const suggestion of plantAlertSuggestions(device, hass))
        if (!draft.rules.some(rule => rule.reading === suggestion.reading)) draft.rules.push(suggestion);
    const principal = device.bindings.entityId;
    this.binary = -1;
    if (['alert', 'presence'].includes(category) && principal?.startsWith('binary_sensor.')) {
      this.binary = draft.rules.findIndex(rule => rule.reading === principal && !rule.below && !rule.above);
      if (this.binary < 0) {
        this.binary = draft.rules.length;
        draft.rules.push({
          reading: principal,
          enabled: category === 'alert',
          below: '',
          above: '',
          minutes: '',
          level: category === 'alert' ? 'alert' : 'warning',
        });
      } else if (category === 'alert') draft.rules[this.binary].enabled = true;
    }
    this.hidden = !['plant', 'meter', 'alert', 'presence'].includes(category);
    this.render();
  }
  valid(): boolean {
    return [...this.root.querySelectorAll<HTMLInputElement>('input:not([disabled])')].every(
      input =>
        (input.dataset.index !== undefined && !this.draft?.rules[Number(input.dataset.index)]?.enabled) ||
        input.reportValidity(),
    );
  }
  private label(id: string): string {
    return this.choices.find(choice => choice.id === id)?.name ?? t('Lectura no disponible');
  }
  private summary(index: number): string {
    const rule = this.draft!.rules[index],
      unit = this.choices.find(choice => choice.id === rule.reading)?.unit ?? '';
    const conditions = [
      rule.below !== '' ? t('menos de {value}', { value: `${rule.below} ${unit}`.trim() }) : '',
      rule.above !== '' ? t('más de {value}', { value: `${rule.above} ${unit}`.trim() }) : '',
    ].filter(Boolean);
    const minutes = Number(rule.minutes);
    const duration =
      minutes > 0
        ? minutes % 1440 === 0
          ? t('durante {count} días', { count: minutes / 1440 })
          : t('durante {count} minutos', { count: minutes })
        : '';
    return [...conditions, duration, rule.level === 'alert' ? t('alerta') : t('aviso')].filter(Boolean).join(' · ');
  }
  private toggle(label: string, checked: boolean, attributes: string, detail = '', disabled = false): string {
    return `<label class="alert-toggle"><span><b>${e(label)}</b>${detail ? `<small>${e(detail)}</small>` : ''}</span><input class="alert-switch" type="checkbox" role="switch" aria-label="${e(label)}" ${attributes}${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}></label>`;
  }
  private fields(index: number, numeric = true): string {
    const rule = this.draft!.rules[index];
    const number = (field: string, title: string, raw: string, extra = '') =>
      panelField(
        title,
        `<input type="number" step="any" data-index="${index}" data-field="${field}" value="${e(raw)}" ${extra}>`,
      );
    return `<div class="alert-fields">${numeric ? `<div class="alert-limits">${number('below', t('Menos de'), rule.below)}${number('above', t('Más de'), rule.above)}</div>` : ''}${number('minutes', t('Durante (minutos)'), rule.minutes || '0', 'min="0"')}${panelField(t('Nivel'), `<select data-index="${index}" data-field="level"><option value="warning"${rule.level === 'warning' ? ' selected' : ''}>${e(t('Aviso'))}</option><option value="alert"${rule.level === 'alert' ? ' selected' : ''}>${e(t('Alerta'))}</option></select>`, t('Un aviso llama la atención; una alerta requiere atención inmediata.'))}</div>`;
  }
  private render(): void {
    if (!this.draft || !this.device) return;
    if (this.hidden) {
      this.root.innerHTML = '';
      return;
    }
    const draft = this.draft;
    const binary = this.binary >= 0 ? draft.rules[this.binary] : undefined;
    let body = '';
    if (this.category === 'presence')
      body +=
        this.toggle(
          t('Resaltar al detectar'),
          draft.highlight === true,
          'data-highlight',
          t('Destaca el símbolo cuando detecta presencia o una apertura.'),
        ) +
        this.toggle(
          t('Contar como alerta'),
          binary?.enabled === true,
          'data-count',
          t('Aparece en Alertas y Ahora mientras detecta.'),
          !binary,
        );
    if (this.category === 'alert' || this.category === 'presence') {
      if (binary)
        body += `<div class="binary-fields"${this.category === 'presence' && !binary.enabled ? ' hidden' : ''}>${this.fields(this.binary, false)}</div>`;
      else body += uiNotice(t('Vinculá un sensor de detección para configurar este aviso.'));
    } else {
      const rules = draft.rules
        .map((rule, index) => ({ rule, index }))
        .filter(({ rule }) => settingApplies(rule, this.category));
      body += `<h3>${e(t('Avisar si'))}</h3><p class="muted">${e(t('Activá sólo los avisos que quieras. Los límites y la duración se pueden editar.'))}</p><div class="alert-list">${rules.map(({ rule, index }) => `<div class="alert-rule" data-rule="${index}"><div class="alert-rule-head">${this.toggle(this.label(rule.reading), rule.enabled, `data-index="${index}" data-field="enabled"`, this.summary(index))}${panelIconAction(t('Editar aviso de {name}', { name: this.label(rule.reading) }), `data-edit="${index}" aria-expanded="${this.expanded.has(index)}"`, 'mdi:pencil-outline')}</div><div class="alert-detail"${this.expanded.has(index) ? '' : ' hidden'}>${this.fields(index)}<div class="actions">${panelIconAction(t('Quitar aviso'), `data-remove="${index}"`, 'mdi:trash-can-outline', 'danger')}</div></div></div>`).join('')}</div>`;
      const available = this.choices.filter(
        choice => !choice.id.startsWith('binary_sensor.') && !draft.rules.some(rule => rule.reading === choice.id),
      );
      body += available.length
        ? `<div class="alert-add">${panelField(t('Otra lectura'), `<select data-reading>${available.map(choice => `<option value="${e(choice.id)}">${e(choice.name)}</option>`).join('')}</select>`)}${panelIconAction(t('Agregar aviso'), 'data-add', 'mdi:plus')}</div>`
        : !rules.length
          ? uiNotice(t('No hay lecturas asociadas. Elegí el dispositivo de Home Assistant.'))
          : '';
    }
    const dormant = draft.rules
      .map((rule, index) => ({ rule, index }))
      .filter(
        ({ rule, index }) =>
          rule.enabled &&
          (!settingApplies(rule, this.category) ||
            (['alert', 'presence'].includes(this.category) && index !== this.binary)),
      );
    if (dormant.length)
      body += `<details class="alert-retained"><summary>${e(t('Otros avisos conservados'))} · ${dormant.length}</summary><p class="muted">${e(t('Podés quitarlos aquí. Los avisos incompatibles con esta categoría no se evalúan.'))}</p>${dormant.map(({ rule, index }) => `<div class="alert-retained-row"><span>${e(this.label(rule.reading))}</span>${panelIconAction(t('Quitar aviso'), `data-remove="${index}"`, 'mdi:trash-can-outline', 'danger')}</div>`).join('')}</details>`;
    this.root.innerHTML = `<section class="alert-editor" aria-label="${e(t('Avisos del dispositivo'))}">${body}</section>`;
  }
  private input(event: Event): void {
    if (!this.draft) return;
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input.hasAttribute('data-highlight')) this.draft.highlight = (input as HTMLInputElement).checked;
    if (input.hasAttribute('data-count') && this.binary >= 0) {
      this.draft.rules[this.binary].enabled = (input as HTMLInputElement).checked;
      this.root.querySelector<HTMLElement>('.binary-fields')!.hidden = !(input as HTMLInputElement).checked;
    }
    const index = Number(input.dataset.index),
      rule = this.draft.rules[index];
    if (!rule || input.dataset.index === undefined) return;
    const field = input.dataset.field;
    if (field === 'enabled') rule.enabled = (input as HTMLInputElement).checked;
    if (field === 'below' || field === 'above' || field === 'minutes')
      rule[field] = input.validity.badInput ? 'invalid' : input.value;
    if (field === 'level') rule.level = input.value as 'alert' | 'warning';
    const summary = this.root.querySelector<HTMLElement>(`[data-rule="${index}"] small`);
    if (summary) summary.textContent = this.summary(index);
  }
  private onAction(event: Event): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || !this.draft) return;
    let focus = '';
    if (button.dataset.edit !== undefined) {
      const index = Number(button.dataset.edit);
      this.expanded.has(index) ? this.expanded.delete(index) : this.expanded.add(index);
      focus = `[data-edit="${index}"]`;
    } else if (button.dataset.remove !== undefined) {
      this.draft.rules[Number(button.dataset.remove)].enabled = false;
      this.draft.rules.splice(Number(button.dataset.remove), 1);
      this.expanded.clear();
      this.binary = this.draft.rules.findIndex(
        rule => rule.reading === this.device?.bindings.entityId && !rule.below && !rule.above,
      );
      focus = 'button';
    } else if (button.hasAttribute('data-add')) {
      const reading = this.root.querySelector<HTMLSelectElement>('[data-reading]')!.value;
      const index = this.draft.rules.length;
      this.draft.rules.push({ reading, enabled: true, below: '', above: '', minutes: '', level: 'warning' });
      this.expanded.add(index);
      focus = `[data-rule="${index}"] input[data-field="below"]`;
    } else return;
    this.render();
    this.root.querySelector<HTMLElement>(focus)?.focus();
  }
}

const alertEditorStyles = `
:host{display:block;min-width:0}:host([hidden]),[hidden]{display:none!important}.alert-editor{display:grid;gap:10px;padding:16px 0;border-top:1px solid var(--hm-line)}h3{font-size:13px;font-weight:600;color:var(--hm-muted)}.alert-list{border:1px solid var(--hm-line);border-radius:14px;overflow:hidden}.alert-list:empty{display:none}.alert-rule+.alert-rule{border-top:1px solid var(--hm-line)}.alert-rule-head{display:flex;align-items:center;gap:4px;padding-right:6px}.alert-toggle{flex:1;display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--hm-ink);padding:12px;min-height:52px;cursor:pointer}.alert-toggle>span:first-child{display:block;min-width:0}.alert-toggle b{display:block;font-size:13px;font-weight:500;overflow-wrap:anywhere}.alert-toggle small{display:block;font-size:11px;color:var(--hm-muted);line-height:1.5;margin-top:3px}.alert-switch{appearance:none;flex:none;width:34px;min-width:34px;height:20px;min-height:20px;padding:2px;border:0;border-radius:12px;background:var(--hm-line);cursor:pointer}.alert-switch:before{content:'';display:block;width:16px;height:16px;border-radius:50%;background:var(--hm-surface);transition:transform .15s}.alert-switch:checked{background:var(--hm-brand)}.alert-switch:checked:before{transform:translateX(14px)}.alert-switch:disabled{opacity:.4;cursor:default}.alert-rule-head .k-btn,.alert-add .k-btn{width:36px;min-width:36px;height:36px;min-height:36px;padding:0}.alert-detail{padding:4px 12px 12px;background:var(--hm-surface-2)}.alert-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.alert-limits{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.alert-fields input,.alert-fields select{color:var(--hm-ink);background:var(--hm-surface)}.alert-detail .actions{margin-top:8px}.alert-add{display:flex;align-items:end;gap:8px}.alert-add>label{flex:1;min-width:0}.alert-add .k-btn{margin-bottom:4px}.alert-retained{font-size:12px;border-top:1px solid var(--hm-line);padding-top:10px}.alert-retained summary{cursor:pointer;padding:8px 0;min-height:40px}.alert-retained-row{display:flex;align-items:center;justify-content:space-between}.alert-editor>.alert-toggle{padding-left:0;padding-right:0}.binary-fields{padding:4px 0 8px}.alert-editor .k-notice{margin:0;font-size:12px}@media(max-width:650px){.alert-rule-head .k-btn,.alert-add .k-btn{min-width:44px;width:44px;min-height:44px;height:44px}.alert-toggle{min-height:56px}.alert-detail .k-btn{min-height:44px}}
`;

if (!customElements.get('homemanager-alert-editor')) customElements.define('homemanager-alert-editor', AlertEditor);
