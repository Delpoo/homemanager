import { tokens } from './theme.js';

/** Components copied from mockup §6. Screens compose these; they own no CSS. */
export const uiEscape = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export const uiIcon = (icon: string): string => `<ha-icon icon="${uiEscape(icon)}" aria-hidden="true"></ha-icon>`;
export const uiButton = (text: string, action: string, variant = 'secondary', icon?: string): string =>
  `<button type="button" class="k-btn ${variant}"${variant === 'icon' ? ` aria-label="${uiEscape(text)}"` : ''} data-action="${uiEscape(action)}">${icon ? uiIcon(icon) : ''}${variant === 'icon' ? '' : uiEscape(text)}</button>`;
export const uiStatus = (text: string, tone = 'brand'): string =>
  `<span class="k-status ${tone}">${uiEscape(text)}</span>`;
export const uiNotice = (text: string, tone = 'info'): string =>
  `<div class="k-notice ${tone}" role="${tone === 'alert' ? 'alert' : 'status'}">${uiIcon(tone === 'alert' ? 'mdi:alert-circle-outline' : 'mdi:information-outline')}<span>${uiEscape(text)}</span></div>`;
export const uiEmpty = (text: string): string =>
  `<div class="k-empty">${uiIcon('mdi:magnify')}<b>${uiEscape(text)}</b></div>`;
export const uiGroup = (title: string, content: string): string =>
  `<section class="k-group-section"><h3 class="k-group">${uiEscape(title)}</h3><div class="k-list">${content}</div></section>`;
export const uiSearch = (placeholder: string, value = ''): string =>
  `<label class="k-input">${uiIcon('mdi:magnify')}<input type="search" name="search" aria-label="${uiEscape(placeholder)}" placeholder="${uiEscape(placeholder)}" value="${uiEscape(value)}" autocomplete="off"></label>`;
export const uiTabs = (options: { id: string; label: string }[], selected: string): string =>
  `<div class="k-tabs" role="tablist">${options.map(option => `<button type="button" role="tab" aria-selected="${selected === option.id}" data-tab="${uiEscape(option.id)}">${uiEscape(option.label)}</button>`).join('')}</div>`;
export const uiSteps = (step: number): string =>
  `<span class="k-steps" aria-label="${step}/2"><i class="${step === 1 ? 'on' : 'done'}">1</i><hr><i class="${step === 2 ? 'on' : ''}">2</i></span>`;
export function uiRow(options: {
  name: string;
  detail?: string;
  value?: string;
  icon?: string;
  status?: string;
  action?: string;
  key?: string;
  choice?: { type: 'radio' | 'checkbox'; name: string; checked: boolean; disabled?: boolean };
}): string {
  const { choice } = options;
  const tag = choice ? 'label' : options.action ? 'button' : 'div';
  return `<${tag} class="k-row${choice?.checked ? ' sel' : ''}"${options.action ? ` type="button" data-action="${uiEscape(options.action)}" data-key="${uiEscape(options.key)}"` : ''}>${choice ? `<input class="k-${choice.type}" type="${choice.type}" name="${uiEscape(choice.name)}" value="${uiEscape(options.key)}"${choice.checked ? ' checked' : ''}${choice.disabled ? ' disabled' : ''}>` : options.icon ? `<span class="ico">${uiIcon(options.icon)}</span>` : ''}<span class="txt"><b>${uiEscape(options.name)}</b>${options.detail ? `<span>${uiEscape(options.detail)}</span>` : ''}</span>${options.value ? `<span class="val">${uiEscape(options.value)}</span>` : ''}${options.status ? uiStatus(options.status) : ''}${options.action ? `<span class="chev">${uiIcon('mdi:chevron-right')}</span>` : ''}</${tag}>`;
}
export const uiFold = (title: string, content: string, open = false): string =>
  `<details class="k-fold"${open ? ' open' : ''}><summary>${uiIcon('mdi:chevron-right')}<b>${uiEscape(title)}</b></summary><div class="k-list">${content}</div></details>`;
export const uiPane = (
  title: string,
  body: string,
  footer: string,
  options: { step?: number; back?: boolean; advanced?: boolean } = {},
): string =>
  `<section class="k-pane" aria-label="${uiEscape(title)}"${options.advanced ? ' data-advanced="true"' : ''}><header class="pane-head">${options.back ? uiButton('', 'back', 'icon', 'mdi:arrow-left') : ''}<h2>${uiEscape(title)}</h2>${options.step ? uiSteps(options.step) : ''}</header><div class="pane-body">${body}</div><footer class="pane-foot">${footer}</footer></section>`;
export const uiBinding = (name: string, detail: string, buttonText: string): string =>
  `<div class="k-binding">${uiRow({ name, detail })}${uiButton(buttonText, 'binding', 'secondary', 'mdi:link-variant')}</div>`;

