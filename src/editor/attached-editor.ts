import { t } from '../i18n/index.js';
import { escapeHTML as esc } from '../card/types.js';
import type { RfWidget } from '../integration/rf.js';
import { MAX_ATTACHED, type AttachedPiece } from '../model/control-layout.js';
import { personName } from '../model/names.js';

/** 0.13 "On the plan": which pieces of the device's control are drawn next to its
 * symbol, and how each one looks there. The numbers are the same ones a drag on the
 * plan changes; both always agree. */

const SWATCHES = ['#4F7A5A', '#3F7FBF', '#6F6BB8', '#D98B1F', '#D0453A', '#1F2421', '#FFFFFF'];
const glyph = (icon: string) => `<ha-icon icon="${esc(icon)}" aria-hidden="true"></ha-icon>`;
const iconBtn = (label: string, icon: string, attributes: string, variant = '') =>
  `<button type="button" class="att-ib${variant ? ` ${variant}` : ''}" aria-label="${esc(label)}" title="${esc(label)}" ${attributes}>${glyph(icon)}</button>`;

export const pieceName = (piece: RfWidget, buttons: { id: string; name: string }[]): string =>
  personName(piece.label ?? buttons.find(button => button.id === piece.buttons[0])?.name, t('Elemento'));

export interface AttachedContext {
  attached: AttachedPiece[];
  pieces: RfWidget[];
  buttons: { id: string; name: string }[];
  chosen?: string;
  adding: boolean;
}

export function attachedBody(ctx: AttachedContext): string {
  const byId = new Map(ctx.pieces.map(piece => [piece.id, piece]));
  if (!ctx.pieces.length) return '';
  const full = ctx.attached.length >= MAX_ATTACHED;
  const rows = ctx.attached
    .map(item => {
      const piece = byId.get(item.piece);
      const on = item.id === ctx.chosen;
      return `<div class="att-row${on ? ' on' : ''}${piece ? '' : ' gone'}"><button type="button" class="att-name" data-command="attached-pick" data-att="${esc(item.id)}" aria-pressed="${on}">${glyph(piece?.icon ?? 'mdi:gesture-tap-button')}<span>${esc(piece ? pieceName(piece, ctx.buttons) : t('Ya no está en el control'))}</span></button>${iconBtn(item.locked ? t('Soltar') : t('Fijar en su lugar'), item.locked ? 'mdi:lock-outline' : 'mdi:lock-open-variant-outline', `data-command="attached-lock" data-att="${esc(item.id)}" aria-pressed="${!!item.locked}"`)}${iconBtn(t('Quitar del plano'), 'mdi:trash-can-outline', `data-command="attached-remove" data-att="${esc(item.id)}"`, 'danger')}</div>`;
    })
    .join('');
  const picker = ctx.adding
    ? `<div class="att-pick" role="group" aria-label="${esc(t('Elementos del control'))}">${ctx.pieces
        .map(
          piece =>
            `<button type="button" data-command="attached-add" data-piece="${esc(piece.id)}">${glyph(piece.icon ?? 'mdi:gesture-tap-button')}<span>${esc(pieceName(piece, ctx.buttons))}</span></button>`,
        )
        .join('')}</div>`
    : '';
  const chosen = ctx.attached.find(item => item.id === ctx.chosen);
  return `<div class="att-block"><div class="att-head"><h4>${esc(t('En el plano'))}</h4>${iconBtn(t('Pegar un elemento del control'), 'mdi:plus', `data-command="attached-add-open" aria-expanded="${ctx.adding}"${full ? ' disabled' : ''}`)}</div>${picker}<div class="att-list">${rows}</div>${chosen ? attachedProps(chosen) : ''}</div>`;
}

const row = (icon: string, label: string, control: string) =>
  `<div class="att-prop" title="${esc(label)}">${glyph(icon)}<div class="att-ctl">${control}</div></div>`;
const range = (key: string, min: number, max: number, value: number, label: string, unit = '') =>
  `<input type="range" min="${min}" max="${max}" value="${value}" data-att-num="${key}" aria-label="${esc(label)}"><output data-att-out="${key}">${value}${unit}</output>`;
