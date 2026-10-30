import { alertsOf } from './alerts.js';
import { archetypeOf, activeStateOf } from './archetype.js';
import { deviceScreen, friendlyState } from './device-screen.js';
import { personName } from './names.js';
import { entityOf, type ModelDevice, type ModelHass, type ModelRuntime } from './types.js';
import { entityControls, type Command } from './control-capabilities.js';

export interface NowRow {
  id: string;
  name: string;
  detail?: string;
  value?: string;
  icon: string;
  off?: Command;
  tone?: 'alert' | 'warning';
  /** HA assumes the value (IR/RF): it is the last command, not a reading. */
  estimated?: boolean;
}
export interface NowSection {
  id: 'alerts' | 'climate' | 'active' | 'energy';
  title: string;
  rows: NowRow[];
}
/** Only placed devices contribute. No invented rooms, duplicate totals, or implied physical confirmation. */
export function nowSections(
  devices: readonly ModelDevice[],
  rooms: readonly { id: string; label: string }[],
  hass: ModelHass | undefined,
  now: number,
  roomId: string | null = null,
  runtime: Record<string, ModelRuntime> = {},
): NowSection[] {
  const sections: NowSection[] = [
    { id: 'alerts', title: 'Alertas', rows: [] },
    { id: 'climate', title: 'Clima', rows: [] },
    { id: 'active', title: 'Activos', rows: [] },
    { id: 'energy', title: 'Energía', rows: [] },
  ];
  const climate = new Map<string, NowRow>();
  const energy = new Set<string>();
  for (const device of devices.filter(item => !roomId || item.roomId === roomId)) {
    const room = personName(rooms.find(item => item.id === device.roomId)?.label);
    const screen = deviceScreen(device, hass, rooms, now);
    const base = { id: device.id, name: screen.name, icon: screen.icon };
    for (const alert of alertsOf(device, hass, now))
      sections[0].rows.push({
        ...base,
        name: alert.message,
        tone: alert.level === 'critical' ? 'alert' : 'warning',
        detail: [screen.name, room].filter(Boolean).join(' · '),
      });
    const temp = screen.values.concat(screen.readings).find(item => item.deviceClass === 'temperature');
    const humidity = screen.values.concat(screen.readings).find(item => item.deviceClass === 'humidity');
    const roomKey = device.roomId ?? device.id;
    if (temp && !climate.has(roomKey))
      climate.set(roomKey, {
        ...base,
        name: room || screen.name,
        value: [temp.value, humidity?.value].filter(Boolean).join(' · '),
        icon: 'mdi:thermometer',
      });
    const entity = entityOf(device, hass);
    const archetype = archetypeOf(device, hass);
    // Read the adapter's runtime source when it exists: sender activity is never substituted for measured state.
    const observed = runtime[device.id];
    const value = observed?.confidence === 'confirmed' ? observed.value : (entity?.state ?? 'unknown');
    if (['actuator', 'equipment'].includes(archetype) && activeStateOf(device, value)) {
      const toggle = entityControls(device.bindings.entityId ?? '', entity).find(
        control => control.kind === 'toggle' && control.id === 'power',
      );
      sections[2].rows.push({
        ...base,
        detail: room,
        value: friendlyState({ ...entity, state: value }, hass),
        ...(observed?.confidence !== 'confirmed' && entity?.attributes?.assumed_state === true
          ? { estimated: true }
          : {}),
        ...(toggle?.kind === 'toggle' ? { off: toggle.off } : {}),
      });
    }
    const meterKey = screen.registryId ?? device.bindings.entityId ?? device.id;
    const power =
      screen.values.concat(screen.readings).find(item => item.deviceClass === 'power') ??
      screen.values.concat(screen.readings).find(item => item.deviceClass === 'energy');
    if (power && !energy.has(meterKey)) {
      energy.add(meterKey);
      sections[3].rows.push({ ...base, detail: room, value: power.value });
    }
  }
  sections[1].rows = [...climate.values()];
  return sections.filter(section => section.rows.length);
}
