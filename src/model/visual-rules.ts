import { observeAlertRules, configuredAlertsOf, type AlertContext } from './alert-rules.js';
import type { ModelDevice, ModelHass } from './types.js';
import type { DeviceAlert } from './alerts.js';

export interface RuleSource {
  reading: string;
  deviceId?: string;
}
export interface VisualRule {
  id: string;
  name: string;
  enabled: boolean;
  sources: RuleSource[];
  symbols: string[];
  below?: number;
  above?: number;
  state?: 'on' | 'off';
  forMinutes?: number;
  level: 'alert' | 'warning' | 'indicator';
  badge?: boolean;
  highlight?: boolean;
  color?: string;
  bar?: boolean;
  now?: boolean;
}
export interface VisualResult {
  rule: VisualRule;
  alert: DeviceAlert;
  value: string;
}
export interface VisualRulesState {
  context: AlertContext;
  results: VisualResult[];
}

/** Explicit sources form an ANY group. Registry IDs, when supplied, must still match. */
export function evaluateVisualRules(
  rules: readonly VisualRule[],
  devices: readonly ModelDevice[],
  hass: ModelHass | undefined,
  now: number,
  previous: AlertContext = {},
): VisualRulesState {
  const context: Record<string, AlertContext[string]> = {},
    results: VisualResult[] = [];
  if (!hass || hass.connection?.connected === false) return { context, results };
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const [index, source] of rule.sources.entries()) {
      const entity = hass.states[source.reading];
      if (
        !entity ||
        ['unknown', 'unavailable'].includes(entity.state) ||
        (source.deviceId && hass.entities?.[source.reading]?.device_id !== source.deviceId)
      )
        continue;
      const binary = source.reading.startsWith('binary_sensor.');
      const virtual: ModelDevice = {
        id: `rule-${rule.id}-${index}`,
        roomId: null,
        kind: 'sensor',
        display: {
          label: rule.name,
          icon: 'mdi:bell-outline',
          alerts: [
            {
              reading: source.reading,
              level: rule.level === 'alert' ? 'alert' : 'warning',
              ...(binary
                ? {}
                : {
                    ...(rule.below !== undefined ? { below: rule.below } : {}),
                    ...(rule.above !== undefined ? { above: rule.above } : {}),
                  }),
              ...(rule.forMinutes !== undefined ? { forMinutes: rule.forMinutes } : {}),
            },
          ],
        },
        bindings: { entityId: source.reading },
      };
      // Numeric bounds cannot be backdated from last_changed. This session observes continuity.
      const reading = {
        ...entity,
        last_changed: undefined,
        ...(binary && rule.state === 'off'
          ? { state: entity.state === 'off' ? 'on' : entity.state === 'on' ? 'off' : entity.state }
          : {}),
      };
      const session = { ...hass, states: { [source.reading]: reading } };
      const observed = observeAlertRules([virtual], session, now, previous);
      Object.assign(context, observed);
      const match = configuredAlertsOf(virtual, session, now, observed)[0];
      if (match && !results.some(result => result.rule.id === rule.id)) {
        const target =
          devices.find(d => rule.symbols.includes(d.id)) ?? devices.find(d => d.bindings.entityId === source.reading);
        results.push({
          rule,
          value: entity.state,
          alert: {
            id: `visual:${rule.id}`,
            deviceId: target?.id ?? '',
            roomId: target?.roomId ?? null,
            entityId: source.reading,
            rule: binary ? 'binary' : 'threshold',
            level: rule.level === 'alert' ? 'critical' : 'warning',
            message: rule.name,
          },
        });
      }
    }
  }
  return { context, results };
}

export function rulesForSymbol(rules: readonly VisualRule[], id: string): VisualRule[] {
  return rules.filter(rule => rule.symbols.includes(id));
}

/** Missing evidence never proves recovery, including an ANY group with a missing member. */
export function visualRuleCleared(rule: VisualRule, hass: ModelHass): boolean {
  if (hass.connection?.connected === false || !rule.enabled) return false;
  return rule.sources.every(source => {
    const entity = hass.states[source.reading];
    if (
      !entity ||
      ['unknown', 'unavailable'].includes(entity.state) ||
      (source.deviceId && hass.entities?.[source.reading]?.device_id !== source.deviceId)
    )
      return false;
    if (source.reading.startsWith('binary_sensor.'))
      return ['on', 'off'].includes(entity.state) && entity.state !== (rule.state ?? 'on');
    const value = Number(entity.state);
    return (
      entity.state.trim() !== '' &&
      Number.isFinite(value) &&
      !(rule.below !== undefined && value < rule.below) &&
      !(rule.above !== undefined && value > rule.above)
    );
  });
}
