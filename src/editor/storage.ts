import { validateConfiguration } from '../card/configuration.js';
import { clone, type Configuration, type Hass } from '../card/types.js';

export interface LovelaceStoreOptions {
  cardId: string;
  dashboardPath?: string;
  dashboardMode?: 'storage' | 'yaml';
}
type JsonRecord = Record<string, unknown>;
/** Leaves headroom under HA's 4 MiB websocket frame for the message envelope. */
export const MAX_SAVE_BYTES = 4 * 1024 * 1024 - 64 * 1024;
interface SessionIdentity {
  callWS: Hass['callWS'];
  userId: string | undefined;
  connection: Hass['connection'];
}

function record(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
/** Stable comparison is only conflict detection; Lovelace offers no compare-and-swap. */
function fingerprint(value: unknown): string {
  const seen = new Set<object>();
  function sorted(input: unknown, depth: number): unknown {
    if (depth > 80) throw new Error('El dashboard excede la profundidad admitida.');
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (Array.isArray(input)) {
      if (seen.has(input)) throw new Error('El dashboard contiene referencias circulares.');
      seen.add(input);
      const output = input.map(value => sorted(value, depth + 1));
      seen.delete(input);
      return output;
    }
    if (record(input)) {
      if (seen.has(input)) throw new Error('El dashboard contiene referencias circulares.');
      seen.add(input);
      const output = Object.create(null) as JsonRecord;
      for (const key of Object.keys(input).sort()) output[key] = sorted(input[key], depth + 1);
      seen.delete(input);
      return output;
    }
    throw new Error('El dashboard no es un documento JSON válido.');
  }
  return JSON.stringify(sorted(value, 0));
}

/** Inspect UI card containers only; a catalog or arbitrary nested data is never a card. */
function matchingCards(dashboard: unknown, cardId: string): JsonRecord[] {
  if (!record(dashboard) || !Array.isArray(dashboard.views))
    throw new Error('Este dashboard no tiene vistas editables explícitas.');
  const matches: JsonRecord[] = [];
  let visited = 0;
  function visitCard(node: unknown, depth: number): void {
    if (!record(node)) return;
    if (++visited > 20000 || depth > 40) throw new Error('La estructura de tarjetas es demasiado compleja.');
    if (node.type === 'custom:homemanager-card' && node.card_id === cardId) matches.push(node);
    if (Array.isArray(node.cards)) node.cards.forEach(value => visitCard(value, depth + 1));
    if (record(node.card)) visitCard(node.card, depth + 1);
  }
  for (const view of dashboard.views) {
    if (!record(view)) continue;
    if (Array.isArray(view.cards)) view.cards.forEach(value => visitCard(value, 0));
    if (Array.isArray(view.sections))
      for (const section of view.sections)
        if (record(section) && Array.isArray(section.cards)) section.cards.forEach(value => visitCard(value, 0));
  }
  return matches;
}
function uniqueCard(dashboard: unknown, cardId: string): JsonRecord {
  const matches = matchingCards(dashboard, cardId);
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? 'Hay varias tarjetas con el mismo card_id; no se guardó.'
        : 'No se encontró una tarjeta única con ese card_id.',
    );
  return matches[0];
}

/** Where the shared configuration lives. The card depends only on this
 * interface, so a backend store (see docs/decisions.md D11) can replace the
 * Lovelace one without touching the card or the editor. */
export interface ConfigurationStore {
  readonly label: string;
  load(): Promise<Configuration>;
  /** Must verify the write (readback or revision) before resolving. */
  save(configuration: Configuration): Promise<void>;
}

/** Authenticated shared storage. Never writes localStorage or falls back to it. */
export class LovelaceConfigurationStore implements ConfigurationStore {
  readonly label = 'Home Assistant · dashboard';
  private baseline: string | undefined;
  private writing = false;
  private loading = false;
  private baselineSession: SessionIdentity | undefined;
  private readonly path: string | null;

