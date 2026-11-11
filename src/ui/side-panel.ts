import { escapeHTML as e } from '../card/types.js';

/** 0.13 side panel (docs/rediseno/maqueta-0.13): a head with icon buttons, a body that
 * scrolls and an optional foot. Names live in tooltips; nothing explains itself in text. */

const glyph = (name: string) => `<ha-icon icon="${e(name)}" aria-hidden="true"></ha-icon>`;

/** A 40 px icon button: the name is its tooltip and its accessible name. */
export function iconButton(label: string, icon: string, attributes = '', variant = ''): string {
  return `<button type="button" class="ib${variant ? ` ${variant}` : ''}" aria-label="${e(label)}" title="${e(label)}" ${attributes}>${glyph(icon)}</button>`;
}

export function panelHead(title: string, options: { back?: string; extra?: string; close?: string } = {}): string {
  const back = options.back ? iconButton(options.back, 'mdi:arrow-left', 'data-command="back"') : '';
  const close = options.close ? iconButton(options.close, 'mdi:close', 'data-command="close"') : '';
  return `<div class="dh">${back}<h2>${title}</h2>${options.extra ?? ''}${close}</div>`;
}

/** A small label with a hairline, to separate groups without a heading. */
export const panelLabel = (text: string) => `<div class="lbl">${e(text)}<span class="grow"></span></div>`;

/** RF or IR, as a coloured tag. */
export const sourceTag = (source: 'rf' | 'ir') => `<span class="cap ${source}">${source.toUpperCase()}</span>`;

/** A drawing of a signal that is the same for the same button, so buttons are told
 * apart at a glance. It is not the real signal: the technical sheet has that. */
export function miniWave(seed: string, width = 64, height = 18): string {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const random = () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507) >>> 0;
    return (hash % 1000) / 1000;
  };
  let x = 0,
    high = false,
    path = `M0 ${height - 2}`;
  while (x < width) {
    const step = 2 + Math.round(random() * 6);
    x = Math.min(width, x + step);
    path += ` H${x}`;
    high = !high;
    path += ` V${high ? 3 : height - 2}`;
  }
  return `<svg class="wave" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

export const sidePanelStyles = `
.panel{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--hm-surface);color:var(--hm-ink)}
.dh{flex:none;display:flex;align-items:center;gap:6px;min-height:60px;padding:10px 10px 10px 14px;border-bottom:1px solid var(--hm-line)}
.dh h2{flex:1;min-width:0;margin:0;font-size:17px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:8px}
.dbody{flex:1;min-height:0;overflow:auto;padding:14px 16px 24px;display:flex;flex-direction:column;gap:16px}
.dbody>*{flex-shrink:0}
.dfoot{flex:none;display:flex;align-items:center;gap:6px;padding:10px 12px;border-top:1px solid var(--hm-line)}
.grow{flex:1}
.ib{position:relative;flex:none;display:grid;place-items:center;width:40px;height:40px;min-height:40px;padding:0;border:0;border-radius:12px;background:transparent;color:var(--hm-ink)}
.ib:hover:not(:disabled){background:var(--hm-surface-2)}
.ib.on,.ib[aria-pressed=true]{background:color-mix(in srgb,var(--hm-brand) 14%,transparent);color:var(--hm-brand)}
.ib.danger{color:var(--hm-alert)}
.ib.primary{background:var(--hm-brand);color:var(--hm-on-accent)}
.ib.send{background:color-mix(in srgb,var(--hm-brand) 12%,transparent);color:var(--hm-brand)}
.ib ha-icon{--mdc-icon-size:22px}
.lbl{display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:var(--hm-muted)}
.lbl .grow{height:1px;background:var(--hm-line)}
.cap{display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.04em;white-space:nowrap;background:var(--hm-surface-2);color:var(--hm-muted)}
.cap.ir{background:color-mix(in srgb,#B2577F 16%,var(--hm-surface));color:#B2577F}
.cap.rf{background:color-mix(in srgb,var(--hm-cool) 16%,var(--hm-surface));color:var(--hm-cool)}
.cap ha-icon{--mdc-icon-size:14px}
.list{display:flex;flex-direction:column}
.li{display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 4px;border-bottom:1px solid var(--hm-line)}
.li:last-child{border-bottom:0}
.li.open{cursor:pointer;border-radius:10px}.li.open:hover{background:var(--hm-surface-2)}
.li .t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;text-align:left}
.li .t b{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.li .t span{font-size:12.5px;color:var(--hm-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.li .acts{display:flex}.li .acts .ib{width:44px;height:44px;min-height:44px;border-radius:10px}
@media(hover:hover){.li .acts{opacity:0;transition:opacity .15s}.li:hover .acts,.li:focus-within .acts{opacity:1}}
.li button.t{align-items:flex-start;justify-content:center;border:0;background:transparent;padding:0;min-height:40px;border-radius:0;text-align:left;cursor:pointer}.li button.t:hover{background:transparent}
.ico-tile{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--hm-surface-2);color:var(--hm-brand)}
.ico-tile ha-icon{--mdc-icon-size:22px}
.dot{flex:none;width:10px;height:10px;border-radius:50%;background:var(--c,var(--hm-muted))}.dot.ok{--c:var(--hm-ok)}.dot.warn{--c:var(--hm-warn)}.dot.alert{--c:var(--hm-alert)}
.wave{flex:none;color:var(--hm-brand);opacity:.75}
.seg{display:inline-flex;gap:2px;padding:3px;border-radius:12px;background:var(--hm-surface-2)}
.seg .ib{width:38px;height:36px;min-height:36px;border-radius:9px}
.seg .ib.on,.seg .ib[aria-pressed=true]{background:var(--hm-surface);color:var(--hm-brand);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:4px 12px;border:1px solid var(--hm-line);border-radius:999px;background:var(--hm-surface);font-size:13px;white-space:nowrap}
.chip ha-icon{--mdc-icon-size:16px}
.chip.pick,.chip[aria-pressed=true]{border-color:var(--hm-brand);color:var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 10%,var(--hm-surface))}
.next{display:inline-flex;align-items:center;gap:8px;height:42px;min-height:42px;padding:0 18px;border:0;border-radius:12px;background:var(--hm-brand);color:var(--hm-on-accent);font-weight:500}
.next:disabled{opacity:.4}
.next ha-icon{--mdc-icon-size:18px}
.title-in{width:100%;min-height:40px;padding:2px 8px;margin-left:-8px;border:0;border-bottom:1.5px dashed var(--hm-line);border-radius:8px 8px 0 0;background:transparent;font-size:18px;font-weight:500;color:var(--hm-ink)}.title-in:focus{border-bottom-color:var(--hm-brand)}
.title-in:hover{background:var(--hm-surface-2)}.title-in:focus{background:var(--hm-surface);box-shadow:0 0 0 2px var(--hm-brand)}
.status{min-height:0;margin:0;font-size:13px;color:var(--hm-muted)}.status:empty{display:none}.status.error{color:var(--hm-alert)}
.empty-state{display:grid;justify-items:center;gap:8px;padding:28px 12px;color:var(--hm-muted);text-align:center}
.empty-state ha-icon{--mdc-icon-size:36px;color:var(--hm-brand)}
`;
