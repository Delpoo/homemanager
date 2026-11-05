import { homeStart } from '../ui/home-start.js';
import { TaskScreen } from '../ui/task-screen.js';
import { appearanceBody } from '../editor/settings-page.js';
import { storageBody, storageStyles } from '../editor/storage-section.js';
import { helpBody } from '../shell/help.js';
import { setShowLink } from '../shell/show-link.js';
import { t } from '../i18n/index.js';
import { escapeHTML as e, type Hass } from '../card/types.js';
import { describeError, listHomes, type HomeSummary } from '../integration/store.js';
import { tokens } from '../ui/theme.js';
import { setLanguage, languageFromHass } from '../i18n/index.js';
import type { HomeManagerCard } from '../card/home-manager-card.js';
import '../rf/manager.js';
import type { HomeManagerRf } from '../rf/manager.js';
import { bindTopBar, renderTopBar, topBarStyles, type AppShellContext } from '../shell/top-bar.js';
import { ActivityLog } from '../model/activity.js';

/** The HomeManager sidebar panel, registered by the integration
 * (custom_components/homemanager). It hosts the same card in full height and
 * lets the user switch homes; administrators can start a new one. */
const css = `${tokens}
:host{display:block;min-height:100dvh;background:var(--hm-bg)}
.content{padding:0;margin:0}
/* 0.13: Controls is a panel beside the plan; its design takes the whole stage. */
.content.controls-open{display:grid;grid-template-columns:minmax(0,1fr) min(440px,100%);height:100dvh}
.content.controls-open .card-host{min-width:0;overflow:hidden}
.content.controls-open .rf-host{min-width:0;height:100dvh;overflow:hidden;border-left:1px solid var(--hm-line);background:var(--hm-surface);box-shadow:-8px 0 24px rgba(0,0,0,.06)}
.content.controls-open:has(homemanager-rf[data-stage]){grid-template-columns:0 minmax(0,1fr)}
@media(max-width:700px){.content.controls-open{display:block;position:relative}
 .content.controls-open .rf-host{position:fixed;inset:auto 0 0;z-index:5;height:88dvh;border-left:0;border-radius:18px 18px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.2)}
 .content.controls-open:has(homemanager-rf[data-stage]) .rf-host{inset:0;height:100dvh;border-radius:0}}
homemanager-card{--hm-shell-height:max(100dvh,450px);--hm-viewport-height:100%}
.error{color:var(--hm-error)}
.maintenance{color:var(--hm-text);background:var(--hm-bg);border:1px solid var(--hm-line);border-radius:16px;max-width:520px;padding:24px}
.maintenance ul{padding-left:20px}.maintenance li{margin:12px 0}.maintenance button{margin-left:8px}
${topBarStyles}${storageStyles}`;
const STORAGE_KEY = 'homemanager-app-home';
function remembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function remember(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* per-viewer convenience only */
  }
}

export class HomeManagerApp extends HTMLElement {
  private readonly activity = new ActivityLog();
  private readonly root = this.attachShadow({ mode: 'open' });
  private _hass?: Hass;
  private _narrow = false;
  private homes?: HomeSummary[];
  private selected: string | null = null;
  private card?: HomeManagerCard;
  private error = '';
  private loading = false;
  private tab: 'plan' | 'rf' = 'plan';
  private creating = false;
  private rfElement?: HomeManagerRf;
  private unbindShell?: () => void;

  set hass(hass: Hass) {
    setLanguage(languageFromHass(hass));
    const first = !this._hass;
    this._hass = hass;
    const dark = (hass as Hass & { themes?: { darkMode?: boolean } }).themes?.darkMode;
    if (dark !== undefined) this.dataset.theme = dark ? 'dark' : 'light';
    if (this.card) this.card.hass = hass;
    if (this.rfElement) this.rfElement.hass = hass;
    if (first) void this.refresh();
    else if (this.root.querySelector('.toolbar')) {
      if (this.tab === 'rf' && hass.user?.is_admin !== true) this.tab = 'plan';
      this.renderHeader();
      this.applyTab();
    }
  }
  get hass(): Hass | undefined {
    return this._hass;
  }
  set narrow(value: boolean) {
    this._narrow = value;
    this.renderHeader();
  }
  get narrow(): boolean {
    return this._narrow;
  }
  // HA also assigns `route` and `panel`; this panel has no sub-routes or options.
  route?: unknown;
  panel?: unknown;

  connectedCallback(): void {
    if (!this.root.childElementCount) this.render();
    if (!this.unbindShell) this.unbindShell = bindTopBar(this.root);
    this.root.addEventListener('homemanager-shell-command', this.shellCommand);
    this.root.addEventListener('click', this.headerCommand);
  }
  disconnectedCallback(): void {
    this.unbindShell?.();
    this.unbindShell = undefined;
    this.root.removeEventListener('homemanager-shell-command', this.shellCommand);
    this.root.removeEventListener('click', this.headerCommand);
  }

