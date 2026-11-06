import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { personName } from '../model/names.js';
import {
  BLOCK_SLOTS,
  LEVEL_TYPES,
  isBlock,
  levelCount,
  levelText,
  type ControlPiece,
  type RemoteTheme,
} from '../model/control-layout.js';
import { brandInitials, brandOf } from './brands.js';

/** One element of a designed control, drawn the same way everywhere (0.13): in the
 * designer, in the control in use and pinned to a symbol of the plan. It is only
 * markup: whoever draws it keeps the state and sends (data-op says what a tap does). */

export interface KeyContext {
  /** Name and icon of a learned button (or an action of the plan). */
  name(ref: string): string;
  icon(ref: string): string | null;
  /** The level reached (-1 when nothing is known yet). */
  level(piece: ControlPiece): number;
  on(piece: ControlPiece): boolean;
  /** The option chosen (-1 when nothing is known yet). */
  option(piece: ControlPiece): number;
  reading(piece: ControlPiece): { value: string; unit: string };
  samples(piece: ControlPiece): number[];
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (value: string | undefined) => (value && HEX.test(value) ? value : '');
const text = (value: unknown, fallback = '') => personName(value, fallback);
export const glyph = (name: string | null | undefined): string =>
  name && /^mdi:[a-z0-9-]+$/.test(name) ? `<ha-icon icon="${name}" aria-hidden="true"></ha-icon>` : '';

/** The mark of a brand key: its icon, or its initials on its colour. */
export function brandMark(name: string, inKey = false): string {
  const brand = brandOf(name);
  const mark = brand?.[1] ? glyph(brand[1]) : `<b>${e(brandInitials(name))}</b>`;
  return `<span class="brandmark${inKey ? ' inkey' : ''}" style="--bc:${brand?.[2] ?? '#5f6e66'}" aria-hidden="true">${mark}</span>`;
}

/** Corner radius in pixels; old pieces said round or square. */
export function radiusOf(piece: ControlPiece): number {
  if (typeof piece.radius === 'number') return piece.radius;
  return piece.shape === 'round' ? 999 : piece.shape === 'square' ? 4 : LEVEL_TYPES.includes(piece.type) ? 14 : 14;
}

/** The look of a piece as CSS variables, read by the stylesheet below. */
export function keyVars(piece: ControlPiece): string {
  const vars: string[] = [];
  const brand = piece.brand ? brandOf(piece.brand) : undefined;
  const bg = color(piece.bg) || (piece.brand ? (brand?.[2] ?? '#5f6e66') : '');
  const fg = color(piece.fg) || (piece.brand ? '#FFFFFF' : '');
  if (bg) vars.push(`--kbg:${bg}`);
  if (fg) vars.push(`--kfg:${fg}`);
  if (color(piece.border)) vars.push(`--kbd:${piece.border}`);
  if (color(piece.active)) vars.push(`--kon:${piece.active}`);
  if (piece.fontSize) vars.push(`--fs:${piece.fontSize}px`);
  if (piece.fontWeight) vars.push(`--fw:${piece.fontWeight}`);
  if (piece.iconSize) vars.push(`--isz:${piece.iconSize}px`);
  if (piece.valueSize) vars.push(`--vsz:${piece.valueSize}px`);
  const radius = radiusOf(piece);
  vars.push(`--rad:${radius >= 999 ? '999px' : `${radius}px`}`);
  return vars.join(';');
}

export function keyClasses(piece: ControlPiece, on: boolean): string {
  const info = ['indicator', 'graph', 'title', 'separator'].includes(piece.type);
  return [
    'k',
    `t-${piece.type}`,
    info ? 'kinfo' : (piece.relief ?? 'raised'),
    on ? 'on' : '',
    color(piece.border) ? 'bd' : '',
    piece.orientation === 'vertical' ? 'vertical' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** What the face of a key shows: icon, text or both (what the designer hides is gone). */
function face(piece: ControlPiece, iconHtml: string, label: string): string {
  const icon = piece.hideIcon ? '' : iconHtml;
  const words = piece.hideLabel || !label ? '' : `<span class="kt">${e(text(label))}</span>`;
  return icon + words || `<span class="kt">${e(text(label || '·'))}</span>`;
}

const part = (op: string, icon: string, label: string, disabled = false) =>
  `<button type="button" class="kpart" data-op="${op}" aria-label="${e(label)}" title="${e(label)}"${disabled ? ' disabled' : ''}>${glyph(icon)}</button>`;

/** The middle of a level piece: its value, its name, dots or its own text. */
function middle(piece: ControlPiece, index: number, count: number): string {
  const named = !!(piece.names || piece.values);
  const display = piece.display ?? (named ? 'value' : 'text');
  if (display === 'text' || display === 'list' || !named)
    return `<span class="kt">${e(text(piece.label ?? ''))}</span>`;
  if (display === 'dots')
    return `<span class="kdots">${Array.from({ length: Math.min(8, count) }, (_, j) => `<i class="${j <= Math.round((index / Math.max(1, count - 1)) * (Math.min(8, count) - 1)) && index >= 0 ? 'on' : ''}"></i>`).join('')}</span>`;
  const value = index >= 0 ? levelText(piece, index) : '–';
  const caption = piece.label && !piece.hideLabel ? `<small class="ksub">${e(text(piece.label))}</small>` : '';
  return `<b class="kval">${e(value)}</b>${caption}`;
}

/** The inside of a piece (the box around it is the caller's). */
export function keyContent(piece: ControlPiece, ctx: KeyContext): string {
  const refs = piece.buttons;
  const label = piece.label ?? (refs[0] ? ctx.name(refs[0]) : '');
  const iconOf = (ref?: string) => piece.icon ?? (ref ? ctx.icon(ref) : null);
  switch (piece.type) {
    case 'button':
    case 'control': {
      const mark = piece.brand ? brandMark(piece.brand, true) : glyph(iconOf(refs[0]) ?? 'mdi:gesture-tap');
      return `<button type="button" class="kface" data-op="press" aria-label="${e(text(label))}">${face(piece, mark, label)}</button>`;
    }
    case 'toggle': {
      const on = ctx.on(piece);
      return `<button type="button" class="kface" data-op="toggle" aria-pressed="${on}" aria-label="${e(text(label))}">${face(piece, glyph(iconOf(refs[0]) ?? 'mdi:power'), label)}</button>`;
    }
    case 'preset':
      return `<button type="button" class="kface" data-op="preset" aria-label="${e(text(piece.label ?? t('Secuencia')))}">${face(piece, glyph(piece.icon ?? 'mdi:playlist-play'), piece.label ?? t('Secuencia'))}</button>`;
    case 'updown':
    case 'slider':
    case 'steps':
    case 'knob': {
      const count = levelCount(piece);
      const index = ctx.level(piece);
      const vertical = piece.orientation === 'vertical';
      const name = text(piece.label ?? t('Nivel'));
      const atTop = !piece.wrap && count > 0 && index >= count - 1;
      const atBottom = !piece.wrap && count > 0 && index === 0;
      const up = part(
        'inc',
        vertical || piece.type === 'updown' ? 'mdi:chevron-up' : 'mdi:plus',
        t('Subir {name}', { name }),
        atTop,
      );
      const down = part(
        'dec',
        vertical || piece.type === 'updown' ? 'mdi:chevron-down' : 'mdi:minus',
        t('Bajar {name}', { name }),
        atBottom,
      );
      if (piece.type === 'steps' && count > 0 && count <= 12)
        return `<div class="ksteps${vertical ? ' v' : ''}" role="group" aria-label="${e(name)}">${Array.from({ length: count }, (_, j) => `<button type="button" data-op="set" data-v="${j}" aria-pressed="${j === index}">${e(levelText(piece, j))}</button>`).join('')}</div>`;
      if (piece.type === 'slider') {
        const p = count > 1 && index >= 0 ? (index / (count - 1)) * 100 : 0;
        return `<div class="kbar${vertical ? ' v' : ''}">${down}<div class="ktrack" data-op="track" role="slider" tabindex="-1" aria-label="${e(name)}" aria-valuemin="0" aria-valuemax="${Math.max(0, count - 1)}" aria-valuenow="${Math.max(0, index)}" aria-valuetext="${e(index >= 0 ? levelText(piece, index) : '–')}"><i style="${vertical ? 'height' : 'width'}:${p}%"></i></div>${up}${piece.display !== 'text' && (piece.names || piece.values) ? `<span class="kbarv">${e(index >= 0 ? levelText(piece, index) : '–')}</span>` : ''}</div>`;
      }
      if (piece.type === 'knob') {
        const p = count > 1 && index >= 0 ? (index / (count - 1)) * 100 : 0;
        return `<div class="kknob">${down}<span class="dial" style="--p:${p}"><b>${e(index >= 0 ? levelText(piece, index) : '–')}</b></span>${up}</div>`;
      }
      return `<div class="krock${vertical ? ' v' : ' h'}">${vertical ? up : down}<div class="kmid">${middle(piece, index, count)}</div>${vertical ? down : up}</div>`;
    }
    case 'modes': {
      const chosen = ctx.option(piece);
      const option = (j: number) => ({
        label: piece.options?.[j]?.label ?? ctx.name(refs[j]),
        icon: piece.options?.[j]?.icon ?? ctx.icon(refs[j]),
      });
      if (piece.display === 'list')
        return `<label class="klist">${glyph(option(Math.max(0, chosen)).icon)}<select data-op="pick" aria-label="${e(text(piece.label ?? t('Modo')))}">${chosen < 0 ? '<option value="" selected>–</option>' : ''}${refs.map((_, j) => `<option value="${j}"${j === chosen ? ' selected' : ''}>${e(text(option(j).label))}</option>`).join('')}</select>${glyph('mdi:chevron-down')}</label>`;
      return `<div class="kmodes" role="group" aria-label="${e(text(piece.label ?? t('Modo')))}">${refs
        .map((_, j) => {
          const item = option(j);
          return `<button type="button" data-op="mode" data-v="${j}" aria-pressed="${j === chosen}" aria-label="${e(text(item.label))}">${piece.hideIcon ? '' : glyph(item.icon)}${piece.hideLabel ? '' : `<span>${e(text(item.label))}</span>`}</button>`;
        })
        .join('')}</div>`;
    }
    case 'cycle': {
      const chosen = ctx.option(piece);
      const j = chosen < 0 ? 0 : chosen;
      const item = {
        label: piece.options?.[j]?.label ?? ctx.name(refs[j]),
        icon: piece.options?.[j]?.icon ?? piece.icon ?? ctx.icon(refs[j]),
      };
      return `<button type="button" class="kface col" data-op="cycle" aria-label="${e(text(`${piece.label ?? ''} ${item.label}`.trim()))}">${face(piece, glyph(item.icon ?? 'mdi:repeat'), item.label)}</button>`;
    }
    case 'indicator': {
      const { value, unit } = ctx.reading(piece);
      return `<div class="kread">${piece.label && !piece.hideLabel ? `<small>${e(text(piece.label))}</small>` : ''}<b data-reading="${e(piece.id)}">${piece.hideIcon ? '' : glyph(piece.icon)}${e(value)}${unit ? ` <em>${e(unit)}</em>` : ''}</b></div>`;
    }
    case 'graph': {
      const { value, unit } = ctx.reading(piece);
      return `<div class="kread">${piece.label && !piece.hideLabel ? `<small>${e(text(piece.label))} · <span data-reading="${e(piece.id)}">${e(value)}</span>${unit ? ` ${e(unit)}` : ''}</small>` : `<small data-reading="${e(piece.id)}">${e(value)}</small>`}<span data-spark="${e(piece.id)}">${sparkline(ctx.samples(piece))}</span></div>`;
    }
    case 'title':
      return `<div class="ktitle">${glyph(piece.icon)}${e(text(piece.label ?? ''))}</div>`;
    case 'separator':
      return '<div class="ksep"></div>';
    case 'canvas':
      return '';
    default: {
      if (!isBlock(piece.type)) return '';
      const slots = piece.slots ?? {};
      const key = (slot: string, name: string, icon: string, cls = '') => {
        const ref = slots[slot];
        const said = ref ? `${t(name)} · ${ctx.name(ref)}` : t(name);
        return `<button type="button" class="${cls}" data-op="slot" data-v="${slot}" aria-label="${e(said)}" title="${e(said)}"${ref ? '' : ' disabled'}${piece.type === 'colors' ? ` style="--cc:${KEY_COLORS[slot]}"` : ''}>${icon ? glyph(icon) : piece.type === 'colors' ? '' : e(slot === 'ok' ? 'OK' : t(name))}</button>`;
      };
      const all = BLOCK_SLOTS[piece.type];
      if (piece.type === 'dpad')
        return `<div class="kdpad">${key('up', 'Arriba', 'mdi:chevron-up', 'du')}${key('left', 'Izquierda', 'mdi:chevron-left', 'dl')}${key('ok', 'OK', '', 'dok')}${key('right', 'Derecha', 'mdi:chevron-right', 'dr')}${key('down', 'Abajo', 'mdi:chevron-down', 'dd')}</div>`;
      if (piece.type === 'numpad')
        return `<div class="knum">${all.map(([slot, name, icon]) => key(slot, name, icon)).join('')}</div>`;
      if (piece.type === 'transport')
        return `<div class="ktrans">${all
          .filter(([slot]) => piece.w > 2 || ['rew', 'play', 'ff'].includes(slot))
          .map(([slot, name, icon]) => key(slot, name, icon))
          .join('')}</div>`;
      return `<div class="kcolors">${all.map(([slot, name]) => key(slot, name, '')).join('')}</div>`;
    }
  }
}

export const KEY_COLORS: Record<string, string> = {
  red: '#d0453a',
  green: '#3f8f5f',
  yellow: '#d9b21f',
  blue: '#3f7fbf',
};

/** A small line of the last readings; flat while there is only one. */
export function sparkline(values: number[], width = 100, height = 30): string {
  if (values.length < 2)
    return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path class="line" d="M0 ${height / 2}H${width}"/></svg>`;
  const low = Math.min(...values),
    high = Math.max(...values),
    span = high - low || 1;
  const points = values.map(
    (value, index) =>
      `${((index / (values.length - 1)) * width).toFixed(1)} ${(height - 3 - ((value - low) / span) * (height - 6)).toFixed(1)}`,
  );
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path class="fill" d="M${points.join('L')}L${width} ${height}L0 ${height}Z"/><path class="line" d="M${points.join('L')}"/></svg>`;
}

/** The body of the control: theme, colour, corners and the space between keys. */
export function bodyVars(canvas: ControlPiece | undefined): { theme: RemoteTheme | 'hm'; style: string } {
  const style: string[] = [];
  if (canvas && color(canvas.bg)) style.push(`--rbody:${canvas.bg}`);
  if (canvas && typeof canvas.radius === 'number') style.push(`--rrad:${canvas.radius}px`);
  if (canvas?.gap) style.push(`--gap:${canvas.gap}px`);
  return { theme: canvas?.theme ?? 'hm', style: style.join(';') };
}

/** Keys and bodies. "hm" is the theme of a control that never chose one: Home Manager's own colours. */
export const keyStyles = `
.body{--rbody:var(--hm-surface);--rkey:var(--hm-bg);--rfg:var(--hm-ink);--racc:var(--hm-brand);--rsub:var(--hm-muted);--rrad:28px;
  position:relative;border-radius:var(--rrad);background:var(--rbody);color:var(--rfg);border:1px solid var(--hm-line);box-shadow:var(--hm-shadow)}
.body.theme-grafito,.body.theme-claro,.body.theme-arena,.body.theme-vidrio{border-color:transparent;box-shadow:0 28px 50px -22px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.14),inset 0 1px 0 rgba(255,255,255,.14),inset 0 -2px 0 rgba(0,0,0,.18)}
.body.theme-grafito{--rbody:linear-gradient(160deg,#323a35,#1b1f1c);--rkey:#3b433e;--rfg:#eef2ec;--racc:#8fd19e;--rsub:#9aa59f}
.body.theme-claro{--rbody:linear-gradient(160deg,#ffffff,#eceee9);--rkey:#f5f7f3;--rfg:#1f2a24;--racc:#4f7a5a;--rsub:#6b7a72}
.body.theme-arena{--rbody:linear-gradient(160deg,#f4ede1,#e2d5bf);--rkey:#fcf8f1;--rfg:#3a2f22;--racc:#b0743a;--rsub:#8a7a66}
.body.theme-vidrio{--rbody:linear-gradient(160deg,rgba(255,255,255,.3),rgba(255,255,255,.1));--rkey:rgba(255,255,255,.2);--rfg:#fff;--racc:rgba(255,255,255,.92);--rsub:rgba(255,255,255,.75);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);border-color:rgba(255,255,255,.4)}
.body.theme-vidrio .k.on,.body.theme-vidrio [aria-pressed=true]{color:#1f2a24!important}
.k{--kbg:var(--rkey);--kfg:var(--rfg);--kon:var(--racc);--fs:13px;--fw:500;--isz:22px;
  position:relative;display:flex;border-radius:var(--rad,14px);background:var(--kbg);color:var(--kfg);font-size:var(--fs);font-weight:var(--fw);min-width:0;min-height:0;overflow:hidden;transition:transform .08s,filter .15s,box-shadow .15s;user-select:none;-webkit-user-select:none}
.k.raised{background:linear-gradient(180deg,color-mix(in srgb,var(--kbg) 84%,#fff) 0%,var(--kbg) 42%,color-mix(in srgb,var(--kbg) 90%,#000) 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 2px 3px rgba(0,0,0,.22),0 1px 1px rgba(0,0,0,.14)}
.k.flat{box-shadow:none}
.k.outline{background:transparent;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--kfg) 42%,transparent)}
.k.bd{outline:2px solid var(--kbd);outline-offset:-2px}
.k.on{--kbg:var(--kon);--kfg:#fff}
.k ha-icon{--mdc-icon-size:var(--isz);color:inherit;flex:none}
.k button,.k select{border:0;background:transparent;color:inherit;font:inherit;padding:0;min-width:0;min-height:0;border-radius:0;box-shadow:none}
.k button:disabled{opacity:.35;cursor:default}
.kface{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:4px 8px}
.kface.col{flex-direction:column;gap:2px}
.kt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.01em}
.live-keys .k button:not(:disabled):active,.live-keys .k:has(>.kface:active){transform:scale(.94)}
.k.press{animation:hm-kpress .2s ease}.k.flash{animation:hm-kflash .55s ease}.k.failed{box-shadow:inset 0 0 0 2px var(--hm-alert)}
@keyframes hm-kpress{50%{transform:scale(.93);filter:brightness(.9)}}
@keyframes hm-kflash{from{box-shadow:0 0 0 4px color-mix(in srgb,var(--kon) 70%,transparent)}}
.krock{flex:1;display:flex;min-width:0}.krock.v{flex-direction:column}
.kpart{display:grid;place-items:center;flex:none}
.krock.v .kpart{height:32%}.krock.h .kpart{width:30%}
.kpart:hover:not(:disabled){background:color-mix(in srgb,var(--kfg) 8%,transparent)}
.kmid{flex:1;display:grid;place-items:center;align-content:center;text-align:center;min-width:0;min-height:0;gap:1px}
.kval{font-size:var(--vsz,22px);font-weight:500;line-height:1;font-variant-numeric:tabular-nums}
.ksub{font-size:10px;color:color-mix(in srgb,var(--kfg) 62%,transparent)}
.kdots{display:flex;gap:4px}.kdots i{width:6px;height:6px;border-radius:50%;background:color-mix(in srgb,var(--kfg) 25%,transparent)}.kdots i.on{background:var(--kon)}
.ksteps{flex:1;display:flex;gap:4px;padding:5px;min-width:0}.ksteps.v{flex-direction:column-reverse}
.ksteps button{flex:1;border-radius:max(4px,calc(min(var(--rad,14px),20px) - 4px));background:color-mix(in srgb,var(--kfg) 9%,transparent);font-size:var(--fs);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ksteps button[aria-pressed=true]{background:var(--kon);color:#fff;font-weight:600}
.kbar{flex:1;display:flex;align-items:center;gap:4px;padding:0 4px;position:relative;min-width:0}.kbar.v{flex-direction:column-reverse;padding:4px 0}
.kbar .kpart,.kknob .kpart{width:28px;height:28px;border-radius:50%}
.ktrack{flex:1;height:8px;border-radius:99px;background:color-mix(in srgb,var(--kfg) 18%,transparent);position:relative;overflow:hidden;cursor:pointer}
.kbar.v .ktrack{width:8px;height:auto;align-self:stretch}
.ktrack i{position:absolute;left:0;bottom:0;top:0;background:var(--kon);border-radius:inherit}.kbar.v .ktrack i{top:auto;right:0}
.kbarv{position:absolute;top:3px;left:50%;transform:translateX(-50%);font-size:10px;color:color-mix(in srgb,var(--kfg) 70%,transparent);pointer-events:none}
.kknob{flex:1;display:flex;align-items:center;justify-content:space-between;padding:0 6px;min-width:0}
.dial{width:min(64%,76px);aspect-ratio:1;border-radius:50%;background:conic-gradient(from -135deg,var(--kon) calc(var(--p) * .75%),color-mix(in srgb,var(--kfg) 15%,transparent) 0 75%,transparent 0);display:grid;place-items:center}
.dial b{width:76%;aspect-ratio:1;border-radius:50%;background:var(--kbg);display:grid;place-items:center;font-size:13px;font-weight:500;box-shadow:0 2px 5px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.15)}
.kmodes{flex:1;display:flex;gap:4px;padding:5px;min-width:0}
.kmodes button{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border-radius:max(4px,calc(min(var(--rad,14px),20px) - 4px));font-size:var(--fs);min-width:0}
.kmodes button span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kmodes button:hover{background:color-mix(in srgb,var(--kfg) 8%,transparent)}.kmodes button[aria-pressed=true]{background:var(--kon);color:#fff}
.klist{flex:1;display:flex;align-items:center;gap:6px;padding:0 10px;min-width:0;cursor:pointer}.klist select{flex:1;appearance:none;-webkit-appearance:none;cursor:pointer;min-height:100%}
.klist select option{color:#1f2a24}
.kinfo{background:transparent!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rfg) 16%,transparent)!important}
.k.t-title,.k.t-separator{box-shadow:none!important}
.kread{flex:1;display:grid;align-content:center;padding:4px 12px;gap:1px;min-width:0}
.kread small{font-size:var(--fs);color:var(--rsub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kread b{font-size:var(--vsz,20px);font-weight:500;font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:6px}.kread em{font-style:normal;font-size:12px;color:var(--rsub)}
.spark{width:100%;height:28px}.spark .line{fill:none;stroke:var(--racc);stroke-width:2;vector-effect:non-scaling-stroke}.spark .fill{fill:color-mix(in srgb,var(--racc) 20%,transparent)}
.ktitle{flex:1;display:flex;align-items:center;gap:6px;font-size:var(--fs);font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--rsub);padding:0 6px;min-width:0}
.ksep{flex:1;align-self:center;height:1px;background:color-mix(in srgb,var(--rfg) 18%,transparent);margin:0 6px}
.kdpad{position:relative;flex:1}
.kdpad button{position:absolute;display:grid;place-items:center}
.kdpad button:hover:not(:disabled){background:color-mix(in srgb,var(--kfg) 8%,transparent)}
.kdpad .du{top:0;left:30%;width:40%;height:30%}.kdpad .dd{bottom:0;left:30%;width:40%;height:30%}
.kdpad .dl{left:0;top:30%;width:30%;height:40%}.kdpad .dr{right:0;top:30%;width:30%;height:40%}
.kdpad .dok{left:30%;top:30%;width:40%;height:40%;border-radius:50%;background:color-mix(in srgb,var(--kfg) 8%,var(--kbg));box-shadow:0 0 0 4px color-mix(in srgb,#000 12%,transparent),0 3px 6px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.18);font-weight:600;font-size:14px;letter-spacing:.04em}
.knum{flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:8px}
.knum button{border-radius:12px;background:color-mix(in srgb,var(--kfg) 8%,transparent);font-size:17px;font-weight:500;display:grid;place-items:center}
.knum button:hover:not(:disabled){background:color-mix(in srgb,var(--kfg) 14%,transparent)}
.ktrans{flex:1;display:flex;justify-content:space-around;align-items:center;padding:0 6px}
.ktrans button{width:40px;height:40px;border-radius:50%;display:grid;place-items:center}
.ktrans button:hover:not(:disabled){background:color-mix(in srgb,var(--kfg) 10%,transparent)}
.kcolors{flex:1;display:flex;gap:8px;padding:12px}
.kcolors button{flex:1;border-radius:99px!important;background:var(--cc)!important;box-shadow:inset 0 -3px 0 rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.3)!important}
.brandmark{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:#fff;font-weight:700;font-size:12px;background:var(--bc);flex:none;letter-spacing:-.02em}
.brandmark ha-icon{--mdc-icon-size:18px}
.brandmark.inkey{width:auto;height:auto;background:transparent;font-size:calc(var(--isz) * .7)}.brandmark.inkey ha-icon{--mdc-icon-size:var(--isz)}
@media(prefers-reduced-motion:reduce){.k.press,.k.flash{animation:none}}
`;

/** The body of a drawn control: its theme and its grid. */
export function remoteShell(
  look: { theme: string; style: string },
  editing: boolean,
  columns: number,
  gap: number,
  inner: string,
): string {
  return `<div class="body theme-${look.theme}${editing ? ' editing' : ' live-keys'}" style="--cols:${columns};--gap:${gap}px;${look.style}"><div class="grid">${inner}</div><p class="live" role="status" aria-live="polite"></p></div>`;
}

/** One piece in its cell of the grid, with its look. */
export function keyWidget(
  widget: ControlPiece,
  classes: string,
  attributes: string,
  content: string,
  tools: string,
  editing: boolean,
): string {
  return `<div class="widget ${classes}" data-widget="${e(widget.id)}" style="grid-column:${widget.x + 1}/span ${widget.w};grid-row:${widget.y + 1}/span ${widget.h};${keyVars(widget)}"${attributes}><div class="content"${editing ? ' inert' : ''}>${content}</div>${tools}</div>`;
}

export const remoteViewStyles = (row: number, gap: number) => `
:host([bare]){height:100%}
:host([bare]) .body{--rkey:var(--hm-surface);--rbody:transparent;max-width:none;height:100%;padding:0;border:0;box-shadow:none;background:transparent;border-radius:0}
:host([bare]) .grid{height:100%;grid-template-columns:minmax(0,1fr);grid-auto-rows:minmax(0,1fr)}
:host([bare]) .live{display:none}
:host([bare]) .k.raised{box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 2px 6px rgba(0,0,0,.2),0 1px 1px rgba(0,0,0,.12)}
:host{display:block}
.body{container-type:inline-size;max-width:max(240px,calc(var(--cols,4) * (64px + var(--gap,10px)) - var(--gap,10px) + 36px));width:100%;margin:0 auto;padding:22px 18px 18px;box-sizing:border-box}
.grid{display:grid;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));grid-auto-rows:min(${row}px,calc((100cqi - (var(--cols,4) - 1) * var(--gap,${gap}px)) / var(--cols,4)));gap:var(--gap,${gap}px);position:relative}
.widget{position:relative}
.widget>.content{flex:1;display:flex;min-width:0;min-height:0}
.kembed{flex:1;display:flex;flex-direction:column;min-width:0;padding:4px;background:var(--hm-surface);color:var(--hm-ink)}
.live{min-height:18px;margin:12px 0 0;font-size:13px;text-align:center;color:var(--rsub)}.live.error{color:var(--hm-alert)}
.empty{grid-column:1/-1;text-align:center;color:var(--rsub);font-size:14px;align-self:center}
.cell{border:1px dashed color-mix(in srgb,var(--rfg) 16%,transparent);border-radius:12px;pointer-events:none}
.editing .widget{cursor:grab;touch-action:none;z-index:1;overflow:visible}
.editing .widget:focus-visible{box-shadow:var(--hm-focus)}
.editing .content{pointer-events:none}
.widget.dragging{opacity:.85;z-index:4;cursor:grabbing}
.widget.selected{outline:2px solid #5aa9ff;outline-offset:3px}
.widget.running{animation:hm-preset 1s ease-in-out infinite alternate}
.tools{position:absolute;top:-12px;right:-8px;display:flex;gap:4px;z-index:3}
.tools button{min-height:32px;height:32px;width:32px;padding:0;border-radius:50%;box-shadow:var(--hm-shadow);font-size:15px;line-height:1;background:var(--hm-surface);color:var(--hm-ink)}
.tools .remove{color:var(--hm-alert)}
.resize{position:absolute;width:12px;height:12px;border-radius:4px;background:#fff;border:2px solid #5aa9ff;z-index:3;touch-action:none;box-sizing:border-box}
.resize.se{right:-8px;bottom:-8px;cursor:nwse-resize}.resize.e{right:-8px;top:50%;margin-top:-6px;cursor:ew-resize}.resize.s{bottom:-8px;left:50%;margin-left:-6px;cursor:ns-resize}
:host(:not([data-designer])) .resize.se{width:22px;height:22px;right:-6px;bottom:-6px;border-radius:7px;background:var(--hm-brand);border:0}
:host([data-designer]) .widget:not(.alone) .resize{display:none}
.mini{position:absolute;top:-36px;right:-6px;display:flex;gap:2px;padding:3px;border-radius:12px;background:var(--hm-surface);box-shadow:var(--hm-shadow);z-index:5}
.mini button{display:grid;place-items:center;width:26px;height:26px;min-height:26px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--hm-ink)}
.mini button:hover{background:var(--hm-surface-2)}.mini .danger{color:var(--hm-alert)}.mini ha-icon{--mdc-icon-size:18px}
@keyframes hm-preset{to{box-shadow:0 0 0 4px color-mix(in srgb,var(--kon) 45%,transparent)}}
@media(max-width:650px){.body{padding:18px 12px 12px}}
`;
