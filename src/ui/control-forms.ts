import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { personName } from '../model/names.js';
import { levelCount, levelText, type ControlPiece } from '../model/control-layout.js';

/** 0.14 forms of a piece: the same type (what it does), drawn another way. They only add markup:
 * whoever draws them keeps the state and sends, as with every other piece (data-op says what a tap does).
 * Kept apart from remote-keys.ts so the forms of 0.13 stay exactly as they were. */
export interface FormContext {
  name(ref: string): string;
  icon(ref: string): string | null;
  level(piece: ControlPiece): number;
  on(piece: ControlPiece): boolean;
  option(piece: ControlPiece): number;
  reading(piece: ControlPiece): { value: string; unit: string };
}

const text = (value: unknown, fallback = '') => personName(value, fallback);
const icon = (name: string | null | undefined): string =>
  name && /^mdi:[a-z0-9-]+$/.test(name) ? `<ha-icon icon="${name}" aria-hidden="true"></ha-icon>` : '';
const HEX = /^#[0-9a-fA-F]{6}$/;
/** A symbol that moves (chosen in the designer), while on or always. */
export const moving = (piece: ControlPiece, html: string, on: boolean): string =>
  piece.symAnim && html
    ? `<span class="sa an-${piece.symAnim}${piece.symWhen === 'always' || on ? ' go' : ''}">${html}</span>`
    : html;

