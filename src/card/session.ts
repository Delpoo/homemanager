import { HomeAssistantAdapter } from '../ha/index.js';
import { t } from '../i18n/index.js';
import { IntegrationConfigurationStore, describeError, subscribeHome } from '../integration/store.js';
import { type Adapter } from './card-helpers.js';
import { validateConfiguration } from './configuration.js';
import { clone, type Configuration } from './types.js';

import type { HomeManagerCard } from './home-manager-card.js';
export function detachHome(this: HomeManagerCard) {
  this.homeUnsubscribe?.then(unsubscribe => unsubscribe()).catch(() => {});
  this.homeUnsubscribe = undefined;
  this.home = undefined;
  this.homeState = 'idle';
}

export function watchHome(this: HomeManagerCard, home: IntegrationConfigurationStore): void {
  if (!this._hass || home.revision === null) return;
  this.homeUnsubscribe = subscribeHome(
    this._hass,
    home.homeId,
    event => this.onHomeRevision(event.revision),
    error => {
      if (this.home !== home) return;
      this.homeUnsubscribe = undefined;
      this.status(describeError(error));
    },
  );
}

export async function loadHome(this: HomeManagerCard) {
  const home = this.home;
  if (!home || !this._hass || this.homeState === 'loading') return;
  this.homeState = 'loading';
  const generation = this.generation;
  try {
    const configuration = await home.load();
    if (home !== this.home || generation !== this.generation) return;
    this.homeState = home.revision === null ? 'missing' : 'ready';
    if (!this.editing) {
      this.saved = clone(configuration);
      this.draft = clone(configuration);
      this.config!.configuration = clone(configuration);
      this.setupAdapter(configuration);
      this.render();
    }
    // Only replace our own loading/missing notices; never wipe e.g. "Guardado en Home Assistant".
    if (home.revision === null)
      this.status(
        this._hass?.user?.is_admin
          ? `El hogar «${home.homeId}» todavía no existe. Pulsá Editar plano para crearlo.`
          : `El hogar «${home.homeId}» todavía no existe. Pedile a un administrador que lo cree.`,
      );
    else if (/^Cargando el hogar|todavía no existe/.test(this.root.querySelector('.status')?.textContent ?? ''))
      this.status('');
    if (!this.homeUnsubscribe && this._hass && home.revision !== null) this.watchHome(home);
  } catch (error) {
    if (home === this.home) {
      this.homeState = 'error';
      this.status(error instanceof Error ? error.message : t('No se pudo cargar el hogar.'));
    }
  }
}

export function onHomeRevision(this: HomeManagerCard, revision: number | null) {
  // Our own save also produces an event; it may arrive before save() resolves.
  if (!this.home || this.saving || revision === this.home.revision) return;
  if (this.editing && this.dirty) {
    this.status(
      t('Otro editor guardó cambios en este hogar. Tu borrador se conserva; al guardar se detectará el conflicto.'),
    );
    return;
  }
  if (this.editing) {
    this.status(
      t('Otro editor guardó cambios: salí y volvé a entrar en edición para continuar sobre la versión nueva.'),
    );
    return;
  }
  this.homeState = 'idle';
  void this.loadHome();
}

export function setupAdapter(this: HomeManagerCard, configuration: Configuration) {
  this.unsubscribe?.();
  this.adapter?.dispose();
  this.adapter = undefined;
  this.runtime = { schemaVersion: 1, states: {} };
  try {
    const validated = validateConfiguration(configuration, { allowPending: true });
    this.adapter = new HomeAssistantAdapter({
      configuration: validated,
      verifiedFeedbackEntities: this.verifiedFeedbackEntities,
    }) as unknown as Adapter;
    this.unsubscribe = this.adapter.subscribe(s => {
      this.runtime = s;
      this.refreshState();
    });
    this.adapter.setHass(this._hass ?? null);
    this.runtime = this.adapter.getSnapshot();
  } catch {
    /* Pending references remain visible and disabled until completed in the editor. */
  }
}
