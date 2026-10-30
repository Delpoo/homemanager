import { t } from '../i18n/index.js';
import { escapeHTML as esc, type Configuration } from '../card/types.js';
import { uiButton, uiIcon, uiStatus } from '../ui/components.js';
import { suggestRoomIcon } from '../shell/room-rail.js';

/** Plan settings as a page (mockup §9): sections on the left, problems on top, spaces as a list. */
export type SettingsSection =
  | 'rooms-section'
  | 'actions-section'
  | 'panels-section'
  | 'pending-section'
  | 'import-section';
export interface SettingsPage {
  section: SettingsSection;
  problems: number;
  pending: number;
  /** Shown above every section, so it cannot be missed. */
  notice: string;
  bodies: Record<SettingsSection, string>;
}

const SECTIONS: { id: SettingsSection; title: () => string; icon: string }[] = [
  { id: 'rooms-section', title: () => t('Plano y espacios'), icon: 'mdi:floor-plan' },
  { id: 'actions-section', title: () => t('Acciones lógicas'), icon: 'mdi:link-variant' },
  { id: 'panels-section', title: () => t('Paneles nativos'), icon: 'mdi:view-list-outline' },
  { id: 'pending-section', title: () => t('Referencias pendientes'), icon: 'mdi:alert-outline' },
  { id: 'import-section', title: () => t('Importar y exportar'), icon: 'mdi:swap-vertical' },
];

export function settingsPage(page: SettingsPage): string {
  const badge = (id: SettingsSection) =>
    id === 'rooms-section' && page.problems
      ? `<span class="settings-badge warn">${page.problems}</span>`
      : id === 'pending-section'
        ? `<span class="settings-badge${page.pending ? ' warn' : ''}">${page.pending}</span>`
        : '';
  const nav = SECTIONS.map(
    section =>
      `<button type="button" data-settings="${section.id}"${section.id === page.section ? ' aria-current="page"' : ''}>${uiIcon(section.icon)}<span>${esc(section.title())}</span>${badge(section.id)}</button>`,
  ).join('');
  const current = SECTIONS.find(section => section.id === page.section)!;
  return `<div class="settings-page"><nav class="settings-nav" aria-label="${esc(t('Secciones de ajustes'))}">${nav}</nav><div class="settings-content">${page.notice}<section class="settings-section" id="${page.section}" aria-labelledby="settings-title"><h3 id="settings-title">${esc(current.title())}</h3>${page.bodies[page.section]}</section></div></div>`;
}

/** A space's place in the plan, for its row: on the plan, drawn here, a kept copy, or nothing. */
export function spaceStatus(room: Configuration['rooms'][number], hasZone: boolean): { text: string; tone: string } {
  if (room.shapeSource === 'app') return { text: t('Forma propia'), tone: 'ok' };
  if (hasZone) return { text: t('En el plano'), tone: 'ok' };
  if (room.shape) return { text: t('Copia guardada'), tone: 'ok' };
  return { text: t('Sin zona'), tone: 'warn' };
}

export function spacesList(configuration: Configuration, zoneIds: ReadonlySet<string>): string {
  const count = (id: string) => configuration.catalog.devices.filter(device => device.roomId === id).length;
  if (!configuration.rooms.length) return `<p class="note">${esc(t('Todavía no hay espacios.'))}</p>`;
  return `<div class="k-list rooms-list" role="list" aria-label="${esc(t('Espacios'))}">${configuration.rooms
    .map(room => {
      const status = spaceStatus(room, zoneIds.has(room.id));
      const devices = count(room.id);
      return `<div class="k-row room-item" role="listitem" data-room-item="${esc(room.id)}"><button type="button" class="room-grip" data-room-grip="${esc(room.id)}" aria-label="${esc(t('Mover {room}: flechas arriba y abajo', { room: room.label }))}">${uiIcon('mdi:drag-vertical')}</button><button type="button" class="room-open" data-command="room-open" data-room="${esc(room.id)}" aria-label="${esc(t('Editar {room}', { room: room.label }))}"><span class="ico${status.tone === 'warn' ? ' grey' : ''}">${uiIcon(room.icon ?? suggestRoomIcon(room.label))}</span><span class="txt"><b>${esc(room.label)}</b><span>${esc(devices ? t('{count} dispositivos', { count: devices }) : t('Sin dispositivos'))}</span></span>${uiStatus(status.text, status.tone)}<span class="chev">${uiIcon('mdi:chevron-right')}</span></button></div>`;
    })
    .join('')}</div>`;
}

