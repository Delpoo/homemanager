import { checkList, checkListStyles } from './check-list.js';
import { iconPicker } from './icon-picker.js';
import { confirmDialog } from './confirm-dialog.js';
import { t, getLanguage } from '../i18n/index.js';
import { escapeHTML as e, type Configuration, type Hass } from '../card/types.js';
import { personName, readingName } from '../model/names.js';
import { serviceLabel } from '../card/device-controls.js';
import {
  DEFAULT_CHECK,
  emptyAutomation,
  newAutomationId,
  triggerChips,
  type Automation,
  type AutomationStep,
  type AutomationTrigger,
} from '../model/automations.js';
import {
  automationRuns,
  deleteAutomation,
  listAutomations,
  runAutomation,
  saveAutomation,
  setAutomationEnabled,
  type AutomationEntry,
  type AutomationRun,
} from '../integration/automations.js';

/** 0.13 Automations, as in the approved mockup: a list with ★ (a button in Now) and a
 * switch; each one edits in four steps, When → Do → Check → If it fails. They are saved
 * as Home Assistant automations; the ★ lives in the plan (`pinnedAutomations`). */

const glyph = (icon: string) => `<ha-icon icon="${e(icon)}" aria-hidden="true"></ha-icon>`;
const ib = (label: string, icon: string, attributes = '', variant = '') =>
  `<button type="button" class="ib${variant ? ` ${variant}` : ''}" aria-label="${e(label)}" title="${e(label)}" ${attributes}>${glyph(icon)}</button>`;
const ENTITY_DOMAINS = /^(light|switch|fan|climate|media_player|cover|input_boolean|humidifier|water_heater|vacuum)\./;

interface Choice {
  id: string;
  name: string;
  icon: string;
  step: AutomationStep;
}

