import type { ModelDevice } from './types.js';
interface Configuration {
  nowPanels?: NowPanels;
  catalog: { devices: readonly ModelDevice[] };
  rooms: readonly { id: string; label: string; icon?: string }[];
}
import type { ModelHass } from './types.js';
import { personName } from './names.js';
import type { NowSection, NowRow } from './now.js';
export type NowBlockType = 'alerts' | 'climate' | 'reading' | 'readings' | 'active' | 'energy' | 'control' | 'shortcut';
export interface NowBlock {
  id: string;
  type: NowBlockType;
  title?: string;
  devices?: string[];
  readings?: string[];
  deviceId?: string;
  controlId?: string;
  roomId?: string;
}
export interface NowPanels {
  home?: NowBlock[];
  wall?: NowBlock[];
}
export interface CustomNowSection {
  id: string;
  title: string;
  rows: NowRow[];
  block: NowBlock;
  missing: boolean;
}
export const BLOCK_NAMES: Record<NowBlockType, string> = {
  alerts: 'Alertas',
  climate: 'Clima',
  reading: 'Una lectura',
  readings: 'Grupo de lecturas',
  active: 'Activos',
  energy: 'Energía',
  control: 'Un control',
  shortcut: 'Acceso directo',
};
/** What Now shows before anyone customizes it, as blocks: customizing starts from here (#62). */
export function automaticBlocks(): NowBlock[] {
  return (['alerts', 'climate', 'active', 'energy'] as const).map(type => ({ id: `auto-${type}`, type }));
}
export function panelBlocks(config: Configuration, wall = false): NowBlock[] | undefined {
  return wall ? (config.nowPanels?.wall ?? config.nowPanels?.home) : config.nowPanels?.home;
}
export function configuredNow(
  config: Configuration,
  hass: ModelHass | undefined,
  sections: NowSection[],
  wall = false,
): CustomNowSection[] | undefined {
  const blocks = panelBlocks(config, wall);
  if (!blocks) return undefined;
  return blocks.map(block => {
    let rows: NowRow[] = [];
    let missing = false;
    if (['alerts', 'climate', 'active', 'energy'].includes(block.type)) {
      rows = (sections.find(s => s.id === block.type)?.rows ?? []).filter(
        row => !block.devices || block.devices.includes(row.id),
      );
      missing = !!block.devices?.some(id => !config.catalog.devices.some(d => d.id === id));
    }
    if (block.type === 'reading' || block.type === 'readings')
      rows = (block.readings ?? []).map(id => {
        const entity = hass?.states[id];
        const device = config.catalog.devices.find(
          d => d.bindings.entityId === id || d.bindings.readings?.includes(id),
        );
        if (!entity) missing = true;
        return {
          id: device?.id ?? id,
          name: personName(entity?.attributes?.friendly_name) || id.split('.')[1]?.replaceAll('_', ' ') || 'Lectura',
          icon: String(entity?.attributes?.icon ?? 'mdi:gauge'),
          value: entity
            ? [entity.state, entity.attributes?.unit_of_measurement].filter(Boolean).join(' ')
            : 'No disponible',
          estimated: entity?.attributes?.assumed_state === true,
        };
      });
    if (block.type === 'shortcut') {
      const device = config.catalog.devices.find(d => d.id === block.deviceId);
      const room = config.rooms.find(r => r.id === block.roomId);
      missing = !device && !room;
      rows = [
        {
          id: device?.id ?? '',
          name: device?.display.label ?? room?.label ?? 'Referencia no disponible',
          icon: device?.display.icon ?? room?.icon ?? 'mdi:open-in-new',
        },
      ];
    }
    if (block.type === 'control') missing = !config.catalog.devices.some(d => d.id === block.deviceId);
    return { id: block.id, title: block.title?.trim() || BLOCK_NAMES[block.type], rows, block, missing };
  });
}
