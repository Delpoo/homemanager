import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';

export interface RoomRailItem {
  id: string;
  label: string;
  icon?: string;
  alerts?: number;
  alertLevel?: 'critical' | 'warning';
  active?: boolean;
}
/** Suggestions are presentation hints; a room's ID and meaning remain user data. */
export function suggestRoomIcon(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const suggestions: [RegExp, string][] = [
    [/living|salon|sala|estar/, 'sofa-outline'],
    [/cocina|kitchen/, 'pot-mix-outline'],
    [/dormitorio|habitacion|bedroom/, 'bed-outline'],
    [/bano|bath|ducha|aseo/, 'shower'],
    [/oficina|office|estudio|desk/, 'desk'],
    [/balcon|balcony|jardin|garden|patio|terraza/, 'flower-outline'],
    [/comedor|dining/, 'silverware-fork-knife'],
    [/garage|garaje/, 'garage-variant'],
    [/entrada|hall/, 'door'],
  ];
  return `mdi:${suggestions.find(([pattern]) => pattern.test(normalized))?.[1] ?? 'floor-plan'}`;
}
function content(rooms: readonly RoomRailItem[], selected: string | null, adding = false): string {
  return `<button type="button" class="all" data-command="all" aria-label="${e(t('Encuadrar todo'))}" title="${e(t('Encuadrar todo'))}" aria-pressed="${selected === null}"><ha-icon icon="mdi:home-outline" aria-hidden="true"></ha-icon></button>${rooms.map(room => `<button type="button" class="room" data-room="${e(room.id)}" aria-label="${e(t('Encuadrar {label}', { label: room.label }))}" title="${e(room.label)}" aria-pressed="${selected === room.id}"><ha-icon icon="${e(room.icon ?? suggestRoomIcon(room.label))}" aria-hidden="true"></ha-icon>${room.alerts ? `<span class="room-alerts" data-level="${room.alertLevel ?? 'critical'}" aria-hidden="true">${room.alerts}</span><span class="sr">${e(t('{count} alertas', { count: room.alerts }))}</span>` : room.active ? `<span class="room-active" aria-hidden="true"></span>` : ''}</button>`).join('')}${adding ? `<button type="button" class="add" data-command="room-new" aria-label="${e(t('Nuevo espacio'))}" title="${e(t('Nuevo espacio'))}"><ha-icon icon="mdi:plus" aria-hidden="true"></ha-icon></button>` : ''}`;
}
export function renderRoomRail(rooms: readonly RoomRailItem[], selected: string | null = null): string {
  return `<nav class="rooms" aria-label="${e(t('Espacios'))}">${content(rooms, selected)}</nav>`;
}
export function updateRoomRail(
  root: ParentNode,
  rooms: readonly RoomRailItem[],
  selected: string | null = null,
  adding = false,
): void {
  const nav = root.querySelector<HTMLElement>('.rooms');
  if (!nav) return;
  const html = content(rooms, selected, adding);
  if (nav.dataset.content === html) return;
  const focused =
    nav.getRootNode() instanceof ShadowRoot
      ? ((nav.getRootNode() as ShadowRoot).activeElement as HTMLElement | null)
      : (document.activeElement as HTMLElement | null);
  const roomId = focused && nav.contains(focused) ? focused.dataset.room : undefined;
  const all = focused?.dataset.command === 'all';
  nav.innerHTML = html;
  nav.dataset.content = html;
  if (roomId) nav.querySelector<HTMLElement>(`[data-room="${CSS.escape(roomId)}"]`)?.focus();
  else if (all) nav.querySelector<HTMLElement>('.all')?.focus();
}
export const roomRailStyles = `
.rooms{grid-area:rooms;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 0;background:var(--hm-surface);border-right:1px solid var(--hm-line);overflow:auto;min-width:0;scrollbar-width:none}.rooms::-webkit-scrollbar{display:none}
.rooms button{position:relative;flex:none;display:grid;place-items:center;width:48px;height:48px;min-height:48px;padding:0;border:0;border-radius:14px;background:transparent;color:var(--hm-muted)}.rooms button ha-icon{--mdc-icon-size:22px}.rooms button[aria-pressed=true]{background:color-mix(in srgb,var(--hm-brand) 14%,transparent);color:var(--hm-brand)}
.rooms .add{border:1px dashed var(--hm-line)}
.room-alerts{position:absolute;top:2px;right:2px;min-width:16px;height:16px;border-radius:8px;padding:0 4px;background:var(--hm-alert);color:var(--hm-on-accent);font-size:10px;font-weight:700;line-height:16px}.room-active{position:absolute;top:7px;right:7px;width:7px;height:7px;border-radius:50%;background:var(--hm-active)}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
@media(max-width:1099px){.rooms{flex-direction:row;justify-content:flex-start;height:64px;gap:6px;padding:8px 12px;border-right:0;border-top:1px solid var(--hm-line)}.rooms button{width:44px;height:44px;min-height:44px}}
`;
