/** Structural inputs keep the model independent of HA, DOM and rendering layers. */
export type Archetype = 'actuator' | 'equipment' | 'sensor' | 'meter' | 'remote' | 'infrastructure';
export type DisplayShow = 'icon' | 'value' | 'both';
export type Category = 'switch' | 'equipment' | 'remote' | 'meter' | 'plant' | 'alert' | 'presence' | 'infrastructure';
export type ModelConfidence = 'confirmed' | 'estimated' | 'sent' | 'unknown' | 'error';
/** CP4: configured conditions; observations and timers never belong in the plan. */
export interface AlertRuleConfig {
  enabled?: boolean;
  reading: string;
  below?: number;
  above?: number;
  forMinutes?: number;
  level: 'alert' | 'warning';
}
export interface ModelEntity {
  state: string;
  attributes?: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}
export interface ModelHass {
  states: Record<string, ModelEntity>;
  connection?: { connected?: boolean };
  locale?: { language?: string };
  language?: string;
  entities?: Record<string, RegistryEntity>;
  devices?: Record<string, RegistryDevice>;
  areas?: Record<string, { name?: string }>;
  services?: Record<string, Record<string, { fields?: unknown }>>;
  formatEntityState?(entity: ModelEntity): string;
}
export interface RegistryEntity {
  device_id?: string | null;
  area_id?: string | null;
  name?: string | null;
  original_name?: string | null;
  has_entity_name?: boolean;
  entity_category?: string | null;
  /** Decimals chosen in Home Assistant for a numeric sensor. */
  display_precision?: number | null;
  hidden?: boolean;
  hidden_by?: string | null;
  disabled?: boolean;
  disabled_by?: string | null;
  platform?: string;
}
export interface RegistryDevice {
  name_by_user?: string | null;
  name?: string | null;
  area_id?: string | null;
  manufacturer?: string | null;
  model?: string | null;
}
export interface ModelDevice {
  id: string;
  roomId: string | null;
  kind: string;
  display: {
    label: string;
    icon: string;
    size?: 's' | 'm' | 'l';
    archetype?: Archetype;
    show?: DisplayShow;
    category?: Category;
    modules?: import('./modules.js').ModuleId[];
    layer?: SymbolLayer;
    pinned?: string[];
    alerts?: AlertRuleConfig[];
    highlight?: boolean;
    color?: string;
    disabledBaseRules?: ('safety' | 'battery' | 'unavailable')[];
    /** Plan 0.12 (#92): readings shown on the symbol, in order, and how each looks. */
    values?: import('./value-style.js').ValueStyle[];
    valuePlace?: 'inside' | 'beside' | 'below';
    /** Plan 0.12 (#93, #94): free size, size in the per-space view, background opacity (%) and shape. */
    scale?: number;
    roomScale?: number;
    opacity?: number;
    shape?: 'circle' | 'pill' | 'dot' | 'icon';
    /** #95: needs no device link (a drawing, a shortcut). */
    standalone?: true;
  };
  bindings: {
    entityId: string | null;
    deviceId?: string;
    readings?: string[];
    primaryAction?: string | null;
    advancedPopupId?: string | null;
    remoteId?: string | null;
    tap?: import('./gestures.js').GestureBinding;
    hold?: import('./gestures.js').GestureBinding;
    controls?: { id: string; type: string }[];
  };
  state?: { value: string; confidence: ModelConfidence };
}
export interface ModelRuntime {
  value: string;
  confidence: ModelConfidence;
  observedAt?: string | null;
  sourceEntityId?: string | null;
}
export type SymbolLayer = 'controls' | 'sensors' | 'energy' | 'infrastructure';

export function entityOf(device: ModelDevice, hass?: ModelHass): ModelEntity | undefined {
  return device.bindings.entityId ? hass?.states[device.bindings.entityId] : undefined;
}

export function finiteNumber(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
