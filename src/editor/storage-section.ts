import { t, getLanguage } from '../i18n/index.js';
import { escapeHTML as e, type Hass } from '../card/types.js';
import { describeError } from '../integration/store.js';
import { confirmDialog } from '../ui/confirm-dialog.js';

interface StorageStatus {
  bytes: number;
  image_bytes?: number;
  retained_home_ids: string[];
  /** Plan 0.12 (#75): what takes the space. Absent on an older integration. */
  breakdown?: { homes: number; plans: number; images: number; retained: number; rf: number };
  limit?: number;
}
const LIMIT = 64 * 1048576;
const mib = (bytes: number) =>
  new Intl.NumberFormat(getLanguage(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(bytes / 1048576);
/** From 80 % the space is worth a look (#75). */
export const STORAGE_WARNING = 0.8;

/** Settings › Maintenance › Storage (#75): usage, what takes it, and explicit cleanups. */
export async function storageBody(host: HTMLElement, hass: Hass, root: ShadowRoot, homeId?: string): Promise<void> {
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
  const limit = status.limit ?? LIMIT;
  const share = Math.min(1, status.bytes / limit);
  // Home status warns from 80 % too (#74).
  host.dispatchEvent(new CustomEvent('homemanager-storage-share', { detail: share, bubbles: true, composed: true }));
  const parts = status.breakdown
    ? (
        [
          ['plans', t('Planos y su historial')],
          ['images', t('Imágenes de las alternativas')],
          ['retained', t('Historiales de hogares eliminados')],
          ['homes', t('Lista de hogares')],
          ['rf', t('Controles RF')],
        ] as const
      )
        .map(([key, label]) => `<li><span>${e(label)}</span><b>${e(mib(status.breakdown![key]))} MiB</b></li>`)
        .join('')
    : '';
  const retained = status.retained_home_ids;
  host.innerHTML = `<div class="storage-usage"><p>${e(t('Uso de almacenamiento: {size} MiB de {limit} MiB.', { size: mib(status.bytes), limit: mib(limit) }))}</p><div class="storage-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(share * 100)}" aria-label="${e(t('Uso de almacenamiento'))}"><span style="width:${(share * 100).toFixed(1)}%"${share >= STORAGE_WARNING ? ' data-warn' : ''}></span></div>${share >= STORAGE_WARNING ? `<p class="note pending" role="alert">${e(t('Queda poco espacio: liberá imágenes sin uso o historiales viejos.'))}</p>` : ''}${parts ? `<ul class="storage-parts">${parts}</ul>` : ''}</div>
  <h4>${e(t('Liberar espacio'))}</h4><div class="rooms-actions"><button type="button" data-storage="images">${e(t('Quitar imágenes sin uso'))}</button>${homeId ? `<button type="button" data-storage="trim">${e(t('Dejar sólo los 3 planos anteriores más nuevos'))}</button>` : ''}</div>
  <p class="note">${e(t('Los historiales de hogares eliminados se conservan hasta que los elimines definitivamente. Las copias de seguridad se administran por separado.'))}</p>${retained.length ? `<div class="k-list">${retained.map(id => `<div class="k-row"><span class="txt"><b>${e(id)}</b></span><button type="button" class="k-btn" data-purge="${e(id)}">${e(t('Eliminar historial'))}</button></div>`).join('')}</div>` : `<p class="note">${e(t('No hay historiales de hogares eliminados.'))}</p>`}<p class="storage-status note" role="status"></p>`;
  const say = (text: string) => (host.querySelector('.storage-status')!.textContent = text);
  const confirmed = (title: string, message: string, trigger: HTMLElement, confirm?: string) =>
    confirmDialog(root, { title, message, trigger, ...(confirm ? { confirm } : {}) });
  host.querySelector<HTMLButtonElement>('[data-storage=images]')?.addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    if (
      !(await confirmed(
        t('¿Quitar las imágenes sin uso?'),
        t('Se borran las imágenes que ningún plano guardado muestra, también las que subiste y todavía no guardaste.'),
        button,
        t('Quitar'),
      ))
    )
      return;
    try {
      const result = await hass.callWS!<{ removed: number }>({ type: 'homemanager/images/prune', confirm: true });
      await storageBody(host, hass, root, homeId);
      host.querySelector('.storage-status')!.textContent = t('Imágenes quitadas: {count}.', { count: result.removed });
    } catch (error) {
      say(describeError(error));
    }
  });
  host.querySelector<HTMLButtonElement>('[data-storage=trim]')?.addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    if (
      !(await confirmed(
        t('¿Borrar planos anteriores?'),
        t('Se conservan el plano actual y los 3 anteriores más nuevos. Los demás ya no se pueden restaurar.'),
        button,
        t('Borrar'),
      ))
    )
      return;
    try {
      const result = await hass.callWS!<{ removed: number }>({
        type: 'homemanager/history/trim',
        home_id: homeId,
        keep: 4,
        confirm: true,
      });
      await storageBody(host, hass, root, homeId);
      host.querySelector('.storage-status')!.textContent = t('Planos anteriores borrados: {count}.', {
        count: result.removed,
      });
    } catch (error) {
      say(describeError(error));
    }
  });
  for (const button of host.querySelectorAll<HTMLButtonElement>('[data-purge]'))
    button.addEventListener('click', async () => {
      const id = button.dataset.purge!;
      if (
        !(await confirmed(
          t('Eliminar historial'),
          t('¿Eliminar definitivamente el historial de {home}?', { home: id }),
          button,
        ))
      )
        return;
      button.disabled = true;
      try {
        await hass.callWS!({ type: 'homemanager/history/purge', home_id: id, confirm: true });
        await storageBody(host, hass, root, homeId);
      } catch (error) {
        say(describeError(error));
        button.disabled = false;
      }
    });
}

export const storageStyles = `.storage-bar{height:10px;border-radius:5px;background:var(--hm-surface-2);overflow:hidden}.storage-bar span{display:block;height:100%;background:var(--hm-accent)}.storage-bar span[data-warn]{background:var(--hm-warn)}.storage-parts{list-style:none;padding:0;margin:10px 0;display:grid;gap:4px}.storage-parts li{display:flex;justify-content:space-between;gap:12px;font-size:13px}`;