  private async refresh(): Promise<void> {
    if (!this._hass || this.loading) return;
    this.loading = true;
    try {
      this.homes = await listHomes(this._hass);
      this.error = '';
    } catch (error) {
      this.homes = [];
      this.error = describeError(error);
    } finally {
      this.loading = false;
    }
    const preferred = remembered();
    if (!this.selected || !this.homes.some(home => home.home_id === this.selected))
      this.selected = this.homes.find(home => home.home_id === preferred)?.home_id ?? this.homes[0]?.home_id ?? null;
    this.render();
  }

  /** After a save only the header changes; the card keeps its DOM, status and subscription. */
  private async refreshHeader(): Promise<void> {
    if (!this._hass) return;
    try {
      this.homes = await listHomes(this._hass);
    } catch {
      return;
    }
    this.renderHeader();
  }
  private render(): void {
    if (!this.root.querySelector('.toolbar')) {
      this.root.innerHTML = `<style>${css}</style><div class="toolbar"></div><main class="content"><div class="messages"></div><div class="card-host"></div><div class="rf-host" hidden></div></main>`;
    }
    this.renderHeader();
    this.renderMessages();
    this.mountCard();
    this.applyTab();
  }
  /** The plan stays mounted while the RF manager is open, so nothing reloads. */
  private applyTab(): void {
    const rfTab = this.tab === 'rf' && this._hass?.user?.is_admin === true;
    this.root.querySelector<HTMLElement>('.messages')!.hidden = rfTab;
    this.root.querySelector<HTMLElement>('.card-host')!.hidden = this.creating;
    this.root.querySelector<HTMLElement>('.content')!.classList.toggle('controls-open', rfTab);
    const host = this.root.querySelector<HTMLElement>('.rf-host')!;
    host.hidden = !rfTab;
    if (!rfTab) this.rfElement?.stopIrCapture();
    if (rfTab && !this.rfElement) {
      this.rfElement = document.createElement('homemanager-rf') as HomeManagerRf;
      if (this._hass) this.rfElement.hass = this._hass;
      host.append(this.rfElement);
    }
  }
  private renderHeader(): void {
    const header = this.root.querySelector<HTMLElement>('.toolbar');
    if (!header) return;
    const context = this.shellContext();
    const title = context.homes.find(home => home.home_id === this.selected)?.title ?? t('HomeManager');
    // The plan keeps its own top bar, also with Controls open beside it (0.13).
    header.hidden = !!this.selected && !this.creating;
    header.innerHTML = header.hidden
      ? ''
      : renderTopBar({
          title: this.tab === 'rf' ? t('Controles RF') : title,
          admin: this._hass?.user?.is_admin === true,
          app: context,
          // RF and a new home open from Settings and go back to it (#70).
          ...((this.tab === 'rf' || this.creating) && this.selected ? { back: 'plan' } : {}),
        });
    this.card?.setShellContext(context);
  }
  private shellContext(): AppShellContext {
    const homes: AppShellContext['homes'] = (this.homes ?? []).map(home => ({
      home_id: home.home_id,
      ...(home.title ? { title: home.title } : {}),
    }));
    if (this.selected && !homes.some(home => home.home_id === this.selected))
      homes.push({ home_id: this.selected, title: this.selected });
    return { homes, selected: this.selected, narrow: this._narrow };
  }
  private shellCommand = (event: Event): void => {
    const { command, homeId, remoteId, irRemoteId } = (
      event as CustomEvent<{ command: string; homeId?: string; remoteId?: string; irRemoteId?: string }>
    ).detail;
    if (command === 'home' && homeId) {
      this.select(homeId);
      return;
    }
    if (command === 'ha-menu') {
      this.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }));
      return;
    }
    if (command === 'plan') {
      this.tab = 'plan';
      if (this.creating) this.cancelCreate();
    } else if (this._hass?.user?.is_admin === true) {
      if (command === 'rf') this.tab = 'rf';
      else if (command === 'new') {
        this.creating = true;
        this.tab = 'plan';
        this.renderMessages(true);
      }
    }
    this.renderHeader();
    this.applyTab();
    // From a symbol's Control › Design: straight to that remote's design (#73).
    if (command === 'rf' && remoteId) this.rfElement?.openRemote(remoteId);
    if (command === 'rf' && irRemoteId) this.rfElement?.openIrRemote(irRemoteId);
    if (this.creating) this.root.querySelector<HTMLInputElement>('input[name=homeId]')?.focus();
  };
  /** The same menu remains usable while the RF manager or empty view is open. */
  private headerCommand = (event: Event): void => {
    const target = (event.target as Element).closest<HTMLElement>('.toolbar [data-command]');
    if (!target) return;
    const command = target.dataset.command;
    if (command === 'configuration' && !this.card) {
      this.openBasicSettings();
      return;
    }
    if (command === 'info' && !this.card) return;
    if (!this.card || !command) return;
    this.tab = 'plan';
    this.creating = false;
    this.renderHeader();
    this.applyTab();
    this.card.shadowRoot?.querySelector<HTMLButtonElement>(`[data-command="${command}"]`)?.click();
  };
  /** ⚙ before any home exists: what does not need a plan (#70), so retained histories
   * of deleted homes can still be removed. */
  private openBasicSettings(): void {
    const admin = this._hass?.user?.is_admin === true;
    const dialog = new TaskScreen();
    dialog.className = 'maintenance';
    dialog.innerHTML = `<h2>${e(t('Configuración'))}</h2><h3>${e(t('Apariencia'))}</h3>${appearanceBody()}${admin ? `<h3>${e(t('Controles RF'))}</h3><button type="button" data-app-command="rf">${e(t('Abrir controles RF'))}</button><h3>${e(t('Almacenamiento'))}</h3><div class="storage-host"></div>` : ''}<h3>${e(t('Ayuda'))}</h3>${helpBody()}`;
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.addEventListener('change', event => {
      const target = event.target as HTMLSelectElement;
      if (target.hasAttribute('data-show-link')) setShowLink(target.value);
    });
    // Opening RF leaves this page.
    dialog.addEventListener('click', event => {
      if ((event.target as Element).closest('[data-app-command]')) dialog.close();
    });
    this.root.append(dialog);
    dialog.show(this.root, t('Configuración'));
    const host = dialog.querySelector<HTMLElement>('.storage-host');
    if (host && this._hass) void storageBody(host, this._hass, this.root);
  }
  private cancelCreate(): void {
    this.creating = false;
    this.error = '';
    this.renderMessages();
    this.renderHeader();
    this.applyTab();
    this.card?.shadowRoot?.querySelector<HTMLElement>('[data-command=configuration]')?.focus();
  }
  private renderMessages(creating = this.creating): void {
    const host = this.root.querySelector('.messages');
    if (!host) return;
    // A reconnect can repaint the form while someone is typing: keep their text.
    const typed = host.querySelector<HTMLInputElement>('input[name=homeId]')?.value;
    const admin = this._hass?.user?.is_admin === true;
    const empty =
      this.homes && (!this.selected || creating)
        ? homeStart(this.root, {
            title: this.homes.length ? t('Nuevo hogar') : t('Todavía no hay hogares'),
            admin,
            cancel: !!this.selected,
          })
        : '';
    host.innerHTML = `${this.error ? `<p class="error" role="alert">${e(this.error === t('El ID del hogar debe ser kebab-case (minúsculas, números y guiones).') ? t('Usá minúsculas, números y guiones para el nombre del hogar.') : this.error)}</p>` : ''}${this.homes ? empty : `<p>${e(t('Cargando…'))}</p>`}`;
    const field = host.querySelector<HTMLInputElement>('input[name=homeId]');
    if (field && typed) field.value = typed;
    host.querySelector('.cancel-create')?.addEventListener('click', () => this.cancelCreate());
    host.querySelector('form.create')?.addEventListener('submit', event => {
      event.preventDefault();
      const id = new FormData(event.target as HTMLFormElement).get('homeId');
      if (typeof id === 'string') this.select(id.trim());
    });
  }
  private select(homeId: string): void {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(homeId) || homeId.length > 64) {
      this.error = t('El ID del hogar debe ser kebab-case (minúsculas, números y guiones).');
      this.renderMessages(true);
      return;
    }
    this.creating = false;
    this.selected = homeId;
    this.error = '';
    remember(homeId);
    this.dropCard();
    this.render();
  }
  private dropCard(): void {
    this.card?.remove();
    this.card = undefined;
  }
  private mountCard(): void {
    const host = this.root.querySelector('.card-host');
    if (!host || !this.selected) return;
    if (!this.card) {
      this.card = document.createElement('homemanager-card') as HomeManagerCard;
      this.card.setConfig({ type: 'custom:homemanager-card', card_id: 'panel', home_id: this.selected });
      // A save that creates the home must appear in the selector.
      this.card.addEventListener('homemanager-saved', () => void this.refreshHeader());
    }
    if (this._hass) this.card.hass = this._hass;
    this.card.setShellContext(this.shellContext());
    this.card.setActivityLog(this.activity);
    this.card.setShellContext(this.shellContext());
    if (this.card.parentElement !== host) host.replaceChildren(this.card);
  }
}

if (!customElements.get('homemanager-app')) customElements.define('homemanager-app', HomeManagerApp);
