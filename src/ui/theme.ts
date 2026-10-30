export const themePalettes: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    ink: '#1F2A24',
    muted: '#5F6E66',
    bg: '#F4F5F0',
    surface: '#FFFFFF',
    line: '#DDE2D8',
    brand: '#4F7A5A',
    active: '#E8A33D',
    cool: '#4F8FBF',
    ok: '#3F8F5F',
    warn: '#D98B1F',
    alert: '#D0453A',
    unknown: '#9AA59F',
    'on-accent': '#FFFFFF',
  },
  dark: {
    ink: '#E8ECE6',
    muted: '#9AA59F',
    bg: '#121714',
    surface: '#1B221E',
    line: '#2C3530',
    brand: '#8FB38B',
    active: '#F0B455',
    cool: '#6FA9D6',
    ok: '#5DB07F',
    warn: '#E9A23B',
    alert: '#E5645A',
    unknown: '#6E7A73',
    'on-accent': '#121714',
  },
};
/** HomeManager palette (vision §9), independent of HA's accent colour.
 * Hosts set data-theme=dark from hass.themes.darkMode; the media query is the
 * fallback for standalone previews. Legacy aliases keep existing surfaces coherent. */
export const tokens = `
:host{
  --hm-ink:var(--hm-preference-ink,#1F2A24);--hm-muted:var(--hm-preference-muted,#5F6E66);--hm-bg:var(--hm-preference-bg,#F4F5F0);--hm-surface:var(--hm-preference-surface,#FFFFFF);--hm-line:var(--hm-preference-line,#DDE2D8);
  --hm-brand:var(--hm-preference-brand,#4F7A5A);--hm-active:var(--hm-preference-active,#E8A33D);--hm-cool:var(--hm-preference-cool,#4F8FBF);--hm-ok:var(--hm-preference-ok,#3F8F5F);--hm-warn:var(--hm-preference-warn,#D98B1F);--hm-alert:var(--hm-preference-alert,#D0453A);--hm-unknown:var(--hm-preference-unknown,#9AA59F);
  --hm-surface-2:color-mix(in srgb,var(--hm-text) 6%,transparent);
  --hm-text:var(--hm-ink);--hm-accent:var(--hm-brand);--hm-on-accent:var(--hm-preference-on-accent,#FFFFFF);
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
  --hm-ink:var(--hm-preference-ink,#E8ECE6);--hm-muted:var(--hm-preference-muted,#9AA59F);--hm-bg:var(--hm-preference-bg,#121714);--hm-surface:var(--hm-preference-surface,#1B221E);--hm-line:var(--hm-preference-line,#2C3530);
  --hm-brand:var(--hm-preference-brand,#8FB38B);--hm-active:var(--hm-preference-active,#F0B455);--hm-cool:var(--hm-preference-cool,#6FA9D6);--hm-ok:var(--hm-preference-ok,#5DB07F);--hm-warn:var(--hm-preference-warn,#E9A23B);--hm-alert:var(--hm-preference-alert,#E5645A);--hm-unknown:var(--hm-preference-unknown,#6E7A73);
  --hm-on-accent:var(--hm-preference-on-accent,#121714);
}
@media(prefers-color-scheme:dark){:host(:not([data-theme=light])){
  --hm-ink:var(--hm-preference-ink,#E8ECE6);--hm-muted:var(--hm-preference-muted,#9AA59F);--hm-bg:var(--hm-preference-bg,#121714);--hm-surface:var(--hm-preference-surface,#1B221E);--hm-line:var(--hm-preference-line,#2C3530);
  --hm-brand:var(--hm-preference-brand,#8FB38B);--hm-active:var(--hm-preference-active,#F0B455);--hm-cool:var(--hm-preference-cool,#6FA9D6);--hm-ok:var(--hm-preference-ok,#5DB07F);--hm-warn:var(--hm-preference-warn,#E9A23B);--hm-alert:var(--hm-preference-alert,#E5645A);--hm-unknown:var(--hm-preference-unknown,#6E7A73);
  --hm-on-accent:var(--hm-preference-on-accent,#121714);
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