export class AutomationsEditor extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private configuration?: Configuration;
  private hass?: Hass;
  private changed?: (next: Configuration) => void;
  /** Tells the sheet which actions automations use (Home status). */
  onList?: (automations: Automation[]) => void;
  private entries?: AutomationEntry[];
  private loading = false;
  private view: 'list' | 'edit' = 'list';
  private draft?: Automation;
  private isNew = false;
  private picking: '' | 'do' | 'when' | 'when-state' | 'when-number' | `sensor:${number}` = '';
  private runs?: AutomationRun[];
  private busy = false;
  private error = '';
  private menu = '';

  /** HA's state moves on; the list and the pickers read the latest one. */
  setHass(hass: Hass | undefined): void {
    this.hass = hass;
  }
  configure(configuration: Configuration, hass: Hass | undefined, changed: (next: Configuration) => void): void {
    const first = !this.configuration;
    this.configuration = structuredClone(configuration);
    this.hass = hass;
    this.changed = changed;
    if (first || !this.root.childElementCount) this.render();
    if (!this.entries && !this.loading) void this.load();
  }

  private async load(): Promise<void> {
    if (!this.hass) return;
    this.loading = true;
    try {
      this.entries = await listAutomations(this.hass);
      this.onList?.(this.entries.map(entry => entry.automation));
    } catch (error) {
      this.entries = [];
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
      if (this.view === 'list') this.render();
    }
  }

  // Helpers -------------------------------------------------------------------

  private pins(): { id: string; icon: string }[] {
    return this.configuration?.pinnedAutomations ?? [];
  }
  private pinned(id: string): boolean {
    return this.pins().some(pin => pin.id === id);
  }
  private setPin(automation: Automation, on: boolean): void {
    if (!this.configuration) return;
    const next = structuredClone(this.configuration);
    const pins = (next.pinnedAutomations ?? []).filter(pin => pin.id !== automation.id);
    if (on) pins.push({ id: automation.id, icon: automation.icon });
    if (pins.length) next.pinnedAutomations = pins.slice(0, 12);
    else delete next.pinnedAutomations;
    this.configuration = next;
    this.changed?.(next);
  }
  private nameOf = (entity: string) => readingName(entity, this.hass);
  private device(id?: string) {
    return this.configuration?.catalog.devices.find(device => device.id === id);
  }
  /** What the Do step can send: each symbol's actions, and on/off for its own entity. */
  private choices(): Choice[] {
    const configuration = this.configuration!;
    const out: Choice[] = [];
    const labelOf = (actionId: string): string => {
      for (const device of configuration.catalog.devices)
        for (const control of device.bindings.controls ?? [])
          for (const step of control.steps ?? []) if (step.actionId === actionId) return step.label || control.label;
      const action = configuration.actions[actionId];
      return action ? serviceLabel(action.service, action.domain) : actionId;
    };
    const targetName = (actionId: string) => {
      const target = configuration.actions[actionId]?.target.entity_id;
      return [target ?? []]
        .flat()
        .map(id =>
          personName(this.hass?.states[id]?.attributes?.friendly_name, id.replace(/^[^.]+\./, '').replace(/_/g, ' ')),
        )
        .join(', ');
    };
    const sameAsAction = (entity: string, service: string) =>
      Object.values(configuration.actions).some(
        action =>
          action.service === service &&
          ['homeassistant', entity.split('.')[0]].includes(action.domain) &&
          [action.target.entity_id].flat().length === 1 &&
          [action.target.entity_id].flat()[0] === entity,
      );
    const used = new Set<string>();
    for (const device of configuration.catalog.devices) {
      const text = JSON.stringify(device.bindings);
      for (const actionId of Object.keys(configuration.actions))
        if (text.includes(JSON.stringify(actionId)) && !used.has(actionId)) {
          used.add(actionId);
          out.push({
            id: `a:${actionId}`,
            name: `${device.display.label} · ${labelOf(actionId)}`,
            icon: device.display.icon,
            step: { deviceId: device.id, actionId },
          });
        }
      const entity = device.bindings.entityId;
      if (entity && ENTITY_DOMAINS.test(entity))
        for (const service of ['turn_on', 'turn_off'] as const) {
          if (sameAsAction(entity, service)) continue;
          out.push({
            id: `${service}:${device.id}`,
            name: `${device.display.label} · ${t(service === 'turn_on' ? 'Encender' : 'Apagar')}`,
            icon: device.display.icon,
            step: { deviceId: device.id, entity, service },
          });
        }
    }
    for (const actionId of Object.keys(configuration.actions))
      if (!used.has(actionId))
        out.push({
          id: `a:${actionId}`,
          name: [targetName(actionId), labelOf(actionId)].filter(Boolean).join(' · '),
          icon: 'mdi:flash-outline',
          step: { actionId },
        });
    return out;
  }
  private choiceId(step: AutomationStep): string {
    return step.actionId ? `a:${step.actionId}` : `${step.service}:${step.deviceId}`;
  }
  private stepLine(step: AutomationStep): { icon: string; html: string } {
    const device = this.device(step.deviceId);
    const choice = this.choices().find(item => item.id === this.choiceId(step));
    if (step.service && device)
      return {
        icon: device.display.icon,
        html: `${e(t(step.service === 'turn_on' ? 'Encender' : 'Apagar'))} <b>${e(device.display.label)}</b>`,
      };
    const [who, what] = (choice?.name ?? step.actionId ?? '').split(' · ');
    return {
      icon: device?.display.icon ?? 'mdi:flash-outline',
      html: what ? `${e(what)} · <b>${e(who!)}</b>` : `<b>${e(who!)}</b>`,
    };
  }
  /** Power readings for one symbol first, then every power reading in the house. */
  private powerSensors(deviceId?: string): string[] {
    const states = this.hass?.states ?? {};
    const power = (id: string) => {
      const attributes = states[id]?.attributes ?? {};
      return (
        id.startsWith('sensor.') &&
        (attributes.device_class === 'power' || ['W', 'kW'].includes(String(attributes.unit_of_measurement)))
      );
    };
    const device = this.device(deviceId);
    const own = Object.keys(states).filter(
      id =>
        power(id) &&
        ((device?.bindings.deviceId && this.hass?.entities?.[id]?.device_id === device.bindings.deviceId) ||
          device?.bindings.readings?.includes(id)),
    );
    return [...new Set([...own, ...Object.keys(states).filter(power)])];
  }

  // Render --------------------------------------------------------------------

  private render(): void {
    if (!this.configuration) return;
    const body = this.view === 'edit' && this.draft ? this.editor(this.draft) : this.list();
    this.root.innerHTML = `<style>${styles}${checkListStyles}</style>${body}`;
    this.bind();
  }

  private list(): string {
    const head = `<div class="lbl"><span class="grow"></span>${ib(t('Nueva automatización'), 'mdi:plus', 'data-new')}</div>`;
    if (!this.entries) return `${head}<p class="empty" role="status">${e(t('Cargando…'))}</p>`;
    const rows = this.entries.map(entry => {
      const automation = entry.automation;
      const pinned = this.pinned(automation.id);
      const chips = triggerChips(automation, pinned, this.nameOf);
      return `<div class="li"><span class="ico-tile">${glyph(automation.icon)}</span><button type="button" class="t" data-open="${e(automation.id)}"><b>${e(automation.name)}</b><span class="chips">${chips.map(chip => `<span class="chip">${glyph(chip.icon)}<span>${e(t(chip.text))}</span></span>`).join('')}</span></button>${ib(pinned ? t('Está en la pantalla principal') : t('Poner en la pantalla principal'), pinned ? 'mdi:star' : 'mdi:star-outline', `data-pin="${e(automation.id)}" aria-pressed="${pinned}"`, pinned ? 'on' : '')}<input type="checkbox" role="switch" aria-label="${e(automation.name)}" data-toggle="${e(automation.id)}"${entry.enabled ? ' checked' : ''}${entry.entityId ? '' : ' disabled'}></div>`;
    });
    return `${head}<div class="list">${rows.join('') || `<p class="empty">—</p>`}</div><p class="error" role="alert">${e(this.error)}</p>`;
  }

  private step(color: string, icon: string, title: string, id: string, lines: string, add: string, more = ''): string {
    return `<section class="step" id="${id}" style="--c:${color}"><header>${glyph(icon)}<span>${e(t(title))}</span><span class="grow"></span>${more}</header>${lines}${add ? `<div class="chips">${add}</div>` : ''}</section>`;
  }

  private editor(automation: Automation): string {
    const pinned = this.pinned(automation.id);
    const entry = this.entries?.find(item => item.automation.id === automation.id);
    const remove = (attributes: string, label: string) => ib(label, 'mdi:close', attributes, 'small');
    // When
    const when = [
      pinned
        ? `<div class="ln">${glyph('mdi:gesture-tap')}<span>${t('Tocás <b>{name}</b> en Ahora', { name: e(automation.name || t('Nueva automatización')) })}</span></div>`
        : '',
      ...automation.triggers.map((trigger, index) => {
        if (trigger.kind === 'time')
          return `<div class="ln">${glyph('mdi:clock-outline')}<span>${e(t('Todos los días a las'))}</span><input type="time" data-trigger-at="${index}" value="${e(trigger.at.slice(0, 5))}" aria-label="${e(t('Hora'))}">${remove(`data-untrigger="${index}"`, t('Quitar'))}</div>`;
        if (trigger.kind === 'state')
          return `<div class="ln">${glyph('mdi:toggle-switch-outline')}<span><b>${e(this.nameOf(trigger.entity))}</b></span><select data-trigger-to="${index}" aria-label="${e(t('Pasa a'))}">${this.statesOf(trigger.entity, trigger.to)}</select>${remove(`data-untrigger="${index}"`, t('Quitar'))}</div>`;
        return `<div class="ln">${glyph(trigger.kind === 'above' ? 'mdi:greater-than' : 'mdi:less-than')}<span><b>${e(this.nameOf(trigger.entity))}</b></span><span class="seg">${(['below', 'above'] as const).map(kind => `<button type="button" data-trigger-kind="${index}" data-kind="${kind}" aria-pressed="${trigger.kind === kind}" aria-label="${e(t(kind === 'below' ? 'Menor que' : 'Mayor que'))}" title="${e(t(kind === 'below' ? 'Menor que' : 'Mayor que'))}">${glyph(kind === 'below' ? 'mdi:less-than' : 'mdi:greater-than')}</button>`).join('')}</span><input type="number" step="any" data-trigger-value="${index}" value="${trigger.value}" aria-label="${e(t('Límite'))}"><span class="u">${e(String(this.hass?.states[trigger.entity]?.attributes?.unit_of_measurement ?? ''))}</span>${remove(`data-untrigger="${index}"`, t('Quitar'))}</div>`;
      }),
    ].join('');
    const whenMenu =
      this.picking === 'when'
        ? `<div class="pop menu" role="menu">${[
            ['time', 'mdi:clock-outline', 'A una hora'],
            ['state', 'mdi:toggle-switch-outline', 'Cuando algo cambia'],
            ['number', 'mdi:gauge', 'Cuando una lectura pasa un límite'],
          ]
            .map(
              ([kind, icon, label]) =>
                `<button type="button" role="menuitem" data-add-trigger="${kind}">${glyph(icon!)}<span>${e(t(label!))}</span></button>`,
            )
            .join('')}</div>`
        : this.picking === 'when-state' || this.picking === 'when-number'
          ? `<div class="pop">${checkList(
              this.picking,
              t('Elegir'),
              Object.keys(this.hass?.states ?? {})
                .filter(id =>
                  this.picking === 'when-number'
                    ? /^sensor\./.test(id) && !Number.isNaN(Number(this.hass!.states[id]!.state))
                    : /^(binary_sensor|switch|light|person|input_boolean|fan|cover|climate|media_player|lock|alarm_control_panel)\./.test(
                        id,
                      ),
                )
                .map(id => ({ id, name: this.nameOf(id) })),
              [],
            )}</div>`
          : '';
    // Do
    const doLines = automation.steps
      .map((step, index) => {
        const line = this.stepLine(step);
        return `<div class="ln">${glyph(line.icon)}<span>${line.html}</span>${remove(`data-unstep="${index}"`, t('Quitar'))}</div>`;
      })
      .join('');
    const doPicker =
      this.picking === 'do'
        ? `<div class="pop">${checkList(
            'do',
            t('Qué hacer'),
            this.choices().map(choice => ({ id: choice.id, name: choice.name })),
            automation.steps.map(step => this.choiceId(step)),
          )}</div>`
        : '';
    // Check
    const check = automation.check;
    const checkLines = check
      ? `<div class="ln">${glyph('mdi:flash-outline')}<span>${e(t('Cada uno'))}</span><span class="seg">${(['below', 'above'] as const).map(kind => `<button type="button" data-check-compare="${kind}" aria-pressed="${check.compare === kind}" aria-label="${e(t(kind === 'below' ? 'baja de' : 'sube de'))}" title="${e(t(kind === 'below' ? 'baja de' : 'sube de'))}">${glyph(kind === 'below' ? 'mdi:arrow-down' : 'mdi:arrow-up')}</button>`).join('')}</span><input type="number" min="0" step="any" data-check="watts" value="${check.watts}" aria-label="${e(t('Vatios'))}"><span class="u">W</span><span>${e(t('en'))}</span><input type="number" min="5" max="3600" step="1" data-check="seconds" value="${check.seconds}" aria-label="${e(t('Segundos'))}"><span class="u">s</span></div>
        <div class="ln">${glyph('mdi:repeat')}<span>${e(t('Si no: reenviar, hasta'))}</span><input type="number" min="0" max="10" step="1" data-check="retries" value="${check.retries}" aria-label="${e(t('Veces'))}"><span class="u">${e(t('veces'))}</span></div>
        <div class="ln">${glyph('mdi:meter-electric-outline')}<span>${e(t('Medidor sin datos: no reenviar'))}</span></div>
        <div class="meters">${automation.steps
          .map((step, index) => {
            const line = this.stepLine(step);
            const options = this.powerSensors(step.deviceId);
            return `<label class="meter">${glyph(line.icon)}<span>${line.html}</span><select data-sensor="${index}" aria-label="${e(t('Medidor de {name}', { name: this.device(step.deviceId)?.display.label ?? '' }))}"><option value="">${e(t('Sin comprobar'))}</option>${options.map(id => `<option value="${e(id)}"${step.sensor === id ? ' selected' : ''}>${e(this.nameOf(id))}</option>`).join('')}</select></label>`;
          })
          .join('')}</div>`
      : '';
    // If it fails
    const fail = automation.fail;
    const failLines = fail
      ? `<div class="ln">${glyph('mdi:bell-outline')}<span>${e(t('Alerta'))}</span><input class="wide" data-fail-message value="${e(fail.message)}" maxlength="120" placeholder="${e(t('Sigue prendido'))}" aria-label="${e(t('Mensaje de la alerta'))}"><span class="muted">${e(t('en el símbolo y en Ahora'))}</span></div>`
      : '';
    const more = (step: 'check' | 'fail') =>
      `${ib(t('Más'), 'mdi:dots-horizontal', `data-menu="${step}" aria-expanded="${this.menu === step}"`, 'small')}${this.menu === step ? `<div class="pop menu right" role="menu"><button type="button" role="menuitem" data-drop="${step}">${glyph('mdi:trash-can-outline')}<span>${e(t('Quitar paso'))}</span></button></div>` : ''}`;
    const conn = `<div class="conn" aria-hidden="true"></div>`;
    const runs = this.runs
      ? `<div class="lbl"><span>${e(t('Últimas ejecuciones'))}</span></div><div class="runs">${
          this.runs.length
            ? this.runs
                .map(
                  run =>
                    `<div class="run ${run.ok ? 'ok' : 'bad'}">${glyph(run.ok ? 'mdi:check-circle-outline' : 'mdi:alert-circle-outline')}<span>${e(new Date(run.start).toLocaleString(getLanguage()))}</span>${run.error ? `<small>${e(run.error)}</small>` : ''}</div>`,
                )
                .join('')
            : `<p class="empty">—</p>`
        }</div>`
      : '';
    const enabled = entry?.enabled ?? true;
    return `<div class="dh">${ib(t('Volver'), 'mdi:arrow-left', 'data-back')}${iconPicker(automation.icon, t('Icono'), 'data-icon')}<input class="title-in" name="name" maxlength="80" value="${e(automation.name)}" placeholder="${e(t('Nueva automatización'))}" aria-label="${e(t('Nombre'))}">${ib(pinned ? t('En la pantalla principal') : t('Poner en la pantalla principal'), pinned ? 'mdi:star' : 'mdi:star-outline', `data-pin-draft aria-pressed="${pinned}"`, pinned ? 'on' : '')}<input type="checkbox" role="switch" aria-label="${e(t('Activa'))}" data-enabled${enabled ? ' checked' : ''}${entry?.entityId ? '' : ' disabled'}></div>
    <div class="dbody"><div class="flow">
      ${this.step('var(--hm-brand)', 'mdi:play-circle-outline', 'Cuando', 'g-when', when, `<button type="button" class="chip add" data-pick="when" aria-expanded="${this.picking === 'when'}" aria-label="${e(t('Agregar cuándo'))}" title="${e(t('Agregar cuándo'))}">${glyph('mdi:plus')}</button>`)}${whenMenu}${conn}
      ${this.step('var(--hm-accent,#3f7fbf)', 'mdi:lightning-bolt-outline', 'Hacer', 'g-do', doLines, `<button type="button" class="chip add" data-pick="do" aria-expanded="${this.picking === 'do'}" aria-label="${e(t('Agregar qué hacer'))}" title="${e(t('Agregar qué hacer'))}">${glyph('mdi:plus')}</button>`)}${doPicker}${conn}
      ${this.step('var(--hm-ok,#2e7d4f)', 'mdi:check-decagram-outline', 'Comprobar', 'g-check', checkLines, check ? '' : `<button type="button" class="chip add" data-add="check" aria-label="${e(t('Comprobar con el consumo'))}" title="${e(t('Comprobar con el consumo'))}">${glyph('mdi:plus')}</button>`, check ? more('check') : '')}${conn}
      ${this.step('var(--hm-alert)', 'mdi:alert-octagon-outline', 'Si falla', 'g-fail', failLines, fail ? '' : `<button type="button" class="chip add" data-add="fail" aria-label="${e(t('Avisar si falla'))}" title="${e(t('Avisar si falla'))}">${glyph('mdi:plus')}</button>`, fail ? more('fail') : '')}
    </div>${runs}<p class="error" role="alert">${e(this.error)}</p></div>
    <div class="dfoot">${ib(t('Probar ahora'), 'mdi:play', 'data-run')}${this.isNew ? '' : ib(t('Últimas ejecuciones'), 'mdi:history', `data-runs aria-pressed="${!!this.runs}"`)}${this.isNew ? '' : ib(t('Borrar'), 'mdi:trash-can-outline', 'data-delete', 'danger')}<span class="grow"></span>${ib(t('Listo'), 'mdi:check', `data-save${this.busy ? ' disabled' : ''}`, 'primary')}</div>`;
  }

  private statesOf(entity: string, current: string): string {
    const attributes = this.hass?.states[entity]?.attributes ?? {};
    const domain = entity.split('.')[0];
    const options = Array.isArray(attributes.options)
      ? (attributes.options as string[])
      : domain === 'person'
        ? ['home', 'not_home']
        : domain === 'cover'
          ? ['open', 'closed']
          : domain === 'lock'
            ? ['locked', 'unlocked']
            : ['on', 'off'];
    const names: Record<string, string> = {
      on: t('Encendido'),
      off: t('Apagado'),
      home: t('En casa'),
      not_home: t('Fuera de casa'),
      open: t('Abierto'),
      closed: t('Cerrado'),
      locked: t('Cerrado con llave'),
      unlocked: t('Sin llave'),
    };
    return [...new Set([...options, current])]
      .filter(Boolean)
      .map(
        value =>
          `<option value="${e(value)}"${value === current ? ' selected' : ''}>${e(names[value] ?? value)}</option>`,
      )
      .join('');
  }

  // Events --------------------------------------------------------------------

  private bind(): void {
    const root = this.root;
    const on = (selector: string, work: (element: HTMLElement) => void, type = 'click') =>
      root
        .querySelectorAll<HTMLElement>(selector)
        .forEach(element => element.addEventListener(type, () => work(element)));
    on('[data-new]', () => this.open());
    on('[data-open]', element => this.open(element.dataset.open));
    on('[data-pin]', element => {
      const entry = this.entries?.find(item => item.automation.id === element.dataset.pin);
      if (!entry) return;
      this.setPin(entry.automation, !this.pinned(entry.automation.id));
      this.render();
    });
    on(
      '[data-toggle]',
      element => {
        const entry = this.entries?.find(item => item.automation.id === element.dataset.toggle);
        if (!entry?.entityId || !this.hass) return;
        entry.enabled = (element as HTMLInputElement).checked;
        void setAutomationEnabled(this.hass, entry.entityId, entry.enabled).catch(error => this.fail(error));
      },
      'change',
    );
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
    const draft = this.draft;
    if (this.view !== 'edit' || !draft) return;
    const repaint = () => this.render();
    on('[data-back]', () => {
      this.view = 'list';
      this.draft = undefined;
      this.runs = undefined;
      this.error = '';
      this.picking = '';
      repaint();
    });
    on('input[name=name]', element => (draft.name = (element as HTMLInputElement).value), 'input');
    root.querySelector('[data-icon]')?.addEventListener('change', event => {
      draft.icon = (event.target as HTMLInputElement).value || draft.icon;
      if (this.pinned(draft.id)) this.setPin(draft, true);
    });
    on('[data-pin-draft]', () => {
      this.setPin(draft, !this.pinned(draft.id));
      repaint();
    });
    on(
      '[data-enabled]',
      element => {
        const entry = this.entries?.find(item => item.automation.id === draft.id);
        if (!entry?.entityId || !this.hass) return;
        entry.enabled = (element as HTMLInputElement).checked;
        void setAutomationEnabled(this.hass, entry.entityId, entry.enabled).catch(error => this.fail(error));
      },
      'change',
    );
    on('[data-pick]', element => {
      const what = element.dataset.pick as 'when' | 'do';
      this.picking = this.picking === what ? '' : what;
      repaint();
    });
    on('[data-add-trigger]', element => {
      const kind = element.dataset.addTrigger;
      if (kind === 'time') {
        draft.triggers.push({ kind: 'time', at: '23:30' });
        this.picking = '';
      } else this.picking = kind === 'state' ? 'when-state' : 'when-number';
      repaint();
    });
    on(
      '[data-check-field]',
      element => {
        const input = element as HTMLInputElement;
        const field = input.dataset.checkField;
        if (field === 'do') {
          const choice = this.choices().find(item => item.id === input.value);
          if (!choice) return;
          if (input.checked) {
            const step: AutomationStep = { ...choice.step };
            const sensor = draft.check ? this.powerSensors(step.deviceId)[0] : undefined;
            if (sensor && this.device(step.deviceId)) step.sensor = sensor;
            draft.steps.push(step);
          } else draft.steps = draft.steps.filter(step => this.choiceId(step) !== input.value);
          this.paintSoon();
          return;
        }
        if (field === 'when-state' || field === 'when-number') {
          const entity = input.value;
          const trigger: AutomationTrigger =
            field === 'when-state'
              ? { kind: 'state', entity, to: entity.startsWith('person.') ? 'not_home' : 'on' }
              : { kind: 'above', entity, value: Number(this.hass?.states[entity]?.state ?? 0) || 0 };
          draft.triggers.push(trigger);
          this.picking = '';
          repaint();
        }
      },
      'change',
    );
    on('[data-untrigger]', element => {
      draft.triggers.splice(Number(element.dataset.untrigger), 1);
      repaint();
    });
    on(
      '[data-trigger-at]',
      element => {
        const trigger = draft.triggers[Number(element.dataset.triggerAt)];
        if (trigger?.kind === 'time') trigger.at = (element as HTMLInputElement).value || trigger.at;
      },
      'change',
    );
    on(
      '[data-trigger-to]',
      element => {
        const trigger = draft.triggers[Number(element.dataset.triggerTo)];
        if (trigger?.kind === 'state') trigger.to = (element as HTMLSelectElement).value;
      },
      'change',
    );
    on('[data-trigger-kind]', element => {
      const trigger = draft.triggers[Number(element.dataset.triggerKind)];
      if (trigger && trigger.kind !== 'time' && trigger.kind !== 'state')
        trigger.kind = element.dataset.kind as 'above' | 'below';
      repaint();
    });
    on(
      '[data-trigger-value]',
      element => {
        const trigger = draft.triggers[Number(element.dataset.triggerValue)];
        const value = Number((element as HTMLInputElement).value);
        if (trigger && trigger.kind !== 'time' && trigger.kind !== 'state' && Number.isFinite(value))
          trigger.value = value;
      },
      'change',
    );
    on('[data-unstep]', element => {
      draft.steps.splice(Number(element.dataset.unstep), 1);
      repaint();
    });
    on('[data-add]', element => {
      if (element.dataset.add === 'check') {
        draft.check = { ...DEFAULT_CHECK };
        for (const step of draft.steps) step.sensor ??= step.deviceId ? this.powerSensors(step.deviceId)[0] : undefined;
        for (const step of draft.steps) if (!step.sensor) delete step.sensor;
      } else draft.fail = { message: '' };
      repaint();
    });
    on('[data-menu]', element => {
      this.menu = this.menu === element.dataset.menu ? '' : element.dataset.menu!;
      repaint();
    });
    on('[data-drop]', element => {
      if (element.dataset.drop === 'check') {
        draft.check = null;
        for (const step of draft.steps) delete step.sensor;
      } else draft.fail = null;
      this.menu = '';
      repaint();
    });
    on('[data-check-compare]', element => {
      if (draft.check) draft.check.compare = element.dataset.checkCompare as 'below' | 'above';
      repaint();
    });
    on(
      '[data-check]',
      element => {
        const key = element.dataset.check as 'watts' | 'seconds' | 'retries';
        const value = Number((element as HTMLInputElement).value);
        if (draft.check && Number.isFinite(value) && value >= 0)
          draft.check[key] = key === 'watts' ? value : Math.round(value);
      },
      'change',
    );
    on(
      '[data-sensor]',
      element => {
        const step = draft.steps[Number(element.dataset.sensor)];
        const value = (element as HTMLSelectElement).value;
        if (!step) return;
        if (value) step.sensor = value;
        else delete step.sensor;
      },
      'change',
    );
    on(
      '[data-fail-message]',
      element => {
        if (draft.fail) draft.fail.message = (element as HTMLInputElement).value;
      },
      'input',
    );
    on('[data-save]', () => void this.save());
    on('[data-run]', () => void this.save(true));
    on('[data-runs]', () => void this.toggleRuns());
    on('[data-delete]', element => void this.removeAutomation(element));
  }

  /** The Do picker stays open while choosing several; the lines repaint after. */
  private paintTimer?: ReturnType<typeof setTimeout>;
  private paintSoon(): void {
    clearTimeout(this.paintTimer);
    this.paintTimer = setTimeout(() => {
      const scroll = this.root.querySelector('.check-rows')?.scrollTop ?? 0;
      this.render();
      const rows = this.root.querySelector('.check-rows');
      if (rows) rows.scrollTop = scroll;
    }, 250);
  }

  private open(id?: string): void {
    const entry = id ? this.entries?.find(item => item.automation.id === id) : undefined;
    this.isNew = !entry;
    this.draft = entry
      ? structuredClone(entry.automation)
      : emptyAutomation(
          newAutomationId(
            t('Automatización'),
            (this.entries ?? []).map(item => item.automation.id),
          ),
          '',
        );
    this.view = 'edit';
    this.runs = undefined;
    this.error = '';
    this.picking = '';
    this.menu = '';
    this.render();
  }

  private fail(error: unknown): void {
    this.error = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
    const host = this.root.querySelector('.error');
    if (host) host.textContent = this.error;
  }

  private async save(run = false): Promise<void> {
    const draft = this.draft;
    if (!draft || !this.hass || this.busy) return;
    draft.name = draft.name.trim();
    if (!draft.name) return this.fail(t('Poné un nombre.'));
    if (!draft.steps.length) return this.fail(t('Elegí qué hacer.'));
    if (!draft.triggers.length && !this.pinned(draft.id))
      return this.fail(t('Elegí cuándo: una hora, un cambio o la ★ para tener el botón en Ahora.'));
    if (draft.fail && !draft.fail.message.trim()) draft.fail.message = t('No funcionó: {name}', { name: draft.name });
    if (this.isNew) {
      // The id follows the name the first time; it never changes after.
      const id = newAutomationId(
        draft.name,
        (this.entries ?? []).map(item => item.automation.id),
      );
      if (id !== draft.id) {
        const wasPinned = this.pinned(draft.id);
        if (wasPinned) this.setPin(draft, false);
        draft.id = id;
        if (wasPinned) this.setPin(draft, true);
      }
    }
    this.busy = true;
    this.error = '';
    try {
      await saveAutomation(this.hass, draft, this.configuration!.actions);
      if (this.pinned(draft.id)) this.setPin(draft, true);
      this.isNew = false;
      const entry: AutomationEntry = this.entries?.find(item => item.automation.id === draft.id) ?? {
        automation: draft,
        entityId: null,
        enabled: true,
        lastTriggered: null,
      };
      entry.automation = structuredClone(draft);
      if (!this.entries?.includes(entry)) this.entries = [...(this.entries ?? []), entry];
      this.onList?.(this.entries!.map(item => item.automation));
      if (run) {
        const entityId = await this.waitForEntity(draft.id);
        if (entityId) await runAutomation(this.hass, entityId);
        this.busy = false;
        this.render();
        return;
      }
      this.busy = false;
      this.view = 'list';
      this.draft = undefined;
      this.render();
      void this.reloadSoon();
    } catch (error) {
      this.busy = false;
      this.fail(error);
    }
  }

  /** HA reloads automations after a save: the entity shows up a moment later. */
  private async waitForEntity(id: string): Promise<string | null> {
    for (let i = 0; i < 20; i++) {
      const found = Object.entries(this.hass?.states ?? {}).find(
        ([entityId, entity]) => entityId.startsWith('automation.') && entity.attributes?.id === id,
      );
      if (found) return found[0];
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return null;
  }
  private async reloadSoon(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 1200));
    this.entries = undefined;
    await this.load();
  }

  private async toggleRuns(): Promise<void> {
    if (!this.draft || !this.hass) return;
    if (this.runs) this.runs = undefined;
    else
      try {
        this.runs = await automationRuns(this.hass, this.draft.id);
      } catch (error) {
        this.runs = [];
        this.error = error instanceof Error ? error.message : String(error);
      }
    this.render();
  }

  private async removeAutomation(trigger: HTMLElement): Promise<void> {
    const draft = this.draft;
    if (!draft || !this.hass) return;
    const ok = await confirmDialog(this.root, {
      title: t('Borrar automatización'),
      message: t('«{name}» se borra también de Home Assistant.', { name: draft.name }),
      trigger,
    });
    if (!ok) return;
    try {
      await deleteAutomation(this.hass, draft.id);
      if (this.pinned(draft.id)) this.setPin(draft, false);
      this.entries = this.entries?.filter(item => item.automation.id !== draft.id);
      this.onList?.((this.entries ?? []).map(item => item.automation));
      this.view = 'list';
      this.draft = undefined;
      this.render();
    } catch (error) {
      this.fail(error);
    }
  }
}
if (!customElements.get('homemanager-automations-editor'))
  customElements.define('homemanager-automations-editor', AutomationsEditor);

