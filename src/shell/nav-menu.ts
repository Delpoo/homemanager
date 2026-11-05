import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { uiIcon } from '../ui/components.js';
import { navMenuMarkup } from '../editor/settings-page.js';

/** ☰ (0.13): a drawer on the left with every section by name. Choosing one opens it in
 * the panel on the right, so the plan stays in view. */
export function toggleNavMenu(root: ShadowRoot, admin: boolean, title: string): void {
  const open = root.querySelector('.nav-drawer');
  if (open) {
    closeNavMenu(root);
    return;
  }
  const shell = root.querySelector('.shell');
  if (!shell) return;
  shell.insertAdjacentHTML(
    'beforeend',
    `<div class="nav-scrim" data-nav-close></div><nav class="nav-drawer" aria-label="${e(t('Menú'))}"><div class="nav-head"><span class="nav-home">${uiIcon('mdi:home-outline')}</span><b>${e(title)}</b><button type="button" class="nav-close" data-nav-close aria-label="${e(t('Cerrar'))}" title="${e(t('Cerrar'))}">${uiIcon('mdi:close')}</button></div>${navMenuMarkup(admin)}</nav>`,
  );
  root.querySelector<HTMLElement>('.nav-drawer .nav-item')?.focus();
  root.querySelector('[data-command=nav-menu]')?.setAttribute('aria-expanded', 'true');
}
export function closeNavMenu(root: ShadowRoot): void {
  root.querySelectorAll('.nav-drawer, .nav-scrim').forEach(node => node.remove());
  const button = root.querySelector<HTMLElement>('[data-command=nav-menu]');
  button?.setAttribute('aria-expanded', 'false');
}
export const navMenuStyles = `
.nav-scrim{position:absolute;inset:0;z-index:40;background:rgba(0,0,0,.28);animation:hm-fade .2s ease}
.nav-drawer{position:absolute;left:0;top:0;bottom:0;z-index:41;width:min(290px,86%);display:flex;flex-direction:column;overflow:auto;padding-bottom:12px;background:var(--hm-surface);box-shadow:8px 0 30px rgba(0,0,0,.2);animation:hm-slide-in .22s ease;scrollbar-width:thin}
.nav-head{display:flex;align-items:center;gap:10px;min-height:56px;padding:8px 8px 8px 16px;border-bottom:1px solid var(--hm-line);color:var(--hm-brand)}
.nav-head b{flex:1;min-width:0;color:var(--hm-ink);font-size:15px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav-close{display:grid;place-items:center;width:44px;height:44px;min-height:44px;padding:0;border:0;border-radius:12px;background:transparent;color:var(--hm-ink)}
.nav-group{display:grid;padding:6px 0}
.nav-heading{padding:8px 18px 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--hm-muted)}
.nav-item{display:flex;align-items:center;gap:14px;min-height:42px;padding:0 18px;border:0;border-radius:0;background:transparent;color:var(--hm-ink);font-size:14px;text-align:left}
.nav-item:hover,.nav-item:focus-visible{background:var(--hm-surface-2)}.nav-item ha-icon{--mdc-icon-size:20px;color:var(--hm-muted)}
.rooms .nav-menu{color:var(--hm-ink)}.rail-sep{flex:none;width:28px;height:1px;background:var(--hm-line)}
@media(max-width:1099px){.rail-sep{width:1px;height:28px}}
@keyframes hm-slide-in{from{transform:translateX(-100%)}}@keyframes hm-fade{from{opacity:0}}
@media(prefers-reduced-motion:reduce){.nav-drawer,.nav-scrim{animation:none}}
`;
