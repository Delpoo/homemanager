import { HomeManagerEditor, LovelaceConfigurationStore } from '../editor/index.js';
import { t } from '../i18n/index.js';
import { VERSION } from '../version.js';
import { currentDashboardPath, same } from './card-helpers.js';
import { validateConfiguration } from './configuration.js';
import { clone, escapeHTML as e, type CardConfig, type Configuration } from './types.js';

import type { HomeManagerCard } from './home-manager-card.js';
export async function toggleEdit(this: HomeManagerCard) {
  if (this.loading || this.saving) return;
  if (this.editing) {
    if (this.dirty) {
      this.status(t('Guardá o descartá los cambios antes de salir del editor.'));
      return;
    }
    this.editing = false;
    this.stopPlacing();
    this.editor?.closeSurface();
    this.updateControls();
    this.renderMarkers();
    return;
  }
  if (!this.config || this._hass?.user?.is_admin !== true) {
    this.status(t('La edición compartida requiere una cuenta administradora de Home Assistant.'));
    return;
  }
  const dashboardPath = this.config.dashboard_path ?? currentDashboardPath(this._hass);
  if (!this.home) {
    const mode = this._hass.panels?.[dashboardPath ?? 'lovelace']?.config?.mode ?? this.config.dashboard_mode;
    if (mode !== 'storage') {
      this.status(
        mode === 'yaml'
          ? t('Este dashboard usa YAML y es de sólo lectura.')
          : t('No se pudo confirmar el modo storage del dashboard.'),
      );
      return;
    }
  }
  this.loading = true;
  this.updateControls();
  const generation = this.generation;
  try {
    this.store =
      this.home ??
      new LovelaceConfigurationStore(() => this._hass, {
        cardId: this.config.card_id,
        dashboardPath,
        dashboardMode: this.config.dashboard_mode,
      });
    const current = await this.store.load();
    if (generation !== this.generation || !this.isConnected) return;
    this.saved = clone(current);
    this.draft = clone(current);
    this.config.configuration = clone(current);
    this.editing = true;
    this.selected = null;
    this.fixedPermit = null;
    this.history = [];
    this.future = [];
    this.mountEditor();
    this.mountArchitecture();
    this.fit(null);
    this.renderMarkers();
    this.status(
      this.home?.revision === null ? `Hogar nuevo: «${this.home.homeId}» se creará en la integración al guardar.` : '',
    );
  } catch (error) {
    this.status(error instanceof Error ? error.message : t('No se pudo cargar el editor.'));
  } finally {
    this.loading = false;
    this.updateControls();
  }
}

export function mountEditor(this: HomeManagerCard) {
  const host = this.root.querySelector('.editor')!;
  this.editor = document.createElement('homemanager-editor') as HomeManagerEditor;
  this.editor.embedded = true;
  this.editor.homeId = this.home?.homeId;
  if (this._hass) this.editor.hass = this._hass;
  this.editor.setConfig({ ...this.config!, configuration: this.draft! });
  this.editor.selectedDeviceId = this.selected;
  // "Add device" in the editor asks the card for a tap on the plan.
  this.editor.addEventListener('homemanager-place', (event: Event) => {
    event.stopPropagation();
    const id = (event as CustomEvent<{ deviceId: string }>).detail.deviceId;
    this.fixedPermit = id;
    this.selected = id;
    this.startPlacing(id);
  });
  this.editor.addEventListener('homemanager-fixed', (event: Event) => {
    this.fixedPermit = (event as CustomEvent<{ deviceId: string }>).detail.deviceId;
    this.renderMarkers();
  });
  this.editor.addEventListener('homemanager-editor-close', () => {
    const marker =
      this.selected && this.root.querySelector<HTMLElement>(`[data-id="${CSS.escape(this.selected)}"] .primary`);
    (this.editorFocus?.isConnected
      ? this.editorFocus
      : marker || this.root.querySelector<HTMLElement>('[data-command=add-device]')
    )?.focus();
  });
  this.editor.addEventListener('config-changed', (event: Event) => {
    event.stopPropagation();
    if (!this.editing || this.saving) return;
    const next = (event as CustomEvent<{ config: CardConfig }>).detail.config.configuration;
    this.change(next, false);
  });
  host.replaceChildren(this.editor);
}

export function select(this: HomeManagerCard, id: string) {
  this.editorFocus = undefined;
  this.selected = id;
  if (this.editor) this.editor.selectedDeviceId = id;
  this.renderMarkers();
  this.positionEditor();
  this.frameAboveSheet();
}

export function frameAboveSheet(this: HomeManagerCard) {
  if (!matchMedia('(max-width:650px)').matches || !this.editor || this.editor.hidden) return;
  const device = this.draft?.catalog.devices.find(item => item.id === this.selected);
  const host = this.root.querySelector<HTMLElement>('.workspace > .editor');
  if (!device || !host) return;
  const visibleHeight = this.viewport.clientHeight - host.clientHeight;
  if (visibleHeight < 60) return;
  cancelAnimationFrame(this.animation);
  this.animation = 0;
  this.camera.y += visibleHeight / 2 - this.screen(device.position).y;
  this.queuePosition();
}

