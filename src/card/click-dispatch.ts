import { toggleFullscreen } from './fullscreen.js';
import { openConfiguration } from './settings-screen.js';
import { applyInitialView } from './initial-view.js';
import * as layerView from '../shell/layers.js';
import { showActivity, showAlerts } from '../shell/activity-view.js';
import { t } from '../i18n/index.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import type { RoomId } from './types.js';
import type { HomeManagerCard } from './home-manager-card.js';
export function onCardClick(this: HomeManagerCard, event: Event): void {
  const target = (event.target as Element).closest<HTMLElement>('button');
  if (!target) return;
  if (target.classList.contains('cluster')) {
    this.frameDevices(target.dataset.ids!.split(' '));
    return;
  }
  const marker = target.closest<HTMLElement>('.marker');
  if (marker) {
    const id = marker.dataset.id!;
    const held = this.suppressClick;
    if (held && held.id === id && Date.now() < held.until) {
      // The long press already opened the panel.
      this.suppressClick = null;
      return;
    }
    if (this.editing) {
      this.select(id);
      // The link mark opens the Device module (#95).
      if ((event.target as Element).closest('.symbol-link'))
        requestAnimationFrame(() => this.editor?.openSection('device-binding'));
      return;
    }
    if (target.closest('.pins')) return;
    const d = this.draft?.catalog.devices.find(item => item.id === id);
    if (!d) return;
    this.runGesture(id, 'tap', target);
    return;
  }
  const room = target.dataset.room as RoomId | undefined;
  if (room) {
    this.fit(room);
    if (this.editing) this.editor?.openRoom(room, this.roomViewFor(room));
    return;
  }
  const command = target.dataset.command;
  if (!command) return;
  if (command.startsWith('linked-')) {
    void this.linkedCommand(command);
    return;
  }
  if (command.startsWith('zone-')) {
    this.zoneCommand(command, target);
    return;
  }
  // The top menu stays reachable: it must not drop zones that are not applied yet.
  if (this.zoneEdit && ['configuration', 'edit', 'exit', 'settings'].includes(command)) {
    this.status(t('Terminá de editar las zonas: Aplicar o Cancelar.'));
    return;
  }
  if (command.startsWith('layer-')) {
    const id = command.slice(6);
    if (this.enabledLayers.has(id)) this.enabledLayers.delete(id);
    else this.enabledLayers.add(id);
    target.setAttribute('aria-pressed', String(this.enabledLayers.has(id)));
    this.renderMarkers();
    return;
  }
  switch (command) {
    case 'layers-collapse':
      layerView.toggleLayers();
      break;
    case 'activity':
      showActivity.call(this);
      break;
    case 'alerts':
      showAlerts.call(this);
      break;
    case 'configuration':
      this.editorFocus = target;
      void openConfiguration(this);
      break;
    case 'add-device':
      this.editorFocus = target;
      this.editor?.openAdd();
      this.positionEditor();
      break;
    case 'settings':
      this.editorFocus = target;
      this.editor?.openSettings();
      break;
    case 'exit':
    case 'edit':
      void this.toggleEdit();
      break;
    case 'all':
      this.fit(null);
      break;
    case 'home-view':
      // ⌂ returns to the saved initial view, or the whole plan without one (#94).
      if (!applyInitialView(this)) this.fit(null);
      break;
    case 'room-view':
      this.toggleRoomView();
      break;
    case 'nav-arrows':
      this.setNavMode('arrows');
      break;
    case 'nav-swipe':
      this.setNavMode('swipe');
      break;
    case 'room-new':
      this.startZoneEdit(null, 'new');
      break;
    case 'in':
      this.zoom(1.3);
      break;
    case 'out':
      this.zoom(1 / 1.3);
      break;
    case 'fullscreen':
      void toggleFullscreen(this);
      break;
    case 'info':
      this.info();
      break;
    case 'save-info':
      this.info(true);
      break;
    case 'save':
      void this.save();
      break;
    case 'discard':
      void confirmDialog(this.root, {
        title: t('¿Descartar los cambios?'),
        message: t('Se recupera la última versión guardada.'),
        confirm: t('Descartar cambios'),
        trigger: target,
      }).then(confirmed => {
        if (confirmed) this.discard();
      });
      break;
    case 'undo':
      this.undo();
      break;
    case 'redo':
      this.redo();
      break;
    case 'fixed':
      this.fixedPermit = this.selected;
      this.renderMarkers();
      this.status(t('Reubicación explícita habilitada para este dispositivo fijo durante esta edición.'));
      break;
  }
}
