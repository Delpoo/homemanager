import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { logo } from '../ui/logo.js';

export interface AppShellContext {
  homes: { home_id: string; title?: string }[];
  selected: string | null;
  narrow?: boolean;
}
export interface TopBarOptions {
  title: string;
  admin: boolean;
  app?: AppShellContext;
  activityText?: string;
  activityTone?: 'neutral' | 'ok' | 'alert' | 'warning';
  alertCount?: number;
  alertLevel?: 'critical' | 'warning';
  /** A page opened from Settings (RF controls, a new home) returns with ← (#70). */
  back?: string;
}
const glyph = (name: string) => `<ha-icon icon="mdi:${name}" aria-hidden="true"></ha-icon>`;
const tool = (command: string, label: string, icon: string, extra = '') =>
  `<button type="button" class="hm-tool" data-command="${command}" aria-label="${e(label)}" title="${e(label)}"${extra}>${glyph(icon)}</button>`;
/** Three one-tap tools replace the old ⋮ menu (#70): edit, full screen and settings.
 * Everything else the menu held lives in the Settings page. */
function tools(options: TopBarOptions): string {
  const { admin } = options;
  return `<div class="hm-tools">${admin ? tool('edit', t('Editar plano'), 'pencil-outline', ' aria-pressed="false"') : ''}${tool('fullscreen', t('Pantalla completa'), 'fullscreen')}${tool('configuration', t('Configuración'), 'cog-outline')}</div>`;
}
const menuKey = (options: TopBarOptions) => JSON.stringify({ admin: options.admin, narrow: !!options.app?.narrow });
/** On a narrow Home Assistant sidebar, its own menu button comes first. */
const haMenu = (options: TopBarOptions) =>
  options.app?.narrow
    ? `<button type="button" class="hm-tool ha-menu" data-app-command="ha-menu" aria-label="${e(t('Menú de Home Assistant'))}" title="${e(t('Menú de Home Assistant'))}">${glyph('menu')}</button>`
    : '';
export function renderTopBar(options: TopBarOptions): string {
  const count = options.alertCount ?? 0;
  const back = options.back
    ? `<button type="button" class="hm-tool hm-back" data-app-command="${e(options.back)}" aria-label="${e(t('Volver'))}" title="${e(t('Volver'))}">${glyph('arrow-left')}</button>`
    : '';
  return `<header class="header" data-menu-key="${e(menuKey(options))}">${haMenu(options)}${back}<span class="logo">${logo}</span><h1>${e(options.title)}</h1><button type="button" class="activity" data-command="activity" data-tone="${e(options.activityTone ?? 'neutral')}" aria-label="${e(t('Historial de actividad'))}"><span>${e(options.activityText ?? t('Sin actividad reciente'))}</span></button><button type="button" class="alert-pill" data-command="alerts" data-active="${count > 0}"${count ? '' : ' hidden'} aria-label="${e(t('Alertas'))}" title="${e(t('Alertas'))}">${glyph('alert-outline')}<span>${count}</span></button><time class="clock">${clockText()}</time>${tools(options)}</header>`;
}
function clockText(): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date());
}
/** Patch live values without replacing an open menu or disturbing its focus. */
export function updateTopBar(root: ParentNode, options: TopBarOptions): void {
  const header = root.querySelector<HTMLElement>('.header');
  if (!header) return;
  const title = header.querySelector('h1');
  if (title) title.textContent = options.title;
  const activity = header.querySelector<HTMLElement>('.activity');
  if (activity) {
    activity.dataset.tone = options.activityTone ?? 'neutral';
    activity.querySelector('span')!.textContent = options.activityText ?? t('Sin actividad reciente');
  }
  const pill = header.querySelector<HTMLElement>('.alert-pill');
  if (pill) {
    pill.dataset.level = options.alertLevel ?? 'critical';
    // Hidden with nothing to say (vision §3, #76): the activity bar already says all is well.
    pill.hidden = (options.alertCount ?? 0) === 0;
    pill.dataset.active = String((options.alertCount ?? 0) > 0);
    pill.querySelector('span')!.textContent = String(options.alertCount ?? 0);
  }
  const clock = header.querySelector('.clock');
  if (clock) clock.textContent = clockText();
  const key = menuKey(options);
  if (header.dataset.menuKey !== key) {
    const existing = header.querySelector('.hm-tools');
    if (existing) existing.outerHTML = tools(options);
    header.querySelector('.ha-menu')?.remove();
    if (options.app?.narrow) header.insertAdjacentHTML('afterbegin', haMenu(options));
    header.dataset.menuKey = key;
  }
}
/** Delegation survives header updates. The owner handles ordinary card commands. */
export function bindTopBar(root: ShadowRoot | HTMLElement): () => void {
  const emit = (command: string, homeId?: string) =>
    root.dispatchEvent(
      new CustomEvent('homemanager-shell-command', {
        detail: { command, ...(homeId ? { homeId } : {}) },
        bubbles: true,
        composed: true,
      }),
    );
  const click = (event: Event) => {
    const target = event.target as Element;
    const app = target.closest<HTMLElement>('[data-app-command]');
    if (app) emit(app.dataset.appCommand!, app.dataset.homeId);
  };
  root.addEventListener('click', click);
  const timer = setInterval(() => {
    const clock = root.querySelector('.clock');
    if (clock) clock.textContent = clockText();
  }, 30000);
  return () => {
    clearInterval(timer);
    root.removeEventListener('click', click);
  };
}

