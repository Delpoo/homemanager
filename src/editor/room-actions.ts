import { t } from '../i18n/index.js';
import { TaskScreen, taskScreen } from '../ui/task-screen.js';
import { escapeHTML as e, type Configuration } from '../card/types.js';
import { mergeRoom } from '../model/plan-import.js';
import { suggestedRoomIcon } from '../model/archetype.js';
import { upsertRoom } from './model.js';
import { iconPicker } from '../ui/icon-picker.js';
import { uiButton, uiIcon, uiSegmented } from '../ui/components.js';
import { installDialogComponents, panelField } from '../ui/panel-components.js';

/** What the card knows about a space's geometry, for the room view section (CP8). */
export interface RoomViewChoices {
  /** Every destination an arrow can point to from this space. */
  arrows: { id: string; label: string; angle: number }[];
  /** Whether the plan has an SVG zone this space can go back to. */
  hasZone: boolean;
  /** Leaves the dialog and edits the shape on the plan. */
  editShape: () => void;
}
type Room = Configuration['rooms'][number];

/** A space's window (mockup §11 and §14): name, icon, room view, shape and what happens to its devices. */
export function openRoomActions(
  root: ShadowRoot,
  configuration: Configuration,
  id: string,
  apply: (next: Configuration) => void,
  view?: RoomViewChoices,
): void {
  const room = configuration.rooms.find(item => item.id === id);
  if (!room) return;
  installDialogComponents(root);
  adoptRoomStyles(root);
  const count = configuration.catalog.devices.filter(device => device.roomId === id).length;
  const others = configuration.rooms.filter(item => item.id !== id);
  const options = (first: string, firstLabel: string, items: string) =>
    `<option value="${first}">${e(firstLabel)}</option>${items}`;
  const body = `<div class="room-basic">${panelField(t('Nombre del espacio'), `<input name="room-name" value="${e(room.label)}" maxlength="240">`)}<div class="k-field"><span class="k-field-title">${e(t('Icono'))}</span>${iconPicker(room.icon ?? suggestedRoomIcon(room.label), t('Icono del espacio'), 'wide data-room-icon')}</div></div>${view ? roomViewSection(room, view) : ''}<section class="room-section" aria-labelledby="room-devices-title"><h3 id="room-devices-title">${e(t('{count} dispositivos', { count }))}</h3>${panelField(t('Fusionar en…'), `<select name="merge-room">${options('', t('Conservar espacio'), others.map(item => `<option value="${e(item.id)}">${e(item.label)}</option>`).join(''))}</select>`)}${uiButton(t('Fusionar'), 'merge')}${count ? panelField(t('Al quitar este espacio'), `<select name="remove-room">${options('keep', t('Conservar espacio'), `<option value="unassign">${e(t('Dejarlos sin espacio'))}</option>${others.map(item => `<option value="${e(item.id)}">${e(t('Fusionar en {room}', { room: item.label }))}</option>`).join('')}`)}</select>`) : ''}</section><p class="room-error" role="alert"></p>`;
  const footer = `${uiButton(t('Quitar'), 'remove', 'danger')}<span class="room-spacer"></span>${uiButton(t('Cancelar'), 'cancel')}${uiButton(t('Aplicar'), 'apply', 'primary')}`;
  const template = document.createElement('template');
  template.innerHTML = taskScreen(room.label, body, footer, 'room-actions');
  const dialog = template.content.querySelector<TaskScreen>('homemanager-task-screen')!;
  dialog.guardChanges = true;
  dialog.removeAttribute('aria-labelledby');
  dialog.setAttribute('aria-label', room.label);
  // Each arrow's direction, as it points on the plan.
  for (const icon of dialog.querySelectorAll<HTMLElement>('.room-direction'))
    icon.style.transform = `rotate(${Number(icon.dataset.angle)}rad)`;
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
    const action = (event.target as Element).closest<HTMLElement>('button[data-action]')?.dataset.action;
    if (!action) return;
    try {
      if (action === 'cancel') {
        void dialog.back();
        return;
      }
      if (action === 'shape') {
        dialog.close();
        view?.editShape();
        return;
      }
      let next: Configuration;
      const name = dialog.querySelector<HTMLInputElement>('[name=room-name]')!.value;
      if (action === 'apply')
        next = upsertRoom(
          configuration,
          {
            ...room,
            label: name,
            // An emptied picker falls back to the suggestion instead of failing validation.
            icon:
              (dialog.querySelector<HTMLElement & { value?: string }>('[data-room-icon]')?.value ?? '').trim() ||
              suggestedRoomIcon(name),
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
      } else if (action === 'remove') {
        const target = count ? dialog.querySelector<HTMLSelectElement>('[name=remove-room]')!.value : 'unassign';
        if (target === 'keep') throw new Error(t('Elegí fusionar los dispositivos o dejarlos sin espacio.'));
        next = mergeRoom(configuration, id, target === 'unassign' ? null : target);
      } else return;
      dialog.close();
      apply(next);
    } catch (error) {
      dialog.querySelector('.room-error')!.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  root.append(dialog);
  dialog.show(root);
}

function roomViewSection(room: Room, view: RoomViewChoices): string {
  const hidden = new Set(room.nav?.hidden ?? []);
  const arrows = view.arrows.length
    ? `<fieldset class="room-arrows"><legend>${e(t('Flechas desde este espacio'))}</legend>${view.arrows
        .map(
          arrow =>
            `<label class="k-row room-arrow"><input class="k-checkbox" type="checkbox" name="room-arrow" value="${e(arrow.id)}"${hidden.has(arrow.id) ? '' : ' checked'}><span class="room-direction" data-angle="${arrow.angle}">${uiIcon('mdi:arrow-right')}</span><span class="txt"><b>${e(arrow.label)}</b></span></label>`,
        )
        .join('')}</fieldset>`
    : '';
  return `<section class="room-section" aria-labelledby="room-view-title"><h3 id="room-view-title">${e(t('Vista por espacio'))}</h3>${uiSegmented(
    t('Encuadre al 100 %'),
    'room-frame',
    [
      { value: 'tight', label: t('Ajustado') },
      { value: 'normal', label: t('Normal') },
      { value: 'wide', label: t('Amplio') },
    ],
    room.frame ?? 'normal',
  )}<label class="k-row room-arrow"><input class="k-checkbox" type="checkbox" name="room-skip"${room.nav?.skip ? ' checked' : ''}><span class="txt"><b>${e(t('Saltear al navegar'))}</b><span>${e(t('Como un pasillo: se pasa de largo'))}</span></span></label>${arrows}<div class="room-shape">${uiButton(t('Editar forma en el plano'), 'shape', 'secondary', 'mdi:vector-rectangle')}${room.shapeSource === 'app' && view.hasZone ? uiButton(t('Volver a la zona del SVG'), 'zone', 'ghost') : ''}</div></section>`;
}
function roomViewInput(dialog: HTMLElement): Pick<Room, 'frame' | 'nav'> {
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

const adopted = new WeakSet<ShadowRoot>();
function adoptRoomStyles(root: ShadowRoot): void {
  if (adopted.has(root)) return;
  adopted.add(root);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(roomActionsStyles);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}
/** Styles of the space window; the dialog itself comes from the shared components. */
export const roomActionsStyles = `
.room-actions{width:480px}.room-actions .k-dialog-body{gap:18px}
.room-basic{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:end}
.room-section{display:grid;gap:10px;padding-top:14px;border-top:1px solid var(--hm-line)}.room-section h3{margin:0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--hm-muted);font-weight:600}
.room-arrows{border:0;margin:0;padding:0;display:grid;gap:0;border:1px solid var(--hm-line);border-radius:14px;overflow:hidden}.room-arrows legend{font-size:13px;color:var(--hm-muted);padding:0;margin-bottom:6px}
.room-arrow{cursor:pointer;min-height:48px}.room-arrows .room-arrow:first-of-type{border-top:0}
.room-direction{display:grid;place-items:center;width:28px;height:28px;color:var(--hm-brand)}.room-direction ha-icon{--mdc-icon-size:20px}
.room-shape{display:flex;gap:8px;flex-wrap:wrap}
.room-error{margin:0;color:var(--hm-alert);font-size:13px}.room-error:empty{display:none}
.room-actions .k-dialog-foot .room-spacer{flex:1}
@media(max-width:650px){.room-basic{grid-template-columns:1fr}}
`;
