/** The symbol's sheet as in mockups 1 to 4 (#71): Base, then module cards with a summary. */
export const sheetStyles = `
.sheet-group{margin:14px 0 6px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--hm-muted)}
.module-card>.section{margin-top:8px;padding:0;border-radius:14px;background:var(--hm-surface);overflow:hidden}
.module-card>.section>summary{list-style:none;display:flex;align-items:center;gap:12px;min-height:56px;line-height:1.3;padding:8px 12px;font-weight:400}
.module-card>.section>summary::-webkit-details-marker{display:none}
.module-card>.section>summary::after{content:'›';margin-left:auto;font-size:20px;color:var(--hm-muted);transition:transform .15s}
.module-card>.section[open]>summary::after{transform:rotate(90deg)}
.module-card>.section>.section-body{padding:0 12px 12px}
.module-icon{flex:none;--mdc-icon-size:22px;color:var(--hm-accent)}
.module-text{display:grid;gap:2px;min-width:0;text-align:left}.module-name{font-weight:600;color:var(--hm-ink)}.module-sum{font-size:12px;color:var(--hm-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.module-add-list{display:grid;gap:6px}
.module-add-row{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;text-align:left;justify-content:flex-start}.module-add-row ha-icon{flex:none;color:var(--hm-accent)}
.module-add-row .module-sum{white-space:normal}.module-state{margin-left:auto;flex:none;font-size:12px;color:var(--hm-muted)}
.symbol-actions{display:grid;gap:2px}.symbol-action{display:flex;align-items:center;gap:8px;min-height:40px;padding-left:6px;border-radius:10px}.symbol-action:hover{background:var(--hm-surface-2)}.symbol-action>ha-icon{--mdc-icon-size:18px;color:var(--hm-brand);flex:none}.symbol-action .txt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.symbol-action b{font-weight:400}
.symbol-rules{display:grid;gap:2px;margin-bottom:6px}.symbol-rule{display:flex;align-items:center;gap:8px;min-height:40px;padding-left:6px;border-radius:10px}.symbol-rule:hover{background:var(--hm-surface-2)}.symbol-rule.off{opacity:.55}.rule-dot{width:9px;height:9px;border-radius:50%;flex:none;background:var(--hm-warn)}.symbol-rule[data-level=alert] .rule-dot{background:var(--hm-alert)}.symbol-rule[data-level=indicator] .rule-dot{background:var(--hm-accent,var(--hm-brand))}.rule-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.shortcut-list{display:grid;gap:4px}.shortcut-row{display:flex;align-items:center;gap:10px;min-height:48px}.shortcut-row span{flex:1;min-width:0}.shortcut-row ha-icon{color:var(--hm-accent)}.shortcut-row button[aria-pressed=true]{color:var(--hm-error)}
.designer-title{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:15px}.designer-title ha-icon{color:var(--hm-accent)}
`;
