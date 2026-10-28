/** Design tokens shared by every HomeManager surface. Each token maps to the
 * matching Home Assistant theme variable, so light/dark mode and user themes
 * apply automatically; the literal is only a fallback outside HA. */
export const tokens = `
:host{
  --hm-bg:var(--ha-card-background,var(--card-background-color,#fff));
  --hm-surface:var(--secondary-background-color,#f2f4f1);
  --hm-surface-2:color-mix(in srgb,var(--hm-text) 6%,transparent);
  --hm-text:var(--primary-text-color,#1d2a23);
  --hm-muted:var(--secondary-text-color,#5f6e66);
  --hm-accent:var(--primary-color,#2f7d5b);
  --hm-on-accent:var(--text-primary-color,#fff);
  --hm-line:var(--divider-color,rgba(0,0,0,.12));
  --hm-active:var(--state-light-active-color,var(--amber-color,#f3b33d));
  --hm-confirmed:var(--success-color,#2e8b57);
  --hm-estimated:var(--warning-color,#c08a1e);
  --hm-sent:var(--info-color,#3b82c4);
  --hm-error:var(--error-color,#c4453c);
  --hm-unknown:var(--disabled-color,#9aa59f);
  --hm-radius:var(--ha-card-border-radius,16px);
  --hm-radius-sm:10px;
  --hm-shadow:0 1px 2px rgba(0,0,0,.08),0 6px 20px rgba(0,0,0,.08);
  --hm-focus:0 0 0 3px color-mix(in srgb,var(--hm-accent) 45%,transparent);
  --hm-font:var(--ha-font-family-body,var(--paper-font-body1_-_font-family,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif));
  --hm-touch:44px;
  color:var(--hm-text);font-family:var(--hm-font);
}
*{box-sizing:border-box}
[hidden]{display:none!important}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer;min-height:var(--hm-touch);border-radius:var(--hm-radius-sm);border:1px solid var(--hm-line);background:var(--hm-bg);padding:0 14px}
button:hover:not(:disabled){background:var(--hm-surface-2)}
button:disabled{opacity:.45;cursor:default}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:none;box-shadow:var(--hm-focus)}
button.primary-action,button[data-variant=primary]{background:var(--hm-accent);border-color:var(--hm-accent);color:var(--hm-on-accent);font-weight:600}
input,select,textarea{min-height:var(--hm-touch);border:1px solid var(--hm-line);border-radius:var(--hm-radius-sm);background:var(--hm-bg);padding:8px 10px;width:100%}
input[type=range]{padding:0;border:0;background:transparent;accent-color:var(--hm-accent)}
input[type=checkbox]{width:20px;min-height:20px;accent-color:var(--hm-accent)}
@media (prefers-reduced-motion:no-preference){button{transition:background .15s,box-shadow .15s,transform .1s}button:active:not(:disabled){transform:scale(.97)}}
`;
