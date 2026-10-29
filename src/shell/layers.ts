import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';

export interface LayerItem {
  id: string;
  label: string;
  icon: string;
}
export const layerItems = (): LayerItem[] => [
  { id: 'controls', label: t('Controles'), icon: 'mdi:power' },
  { id: 'sensors', label: t('Sensores'), icon: 'mdi:eye-outline' },
  { id: 'energy', label: t('Energía'), icon: 'mdi:lightning-bolt-outline' },
  { id: 'infrastructure', label: t('Infraestructura'), icon: 'mdi:hub-outline' },
];
export function renderLayers(items: readonly LayerItem[], enabled: ReadonlySet<string>): string {
  return `<nav class="layers" aria-label="${e(t('Capas'))}">${items.map(item => `<button type="button" data-command="layer-${e(item.id)}" aria-pressed="${enabled.has(item.id)}"><ha-icon icon="${e(item.icon)}" aria-hidden="true"></ha-icon><span>${e(item.label)}</span></button>`).join('')}</nav>`;
}
export function iconButtonMarkup(command: string, label: string, icon: string): string {
  return `<button type="button" class="icon" data-command="${e(command)}" aria-label="${e(label)}" title="${e(label)}"><ha-icon icon="${e(icon)}" aria-hidden="true"></ha-icon></button>`;
}
export const layerStyles = `
.layers{position:absolute;top:auto;right:auto;bottom:14px;left:16px;display:flex;flex-direction:row;gap:4px;padding:4px;background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:12px;z-index:3;max-width:calc(100% - 32px);overflow:auto;scrollbar-width:none}.layers button{display:flex;align-items:center;gap:6px;white-space:nowrap;min-height:32px;padding:5px 10px;border:0;border-radius:9px;background:transparent;color:var(--hm-muted);font-size:12px}.layers button ha-icon{--mdc-icon-size:16px}.layers button[aria-pressed=true]{background:color-mix(in srgb,var(--hm-brand) 14%,transparent);color:var(--hm-ink)}
.zoom{position:absolute;bottom:auto;gap:0;right:14px;top:14px;display:flex;flex-direction:column;background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:12px;overflow:hidden;z-index:3}.zoom .icon{display:grid;place-items:center;width:34px;min-width:34px;height:32px;min-height:32px;padding:0;border:0;background:transparent;border-radius:0;color:var(--hm-muted)}.zoom .icon+button{border-top:1px solid var(--hm-line)}.zoom ha-icon{--mdc-icon-size:18px}
@media(max-width:650px){.layers{left:8px;bottom:8px;max-width:calc(100% - 16px);gap:2px;padding:3px}.layers button{font-size:11px;padding:5px 7px;gap:4px}.layers button ha-icon{--mdc-icon-size:14px}.zoom{top:8px;right:8px}}
`;
