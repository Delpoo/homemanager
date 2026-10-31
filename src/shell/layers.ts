import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { layerChoice, setLayerChoice } from './layer-choice.js';

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
  const choice = layerChoice();
  return `<nav class="layers" aria-label="${e(t('Capas'))}" data-collapsed="${choice.collapsed}"${choice.hidden ? ' hidden' : ''}><div class="layer-items">${items.map(item => `<button type="button" data-command="layer-${e(item.id)}" aria-label="${e(item.label)}" title="${e(item.label)}" aria-pressed="${enabled.has(item.id)}"><ha-icon icon="${e(item.icon)}" aria-hidden="true"></ha-icon></button>`).join('')}</div><button type="button" data-command="layers-collapse" aria-expanded="${!choice.collapsed}" aria-label="${e(t(choice.collapsed ? 'Mostrar capas' : 'Minimizar capas'))}"><ha-icon icon="mdi:layers-outline" aria-hidden="true"></ha-icon></button></nav>`;
}
/** One preference for the view, never a change to the home's saved plan. */
export function syncLayers(root: ParentNode): void {
  const nav = root.querySelector<HTMLElement>('.layers');
  if (!nav) return;
  const choice = layerChoice();
  nav.hidden = choice.hidden;
  nav.dataset.collapsed = String(choice.collapsed);
  const button = nav.querySelector<HTMLElement>('[data-command=layers-collapse]')!;
  button.setAttribute('aria-expanded', String(!choice.collapsed));
  button.setAttribute('aria-label', t(choice.collapsed ? 'Mostrar capas' : 'Minimizar capas'));
}
export function toggleLayers(): void {
  setLayerChoice({ collapsed: !layerChoice().collapsed });
}
/** Touch hold exposes the same name as hover; it must not toggle a layer. */
export function bindLayerNames(root: ShadowRoot): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let held: HTMLElement | undefined;
  let shown: HTMLElement | undefined;
  const clear = () => {
    clearTimeout(timer);
    shown?.removeAttribute('data-tooltip');
    shown = undefined;
  };
  const down = (event: Event) => {
    clear();
    held = undefined;
    const button = (event.target as Element).closest<HTMLElement>('.layers button');
    if (button)
      timer = setTimeout(() => {
        held = shown = button;
        button.dataset.tooltip = 'true';
      }, 500);
  };
  const up = () => {
    clearTimeout(timer);
  };
  const cancel = () => {
    clear();
    held = undefined;
  };
  const click = (event: Event) => {
    if (held) {
      event.preventDefault();
      event.stopImmediatePropagation();
      held = undefined;
    }
  };
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('click', click, true);
  return () => {
    clear();
    root.removeEventListener('pointerdown', down);
    root.removeEventListener('pointerup', up);
    root.removeEventListener('pointercancel', cancel);
    root.removeEventListener('click', click, true);
  };
}
export function iconButtonMarkup(command: string, label: string, icon: string): string {
  return `<button type="button" class="icon" data-command="${e(command)}" aria-label="${e(label)}" title="${e(label)}"><ha-icon icon="${e(icon)}" aria-hidden="true"></ha-icon></button>`;
}
export const layerStyles = `
.layers{position:absolute;top:auto;right:auto;bottom:14px;left:16px;display:flex;flex-direction:row;gap:4px;padding:4px;background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:12px;z-index:3;max-width:calc(100% - 32px)}.layer-items{display:flex;gap:4px}.layers[data-collapsed=true] .layer-items{display:none}.layers button{position:relative;display:grid;place-items:center;width:44px;height:44px;min-height:44px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--hm-muted)}.layers button ha-icon{--mdc-icon-size:20px}.layers button[aria-pressed=true]{background:color-mix(in srgb,var(--hm-brand) 14%,transparent);color:var(--hm-ink)}.layers button:after{content:attr(aria-label);position:absolute;bottom:calc(100% + 10px);left:0;padding:7px 10px;white-space:nowrap;border-radius:8px;background:var(--hm-ink);color:var(--hm-surface);font-size:12px;pointer-events:none;display:none}.layers button:hover:after,.layers button:focus-visible:after,.layers button[data-tooltip=true]:after{display:block}
.zoom{position:absolute;bottom:auto;gap:0;right:14px;top:14px;display:flex;flex-direction:column;background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:12px;overflow:hidden;z-index:3}.zoom .icon{display:grid;place-items:center;width:34px;min-width:34px;height:32px;min-height:32px;padding:0;border:0;background:transparent;border-radius:0;color:var(--hm-muted)}.zoom .icon+button{border-top:1px solid var(--hm-line)}.zoom ha-icon{--mdc-icon-size:18px}
@media(max-width:650px){.layers{left:8px;bottom:8px;max-width:calc(100% - 16px);gap:2px;padding:3px}.layer-items{gap:2px}.zoom{top:8px;right:8px}}
`;
