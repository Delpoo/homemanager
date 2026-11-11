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
  // 0.13 Data and copies: the size in big, a bar split by what takes it, its legend,
  // and the cleanups as icons (their name shows on hover).
  const COLORS: Record<string, string> = {
    plans: 'var(--hm-brand)',
    images: 'var(--hm-accent,#3f7fbf)',
    retained: 'var(--hm-warn)',
    homes: '#6f6bb8',
    rf: 'var(--hm-muted)',
  };
  const parts = status.breakdown
    ? (
        [
          ['plans', t('Planos y su historial')],
          ['images', t('Imágenes de las alternativas')],
          ['retained', t('Historiales de hogares eliminados')],
          ['homes', t('Lista de hogares')],
          ['rf', t('Controles RF')],
        ] as const
      ).filter(([key]) => status.breakdown![key] > 0)
    : [];
  const bar = parts.length
    ? parts
        .map(
          ([key]) =>
            `<span style="width:${((status.breakdown![key] / limit) * 100).toFixed(2)}%;background:${COLORS[key]}"></span>`,
        )
        .join('')
    : `<span style="width:${(share * 100).toFixed(1)}%"${share >= STORAGE_WARNING ? ' data-warn' : ''}></span>`;
  const legend = parts
    .map(
      ([key, label]) =>
        `<i style="background:${COLORS[key]}"></i><span>${e(label)}</span><b>${e(mib(status.breakdown![key]))} MiB</b>`,
    )
    .join('');
  const icon = (name: string) => `<ha-icon icon="${name}" aria-hidden="true"></ha-icon>`;
  const retained = status.retained_home_ids;
  host.innerHTML = `<div class="storage-usage"><div class="st-head"><span class="st-big">${e(mib(status.bytes))}</span><span class="st-of">${e(t('de {limit} MiB', { limit: mib(limit) }))}</span><span class="grow"></span><button type="button" class="hm-icon-button small" data-storage="images" aria-label="${e(t('Quitar imágenes sin uso'))}" title="${e(t('Quitar imágenes sin uso'))}">${icon('mdi:image-remove-outline')}</button>${homeId ? `<button type="button" class="hm-icon-button small" data-storage="trim" aria-label="${e(t('Dejar sólo los 3 planos anteriores más nuevos'))}" title="${e(t('Dejar sólo los 3 planos anteriores más nuevos'))}">${icon('mdi:history')}</button>` : ''}</div><div class="storage-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(share * 100)}" aria-label="${e(t('Uso de almacenamiento'))}">${bar}</div>${legend ? `<div class="st-legend">${legend}</div>` : ''}${share >= STORAGE_WARNING ? `<p class="note pending" role="alert">${e(t('Queda poco espacio: liberá imágenes sin uso o historiales viejos.'))}</p>` : ''}</div>${retained.length ? `<div class="lbl">${e(t('Historiales de hogares eliminados'))}<span class="grow"></span></div><div class="k-list">${retained.map(id => `<div class="k-row"><span class="txt"><b>${e(id)}</b></span><button type="button" class="hm-icon-button small danger" data-purge="${e(id)}" aria-label="${e(t('Eliminar historial'))}" title="${e(t('Eliminar historial'))}">${icon('mdi:trash-can-outline')}</button></div>`).join('')}</div>` : ''}<p class="storage-status note" role="status"></p>`;
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

export const storageStyles = `.st-head{display:flex;align-items:baseline;gap:8px}.st-head .grow{flex:1}.st-big{font-size:30px;font-weight:500;line-height:1}.st-of{color:var(--hm-muted)}.st-legend{display:grid;grid-template-columns:10px 1fr auto;gap:6px 8px;align-items:center;margin-top:10px;font-size:13px}.st-legend i{width:10px;height:10px;border-radius:3px}.st-legend b{font-weight:500;font-variant-numeric:tabular-nums}.storage-bar{display:flex;height:10px;margin-top:10px;border-radius:5px;background:var(--hm-surface-2);overflow:hidden}.storage-bar span{display:block;height:100%;background:var(--hm-accent)}.storage-bar span[data-warn]{background:var(--hm-warn)}.storage-parts{list-style:none;padding:0;margin:10px 0;display:grid;gap:4px}.storage-parts li{display:flex;justify-content:space-between;gap:12px;font-size:13px}`;
