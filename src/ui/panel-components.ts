import { tokens } from './theme.js';
import { componentStyles, uiEscape as e, uiIcon } from './components.js';
import { helpTip } from './help-tip.js';
import './help-tip.js';

/** Shared §6 fields, actions and §11 dialog frame. No screen owns these rules. */
const installed = new WeakMap<ShadowRoot, Set<string>>();
export function installPanelComponents(root: ShadowRoot, name: string, styles = '', ownTheme = false): void {
  const names = installed.get(root) ?? new Set<string>();
  if (names.has(name)) return;
  names.add(name);
  installed.set(root, names);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync((ownTheme ? tokens : '') + componentStyles + panelStyles + styles);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}
export function panelField(title: string, field: string, help?: string): string {
  const named = field.replace(/<(input|select|textarea)\b([^>]*)>/g, (tag, kind, attributes) =>
    /aria-label(?:ledby)?=/.test(attributes) ? tag : `<${kind} aria-label="${e(title)}"${attributes}>`,
  );
  return `<label class="k-field"><span class="k-field-title">${e(title)}${help ? helpTip(title, help) : ''}</span>${named}</label>`;
}
export const panelChoices = (title: string, body: string, help?: string): string =>
  `<fieldset class="k-choices"><legend>${e(title)}${help ? helpTip(title, help) : ''}</legend>${body}</fieldset>`;
export const panelIconAction = (
  title: string,
  attributes: string,
  icon: string,
  variant = '',
  type: 'button' | 'submit' = 'button',
): string =>
  `<button type="${type}" class="k-btn icon ${e(variant)}" aria-label="${e(title)}" title="${e(title)}" ${attributes}>${uiIcon(icon)}</button>`;
export const panelEmpty = (title: string, detail: string, icon = 'mdi:remote'): string =>
  `<div class="k-panel-empty">${uiIcon(icon)}<h2>${e(title)}</h2><p>${e(detail)}</p></div>`;
export const panelDialog = (
  title: string,
  body: string,
  footer: string,
  options: { className?: string; descriptionId?: string } = {},
): string =>
  `<dialog class="k-dialog ${e(options.className ?? '')}" aria-labelledby="hm-panel-title"${options.descriptionId ? ` aria-describedby="${e(options.descriptionId)}"` : ''}><header class="k-dialog-head"><h2 id="hm-panel-title">${e(title)}</h2></header><div class="k-dialog-body">${body}</div><footer class="k-dialog-foot">${footer}</footer></dialog>`;
export const dialogStyles = `.k-dialog{width:440px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);padding:0;overflow:auto;border:1px solid var(--hm-line);border-radius:18px;background:var(--hm-surface);color:var(--hm-ink);box-shadow:var(--hm-shadow)}.k-dialog::backdrop{background:color-mix(in srgb,var(--hm-ink) 32%,transparent)}.k-dialog-head{padding:20px 20px 12px}.k-dialog-head h2{font-size:18px;overflow-wrap:anywhere}.k-dialog-body{padding:0 20px 20px;display:grid;gap:14px}.k-dialog-body p{font-size:14px}.k-dialog-foot{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--hm-line)}.k-dialog .k-btn{min-height:40px}.k-btn.primary:has(ha-icon){color:var(--hm-on-accent)}.k-dialog .k-dialog-body>form{display:grid;gap:14px}.k-dialog form>.actions{padding-top:12px;border-top:1px solid var(--hm-line)}
.k-dialog .k-btn{font:inherit;min-height:40px;border-radius:20px;padding:8px 16px;cursor:pointer}.k-dialog .solid-danger{background:var(--hm-alert);color:var(--hm-on-accent);border-color:var(--hm-alert)}.k-dialog button:focus-visible{outline:none;box-shadow:var(--hm-focus)}@media(max-width:650px){.k-dialog{max-height:calc(100dvh - 24px);max-width:calc(100vw - 24px)}.k-dialog .k-btn{min-height:44px}}`;
export function installDialogComponents(root: ShadowRoot): void {
  const names = installed.get(root) ?? new Set<string>();
  if (names.has('dialog')) return;
  names.add('dialog');
  installed.set(root, names);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(componentStyles + dialogStyles);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}
export const panelStyles = `
*{box-sizing:border-box}[hidden]{display:none!important}:host{font-family:var(--hm-font);color:var(--hm-ink)}
button,input,select,textarea{font:inherit;color:inherit}button{min-height:40px;padding:8px 16px;border:1px solid var(--hm-line);border-radius:20px;background:var(--hm-surface);color:var(--hm-ink);cursor:pointer;font-size:14px;font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:8px}button:hover:not(:disabled){background:var(--hm-surface-2)}button:disabled{opacity:.45;cursor:default}button[data-variant=primary]{background:var(--hm-brand);border-color:var(--hm-brand);color:var(--hm-on-accent)}button.danger{color:var(--hm-alert);border-color:color-mix(in srgb,var(--hm-alert) 35%,var(--hm-line))}button.solid-danger{color:var(--hm-on-accent);background:var(--hm-alert);border-color:var(--hm-alert)}button.back{padding:0;width:40px;height:40px;min-width:40px;border-radius:50%}button ha-icon{--mdc-icon-size:20px}
input,select,textarea{min-height:44px;width:100%;min-width:0;padding:10px 12px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);font-size:14px}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:none;box-shadow:var(--hm-focus)}.k-choices{border:0;margin:0;padding:0;min-width:0}.k-choices legend{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--hm-muted);padding:0 0 8px}.k-choices legend homemanager-help-tip{margin:-6px 0}label,.k-field{display:grid;gap:6px;font-size:12px;color:var(--hm-muted)}label>span:first-child,.k-field-title{display:flex;align-items:center;gap:6px}.k-field-title homemanager-help-tip{margin:-6px 0}.k-field>input,.k-field>select{color:var(--hm-ink)}h2,h3,p{margin:0}h2{font-size:18px;font-weight:600}h3{font-size:14px;font-weight:600}p{font-size:14px;line-height:1.5}.muted{color:var(--hm-muted);font-size:12px;line-height:1.5}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.row>label{flex:1 1 150px}.actions{display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap}.status{font-size:13px;line-height:1.5}.status:empty,.error-text:empty{display:none}.status.error,.error-text{color:var(--hm-alert)}.error-text{font-size:13px}.k-panel-empty{border:1px dashed var(--hm-line);border-radius:14px;max-width:520px;margin:auto;padding:36px 24px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;color:var(--hm-muted)}.k-panel-empty>ha-icon{--mdc-icon-size:32px}.k-panel-empty h2{font-size:16px;color:var(--hm-ink)}
${dialogStyles}
@media(max-width:650px){button{min-height:44px}.k-dialog{max-height:calc(100dvh - 24px);max-width:calc(100vw - 24px)}.k-dialog-head{padding:18px 16px 12px}.k-dialog-body{padding:0 16px 18px}.k-dialog-foot{padding:12px 16px max(12px,env(safe-area-inset-bottom))}}
`;
