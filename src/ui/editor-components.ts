/** E01: layout only. Categories, controls and warnings keep their existing models. */
export const editorDockStyles = `
.workspace>.editor{position:relative;inset:auto;z-index:6;flex:0 0 380px;width:380px;max-width:400px;height:100%;max-height:none;min-height:0;overflow:hidden;border-radius:0;border-left:1px solid var(--hm-line);background:var(--hm-surface)}
.workspace>.editor[hidden]{display:none}
 .workspace>.editor[data-surface=settings],.workspace>.editor[data-task=page]{position:absolute;inset:0!important;width:100%;max-width:none;height:100%;max-height:100%;border:0;overflow:hidden;border-radius:0}
.workspace>.editor>homemanager-editor{height:100%;width:100%;min-height:0}
@container homemanager (max-width:650px){
 .workspace>.editor{position:absolute;inset:auto 0 0!important;width:100%;max-width:100%;height:55%;max-height:calc(100% - 80px);border-left:0;border-top:1px solid var(--hm-line);border-radius:18px 18px 0 0}
 .workspace>.editor[data-expanded=true]{height:84%}
 .workspace>.editor[data-surface=settings],.workspace>.editor[data-surface=add],.workspace>.editor[data-task=page],.workspace>.editor[data-task=link]{inset:0!important;height:100%;max-height:100%;border:0;overflow:hidden;border-radius:0}
}
`;

export const editorSheetStyles = `
:host([embedded]){height:100%;min-height:0;max-height:none;background:var(--hm-surface);border-radius:0;box-shadow:none;border:0;display:block}
:host([embedded][hidden]){display:none}
:host([embedded])>.editor{height:100%;min-height:0;max-height:none;padding:0;display:flex;flex-direction:column;margin:0;max-width:none;overflow:hidden}
.sheet-header{position:relative;top:auto;display:flex;align-items:center;gap:10px;flex:none;margin:0;padding:14px 16px;border-bottom:1px solid var(--hm-line);background:var(--hm-surface)}
.sheet-header h2{flex:1;min-width:0;overflow-wrap:anywhere;margin:0;font-size:17px}
.sheet-glyph{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:12px;color:var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 10%,var(--hm-surface))}
.sheet-body{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain;padding:14px 16px 18px}
.sheet-tools{display:flex;flex:none;gap:6px;align-items:center;padding:10px 12px;border-top:1px solid var(--hm-line);background:var(--hm-surface);position:static;margin:0}
.sheet-tools .spacer{flex:1}
.sheet-tools .hm-icon-button{flex:none}
.sheet-handle{display:none;flex:none;border:0;border-bottom:1px solid var(--hm-line);border-radius:0;background:var(--hm-surface);min-height:30px;padding:4px;touch-action:none}
.sheet-handle span{display:block;width:36px;height:4px;margin:auto;border-radius:4px;background:var(--hm-muted)}
.sheet-category summary{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sheet-category summary small{font-weight:400;color:var(--hm-muted)}
.sheet-body .basic{display:grid;gap:12px}.sheet-body .basic>.field{margin:0}
.sheet-body .base-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:end}
.sheet-body .symbol-size{margin:0}.sheet-body .symbol-size .seg{display:flex}
.sheet-body .symbol-size .seg button{flex:1;min-width:0;padding:8px 5px}
.sheet-body .section{background:var(--hm-surface);margin-top:12px}
.sheet-body .section .section-body{min-width:0}
.sheet-body .ctl-top{display:block}.sheet-body .ctl-host .ctl-section{border-top:0;padding-top:0;margin-top:0}
.sheet-body .advanced{border-top:1px solid var(--hm-line)}
.sheet-error{margin:0;padding:0 16px;color:var(--hm-error);font-size:12px;flex:none}.sheet-error:empty{display:none}
.sheet-body .add-menu{display:grid;gap:10px}
:host([embedded][data-narrow=true]){border-radius:18px 18px 0 0}
:host([embedded][data-narrow=true]) .sheet-handle{display:block}
:host([embedded][data-narrow=true]) .sheet-header{padding:7px 14px}
:host([embedded][data-narrow=true]) .sheet-glyph{width:32px;height:32px}
:host([embedded][data-narrow=true]) .sheet-handle{min-height:20px}
:host([embedded][data-narrow=true]) .sheet-tools{padding:7px 12px}
:host([embedded][data-narrow=true]) .sheet-body{padding:8px 14px}
:host([embedded][data-narrow=true]) .sheet-body .field-title{min-height:20px}
:host([embedded][data-narrow=true]) .sheet-body .basic{gap:8px}
:host([embedded][data-narrow=true]) .symbol-size{flex-direction:row;align-items:center;gap:8px}
:host([embedded][data-narrow=true]) .symbol-size>.field-title{width:74px;flex:none}
:host([embedded][data-narrow=true]) .symbol-size .seg{flex:1}
`;