const swatches = (key: 'bg' | 'fg', value: string | undefined, label: string) =>
  `<div class="att-sw">${['', ...SWATCHES]
    .map(
      color =>
        `<button type="button" class="${color ? '' : 'auto'}" data-command="attached-set" data-key="${key}" data-value="${color}" style="--c:${color || 'transparent'}" aria-pressed="${(value ?? '').toUpperCase() === color}" aria-label="${esc(`${label} ${color || t('Como en el control')}`)}" title="${esc(color || t('Como en el control'))}"></button>`,
    )
    .join(
      '',
    )}<label class="att-swc" title="${esc(t('Otro color'))}"><input type="color" data-att-color="${key}" value="${value ?? '#4F7A5A'}" aria-label="${esc(`${label} · ${t('Otro color')}`)}">${glyph('mdi:eyedropper-variant')}</label></div>`;

function attachedProps(item: AttachedPiece): string {
  const look = item.look ?? {};
  const radius = look.radius;
  return `<div class="att-props">${row('mdi:arrow-left-right', t('Ancho'), range('w', 24, 480, item.w, t('Ancho')))}${row('mdi:arrow-up-down', t('Alto'), range('h', 20, 320, item.h, t('Alto')))}${row('mdi:format-size', t('Tamaño de letra'), range('fontSize', 8, 40, look.fontSize ?? 13, t('Tamaño de letra')))}${row('mdi:numeric', t('Tamaño del valor'), range('valueSize', 12, 40, look.valueSize ?? 22, t('Tamaño del valor')))}${row('mdi:format-color-fill', t('Fondo'), swatches('bg', look.bg, t('Fondo')))}${row('mdi:format-color-text', t('Letra e ícono'), swatches('fg', look.fg, t('Letra e ícono')))}${row('mdi:square-rounded-outline', t('Esquinas'), `${range('radius', 0, 40, Math.min(40, radius ?? 14), t('Esquinas'))}${iconBtn(t('Píldora'), 'mdi:circle-outline', `data-command="attached-set" data-key="radius" data-value="${radius === 999 ? '' : '999'}" aria-pressed="${radius === 999}"`)}`)}${row('mdi:opacity', t('Opacidad'), range('opacity', 30, 100, look.opacity ?? 100, t('Opacidad'), '%'))}${row(
    'mdi:layers-outline',
    t('Relieve'),
    `<div class="att-seg">${(
      [
        ['', t('Como en el control')],
        ['raised', t('Con relieve')],
        ['flat', t('Plano')],
        ['outline', t('Contorno')],
      ] as const
    )
      .map(
        ([value, label]) =>
          `<button type="button" data-command="attached-set" data-key="relief" data-value="${value}" aria-pressed="${(look.relief ?? '') === value}">${esc(label)}</button>`,
      )
      .join('')}</div>`,
  )}${row('mdi:resize', t('Crece con el símbolo'), `<input type="checkbox" class="switch" data-att-grow ${item.fixedSize ? '' : 'checked'} aria-label="${esc(t('Crece con el símbolo'))}">`)}</div>`;
}

/** Applies one change of the inspector to a piece. Empty values go back to the control's. */
export function changeAttached(item: AttachedPiece, key: string, value: string | number | boolean): AttachedPiece {
  const next: AttachedPiece = structuredClone(item);
  if (key === 'w' || key === 'h') next[key] = Number(value);
  else if (key === 'grow') {
    if (value) delete next.fixedSize;
    else next.fixedSize = true;
  } else {
    const look: NonNullable<AttachedPiece['look']> = { ...next.look };
    const record = look as Record<string, unknown>;
    if (value === '' || value === undefined) delete record[key];
    else if (['fontSize', 'valueSize', 'radius', 'opacity'].includes(key)) record[key] = Number(value);
    else if (key === 'bg' || key === 'fg') record[key] = String(value).toUpperCase();
    else record[key] = value;
    if (key === 'opacity' && look.opacity === 100) delete look.opacity;
    if (Object.keys(look).length) next.look = look;
    else delete next.look;
  }
  return next;
}