export function planCard(content: string, zones: number, rooms: number): string {
  return `<div class="plan-card"><div class="plan-thumb" aria-hidden="true">${content}</div><div class="plan-info"><b>${esc(t('Plano de la casa'))}</b><span class="k-sub">${esc(t('{zones} zonas · {rooms} espacios', { zones, rooms }))}</span><div class="plan-actions">${uiButton(t('Reemplazar plano'), 'settings-import', 'secondary', 'mdi:upload')}</div></div></div>`;
}

export const settingsPageStyles = `
.settings-dialog{width:min(1040px,calc(100vw - 24px));height:min(780px,calc(100dvh - 32px));padding:0;display:flex;flex-direction:column;overflow:hidden}
.settings-dialog[open]{display:flex}
.settings-dialog>.sheet-header{position:static;margin:0;padding:14px 18px;border-bottom:1px solid var(--hm-line);background:var(--hm-surface)}
.settings-page{flex:1;min-height:0;display:grid;grid-template-columns:230px minmax(0,1fr)}
.settings-nav{display:flex;flex-direction:column;gap:4px;padding:14px 10px;border-right:1px solid var(--hm-line);background:var(--hm-surface);overflow:auto}
.settings-nav button{display:flex;align-items:center;gap:10px;justify-content:flex-start;width:100%;min-height:44px;padding:8px 12px;border:0;border-radius:12px;background:transparent;color:var(--hm-muted);font-size:14px;text-align:left}
.settings-nav button ha-icon{--mdc-icon-size:20px;flex:none}.settings-nav button span:first-of-type{flex:1}
.settings-nav button[aria-current=page]{background:color-mix(in srgb,var(--hm-brand) 14%,transparent);color:var(--hm-ink);font-weight:600}
.settings-badge{min-width:22px;height:22px;padding:0 6px;border-radius:11px;display:grid;place-items:center;font-size:11px;font-weight:700;background:var(--hm-surface-2,var(--hm-line));color:var(--hm-muted)}.settings-badge.warn{background:color-mix(in srgb,var(--hm-warn) 18%,transparent);color:var(--hm-warn)}
.settings-content{overflow:auto;padding:18px 22px 24px;display:grid;align-content:start;gap:14px}
.settings-section{display:grid;gap:14px;min-width:0}.settings-section>h3{margin:0;font-size:18px}
.plan-card{display:flex;gap:16px;align-items:center;padding:14px;border:1px solid var(--hm-line);border-radius:16px;background:var(--hm-surface)}
.plan-thumb{flex:none;width:160px;height:110px;border-radius:12px;overflow:hidden;background:var(--hm-bg);display:grid;place-items:center}.plan-thumb svg{width:100%;height:100%}
.plan-info{display:grid;gap:6px;min-width:0}.plan-actions{display:flex;gap:8px;flex-wrap:wrap}
.rooms-list .room-item{padding:0;gap:0;min-height:58px}
.room-grip{flex:none;width:40px;min-height:58px;border:0;border-radius:0;background:transparent;color:var(--hm-muted);cursor:grab;touch-action:none;padding:0}
.room-open{flex:1;min-width:0;display:flex;align-items:center;gap:12px;min-height:58px;padding:8px 14px 8px 0;border:0;border-radius:0;background:transparent;color:var(--hm-ink);text-align:left}
.room-item.dragging{position:relative;z-index:2;box-shadow:var(--hm-shadow);background:var(--hm-surface)}
.rooms-actions{display:flex;gap:8px;flex-wrap:wrap}.rooms-actions button{display:inline-flex;align-items:center;gap:8px}.rooms-actions ha-icon{--mdc-icon-size:18px}
@media(max-width:720px){
.settings-dialog{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;margin:0;border-radius:0}
.settings-page{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}
.settings-nav{flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid var(--hm-line);padding:8px}
.settings-nav button{width:auto;flex:none;white-space:nowrap}
.settings-content{padding:14px 14px 20px}
.plan-thumb{width:110px;height:80px}
}
`;
