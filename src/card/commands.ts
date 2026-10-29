import { t } from '../i18n/index.js';
import { airStamp, onAir, rf } from '../integration/rf.js';
import { openPanel, reasonText } from '../panels/native-panel.js';
import { ControlView, type ControlHost } from '../ui/control-view.js';
import { confidenceLabel } from './card-helpers.js';
import { controlsOf, cycleIndex, nextIndex, pinnedControls, stepLabel } from './device-controls.js';
import { escapeHTML as e, type Device, type DeviceControl } from './types.js';

import type { HomeManagerCard } from './home-manager-card.js';
export async function executeAction(this: HomeManagerCard, action: string, id: string, label?: string) {
  const token = this.feed.prepareCommand(
    id,
    action,
    this._hass,
    Date.now(),
    label ?? this.draft?.actions[action]?.service ?? action,
  );
  const result = (await this.adapter?.executeAction(action, id)) as { ok: boolean; reason?: string } | undefined;
  this.feed.noteCommandResult(token, result ?? { ok: false, reason: 'ha-unavailable' }, Date.now());
  this.updateShell();
  if (!result?.ok) throw new Error(reasonText(result?.reason ?? 'ha-unavailable'));
}

export async function sendEntityCommand(
  this: HomeManagerCard,
  id: string,
  command: { service: string; data?: Record<string, unknown> },
  entityId?: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (this.editing || !this.adapter) return { ok: false, reason: 'ha-unavailable' };
  const token = this.feed.prepareCommand(
    id,
    `entity-${command.service}`,
    this._hass,
    Date.now(),
    undefined,
    entityId ?? this.draft?.catalog.devices.find(device => device.id === id)?.bindings.entityId ?? undefined,
  );
  const result = (await this.adapter.executeEntityCommand(id, command, entityId)) as { ok: boolean; reason?: string };
  this.feed.noteCommandResult(token, result, Date.now());
  this.updateShell();
  return result;
}

export function stepKey(this: HomeManagerCard, d: Device, control: DeviceControl) {
  return `${d.id}/${control.id}`;
}

export function remembered(this: HomeManagerCard, d: Device, control: DeviceControl): number | undefined {
  if (!this.stepsLoaded) {
    this.stepsLoaded = true;
    try {
      const saved = JSON.parse(localStorage.getItem(`homemanager-steps:${this.config?.card_id}`) ?? '{}');
      for (const [key, value] of Object.entries(saved))
        if (Number.isInteger(value)) this.steps.set(key, value as number);
    } catch {
      /* Storage may be unavailable: steps are then remembered for this page only. */
    }
  }
  return this.steps.get(this.stepKey(d, control));
}

export function remember(this: HomeManagerCard, d: Device, control: DeviceControl, index: number) {
  this.steps.set(this.stepKey(d, control), index);
  try {
    localStorage.setItem(`homemanager-steps:${this.config?.card_id}`, JSON.stringify(Object.fromEntries(this.steps)));
  } catch {
    /* Not persisted; still remembered for this page. */
  }
}

export function cycleCurrent(this: HomeManagerCard, d: Device, control: DeviceControl): number {
  return cycleIndex(control, this.draft!, this._hass, this.remembered(d, control));
}

export function tapStep(this: HomeManagerCard, d: Device, control: DeviceControl): number {
  return control.type === 'cycle' ? nextIndex(control, this.cycleCurrent(d, control)) : 0;
}

export async function runStep(
  this: HomeManagerCard,
  d: Device,
  control: DeviceControl,
  index: number,
  anchor?: HTMLElement,
): Promise<string | null> {
  const step = control.steps[index];
  if (!step || this.editing || !this.adapter) return t('Salí del modo edición para controlar dispositivos.');
  const label = stepLabel(control, index, this.draft);
  const target = this.draft?.actions[step.actionId]?.target.entity_id;
  const entityId = typeof target === 'string' ? target : undefined;
  // The RF echo of this press is the one that replaces the stamp seen now.
  const baseline = entityId ? airStamp(this._hass?.states[entityId]) : null;
  try {
    await this.executeAction(step.actionId, d.id, label);
    if (control.type !== 'button' && control.type !== 'updown') this.remember(d, control, index);
    this.sentNote(d, t('Enviado: {label}', { label }), entityId, baseline);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : t('No se pudo ejecutar la acción.');
    this.status(message);
    this.sentNote(d, `${t('No se pudo enviar')} · ${label}`, undefined, null, true);
    return message;
  } finally {
    this.refreshState();
  }
}

export function sentNote(
  this: HomeManagerCard,
  d: Device,
  text: string,
  entityId: string | undefined,
  baseline: string | null,
  failed = false,
) {
  this.notes.get(d.id)?.remove();
  const note = document.createElement('div');
  note.className = `sent-note${failed ? ' failed' : ''}`;
  note.setAttribute('role', 'status');
  note.textContent = text;
  const point = this.screen(d.position);
  note.style.left = `${point.x}px`;
  note.style.top = `${point.y}px`;
  this.viewport.append(note);
  this.notes.set(d.id, note);
  const echo = () => {
    if (!note.isConnected || !entityId) return;
    const air = onAir(this._hass?.states[entityId], baseline);
    if (air === 'heard') note.textContent = `${text} · ${t('en el aire')}`;
    else if (air === 'not_heard') note.textContent = `${text} · ${t('sin eco')}`;
    if (air) clearInterval(poll);
  };
  const poll = setInterval(echo, 400);
  setTimeout(() => {
    clearInterval(poll);
    if (this.notes.get(d.id) === note) this.notes.delete(d.id);
    note.remove();
  }, 4000);
}

