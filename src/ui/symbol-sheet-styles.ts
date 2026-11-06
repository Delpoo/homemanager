/** 0.13 symbol sheet: icon, name and space in the head; switches, sliders with their %,
 * shapes and colours as drawings; modules as cards with chips to add more. */
export const symbolSheetStyles = `
.symhead{position:sticky;top:-14px;z-index:3;display:flex;align-items:center;gap:10px;margin:-2px 0 10px;padding:6px 0 10px;background:var(--hm-bg);border-bottom:1px solid var(--hm-line)}
.symhead homemanager-icon-picker{flex:none}
.titlebox{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.title-in{width:100%;min-height:38px;padding:2px 8px;margin-left:-8px;border:0;border-radius:8px;background:transparent;font-size:18px;font-weight:500;color:var(--hm-ink)}
.title-in:hover{background:var(--hm-surface-2)}.title-in:focus{background:var(--hm-surface);box-shadow:0 0 0 2px var(--hm-brand)}
.spacepick{display:inline-flex;align-items:center;gap:4px;width:max-content;max-width:100%;padding:0 4px;margin-left:-6px;border-radius:8px;color:var(--hm-muted);font-size:13px}
.spacepick:hover{background:var(--hm-surface-2)}.spacepick ha-icon{--mdc-icon-size:16px}
.spacepick select{width:auto;min-height:30px;padding:0 4px;border:0;background:transparent;color:inherit;font-size:13px}
.switch-row{display:grid;grid-template-columns:24px 1fr auto;align-items:center;gap:10px;min-height:44px;color:var(--hm-ink)}
.switch-row ha-icon{--mdc-icon-size:20px;color:var(--hm-muted)}
input[role=switch]{appearance:none;width:40px;height:24px;min-height:24px;margin:0;padding:0;border:0;border-radius:12px;background:color-mix(in srgb,var(--hm-ink) 22%,transparent);position:relative;cursor:pointer;transition:background .15s}
input[role=switch]::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--hm-surface);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s}
input[role=switch]:checked{background:var(--hm-brand)}input[role=switch]:checked::after{left:19px}
.lbl{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:11.5px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:var(--hm-muted)}.lbl .grow{flex:1;height:1px;background:var(--hm-line)}
.look-fields{display:grid;gap:8px}
.look-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:10px}
.look-row.top{align-items:start}.look-row>ha-icon{--mdc-icon-size:20px;color:var(--hm-muted)}
.look-row input[type=range]{min-height:32px;padding:0;border:0;background:transparent;accent-color:var(--hm-brand)}
.num{display:inline-flex;align-items:center;gap:2px;padding:0 8px;border:1px solid color-mix(in srgb,var(--hm-ink) 24%,transparent);border-radius:10px;background:var(--hm-surface);font-size:12px;color:var(--hm-muted)}
.num input{width:48px;min-height:34px;border:0;padding:0;background:transparent;text-align:right}
.seg{display:inline-flex;gap:2px;padding:3px;border-radius:12px;background:var(--hm-surface-2);width:max-content}
.ib{display:grid;place-items:center;width:38px;height:36px;min-height:36px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--hm-ink)}
.ib ha-icon{--mdc-icon-size:20px}.ib:hover:not(:disabled){background:var(--hm-surface-2)}
.seg .ib[aria-checked=true],.ib[aria-pressed=true]{background:var(--hm-surface);color:var(--hm-brand);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.colors{display:grid;gap:8px;grid-column:2/-1}
.swatches{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.sw{width:26px;height:26px;min-height:26px;padding:0;border-radius:50%;border:1px solid color-mix(in srgb,var(--hm-ink) 18%,transparent);background:var(--c)}
.sw[aria-pressed=true]{box-shadow:0 0 0 2px var(--hm-surface),0 0 0 4px var(--hm-brand)}
.sw.custom{position:relative;overflow:hidden;background:conic-gradient(#D0453A,#D98B1F,#4F7A5A,#4F8FBF,#6F6BB8,#D0453A)}
.sw.custom input{position:absolute;inset:0;width:100%;height:100%;min-height:0;padding:0;opacity:0;cursor:pointer}
.swatches .ib{width:30px;height:30px;min-height:30px;border-radius:50%}
.palsel{display:flex;align-items:center;gap:6px}.palsel select{width:auto;min-height:34px;padding:0 8px}
.module-card .section>summary{min-height:52px}
.module-foot{display:flex;justify-content:flex-end}
.module-foot .ib{color:var(--hm-muted)}.module-foot .ib:hover{color:var(--hm-alert)}
.addmods{display:flex;flex-wrap:wrap;gap:6px}
.addmods button{display:inline-flex;align-items:center;gap:4px;min-height:36px;padding:6px 10px;border:1px dashed var(--hm-line);border-radius:10px;background:transparent;color:var(--hm-muted);font-size:13px}
.addmods button ha-icon{--mdc-icon-size:16px}
.addmods button:hover:not(:disabled){border-color:var(--hm-brand);color:var(--hm-brand)}
`;
