import '../ui/theme-choice.js';
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
}
const glyph = (name: string) => `<ha-icon icon="mdi:${name}" aria-hidden="true"></ha-icon>`;
const item = (command: string, label: string, icon: string, app = false) =>
  `<button type="button" ${app ? 'data-app-command' : 'data-command'}="${command}">${glyph(icon)}<span>${e(label)}</span></button>`;
function menu(options: TopBarOptions): string {
  const { admin, app } = options;
  return `<details class="hm-menu"><summary aria-label="${e(t('Menú de HomeManager'))}" title="${e(t('Menú de HomeManager'))}">${glyph('dots-vertical')}</summary><div class="hm-menu-panel" role="group" aria-label="${e(t('Menú de HomeManager'))}">
    ${app?.narrow ? item('ha-menu', t('Menú de Home Assistant'), 'menu', true) : ''}
    ${admin ? item('edit', t('Editar plano'), 'pencil-outline') : ''}
    ${app ? item('plan', t('Plano'), 'floor-plan', true) : ''}
    ${admin && app ? item('rf', t('Controles RF'), 'remote', true) : ''}
    ${admin ? item('plan-settings', t('Ajustes del plano'), 'cog-outline') : ''}
    ${app && app.homes.length > 1 ? `<label class="hm-home-label">${e(t('Hogares'))}<select class="home-select" aria-label="${e(t('Hogar'))}">${app.homes.map(home => `<option value="${e(home.home_id)}"${home.home_id === app.selected ? ' selected' : ''}>${e(home.title ?? home.home_id)}</option>`).join('')}</select></label>` : ''}
    ${admin && app ? item('new', t('Nuevo hogar'), 'home-plus-outline', true) + item('storage', t('Almacenamiento'), 'database-outline', true) : ''}
    <homemanager-theme-choice></homemanager-theme-choice>
    ${item('fullscreen', t('Pantalla completa'), 'fullscreen')}${item('info', t('Ayuda'), 'help-circle-outline')}
  </div></details>`;
}
const menuKey = (options: TopBarOptions) => JSON.stringify({ admin: options.admin, app: options.app });
export function renderTopBar(options: TopBarOptions): string {
  const count = options.alertCount ?? 0;
  return `<header class="header" data-menu-key="${e(menuKey(options))}"><span class="logo">${logo}</span><h1>${e(options.title)}</h1><button type="button" class="activity" data-command="activity" data-tone="${e(options.activityTone ?? 'neutral')}" aria-label="${e(t('Historial de actividad'))}"><span>${e(options.activityText ?? t('Sin actividad reciente'))}</span></button><button type="button" class="alert-pill" data-command="alerts" aria-label="${e(t('Alertas'))}"${count ? '' : ' hidden'}>${glyph('alert-outline')}<span>${count}</span></button><time class="clock">${clockText()}</time>${menu(options)}</header>`;
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
    pill.hidden = !(options.alertCount ?? 0);
    pill.querySelector('span')!.textContent = String(options.alertCount ?? 0);
  }
  const clock = header.querySelector('.clock');
  if (clock) clock.textContent = clockText();
  const key = menuKey(options);
  if (header.dataset.menuKey !== key) {
    const existing = header.querySelector('.hm-menu');
    if (existing) existing.outerHTML = menu(options);
    header.dataset.menuKey = key;
  }
}
/** Delegation survives header updates. The owner handles ordinary card commands. */
export function bindTopBar(root: ShadowRoot | HTMLElement): () => void {
  const close = (focus = false) => {
    const details = root.querySelector<HTMLDetailsElement>('.hm-menu');
    if (!details?.open) return;
    details.open = false;
    if (focus) details.querySelector<HTMLElement>('summary')?.focus();
  };
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
    if (app) {
      emit(app.dataset.appCommand!);
      close();
    } else if (target.closest('.hm-menu-panel button')) close();
  };
  const change = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    if (target.matches('.home-select')) {
      emit('home', target.value);
      close();
    }
  };
  const key = (event: Event) => {
    const keyboard = event as KeyboardEvent;
    if (keyboard.key === 'Escape') close(true);
    const details = root.querySelector<HTMLDetailsElement>('.hm-menu');
    if (!details?.open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(keyboard.key)) return;
    if ((keyboard.composedPath()[0] as HTMLElement).tagName === 'SELECT') return;
    const items = [...details.querySelectorAll<HTMLElement>('button,select,homemanager-theme-choice')];
    const current = items.indexOf(
      root instanceof ShadowRoot ? (root.activeElement as HTMLElement) : (document.activeElement as HTMLElement),
    );
    const index =
      keyboard.key === 'Home'
        ? 0
        : keyboard.key === 'End'
          ? items.length - 1
          : (current + (keyboard.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
    keyboard.preventDefault();
    items[index]?.focus();
  };
  const outside = (event: Event) => {
    const details = root.querySelector('.hm-menu');
    if (details && !event.composedPath().includes(details)) close();
  };
  root.addEventListener('click', click);
  root.addEventListener('change', change);
  root.addEventListener('keydown', key);
  document.addEventListener('pointerdown', outside);
  const timer = setInterval(() => {
    const clock = root.querySelector('.clock');
    if (clock) clock.textContent = clockText();
  }, 30000);
  return () => {
    clearInterval(timer);
    root.removeEventListener('click', click);
    root.removeEventListener('change', change);
    root.removeEventListener('keydown', key);
    document.removeEventListener('pointerdown', outside);
  };
}

export const topBarStyles = `
.header{grid-area:header;display:flex;align-items:center;gap:14px;padding:0 14px;height:56px;min-width:0;background:var(--hm-surface);border-bottom:1px solid var(--hm-line);position:relative;z-index:10}
.header h1{font-size:14px;line-height:1.3;font-weight:500;margin:0;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.header .logo{display:flex;align-items:center;flex:none;color:var(--hm-brand)}.header .hm-logo{width:24px;height:24px}
.header .activity{height:34px;min-height:34px;border:0;border-radius:17px;padding:0 12px;flex:1;min-width:0;display:flex;align-items:center;text-align:left;color:var(--hm-muted);background:color-mix(in srgb,var(--hm-ink) 4%,transparent);font-size:12px;overflow:hidden}
.activity span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.activity[data-tone=ok]{color:var(--hm-ok)}.activity[data-tone=alert]{color:var(--hm-alert)}.activity[data-tone=warning]{color:var(--hm-warn)}
.header .alert-pill{display:flex;align-items:center;gap:6px;height:30px;min-height:30px;border:0;border-radius:15px;padding:0 10px;background:var(--hm-alert);color:var(--hm-on-accent);font-size:12px;font-weight:600}.alert-pill ha-icon{--mdc-icon-size:18px}.clock{font-size:12px;color:var(--hm-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.hm-menu{flex:none;position:relative}.hm-menu summary{list-style:none;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;cursor:pointer;color:var(--hm-muted)}.hm-menu summary::-webkit-details-marker{display:none}.hm-menu summary ha-icon{--mdc-icon-size:22px}
.hm-menu-panel{position:absolute;top:44px;right:0;width:260px;max-width:calc(100vw - 28px);max-height:calc(100dvh - 74px);overflow:auto;background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:12px;box-shadow:var(--hm-shadow);padding:6px;z-index:20;display:grid;gap:2px}
.hm-menu-panel button{display:flex;align-items:center;gap:10px;border:0;background:transparent;padding:0 10px;text-align:left;border-radius:8px;min-height:44px;font-size:14px}.hm-menu-panel button:hover{background:var(--hm-surface-2)}.hm-menu-panel ha-icon{--mdc-icon-size:20px;color:var(--hm-muted)}.hm-home-label{font-size:12px;color:var(--hm-muted);padding:6px 10px;display:grid;gap:4px}.hm-home-label select{width:100%;min-width:0;color:var(--hm-ink);background:var(--hm-bg)}
@media(max-width:650px){.header{height:48px;gap:8px;padding:0 10px}.header h1,.header .clock{display:none}.header .hm-logo{width:22px;height:22px}.header .activity{height:30px;min-height:30px;padding:0 10px}.header .alert-pill{padding:0 8px}.header .alert-pill ha-icon{display:none}.hm-menu-panel{top:40px}.hm-menu summary{width:32px;height:32px}}
`;
