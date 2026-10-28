export type {
  RoomId,
  Room,
  DeviceKind,
  Confidence,
  Position,
  DeviceState,
  Device,
  Catalog,
  JsonValue,
  ActionDefinition,
  NativePanel,
  StateSource,
  Configuration,
  RuntimeCommand,
  RuntimeDeviceState,
  RuntimeState,
  HassEntity,
  HassConnection,
  Hass,
  HomeAssistantLike,
  ScriptField,
  ScriptSignature,
  ScriptSignatures,
  Availability,
  ActionResult,
  AdapterOptions,
} from './types.ts';
export { HomeAssistantAdapter } from './adapter.mjs';
export { getActionAvailability, executeService, discoverScriptSignatures } from './actions.mjs';
export { assertConfiguration, inspectConfiguration, KINDS, MAX_ROOMS, MAX_CONFIGURATION_BYTES } from './validation.mjs';
export {
  migrateConfiguration,
  humanizeRoomId,
  zoneIdsInSvgText,
  LEGACY_V1_ROOM_IDS,
  CURRENT_SCHEMA_VERSION,
} from './migration.mjs';