  constructor(
    private readonly getHass: () => Hass | undefined,
    private readonly options: LovelaceStoreOptions,
  ) {
    if (!options.cardId || options.cardId.length > 240 || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(options.cardId))
      throw new Error('Definí un card_id estable y válido.');
    if (options.dashboardPath !== undefined && (!options.dashboardPath || /[/?#\s]/.test(options.dashboardPath)))
      throw new Error('El dashboard_path debe ser un identificador de dashboard.');
    this.path = options.dashboardPath ?? null;
  }
  private session(write = false): Hass & { callWS: NonNullable<Hass['callWS']> } {
    const hass = this.getHass();
    if (!hass?.callWS || hass.connected === false || hass.connection?.connected === false)
      throw new Error('La sesión de Home Assistant no está conectada. El borrador se conserva.');
    if (write) {
      if (hass.user?.is_admin !== true)
        throw new Error('Guardar requiere una sesión administradora de Home Assistant.');
      const panelMode = hass.panels?.[this.path ?? 'lovelace']?.config?.mode;
      if (this.options.dashboardMode === 'yaml' || panelMode === 'yaml')
        throw new Error('Un dashboard YAML es de solo lectura para este editor.');
      if (panelMode !== 'storage' && this.options.dashboardMode !== 'storage')
        throw new Error('No se pudo comprobar que el dashboard use modo storage.');
    }
    return hass as Hass & { callWS: NonNullable<Hass['callWS']> };
  }
  private identity(hass: Hass): SessionIdentity {
    return { callWS: hass.callWS, userId: hass.user?.id, connection: hass.connection };
  }
  private sameSession(expected: SessionIdentity): void {
    const current = this.session();
    if (
      current.callWS !== expected.callWS ||
      current.user?.id !== expected.userId ||
      current.connection !== expected.connection
    )
      throw new Error('La sesión cambió durante la operación. Volvé a cargar antes de guardar.');
  }
  private async read(expected?: SessionIdentity): Promise<JsonRecord> {
    if (expected) this.sameSession(expected);
    const dashboard = await this.session().callWS<unknown>({
      type: 'lovelace/config',
      url_path: this.path,
      force: true,
    });
    if (expected) this.sameSession(expected);
    if (!record(dashboard)) throw new Error('Home Assistant devolvió un dashboard inválido.');
    return clone(dashboard);
  }
  async load(): Promise<Configuration> {
    if (this.writing || this.loading) throw new Error('Hay una operación en curso; esperá a que termine.');
    this.loading = true;
    try {
      const session = this.identity(this.session());
      const dashboard = await this.read(session);
      const card = uniqueCard(dashboard, this.options.cardId);
      const configuration = validateConfiguration(card.configuration, { allowPending: true });
      this.baseline = fingerprint(card.configuration);
      this.baselineSession = session;
      return clone(configuration);
    } finally {
      this.loading = false;
    }
  }
  async save(configuration: Configuration): Promise<void> {
    if (this.writing || this.loading) throw new Error('Hay una operación en curso; no se inició otra.');
    if (this.baseline === undefined) throw new Error('Cargá primero la configuración del dashboard antes de guardar.');
    // Strict validation here is intentional: pending references remain editable, not savable.
    const clean = validateConfiguration(configuration);
    const session = this.identity(this.session(true));
    if (this.baselineSession) this.sameSession(this.baselineSession);
    this.writing = true;
    try {
      const current = await this.read(session);
      if (fingerprint(uniqueCard(current, this.options.cardId).configuration) !== this.baseline)
        throw new Error(
          'La configuración cambió en otro editor. Recargá y revisá los cambios; el borrador se conserva.',
        );
      const latest = await this.read(session);
      if (fingerprint(latest) !== fingerprint(current))
        throw new Error('El dashboard cambió mientras se preparaba el guardado. No se sobrescribió.');
      // Replace only our persistent document; preserve all other cards and dashboard fields.
      uniqueCard(latest, this.options.cardId).configuration = clone(clean);
      // HA rejects websocket messages above 4 MiB (aiohttp default) and the save
      // carries the WHOLE dashboard. Fail clearly before sending instead of after.
      const bytes = new TextEncoder().encode(
        JSON.stringify({ type: 'lovelace/config/save', url_path: this.path, config: latest }),
      ).byteLength;
      if (bytes > MAX_SAVE_BYTES)
        throw new Error(
          `El dashboard ocuparía ${(bytes / 1048576).toFixed(1)} MiB y Home Assistant admite hasta 4 MiB por mensaje. Reducí el plano o mové otras tarjetas a otro dashboard; el borrador se conserva.`,
        );
      this.sameSession(session);
      await this.session(true).callWS({ type: 'lovelace/config/save', url_path: this.path, config: latest });
      const readback = await this.read(session);
      const saved = validateConfiguration(uniqueCard(readback, this.options.cardId).configuration);
      if (fingerprint(saved) !== fingerprint(clean))
        throw new Error('Home Assistant no confirmó la configuración esperada. El borrador se conserva.');
      this.baseline = fingerprint(uniqueCard(readback, this.options.cardId).configuration);
    } finally {
      this.writing = false;
    }
  }
}