export function positionEditor(this: HomeManagerCard) {
  const host = this.root.querySelector<HTMLElement>('.editor');
  if (!host || !this.editing || matchMedia('(max-width:650px)').matches) return;
  const device = this.draft?.catalog.devices.find(item => item.id === this.selected);
  const point = device ? this.screen(device.position) : { x: 16, y: 16 };
  const width = Math.min(340, this.viewport.clientWidth - 24);
  const left = device && point.x + width + 40 > this.viewport.clientWidth ? point.x - width - 34 : point.x + 34;
  host.style.left = `${Math.max(12, Math.min(this.viewport.clientWidth - width - 12, left))}px`;
  host.style.top = `${Math.max(12, Math.min(this.viewport.clientHeight - Math.min(this.editor?.offsetHeight ?? 0, this.viewport.clientHeight - 24) - 12, point.y - 24))}px`;
}

export function updateSelection(this: HomeManagerCard) {
  const host = this.root.querySelector('.selection');
  if (!host) return;
  const d = this.draft?.catalog.devices.find(d => d.id === this.selected);
  host.innerHTML = d
    ? `<span>${e(d.display.label)}</span>${d.mobility === 'fixed' && this.fixedPermit !== d.id ? '<button type="button" data-command="fixed">Reubicar dispositivo fijo</button>' : ''}`
    : '';
}

export function change(this: HomeManagerCard, next: Configuration, syncEditor = true) {
  try {
    const valid = validateConfiguration(next, { allowPending: true });
    if (same(valid, this.draft)) return;
    this.history.push(clone(this.draft!));
    if (this.history.length > 40) this.history.shift();
    this.future = [];
    const architectureChanged = valid.architecture.content !== this.draft?.architecture.content;
    this.draft = valid;
    if (this.selected && !valid.catalog.devices.some(device => device.id === this.selected)) this.selected = null;
    this.fixedPermit = null;
    if (architectureChanged) {
      this.mountArchitecture();
      this.fit(null);
    }
    if (syncEditor && this.editor) {
      this.editor.setConfig({ ...this.config!, configuration: this.draft });
      this.editor.selectedDeviceId = this.selected;
    }
    this.renderMarkers();
    this.updateControls();
  } catch (error) {
    this.status(error instanceof Error ? error.message : t('Borrador no válido.'));
  }
}

export function discard(this: HomeManagerCard) {
  if (!this.saved || this.saving) return;
  this.draft = clone(this.saved);
  this.history = [];
  this.future = [];
  this.fixedPermit = null;
  this.mountEditor();
  this.mountArchitecture();
  this.renderMarkers();
  this.updateControls();
  this.status(t('Cambios descartados.'));
}

export function undo(this: HomeManagerCard) {
  if (!this.history.length || this.saving) return;
  this.future.push(clone(this.draft!));
  this.draft = this.history.pop()!;
  this.syncDraft();
}

export function redo(this: HomeManagerCard) {
  if (!this.future.length || this.saving) return;
  this.history.push(clone(this.draft!));
  this.draft = this.future.pop()!;
  this.syncDraft();
}

export function syncDraft(this: HomeManagerCard) {
  this.fixedPermit = null;
  this.mountEditor();
  this.mountArchitecture();
  this.renderMarkers();
  this.updateControls();
}

export async function save(this: HomeManagerCard, reviewed = false) {
  if (!this.editing || !this.dirty || this.saving || !this.store) return;
  const changes = this.draft!.catalog.devices.filter(d =>
    this.saved!.catalog.devices.some(old => old.id === d.id && old.roomId !== d.roomId),
  );
  if (changes.length && !reviewed) {
    this.dialog(
      t('Revisar cambios de habitación'),
      `<p>${changes.map(d => e(d.display.label)).join(', ')}</p><p>Se guarda la ubicación visual. Las entidades, áreas de Home Assistant, scripts y rutas de control conservan sus asociaciones.</p>`,
      [
        { label: t('Volver a editar'), action: () => {} },
        {
          label: t('Guardar ubicación visual'),
          action: () => {
            void this.save(true);
          },
        },
      ],
    );
    return;
  }
  try {
    const next = validateConfiguration(this.draft);
    this.saving = true;
    this.updateControls();
    const generation = this.generation;
    await this.store.save(next);
    if (generation !== this.generation || !this.isConnected) return;
    this.saved = clone(next);
    this.draft = clone(next);
    this.config!.configuration = clone(next);
    this.history = [];
    this.future = [];
    this.fixedPermit = null;
    this.setupAdapter(next);
    if (this.home) {
      this.homeState = 'ready';
      if (!this.homeUnsubscribe && this._hass) this.watchHome(this.home);
    }
    this.status(t('Guardado en Home Assistant.'));
    this.activity.record({ type: 'saved', id: String(Date.now()), at: Date.now() });
    this.dispatchEvent(
      new CustomEvent('homemanager-saved', { detail: { configuration: clone(next) }, bubbles: true, composed: true }),
    );
  } catch (error) {
    this.status(`${error instanceof Error ? error.message : t('No se pudo guardar.')} El borrador sigue pendiente.`);
  } finally {
    this.saving = false;
    this.refreshState();
    this.updateControls();
  }
}

