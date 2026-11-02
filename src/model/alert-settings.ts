import { alertReading } from './alert-rules.js';
import { usefulEntity } from './device-catalog.js';
import { readingName } from './names.js';
import { finiteNumber, type AlertRuleConfig, type Category, type ModelDevice, type ModelHass } from './types.js';

export interface AlertReadingChoice {
  id: string;
  name: string;
  unit: string;
  deviceClass: string;
}
export interface AlertSetting {
  reading: string;
  enabled: boolean;
  below: string;
  above: string;
  minutes: string;
  level: 'alert' | 'warning';
}
export interface AlertSettingsDraft {
  rules: AlertSetting[];
  highlight?: boolean;
}
const numeric = (value: number | undefined) => (value === undefined ? '' : String(value));
export function alertSettingsDraft(device?: ModelDevice): AlertSettingsDraft {
  return {
    rules: (device?.display.alerts ?? []).map(rule => ({
      reading: rule.reading,
      enabled: true,
      below: numeric(rule.below),
      above: numeric(rule.above),
      minutes: numeric(rule.forMinutes),
      level: rule.level,
    })),
    ...(device?.display.highlight !== undefined ? { highlight: device.display.highlight } : {}),
  };
}

/** Only registry-associated readings, or the explicit primary binding. No name-based guesses. */
export function alertReadingChoices(device: ModelDevice, hass?: ModelHass): AlertReadingChoice[] {
  return Object.keys(hass?.states ?? {})
    .filter(id => {
      const source = alertReading(device, id, hass);
      return !!source && usefulEntity(id, hass) && (id.startsWith('sensor.') || id.startsWith('binary_sensor.'));
    })
    .map(id => {
      const attributes = hass!.states[id].attributes;
      return {
        id,
        name: readingName(id, hass),
        unit: String(attributes?.unit_of_measurement ?? ''),
        deviceClass: String(attributes?.device_class ?? ''),
      };
    });
}

/** No fixed plant thresholds: the user supplies every numeric condition. */
export function plantAlertSuggestions(device: ModelDevice, hass?: ModelHass): AlertSetting[] {
  return [];
}
export function settingApplies(setting: AlertSetting, category: Category): boolean {
  return true;
}

/** Validate editable values without mutating the draft. Disabled suggestions never enter the contract. */
export function alertSettingsDisplay(draft: AlertSettingsDraft): { alerts: AlertRuleConfig[]; highlight?: boolean } {
  const enabled = draft.rules.filter(rule => rule.enabled);
  if (enabled.length > 2000) throw new Error('Se admiten hasta 2000 reglas por seguridad de tamaño.');
  const alerts = enabled.map(setting => {
    const rule: AlertRuleConfig = { reading: setting.reading, level: setting.level };
    for (const [field, raw] of [
      ['below', setting.below],
      ['above', setting.above],
      ['forMinutes', setting.minutes],
    ] as const) {
      if (!raw.trim()) continue;
      const value = finiteNumber(raw);
      if (value === null || (field === 'forMinutes' && value < 0))
        throw new Error('Revisá los límites y la duración de los avisos.');
      rule[field] = value;
    }
    if (!setting.reading.startsWith('binary_sensor.') && rule.below === undefined && rule.above === undefined)
      throw new Error('Elegí al menos un límite para cada aviso de lectura.');
    return rule;
  });
  return { alerts, ...(draft.highlight !== undefined ? { highlight: draft.highlight } : {}) };
}
