/** HomeManager palette (vision §9), independent of HA's accent colour.
 * Hosts set data-theme=dark from hass.themes.darkMode; the media query is the
 * fallback for standalone previews. Legacy aliases keep existing surfaces coherent. */
export const tokens = `
:host{
  --hm-ink:#1F2A24;--hm-muted:#5F6E66;--hm-bg:#F4F5F0;--hm-surface:#FFFFFF;--hm-line:#DDE2D8;
  --hm-brand:#4F7A5A;--hm-active:#E8A33D;--hm-cool:#4F8FBF;--hm-ok:#3F8F5F;--hm-warn:#D98B1F;--hm-alert:#D0453A;--hm-unknown:#9AA59F;
  --hm-surface-2:color-mix(in srgb,var(--hm-text) 6%,transparent);
  --hm-text:var(--hm-ink);--hm-accent:var(--hm-brand);--hm-on-accent:#FFFFFF;
  --hm-confirmed:var(--hm-ok);--hm-estimated:var(--hm-warn);--hm-sent:var(--hm-muted);--hm-error:var(--hm-alert);
  --hm-radius:12px;
  --hm-radius-sm:10px;
  --hm-shadow:0 1px 2px rgba(0,0,0,.08),0 6px 20px rgba(0,0,0,.08);
  --hm-focus:0 0 0 3px color-mix(in srgb,var(--hm-accent) 45%,transparent);
  --hm-font:var(--ha-font-family-body,var(--paper-font-body1_-_font-family,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif));
  --hm-touch:44px;
  color:var(--hm-text);font-family:var(--hm-font);
}
:host([data-theme=dark]){
  --hm-ink:#E8ECE6;--hm-muted:#9AA59F;--hm-bg:#121714;--hm-surface:#1B221E;--hm-line:#2C3530;
  --hm-brand:#8FB38B;--hm-active:#F0B455;--hm-cool:#6FA9D6;--hm-ok:#5DB07F;--hm-warn:#E9A23B;--hm-alert:#E5645A;--hm-unknown:#6E7A73;
  --hm-on-accent:#121714;
}
@media(prefers-color-scheme:dark){:host(:not([data-theme=light])){
  --hm-ink:#E8ECE6;--hm-muted:#9AA59F;--hm-bg:#121714;--hm-surface:#1B221E;--hm-line:#2C3530;
  --hm-brand:#8FB38B;--hm-active:#F0B455;--hm-cool:#6FA9D6;--hm-ok:#5DB07F;--hm-warn:#E9A23B;--hm-alert:#E5645A;--hm-unknown:#6E7A73;
  --hm-on-accent:#121714;
}}
*{box-sizing:border-box}
[hidden]{display:none!important}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer;min-height:var(--hm-touch);border-radius:var(--hm-radius-sm);border:1px solid var(--hm-line);background:var(--hm-bg);padding:0 14px}
button:hover:not(:disabled){background:var(--hm-surface-2)}
button:disabled{opacity:.45;cursor:default}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:none;box-shadow:var(--hm-focus)}
time,.value{font-variant-numeric:tabular-nums}
button.primary-action,button[data-variant=primary]{background:var(--hm-accent);border-color:var(--hm-accent);color:var(--hm-on-accent);font-weight:600}
input,select,textarea{min-height:var(--hm-touch);border:1px solid var(--hm-line);border-radius:var(--hm-radius-sm);background:var(--hm-bg);padding:8px 10px;width:100%}
input[type=range]{padding:0;border:0;background:transparent;accent-color:var(--hm-accent)}
input[type=checkbox]{width:20px;min-height:20px;accent-color:var(--hm-accent)}
@media (prefers-reduced-motion:no-preference){button{transition:background .15s,box-shadow .15s,transform .1s}button:active:not(:disabled){transform:scale(.97)}}
`;