export function updateControls(this: HomeManagerCard) {
  const edit = this.root.querySelector<HTMLButtonElement>('[data-command=edit]');
  if (edit) {
    edit.setAttribute('aria-pressed', String(this.editing));
    edit.disabled = this.loading || this.saving;
  }
  const wrap = this.root.querySelector<HTMLElement>('.editor-wrap');
  if (wrap) wrap.hidden = !this.editing;
  for (const item of this.root.querySelectorAll<HTMLElement>('.edit-add, .workspace > .editor'))
    item.hidden = !this.editing;
  this.root.querySelector('.shell')?.classList.toggle('is-editing', this.editing);
  for (const item of this.root.querySelectorAll<HTMLButtonElement>(
    '[data-command=add-device], [data-command=settings], [data-command=exit]',
  ))
    item.disabled = this.loading || this.saving;
  const save = this.root.querySelector<HTMLButtonElement>('[data-command=save]');
  if (save) {
    save.dataset.dirty = String(this.dirty);
    save.disabled = !this.dirty || this.loading || this.saving || this._hass?.user?.is_admin !== true;
    save.setAttribute('aria-label', this.saving ? t('Guardando…') : t('Guardar cambios'));
    save.title = save.getAttribute('aria-label')!;
  }
  const undo = this.root.querySelector<HTMLButtonElement>('[data-command=undo]');
  if (undo) undo.disabled = !this.history.length || this.saving;
  const redo = this.root.querySelector<HTMLButtonElement>('[data-command=redo]');
  if (redo) redo.disabled = !this.future.length || this.saving;
  const discard = this.root.querySelector<HTMLButtonElement>('[data-command=discard]');
  if (discard) discard.disabled = this.saving || !this.dirty;
  this.updateSelection();
  this.positionEditor();
  this.insights?.update(this);
}

export function status(this: HomeManagerCard, message: string) {
  const host = this.root.querySelector('.status');
  if (host) host.textContent = message;
}

export function info(this: HomeManagerCard, storage = false) {
  const p = (text: string) => `<p>${e(text)}</p>`;
  this.dialog(
    storage ? t('Guardado compartido') : t('HomeManager'),
    storage
      ? this.home
        ? p(
            t(
              'Este plano se guarda en la integración HomeManager. Cada guardado comprueba la revisión: si otra persona guardó antes, tus cambios no la pisan y el borrador se conserva.',
            ),
          ) + p(t('Los planos anteriores quedan en el historial y se pueden restaurar desde Importar y exportar.'))
        : p(
            t(
              'El guardado requiere administrador y dashboard Lovelace storage. Sólo se anuncia guardado después de leer la configuración confirmada por HA.',
            ),
          ) +
          p(
            t(
              'Usá un único editor activo. La API guarda el dashboard completo y no ofrece una revisión atómica entre clientes. Ante conflicto se conserva el borrador para exportarlo.',
            ),
          )
      : p(
          t(
            'Tocá un dispositivo para su acción principal. Mantenelo pulsado, hacé clic derecho o usá el botón ⋯ para abrir sus controles.',
          ),
        ) +
          p(
            t(
              'Arrastrá para desplazarte, pellizcá o usá la rueda para acercar, y tocá dos veces para ampliar. Los números agrupan dispositivos cercanos: tocalos para acercarte.',
            ),
          ) +
          p(t('Versión {version}', { version: VERSION })) +
          `<dl class="confidence-list"><dt>${e(t('Confirmado'))}</dt><dd>${e(t('Feedback medido y verificado.'))}</dd><dt>${e(t('Estimado'))}</dt><dd>${e(t('Lectura sin confirmación independiente.'))}</dd><dt>${e(t('Comando aceptado'))}</dt><dd>${e(t('HA aceptó la llamada; el efecto físico no está confirmado.'))}</dd><dt>${e(t('Desconocido / error'))}</dt><dd>${e(t('Sin evidencia válida o llamada fallida.'))}</dd></dl>`,
    [{ label: t('Cerrar'), action: () => {} }],
  );
}

export function dialog(
  this: HomeManagerCard,
  title: string,
  body: string,
  actions: { label: string; action: () => void }[],
) {
  const previous = this.root.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `<h2>${e(title)}</h2>${body}<div class="actions"></div>`;
  const heading = dialog.querySelector('h2')!;
  heading.id = 'hm-dialog-title';
  dialog.setAttribute('aria-labelledby', heading.id);
  const actionHost = dialog.querySelector('.actions')!;
  actions.forEach(item => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = item.label;
    b.addEventListener('click', () => {
      dialog.close();
      item.action();
    });
    actionHost.append(b);
  });
  dialog.addEventListener(
    'close',
    () => {
      dialog.remove();
      previous?.focus();
    },
    { once: true },
  );
  this.root.append(dialog);
  dialog.showModal();
}