export const topBarStyles = `
.header{grid-area:header;display:flex;align-items:center;gap:14px;padding:0 14px;height:56px;min-width:0;background:var(--hm-surface);border-bottom:1px solid var(--hm-line);position:relative;z-index:10}
.header h1{font-size:14px;line-height:1.3;font-weight:500;margin:0;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.header .logo{display:flex;align-items:center;flex:none;color:var(--hm-brand)}.header .hm-logo{width:24px;height:24px}
.header .activity{height:34px;min-height:34px;border:0;border-radius:17px;padding:0 12px;flex:1;min-width:0;display:flex;align-items:center;text-align:left;color:var(--hm-muted);background:color-mix(in srgb,var(--hm-ink) 4%,transparent);font-size:12px;overflow:hidden}
.activity span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.activity[data-tone=ok]{color:var(--hm-ok)}.activity[data-tone=alert]{color:var(--hm-alert)}.activity[data-tone=warning]{color:var(--hm-warn)}
.header .alert-pill{display:flex;align-items:center;gap:6px;height:30px;min-height:30px;border:0;border-radius:15px;padding:0 10px;background:var(--hm-surface-2);color:var(--hm-muted);font-size:12px;font-weight:600}.header .alert-pill[data-active=true]{background:var(--hm-alert);color:var(--hm-on-accent)}.alert-pill ha-icon{--mdc-icon-size:18px}.clock{font-size:12px;color:var(--hm-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.hm-tools{flex:none;display:flex;align-items:center;gap:4px}
.hm-tool{display:grid;place-items:center;flex:none;width:40px;height:40px;min-height:40px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--hm-muted);cursor:pointer}.hm-tool:hover{background:var(--hm-surface-2);color:var(--hm-ink)}.hm-tool ha-icon{--mdc-icon-size:22px}
.hm-tool[aria-pressed=true]{background:var(--hm-edit,var(--hm-warn));color:var(--hm-on-accent)}
@media(max-width:650px){.header{height:48px;gap:6px;padding:0 8px}.header h1,.header .clock{display:none}.header .hm-logo{width:22px;height:22px}.header .activity{height:30px;min-height:30px;padding:0 10px}.header .alert-pill{padding:0 8px}.hm-tool{width:36px;height:36px;min-height:36px}.hm-tools{gap:0}}
`;
