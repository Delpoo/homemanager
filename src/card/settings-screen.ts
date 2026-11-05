import { t } from '../i18n/index.js';
import { escapeHTML as e } from './types.js';
import { appearanceBody } from '../editor/settings-page.js';
import { helpBody } from '../shell/help.js';
import { setShowLink } from '../shell/show-link.js';
import type { HomeManagerCard } from './home-manager-card.js';
import type { SettingsSection } from '../editor/settings-page.js';

/** ⚙ Settings (#70): one page outside edit mode. An administrator gets every section,
 * backed by a draft of the plan that only shows Guardar when something changed; anyone
 * else gets Appearance and Help. */
export async function openConfiguration(card: HomeManagerCard, section?: SettingsSection): Promise<void> {
  if (card.hass?.user?.is_admin !== true) {
    card.dialog(
      t('Configuración'),
      `<h3>${e(t('Apariencia'))}</h3>${appearanceBody()}<h3>${e(t('Ayuda'))}</h3>${helpBody()}`,
      [{ label: t('Cerrar'), action: () => {} }],
    );
    card.root.querySelector('[data-show-link]')?.addEventListener('change', event => {
      setShowLink((event.target as HTMLSelectElement).value);
    });
    return;
  }
  if (!card.editing) {
    // Settings keeps the plan where it was, so "save this view" saves what you saw (#94).
    const camera = { ...card.camera },
      room = card.currentRoom,
      roomView = card.roomView;
    await card.toggleEdit();
    if (!card.editing) return;
    card.currentRoom = room;
    card.roomView = roomView;
    card.moveCamera(camera, false);
    // Entered only to edit settings: leaving Settings leaves editing too.
    card.configuring = true;
  }
  card.editor?.openSettings(section);
  card.positionEditor();
}

/** Back from Settings: return to the plan, asking first about unsaved changes. */
export async function closeConfiguration(card: HomeManagerCard): Promise<void> {
  if (!card.configuring) return;
  card.configuring = false;
  await card.toggleEdit();
  if (card.editing) {
    // The person chose to keep the changes: stay in Settings.
    card.configuring = true;
    card.editor?.openSettings();
  }
}

export const configurationStyles = `.shell.is-configuring .editor-wrap{display:none}.shell.is-configuring .viewport{box-shadow:none}.shell.is-configuring .edit-add{display:none}@media(max-width:650px){.shell.sheet-open .rooms{display:none}}`;
