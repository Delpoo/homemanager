import type { RfButton, RfPart, RfRemote, RfWidget, WidgetType } from '../integration/rf.js';

export type DrawableRemote = Pick<RfRemote, 'id' | 'buttons' | 'parts' | 'layout'>;

/** Grid of the remote designer: same limits as rf_model.py, which validates
 * every saved layout. Widgets never overlap: placing one pushes the widgets it
 * lands on further down. */

export const COLUMNS = 4;
export const MAX_ROWS = 40;
export const MAX_HEIGHT = 12;
/** Columns of this layout's grid: its canvas piece, or four (0.13). */
export const columnsOf = (layout: readonly RfWidget[]): number => gridOf(layout).columns;
/** Buttons each widget type uses, as [minimum, maximum]. */
export { PIECE_INPUTS as WIDGET_BUTTONS, PIECE_SIZE as WIDGET_SIZE } from '../model/control-layout.js';
import { PIECE_INPUTS as WIDGET_BUTTONS, PIECE_SIZE as WIDGET_SIZE, gridOf } from '../model/control-layout.js';

type Box = Pick<RfWidget, 'x' | 'y' | 'w' | 'h'>;

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rows(layout: RfWidget[]): number {
  const drawn = layout.filter(widget => widget.type !== 'canvas');
  return Math.max(
    drawn.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0),
    gridOf(layout).rows ?? 0,
  );
}

export function uniqueId(layout: RfWidget[], base: string): string {
  const stem =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'w';
  const taken = new Set(layout.map(widget => widget.id));
  let id = stem,
    index = 2;
  while (taken.has(id)) id = `${stem}-${index++}`;
  return id;
}

function clamp(widget: RfWidget, columns = COLUMNS): RfWidget {
  const w = Math.max(1, Math.min(columns, widget.w));
  const h = Math.max(1, Math.min(MAX_HEIGHT, widget.h));
  const x = Math.max(0, Math.min(columns - w, widget.x));
  const y = Math.max(0, Math.min(MAX_ROWS - h, widget.y));
  return { ...widget, x, y, w, h };
}

/** First free spot, row by row, for a widget of this size. */
export function freeSpot(layout: RfWidget[], w: number, h: number): { x: number; y: number } {
  const columns = columnsOf(layout);
  const drawn = layout.filter(widget => widget.type !== 'canvas');
  for (let y = 0; y < MAX_ROWS; y++)
    for (let x = 0; x + w <= columns; x++) if (!drawn.some(widget => overlaps(widget, { x, y, w, h }))) return { x, y };
  return { x: 0, y: rows(layout) };
}

/** Moves and/or resizes one widget; the widgets it covers move down. */
export function place(layout: RfWidget[], id: string, box: Partial<Box>): RfWidget[] {
  const moved = layout.find(widget => widget.id === id);
  if (!moved || moved.type === 'canvas') return layout;
  const target = clamp({ ...moved, ...box }, columnsOf(layout));
  const settled: RfWidget[] = [target];
  let overflow = false;
  const others = layout
    .filter(widget => widget.id !== id && widget.type !== 'canvas')
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(widget => {
      let y = widget.y;
      while (settled.some(other => overlaps({ ...widget, y }, other))) y++;
      if (y + widget.h > MAX_ROWS) {
        overflow = true;
        return widget;
      }
      const placed = { ...widget, y };
      settled.push(placed);
      return placed;
    });
  if (overflow || settled.some((a, i) => settled.some((b, j) => j > i && overlaps(a, b)))) return layout;
  const byId = new Map(
    [target, ...others, ...layout.filter(widget => widget.type === 'canvas')].map(widget => [widget.id, widget]),
  );
  return layout.map(widget => byId.get(widget.id)!);
}

/** Adds a widget at the first free spot that fits it. */
export function add(layout: RfWidget[], widget: Omit<RfWidget, 'x' | 'y'>): RfWidget[] {
  return [...layout, { ...widget, ...freeSpot(layout, widget.w, widget.h) }];
}

function role(part: RfPart, name: string): string | undefined {
  return part.roles[name];
}

/** The drawing a remote gets until someone designs it: each part's controls
 * first (power, speeds, faster/slower), then every other button. */
export function defaultLayout(remote: Pick<RfRemote, 'buttons' | 'parts'>): RfWidget[] {
  let layout: RfWidget[] = [];
  const used = new Set<string>();
  const known = new Set(remote.buttons.map(button => button.id));
  const push = (type: WidgetType, buttons: (string | undefined)[], label: string | null, base: string) => {
    const ids = buttons.filter((id): id is string => !!id && known.has(id));
    if (ids.length < WIDGET_BUTTONS[type][0]) return;
    ids.forEach(id => used.add(id));
    const [w, h] = WIDGET_SIZE[type];
    layout = add(layout, { id: uniqueId(layout, base), type, w, h, buttons: ids, label, icon: null });
  };
  for (const part of remote.parts) {
    const on = role(part, 'on') ?? role(part, 'toggle');
    const off = role(part, 'off');
    if (on && off && on !== off) push('toggle', [on, off], part.name, `${part.id}-power`);
    else if (on) push('toggle', [on], part.name, `${part.id}-power`);
    else if (off) push('button', [off], null, `${part.id}-off`);
    if (part.kind !== 'fan') continue;
    const speeds = Object.keys(part.roles)
      .map(name => /^speed_(\d+)$/.exec(name)?.[1])
      .filter((level): level is string => !!level)
      .map(Number)
      .sort((a, b) => a - b);
    if (speeds.length >= 2)
      push(
        'steps',
        speeds.map(level => role(part, `speed_${level}`)),
        part.name,
        `${part.id}-speed`,
      );
    else if (speeds.length) push('button', [role(part, `speed_${speeds[0]}`)], null, `${part.id}-speed`);
    push('updown', [role(part, 'speed_down'), role(part, 'speed_up')], part.name, `${part.id}-steps`);
    push('button', [role(part, 'direction')], null, `${part.id}-direction`);
  }
  for (const button of remote.buttons) if (!used.has(button.id)) push('button', [button.id], null, `b-${button.id}`);
  return layout;
}

/** The layout to draw: the designed one, or the default. */
export function layoutOf(remote: Pick<RfRemote, 'buttons' | 'parts' | 'layout'>): RfWidget[] {
  return remote.layout ?? defaultLayout(remote);
}

export function buttonById(remote: Pick<RfRemote, 'buttons'>, id: string): RfButton | undefined {
  return remote.buttons.find(button => button.id === id);
}
