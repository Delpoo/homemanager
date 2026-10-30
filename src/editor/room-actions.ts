import { t } from '../i18n/index.js';
import { escapeHTML as e, type Configuration } from '../card/types.js';
import { mergeRoom } from '../model/plan-import.js';
import { suggestedRoomIcon } from '../model/archetype.js';
import { upsertRoom } from './model.js';
import { iconPicker } from '../ui/icon-picker.js';
import { uiSegmented } from '../ui/components.js';

/** What the card knows about a space's geometry, for the room view section (CP8). */
export interface RoomViewChoices {
  /** Every destination an arrow can point to from this space. */
  arrows: { id: string; label: string; angle: number }[];
  /** Whether the plan has an SVG zone this space can go back to. */
  hasZone: boolean;
  /** Leaves the dialog and edits the shape on the plan. */
  editShape: () => void;
}

export function openRoomActions(
  root: ShadowRoot,
  configuration: Configuration,
  id: string,
  apply: (next: Configuration) => void,
  view?: RoomViewChoices,
): void {
  const room = configuration.rooms.find(item => item.id === id);
  if (!room) return;
  const count = configuration.catalog.devices.filter(device => device.roomId === id).length;
  const others = configuration.rooms.filter(item => item.id !== id);
  const dialog = document.createElement('dialog');
  dialog.className = 'room-actions';
  dialog.style.cssText =
    'width:480px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;padding:20px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);color:var(--hm-ink)';
  dialog.innerHTML = `<h2 id="room-actions-title">${e(room.label)}</h2><label>${e(t('Renombrar'))}<input name="room-name" aria-label="${e(t('Nombre del espacio'))}" value="${e(room.label)}" maxlength="240"></label><div class="field"><span>${e(t('Icono'))}</span>${iconPicker(room.icon ?? suggestedRoomIcon(room.label), t('Icono del espacio'), 'data-room-icon')}</div><p>${e(t('{count} dispositivos', { count }))}</p><label>${e(t('Fusionar en…'))}<select name="merge-room" aria-label="${e(t('Fusionar en…'))}"><option value="">${e(t('Conservar espacio'))}</option>${others.map(item => `<option value="${e(item.id)}">${e(item.label)}</option>`).join('')}</select></label><button type="button" data-room-action="merge">${e(t('Fusionar'))}</button>${count ? `<label>${e(t('Al quitar este espacio'))}<select name="remove-room" aria-label="${e(t('Al quitar este espacio'))}"><option value="keep">${e(t('Conservar espacio'))}</option><option value="unassign">${e(t('Dejarlos sin espacio'))}</option>${others.map(item => `<option value="${e(item.id)}">${e(t('Fusionar en {room}', { room: item.label }))}</option>`).join('')}</select></label>` : ''}${view ? roomViewSection(room, view) : ''}<p class="room-error" role="alert" style="color:var(--hm-alert)"></p><div class="actions"><button type="button" data-room-action="cancel">${e(t('Cancelar'))}</button><button type="button" data-room-action="remove">${e(t('Quitar'))}</button><button type="button" data-room-action="apply">${e(t('Aplicar'))}</button></div>`;
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
      if (action === 'shape') {
        dialog.close();
        view?.editShape();
        return;
      }
      let next: Configuration;
      if (action === 'apply')
        next = upsertRoom(
          configuration,
          {
            ...room,
            label: dialog.querySelector<HTMLInputElement>('[name=room-name]')!.value,
            // An emptied picker falls back to the suggestion instead of failing validation.
            icon:
              (dialog.querySelector<HTMLElement & { value?: string }>('[data-room-icon]')?.value ?? '').trim() ||
              suggestedRoomIcon(dialog.querySelector<HTMLInputElement>('[name=room-name]')!.value),
            ...(view ? roomViewInput(dialog) : {}),
          },
          { previousId: id },
        );
      else if (action === 'zone')
        // Back to the SVG zone: the drawn shape goes, and the zone is used (and copied on the next import).
        next = upsertRoom(configuration, { ...room, shape: undefined, shapeSource: undefined }, { previousId: id });
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

function roomViewSection(room: Configuration['rooms'][number], view: RoomViewChoices): string {
  const hidden = new Set(room.nav?.hidden ?? []);
  const arrows = view.arrows.length
    ? `<fieldset class="room-arrows" style="border:0;padding:0;margin:12px 0 0"><legend style="padding:0;margin-bottom:6px">${e(t('Flechas desde este espacio'))}</legend>${view.arrows
        .map(
          arrow =>
            `<label class="check"><input type="checkbox" name="room-arrow" value="${e(arrow.id)}"${hidden.has(arrow.id) ? '' : ' checked'}><ha-icon icon="mdi:arrow-right" aria-hidden="true" style="transform:rotate(${arrow.angle}rad)"></ha-icon>${e(arrow.label)}</label>`,
        )
        .join('')}</fieldset>`
    : '';
  return `<section class="room-view-section" aria-labelledby="room-view-title"><h3 id="room-view-title">${e(t('Vista por espacio'))}</h3>${uiSegmented(
    t('Encuadre al 100 %'),
    'room-frame',
    [
      { value: 'tight', label: t('Ajustado') },
      { value: 'normal', label: t('Normal') },
      { value: 'wide', label: t('Amplio') },
    ],
    room.frame ?? 'normal',
  )}<label class="check"><input type="checkbox" name="room-skip"${room.nav?.skip ? ' checked' : ''}>${e(t('Saltear al navegar'))}</label>${arrows}<div class="actions"><button type="button" data-room-action="shape">${e(t('Editar forma en el plano'))}</button>${room.shapeSource === 'app' && view.hasZone ? `<button type="button" data-room-action="zone">${e(t('Volver a la zona del SVG'))}</button>` : ''}</div></section>`;
}
function roomViewInput(dialog: HTMLDialogElement): Pick<Configuration['rooms'][number], 'frame' | 'nav'> {
  const frame = dialog.querySelector<HTMLInputElement>('[name=room-frame]:checked')?.value as
    | 'tight'
    | 'normal'
    | 'wide'
    | undefined;
  const hidden = [...dialog.querySelectorAll<HTMLInputElement>('[name=room-arrow]')]
    .filter(input => !input.checked)
    .map(input => input.value);
  const skip = dialog.querySelector<HTMLInputElement>('[name=room-skip]')?.checked === true;
  return { frame, nav: { ...(skip ? { skip } : {}), ...(hidden.length ? { hidden } : {}) } };
}
