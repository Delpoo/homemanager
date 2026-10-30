import { alertsOf, type DeviceAlert } from './alerts.js';
import { bindingIssues, deviceCatalog, usefulEntity, type CatalogReading } from './device-catalog.js';
import { entityControls, type Control } from './control-capabilities.js';
import { deviceName, nameWord, personName, readingName } from './names.js';
import { formattedValue } from './symbol-spec.js';
import type { ActivityEntry } from './activity.js';
import type { ModelDevice, ModelEntity, ModelHass } from './types.js';

export interface ChannelReading {
  name: string;
  now: string;
  today: string;
  watts: number | null;
}
export interface DeviceScreen {
  id: string;
  registryId: string | null;
  name: string;
  icon: string;
  room: string;
  age: number | null;
  /** `estimated`: HA assumes the state (IR/RF); what was sent is not shown as confirmed. */
  health: 'online' | 'estimated' | 'unavailable' | 'unknown';
  values: CatalogReading[];
  readings: CatalogReading[];
  readingGroups: { name: string; readings: CatalogReading[] }[];
  channels: ChannelReading[];
  controls: Control[];
  actions: { id: string; label: string }[];
  alerts: DeviceAlert[];
  diagnosis: { name: string; value: string }[];
  issues: string[];
  activity: { message: string; at: number; tone: string }[];
}
const modes: Record<string, string> = {
  cool: 'Frío',
  heat: 'Calor',
  heat_cool: 'Frío y calor',
  dry: 'Seco',
  fan_only: 'Ventilar',
  auto: 'Automático',
  off: 'Apagado',
  on: 'Encendido',
  idle: 'En espera',
  cooling: 'Enfriando',
  heating: 'Calentando',
  online: 'En línea',
  unavailable: 'No disponible',
  unknown: 'Sin dato',
};
export function friendlyState(entity: ModelEntity | undefined, hass?: ModelHass): string {
  if (!entity) return nameWord('unknown', hass);
  return personName(modes[entity.state] ?? formattedValue(entity, hass), nameWord('unknown', hass));
}
const channelOf = (name: string) => name.match(/^(?:canal|channel|kanal)\s+(\d+)(?:\s*[·:–-]\s*|\s+)?/i);

