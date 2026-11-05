import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { logo } from '../ui/logo.js';
import { setThemeChoice } from '../ui/theme-choice.js';

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
  return `<div class="hm-tools">${tool('theme', t('Claro u oscuro'), 'theme-light-dark')}${admin ? tool('edit', t('Editar plano'), 'pencil-outline', ' aria-pressed="false"') : ''}${tool('fullscreen', t('Pantalla completa'), 'fullscreen')}${tool('configuration', t('Configuración'), 'cog-outline')}</div>`;
}
const menuKey = (options: TopBarOptions) =>
  JSON.stringify({
    admin: options.admin,
    narrow: !!options.app?.narrow,
    homes: options.app?.homes,
    selected: options.app?.selected,
  });
/** 0.13: the home is chosen at the top left, above everything that belongs to it. */
function titleBlock(options: TopBarOptions): string {
  const app = options.app;
  if (!app) return `<h1><span class="hm-title">${e(options.title)}</span></h1>`;
  const items = app.homes
    .map(
      home =>
        `<button type="button" role="menuitemradio" aria-checked="${home.home_id === app.selected}" data-app-command="home" data-home-id="${e(home.home_id)}">${glyph('home-outline')}<span>${e(home.title || home.home_id)}</span>${home.home_id === app.selected ? glyph('check') : ''}</button>`,
    )
    .join('');
  const create = options.admin
    ? `<hr><button type="button" role="menuitem" data-app-command="new">${glyph('plus')}<span>${e(t('Nueva casa'))}</span></button>`
    : '';
  return `<h1 class="home-title"><button type="button" class="home-pick" data-home-toggle aria-haspopup="menu" aria-expanded="false" title="${e(t('Cambiar o crear casa'))}"><span class="hm-title">${e(options.title)}</span>${glyph('chevron-down')}</button></h1><div class="home-menu" role="menu" aria-label="${e(t('Casas'))}" hidden>${items}${create}</div>`;
}
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
  return `<header class="header" data-menu-key="${e(menuKey(options))}">${haMenu(options)}${back}<span class="logo">${logo}</span>${titleBlock(options)}<button type="button" class="activity" data-command="activity" data-tone="${e(options.activityTone ?? 'neutral')}" aria-label="${e(t('Historial de actividad'))}"><span>${e(options.activityText ?? t('Sin actividad reciente'))}</span></button><button type="button" class="alert-pill" data-command="alerts" data-active="${count > 0}"${count ? '' : ' hidden'} aria-label="${e(t('Alertas'))}" title="${e(t('Alertas'))}">${glyph('alert-outline')}<span>${count}</span></button><time class="clock">${clockText()}</time>${tools(options)}</header>`;
}
function clockText(): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date());
}
/** Patch live values without replacing an open menu or disturbing its focus. */
export function updateTopBar(root: ParentNode, options: TopBarOptions): void {
  const header = root.querySelector<HTMLElement>('.header');
  if (!header) return;
  const title = header.querySelector('.hm-title');
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
    header.querySelector('.home-menu')?.remove();
    const block = header.querySelector('h1');
    if (block) block.outerHTML = titleBlock(options);
    syncThemeButton(header);
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
  const menu = () => root.querySelector<HTMLElement>('.home-menu');
  const closeMenu = () => {
    const m = menu();
    if (m && !m.hidden) {
      m.hidden = true;
      root.querySelector('[data-home-toggle]')?.setAttribute('aria-expanded', 'false');
    }
  };
  const click = (event: Event) => {
    const target = event.target as Element;
    if (target.closest('[data-home-toggle]')) {
      const m = menu();
      if (m) {
        m.hidden = !m.hidden;
        root.querySelector('[data-home-toggle]')?.setAttribute('aria-expanded', String(!m.hidden));
        if (!m.hidden) m.querySelector<HTMLElement>('button')?.focus();
      }
      return;
    }
    if (target.closest('.header [data-command=theme]')) {
      setThemeChoice(isDark(root) ? 'light' : 'dark');
      return;
    }
    const app = target.closest<HTMLElement>('[data-app-command]');
    if (app) {
      closeMenu();
      emit(app.dataset.appCommand!, app.dataset.homeId);
      return;
    }
    if (!target.closest('.home-menu')) closeMenu();
  };
  const key = (event: Event) => {
    if ((event as KeyboardEvent).key === 'Escape') closeMenu();
  };
  const themed = () => {
    const header = root.querySelector<HTMLElement>('.header');
    if (header) requestAnimationFrame(() => syncThemeButton(header));
  };
  root.addEventListener('click', click);
  root.addEventListener('keydown', key);
  document.addEventListener('homemanager-theme-change', themed);
  themed();
  const timer = setInterval(() => {
    const clock = root.querySelector('.clock');
    if (clock) clock.textContent = clockText();
  }, 30000);
  return () => {
    clearInterval(timer);
    root.removeEventListener('click', click);
    root.removeEventListener('keydown', key);
    document.removeEventListener('homemanager-theme-change', themed);
  };
}