/** A labelled radio group drawn as tiles (mockup §12): one choice, icon above its name. */
export const uiChoices = (
  legend: string,
  name: string,
  options: readonly { value: string; label: string; icon: string }[],
  selected: string,
): string =>
  `<fieldset class="k-choices"><legend>${uiEscape(legend)}</legend>${options.map(option => `<label><input type="radio" name="${uiEscape(name)}" value="${uiEscape(option.value)}"${option.value === selected ? ' checked' : ''}>${uiIcon(option.icon)}<span>${uiEscape(option.label)}</span></label>`).join('')}</fieldset>`;
/** A labelled radio group drawn as one segmented bar (mockup §3). */
export const uiSegmented = (
  legend: string,
  name: string,
  options: readonly { value: string; label: string }[],
  selected: string,
): string =>
  `<fieldset class="k-segmented"><legend>${uiEscape(legend)}</legend><span>${options.map(option => `<label><input type="radio" name="${uiEscape(name)}" value="${uiEscape(option.value)}"${option.value === selected ? ' checked' : ''}><span>${uiEscape(option.label)}</span></label>`).join('')}</span></fieldset>`;
export const componentStyles = `
.k-input input::-webkit-search-cancel-button{display:none}
.k-pane{width:440px;max-width:calc(100vw - 32px);height:min(760px,calc(100dvh - 48px));max-height:calc(100dvh - 48px);padding:0;border:1px solid var(--hm-line);border-radius:18px;background:var(--hm-bg);color:var(--hm-ink);box-shadow:var(--hm-shadow);overflow:hidden}
.k-pane[open]{display:flex;flex-direction:column}.k-pane::backdrop{background:color-mix(in srgb,var(--hm-ink) 32%,transparent)}
.pane-head{display:flex;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--hm-line);background:var(--hm-surface);flex:none}.pane-head h2{font-size:18px;font-weight:600;flex:1;margin:0;min-width:0;overflow-wrap:anywhere}.pane-body{padding:14px 16px;overflow:auto;flex:1;min-height:0}.pane-foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:12px 16px;background:var(--hm-surface);border-top:1px solid var(--hm-line);flex:none}
.k-btn{min-height:40px;height:auto;padding:8px 16px;border-radius:20px;border:1px solid var(--hm-line);background:var(--hm-surface);color:var(--hm-ink);display:inline-flex;justify-content:center;align-items:center;gap:8px;font-weight:500;font-size:14px;white-space:normal}.k-btn.primary{background:var(--hm-brand);border-color:var(--hm-brand);color:var(--hm-on-accent)}.k-btn.ghost{background:transparent;border-color:transparent;color:var(--hm-brand);margin-right:auto}.k-btn.icon{width:36px;min-height:36px;height:36px;padding:0;border-radius:50%;flex:none}.k-btn.icon:has(ha-icon){color:var(--hm-muted)}
.k-input{display:flex;align-items:center;gap:8px;height:44px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);padding:0 12px;margin-bottom:12px}.k-input:focus-within{border-color:var(--hm-brand);box-shadow:var(--hm-focus)}.k-input input{border:0;background:transparent;box-shadow:none;padding:0;min-width:0;min-height:0;flex:1;outline:none;font-size:14px}.k-input ha-icon{color:var(--hm-muted);flex:none}
.k-tabs{display:flex;gap:2px;padding:3px;border-radius:12px;background:color-mix(in srgb,var(--hm-ink) 6%,transparent)}.k-tabs button{flex:1;padding:7px 12px;border:0;border-radius:9px;min-height:36px;background:transparent;color:var(--hm-muted);font-size:14px}.k-tabs button[aria-selected=true]{background:var(--hm-surface);color:var(--hm-ink);box-shadow:var(--hm-shadow);font-weight:500}
.k-group{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--hm-muted);font-weight:600;margin:18px 2px 8px}.k-group-section:first-child .k-group{margin-top:4px}.k-list{background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:14px;overflow:hidden}.k-row{display:flex;align-items:center;gap:12px;padding:10px 14px;min-height:58px;width:100%;margin:0;border:0;border-radius:0;border-top:1px solid var(--hm-line);background:var(--hm-surface);color:var(--hm-ink);text-align:left}.k-row:first-child{border-top:0}.k-row.sel{background:color-mix(in srgb,var(--hm-brand) 9%,var(--hm-surface))}.k-row .ico{width:36px;height:36px;border-radius:11px;background:color-mix(in srgb,var(--hm-brand) 11%,transparent);color:var(--hm-brand);display:grid;place-items:center;flex:none}.k-row .txt{display:flex;flex-direction:column;min-width:0;flex:1}.k-row .txt b{font-weight:500;font-size:14px;overflow-wrap:anywhere}.k-row .txt span{font-size:12px;color:var(--hm-muted);overflow-wrap:anywhere}.k-row .val{font-variant-numeric:tabular-nums;font-weight:500;white-space:nowrap;font-size:14px}.k-row .chev{color:var(--hm-muted)}
.k-radio,.k-checkbox{appearance:none;min-height:20px!important;width:20px!important;height:20px;margin:0;padding:0;border:2px solid var(--hm-line);background:transparent;flex:none;border-radius:6px!important}.k-radio{border-radius:50%!important}.k-radio:checked{border-color:var(--hm-brand);background:radial-gradient(circle,var(--hm-brand) 0 5px,transparent 5px)}.k-checkbox:checked{border-color:var(--hm-brand);background:var(--hm-brand)}.k-checkbox:checked::after{content:'';display:block;width:6px;height:10px;border:solid var(--hm-on-accent);border-width:0 2px 2px 0;transform:translate(5px,1px) rotate(45deg)}
.k-status{display:inline-flex;align-items:center;gap:5px;min-height:22px;padding:2px 8px;border-radius:11px;font-size:12px;font-weight:600;background:color-mix(in srgb,var(--hm-brand) 12%,transparent);color:var(--hm-brand)}.k-status::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}.k-notice{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;margin-top:14px;font-size:14px;line-height:1.45;background:color-mix(in srgb,var(--hm-brand) 10%,transparent)}.k-notice.alert{background:color-mix(in srgb,var(--hm-alert) 11%,transparent);color:var(--hm-alert)}.k-notice ha-icon{flex:none;color:var(--hm-brand)}.k-notice.alert ha-icon{color:var(--hm-alert)}.k-empty{border:1px dashed var(--hm-line);border-radius:14px;padding:22px;display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--hm-muted)}
.k-fold{margin-top:14px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface);overflow:hidden}.k-fold summary{padding:12px 14px;min-height:44px;display:flex;gap:10px;align-items:center;cursor:pointer;font-size:14px}.k-fold[open]>summary ha-icon{transform:rotate(90deg)}.k-fold .k-list{border:0;border-radius:0;border-top:1px solid var(--hm-line)}.k-steps{display:flex;gap:6px;align-items:center;color:var(--hm-muted);font-size:12px}.k-steps i{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-style:normal;border:1px solid var(--hm-line)}.k-steps .on{background:var(--hm-brand);color:var(--hm-on-accent);border-color:var(--hm-brand)}.k-steps .done{color:var(--hm-brand);border-color:var(--hm-brand)}.k-steps hr{width:20px;border:0;border-top:1px solid var(--hm-line)}.k-binding{display:grid;gap:8px}.k-binding .k-row{background:transparent;padding:0}.k-binding .k-btn{justify-self:start}.k-binding .k-notice{margin:0}.k-pane ha-icon,.k-binding ha-icon{--mdc-icon-size:20px}
.k-choices,.k-segmented{border:0;margin:0 0 14px;padding:0;min-width:0}.k-choices legend,.k-segmented legend{font-size:13px;color:var(--hm-muted);padding:0;margin-bottom:6px}
.k-choices{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.k-choices legend{grid-column:1/-1}.k-choices label{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;min-height:58px;padding:8px 2px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);color:var(--hm-muted);font-size:11px;line-height:1.15;text-align:center;cursor:pointer;hyphens:auto;overflow-wrap:break-word}.k-choices label:has(input:checked){border-color:var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 12%,var(--hm-surface));color:var(--hm-ink);font-weight:600}.k-choices label:has(input:focus-visible),.k-segmented label:has(input:focus-visible){box-shadow:var(--hm-focus)}.k-choices input[type=radio],.k-segmented input[type=radio]{position:absolute;inset:0;opacity:0;width:100%!important;height:100%!important;min-height:0!important;margin:0;padding:0;border:0;cursor:pointer}.k-choices ha-icon{--mdc-icon-size:20px}
.k-segmented>span{display:flex;border:1px solid var(--hm-line);border-radius:12px;overflow:hidden;background:var(--hm-surface)}.k-segmented label{position:relative;flex:1;display:grid;place-items:center;min-height:40px;padding:0 6px;font-size:13px;color:var(--hm-ink);cursor:pointer;text-align:center}.k-segmented label+label{border-left:1px solid var(--hm-line)}.k-segmented label:has(input:checked){background:color-mix(in srgb,var(--hm-brand) 16%,var(--hm-surface));font-weight:600}
@media(max-width:650px){.k-pane{width:100%;max-width:100%;height:100dvh;max-height:100dvh;margin:0;border:0;border-radius:18px 18px 0 0}.pane-head{padding-top:max(14px,env(safe-area-inset-top))}.pane-foot{padding-bottom:max(12px,env(safe-area-inset-bottom))}.k-row{gap:10px;padding:10px 12px}.k-row .val{font-size:14px}.k-btn{min-height:44px}.k-tabs button{min-height:40px}}
`;
/** Constructed sheets survive screen content updates without style tags in screens. */
export function useComponents(root: ShadowRoot): void {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(tokens + componentStyles);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}
export function useBindingComponents(root: ShadowRoot): void {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(componentStyles);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}
