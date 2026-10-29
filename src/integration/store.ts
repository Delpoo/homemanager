import { t } from '../i18n/index.js';
import { validateConfiguration, emptyConfiguration } from '../card/configuration.js';
import { clone, type Configuration, type Hass } from '../card/types.js';
import type { ConfigurationStore } from '../editor/storage.js';

/** Websocket client for the HomeManager companion integration
 * (custom_components/homemanager). Reads are open to any HA user; writes need an
 * administrator and carry the revision that was loaded, so the integration
 * rejects a save that would overwrite somebody else's newer version. */

export const INTEGRATION_DOMAIN = 'homemanager';
export interface HomeSummary {
  home_id: string;
  title: string | null;
  revision: number;
  updated_at: string;
  plan_sha256: string;
  rooms: number;
  devices: number;
}
interface HomeDocument extends HomeSummary {
  configuration: unknown;
}
interface WsError {
  code?: string;
  message?: string;
}

export function integrationAvailable(hass: Hass | undefined): boolean {
  return !!hass?.config?.components?.includes(INTEGRATION_DOMAIN);
}
export async function listHomes(hass: Hass): Promise<HomeSummary[]> {
  if (!hass.callWS) throw new Error(t('La sesión de Home Assistant no está conectada.'));
  return (await hass.callWS<{ homes: HomeSummary[] }>({ type: 'homemanager/homes' })).homes;
}
/** Revision numbers only; the listener reloads the document itself. */
export function subscribeHome(
  hass: Hass,
  homeId: string,
  listener: (event: { revision: number | null; deleted: boolean }) => void,
  onError?: (error: unknown) => void,
): Promise<() => void> | undefined {
  const pending = hass.connection?.subscribeMessage?.(
    event => listener(event as { revision: number | null; deleted: boolean }),
    { type: 'homemanager/home/subscribe', home_id: homeId },
  );
  return pending?.catch(error => {
    onError?.(error);
    return () => {};
  });
}
export function describeError(error: unknown): string {
  const { code, message } = (error ?? {}) as WsError;
  if (code === 'revision_conflict')
    return t(
      'Otro editor guardó una versión más nueva (revisión {revision}). Tu borrador se conserva: exportalo, recargá y volvé a aplicar los cambios.',
      { revision: message?.replace('revision:', '') ?? '?' },
    );
  if (code === 'unauthorized')
    return t('No tenés permiso para esta operación. Pedile acceso a una persona administradora.');
  if (code === 'storage_quota')
    return t('Se alcanzó el límite de almacenamiento. Revisá los historiales conservados desde Almacenamiento.');
  if (code === 'storage_error') return t('No se pudo guardar o leer el almacenamiento. Recargá antes de reintentar.');
  if (code === 'unknown_command') return t('La integración HomeManager no está cargada en Home Assistant.');
  if (code === 'home_not_found') return t('Ese hogar no existe en la integración HomeManager.');
  if (code === 'plan_too_large' || code === 'configuration_too_large')
    return t('El plano o la configuración superan el tamaño admitido (1 MiB / 3 MiB).');
  return message
    ? t('Home Assistant rechazó la operación: {message}', { message })
    : error instanceof Error
      ? error.message
      : t('No se pudo completar la operación.');
}

export class IntegrationConfigurationStore implements ConfigurationStore {
  readonly label = t('Home Assistant · integración HomeManager');
  /** null: the home does not exist yet and the first save creates it. */
  revision: number | null | undefined;
  title: string | null = null;
  private busy = false;

  constructor(
    private readonly getHass: () => Hass | undefined,
    readonly homeId: string,
  ) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(homeId) || homeId.length > 64)
      throw new Error('home_id debe ser kebab-case de hasta 64 caracteres.');
  }
  private session(): Hass & { callWS: NonNullable<Hass['callWS']> } {
    const hass = this.getHass();
    if (!hass?.callWS || hass.connected === false || hass.connection?.connected === false)
      throw new Error(t('La sesión de Home Assistant no está conectada. El borrador se conserva.'));
    return hass as Hass & { callWS: NonNullable<Hass['callWS']> };
  }
  private async fetch(): Promise<HomeDocument | null> {
    try {
      return await this.session().callWS<HomeDocument>({ type: 'homemanager/home/get', home_id: this.homeId });
    } catch (error) {
      if ((error as WsError)?.code === 'home_not_found') return null;
      throw new Error(describeError(error));
    }
  }
  /** Returns an empty V2 document when the home does not exist yet. */
  async load(): Promise<Configuration> {
    if (this.busy) throw new Error(t('Hay una operación en curso; esperá a que termine.'));
    this.busy = true;
    try {
      const home = await this.fetch();
      if (!home) {
        this.revision = null;
        this.title = null;
        return emptyConfiguration();
      }
      const configuration = validateConfiguration(home.configuration, { allowPending: true });
      this.revision = home.revision;
      this.title = home.title;
      return clone(configuration);
    } finally {
      this.busy = false;
    }
  }
  async save(configuration: Configuration, options: { allowPending?: boolean } = {}): Promise<void> {
    if (this.busy) throw new Error(t('Hay una operación en curso; no se inició otra.'));
    if (this.revision === undefined) throw new Error(t('Cargá primero el hogar antes de guardar.'));
    // Strict by default, like the Lovelace store: pending references stay drafts.
    const clean = validateConfiguration(configuration, { allowPending: options.allowPending ?? false });
    const hass = this.session();
    if (hass.user?.is_admin !== true)
      throw new Error(t('Guardar requiere una cuenta administradora de Home Assistant.'));
    this.busy = true;
    try {
      let saved: HomeSummary;
      try {
        saved = await hass.callWS<HomeSummary>({
          type: 'homemanager/home/save',
          home_id: this.homeId,
          expected_revision: this.revision,
          configuration: clean,
        });
      } catch (error) {
        throw new Error(describeError(error));
      }
      // The revision check makes the write atomic; the readback still proves what HA stored.
      const readback = await this.fetch();
      if (
        !readback ||
        readback.revision !== saved.revision ||
        JSON.stringify(validateConfiguration(readback.configuration, { allowPending: true })) !== JSON.stringify(clean)
      )
        throw new Error(t('Home Assistant no confirmó la configuración esperada. El borrador se conserva.'));
      this.revision = saved.revision;
    } finally {
      this.busy = false;
    }
  }
}