const styles = `
:host{display:block;container-type:inline-size;color:var(--hm-text);position:relative}
*{box-sizing:border-box}
button,input,select{font:inherit;color:inherit}
[hidden]{display:none!important}
.lbl{display:flex;align-items:center;gap:6px;margin:14px 0 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--hm-muted)}
.lbl:first-child{margin-top:2px}.grow{flex:1}
.ib{display:grid;place-items:center;width:36px;height:36px;min-height:36px;padding:0;border:0;border-radius:10px;background:transparent;color:var(--hm-ink);cursor:pointer;flex:none}
.ib:hover{background:var(--hm-surface-2)}.ib ha-icon{--mdc-icon-size:20px}.ib.danger{color:var(--hm-alert)}
.ib.on{color:var(--hm-warn)}.ib.small{width:28px;height:28px;min-height:28px}.ib.small ha-icon{--mdc-icon-size:16px}
.ib.primary{background:var(--hm-brand);color:var(--hm-on-accent);width:44px;height:44px;border-radius:50%}
.ib[disabled]{opacity:.5;cursor:default}
.list{display:grid;gap:2px}
.li{display:flex;align-items:flex-start;gap:8px;padding:6px 4px 6px 6px;border-radius:12px}
.li:hover{background:var(--hm-surface-2)}
.ico-tile{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:color-mix(in srgb,var(--hm-brand) 12%,var(--hm-surface));color:var(--hm-brand);flex:none}
.li .t{flex:1;min-width:0;display:grid;gap:6px;text-align:left;border:0;background:transparent;padding:4px 0;cursor:pointer}
.li .t b{font-weight:500;font-size:14px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 10px;border:1px solid var(--hm-line);border-radius:999px;background:var(--hm-surface);font-size:12.5px}
.chip ha-icon{--mdc-icon-size:15px;color:var(--hm-muted)}
.chip.add{min-height:32px;cursor:pointer;color:var(--hm-brand)}.chip.add ha-icon{color:inherit}
.empty{margin:4px 10px;color:var(--hm-muted)}
input[role=switch]{appearance:none;-webkit-appearance:none;width:42px;min-width:42px;height:24px;margin:8px 0 0;border-radius:12px;background:var(--hm-line);position:relative;cursor:pointer;flex:none}
input[role=switch]::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--hm-surface);box-shadow:var(--hm-shadow);transition:left .15s}
input[role=switch]:checked{background:var(--hm-brand)}input[role=switch]:checked::after{left:21px}
input[role=switch]:disabled{opacity:.5;cursor:default}
.dh{display:flex;align-items:center;gap:6px;padding-bottom:8px;border-bottom:1px solid var(--hm-line)}.dh input[role=switch]{margin:0}
.title-in{flex:1;min-width:0;min-height:40px;padding:4px 10px;border:1px solid transparent;border-radius:10px;background:transparent;font-size:16px;font-weight:500}
.title-in:hover,.title-in:focus{border-color:var(--hm-line);background:var(--hm-surface)}
.dbody{display:flex;flex-direction:column;gap:4px;padding:10px 0}
.flow{display:flex;flex-direction:column}
.step{position:relative;display:flex;flex-direction:column;gap:6px;padding:10px 12px 12px;border:1px solid var(--hm-line);border-left:4px solid var(--c);border-radius:14px;background:var(--hm-surface)}
.step header{position:relative;display:flex;align-items:center;gap:8px;font-weight:500;font-size:14px}.step header ha-icon{--mdc-icon-size:18px;color:var(--c)}
.ln{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-height:34px;font-size:13.5px}
.ln>ha-icon{--mdc-icon-size:18px;color:var(--hm-muted);flex:none}
.ln b{font-weight:500}.u,.muted{color:var(--hm-muted)}
.ln input,.ln select,.meter select{min-height:32px;padding:2px 8px;border:1px solid var(--hm-line);border-radius:9px;background:var(--hm-bg)}
.ln input[type=number]{width:72px;text-align:right}.ln input.wide{flex:1;min-width:140px}
.seg{display:inline-flex;gap:2px;padding:3px;border-radius:12px;background:var(--hm-surface-2)}
.seg button{display:grid;place-items:center;width:32px;height:28px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--hm-muted);cursor:pointer}
.seg button[aria-pressed=true]{background:var(--hm-surface);color:var(--hm-ink);box-shadow:var(--hm-shadow)}
.seg ha-icon{--mdc-icon-size:17px}
.meters{display:grid;gap:4px;margin-top:2px}
.meter{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px}.meter>ha-icon{--mdc-icon-size:17px;color:var(--hm-muted)}.meter>span{flex:1;min-width:120px}
.conn{width:2px;height:14px;margin:0 0 0 22px;background:var(--hm-line)}
.pop{padding:8px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);margin:4px 0;box-shadow:var(--hm-shadow)}
.pop.menu{display:grid;gap:2px}.pop.right{position:absolute;right:0;top:32px;z-index:3;min-width:160px}
.pop.menu button{display:flex;align-items:center;gap:10px;min-height:40px;padding:0 10px;border:0;border-radius:9px;background:transparent;cursor:pointer;text-align:left}
.pop.menu button:hover{background:var(--hm-surface-2)}
.pop input[type=search]{min-height:36px;padding:4px 10px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-bg)}
.pop legend{display:none}
.runs{display:grid;gap:4px}.run{display:flex;align-items:center;gap:8px;font-size:13px}.run.ok ha-icon{color:var(--hm-ok,#2e7d4f)}.run.bad ha-icon{color:var(--hm-alert)}.run small{color:var(--hm-muted)}
.error{margin:6px 0 0;color:var(--hm-alert);font-size:13px}.error:empty{display:none}
.dfoot{display:flex;align-items:center;gap:6px;padding-top:10px;border-top:1px solid var(--hm-line)}
`;
