import { insightsLayoutStyles } from '../ui/device-components.js';
import { controlViewStyles } from '../ui/control-view.js';
import { tokens } from '../ui/theme.js';
import { iconButtonStyles } from '../ui/icon-button.js';
import { fabStyles } from '../ui/fab.js';
import { topBarStyles } from '../shell/top-bar.js';
import { roomRailStyles } from '../shell/room-rail.js';
import { layerStyles } from '../shell/layers.js';

export const styles = `${tokens}${iconButtonStyles}${fabStyles}${controlViewStyles}
:host{display:block}
.shell{background:var(--hm-bg);border:1px solid var(--hm-line);border-radius:var(--hm-radius);overflow:hidden;box-shadow:var(--ha-card-box-shadow,none);display:grid;grid-template-columns:72px minmax(0,1fr);grid-template-areas:"header header" "edit edit" "rooms workspace" "selection selection" "status status"}
.header{display:flex;align-items:center;gap:8px;padding:10px 10px 6px 16px}
h1{font-size:18px;line-height:1.3;margin:0;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.logo{font-size:20px;color:var(--hm-accent)}
.header h1,.header .logo{display:var(--hm-title-display,block)}
.header .icon:first-of-type{margin-left:auto}
.icon{width:var(--hm-touch);min-width:var(--hm-touch);flex:0 0 var(--hm-touch);font-size:19px;display:inline-grid;place-items:center;padding:0;border-radius:50%;border-color:transparent;background:transparent}
.icon[aria-pressed=true]{background:var(--hm-accent);color:var(--hm-on-accent)}
.rooms{display:flex;gap:6px;overflow-x:auto;padding:4px 12px 10px;scrollbar-width:none;scroll-snap-type:x proximity}
.rooms::-webkit-scrollbar{display:none}
.rooms button{flex:0 0 auto;min-height:36px;border-radius:18px;padding:0 14px;font-size:14px;background:var(--hm-surface);border-color:transparent;white-space:nowrap;scroll-snap-align:start}
.rooms button[aria-pressed=true]{background:var(--hm-accent);color:var(--hm-on-accent)}
.rooms .all{font-weight:600}
.workspace{position:relative;grid-area:workspace;min-width:0}
.viewport{height:var(--hm-viewport-height,clamp(420px,66vh,920px));min-width:0;position:relative;overflow:hidden;background:var(--hm-surface);touch-action:none;outline-offset:-3px;user-select:none;-webkit-user-select:none}
.architecture{position:absolute;inset:0 auto auto 0;transform-origin:0 0;pointer-events:none}
.overlay{position:absolute;inset:0;pointer-events:none}
.room-highlight{position:absolute;border:2px solid var(--hm-accent);border-radius:12px;background:color-mix(in srgb,var(--hm-accent) 7%,transparent);pointer-events:none}
.marker{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;width:44px;height:44px;touch-action:none}
.marker[hidden]{display:none}
.marker .primary{width:44px;height:44px;min-height:44px;border-radius:50%;display:grid;place-items:center;padding:0;background:var(--hm-bg);color:var(--hm-text);font-size:20px;border:1.5px solid var(--hm-line);box-shadow:var(--hm-shadow)}
.marker .primary ha-icon{--mdc-icon-size:22px;color:var(--hm-muted)}
.marker[data-active=true] .primary{background:color-mix(in srgb,var(--hm-active) 22%,var(--hm-bg));border-color:var(--hm-active)}
.marker[data-active=true] .primary ha-icon{color:var(--hm-active)}
.marker .primary:disabled{opacity:.55}
.marker.size-s,.marker.size-s .primary{width:36px;height:36px;min-height:36px}.marker.size-s .primary ha-icon{--mdc-icon-size:18px}
.marker.size-l,.marker.size-l .primary{width:58px;height:58px;min-height:58px}.marker.size-l .primary ha-icon{--mdc-icon-size:30px}
.marker .pins{position:absolute;left:calc(100% + 6px);top:50%;transform:translateY(-50%);display:flex;gap:4px;align-items:center;padding:4px;border-radius:18px;background:var(--hm-bg);border:1px solid var(--hm-line);box-shadow:var(--hm-shadow);white-space:nowrap}
.is-editing .marker .pins{pointer-events:none;opacity:.7}
.sent-note{position:absolute;z-index:6;transform:translate(-50%,calc(-100% - 30px));padding:6px 12px;border-radius:999px;background:var(--hm-text);color:var(--hm-bg);font-size:12px;font-weight:600;white-space:nowrap;pointer-events:none;box-shadow:var(--hm-shadow)}
.sent-note.failed{background:var(--hm-error)}
.state-dot{position:absolute;width:11px;height:11px;border-radius:50%;bottom:1px;right:1px;border:2px solid var(--hm-bg);background:var(--hm-unknown);pointer-events:none}
.marker[data-confidence=confirmed] .state-dot{background:var(--hm-confirmed)}
.marker[data-confidence=estimated] .state-dot{background:var(--hm-estimated)}
.marker[data-confidence=sent] .state-dot{background:var(--hm-sent)}
.marker[data-confidence=error] .state-dot{background:var(--hm-error)}
.marker.selected .primary{box-shadow:0 0 0 3px var(--hm-accent),var(--hm-shadow)}
.marker.editable{cursor:grab}.marker.dragging{cursor:grabbing;z-index:5}
.cluster{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;min-width:44px;height:44px;min-height:44px;border-radius:22px;padding:0 12px;background:var(--hm-surface);color:var(--hm-ink);border:1px solid var(--hm-line);font-weight:700;font-size:15px;box-shadow:var(--hm-shadow);display:flex;align-items:center;gap:4px}
.cluster[data-active=true]{box-shadow:0 0 0 3px var(--hm-active),var(--hm-shadow)}
.zoom{position:absolute;bottom:12px;right:12px;display:flex;flex-direction:column;gap:6px;z-index:3}
.zoom .icon,.layers .icon{background:var(--hm-bg);border:1px solid var(--hm-line);box-shadow:var(--hm-shadow)}
.layers{position:absolute;top:12px;right:12px;display:flex;flex-direction:column;gap:6px;z-index:3}
.layers .icon[aria-pressed=false]{opacity:.55}
.layers .icon[aria-pressed=true]{background:var(--hm-accent);color:var(--hm-on-accent);border-color:var(--hm-accent)}
.placing-hint{position:absolute;left:50%;top:12px;transform:translateX(-50%);background:var(--hm-text);color:var(--hm-bg);padding:8px 14px;border-radius:18px;font-size:13px;z-index:4;pointer-events:none;max-width:calc(100% - 120px);text-align:center}
.editor-wrap{grid-area:edit;border-top:1px solid var(--hm-line);background:var(--hm-bg)}
.editbar{display:flex;gap:8px;align-items:center;padding:10px 12px;flex-wrap:wrap;position:sticky;top:0;background:var(--hm-bg);z-index:2}
.editbar .space{flex:1}
.editbar .save{font-weight:600}
.editbar .save[data-dirty=true]:not(:disabled){background:var(--hm-accent);border-color:var(--hm-accent);color:var(--hm-on-accent)}
.editor{display:block;max-height:55vh;overflow:auto;overscroll-behavior:contain}
.status{grid-area:status;font-size:14px;padding:10px 16px;background:var(--hm-surface);border-top:1px solid var(--hm-line)}
.status:empty{display:none}
.selection{grid-area:selection;font-size:14px;padding:6px 14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.selection:empty{display:none}
dialog{border:1px solid var(--hm-line);border-radius:20px;max-width:min(520px,calc(100vw - 24px));color:var(--hm-text);padding:22px;background:var(--hm-bg)}
dialog::backdrop{background:rgba(10,20,15,.42)}
dialog h2{font-size:19px;margin:0 0 12px}
dialog p{line-height:1.6}
dialog .actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:18px}
dialog .choices{display:grid;gap:8px}
dialog .choices button{text-align:left;display:flex;align-items:center;gap:10px}
.confidence-list{display:grid;grid-template-columns:auto 1fr;gap:8px 16px}
dt{font-weight:600}dd{margin:0}
.empty{position:absolute;inset:0;display:grid;place-items:center;color:var(--hm-muted);padding:30px;text-align:center;pointer-events:none}
.shell:fullscreen{border-radius:0;width:100%;height:100%;overflow:auto}
.shell:fullscreen .viewport{height:calc(100dvh - 120px)}
@media(max-width:650px){
  .header{padding:8px 6px 4px 12px}
  h1{font-size:17px}
  .viewport{height:var(--hm-viewport-height,62dvh);min-height:330px}
  .editbar{padding:8px;gap:6px}
  .editor{max-height:48dvh}
  .status{font-size:13px}
}
@media (prefers-reduced-motion:no-preference){.marker .primary{transition:background .2s,border-color .2s,transform .1s}}
.workspace > .editor{position:absolute;z-index:6;left:16px;top:16px;width:340px;max-width:calc(100% - 24px);max-height:calc(100% - 24px);overflow:auto;border-radius:18px;overscroll-behavior:contain}
.editbar{display:flex;align-items:center;gap:8px;padding:8px 12px}.editbar .space{flex:1}.editbar [data-command=save][data-dirty=true]{color:var(--hm-on-accent);background:var(--hm-accent)}
.is-editing .header [data-command=edit]{display:none}
@media(max-width:650px){.workspace > .editor{top:auto!important;left:0!important;bottom:0;width:100%;max-width:100%;max-height:76%;border-radius:18px 18px 0 0}.workspace > .editor homemanager-editor{width:100%;border-radius:18px 18px 0 0}.editbar{padding:6px;gap:2px}.editbar .hm-icon-button{width:48px;flex-basis:48px}.editbar .space{min-width:0}}

.architecture>.room-highlight{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:0;background:none;overflow:visible}
.marker.dim,.cluster.dim{opacity:.3}
.viewport{background:color-mix(in srgb,var(--hm-ink) 3%,var(--hm-bg))}
.cluster{background:var(--hm-surface);color:var(--hm-ink)}
.marker .primary:has(.symbol-ring[data-tone=cool]) ha-icon{color:var(--hm-cool)}
.activity-history{padding-left:20px;line-height:1.6}.activity-history li{margin:8px 0}.activity-history li[data-tone=alert]{color:var(--hm-alert)}.activity-history li[data-tone=ok]{color:var(--hm-ok)}
.marker .primary{position:relative;overflow:visible;background:var(--hm-surface)}
.symbol-body{display:flex;align-items:center;justify-content:center;gap:4px;color:var(--hm-ink)}
.symbol-ring{position:absolute;inset:-4px;border-radius:50%;pointer-events:none;background:conic-gradient(var(--hm-active) calc(var(--level)*1turn),transparent 0);mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 0)}
.symbol-ring[data-tone=cool]{background:conic-gradient(var(--hm-cool) calc(var(--level)*1turn),transparent 0)}
.marker[data-active=true] .primary{border-color:var(--hm-line);background:var(--hm-surface)}
.marker[data-active=true] .primary ha-icon{color:var(--hm-active)}
.symbol-badge{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:10px;background:var(--hm-alert);color:#fff;border:2px solid var(--hm-surface);font-size:10px;line-height:14px;font-weight:700}
.symbol-badge[data-level=warning]{background:var(--hm-warn)}
.marker[data-alert=critical] .primary{color:var(--hm-alert);box-shadow:0 0 0 3px var(--hm-alert),var(--hm-shadow)}
.marker[data-alert=critical] .primary ha-icon{color:var(--hm-alert)}
.symbol-health{position:absolute;bottom:-3px;right:-3px;width:14px;height:14px;border:2px dashed var(--hm-warn);border-radius:50%;background:var(--hm-surface)}
.symbol-health[data-health=unavailable]{border-style:solid;border-color:var(--hm-unknown)}.symbol-health[data-health=unknown]{border-color:var(--hm-unknown)}
.symbol-health ha-icon{position:absolute;inset:-3px;--mdc-icon-size:16px!important;color:var(--hm-unknown)!important;transform:rotate(-45deg)}
.remote-mark{position:absolute;left:-3px;bottom:-3px;width:14px;height:14px;border:2px solid var(--hm-surface);border-radius:4px;background:var(--hm-brand)}
.symbol-tag{position:absolute;top:calc(100% + 4px);left:50%;transform:translateX(-50%);font-size:10px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;padding:1px 6px;border-radius:7px;background:var(--hm-surface);color:var(--hm-cool)}
.marker[data-archetype=meter] .primary{width:max-content;max-width:150px;height:30px;min-height:30px;min-width:44px;left:50%;transform:translateX(-50%);border-radius:16px;padding:0 10px;font-size:13px;font-weight:600;margin-top:7px}
.marker[data-archetype=infrastructure] .primary{background:transparent;border:0;box-shadow:none}.marker[data-archetype=infrastructure] .symbol-body{width:14px;height:14px;border-radius:50%;background:var(--hm-unknown);border:3px solid var(--hm-surface)}.marker[data-archetype=infrastructure] .symbol-body ha-icon{display:none}
${topBarStyles}${roomRailStyles}${layerStyles}
@media(max-width:1099px){.shell{grid-template-columns:minmax(0,1fr);grid-template-areas:"header" "edit" "workspace" "rooms" "selection" "status"}}
${insightsLayoutStyles}
`;
