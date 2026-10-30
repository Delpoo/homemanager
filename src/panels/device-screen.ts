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
        )
      : undefined;
    const title = this.screen?.name ?? t('Ahora');
    const html = uiInsightsFrame(
      title,
      this.screen ? this.deviceContent(this.screen) : this.nowContent(),
      this.dataset.expanded === 'true',
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
    this.updateAge();
    this.refreshAvailability();
  }
  openDevice(id: string, trigger: HTMLElement): void {
    this.returnFocus = trigger;
    if (!this.deviceId && (this.card?.getBoundingClientRect().width ?? innerWidth) <= 650 && this.card)
      this.cameraBefore = { ...this.card.camera };
    this.deviceId = id;
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
      screen.alerts
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
      screen.readingGroups
        .map(group =>
          uiGroup(
            group.name,
            group.readings.map(reading => uiRow({ name: reading.name, value: reading.value })).join(''),
          ),
        )
        .join('') +
      uiFold(
        t('Actividad'),
        screen.activity.length
          ? screen.activity
              .map(entry => uiRow({ name: t(entry.message), detail: new Date(entry.at).toLocaleTimeString() }))
              .join('')
          : uiEmpty(t('Sin actividad reciente')),
      ) +
      uiFold(
        t('Diagnóstico'),
        screen.diagnosis.length
          ? screen.diagnosis.map(reading => uiRow(reading)).join('')
          : uiEmpty(t('Sin lecturas de diagnóstico')),
      ) +
      (screen.registryId && this.card?._hass?.user?.is_admin
        ? `<div class="device-footer"><a href="/config/devices/device/${encodeURIComponent(screen.registryId)}" target="_blank" rel="noopener">${uiIcon('mdi:open-in-new')}${e(t('Abrir en Home Assistant'))}</a></div>`
        : '') +
      `</div>`
    );
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
    );
    return `<h2 class="now-head">${e(t('Ahora'))}</h2><div class="now-content">${sections.length ? sections.map(section => uiGroup(t(section.title), section.rows.map(uiNowRow).join(''))).join('') : uiEmpty(t('Nada por mostrar en este espacio'))}</div>`;
  }
  private async onClick(event: Event): Promise<void> {
    const target = (event.target as Element).closest<HTMLElement>('button');
    if (!target) return;
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
          const input = target.elements.namedItem(field.name) as HTMLInputElement | HTMLSelectElement;
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
