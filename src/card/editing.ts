import { HomeManagerEditor, LovelaceConfigurationStore } from '../editor/index.js';
import { getLanguage, t } from '../i18n/index.js';
import { VERSION } from '../version.js';
import { currentDashboardPath, same } from './card-helpers.js';
import { validateConfiguration } from './configuration.js';
import { clone, escapeHTML as e, type CardConfig, type Configuration } from './types.js';
import { cameraForEditedDevice } from '../model/editor-session.js';
import { unsavedCount } from '../model/move-grid.js';
import { TaskScreen } from '../ui/task-screen.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { closeConfiguration } from './settings-screen.js';
import { backupKey, browserStorage, clearBackup, readBackup, writeBackup } from '../model/draft-backup.js';

import type { HomeManagerCard } from './home-manager-card.js';
function commitPreview(card: HomeManagerCard): void {
  const before = card.editorPreviewBase;
  card.editorPreviewBase = undefined;
  if (!before || same(before, card.draft)) return;
  card.history.push(before);
  if (card.history.length > 40) card.history.shift();
  card.future = [];
  card.updateControls();
}
/** Where this card's recovery copy lives: per home (or card) and per Home Assistant user. */
export function draftBackupKey(card: HomeManagerCard): string {
  return backupKey({
    homeId: card.home?.homeId,
    cardId: card.config?.card_id,
    dashboard: card.config?.dashboard_path ?? (card.hass ? currentDashboardPath(card.hass) : undefined),
    userId: card.hass?.user?.id,
  });
}
/** Writes (or clears) the recovery copy now; called when leaving the page. */
export function flushDraftBackup(card: HomeManagerCard): void {
  clearTimeout(card.backupTimer);
  card.backupTimer = undefined;
  if (!card.editing || card.backupOffer) return;
  const storage = browserStorage(),
    key = draftBackupKey(card);
  if (card.dirty && card.draft) writeBackup(storage, key, card.draft, card.saved);
  else clearBackup(storage, key);
}
/** A short pause after each change, so typing does not write on every key. */
function scheduleDraftBackup(card: HomeManagerCard): void {
  // Throttled, not debounced: Home Assistant refreshes often and must not starve the write.
  if (!card.editing || card.backupOffer || card.backupTimer) return;
  card.backupTimer = setTimeout(() => flushDraftBackup(card), 400);
}
/** Offered once when editing starts: recover the unsaved copy or drop it. */
function offerDraftBackup(card: HomeManagerCard): void {
  const storage = browserStorage(),
    key = draftBackupKey(card);
  const backup = readBackup(storage, key, card.saved);
  if (!backup || JSON.stringify(backup.draft) === JSON.stringify(card.saved)) {
    clearBackup(storage, key);
    return;
  }
  card.backupOffer = true;
  const when = new Date(backup.savedAt).toLocaleString(getLanguage());
  const finish = () => {
    card.backupOffer = false;
    scheduleDraftBackup(card);
  };
  card.dialog(
    t('Tenés cambios sin guardar del {date}', { date: when }),
    `<p>${e(t('Quedaron en este navegador cuando saliste de la edición sin guardar. Podés recuperarlos en el borrador o descartarlos.'))}</p>${
      backup.stale
        ? `<p class="warning">${e(t('El plano cambió en Home Assistant después de esa copia. Si la recuperás, revisá el borrador antes de guardar: tus cambios reemplazan los nuevos. Deshacer vuelve al plano actual.'))}</p>`
        : ''
    }`,
    [
      {
        label: t('Recuperar'),
        action: () => {
          finish();
          card.change(structuredClone(backup.draft));
          card.status(t('Cambios recuperados en el borrador. Guardá para conservarlos.'));
        },
      },
      {
        label: t('Descartar'),
        action: () => {
          card.backupOffer = false;
          clearBackup(storage, key);
        },
      },
    ],
  );
}
/** Before closing or reloading the tab with unsaved edits, the browser asks. */
export function beforeUnload(card: HomeManagerCard, event: BeforeUnloadEvent): void {
  if (!card.editing || !card.dirty) return;
  flushDraftBackup(card);
  event.preventDefault();
  event.returnValue = '';
}
/** Outside the editor, a note says there is an unsaved copy to recover. */
export function noteDraftBackup(card: HomeManagerCard): void {
  if (card.editing || card.backupNoted || !card.config || !card.hass?.user?.is_admin) return;
  // Checked once per card: Home Assistant updates hass on every state change.
  card.backupNoted = true;
  let present = false;
  try {
    present = !!browserStorage()?.getItem(draftBackupKey(card));
  } catch {
    present = false;
  }
  if (!present) return;
  card.status(t('Tenés cambios sin guardar en este navegador. Entrá a editar el plano para recuperarlos.'));
}
export async function toggleEdit(this: HomeManagerCard) {
  if (this.loading || this.saving) return;
  if (this.editing) {
    if (this.dirty) {
      if (
        !(await confirmDialog(this.root, {
          title: t('¿Descartar los cambios?'),
          message: t('Guardá o descartá los cambios antes de salir del editor.'),
          confirm: t('Descartar cambios'),
        }))
      )
        return;
      this.discard();
    }
    flushDraftBackup(this);
    this.editing = false;
    this.configuring = false;
    this.stopPlacing();
    this.editor?.closeSurface();
    this.updateControls();
    this.renderMarkers();
    this.mountArchitecture();
    this.updateShell();
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
    this.updateShell();
    offerDraftBackup(this);
    this.offerFirstSpace();
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
  this.editor.roomView = id => this.roomViewFor(id);
  this.editor.editZones = () => this.startZoneEdit();
  this.editor.linkedReview = () => void this.reviewLinkedPlan();
  this.editor.homeId = this.home?.homeId;
  this.editor.appContext = this.shellContext;
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
    commitPreview(this);
    if (this.configuring) {
      void closeConfiguration(this);
      return;
    }
    this.positionEditor();
    const marker =
      this.selected && this.root.querySelector<HTMLElement>(`[data-id="${CSS.escape(this.selected)}"] .primary`);
    (this.editorFocus?.isConnected
      ? this.editorFocus
      : marker || this.root.querySelector<HTMLElement>('[data-command=add-device]')
    )?.focus();
  });
  this.editor.addEventListener('homemanager-editor-surface', () => {
    this.positionEditor();
    requestAnimationFrame(() => this.frameAboveSheet());
  });
  this.editor.addEventListener('homemanager-device-preview', (event: Event) => {
    event.stopPropagation();
    if (!this.editing || this.saving) return;
    const next = validateConfiguration((event as CustomEvent<{ configuration: Configuration }>).detail.configuration, {
      allowPending: true,
    });
    if (same(next, this.draft)) return;
    this.editorPreviewBase ??= clone(this.draft!);
    this.draft = next;
    this.renderMarkers();
    this.updateControls();
  });
  this.editor.addEventListener('homemanager-preview-finish', () => commitPreview(this));
  this.editor.addEventListener('homemanager-save', () => void this.save());
  this.editor.addEventListener('homemanager-task-change', () => this.positionEditor());
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
  if (this.editor && !this.editor.selectDevice(id)) return;
  this.selected = id;
  this.renderMarkers();
  this.positionEditor();
  this.frameAboveSheet();
  requestAnimationFrame(() => this.editor?.focusFirstField());
}

