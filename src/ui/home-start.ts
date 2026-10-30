import { t } from '../i18n/index.js';
import { uiEscape as e } from './components.js';
import { panelField, installDialogComponents } from './panel-components.js';

/** §11 new home and §6 empty state; the existing home identifier/form API stays intact. */
export function homeStart(root: ShadowRoot, options: { title: string; admin: boolean; cancel: boolean }): string {
  installDialogComponents(root);
  if (!root.adoptedStyleSheets.some(sheet => sheet === homeSheet))
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, homeSheet];
  const body = options.admin
    ? panelField(
        t('Nombre del hogar'),
        `<input name="homeId" aria-label="${e(t('Nombre del hogar'))}" required maxlength="64" pattern="[a-z0-9]+(-[a-z0-9]+)*" value="home">`,
        t('Usá minúsculas, números y guiones. El plano se agrega después.'),
      )
    : `<p>${e(t('Pedile a una persona administradora de Home Assistant que cree el hogar en este panel.'))}</p>`;
  return `<section class="k-dialog k-home" aria-labelledby="home-start-title"><header class="k-dialog-head"><h2 id="home-start-title">${e(options.title)}</h2></header>${options.admin ? '<form class="create">' : ''}<div class="k-dialog-body">${body}</div>${options.admin ? `<footer class="k-dialog-foot">${options.cancel ? `<button type="button" class="k-btn cancel-create">${e(t('Cancelar'))}</button>` : ''}<button type="submit" class="k-btn primary">${e(t('Crear hogar'))}</button></footer></form>` : ''}</section>`;
}
const homeSheet = new CSSStyleSheet();
homeSheet.replaceSync(
  `.k-home{display:block;width:440px;max-width:calc(100% - 32px);margin:40px auto}.k-home form{margin:0}.k-home .k-field{display:grid;gap:6px;font-size:12px;color:var(--hm-muted)}.k-home .k-field-title{display:flex;align-items:center;gap:6px}.k-home input{font:inherit;min-height:44px;width:100%;min-width:0;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);color:var(--hm-ink);padding:10px 12px}.k-home input:focus-visible{outline:none;box-shadow:var(--hm-focus)}@media(max-width:650px){.k-home{margin:20px auto}}`,
);
