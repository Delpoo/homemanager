import { t } from '../i18n/index.js';
import { themePalettes } from './theme.js';

export type ThemeChoice = 'auto' | 'light' | 'dark';
const key = 'homemanager-ui-theme';
const valid = (value: unknown): ThemeChoice => (value === 'light' || value === 'dark' ? value : 'auto');
let choice: ThemeChoice = 'auto';
try {
  choice = valid(localStorage.getItem(key));
} catch {
  /* Page-only preference when storage is denied. */
}
function apply(): void {
  for (const name of Object.keys(themePalettes.light)) {
    const property = `--hm-preference-${name}`;
    if (choice === 'auto') document.documentElement.style.removeProperty(property);
    else document.documentElement.style.setProperty(property, themePalettes[choice][name]);
  }
  document.dispatchEvent(new CustomEvent('homemanager-theme-change', { detail: choice }));
}
export function setThemeChoice(value: ThemeChoice): void {
  choice = valid(value);
  try {
    localStorage.setItem(key, choice);
  } catch {
    /* Keep it for this page. */
  }
  apply();
}
apply();
addEventListener('storage', event => {
  if (event.key === key || event.key === null) {
    choice = valid(event.newValue);
    apply();
  }
});

/** The mockup §6 field; shared by every HomeManager menu. */
class ThemeChoiceField extends HTMLElement {
  private root = this.attachShadow({ mode: 'open', delegatesFocus: true });
  private sync = () => {
    this.root.querySelector('select')!.value = choice;
  };
  constructor() {
    super();
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      ':host{display:block;padding:8px 10px}label{display:grid;gap:6px;font-size:12px;color:var(--hm-muted)}select{font:inherit;min-height:44px;border:1px solid var(--hm-line);border-radius:10px;padding:8px 10px;width:100%;background:var(--hm-surface);color:var(--hm-ink);font-size:14px}',
    );
    this.root.adoptedStyleSheets = [sheet];
    this.root.innerHTML = `<label>${t('Apariencia')}<select aria-label="${t('Apariencia')}"><option value="auto">${t('Automático')}</option><option value="light">${t('Claro')}</option><option value="dark">${t('Oscuro')}</option></select></label>`;
    this.root.addEventListener('change', () => setThemeChoice(this.root.querySelector('select')!.value as ThemeChoice));
  }
  connectedCallback() {
    this.sync();
    document.addEventListener('homemanager-theme-change', this.sync);
  }
  disconnectedCallback() {
    document.removeEventListener('homemanager-theme-change', this.sync);
  }
}
if (!customElements.get('homemanager-theme-choice'))
  customElements.define('homemanager-theme-choice', ThemeChoiceField);
