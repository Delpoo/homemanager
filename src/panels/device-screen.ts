import { configuredNow } from '../model/now-panel.js';
import { t } from '../i18n/index.js';
import { deviceScreen, type DeviceScreen } from '../model/device-screen.js';
import { alertText, alertComponentStyles } from '../ui/alert-components.js';
import { nowSections } from '../model/now.js';
import { commandFor, type Command } from '../model/control-capabilities.js';
import { personName } from '../model/names.js';
import { controlsOf } from '../card/device-controls.js';
import type { HomeManagerCard } from '../card/home-manager-card.js';
import { reasonText } from './native-panel.js';
import { useComponents, uiGroup, uiRow, uiFold, uiNotice, uiEmpty, uiEscape as e, uiIcon } from '../ui/components.js';
import {
  uiDeviceHeader,
  uiValues,
  uiChannels,
  uiEntityControl,
  uiNowRow,
  uiInsightsFrame,
  deviceComponentStyles,
} from '../ui/device-components.js';
import { ControlView, controlViewStyles } from '../ui/control-view.js';

/** Renderer for §8 and Ahora. All decisions come from model/, every visual piece from ui/. */
export class DeviceScreenView extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private card?: HomeManagerCard;
  private deviceId: string | null = null;
  private screen?: DeviceScreen;
  private returnFocus?: HTMLElement;
  private html = '';
  private cameraBefore?: { x: number; y: number; scale: number };
  private busy = false;
  private dragY: number | null = null;
  constructor() {
    super();
    useComponents(this.root);
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(deviceComponentStyles + controlViewStyles + alertComponentStyles);
    this.root.adoptedStyleSheets = [...this.root.adoptedStyleSheets, sheet];
    this.root.addEventListener('click', event => void this.onClick(event));
    this.root.addEventListener('focusout', () =>
      queueMicrotask(() => {
        if (this.card) this.update(this.card);
      }),
    );
    this.root.addEventListener('change', event => {
      if ((event.target as HTMLElement).matches('input[type=range][data-control]'))
        void this.control(event.target as HTMLInputElement);
    });
    this.root.addEventListener('submit', event => {
      event.preventDefault();
      void this.control(event.target as HTMLFormElement);
    });
    this.root.addEventListener('keydown', event => {
      if ((event as KeyboardEvent).key === 'Escape' && this.dataset.expanded === 'true') {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      }
    });
    this.root.addEventListener('pointerdown', event => {
      if ((event.target as HTMLElement).closest('.insights-handle')) {
        this.dragY = (event as PointerEvent).clientY;
        (event.target as HTMLElement).setPointerCapture((event as PointerEvent).pointerId);
      }
    });
    this.root.addEventListener('pointerup', event => {
      if (this.dragY !== null && Math.abs((event as PointerEvent).clientY - this.dragY) > 35) {
        this.expanded((event as PointerEvent).clientY < this.dragY);
        this.dragY = null;
        // Ignore the synthetic click belonging to this completed swipe.
        this.root.addEventListener(
          'click',
          event => {
            event.preventDefault();
            event.stopImmediatePropagation();
          },
          { once: true, capture: true },
        );
      } else this.dragY = null;
    });
    this.root.addEventListener('pointercancel', () => {
      this.dragY = null;
    });
  }
  update(card: HomeManagerCard): void {
    this.card = card;
    if (typeof card._hass?.themes?.darkMode === 'boolean')
      this.dataset.theme = card._hass.themes.darkMode ? 'dark' : 'light';
    if (!card.draft) return;
    if (card.editing) {
      this.deviceId = null;
      this.dataset.expanded = 'false';
      return;
    }
    const device = card.draft.catalog.devices.find(item => item.id === this.deviceId);
    if (!device) this.deviceId = null;
    this.dataset.device = String(!!device);
    this.screen = device
      ? deviceScreen(
          device,
          card._hass,
          card.draft.rooms,
          Date.now(),
          card.activity.entries,
          card.draft.panels,
          card.feed.alertContext,
          card.draft.baseRules,
        )
      : undefined;
    const title = this.screen?.name ?? t('Ahora');
    const html = uiInsightsFrame(
      title,
      this.screen ? this.deviceContent(this.screen) : this.nowContent(),
      this.dataset.expanded === 'true',
      this.screen ? this.deviceFooter(this.screen) : '',
    );
    const editingInput = (this.root.activeElement as HTMLElement | null)?.matches('input,select,textarea');
    if (html !== this.html && !editingInput) {
      const open = [...this.root.querySelectorAll<HTMLDetailsElement>('details[open]')].map(
        node => node.querySelector('summary')?.textContent,
      );
      const scroll = this.root.querySelector('.insights-scroll')?.scrollTop ?? 0;
      const active = this.root.activeElement as HTMLElement | null;
      const focus = active?.dataset.control
        ? `[data-control="${CSS.escape(active.dataset.control)}"]${active.dataset.value ? `[data-value="${CSS.escape(active.dataset.value)}"]` : ''}`
        : null;
      this.root.innerHTML = html;
      this.installNowViews();
      this.html = html;
      for (const fold of this.root.querySelectorAll<HTMLDetailsElement>('details'))
        if (open.includes(fold.querySelector('summary')?.textContent)) fold.open = true;
      this.root.querySelector('.insights-scroll')!.scrollTop = scroll;
      if (device) {
        const host = this.root.querySelector('.device-custom');
        if (host)
          for (const control of controlsOf(device))
            host.append(new ControlView(control, card.controlHost(device), false).element);
      }
      if (focus) this.root.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
    }
    this.nowViews.forEach(view => view.refresh());
    this.updateAge();
    this.refreshAvailability();
  }
  openDevice(id: string, trigger: HTMLElement): void {
    if (this.deviceId !== id)
      this.root.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(fold => {
        fold.open = false;
      });
    this.returnFocus = trigger;
    if (!this.deviceId && (this.card?.getBoundingClientRect().width ?? innerWidth) <= 650 && this.card)
      this.cameraBefore = { ...this.card.camera };
    this.deviceId = id;
    if (this.card) {
      this.card.selected = id;
      this.card.renderMarkers();
    }
    this.expanded(true);
    this.root.querySelector('.insights-scroll')!.scrollTop = 0;
    if ((this.card?.getBoundingClientRect().width ?? innerWidth) <= 650 && this.card) {
      const device = this.card.draft?.catalog.devices.find(item => item.id === id);
      const visible = this.getBoundingClientRect().top - this.card.viewport.getBoundingClientRect().top;
      if (device && visible > 44) {
        const point = this.card.screen(device.position);
        this.card.moveCamera({ ...this.card.camera, y: this.card.camera.y + visible / 2 - point.y }, false);
      }
    }
    this.root.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }
  private expanded(value: boolean): void {
    if (!value) {
      this.deviceId = null;
      if (this.cameraBefore && this.card) {
        this.card.moveCamera(this.cameraBefore, false);
        this.cameraBefore = undefined;
      }
    }
    this.dataset.expanded = String(value);
    this.html = '';
    if (this.card) this.update(this.card);
  }
  private close(): void {
    const id = this.deviceId;
    this.deviceId = null;
    this.expanded(false);
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
    else
      (
        this.card?.root.querySelector<HTMLElement>(`[data-id="${CSS.escape(id ?? '')}"] .primary`) ??
        this.root.querySelector<HTMLElement>(`[data-action=device][data-key="${CSS.escape(id ?? '')}"]`) ??
        this.root.querySelector<HTMLElement>('.insights-handle')
      )?.focus({ preventScroll: true });
  }
  private updateAge(): void {
    const age = this.root.querySelector('[data-age]');
    if (!age || !this.screen) return;
    const seconds = this.screen.age === null ? null : Math.floor(this.screen.age / 1000);
    age.textContent =
      seconds === null
        ? ` · ${t('Sin dato reciente')}`
        : seconds < 60
          ? ` · ${t('hace {n} s', { n: seconds })}`
          : seconds < 3600
            ? ` · ${t('hace {n} min', { n: Math.floor(seconds / 60) })}`
            : ` · ${t('hace {n} h', { n: Math.floor(seconds / 3600) })}`;
  }
  private deviceContent(screen: DeviceScreen): string {
    const health = t(
      screen.health === 'online'
        ? 'En línea'
        : screen.health === 'estimated'
          ? 'Estado estimado'
          : screen.health === 'unavailable'
            ? 'No disponible'
            : 'Sin dato',
    );
    return (
      uiDeviceHeader(screen.name, screen.room, screen.icon, health, screen.health) +
      `<div class="device-content">` +
      screen.issues
        .map(() => uiNotice(t('Revisá el vínculo: una lectura ya no está disponible en este dispositivo.'), 'alert'))
        .join('') +
      [
        ...screen.alerts,
        ...(this.card?.feed.ruleResults
          .filter(result => result.rule.symbols.includes(screen.id))
          .map(result => result.alert) ?? []),
      ]
        .map(alert => uiNotice(alertText(alert), alert.level === 'critical' ? 'alert' : 'warning'))
        .join('') +
      screen.controls.map(uiEntityControl).join('') +
      (screen.actions.length
        ? uiGroup(
            t('Controles'),
            screen.actions.map(action => uiRow({ name: action.label, action: 'configured', key: action.id })).join(''),
          )
        : '') +
      (screen.values.length ? uiValues(screen.values) : '') +
      (screen.channels.length ? uiChannels(screen.channels) : '') +
      `<div class="device-custom"></div>` +
      (screen.readings.length
        ? uiFold(
            t('Otras lecturas ({count})', { count: screen.readings.length }),
            screen.readingGroups
              .map(group =>
                uiGroup(
                  group.name,
                  group.readings.map(reading => uiRow({ name: reading.name, value: reading.value })).join(''),
                ),
              )
              .join(''),
          )
        : '') +
      uiFold(
        t('Actividad'),
        screen.activity.length
          ? screen.activity
              .map(entry =>
                uiRow({
                  name: [t(entry.message), entry.detail, entry.reason ? reasonText(entry.reason) : '']
                    .filter(Boolean)
                    .join(' · '),
                  detail: new Date(entry.at).toLocaleTimeString(),
                }),
              )
              .join('')
          : uiEmpty(t('Sin actividad reciente')),
      ) +
      uiFold(
        t('Diagnóstico'),
        screen.diagnosis.length
          ? screen.diagnosis.map(reading => uiRow(reading)).join('')
          : uiEmpty(t('Sin lecturas de diagnóstico')),
      ) +
      `</div>`
    );
  }
  private deviceFooter(screen: DeviceScreen): string {
    if (!this.card?._hass?.user?.is_admin) return '';
    return `<footer class="device-footer">${screen.registryId ? `<a href="/config/devices/device/${encodeURIComponent(screen.registryId)}" target="_blank" rel="noopener">${uiIcon('mdi:open-in-new')}${e(t('Abrir en Home Assistant'))}</a>` : ''}<button class="k-btn" type="button" data-action="edit" data-key="${e(screen.id)}">${e(t('Editar'))}</button></footer>`;
  }
  private nowViews: ControlView[] = [];
  private installNowViews() {
    this.nowViews = [];
    const card = this.card;
    if (!card?.draft) return;
    for (const host of this.root.querySelectorAll<HTMLElement>('.now-control')) {
      const device = card.draft.catalog.devices.find(d => d.id === host.dataset.device);
      const control = device ? controlsOf(device).find(c => c.id === host.dataset.controlId) : undefined;
      if (device && control) {
        const view = new ControlView(control, card.controlHost(device), false);
        host.append(view.element);
        this.nowViews.push(view);
      } else host.textContent = t('Referencia no disponible');
    }
  }
  private nowContent(): string {
    const card = this.card!;
    const sections = nowSections(
      card.draft!.catalog.devices,
      card.draft!.rooms,
      card._hass,
      Date.now(),
      card.currentRoom,
      card.runtime.states,
      card.feed.alertContext,
      card.draft!.baseRules,
    );
    const global = card.feed.ruleResults.filter(
      result =>
        result.rule.now !== false &&
        (!card.currentRoom ||
          result.rule.symbols.some(
            id => card.draft!.catalog.devices.find(d => d.id === id)?.roomId === card.currentRoom,
          ) ||
          !result.rule.symbols.length),
    );
    if (global.length) {
      let alerts = sections.find(section => section.id === 'alerts');
      if (!alerts) {
        alerts = { id: 'alerts', title: 'Alertas', rows: [] };
        sections.unshift(alerts);
      }
      alerts.rows.push(
        ...global.map(result => ({
          id: result.alert.deviceId,
          name: result.rule.name,
          value: result.value,
          icon: 'mdi:bell-outline',
          tone: result.rule.level === 'alert' ? ('alert' as const) : ('warning' as const),
          alert: result.alert,
        })),
      );
    }
    const custom = configuredNow(card.draft!, card._hass, sections);
    if (custom)
      return `<h2 class="now-head">${e(t('Ahora'))}</h2><div class="now-content">${custom.length ? custom.map(section => uiGroup(t(section.title), (section.missing ? uiNotice(t('Referencia no disponible'), 'warning') : '') + (section.block.type === 'control' ? `<div class="now-control" data-device="${e(section.block.deviceId ?? '')}" data-control-id="${e(section.block.controlId ?? '')}"></div>` : section.block.type === 'shortcut' && !section.block.deviceId && section.block.roomId ? `<button type="button" class="k-btn" data-now-room="${e(section.block.roomId)}">${e(section.rows[0]?.name ?? t('Referencia no disponible'))}</button>` : section.rows.map(uiNowRow).join('')))).join('') : uiEmpty(t('Nada por mostrar en este espacio'))}</div>`;
    return `<h2 class="now-head">${e(t('Ahora'))}</h2><div class="now-content">${sections.length ? sections.map(section => uiGroup(t(section.title), section.rows.map(uiNowRow).join(''))).join('') : uiEmpty(t('Nada por mostrar en este espacio'))}</div>`;
  }
  private async onClick(event: Event): Promise<void> {
    const target = (event.target as Element).closest<HTMLElement>('button');
    if (!target) return;
    if (target.dataset.nowRoom) {
      this.card?.fit(target.dataset.nowRoom);
      return;
    }
    if (target.dataset.control) {
      await this.control(target);
      return;
    }
    if (target.dataset.action === 'close') {
      this.close();
      return;
    }
    if (target.dataset.action === 'expand') {
      this.expanded(this.dataset.expanded !== 'true');
      return;
    }
    const id = target.dataset.key;
    if (!id || !this.card) return;
    if (target.dataset.action === 'edit' && this.card._hass?.user?.is_admin) {
      const card = this.card;
      await card.toggleEdit();
      if (card.editing && card.draft?.catalog.devices.some(device => device.id === id)) card.select(id);
      return;
    }
    if (target.dataset.action === 'configured' && this.screen && !this.busy) {
      this.busy = true;
      this.refreshAvailability();
      try {
        await this.card.executeAction(id, this.screen.id, this.screen.actions.find(action => action.id === id)?.label);
        this.feedback(t('Enviado'));
      } catch (error) {
        this.feedback(error instanceof Error ? error.message : t('No se pudo enviar'));
      } finally {
        this.busy = false;
        this.refreshAvailability();
      }
    }
    if (target.dataset.action === 'device') {
      this.card.panel?.close();
      this.openDevice(id, target);
    }
    if (target.dataset.action === 'off') {
      const sections = nowSections(
        this.card.draft!.catalog.devices,
        this.card.draft!.rooms,
        this.card._hass,
        Date.now(),
        this.card.currentRoom,
        this.card.runtime.states,
        this.card.feed.alertContext,
        this.card.draft!.baseRules,
      );
      const command = sections.find(section => section.id === 'active')?.rows.find(row => row.id === id)?.off;
      if (command) await this.send(id, command);
    }
  }
  private async control(target: HTMLElement): Promise<void> {
    if (!this.screen || !this.card) return;
    const control = this.screen.controls.find(item => item.id === target.dataset.control);
    if (!control) return;
    let value: unknown = target.dataset.value ?? (target as HTMLInputElement).value;
    if (control.kind === 'toggle') value = value === 'on';
    if (control.kind === 'stepper')
      value = (control.value ?? control.min) + (value === 'increase' ? control.step : -control.step);
    if (control.kind === 'script' && target instanceof HTMLFormElement) {
      if (!target.reportValidity()) return;
      value = Object.fromEntries(
        control.fields.flatMap(field => {
          const input = target.querySelector<HTMLInputElement | HTMLSelectElement>(
            `[name="${CSS.escape(field.name)}"]`,
          )!;
          if (!input || (!input.value && !field.required)) return [];
          return [
            [
              field.name,
              field.type === 'boolean'
                ? (input as HTMLInputElement).checked
                : field.type === 'number'
                  ? Number(input.value)
                  : input.value,
            ],
          ];
        }),
      );
    }
    try {
      const command =
        control.kind === 'buttons'
          ? control.buttons.find(button => button.id === value)?.command
          : commandFor(control, value);
      if (command) await this.send(this.screen.id, command);
    } catch (error) {
      this.feedback(error instanceof Error ? t(error.message) : t('No se pudo enviar'));
    }
  }
  private refreshAvailability(): void {
    const card = this.card;
    if (!card) return;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-action=configured]')) {
      const result = card.adapter?.getActionAvailability(button.dataset.key!);
      button.disabled = this.busy || result?.available !== true;
      button.title = result?.reason ? reasonText(result.reason) : '';
    }
    for (const target of this.root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('[data-control]:not(form)')) {
      const control = this.screen?.controls.find(item => item.id === target.dataset.control);
      if (!control) continue;
      let available = !this.busy,
        reason = '';
      if (control.kind !== 'reading' && control.kind !== 'script') {
        try {
          let value: unknown = target.dataset.value ?? target.value;
          if (control.kind === 'toggle') value = value === 'on';
          if (control.kind === 'stepper')
            value = (control.value ?? control.min) + (value === 'increase' ? control.step : -control.step);
          const command =
            control.kind === 'buttons'
              ? control.buttons.find(button => button.id === value)?.command
              : commandFor(control, value);
          const result = command ? card.adapter?.getEntityCommandAvailability(this.screen!.id, command) : undefined;
          available = available && result?.available === true;
          reason = result?.reason ?? '';
          if (
            control.kind === 'stepper' &&
            control.value !== null &&
            ((target.dataset.value === 'increase' && control.value >= control.max) ||
              (target.dataset.value === 'decrease' && control.value <= control.min))
          )
            available = false;
        } catch {
          available = false;
        }
      }
      target.disabled = !available;
      target.title = reason ? reasonText(reason) : '';
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-action=off]')) {
      const result = card.adapter?.getEntityCommandAvailability(button.dataset.key!, { service: 'turn_off' });
      button.disabled = this.busy || result?.available !== true;
      button.title = result?.reason ? reasonText(result.reason) : '';
    }
  }
  private feedback(message: string): void {
    const host = this.root.querySelector('.insights-feedback');
    if (host) host.textContent = personName(message);
  }
  private async send(id: string, command: Command): Promise<void> {
    if (this.busy || !this.card) return;
    this.busy = true;
    this.refreshAvailability();
    try {
      const result = await this.card.sendEntityCommand(id, command);
      this.feedback(result.ok ? t('Enviado') : reasonText(result.reason));
    } catch {
      this.feedback(t('No se pudo enviar'));
    } finally {
      this.busy = false;
      this.refreshAvailability();
    }
  }
}
if (!customElements.get('homemanager-insights')) customElements.define('homemanager-insights', DeviceScreenView);