/** A new piece beside the symbol: to its right, below the ones already there. */
export function newAttached(list: AttachedPiece[], piece: RfWidget): AttachedPiece {
  const taken = new Set(list.map(item => item.id));
  let index = list.length + 1;
  while (taken.has(`w${index}`)) index++;
  const wide = ['updown', 'slider', 'steps', 'knob', 'modes', 'transport', 'colors'].includes(piece.type);
  const w = Math.max(24, Math.min(480, wide ? 128 : 52 * Math.max(1, Math.min(3, piece.w))));
  const h = Math.max(20, Math.min(320, piece.type === 'dpad' || piece.type === 'numpad' ? 120 : 46));
  return { id: `w${index}`, piece: piece.id, dx: 30, dy: Math.min(600, -h / 2 + list.length * 52), w, h };
}

export const attachedEditorStyles = `
.att-block{display:grid;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--hm-line)}
.att-head{display:flex;align-items:center;justify-content:space-between}.att-head h4,.att-block>h4{margin:0}
.att-ib{display:grid;place-items:center;width:34px;height:34px;min-height:34px;padding:0;border:0;border-radius:10px;background:transparent;color:var(--hm-ink)}
.att-ib:hover:not(:disabled){background:var(--hm-surface-2)}.att-ib.danger{color:var(--hm-alert)}.att-ib[aria-pressed=true]{color:var(--hm-brand)}
.att-ib ha-icon{--mdc-icon-size:19px}
.att-list{display:grid;gap:2px}
.att-row{display:flex;align-items:center;gap:4px;border-radius:10px}.att-row.on{background:color-mix(in srgb,var(--hm-brand) 10%,transparent)}
.att-row.gone .att-name{color:var(--hm-alert)}
.att-name{flex:1;display:flex;align-items:center;gap:8px;min-width:0;min-height:38px;padding:0 8px;border:0;background:transparent;color:inherit;text-align:left}
.att-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.att-name ha-icon{--mdc-icon-size:18px;color:var(--hm-brand)}
.att-pick{display:grid;gap:2px;padding:6px;border:1px solid var(--hm-line);border-radius:12px;max-height:240px;overflow:auto}
.att-pick button{display:flex;align-items:center;gap:8px;min-height:36px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left}
.att-pick button:hover{background:var(--hm-surface-2)}.att-pick ha-icon{--mdc-icon-size:18px;color:var(--hm-brand)}
.att-props{display:grid;gap:4px}
.att-prop{display:flex;align-items:center;gap:8px;min-height:36px;color:var(--hm-muted)}.att-prop>ha-icon{--mdc-icon-size:18px;flex:none}
.att-ctl{flex:1;min-width:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.att-ctl input[type=range]{flex:1;min-width:0;accent-color:var(--hm-brand)}.att-ctl output{min-width:40px;text-align:right;font-size:12px;color:var(--hm-ink);font-variant-numeric:tabular-nums}
.att-sw{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.att-sw button{width:19px;height:19px;min-height:19px;padding:0;border-radius:50%;border:1px solid color-mix(in srgb,var(--hm-ink) 18%,transparent);background:var(--c)}
.att-sw button.auto{background:conic-gradient(var(--hm-surface-2) 0 25%,var(--hm-surface) 0 50%,var(--hm-surface-2) 0 75%,var(--hm-surface) 0)}
.att-sw button[aria-pressed=true]{box-shadow:0 0 0 2px var(--hm-surface),0 0 0 4px var(--hm-brand)}
.att-swc{position:relative;display:grid;place-items:center;width:21px;height:21px;border-radius:50%;background:var(--hm-surface-2);cursor:pointer}.att-swc ha-icon{--mdc-icon-size:13px}
.att-swc input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;min-height:0;padding:0}
.att-seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:3px;border-radius:10px;background:var(--hm-surface-2)}
.att-seg button{min-height:28px;padding:0 8px;border:0;border-radius:7px;background:transparent;color:var(--hm-muted);font-size:12px}
.att-seg button[aria-pressed=true]{background:var(--hm-surface);color:var(--hm-ink);box-shadow:var(--hm-shadow)}
`;
