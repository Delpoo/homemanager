import { alertText } from '../ui/alert-components.js';
import { t } from '../i18n/index.js';
import { activityIsRecent, type ActivityEntry } from '../model/activity.js';
import { escapeHTML as e } from '../card/types.js';
import type { HomeManagerCard } from '../card/home-manager-card.js';

export function activityText(entry: ActivityEntry | null, now = Date.now()): string {
  if (!entry) return t('Sin actividad reciente');
  const parts = [t(entry.message), entry.deviceLabel, entry.actionLabel, entry.value, entry.detail].filter(Boolean);
  const text = parts.filter((part, index) => !index || part !== parts[index - 1]).join(' · ');
  return activityIsRecent(entry, now) ? text : `${t('último:')} ${text}`;
}
export function showActivity(this: HomeManagerCard): void {
  this.dialog(
    t('Historial de actividad'),
    `<ol class="activity-history">${this.activity.entries
      .slice()
      .reverse()
      .map(
        entry =>
          `<li data-tone="${entry.tone}"><time>${e(new Date(entry.updatedAt).toLocaleTimeString())}</time> ${e(activityText(entry, entry.updatedAt))}</li>`,
      )
      .join('')}</ol>`,
    [{ label: t('Cerrar'), action: () => {} }],
  );
}
export function showAlerts(this: HomeManagerCard): void {
  const alerts = this.feed.alerts;
  if (alerts.length === 1) {
    focusAlert.call(this, alerts[0].deviceId);
    return;
  }
  this.dialog(
    t('Alertas'),
    `<div class="choices">${alerts.map(alert => `<button type="button" data-alert-device="${e(alert.deviceId)}">${e(alertText(alert))} · ${e(this.draft?.catalog.devices.find(device => device.id === alert.deviceId)?.display.label ?? '')}</button>`).join('')}</div>`,
    [{ label: t('Cerrar'), action: () => {} }],
  );
  const dialog = this.root.querySelector('dialog:last-of-type') as HTMLDialogElement;
  dialog.querySelectorAll<HTMLButtonElement>('[data-alert-device]').forEach(button =>
    button.addEventListener('click', () => {
      dialog.close();
      focusAlert.call(this, button.dataset.alertDevice!);
    }),
  );
}
function focusAlert(this: HomeManagerCard, id: string): void {
  const device = this.draft?.catalog.devices.find(item => item.id === id);
  if (!device) return;
  this.selected = id;
  this.currentRoom = device.roomId;
  this.enabledLayers.add('sensors');
  this.enabledLayers.add('energy');
  this.enabledLayers.add('infrastructure');
  this.renderMarkers();
  const scale = this.baseScale * 4;
  this.moveCamera({
    scale,
    x: this.viewport.clientWidth / 2 - (this.box.x + device.position.x * this.box.width) * scale,
    y: this.viewport.clientHeight / 2 - (this.box.y + device.position.y * this.box.height) * scale,
  });
  this.root.querySelector<HTMLElement>(`.marker[data-id="${CSS.escape(id)}"] .primary`)?.focus();
}
