import { t } from '../i18n/index.js';
import { escapeHTML as e, type Configuration } from '../card/types.js';
import { mergeRoom } from '../model/plan-import.js';
import { suggestedRoomIcon } from '../model/archetype.js';
import { upsertRoom } from './model.js';

export function openRoomActions(
  root: ShadowRoot,
  configuration: Configuration,
  id: string,
  apply: (next: Configuration) => void,
): void {
  const room = configuration.rooms.find(item => item.id === id);
  if (!room) return;
  const count = configuration.catalog.devices.filter(device => device.roomId === id).length;
  const others = configuration.rooms.filter(item => item.id !== id);
  const dialog = document.createElement('dialog');
  dialog.className = 'room-actions';
  dialog.style.cssText =
    'width:480px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;padding:20px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);color:var(--hm-ink)';
  dialog.innerHTML = `<h2 id="room-actions-title">${e(room.label)}</h2><label>${e(t('Renombrar'))}<input name="room-name" aria-label="${e(t('Nombre del espacio'))}" value="${e(room.label)}" maxlength="240"></label><label>${e(t('Icono'))}<input name="room-icon" aria-label="${e(t('Icono del espacio'))}" value="${e(room.icon ?? suggestedRoomIcon(room.label))}"></label><p>${e(t('{count} dispositivos', { count }))}</p><label>${e(t('Fusionar en…'))}<select name="merge-room" aria-label="${e(t('Fusionar en…'))}"><option value="">${e(t('Conservar espacio'))}</option>${others.map(item => `<option value="${e(item.id)}">${e(item.label)}</option>`).join('')}</select></label><button type="button" data-room-action="merge">${e(t('Fusionar'))}</button>${count ? `<label>${e(t('Al quitar este espacio'))}<select name="remove-room" aria-label="${e(t('Al quitar este espacio'))}"><option value="keep">${e(t('Conservar espacio'))}</option><option value="unassign">${e(t('Dejarlos sin espacio'))}</option>${others.map(item => `<option value="${e(item.id)}">${e(t('Fusionar en {room}', { room: item.label }))}</option>`).join('')}</select></label>` : ''}<p class="room-error" role="alert" style="color:var(--hm-alert)"></p><div class="actions"><button type="button" data-room-action="cancel">${e(t('Cancelar'))}</button><button type="button" data-room-action="remove">${e(t('Quitar'))}</button><button type="button" data-room-action="apply">${e(t('Aplicar'))}</button></div>`;
  dialog.setAttribute('aria-labelledby', 'room-actions-title');
  const previous = root.activeElement as HTMLElement | null;
  dialog.addEventListener(
    'close',
    () => {
      dialog.remove();
      previous?.focus();
    },
    { once: true },
  );
  dialog.addEventListener('click', event => {
    const action = (event.target as Element).closest<HTMLElement>('[data-room-action]')?.dataset.roomAction;
    if (!action) return;
    try {
      if (action === 'cancel') {
        dialog.close();
        return;
      }
      let next: Configuration;
      if (action === 'apply')
        next = upsertRoom(
          configuration,
          {
            ...room,
            label: dialog.querySelector<HTMLInputElement>('[name=room-name]')!.value,
            icon: dialog.querySelector<HTMLInputElement>('[name=room-icon]')!.value,
          },
          { previousId: id },
        );
      else if (action === 'merge') {
        const target = dialog.querySelector<HTMLSelectElement>('[name=merge-room]')!.value;
        if (!target) throw new Error(t('Elegí el espacio de destino.'));
        next = mergeRoom(configuration, id, target);
      } else {
        const target = count ? dialog.querySelector<HTMLSelectElement>('[name=remove-room]')!.value : 'unassign';
        if (target === 'keep') throw new Error(t('Elegí fusionar los dispositivos o dejarlos sin espacio.'));
        next = mergeRoom(configuration, id, target === 'unassign' ? null : target);
      }
      dialog.close();
      apply(next);
    } catch (error) {
      dialog.querySelector('.room-error')!.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  root.append(dialog);
  dialog.showModal();
}
