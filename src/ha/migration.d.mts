export const CURRENT_SCHEMA_VERSION: 2;
export const LEGACY_V1_ROOM_IDS: readonly string[];
export function humanizeRoomId(id: string): string;
export function zoneIdsInSvgText(content: string): string[];
export function migrateConfiguration<T = unknown>(input: unknown, options?: { roomLabels?: Record<string, string> }): T;
