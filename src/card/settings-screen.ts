import { t } from '../i18n/index.js';
import { escapeHTML as e } from './types.js';
import { appearanceBody } from '../editor/settings-page.js';
import { helpBody } from '../shell/help.js';
import type { HomeManagerCard } from './home-manager-card.js';

/** ⚙ Settings (#70): one page outside edit mode. An administrator gets every section,
 * backed by a draft of the plan that only shows Guardar when something changed; anyone
 * else gets Appearance and Help. */
export async function openConfiguration(card: HomeManagerCard): Promise<void> {
  if (card.hass?.user?.is_admin !== true) {
    card.dialog(
      t('Configuración'),
      `<h3>${e(t('Apariencia'))}</h3>${appearanceBody()}<h3>${e(t('Ayuda'))}</h3>${helpBody()}`,
      [{ label: t('Cerrar'), action: () => {} }],
    );
    return;
  }
  if (!card.editing) {
    await card.toggleEdit();
    if (!card.editing) return;
    // Entered only to edit settings: leaving Settings leaves editing too.
    card.configuring = true;
  }
  card.editor?.openSettings();
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

export const configurationStyles = `.shell.is-configuring .editor-wrap,.shell.is-configuring .rooms{display:none}`;