/** Light or dark as seen on screen: the background token decides, whatever chose it. */
function isDark(root: ParentNode): boolean {
  const header = root.querySelector<HTMLElement>('.header');
  if (!header) return false;
  const probe = getComputedStyle(header)
    .backgroundColor.match(/\d+(\.\d+)?/g)
    ?.map(Number) ?? [255, 255, 255];
  return 0.2126 * probe[0] + 0.7152 * probe[1] + 0.0722 * probe[2] < 128;
}
function syncThemeButton(header: HTMLElement): void {
  const button = header.querySelector<HTMLElement>('[data-command=theme]');
  if (!button) return;
  const dark = isDark(header.parentNode ?? header);
  const label = dark ? t('Modo claro') : t('Modo oscuro');
  button.setAttribute('aria-label', label);
  button.title = label;
  button.querySelector('ha-icon')?.setAttribute('icon', dark ? 'mdi:weather-sunny' : 'mdi:weather-night');
}
export const topBarStyles = `
.header{grid-area:header;display:flex;align-items:center;gap:14px;padding:0 14px;height:56px;min-width:0;background:var(--hm-surface);border-bottom:1px solid var(--hm-line);position:relative;z-index:10}
.header h1:not(.home-title){font-size:14px;line-height:1.3;font-weight:500;margin:0;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.header .logo{display:flex;align-items:center;flex:none;color:var(--hm-brand)}.header .hm-logo{width:24px;height:24px}
.header .activity{height:34px;min-height:34px;border:0;border-radius:17px;padding:0 12px;flex:1;min-width:0;display:flex;align-items:center;text-align:left;color:var(--hm-muted);background:color-mix(in srgb,var(--hm-ink) 4%,transparent);font-size:12px;overflow:hidden}
.activity span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.activity[data-tone=ok]{color:var(--hm-ok)}.activity[data-tone=alert]{color:var(--hm-alert)}.activity[data-tone=warning]{color:var(--hm-warn)}
.header .alert-pill{display:flex;align-items:center;gap:6px;height:30px;min-height:30px;border:0;border-radius:15px;padding:0 10px;background:var(--hm-surface-2);color:var(--hm-muted);font-size:12px;font-weight:600}.header .alert-pill[data-active=true]{background:var(--hm-alert);color:var(--hm-on-accent)}.alert-pill ha-icon{--mdc-icon-size:18px}.clock{font-size:12px;color:var(--hm-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.hm-tools{flex:none;display:flex;align-items:center;gap:4px}
.home-title{margin:0;min-width:0}.home-pick{display:flex;align-items:center;gap:4px;max-width:240px;min-height:40px;border:0;border-radius:10px;background:transparent;color:var(--hm-ink);font:inherit;font-size:15px;font-weight:500;padding:0 8px;cursor:pointer}.home-pick:hover{background:var(--hm-surface-2)}.home-pick .hm-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.home-pick ha-icon{--mdc-icon-size:18px;color:var(--hm-muted)}
.home-menu{position:absolute;left:44px;top:52px;z-index:30;min-width:240px;display:grid;gap:2px;padding:6px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface);box-shadow:0 10px 40px rgba(0,0,0,.22)}.home-menu[hidden]{display:none}
.home-menu button{display:flex;align-items:center;gap:10px;min-height:40px;padding:0 10px;border:0;border-radius:10px;background:transparent;color:var(--hm-ink);font:inherit;text-align:left;cursor:pointer}.home-menu button span{flex:1}.home-menu button:hover{background:var(--hm-surface-2)}.home-menu ha-icon{--mdc-icon-size:20px;color:var(--hm-muted)}.home-menu hr{border:0;border-top:1px solid var(--hm-line);margin:4px 0}
.hm-tool{display:grid;place-items:center;flex:none;width:40px;height:40px;min-height:40px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--hm-muted);cursor:pointer}.hm-tool:hover{background:var(--hm-surface-2);color:var(--hm-ink)}.hm-tool ha-icon{--mdc-icon-size:22px}
.hm-tool[aria-pressed=true]{background:var(--hm-edit,var(--hm-warn));color:var(--hm-on-accent)}
@media(max-width:650px){.header{height:48px;gap:6px;padding:0 8px}.header h1,.header .clock{display:none}.header .hm-logo{width:22px;height:22px}.header .activity{height:30px;min-height:30px;padding:0 10px}.header .alert-pill{padding:0 8px}.hm-tool{width:36px;height:36px;min-height:36px}.hm-tools{gap:0}}
`;
