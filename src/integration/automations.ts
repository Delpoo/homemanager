import { AUTOMATION_PREFIX, fromHaConfig, parseFailure, toHaConfig, type Automation } from '../model/automations.js';
import type { Hass } from '../card/types.js';

/** Home Assistant's automation editor API, the same one its own editor uses. Saving and
 * reading need an administrator; running, turning on and off only a person. */

interface ServiceAction {
  domain: string;
  service: string;
  target: { entity_id: string | string[] };
  data?: Record<string, unknown>;
}
export interface AutomationEntry {
  automation: Automation;
  /** `automation.…`, once HA has loaded it. */
  entityId: string | null;
  enabled: boolean;
  lastTriggered: string | null;
}
export interface AutomationRun {
  start: string;
  ok: boolean;
  error: string;
}

const api = (hass: Hass) => {
  if (!hass.callApi) throw new Error('Home Assistant no permite editar automatizaciones desde acá.');
  return hass.callApi.bind(hass);
};

/** The automation entity for an id (its `id` attribute). */
export function automationEntity(hass: Hass | undefined, id: string): string | null {
  for (const [entityId, entity] of Object.entries(hass?.states ?? {}))
    if (entityId.startsWith('automation.') && entity.attributes?.id === id) return entityId;
  return null;
}

/** HomeManager's own automations, in the order HA lists them. */
export async function listAutomations(hass: Hass): Promise<AutomationEntry[]> {
  const call = api(hass);
  const ids = Object.entries(hass.states)
    .filter(
      ([entityId, entity]) =>
        entityId.startsWith('automation.') && String(entity.attributes?.id ?? '').startsWith(AUTOMATION_PREFIX),
    )
    .map(([entityId, entity]) => ({ entityId, id: String(entity.attributes.id), entity }));
  const entries = await Promise.all(
    ids.map(async ({ entityId, id, entity }): Promise<AutomationEntry | null> => {
      try {
        const automation = fromHaConfig(await call('GET', `config/automation/config/${encodeURIComponent(id)}`));
        if (!automation) return null;
        return {
          automation,
          entityId,
          enabled: entity.state === 'on',
          lastTriggered: typeof entity.attributes.last_triggered === 'string' ? entity.attributes.last_triggered : null,
        };
      } catch {
        return null;
      }
    }),
  );
  return entries
    .filter((entry): entry is AutomationEntry => !!entry)
    .sort((a, b) => a.automation.name.localeCompare(b.automation.name));
}

export async function saveAutomation(
  hass: Hass,
  automation: Automation,
  actions: Readonly<Record<string, ServiceAction>>,
): Promise<void> {
  await api(hass)(
    'POST',
    `config/automation/config/${encodeURIComponent(automation.id)}`,
    toHaConfig(automation, actions),
  );
}

export async function deleteAutomation(hass: Hass, id: string): Promise<void> {
  await api(hass)('DELETE', `config/automation/config/${encodeURIComponent(id)}`);
}

export async function setAutomationEnabled(hass: Hass, entityId: string, on: boolean): Promise<void> {
  await hass.callService?.('automation', on ? 'turn_on' : 'turn_off', {}, { entity_id: entityId });
}

/** Runs it now, as a tap on its button in Now does. */
export async function runAutomation(hass: Hass, entityId: string): Promise<void> {
  await hass.callService?.('automation', 'trigger', { skip_condition: true }, { entity_id: entityId });
}

/** The last runs HA keeps (its traces). */
export async function automationRuns(hass: Hass, id: string): Promise<AutomationRun[]> {
  if (!hass.callWS) return [];
  const traces = await hass.callWS<
    { timestamp?: { start?: string }; state?: string; script_execution?: string | null; error?: string }[]
  >({ type: 'trace/list', domain: 'automation', item_id: id });
  return (traces ?? [])
    .map(trace => ({
      start: trace.timestamp?.start ?? '',
      ok: !trace.error && !['error', 'failed_single', 'failed_conditions'].includes(trace.script_execution ?? ''),
      error: trace.error ?? '',
    }))
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 8);
}

/** Failures left by HomeManager automations, kept up to date while the card is open. */
export function subscribeFailures(
  hass: Hass,
  listener: (failures: import('../model/automations.js').AutomationFailure[]) => void,
): Promise<() => void> {
  if (!hass.connection?.subscribeMessage) return Promise.reject(new Error('not connected'));
  const current = new Map<string, import('../model/automations.js').AutomationFailure>();
  return hass.connection.subscribeMessage(
    message => {
      const { type, notifications } = (message ?? {}) as {
        type?: string;
        notifications?: Record<string, { notification_id?: unknown; title?: unknown; message?: unknown }>;
      };
      if (type === 'current') current.clear();
      for (const [id, notification] of Object.entries(notifications ?? {})) {
        if (type === 'removed') current.delete(id);
        else {
          const failure = parseFailure({ notification_id: id, ...notification });
          if (failure) current.set(id, failure);
        }
      }
      listener([...current.values()]);
    },
    { type: 'persistent_notification/subscribe' },
  );
}