/** Registry membership is evidence. An old plan can consult its primary entity's device without rewriting it. */
export function deviceScreen(
  device: ModelDevice,
  hass: ModelHass | undefined,
  rooms: readonly { id: string; label: string }[],
  now: number,
  activity: readonly ActivityEntry[] = [],
  panels: Record<string, { controls: readonly { actionId: string; label: string }[] }> = {},
): DeviceScreen {
  const primary = device.bindings.entityId;
  const rawEntity = primary ? hass?.states[primary] : undefined;
  const inferred = primary ? hass?.entities?.[primary]?.device_id : null;
  const registryId = device.bindings.deviceId ?? inferred ?? null;
  const entity =
    primary && usefulEntity(primary, hass) && (!device.bindings.deviceId || inferred === device.bindings.deviceId)
      ? rawEntity
      : undefined;
  const catalog = deviceCatalog(hass).find(entry => entry.deviceId === registryId);
  const reading = (id: string): CatalogReading => ({
    entityId: id,
    name: readingName(id, hass),
    value: friendlyState(hass?.states[id], hass),
    deviceClass: String(hass?.states[id]?.attributes?.device_class ?? ''),
    areaId: null,
    icon: device.display.icon,
  });
  const all =
    catalog?.readings.map(item => ({ ...item, value: friendlyState(hass?.states[item.entityId], hass) })) ??
    (primary && usefulEntity(primary, hass) && (!registryId || inferred === registryId) ? [reading(primary)] : []);
  const channels = new Map<number, ChannelReading>();
  const channelIds = new Set<string>();
  for (const item of all) {
    const match = channelOf(item.name);
    if (!match || !['power', 'energy'].includes(item.deviceClass)) continue;
    const index = Number(match[1]);
    const row = channels.get(index) ?? {
      name: `${nameWord('channel', hass)} ${index}`,
      now: '—',
      today: '—',
      watts: null,
    };
    if (item.deviceClass === 'power') {
      row.now = item.value;
      const state = hass?.states[item.entityId];
      const number = Number(state?.state);
      row.watts =
        state && state.state.trim() && Number.isFinite(number)
          ? number * (state.attributes?.unit_of_measurement === 'kW' ? 1000 : 1)
          : null;
    } else if (/\b(?:hoy|today|daily|tagesenergie)\b/i.test(item.name)) row.today = item.value;
    channels.set(index, row);
    if (item.deviceClass === 'power' || /\b(?:hoy|today|daily|tagesenergie)\b/i.test(item.name))
      channelIds.add(item.entityId);
  }
  const capabilities = entityControls(
    primary ?? '',
    entity,
    primary?.startsWith('script.') ? hass?.services?.script?.[primary.slice(7)]?.fields : undefined,
  );
  const summary = all.filter(
    item =>
      !channelIds.has(item.entityId) &&
      !(item.entityId === primary && capabilities.some(control => control.kind !== 'reading')),
  );
  const bigValues = summary.filter(
    item => item.entityId === primary || ['sensor', 'binary_sensor'].includes(item.entityId.split('.')[0]),
  );
  const selected = [primary, ...(device.bindings.readings ?? [])].filter((id): id is string => !!id);
  const preferred = selected
    .map(id => all.find(item => item.entityId === id && (summary.includes(item) || channelIds.has(item.entityId))))
    .filter((item): item is CatalogReading => !!item);
  const values = [...preferred, ...bigValues.filter(item => !preferred.includes(item))].slice(0, 3);
  const remaining = summary.filter(item => !values.includes(item));
  const readingGroups = new Map<string, CatalogReading[]>();
  for (const item of remaining)
    readingGroups.set(item.deviceClass, [...(readingGroups.get(item.deviceClass) ?? []), item]);
  const stamps = [entity?.last_updated, entity?.last_changed]
    .map(value => Date.parse(value ?? ''))
    .filter(Number.isFinite);
  const stamp = stamps[0];
  const estimated = entity?.attributes?.assumed_state === true;
  const controls = capabilities
    .filter(control => control.kind !== 'reading')
    .map(control => ({
      ...control,
      // An assumed on/off, mode or speed is only the last command: nothing is marked as current.
      ...(estimated && ['toggle', 'select', 'steps'].includes(control.kind) ? { value: null } : {}),
      label: personName(control.label),
      ...(control.kind === 'select'
        ? {
            options: control.options.map(option => ({
              ...option,
              label: personName(modes[option.value] ?? option.label),
            })),
          }
        : {}),
    }));
  controls.sort(
    (a, b) =>
      (a.kind === 'stepper' ? -2 : a.id === 'hvac' ? -1 : 0) - (b.kind === 'stepper' ? -2 : b.id === 'hvac' ? -1 : 0),
  );
  const diagnosis = Object.entries(hass?.entities ?? {})
    .filter(
      ([id, entry]) =>
        !!registryId &&
        entry.device_id === registryId &&
        entry.entity_category === 'diagnostic' &&
        !entry.hidden &&
        !entry.hidden_by &&
        !entry.disabled &&
        !entry.disabled_by &&
        !!hass?.states[id],
    )
    .map(([id]) => ({ name: readingName(id, hass), value: friendlyState(hass?.states[id], hass) }));
  return {
    id: device.id,
    registryId,
    name: personName(
      device.display.label,
      registryId ? deviceName(hass?.devices?.[registryId], hass) : nameWord('device', hass),
    ),
    icon: device.display.icon,
    room: personName(rooms.find(room => room.id === device.roomId)?.label),
    age: Number.isFinite(stamp) && Number.isFinite(now) ? Math.max(0, now - stamp) : null,
    health:
      !entity || entity.state === 'unknown'
        ? 'unknown'
        : entity.state === 'unavailable'
          ? 'unavailable'
          : estimated
            ? 'estimated'
            : 'online',
    values,
    readings: remaining,
    readingGroups: [...readingGroups].map(([deviceClass, readings]) => ({
      name: nameWord(deviceClass || 'reading', hass),
      readings,
    })),
    channels: [...channels.entries()].sort(([a], [b]) => a - b).map(([, row]) => row),
    controls,
    actions: (panels[device.bindings.advancedPopupId ?? '']?.controls ?? []).map(control => ({
      id: control.actionId,
      label: personName(control.label, 'Acción'),
    })),
    alerts: alertsOf(device, hass, now),
    diagnosis,
    issues: bindingIssues(device.bindings, hass).map(issue => issue.code),
    activity: activity
      .filter(entry => entry.deviceId === device.id)
      .slice(-50)
      .reverse()
      .map(entry => ({
        message: [entry.message, entry.actionLabel, entry.value, entry.detail]
          .filter(Boolean)
          .map(value => personName(value))
          .join(' · '),
        at: entry.updatedAt,
        tone: entry.tone,
      })),
  };
}
