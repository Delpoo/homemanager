import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { CONTROL_STYLES, type ControlStyle } from '../model/control-layout.js';
import { formStyles } from './control-forms.js';

/** 0.14 · M: the general style of the controls (Settings › Appearance, as in the mockup). A control
 * or a piece with a style of its own keeps it; the others follow this one. Like the rest of
 * Appearance, it is kept in this browser. */
export const STYLE_NAMES: Record<ControlStyle, string> = {
  normal: 'Normal',
  digital: 'Digital',
  retro: 'Retro',
  color: 'Colorido',
  glass: 'Cristal',
  futurista: 'Futurista',
};
const KEY = 'homemanager-control-style';
const valid = (value: unknown): ControlStyle =>
  CONTROL_STYLES.includes(value as ControlStyle) ? (value as ControlStyle) : 'normal';
let current: ControlStyle = 'normal';
try {
  current = valid(localStorage.getItem(KEY));
} catch {
  /* Page-only preference when storage is denied. */
}
export const globalControlStyle = (): ControlStyle => current;
export function setGlobalControlStyle(value: ControlStyle): void {
  current = valid(value);
  try {
    localStorage.setItem(KEY, current);
  } catch {
    /* Keep it for this page. */
  }
  document.dispatchEvent(new CustomEvent('homemanager-control-style-change', { detail: current }));
}
addEventListener('storage', event => {
  if (event.key !== KEY && event.key !== null) return;
  current = valid(event.newValue);
  document.dispatchEvent(new CustomEvent('homemanager-control-style-change', { detail: current }));
});

/** The row of styles in Appearance: each with a small preview of its keys. */
class StyleChoiceField extends HTMLElement {
  private root = this.attachShadow({ mode: 'open', delegatesFocus: true });
  private sync = () => {
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-style]')
      .forEach(button => button.setAttribute('aria-pressed', String(button.dataset.style === current)));
  };
  constructor() {
    super();
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      `:host{display:block;padding:8px 10px}.lbl{display:block;font-size:12px;color:var(--hm-muted);margin-bottom:6px}.row{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:6px}
button{display:flex;flex-direction:column;align-items:center;gap:4px;min-height:58px;padding:6px 4px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);color:var(--hm-ink);font:inherit;font-size:11.5px;cursor:pointer}
button[aria-pressed=true]{border-color:var(--hm-brand);box-shadow:inset 0 0 0 1px var(--hm-brand)}button:focus-visible{outline:3px solid var(--hm-accent,var(--hm-brand));outline-offset:2px}
.cprev{display:flex;gap:3px;padding:5px 6px;border-radius:9px;background:var(--rbody,var(--hm-bg));border:1px solid var(--hm-line)}
.cprev i{display:block;width:14px;height:14px;border-radius:5px;background:var(--rkey,var(--hm-surface));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rfg,var(--hm-ink)) 25%,transparent)}.cprev i:last-child{background:var(--racc,var(--hm-brand))}
${formStyles}`,
    );
    this.root.adoptedStyleSheets = [sheet];
    const label = t('Estilo general de los controles');
    this.root.innerHTML = `<span class="lbl">${e(label)}</span><div class="row" role="group" aria-label="${e(label)}">${CONTROL_STYLES.map(
      style =>
        `<button type="button" class="cstyle st-${style}" data-style="${style}" title="${e(t(STYLE_NAMES[style]))}"><span class="cprev"><i></i><i></i></span><span>${e(t(STYLE_NAMES[style]))}</span></button>`,
    ).join('')}</div>`;
    this.root.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-style]');
      if (button) setGlobalControlStyle(button.dataset.style as ControlStyle);
    });
  }
  connectedCallback() {
    this.sync();
    document.addEventListener('homemanager-control-style-change', this.sync);
  }
  disconnectedCallback() {
    document.removeEventListener('homemanager-control-style-change', this.sync);
  }
}
if (!customElements.get('homemanager-style-choice'))
  customElements.define('homemanager-style-choice', StyleChoiceField);
