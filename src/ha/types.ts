/** Shared types mirror schemas/*.schema.json. No credentials or live values
 * belong in Configuration; callers sanitize inline SVG before persistence/render.
 */
/** Instance-defined space ID (kebab-case). Since V2 there is no fixed vocabulary. */
export type RoomId = string;
export type DeviceKind =
  | 'light'
  | 'fan'
  | 'curtain'
  | 'ac'
  | 'sensor'
  | 'switch'
  | 'robot'
  | 'purifier'
  | 'plant'
  | 'infra'
  | 'energy'
  | 'media'
  | 'lock'
  | 'camera'
  | 'appliance'
  | 'other';
export interface Room {
  id: RoomId;
  label: string;
}
export type Confidence = 'confirmed' | 'estimated' | 'sent' | 'unknown' | 'error';
export interface Position {
  x: number;
  y: number;
}
export interface DeviceState {
  value: string;
  confidence: Confidence;
}
export interface QuickAction {
  id: string;
  label: string;
  actionId: string;
}
export interface Device {
  id: string;
  roomId: RoomId | null;
  kind: DeviceKind;
  position: Position;
  mobility: 'fixed' | 'editable' | 'portable';
  display: { label: string; icon: string };
  bindings: {
    entityId: string | null;
    primaryAction: string | null;
    advancedPopupId: string | null;
    /** Up to 4 actions offered when the icon is held (V2, optional). */
    quickActions?: QuickAction[];
    /** RF remote drawn in the device panel (V2, optional). */
    remoteId?: string | null;
  };
  state: DeviceState;
}
export interface Catalog {
  schemaVersion: 2;
  devices: Device[];
}
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface ActionDefinition {
  domain: 'light' | 'fan' | 'cover' | 'climate' | 'switch' | 'button' | 'script';
  service: string;
  target: { entity_id: string | string[] };
  data?: { [key: string]: JsonValue };
}
export interface NativePanel {
  kind: 'device-controls' | 'rf-fan';
  title: string;
  controls: { id: string; label: string; actionId: string }[];
}
export interface StateSource {
  entityId: string;
  attribute: string | null;
  feedback: 'measured' | 'optimistic' | 'transmitter';
}
export interface Configuration {
  schemaVersion: 2;
  rooms: Room[];
  catalog: Catalog;
  architecture: { format: 'svg'; content: string };
  actions: Record<string, ActionDefinition>;
  panels: Record<string, NativePanel>;
  stateSources: Record<string, StateSource>;
  commandTtlSeconds?: number;
}
export interface RuntimeCommand {
  id: string;
  actionId: string;
  issuedAt: string;
  expiresAt: string;
  baselineLastUpdated: string | null;
  status: 'sent' | 'error';
}
export interface RuntimeDeviceState extends DeviceState {
  observedAt: string | null;
  sourceEntityId: string | null;
  command: RuntimeCommand | null;
}
export interface RuntimeState {
  schemaVersion: 1;
  states: Record<string, RuntimeDeviceState>;
}
export interface HassEntity {
  state: string;
  attributes?: Record<string, unknown>;
  last_updated?: string;
  last_changed?: string;
}
export interface HassConnection {
  addEventListener?(name: string, callback: (...args: unknown[]) => void): void;
  removeEventListener?(name: string, callback: (...args: unknown[]) => void): void;
}
export interface Hass {
  states: Record<string, HassEntity>;
  services?: Record<string, Record<string, unknown>>;
  connected?: boolean;
  connection?: HassConnection;
  user?: { id?: string; is_admin?: boolean; is_owner?: boolean };
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
  callWS?<T = unknown>(message: Record<string, unknown>): Promise<T>;
}
export type HomeAssistantLike = Hass;
export interface ScriptField {
  type: 'string' | 'number' | 'integer' | 'boolean';
  required?: boolean;
  enum?: (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
}
export interface ScriptSignature {
  verified: true;
  fields: Record<string, ScriptField>;
}
export type ScriptSignatures = Record<string, ScriptSignature>;
export interface Availability {
  available: boolean;
  reason?: string;
}
export type ActionResult = { ok: true; status: 'sent' } | { ok: false; reason: string };
export interface AdapterOptions {
  configuration: Configuration;
  verifiedFeedbackEntities?: Iterable<string>;
  scriptSignatures?: ScriptSignatures;
  now?: () => number;
}
