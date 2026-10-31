import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';

interface LayerChoice {
  collapsed: boolean;
  hidden: boolean;
}
const key = 'homemanager-ui-layers';
const shared = globalThis as typeof globalThis & { __homemanagerLayers?: LayerChoice };
export function layerChoice(): LayerChoice {
  if (!shared.__homemanagerLayers) {
    let stored: Partial<LayerChoice> = {};
    try {
      stored = JSON.parse(localStorage.getItem(key) ?? '{}') ?? {};
    } catch {
      /* Page-only preference. */
    }
    shared.__homemanagerLayers = { collapsed: stored.collapsed === true, hidden: stored.hidden === true };
  }
  return { ...shared.__homemanagerLayers };
}
export function setLayerChoice(patch: Partial<LayerChoice>): void {
  shared.__homemanagerLayers = { ...layerChoice(), ...patch };
  try {
    localStorage.setItem(key, JSON.stringify(shared.__homemanagerLayers));
  } catch {
    /* Keep this page usable. */
  }
  document.dispatchEvent(new CustomEvent('homemanager-layers-change'));
}
class LayerChoiceField extends HTMLElement {
  private root = this.attachShadow({ mode: 'open', delegatesFocus: true });
  private sync = () => {
    this.root.querySelector('input')!.checked = !layerChoice().hidden;
  };
  connectedCallback(): void {
    this.root.innerHTML = `<style>:host{display:block;padding:8px 10px}label{display:flex;align-items:center;gap:10px;min-height:44px;font:14px var(--hm-font);color:var(--hm-ink)}input{width:20px;height:20px;accent-color:var(--hm-brand)}small{display:block;color:var(--hm-muted);font-size:12px}</style><label><input type="checkbox"><span>${e(t('Mostrar capas'))}<small>${e(t('Sólo en este navegador'))}</small></span></label>`;
    this.root
      .querySelector('input')!
      .addEventListener('change', event => setLayerChoice({ hidden: !(event.target as HTMLInputElement).checked }));
    this.sync();
    document.addEventListener('homemanager-layers-change', this.sync);
  }
  disconnectedCallback(): void {
    document.removeEventListener('homemanager-layers-change', this.sync);
  }
}
if (!customElements.get('homemanager-layer-choice'))
  customElements.define('homemanager-layer-choice', LayerChoiceField);
