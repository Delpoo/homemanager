import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { tokens } from './theme.js';

/** helpTip(label, text) renders a keyboard/touch help button. A native popover
 * stays above scrolling sheets and dismisses on Esc or an outside tap. */
export const helpTip = (label: string, text: string) =>
  `<homemanager-help-tip label="${e(label)}" text="${e(text)}"></homemanager-help-tip>`;
class HelpTip extends HTMLElement {
  connectedCallback(): void {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${tokens}:host{display:inline-block;vertical-align:middle}button{border:0;border-radius:50%;width:44px;min-height:44px;padding:0;color:var(--hm-accent);font-weight:700}[popover]{position:fixed;margin:0;width:300px;max-height:calc(100dvh - 24px);overflow:auto;max-width:min(300px,calc(100vw - 24px));border:1px solid var(--hm-line);border-radius:12px;padding:16px;color:var(--hm-text);background:var(--hm-bg);box-shadow:var(--hm-shadow);font:14px/1.5 var(--hm-font)}</style><button type="button" aria-label="${e(t('Ayuda: {field}', { field: this.getAttribute('label') ?? '' }))}" popovertarget="help">?</button><div id="help" popover>${e(this.getAttribute('text') ?? '')}</div>`;
    const trigger = root.querySelector<HTMLButtonElement>('button')!;
    const popover = root.querySelector<HTMLElement>('[popover]')!;
    popover.addEventListener('toggle', () => {
      if (!popover.matches(':popover-open')) return;
      const anchor = trigger.getBoundingClientRect();
      const box = popover.getBoundingClientRect();
      popover.style.left = `${Math.max(12, Math.min(innerWidth - box.width - 12, anchor.right - box.width))}px`;
      popover.style.top = `${Math.max(12, anchor.bottom + box.height + 18 <= innerHeight ? anchor.bottom + 6 : anchor.top - box.height - 6)}px`;
    });
  }
}
if (!customElements.get('homemanager-help-tip')) customElements.define('homemanager-help-tip', HelpTip);
