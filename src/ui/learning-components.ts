/** Uses the same tokens, fields and task screens as the component kit (§6). */
export const learningPanelStyles = `
.learning-steps{display:flex;gap:6px;list-style:none;padding:0;margin:0;flex-wrap:wrap}
.learning-steps li{flex:1 1 75px;border-radius:10px;padding:8px;background:var(--hm-surface);font-size:12px;color:var(--hm-muted)}
.learning-steps [aria-current=step]{background:var(--hm-accent);color:var(--hm-on-accent);font-weight:600}
.evidence{display:grid;gap:8px;padding:12px;border:1px solid var(--hm-line);border-radius:12px}
.evidence label{font-size:12px;display:grid;gap:6px}.evidence p{font-size:12px;margin:0;color:var(--hm-muted)}
progress{width:100%;height:8px;accent-color:var(--hm-brand)}
.sheet>p{font-size:13px;line-height:1.5}.sheet>label{display:grid;gap:6px}
.sheet input,.sheet select{min-width:0;width:100%;box-sizing:border-box}.sheet{min-width:0}
`;
export const learningWorkspaceStyles = `
.rf-learning{min-width:0;align-self:start;max-width:100%}
@container(min-width:1100px){.rf-workspace[data-learning=true]{grid-template-columns:220px minmax(320px,1fr) minmax(280px,350px)}}
@container(max-width:650px){
 .rf-workspace[data-learning=true]{display:flex;flex-direction:column}
 .rf-workspace[data-learning=true] .rf-detail{display:contents}
 .rf-workspace[data-learning=true] .rf-detail>*{order:5}
 .rf-workspace[data-learning=true] .rf-navigation{order:1}
 .rf-workspace[data-learning=true] .rf-detail>.head{order:2;padding:12px}
 .rf-workspace[data-learning=true] .rf-detail>homemanager-control-designer{order:3;padding:12px;box-sizing:border-box}
 .rf-workspace[data-learning=true] .rf-learning{order:4;width:100%;box-sizing:border-box}
 .rf-workspace[data-learning=true] .rf-detail>section,.rf-workspace[data-learning=true] .rf-detail>p,.rf-workspace[data-learning=true] .rf-detail>.actions{order:5;margin:12px}
}
`;