export function frameAboveSheet(this: HomeManagerCard) {
  if (!this.editing || !this.editor || this.editor.hidden || this.editor.surfaceMode !== 'device') return;
  const device = this.draft?.catalog.devices.find(item => item.id === this.selected);
  const host = this.root.querySelector<HTMLElement>('.workspace > .editor');
  if (!device || !host) return;
  const viewport = this.viewport.getBoundingClientRect();
  const sheet = host.getBoundingClientRect();
  const covers = sheet.left < viewport.right && sheet.right > viewport.left && sheet.top < viewport.bottom;
  const coveredBottom = covers ? Math.max(0, viewport.bottom - Math.max(viewport.top, sheet.top)) : 0;
  if (!viewport.width || viewport.height - coveredBottom < 32) return;
  this.moveCamera(
    cameraForEditedDevice(this.camera, this.box, device.position, {
      width: viewport.width,
      height: viewport.height,
      coveredBottom,
    }),
  );
}

export function positionEditor(this: HomeManagerCard) {
  const host = this.root.querySelector<HTMLElement>('.workspace > .editor');
  if (!host) return;
  host.hidden = !this.editing || !this.editor || this.editor.hidden;
  host.dataset.surface = this.editor?.surfaceMode ?? '';
  // Settings is a page of its own: no edit bar or spaces rail behind it (#70).
  this.root
    .querySelector('.shell')
    ?.classList.toggle('is-configuring', this.editing && this.editor?.surfaceMode === 'settings');
  host.dataset.expanded = String(this.editor?.sheetExpanded ?? false);
  host.dataset.task = this.editor?.shadowRoot?.querySelector('homemanager-device-picker')
    ? 'link'
    : this.editor?.shadowRoot?.querySelector('homemanager-task-screen[open]:not(.settings-dialog)')
      ? 'page'
      : '';
  this.editor?.setNarrow(this.getBoundingClientRect().width <= 650);
  host.style.removeProperty('left');
  host.style.removeProperty('top');
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
  commitPreview(this);
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
  this.editorPreviewBase = undefined;
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
  commitPreview(this);
  if (!this.history.length || this.saving) return;
  this.future.push(clone(this.draft!));
  this.draft = this.history.pop()!;
  this.syncDraft();
}

