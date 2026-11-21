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
.cm-row{display:flex;align-items:center;gap:10px;min-height:48px}.cm-row>ha-icon{--mdc-icon-size:18px;color:var(--hm-muted);flex:none}.cm-lbl{flex:none;width:104px;font-size:13.5px;color:var(--hm-ink)}.cm-ctl{flex:1;min-width:0;display:flex;justify-content:flex-end}.cm-ctl select{width:100%;min-height:40px}
.cm-via{display:inline-flex;gap:2px;padding:3px;border-radius:12px;background:var(--hm-surface-2);width:100%}.cm-via button{flex:1;display:grid;place-items:center;min-height:36px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--hm-muted)}.cm-via button[aria-pressed=true]{background:var(--hm-surface);color:var(--hm-ink);box-shadow:0 1px 2px rgba(0,0,0,.12)}.cm-via ha-icon{--mdc-icon-size:20px}
.ctl-add.cm-add{width:100%;border-style:solid;margin-top:4px}
.cm-card.cm-empty{align-items:center}.cm-card.cm-empty>ha-icon{--mdc-icon-size:28px;color:var(--hm-muted);padding:0 8px}
.cm-card{display:flex;gap:12px;align-items:stretch;margin-top:10px;padding:10px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface)}
.cm-prev{flex:none;width:118px;height:150px;border-radius:12px;overflow:hidden;background:var(--hm-surface-2);position:relative;mask-image:linear-gradient(#000 78%,transparent);-webkit-mask-image:linear-gradient(#000 78%,transparent)}
.cm-prev homemanager-rf-remote{position:absolute;left:0;top:0;width:300px;transform:scale(.39);transform-origin:top left;pointer-events:none}
.cm-info{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:6px}.cm-info b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cm-info small{color:var(--hm-muted);font-size:12.5px;margin-bottom:4px}
.cm-info button{display:flex;align-items:center;justify-content:center;gap:6px;min-height:40px;width:100%}.cm-info button ha-icon{--mdc-icon-size:18px}
`;
