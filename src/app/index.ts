import { t } from '../i18n/index.js';
import { escapeHTML as e, type Hass } from '../card/types.js';
import { listHomes, type HomeSummary } from '../integration/store.js';
import { tokens } from '../ui/theme.js';
import { setLanguage, languageFromHass } from '../i18n/index.js';
import type { HomeManagerCard } from '../card/home-manager-card.js';

/** The HomeManager sidebar panel, registered by the integration
 * (custom_components/homemanager). It hosts the same card in full height and
 * lets the user switch homes; administrators can start a new one. */
const css = `${tokens}
:host{display:block;min-height:100dvh;background:var(--primary-background-color,var(--hm-surface))}
.toolbar{display:flex;align-items:center;gap:10px;min-height:56px;padding:0 12px;background:var(--app-header-background-color,var(--hm-accent));color:var(--app-header-text-color,var(--hm-on-accent))}
.toolbar h1{font-size:20px;font-weight:500;margin:0;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.toolbar button,.toolbar select{color:inherit;background:transparent;border:1px solid currentColor;min-height:40px;width:auto}
.toolbar select option{color:var(--hm-text);background:var(--hm-bg)}
.menu{width:40px;padding:0!important;border:0!important;font-size:22px}
.content{padding:12px;max-width:1600px;margin:auto}
homemanager-card{--hm-viewport-height:calc(100dvh - 210px);--hm-title-display:none}
.empty{max-width:520px;margin:48px auto;padding:24px;border-radius:var(--hm-radius);background:var(--hm-bg);line-height:1.6;box-shadow:var(--hm-shadow)}
.empty form{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.empty input{flex:1;min-width:180px}
.empty button{background:var(--hm-accent);border-color:var(--hm-accent);color:var(--hm-on-accent)}
.error{color:var(--hm-error)}
@media(max-width:650px){.content{padding:0}homemanager-card{--hm-viewport-height:calc(100dvh - 200px)}}`;
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
  private readonly root = this.attachShadow({ mode: 'open' });
  private _hass?: Hass;
  private _narrow = false;
  private homes?: HomeSummary[];
  private selected: string | null = null;
  private card?: HomeManagerCard;
  private error = '';
  private loading = false;

  set hass(hass: Hass) {
    setLanguage(languageFromHass(hass));
    const first = !this._hass;
    this._hass = hass;
    if (this.card) this.card.hass = hass;
    if (first) void this.refresh();
  }
  get hass(): Hass | undefined {
    return this._hass;
  }
  set narrow(value: boolean) {
    this._narrow = value;
    this.root.querySelector<HTMLElement>('.menu')?.toggleAttribute('hidden', !value);
  }
  get narrow(): boolean {
    return this._narrow;
  }
  // HA also assigns `route` and `panel`; this panel has no sub-routes or options.
  route?: unknown;
  panel?: unknown;

  connectedCallback(): void {
    if (!this.root.childElementCount) this.render();
  }

  private async refresh(): Promise<void> {
    if (!this._hass || this.loading) return;
    this.loading = true;
    try {
      this.homes = await listHomes(this._hass);
      this.error = '';
    } catch {
      this.homes = [];
      this.error = t('No se pudo leer la integración HomeManager. Comprobá que esté cargada.');
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
      this.root.innerHTML = `<style>${css}</style><header class="toolbar"></header><main class="content"><div class="messages"></div><div class="card-host"></div></main>`;
    }
    this.renderHeader();
    this.renderMessages();
    this.mountCard();
  }
  private renderHeader(): void {
    const header = this.root.querySelector('.toolbar');
    if (!header) return;
    const homes = this.homes,
      admin = this._hass?.user?.is_admin === true;
    const missing = this.selected && homes && !homes.some(home => home.home_id === this.selected);
    const selector =
      homes && homes.length + (missing ? 1 : 0) > 1
        ? `<select aria-label="${e(t('Hogar'))}" class="home-select">${homes.map(home => `<option value="${e(home.home_id)}"${home.home_id === this.selected ? ' selected' : ''}>${e(home.title ?? home.home_id)}</option>`).join('')}${missing ? `<option value="${e(this.selected!)}" selected>${e(this.selected!)} · nuevo</option>` : ''}</select>`
        : '';
    const title = homes?.find(home => home.home_id === this.selected)?.title ?? t('HomeManager');
    header.innerHTML = `<button type="button" class="menu" aria-label="${e(t('Menú'))}"${this._narrow ? '' : ' hidden'}>☰</button><h1>${e(title)}</h1>${selector}${admin && homes?.length ? `<button type="button" class="new">${e(t('Nuevo hogar'))}</button>` : ''}`;
    header
      .querySelector('.menu')
      ?.addEventListener('click', () =>
        this.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true })),
      );
    header
      .querySelector('.home-select')
      ?.addEventListener('change', event => this.select((event.target as HTMLSelectElement).value));
    header.querySelector('.new')?.addEventListener('click', () => {
      this.selected = null;
      this.dropCard();
      this.renderMessages(true);
    });
  }
  private renderMessages(creating = false): void {
    const host = this.root.querySelector('.messages');
    if (!host) return;
    // A reconnect can repaint the form while someone is typing: keep their text.
    const typed = host.querySelector<HTMLInputElement>('input[name=homeId]')?.value;
    const admin = this._hass?.user?.is_admin === true;
    const empty =
      this.homes && (!this.selected || creating)
        ? `<div class="empty"><h2>${this.homes.length ? t('Nuevo hogar') : t('Todavía no hay hogares')}</h2>${admin ? `<p>${e(t('Elegí un identificador para tu vivienda. Después importá el plano SVG desde'))} <strong>${e(t('Editar plano → Importar y exportar'))}</strong> ${e(t('y detectá sus espacios.'))}</p><form class="create"><input name="homeId" aria-label="${e(t('ID del hogar'))}" required maxlength="64" pattern="[a-z0-9]+(-[a-z0-9]+)*" value="home"><button type="submit">${e(t('Crear hogar'))}</button></form>` : `<p>${e(t('Pedile a una persona administradora de Home Assistant que cree el hogar en este panel.'))}</p>`}</div>`
        : '';
    host.innerHTML = `${this.error ? `<p class="error" role="alert">${e(this.error)}</p>` : ''}${this.homes ? empty : `<p>${e(t('Cargando…'))}</p>`}`;
    const field = host.querySelector<HTMLInputElement>('input[name=homeId]');
    if (field && typed) field.value = typed;
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
    if (this.card.parentElement !== host) host.replaceChildren(this.card);
  }
}

if (!customElements.get('homemanager-app')) customElements.define('homemanager-app', HomeManagerApp);