export function redo(this: HomeManagerCard) {
  commitPreview(this);
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
  if (this.editing && !this.saving && this.editor && !this.editor.flushDevice()) return;
  commitPreview(this);
  if (!this.editing || !this.dirty || this.saving || !this.store) return;
  const changes = this.draft!.catalog.devices.filter(d =>
    this.saved!.catalog.devices.some(old => old.id === d.id && old.roomId !== d.roomId),
  );
  if (changes.length && !reviewed) {
    if (
      await confirmDialog(this.root, {
        title: t('Revisar cambios de habitación'),
        message:
          changes.map(d => d.display.label).join(', ') +
          '\n' +
          t(
            'Se guarda la ubicación visual. Las entidades, áreas de Home Assistant, scripts y rutas de control conservan sus asociaciones.',
          ),
        confirm: t('Guardar ubicación visual'),
      })
    )
      await this.save(true);
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
    this.linkedSaved(next);
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
  this.renderLinkedNote();
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
  // The amber strip says how many changes are waiting (#90).
  const count = this.root.querySelector('.edit-count');
  if (count) {
    const pending = unsavedCount(this.history.length, this.editing && this.dirty);
    count.textContent = pending
      ? ` · ${pending === 1 ? t('1 cambio sin guardar') : t('{count} cambios sin guardar', { count: pending })}`
      : ` · ${t('Todo guardado')}`;
  }
  this.updateSelection();
  this.positionEditor();
  if (this.editor) this.editor.planDirty = this.dirty;
  this.insights?.update(this);
  scheduleDraftBackup(this);
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
  options: { side?: boolean } = {},
) {
  const previous = this.root.activeElement as HTMLElement | null;
  const dialog = new TaskScreen();
  // Short content opens beside the plan on a wide screen, in Now's place (#76).
  const workspace = this.root.querySelector<HTMLElement>('.workspace');
  let dock: HTMLElement | undefined;
  if (options.side && workspace && this.getBoundingClientRect().width > 650) {
    this.root.querySelector('.workspace > .side-dock')?.querySelector<TaskScreen>('homemanager-task-screen')?.close();
    dock = document.createElement('div');
    dock.className = 'side-dock';
    workspace.append(dock);
    dialog.dataset.dock = 'side';
    dock.append(dialog);
  }
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
      dock?.remove();
      previous?.focus();
    },
    { once: true },
  );
  if (!dock) this.root.append(dialog);
  dialog.show(this.root, title);
}