export function mountPins(this: HomeManagerCard) {
  this.pins.clear();
  if (!this.draft) return;
  for (const d of this.draft.catalog.devices) {
    const host = this.root.querySelector<HTMLElement>(`.marker[data-id="${CSS.escape(d.id)}"] .pins`);
    if (!host) continue;
    const views = pinnedControls(d).map(control => new ControlView(control, this.controlHost(d), true));
    for (const view of views) host.append(view.element);
    this.pins.set(d.id, views);
  }
}

export function controlHost(this: HomeManagerCard, d: Device): ControlHost {
  return {
    configuration: this.draft!,
    device: d,
    hass: () => this._hass,
    availability: actionId =>
      this.editing
        ? { available: false, reason: t('Salí del modo edición para controlar dispositivos.') }
        : (this.adapter?.getActionAvailability(actionId) ?? { available: false, reason: 'unbound-action' }),
    run: (control, index) => this.runStep(d, control, index),
    remembered: control => this.remembered(d, control),
    sendValue: async (_control, entityId, command) => {
      if (this.editing || !this.adapter) return t('Salí del modo edición para controlar dispositivos.');
      const result = (await this.sendEntityCommand(d.id, command, entityId)) as
        | { ok?: boolean; reason?: string }
        | undefined;
      if (result?.ok === false) {
        this.status(reasonText(result.reason));
        return reasonText(result.reason);
      }
      this.sentNote(d, t('Enviado'), undefined, null);
      return null;
    },
    valueAvailability: (entityId, command) =>
      this.editing
        ? { available: false, reason: t('Salí del modo edición para controlar dispositivos.') }
        : (this.adapter?.getEntityCommandAvailability(d.id, command, entityId) ?? {
            available: false,
            reason: 'ha-unavailable',
          }),
    reason: code => reasonText(code),
  };
}

export function remoteOf(this: HomeManagerCard, d: Device): string | null {
  const entity = d.bindings.entityId ? this._hass?.states[d.bindings.entityId] : undefined;
  const fromEntity = entity?.attributes?.homemanager_remote ?? entity?.attributes?.homemanager_remote_button;
  return d.bindings.remoteId ?? (typeof fromEntity === 'string' ? fromEntity : null);
}

export function showDetails(this: HomeManagerCard, id: string, returnFocus: HTMLElement, held = false) {
  const d = this.draft?.catalog.devices.find(d => d.id === id);
  if (!d || !this.draft) return;
  this.selected = id;
  this.panel?.close();
  const panel = d.bindings.advancedPopupId ? this.draft.panels[d.bindings.advancedPopupId] : undefined;
  const entityId = d.bindings.entityId;
  const remoteId = this.remoteOf(d);
  if (!panel && !entityId && !remoteId && !controlsOf(d).length) {
    this.dialog(
      t('Detalles del dispositivo'),
      `<p>${e(d.display.label)}</p><p>${e(confidenceLabel(this.runtime.states[id]?.confidence ?? 'unknown'))}</p><p>${d.bindings.advancedPopupId ? e(t('Panel nativo pendiente: {id}', { id: d.bindings.advancedPopupId })) : e(t('Vinculá una entidad o un panel en el editor para controlar este dispositivo.'))}</p>`,
      [{ label: t('Cerrar'), action: () => {} }],
    );
    return;
  }
  const scriptName = entityId?.startsWith('script.') ? entityId.slice('script.'.length) : null;
  this.panel = openPanel({
    panel: panel ?? null,
    device: d,
    state: this.runtime.states[id] ?? {
      value: 'unknown',
      confidence: 'unknown',
      observedAt: null,
      sourceEntityId: null,
      command: null,
    },
    configuration: this.draft,
    roomLabel: this.draft.rooms.find(room => room.id === d.roomId)?.label ?? null,
    availability: (actionId: string) =>
      this.adapter?.getActionAvailability(actionId) ?? { available: false, reason: t('Acción pendiente.') },
    onAction: async (actionId: string) => {
      if (!this.editing) await this.executeAction(actionId, id);
    },
    getEntity: entityId ? () => this._hass?.states[entityId] : undefined,
    getScriptFields: scriptName
      ? () => (this._hass?.services?.script?.[scriptName] as { fields?: unknown } | undefined)?.fields
      : undefined,
    entityAvailability: entityId
      ? command =>
          this.editing
            ? { available: false, reason: t('Salí del modo edición para controlar dispositivos.') }
            : (this.adapter?.getEntityCommandAvailability(id, command) ?? {
                available: false,
                reason: 'ha-unavailable',
              })
      : undefined,
    onEntityCommand: entityId ? async command => this.sendEntityCommand(id, command) : undefined,
    onAssume:
      entityId && this._hass?.states[entityId]?.attributes?.homemanager_remote
        ? isOn => (this._hass ? rf.assume(this._hass, entityId, isOn) : Promise.resolve(null))
        : undefined,
    rfRemote:
      remoteId && this._hass
        ? {
            load: async () => (await rf.library(this._hass!)).remotes.find(remote => remote.id === remoteId),
            press: async buttonId => {
              if (this.editing) throw new Error(t('Salí del modo edición para controlar dispositivos.'));
              const token = this.feed.prepareCommand(
                id,
                `remote-${buttonId}`,
                this._hass,
                Date.now(),
                buttonId,
                entityId ?? undefined,
              );
              try {
                const result = await rf.press(this._hass!, remoteId, buttonId);
                this.feed.noteCommandResult(token, { ok: true }, Date.now());
                this.updateShell();
                return result;
              } catch (error) {
                this.feed.noteCommandResult(token, { ok: false }, Date.now());
                this.updateShell();
                throw error;
              }
            },
          }
        : undefined,
    controls: controlsOf(d),
    controlHost: this.controlHost(d),
    heldOpen: held,
    returnFocus,
  });
}
