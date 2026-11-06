import { uiEscape as e } from './components.js';
import { taskScreen } from './task-screen.js';
import { personName } from '../model/names.js';

/** §10 layouts share the same fields, actions, notices and dialog frame as §6/§11. */
export const rfText = (value: unknown, fallback = ''): string => personName(value, fallback);
/** A display-only cleanup must not rename stored data when another field changes. */
export const rfEditedText = (value: string, original?: string): string =>
  original !== undefined && value === rfText(original) ? original : value;
export const rfWorkspace = (navigation: string, content: string, learning: string, view: string): string =>
  `<div class="rf-workspace" data-page="${e(view)}" data-learning="${!!learning}"><aside class="rf-navigation">${navigation}</aside><main class="rf-detail">${content}</main>${learning ? `<aside class="rf-learning">${learning}</aside>` : ''}</div>`;
export const rfWidgetDialog = (title: string, body: string, footer: string): string =>
  taskScreen(title, `<form>${body}<div class="actions">${footer}</div></form>`, '', 'editor');
export const remoteCell = (column: number, row: number): string =>
  `<div class="cell" style="grid-column:${column};grid-row:${row}" aria-hidden="true"></div>`;
/** How a piece looks (0.13): its colours and shape, checked again here. */
export interface PieceLook {
  bg?: string;
  fg?: string;
  shape?: 'round' | 'square';
  orientation?: 'vertical';
  type?: string;
}
const hex = (value: string | undefined) => (value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '');
export const remoteWidget = (
  widget: { id: string; x: number; y: number; w: number; h: number } & PieceLook,
  attributes: string,
  content: string,
  tools: string,
  inert: boolean,
): string => {
  const bg = hex(widget.bg),
    fg = hex(widget.fg);
  const look = `${bg ? `--ebg:${bg};` : ''}${fg ? `--efg:${fg};` : ''}`;
  const classes = [
    'widget',
    widget.type ? `t-${widget.type}` : '',
    widget.shape ? `shape-${widget.shape}` : '',
    widget.orientation ? 'vertical' : '',
    bg ? 'painted' : '',
    fg ? 'inked' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `<div class="${classes}" data-widget="${e(widget.id)}" style="grid-column:${widget.x + 1}/span ${widget.w};grid-row:${widget.y + 1}/span ${widget.h};${look}"${attributes}><div class="content"${inert ? ' inert' : ''}>${content}</div>${tools}</div>`;
};
/** The grid of a drawn remote: columns from its canvas; cells stay square-ish. */
export const remoteGrid = (columns: number, inner: string): string => {
  const row = columns <= 4 ? 64 : Math.max(26, Math.min(64, Math.floor(400 / columns)));
  const gap = columns <= 6 ? 10 : columns <= 12 ? 6 : 3;
  return `<div class="grid" style="--cols:${columns};--row:${row}px;--gap:${gap}px">${inner}</div>`;
};
/** The remote's body: wide grids get room, up to a large tablet. */
export const remoteBody = (columns: number, classes: string, inner: string): string => {
  const width =
    columns <= 4 ? 440 : Math.min(1100, 36 + columns * Math.max(30, Math.min(74, Math.floor(400 / columns) + 10)));
  return `<div class="${classes}" style="--body-width:${Math.max(440, width)}px">${inner}</div>`;
};
/** A knob: an arc that fills with the step reached. */
export const knobDial = (step: number, steps: number, text: string): string =>
  `<span class="dial" style="--p:${Math.round((Math.max(0, step) / Math.max(1, steps)) * 100)}"><span>${e(text)}</span></span>`;
/** A small line of the last readings; flat while there is only one. */
export function sparkline(values: number[], width = 120, height = 34): string {
  if (values.length < 2)
    return `<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="M0 ${height / 2}H${width}"/></svg>`;
  const low = Math.min(...values),
    high = Math.max(...values),
    span = high - low || 1;
  const points = values.map(
    (value, index) =>
      `${((index / (values.length - 1)) * width).toFixed(1)},${(height - 3 - ((value - low) / span) * (height - 6)).toFixed(1)}`,
  );
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path d="M${points.join('L')}"/></svg>`;
}
export function positionRemoteWidget(element: HTMLElement, box: { x: number; y: number; w: number; h: number }): void {
  element.style.gridColumn = `${box.x + 1}/span ${box.w}`;
  element.style.gridRow = `${box.y + 1}/span ${box.h}`;
}
export const rfManagerStyles = `
:host{display:block;container-type:inline-size}.rf-workspace{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:calc(100dvh - 56px);background:var(--hm-bg);border-top:1px solid var(--hm-line)}.rf-workspace[data-learning=true]{grid-template-columns:280px minmax(0,1fr) 360px}.rf-navigation{padding:16px 12px;border-right:1px solid var(--hm-line);background:var(--hm-surface);display:flex;flex-direction:column;gap:12px;min-width:0}.rf-navigation .tabs{display:flex;gap:2px;padding:3px;border-radius:12px;background:var(--hm-surface-2)}.tabs button{flex:1;border:0;border-radius:9px;background:transparent;color:var(--hm-muted);padding:7px}.tabs button[aria-selected=true]{color:var(--hm-ink);background:var(--hm-surface);box-shadow:var(--hm-shadow)}.rf-navigation .cards{display:grid;border:1px solid var(--hm-line);border-radius:14px;overflow:hidden}.card{display:flex;align-items:center;gap:12px;min-height:66px;padding:12px;border:0;border-radius:0;border-top:1px solid var(--hm-line);text-align:left;justify-content:flex-start}.card:first-child{border-top:0}.card[aria-current=true]{background:color-mix(in srgb,var(--hm-brand) 9%,var(--hm-surface))}.card>ha-icon{--mdc-icon-size:24px;flex:none;color:var(--hm-brand);background:color-mix(in srgb,var(--hm-active) 12%,transparent);border-radius:11px;width:36px;height:36px;padding:6px}.card .info{display:grid;gap:3px;min-width:0}.card .name{font-size:14px;overflow-wrap:anywhere}.rf-navigation>[data-command=new]{color:var(--hm-brand);border:0;background:transparent;justify-content:flex-start}.rf-detail{padding:20px;display:flex;flex-direction:column;gap:16px;min-width:0}.rf-learning{border-left:1px solid var(--hm-line);background:var(--hm-surface);padding:16px;min-width:0}.head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.head .title{display:flex;align-items:center;gap:12px;flex:1;min-width:120px}.head .title>div{display:grid;gap:4px}.head .title>ha-icon{--mdc-icon-size:28px;color:var(--hm-brand)}.notice{display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:12px;background:color-mix(in srgb,var(--hm-brand) 10%,transparent);font-size:14px}.notice p{flex:1}.icons,.types{display:flex;gap:6px;flex-wrap:wrap}.icons button{padding:0;width:40px;height:40px;min-height:40px;border-radius:50%}.icons button[aria-pressed=true],.types button[aria-pressed=true]{border-color:var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 10%,var(--hm-surface));box-shadow:inset 0 0 0 1px var(--hm-brand)}.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.toolbar .muted{flex:1 1 200px}.rf-detail>section{display:grid;gap:12px;border-top:1px solid var(--hm-line);padding-top:16px}.rf-detail>section>h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--hm-muted)}.btn-row{display:grid;grid-template-columns:28px minmax(0,1fr) 140px auto auto;gap:8px;align-items:center}.btn-row>span ha-icon{--mdc-icon-size:22px;color:var(--hm-brand)}.part{display:grid;gap:12px;padding:14px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface)}.part>.row{flex-wrap:nowrap}.part>.row input{flex:1;min-width:0}.part>.row button{padding:0;min-width:40px}.roles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:12px;font-size:12px;font-weight:500;background:color-mix(in srgb,var(--hm-brand) 12%,transparent);color:var(--hm-brand)}details{border:1px solid var(--hm-line);background:var(--hm-surface);border-radius:14px;overflow:hidden}details>summary{display:flex;gap:10px;align-items:center;min-height:44px;padding:12px 14px;cursor:pointer;font-size:14px;font-weight:500}details>summary:before{content:'›';font-size:20px;color:var(--hm-muted)}details[open]>summary:before{transform:rotate(90deg)}.settings{display:grid;gap:12px;padding:0 14px 14px}.slots{display:grid;gap:12px}.slot{display:flex;gap:8px;align-items:end}.slot>label{flex:1}.types button{min-height:36px;font-size:13px}.editor{width:480px}.editor form{display:contents}.editor .type-picker,.editor .slots,.editor form>label,.editor form>.row,.editor form>.muted,.editor .error-text{margin:0 20px 14px}.editor .types{margin:0}.editor .actions{padding:12px 16px;border-top:1px solid var(--hm-line)}
@container(max-width:1099px){.rf-workspace,.rf-workspace[data-learning=true]{grid-template-columns:220px minmax(0,1fr)}.rf-learning{grid-column:2;border-top:1px solid var(--hm-line)}.rf-detail{padding:16px}.btn-row{grid-template-columns:24px minmax(0,1fr) auto auto}.btn-row select{grid-column:2/-1;grid-row:2}}
@container(max-width:650px){.rf-workspace,.rf-workspace[data-learning=true]{display:flex;flex-direction:column;min-height:calc(100dvh - 48px)}.rf-navigation{border-right:0;border-bottom:1px solid var(--hm-line);padding:12px}.rf-workspace[data-page=remote] .rf-navigation .cards,.rf-workspace[data-page=new] .rf-navigation .cards,.rf-workspace[data-page=devices] .rf-navigation .cards{display:none}.rf-navigation>[data-command=new]{display:none}.rf-workspace[data-page=list] .rf-navigation>[data-command=new]{display:flex}.rf-workspace[data-page=new] .rf-navigation>[data-command=new]{display:none}.rf-detail{padding:16px}.rf-learning{padding:16px;border-left:0}.rf-workspace[data-learning=true] .rf-learning{order:2}.rf-workspace[data-learning=true] .rf-detail{order:3}.head{gap:8px}.head .title{flex-basis:calc(100% - 50px)}.icons button{width:44px;height:44px}.roles{grid-template-columns:repeat(2,minmax(0,1fr))}.btn-row{grid-template-columns:24px minmax(0,1fr) auto auto}.types button{min-height:40px}}
`;
export const rfRemoteStyles = (columns: number, row: number, gap: number) => `
:host{display:block}.body{max-width:var(--body-width,440px);width:100%;margin:0 auto;padding:18px;border-radius:28px;background:var(--hm-surface);box-shadow:var(--hm-shadow);border:1px solid var(--hm-line)}.grid{display:grid;grid-template-columns:repeat(var(--cols,${columns}),minmax(0,1fr));grid-auto-rows:var(--row,${row}px);gap:var(--gap,${gap}px);position:relative}.widget{position:relative;display:flex;flex-direction:column;gap:4px;min-width:0;min-height:0;border-radius:16px}.content{display:flex;flex-direction:column;gap:4px;flex:1;min-height:0}.cap{font-size:11px;line-height:14px;color:var(--hm-muted);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.key{flex:1;width:100%;min-height:0;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-weight:500;font-size:14px;padding:4px 6px;overflow:hidden;background:var(--hm-bg)}.key ha-icon{--mdc-icon-size:24px;color:var(--hm-brand)}.key span{max-width:100%;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-height:1.15;text-align:center;overflow-wrap:break-word;hyphens:auto}@media(max-width:480px){.key{padding:4px 2px}.key span{font-size:12px}}.row{display:flex;gap:6px;flex:1;min-height:0}.row button{flex:1 1 0;min-width:0;min-height:0;height:100%;padding:0 4px;border-radius:12px;font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums;background:var(--hm-bg)}.updown{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:6px;flex:1;min-height:0}.updown button{height:100%;min-height:0;font-size:22px;border-radius:12px}.updown .cap{max-width:90px}.sent{background:color-mix(in srgb,var(--hm-sent) 24%,var(--hm-bg))!important;border-color:var(--hm-sent)!important}.failed{border-color:var(--hm-alert)!important}.live{min-height:18px;margin:10px 0 0;font-size:13px;text-align:center;color:var(--hm-muted)}.live.error{color:var(--hm-alert)}.empty{grid-column:1/-1;text-align:center;color:var(--hm-muted);font-size:14px;align-self:center}.cell{border:1px dashed var(--hm-line);border-radius:12px}.editing .widget{outline:2px dashed color-mix(in srgb,var(--hm-brand) 55%,transparent);outline-offset:2px;cursor:grab;touch-action:none;z-index:1}.editing .widget:focus-visible{outline-style:solid;box-shadow:var(--hm-focus)}.editing .content{pointer-events:none}.widget.dragging{opacity:.85;z-index:4;cursor:grabbing}.tools{position:absolute;top:-12px;right:-8px;display:flex;gap:4px;z-index:3}.tools button{min-height:32px;height:32px;width:32px;padding:0;border-radius:50%;box-shadow:var(--hm-shadow);font-size:15px;line-height:1}.tools .remove{color:var(--hm-alert)}.resize{position:absolute;right:-6px;bottom:-6px;width:22px;height:22px;border-radius:7px;background:var(--hm-brand);cursor:nwse-resize;z-index:3;touch-action:none}@media(max-width:650px){.body{padding:12px;border-radius:22px}}
`;
export const rfLearnStyles = `
:host{display:block}.sheet{display:grid;gap:14px}.head{display:flex;align-items:center;gap:10px}.head h3{flex:1;font-size:16px}.head button{width:36px;height:36px;padding:0;border-radius:50%;font-size:0}.listen{display:flex;align-items:center;gap:12px;padding:18px 14px;border-radius:14px;background:color-mix(in srgb,var(--hm-brand) 7%,var(--hm-surface));min-height:100px}.listen .text{flex:1;display:grid;gap:6px}.listen strong{font-size:14px;font-weight:500}.pulse{width:36px;height:36px;border-radius:50%;background:var(--hm-unknown);flex:none;box-shadow:0 0 0 8px color-mix(in srgb,var(--hm-brand) 9%,transparent),0 0 0 16px color-mix(in srgb,var(--hm-brand) 4%,transparent);margin:12px}.pulse.on,.pulse.ok{background:var(--hm-brand)}.pulse.warn{background:var(--hm-warn)}.code{display:grid;gap:14px}.badge{justify-self:start;padding:3px 8px;border-radius:12px;font-size:12px;font-weight:600}.badge.ok{color:var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 12%,transparent)}.badge.warn{color:var(--hm-warn);background:color-mix(in srgb,var(--hm-warn) 12%,transparent)}.chips{display:flex;flex-wrap:wrap;gap:6px}.chips button{min-height:34px;font-size:12px;padding:6px 10px}.chips.icons button{width:36px;padding:0;border-radius:50%}.chips button[aria-pressed=true]{border-color:var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 10%,var(--hm-surface))}.question{display:grid;gap:10px;padding:14px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-bg)}.attempts{font-size:12px;color:var(--hm-muted);padding-left:18px;line-height:1.7}details{border:1px solid var(--hm-line);border-radius:14px;overflow:hidden}summary{min-height:44px;display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;font-size:14px;font-weight:500}summary:before{content:'›';font-size:20px;color:var(--hm-muted)}details[open] summary:before{transform:rotate(90deg)}details>.muted{padding:0 12px 12px}
`;
export const rfDeviceStyles = `
:host{display:block}.wrap{display:grid;gap:14px}.device{border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface);overflow:hidden}.top{padding:14px;display:flex;gap:12px;align-items:center}.top>ha-icon{width:24px;height:24px;color:var(--hm-brand);flex:none}.top .info{flex:1;min-width:0}.name{font-size:14px;font-weight:500}.badge{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:3px 8px;border-radius:12px;color:var(--hm-warn);background:color-mix(in srgb,var(--hm-warn) 12%,transparent)}.badge.ok{color:var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 12%,transparent)}.badge.off{color:var(--hm-muted);background:var(--hm-surface-2)}.device>.row{padding:0 14px 14px}.device button{min-height:36px;padding:6px 12px;font-size:13px}.device button[aria-pressed=true]{color:var(--hm-brand);border-color:var(--hm-brand)}ol{padding:14px 14px 14px 34px;margin:0;display:grid;gap:12px;border-top:1px solid var(--hm-line);font-size:14px;line-height:1.5}pre{margin:10px 0;padding:12px;border-radius:12px;background:var(--hm-bg);overflow:auto;white-space:pre;font-size:12px;line-height:1.6;user-select:all;color:var(--hm-ink)}a.link{color:var(--hm-brand);font-weight:500}.device-options{position:relative}.device-options summary{width:36px;height:36px;display:grid;place-items:center;border-radius:50%;cursor:pointer;list-style:none;font-size:22px}.device-options summary::-webkit-details-marker{display:none}.device-options-body{display:grid;gap:6px;min-width:200px;padding:10px;background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:12px}.probe{margin:0 14px 14px;padding:12px;border-radius:12px;background:var(--hm-bg);font-size:13px}
`;
/** The pieces only this panel has: devices row, new-remote kinds, steps, preview. */
export const rfControlsStyles = `
:host{display:block;height:100%;min-height:0}
.nodes{display:flex;align-items:center;gap:8px;overflow-x:auto;padding-bottom:2px}
.node{position:relative;flex:none;display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-height:0;padding:10px 26px 10px 12px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);text-align:left}
.node b{font-size:13px;font-weight:500}.node .dot{position:absolute;right:10px;top:13px}.node .caps{display:flex;gap:4px}
.kinds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.kind{display:flex;flex-direction:column;align-items:center;gap:6px;min-height:0;padding:12px 6px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);font-size:12.5px;color:var(--hm-muted)}
.kind ha-icon{--mdc-icon-size:28px}
.kind[aria-pressed=true]{border-color:var(--hm-brand);color:var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 10%,var(--hm-surface))}
.seg.big2{display:flex;width:100%}.seg.big2 .ib{flex:1;width:auto;height:44px;display:flex;gap:8px;font-weight:500;font-size:13px}
.row-icon{display:grid;grid-template-columns:24px 1fr;gap:10px;align-items:center;color:var(--hm-muted)}
.stepper{display:flex;align-items:center;gap:4px;margin:0;padding:0;list-style:none}
.stepper .st{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11.5px;color:var(--hm-muted)}
.stepper .st span{display:grid;place-items:center;width:30px;height:30px;border:2px solid var(--hm-line);border-radius:50%;background:var(--hm-surface)}
.stepper .st ha-icon{--mdc-icon-size:16px}
.stepper .st.cur span{border-color:var(--hm-brand);color:var(--hm-brand);box-shadow:0 0 0 4px color-mix(in srgb,var(--hm-brand) 18%,transparent)}
.stepper .st.done span{border-color:var(--hm-brand);background:var(--hm-brand);color:var(--hm-on-accent)}
.stepper .st em{font-style:normal}.stepper .st.cur em{color:var(--hm-ink);font-weight:500}
.stepper .bar{flex:1;height:2px;margin-bottom:18px;background:var(--hm-line)}
.tools{display:flex;align-items:center;gap:2px}
.rprev{padding:12px;border-radius:16px;background:var(--hm-bg)}
.name-in{width:100%;min-height:30px;padding:2px 6px;margin-left:-6px;border:0;border-radius:8px;background:transparent;font-weight:500}
.name-in:hover{background:var(--hm-surface-2)}.name-in:focus{background:var(--hm-surface);box-shadow:0 0 0 2px var(--hm-brand)}
.btn-row .t{flex-direction:row;align-items:center;gap:8px}
.part{display:grid;gap:12px;padding:12px;border:1px solid var(--hm-line);border-radius:14px}
.form-foot{display:flex;align-items:center}
form.settings{display:grid;gap:12px}
`;
/** 0.13 learning: a big ring to tap, waves while it listens, captures as cards. */
export const rfLearnRingStyles = `
.learn{gap:16px}
.learn .listen{display:flex;align-items:center;flex-direction:column;justify-content:center;gap:10px;padding:8px 0 4px;min-height:0;background:transparent;text-align:center}
.learn .listen .text{justify-items:center;gap:2px}.learn .listen strong{font-size:15px}
.ring{position:relative;display:grid;place-items:center;width:150px;height:150px;min-height:150px;padding:0;border:0;border-radius:50%;background:transparent}
.ring:hover:not(:disabled){background:transparent}
.ring .core{position:relative;z-index:1;display:grid;place-items:center;width:76px;height:76px;border-radius:50%;background:color-mix(in srgb,var(--hm-brand) 14%,var(--hm-surface));color:var(--hm-brand);transition:background .2s,color .2s}
.ring .core ha-icon{--mdc-icon-size:34px}
.listen.ok .ring .core{background:var(--hm-brand);color:var(--hm-on-accent)}
.listen.warn .ring .core{background:color-mix(in srgb,var(--hm-warn) 18%,var(--hm-surface));color:var(--hm-warn)}
.ring .waves{position:absolute;inset:0;display:grid;place-items:center}
.ring .waves i{position:absolute;width:76px;height:76px;border:2px solid var(--hm-brand);border-radius:50%;opacity:0}
.ring.on .waves i{animation:hm-wave 2.4s ease-out infinite}
.ring.on .waves i:nth-child(2){animation-delay:.8s}.ring.on .waves i:nth-child(3){animation-delay:1.6s}
@keyframes hm-wave{0%{transform:scale(1);opacity:.55}100%{transform:scale(1.95);opacity:0}}
@media(prefers-reduced-motion:reduce){.ring.on .waves i{animation:none;opacity:.3}}
.modes{justify-self:center}
.row-icon{display:grid;grid-template-columns:24px 1fr;gap:10px;align-items:center;color:var(--hm-muted)}
.target{display:grid;gap:6px}
.learn .next{justify-self:center}
.cap-head{display:flex;align-items:center;gap:10px}
.code{padding:12px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface);animation:hm-pop .35s ease}
@keyframes hm-pop{from{transform:scale(.97);opacity:.4}}
.learn-foot{display:flex;align-items:center;padding-top:6px;border-top:1px solid var(--hm-line)}
.question .row{display:flex;gap:6px}
.name-row{display:flex;align-items:flex-end;gap:10px}.name-row label{flex:1;display:grid;gap:6px;min-width:0}
.signal-details summary{min-height:36px;padding:6px 10px;font-size:13px;font-weight:400;color:var(--hm-muted)}
`;
/** 0.13 IR learning and saved IR remotes, in the Controls panel. */
export const irManagerStyles = `
:host{display:block}
section{display:grid;gap:14px;margin:0 0 16px}
h4,p{margin:0}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px;align-items:end}
label{display:grid;gap:4px;min-width:0;font-size:13px;color:var(--hm-muted)}
input,select{box-sizing:border-box;width:100%;min-width:0;color:var(--hm-ink)}
.tools{display:flex;justify-content:center;gap:4px}
.row{display:flex;align-items:center;gap:8px}
.shelf{display:grid;gap:10px;padding-top:12px;border-top:1px solid var(--hm-line)}
.title{display:flex;align-items:center;gap:8px;color:var(--hm-brand)}
.title h4{color:var(--hm-ink);font-size:15px;font-weight:500}
.item{border:1px solid var(--hm-line);border-radius:12px;padding:10px}
.controls{max-width:560px;margin-inline:auto;width:100%}
.editor{display:grid;gap:8px}.editor form{display:grid;gap:7px}
.danger{color:var(--hm-alert)}
`;
/** 0.13 Test step: rows that send, a thumbs answer, a tuning row, three checks. */
export const rfTestStyles = `
.trow{border-bottom:1px solid var(--hm-line)}.trow:last-child{border-bottom:0}.trow .li{border:0}
.ib.send.pulse{animation:hm-ping 1.2s ease-out}
@keyframes hm-ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--hm-brand) 45%,transparent)}100%{box-shadow:0 0 0 14px transparent}}
.ok-mark{display:grid;place-items:center;width:40px;color:var(--hm-ok)}
.tune{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:0 4px 10px 28px;color:var(--hm-muted)}
.tune .pill{display:inline-flex;align-items:center;gap:2px;padding:0 4px;border:1px solid var(--hm-line);border-radius:999px;color:var(--hm-ink)}
.tune .pill .ib{width:30px;height:30px;min-height:30px}.tune .pill b{display:inline-flex;align-items:center;gap:3px;font-weight:500;font-size:13px}
.checks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.check{display:flex;flex-direction:column;align-items:center;gap:6px;min-height:0;padding:14px 6px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface);font-size:12.5px;color:var(--hm-muted)}
.check ha-icon{--mdc-icon-size:28px;color:var(--hm-brand)}.check b{color:var(--hm-ink);font-weight:500}
`;
/** 0.13 free designer: colours, shapes, knob, preset, chart and upright pieces. */
export const remotePieceStyles = `
.widget.painted .key,.widget.painted .row button,.widget.painted .updown button,.widget.painted .dial{background:var(--ebg)!important;border-color:color-mix(in srgb,var(--ebg) 70%,#000)}
.widget.inked .key,.widget.inked .row button,.widget.inked .updown button,.widget.inked .key ha-icon,.widget.inked .cap,.widget.inked strong{color:var(--efg)!important}
.widget.shape-round .key,.widget.shape-round .row button,.widget.shape-round .updown button{border-radius:999px}
.widget.shape-square .key,.widget.shape-square .row button,.widget.shape-square .updown button{border-radius:4px}
.widget.vertical .updown{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) auto minmax(0,1fr)}
.widget.vertical .row{flex-direction:column}
.widget.vertical input[type=range]{writing-mode:vertical-lr;direction:rtl;width:auto;height:100%;align-self:center}
.knob{flex:1;display:grid;place-items:center;min-height:0;padding:0;border:0;background:transparent}
.dial{display:grid;place-items:center;width:min(100%,90px);aspect-ratio:1;border-radius:50%;background:conic-gradient(var(--hm-brand) calc(var(--p) * 1%),var(--hm-line) 0);box-shadow:inset 0 0 0 9px var(--hm-surface)}
.dial span{font-weight:600;font-size:18px}
.spark{width:100%;height:34px}.spark path{fill:none;stroke:var(--hm-brand);stroke-width:2;vector-effect:non-scaling-stroke}
.t-graph .content,.t-knob .content{align-items:stretch;justify-content:center}
.widget.running .key{animation:hm-preset 1s ease-in-out infinite alternate}
@keyframes hm-preset{to{box-shadow:0 0 0 4px color-mix(in srgb,var(--hm-brand) 35%,transparent)}}
`;