function thermo(piece: ControlPiece, ctx: FormContext): string {
  const count = levelCount(piece),
    index = ctx.level(piece);
  const pct = count > 1 && index >= 0 ? index / (count - 1) : 0;
  const a0 = 150,
    span = 240,
    ang = a0 + pct * span;
  const W = 200,
    H = 150,
    cx = W / 2,
    cy = H * 0.54,
    r = 58;
  const P = (a: number, rr: number) => [
    cx + rr * Math.cos((a * Math.PI) / 180),
    cy + rr * Math.sin((a * Math.PI) / 180),
  ];
  const arc = (from: number, to: number) => {
    const [x1, y1] = P(from, r),
      [x2, y2] = P(to, r);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const ticks = Array.from({ length: 25 }, (_, i) => {
    const a = a0 + (i * span) / 24,
      [x1, y1] = P(a, r + 9),
      [x2, y2] = P(a, r + (i % 4 ? 12 : 15));
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${a <= ang && index >= 0 ? 'lit' : ''}"/>`;
  }).join('');
  const [kx, ky] = P(ang, r);
  const value = index >= 0 ? levelText(piece, index) : '–';
  const room = piece.reading ? ctx.reading(piece) : null;
  const name = text(piece.label ?? t('Temperatura'));
  return `<div class="fthermo">
    <svg viewBox="0 0 ${W} ${H}" data-op="ring" role="slider" aria-label="${e(name)}" aria-valuetext="${e(value)}" tabindex="0">
      <circle cx="${cx}" cy="${cy}" r="${r - 14}" class="glow"/>${ticks}
      <path d="${arc(a0, a0 + span)}" class="trk"/>${pct > 0.004 ? `<path d="${arc(a0, ang)}" class="fil"/>` : ''}
      <circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="9" class="knb"/>
    </svg>
    <div class="tmid"><small>${e(name)}</small><b>${e(value)}</b>${room && room.value !== '–' ? `<span class="troom">▲ ${e(room.value)}${e(room.unit)}</span>` : ''}</div>
    <button type="button" class="kpart tl" data-op="dec" aria-label="${e(t('Bajar {name}', { name }))}">${icon('mdi:minus')}</button>
    <button type="button" class="kpart tr" data-op="inc" aria-label="${e(t('Subir {name}', { name }))}">${icon('mdi:plus')}</button>
  </div>`;
}

function bars(piece: ControlPiece, ctx: FormContext): string {
  const modes = piece.type === 'modes';
  const count = modes ? piece.buttons.length : levelCount(piece);
  const index = modes ? ctx.option(piece) : ctx.level(piece);
  const label = (j: number) =>
    modes ? (piece.options?.[j]?.label ?? ctx.name(piece.buttons[j])) : levelText(piece, j);
  const name = text(piece.label ?? t('Nivel'));
  const op = modes ? 'mode' : 'set';
  const lead = moving(piece, icon(piece.icon ?? (modes ? 'mdi:format-list-bulleted' : 'mdi:fan')), index > 0);
  return `<div class="fbars" role="group" aria-label="${e(name)}">${lead ? `<span class="blead">${lead}</span>` : ''}<div class="bset">${Array.from({ length: count }, (_, j) => `<button type="button" data-op="${op}" data-v="${j}" aria-pressed="${j === index}" aria-label="${e(text(label(j)))}" title="${e(text(label(j)))}" class="${j <= index ? 'on' : ''}" style="height:${30 + ((j + 1) / Math.max(1, count)) * 70}%"></button>`).join('')}</div><b class="bval">${e(index >= 0 ? text(label(index)) : '–')}</b></div>`;
}

function segment(piece: ControlPiece, ctx: FormContext): string {
  const chosen = ctx.option(piece),
    n = piece.buttons.length;
  const opt = (j: number) => ({
    label: piece.options?.[j]?.label ?? ctx.name(piece.buttons[j]),
    icon: piece.options?.[j]?.icon ?? ctx.icon(piece.buttons[j]),
    color: piece.options?.[j]?.color,
    anim: piece.options?.[j]?.anim,
  });
  const cur = chosen >= 0 ? opt(chosen) : null;
  const ind =
    chosen >= 0
      ? `<i class="sind" style="left:${(chosen * 100) / n}%;width:${100 / n}%;${cur?.color && HEX.test(cur.color) ? `background:${cur.color}` : ''}"></i>`
      : '';
  return `<div class="fseg" role="group" aria-label="${e(text(piece.label ?? t('Modo')))}"><div class="sin">${ind}${piece.buttons
    .map((_, j) => {
      const o = opt(j);
      const ic = piece.hideIcon ? '' : icon(o.icon);
      return `<button type="button" data-op="mode" data-v="${j}" aria-pressed="${j === chosen}" aria-label="${e(text(o.label))}" title="${e(text(o.label))}" class="${j === chosen && o.color ? 'tint' : ''}">${ic ? `<span class="sa${o.anim ? ` an-${o.anim}${j === chosen ? ' go' : ''}` : ''}">${ic}</span>` : ''}${piece.hideLabel && ic ? '' : `<span class="kt">${e(text(o.label))}</span>`}</button>`;
    })
    .join('')}</div></div>`;
}

function windowForm(piece: ControlPiece, ctx: FormContext): string {
  const count = levelCount(piece),
    index = ctx.level(piece);
  const open = count > 1 && index >= 0 ? index / (count - 1) : 0,
    cov = 1 - open;
  const kind = piece.win ?? 'roller',
    side = piece.winSide === 'r' ? 'r' : 'l';
  const lateral = kind === 'vertical' || kind === 'curtains' || kind === 'curtain';
  const axis = kind === 'curtains' ? 'c' : lateral ? (side === 'r' ? 'h' : 'hr') : 'top';
  const cover =
    kind === 'roller'
      ? `<span class="wsh roller" style="height:${cov * 100}%"><i class="wrail"></i></span>`
      : kind === 'venetian'
        ? `<span class="wsh venetian" style="height:${cov * 100}%"><i class="wrail"></i></span>`
        : kind === 'vertical'
          ? `<span class="wvert ${side}" style="width:${Math.max(6, cov * 100)}%"></span>`
          : kind === 'curtains'
            ? `<span class="wpan l" style="width:${Math.max(5, cov * 50)}%"></span><span class="wpan r" style="width:${Math.max(5, cov * 50)}%"></span>`
            : `<span class="wpan one ${side}" style="width:${Math.max(7, cov * 100)}%"></span>`;
  const value = index >= 0 ? levelText(piece, index) : '–';
  return `<div class="fwin" data-op="track" data-axis="${axis}" role="slider" tabindex="0" aria-label="${e(text(piece.label ?? t('Posición')))}" aria-valuetext="${e(value)}"><span class="win"><span class="sky"><i class="sun"></i><i class="cloud"></i><i class="bird"></i></span><i class="bar v"></i><i class="bar h"></i>${cover}${lateral ? '<i class="rod"></i>' : ''}</span><b class="wval">${e(value)}</b></div>`;
}

function display(piece: ControlPiece, ctx: FormContext): string {
  const { value, unit } = ctx.reading(piece);
  if (piece.form === 'gauge') {
    const n = Number.parseFloat(value);
    return `<div class="fgauge" style="--p:${Number.isFinite(n) ? Math.max(0, Math.min(100, n)) * 0.75 : 0}"><span class="gin"><b>${e(value)}</b><small>${e(unit)}</small>${piece.label ? `<span>${e(text(piece.label))}</span>` : ''}</span></div>`;
  }
  return `<div class="fdisp${piece.form === 'big' ? ' big' : ''}"><small>${piece.hideIcon ? '' : icon(piece.icon)}${e(text(piece.label ?? ''))}</small><b>${e(value)}<em>${e(unit)}</em></b></div>`;
}

/** The content of a piece with a 0.14 form, or null to draw it as before. */
export function formContent(piece: ControlPiece, ctx: FormContext, plain: (p: ControlPiece) => string): string | null {
  switch (piece.form) {
    case 'thermo':
      return thermo(piece, ctx);
    case 'bars':
      return bars(piece, ctx);
    case 'segment':
      return segment(piece, ctx);
    case 'window':
      return windowForm(piece, ctx);
    case 'display':
    case 'big':
    case 'gauge':
      return piece.type === 'indicator' ? display(piece, ctx) : null;
    case 'switch': {
      const on = ctx.on(piece);
      const label = piece.label ?? (piece.buttons[0] ? ctx.name(piece.buttons[0]) : '');
      return `<button type="button" class="kface fsw" data-op="toggle" aria-pressed="${on}" aria-label="${e(text(label))}">${moving(piece, icon(piece.icon ?? (piece.buttons[0] ? ctx.icon(piece.buttons[0]) : null) ?? 'mdi:power'), on)}${piece.hideLabel ? '' : `<span class="kt">${e(text(label))}</span>`}<i class="swt${on ? ' on' : ''}"><i></i></i></button>`;
    }
    case 'pop': {
      const label = text(piece.label ?? t('Más opciones'));
      return `<div class="fpop"><button type="button" class="kface popk" data-op="pop" aria-label="${e(label)}" title="${e(label)}">${piece.type === 'numpad' ? '<b>123</b>' : icon(piece.icon ?? 'mdi:dots-horizontal')}</button><div class="popc" role="group" aria-label="${e(label)}">${plain({ ...piece, form: undefined })}</div></div>`;
    }
    default:
      return null;
  }
}

/** Six button styles, the 0.14 forms and the movements of a symbol. */
export const formStyles = `
.k.st-normal{--rkey:var(--hm-bg);--rfg:var(--hm-ink);--racc:var(--hm-brand);--rsub:var(--hm-muted)}
:is(.body,.k,.cstyle).st-digital{--rbody:repeating-linear-gradient(0deg,rgba(63,224,208,.05) 0 1px,transparent 1px 4px),#070b0c;--rkey:#0b1416;--rfg:#7df9ea;--racc:#3fe0d0;--rsub:#4fb8ae;font-family:'Share Tech Mono',ui-monospace,Consolas,monospace}
:is(.st-digital .k:not([class*=" st-"]),.k.st-digital){box-shadow:inset 0 0 0 1px rgba(63,224,208,.55),0 0 10px rgba(63,224,208,.18)!important;text-shadow:0 0 6px rgba(125,249,234,.5)}
:is(.st-digital .k:not([class*=" st-"]),.k.st-digital).on{--kfg:#04201d}
:is(.body,.k,.cstyle).st-retro{--rbody:linear-gradient(#eadfc4,#d2c29c);--rkey:#f3ead4;--rfg:#4a3524;--racc:#c8552b;--rsub:#8c6e4a;font-family:'Trebuchet MS','Segoe UI',sans-serif}
:is(.st-retro .k:not([class*=" st-"]),.k.st-retro).raised{box-shadow:0 4px 0 #a8956c,0 6px 8px rgba(0,0,0,.2)!important}
:is(.body,.k,.cstyle).st-color{--rbody:linear-gradient(160deg,#fff7ee,#f1f5ff);--rkey:var(--racc);--rfg:#1f2a24;--racc:#4f7a5a;--rsub:#5f6e66}
:is(.st-color .k:not([class*=" st-"]),.k.st-color):not(.kinfo){--kfg:#fff;--rsub:rgba(255,255,255,.78)}
:is(.st-color .k:not([class*=" st-"]),.k.st-color).raised{box-shadow:0 4px 10px color-mix(in srgb,var(--kbg) 40%,transparent)!important}
:is(.st-color .k:not([class*=" st-"]),.k.st-color).on{--kbg:#1f2a24}
:is(.body,.k,.cstyle).st-glass{--rbody:linear-gradient(135deg,#7f9cf5,#b794f4 55%,#f6ad55);--rkey:rgba(255,255,255,.22);--rfg:#fff;--racc:rgba(255,255,255,.92);--rsub:rgba(255,255,255,.82)}
:is(.st-glass .k:not([class*=" st-"]),.k.st-glass){backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 6px 16px rgba(20,30,60,.22)!important}
:is(.st-glass .k:not([class*=" st-"]),.k.st-glass).on{--kfg:#3a4a7a}
:is(.body,.k,.cstyle).st-futurista{--rbody:radial-gradient(120% 90% at 20% 0%,#24305e,#0b0f22 70%);--rkey:linear-gradient(160deg,#1a2147,#121733);--rfg:#e8ecff;--racc:#7b8cff;--rsub:#9aa6dd}
:is(.st-futurista .k:not([class*=" st-"]),.k.st-futurista){box-shadow:inset 0 0 0 1px rgba(123,140,255,.45),0 0 14px rgba(123,140,255,.18)!important}
:is(.st-futurista .k:not([class*=" st-"]),.k.st-futurista).on{--kbg:linear-gradient(135deg,#5b6cff,#a46bff);--kfg:#fff}
.k.f-round{--rad:999px}.k.f-round .kt,.k.f-icon .kt{display:none}
.k.f-icon{background:transparent!important;box-shadow:none!important}
.k.f-pill{--rad:999px}.k.f-pill .kface{justify-content:flex-start;padding:0 14px}
.k.f-lamp{--rad:999px}.k.f-lamp .kface{flex-direction:column;gap:2px}.k.f-lamp.on{box-shadow:0 0 0 4px color-mix(in srgb,var(--kon) 28%,transparent),0 0 18px color-mix(in srgb,var(--kon) 45%,transparent)!important}
.fsw{justify-content:space-between!important;padding:0 8px 0 12px!important}
.swt{position:relative;width:42px;height:24px;border-radius:99px;background:color-mix(in srgb,var(--kfg) 22%,transparent);flex:none;transition:background .2s}
.swt i{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:left .2s}
.swt.on{background:var(--kon)}.swt.on i{left:21px}
.fthermo{flex:1;position:relative;min-width:0;min-height:0}
.fthermo svg{position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none}
.fthermo .glow{fill:var(--kon);opacity:.06}.fthermo line{stroke:var(--rsub,currentColor);stroke-width:1.5;opacity:.6}.fthermo line.lit{stroke:var(--kon);opacity:1}
.fthermo .trk{fill:none;stroke:color-mix(in srgb,var(--kfg) 16%,transparent);stroke-width:9;stroke-linecap:round}
.fthermo .fil{fill:none;stroke:var(--kon);stroke-width:9;stroke-linecap:round;filter:drop-shadow(0 0 4px color-mix(in srgb,var(--kon) 55%,transparent))}
.fthermo .knb{fill:#fff;stroke:var(--kon);stroke-width:3;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
.tmid{position:absolute;left:0;right:0;top:30%;display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none}
.tmid small{font-size:11px;color:var(--rsub)}.tmid b{font-size:clamp(24px,13cqi,46px);font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.troom{font-size:11px;color:var(--rsub)}
.fthermo .kpart{position:absolute;bottom:4px;width:34px;height:34px;border-radius:50%;background:color-mix(in srgb,var(--kfg) 10%,transparent)}
.fthermo .tl{left:6px}.fthermo .tr{right:6px}
.fbars{flex:1;display:flex;align-items:center;gap:8px;padding:6px 10px;min-width:0}
.blead{display:grid;place-items:center;flex:none}
.bset{flex:1;align-self:stretch;margin:4px 0;display:flex;align-items:flex-end;justify-content:center;gap:5px;min-width:0}
.bset button{flex:1 1 0;max-width:24px;border-radius:4px!important;background:color-mix(in srgb,var(--kfg) 16%,transparent)!important;transition:height .2s,background .25s}
.bset button.on{background:var(--kon)!important}.bset button[aria-pressed=true]{box-shadow:0 0 0 3px color-mix(in srgb,var(--kon) 30%,transparent)!important}
.bval{flex:none;font-size:12px;white-space:nowrap}
.fseg{flex:1;display:flex;align-items:center;padding:4px;min-width:0}
.sin{position:relative;flex:1;display:flex;align-self:stretch;min-width:0;border-radius:999px;background:color-mix(in srgb,var(--kfg) 8%,transparent)}
.sind{position:absolute;top:0;bottom:0;border-radius:999px;background:var(--kon);box-shadow:0 2px 6px rgba(0,0,0,.22);transition:left .38s cubic-bezier(.3,1.35,.5,1),background .3s}
.fseg button{position:relative;z-index:1;flex:1 1 0;display:flex;align-items:center;justify-content:center;gap:4px;min-width:0;color:color-mix(in srgb,var(--kfg) 70%,transparent)}
.fseg button[aria-pressed=true]{color:#fff}.fseg button .kt{max-width:100%}
.fwin{flex:1;position:relative;cursor:ns-resize;touch-action:none;min-width:0;min-height:0}
.fwin .win{position:absolute;inset:8px;border-radius:calc(var(--rad,14px) - 6px);overflow:hidden}
.fwin .sky{position:absolute;inset:0;background:linear-gradient(#8dbfea,#dcebf7)}
.fwin .sun{position:absolute;right:18%;top:15%;width:22px;height:22px;border-radius:50%;background:#ffd36b;box-shadow:0 0 18px #ffd36b}
.fwin .cloud{position:absolute;top:24%;left:-30%;width:42px;height:12px;border-radius:10px;background:rgba(255,255,255,.9);box-shadow:13px -6px 0 1px rgba(255,255,255,.9);animation:hm-cloud 46s linear infinite}
.fwin .bird{position:absolute;top:38%;left:-14%;width:15px;height:7px;animation:hm-bird 19s linear 2s infinite}
.fwin .bird:before,.fwin .bird:after{content:'';position:absolute;top:0;width:8px;height:6px;border-top:1.6px solid #34434d;border-radius:50% 50% 0 0}.fwin .bird:before{left:0}.fwin .bird:after{right:0}
.fwin .bar{position:absolute;background:var(--kbg);z-index:1}.fwin .bar.v{left:50%;top:0;bottom:0;width:5px;margin-left:-2.5px}.fwin .bar.h{top:46%;left:0;right:0;height:5px}
.fwin .wsh{position:absolute;left:0;right:0;top:0;z-index:2;transition:height .28s ease-out}
.fwin .wsh.roller{background:linear-gradient(color-mix(in srgb,var(--kon) 52%,#fff),color-mix(in srgb,var(--kon) 66%,#fff));box-shadow:0 3px 7px rgba(0,0,0,.26)}
.fwin .wsh.venetian{background:repeating-linear-gradient(180deg,color-mix(in srgb,var(--kon) 62%,#fff) 0 7px,color-mix(in srgb,var(--kon) 80%,#000) 7px 8px,transparent 8px 11px)}
.fwin .wrail{position:absolute;left:0;right:0;bottom:0;height:7px;background:color-mix(in srgb,var(--kon) 55%,#000)}
.fwin .wvert{position:absolute;top:6px;bottom:0;z-index:2;background:repeating-linear-gradient(90deg,color-mix(in srgb,var(--kon) 58%,#fff) 0 10px,color-mix(in srgb,var(--kon) 76%,#000) 10px 11px);transition:width .28s ease-out}
.fwin .wvert.l{left:0}.fwin .wvert.r{right:0}
.fwin .wpan{position:absolute;top:6px;bottom:0;z-index:2;background:repeating-linear-gradient(90deg,color-mix(in srgb,var(--kon) 52%,#fff) 0 6px,color-mix(in srgb,var(--kon) 68%,#fff) 6px 11px,color-mix(in srgb,var(--kon) 52%,#fff) 11px 15px);box-shadow:0 0 9px rgba(0,0,0,.26);transition:width .28s ease-out}
.fwin .wpan.l{left:0}.fwin .wpan.r{right:0}
.fwin .rod{position:absolute;top:2px;left:0;right:0;height:4px;z-index:3;background:#6b5a48;border-radius:2px}
.fwin .wval{position:absolute;right:14px;bottom:12px;z-index:3;padding:2px 9px;border-radius:999px;background:rgba(0,0,0,.45);color:#fff;font-size:13px;pointer-events:none}
.fdisp{flex:1;display:grid;align-content:center;padding:4px 12px;gap:1px;min-width:0}
.fdisp small{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--rsub)}.fdisp b{font-size:var(--vsz,24px);font-weight:600;line-height:1.05;font-variant-numeric:tabular-nums}
.fdisp em{font-style:normal;font-size:.5em;color:var(--rsub);margin-left:3px}.fdisp.big b{font-size:var(--vsz,40px)}
.fgauge{flex:1;position:relative;display:grid;place-items:center;container-type:size;min-width:0;min-height:0}
.fgauge:before{content:'';position:absolute;width:min(88cqw,88cqh);aspect-ratio:1;border-radius:50%;background:conic-gradient(from 225deg,var(--kon) calc(var(--p) * 1%),color-mix(in srgb,var(--kfg) 15%,transparent) 0 75%,transparent 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 10px),#000 calc(100% - 9px));mask:radial-gradient(farthest-side,transparent calc(100% - 10px),#000 calc(100% - 9px))}
.gin{position:relative;width:min(68cqw,68cqh);aspect-ratio:1;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center}
.gin b{font-size:18px}.gin small,.gin span{font-size:10px;color:var(--rsub)}
.fpop{flex:1;position:relative;display:flex}
.popc{display:none;position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);z-index:20;width:max(100%,190px);min-height:150px;padding:6px;border-radius:16px;background:var(--rbody,#2b322e);box-shadow:0 14px 34px rgba(0,0,0,.42)}
.widget.popopen{overflow:visible;z-index:30}.widget.popopen .content{overflow:visible}.widget.popopen .popc{display:flex}
.popk b{font-size:15px;letter-spacing:.04em}
.sa{display:inline-flex}.sa ha-icon{display:block}
.sa.go.an-spin ha-icon{animation:hm-spin 1.3s linear infinite}.sa.go.an-spinslow ha-icon{animation:hm-spin 7s linear infinite}
.sa.go.an-flicker ha-icon{transform-origin:50% 90%;animation:hm-flick 1.1s ease-in-out infinite}.sa.go.an-bob ha-icon{animation:hm-bob 1.6s ease-in-out infinite}
.sa.go.an-pulse ha-icon{animation:hm-pulse 1.8s ease-in-out infinite}.sa.go.an-rock ha-icon{animation:hm-rock 3s ease-in-out infinite}
@keyframes hm-spin{to{transform:rotate(360deg)}}@keyframes hm-flick{0%,100%{transform:scale(1,1)}30%{transform:scale(.94,1.12)}60%{transform:scale(1.05,.95)}}
@keyframes hm-bob{50%{transform:translateY(2px)}}@keyframes hm-pulse{50%{opacity:.55;transform:scale(.9)}}@keyframes hm-rock{50%{transform:rotate(-14deg)}}
@keyframes hm-cloud{to{left:110%}}@keyframes hm-bird{0%{left:-14%;top:38%}50%{top:30%}100%{left:112%;top:34%}}
@media(prefers-reduced-motion:reduce){.sa.go ha-icon,.fwin .cloud,.fwin .bird,.sind{animation:none!important;transition:none!important}}
`;
