import { t } from '../i18n/index.js';
import { escapeHTML as e, type Hass } from '../card/types.js';
import { describeError } from '../integration/store.js';
import { confirmDialog } from '../ui/confirm-dialog.js';

interface StorageStatus {
  bytes: number;
  image_bytes?: number;
  retained_home_ids: string[];
}
const mib = (bytes: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(bytes / 1048576);

/** Settings › Maintenance › Storage: what HomeManager keeps in Home Assistant, and
 * the histories of deleted homes that can be removed for good. #75 extends it. */
export async function storageBody(host: HTMLElement, hass: Hass, root: ShadowRoot): Promise<void> {
  if (!hass.callWS) return;
  host.innerHTML = `<p class="note">${e(t('Cargando…'))}</p>`;
  let status: StorageStatus;
  try {
    status = await hass.callWS<StorageStatus>({ type: 'homemanager/storage/status' });
  } catch (error) {
    host.innerHTML = `<p class="note pending" role="alert">${e(describeError(error))}</p>`;
    return;
  }
  if (!host.isConnected) return;
  const retained = status.retained_home_ids;
  host.innerHTML = `<p>${e(t('Uso de almacenamiento: {size} MiB de 64 MiB.', { size: mib(status.bytes) }))}</p>${status.image_bytes ? `<p class="note">${e(t('Imágenes de las alternativas del plano: {size} MiB.', { size: mib(status.image_bytes) }))}</p>` : ''}<p class="note">${e(t('Los historiales de hogares eliminados se conservan hasta que los elimines definitivamente. Las copias de seguridad se administran por separado.'))}</p>${retained.length ? `<div class="k-list">${retained.map(id => `<div class="k-row"><span class="txt"><b>${e(id)}</b></span><button type="button" class="k-btn" data-purge="${e(id)}">${e(t('Eliminar historial'))}</button></div>`).join('')}</div>` : `<p class="note">${e(t('No hay historiales de hogares eliminados.'))}</p>`}<p class="storage-status note" role="status"></p>`;
  for (const button of host.querySelectorAll<HTMLButtonElement>('[data-purge]'))
    button.addEventListener('click', async () => {
      const homeId = button.dataset.purge!;
      if (
        !(await confirmDialog(root, {
          title: t('Eliminar historial'),
          message: t('¿Eliminar definitivamente el historial de {home}?', { home: homeId }),
          trigger: button,
        }))
      )
        return;
      button.disabled = true;
      try {
        await hass.callWS!({ type: 'homemanager/history/purge', home_id: homeId, confirm: true });
        await storageBody(host, hass, root);
      } catch (error) {
        host.querySelector('.storage-status')!.textContent = describeError(error);
        button.disabled = false;
      }
    });
}
