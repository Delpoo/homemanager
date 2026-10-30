import type { ModelHass, RegistryDevice } from './types.js';

const WORDS: Record<string, Record<string, string>> = {
  es: {
    device: 'Dispositivo',
    reading: 'Lectura',
    space: 'Sin espacio en Home Assistant',
    channel: 'Canal',
    temperature: 'Temperatura',
    humidity: 'Humedad',
    power: 'Potencia',
    energy: 'Energía',
    voltage: 'Tensión',
    current: 'Corriente',
    battery: 'Batería',
    illuminance: 'Iluminación',
    pressure: 'Presión',
    moisture: 'Fuga',
    soil_moisture: 'Humedad del suelo',
    smoke: 'Humo',
    gas: 'Gas',
    motion: 'Movimiento',
    occupancy: 'Presencia',
    door: 'Puerta',
    window: 'Ventana',
    carbon_dioxide: 'Dióxido de carbono',
    light: 'Luz',
    fan: 'Ventilador',
    climate: 'Clima',
    cover: 'Cortina',
    switch: 'Interruptor',
    lock: 'Cerradura',
    vacuum: 'Robot',
    media_player: 'Reproductor',
    sensor: 'Lectura',
    binary_sensor: 'Estado',
    on: 'Encendido',
    off: 'Apagado',
    unknown: 'Sin dato',
    unavailable: 'No disponible',
  },
  en: {
    device: 'Device',
    reading: 'Reading',
    space: 'No space in Home Assistant',
    channel: 'Channel',
    temperature: 'Temperature',
    humidity: 'Humidity',
    power: 'Power',
    energy: 'Energy',
    voltage: 'Voltage',
    current: 'Current',
    battery: 'Battery',
    illuminance: 'Illuminance',
    pressure: 'Pressure',
    moisture: 'Leak',
    soil_moisture: 'Soil moisture',
    smoke: 'Smoke',
    gas: 'Gas',
    motion: 'Motion',
    occupancy: 'Occupancy',
    door: 'Door',
    window: 'Window',
    carbon_dioxide: 'Carbon dioxide',
    light: 'Light',
    fan: 'Fan',
    climate: 'Climate',
    cover: 'Cover',
    switch: 'Switch',
    lock: 'Lock',
    vacuum: 'Robot',
    media_player: 'Player',
    sensor: 'Reading',
    binary_sensor: 'State',
    on: 'On',
    off: 'Off',
    unknown: 'No data',
    unavailable: 'Unavailable',
  },
  de: {
    device: 'Gerät',
    reading: 'Messwert',
    space: 'Kein Bereich in Home Assistant',
    channel: 'Kanal',
    temperature: 'Temperatur',
    humidity: 'Luftfeuchtigkeit',
    power: 'Leistung',
    energy: 'Energie',
    voltage: 'Spannung',
    current: 'Strom',
    battery: 'Batterie',
    sensor: 'Messwert',
    binary_sensor: 'Zustand',
    on: 'Ein',
    off: 'Aus',
    unknown: 'Keine Daten',
    unavailable: 'Nicht verfügbar',
  },
};
export function nameWord(key: string, hass?: ModelHass): string {
  const language = (hass?.locale?.language ?? hass?.language ?? 'es').split('-')[0];
  return WORDS[language]?.[key] ?? WORDS.en[key] ?? WORDS.en.reading;
}
export const foldName = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** An identifier is never a display-name fallback. Registry labels are untrusted. */
export function personName(value: unknown, fallback = ''): string {
  return (
    (typeof value === 'string' ? value : '')
      .normalize('NFC')
      .replace(/\b[a-z][a-z0-9_]*\.[a-z0-9_]+\b/gi, '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || fallback
  );
}
export function deviceName(device: RegistryDevice | undefined, hass?: ModelHass): string {
  return personName(device?.name_by_user) || personName(device?.name) || nameWord('device', hass);
}
export function readingName(entityId: string, hass?: ModelHass): string {
  const entry = hass?.entities?.[entityId],
    entity = hass?.states[entityId];
  const device = entry?.device_id ? hass?.devices?.[entry.device_id] : undefined;
  const deviceClass = String(entity?.attributes?.device_class ?? entityId.split('.')[0]);
  const fallback = nameWord(
    deviceClass === 'moisture' && entityId.startsWith('sensor.') ? 'soil_moisture' : deviceClass,
    hass,
  );
  let label =
    personName(entry?.name) || personName(entity?.attributes?.friendly_name) || personName(entry?.original_name);
  // Both names matter: changing the device name need not immediately rename its entities.
  const prefixes = [device?.name_by_user, device?.name]
    .map(value => personName(value))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (foldName(label) === foldName(prefix)) {
      label = '';
      break;
    }
    if (foldName(label).startsWith(foldName(prefix)) && /^[\s·:–—-]/.test(label.slice(prefix.length))) {
      label = label.slice(prefix.length).replace(/^[\s·:–—-]+/, '');
      break;
    }
  }
  const channel = label.match(/^(?:channel|canal|kanal)\s*(\d+)\s*(?:[·:–—-]\s*)?(.*)$/i);
  if (channel) {
    const suffix = channel[2];
    const isClass =
      !suffix || Object.values(WORDS).some(words => foldName(words[deviceClass] ?? '') === foldName(suffix));
    return `${nameWord('channel', hass)} ${channel[1]} · ${isClass ? fallback : suffix}`;
  }
  return label || fallback;
}
/** Entity's own area wins, then its device area. An unknown area stays unknown. */
export function entityAreaId(entityId: string, hass?: ModelHass): string | null {
  const entry = hass?.entities?.[entityId];
  return entry?.area_id ?? (entry?.device_id ? hass?.devices?.[entry.device_id]?.area_id : null) ?? null;
}
export function areaName(areaId: string | null | undefined, hass?: ModelHass): string {
  return personName(areaId ? hass?.areas?.[areaId]?.name : undefined, nameWord('space', hass));
}
