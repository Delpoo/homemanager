import { t } from '../i18n/index.js';
import type { HomeManagerCard } from './home-manager-card.js';
import type { Device } from './types.js';
import type { RfWidget } from '../integration/rf.js';
import { HomeManagerRfRemote } from '../rf/remote-view.js';
import { layoutOf, type DrawableRemote } from '../rf/layout.js';
import { attachedLook, type AttachedPiece } from '../model/control-layout.js';
import { designRemote } from '../ui/control-design-adapter.js';
import { controlsOf } from './device-controls.js';
import { irRemoteSource, rfRemoteSource } from './commands.js';
import { symbolScale } from '../model/symbol-scale.js';
import { escapeHTML as e } from './types.js';

/** 0.13: pieces of a device's control drawn next to its symbol. They are the same
 * pieces as in its control (same drawing, same state, same sending); in edit mode
 * they are dragged where they look best, resized by their corner and can be locked. */

type Source = { load(): Promise<DrawableRemote | undefined>; press(ref: string): Promise<unknown> };
const cache = new WeakMap<HomeManagerCard, Map<string, { at: number; remote: Promise<DrawableRemote | undefined> }>>();

/** The control a device's attached pieces come from: its RF remote, its IR remote,
 * or the control designed for its symbol (the same order as its panel). */
export function attachedSource(card: HomeManagerCard, d: Device): Source | null {
  const rf = rfRemoteSource.call(card, d);
  if (rf) return rf;
  const ir = irRemoteSource.call(card, d);
  if (ir) return ir;
  if (!card.draft) return null;
  const remote = designRemote(d, card.draft, controlsOf(d));
  if (!layoutOf(remote).length) return null;
  const host = card.controlHost(d);
  return {
    load: async () => remote,
    press: async actionId => {
      if (card.editing) throw new Error(t('Salí del modo edición para controlar dispositivos.'));
      const message = await host.run(
        { id: `design-${actionId}`, type: 'button', label: d.display.label, steps: [{ actionId }] },
        0,
      );
      if (message) throw new Error(message);
    },
  };
}

function load(card: HomeManagerCard, d: Device, source: Source): Promise<DrawableRemote | undefined> {
  const map = cache.get(card) ?? new Map();
  cache.set(card, map);
  const key = `${d.id}|${d.bindings.remoteId ?? ''}|${d.bindings.irRemoteId ?? ''}|${JSON.stringify(d.bindings.layout ?? null)}`;
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < 15000) return hit.remote;
  const remote = source.load().catch(() => undefined);
  map.set(key, { at: Date.now(), remote });
  return remote;
}

/** One piece alone, as the control draws it: a one-cell grid with its look on top. */
export function attachedRemote(remote: DrawableRemote, item: AttachedPiece): DrawableRemote | null {
  const piece = layoutOf(remote).find(p => p.id === item.piece && p.type !== 'canvas');
  if (!piece) return null;
  const canvas: RfWidget = {
    id: 'canvas',
    type: 'canvas',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    buttons: [],
    label: null,
    icon: null,
  };
  return { ...remote, layout: [canvas, attachedLook(piece, item)] };
}

export function mountAttached(this: HomeManagerCard): void {
  const overlay = this.root.querySelector<HTMLElement>('.overlay');
  if (!overlay || !this.draft) return;
  overlay.querySelectorAll('.attached').forEach(node => node.remove());
  for (const d of this.draft.catalog.devices) {
    if (!d.display.attached?.length) continue;
    if (!overlay.querySelector(`.marker[data-id="${CSS.escape(d.id)}"]`)) continue;
    const source = attachedSource(this, d);
    if (!source) continue;
    for (const item of d.display.attached) {
      const box = document.createElement('div');
      box.className = 'attached';
      box.dataset.device = d.id;
      box.dataset.att = item.id;
      box.classList.toggle('locked', !!item.locked);
      const chosen = this.attachedChosen?.device === d.id && this.attachedChosen.att === item.id;
      box.classList.toggle('chosen', this.editing && chosen);
      const view = document.createElement('homemanager-rf-remote') as HomeManagerRfRemote;
      view.setAttribute('bare', '');
      view.readValues = () => this._hass?.states ?? {};
      view.onPress = ref => source.press(ref);
      box.append(view);
      if (this.editing && chosen)
        box.insertAdjacentHTML(
          'beforeend',
          `<span class="agrip" data-agrip aria-hidden="true"></span><button type="button" class="alock" data-alock aria-pressed="${!!item.locked}" aria-label="${e(item.locked ? t('Soltar') : t('Fijar en su lugar'))}" title="${e(item.locked ? t('Soltar') : t('Fijar en su lugar'))}"><ha-icon icon="${item.locked ? 'mdi:lock-outline' : 'mdi:lock-open-variant-outline'}" aria-hidden="true"></ha-icon></button>`,
        );
      // In use its keys work; the plan behind does not pan or select.
      box.addEventListener('pointerdown', event => {
        if (this.editing) startAttachedDrag(this, event, box);
        else event.stopPropagation();
      });
      box.addEventListener('click', event => event.stopPropagation());
      overlay.append(box);
      void load(this, d, source).then(remote => {
        const drawn = remote && attachedRemote(remote, item);
        if (!drawn || !view.isConnected) {
          box.hidden = !this.editing;
          box.classList.toggle('missing', true);
          return;
        }
        view.remote = drawn;
      });
    }
  }
}

/** How much a device's attached pieces grow: with its symbol, unless they keep their size. */
function scaleOf(card: HomeManagerCard, d: Device, item: AttachedPiece): number {
  if (item.fixedSize) return 1;
  return (
    symbolScale(
      card.roomView ? 'room' : 'house',
      card.camera.scale / (card.baseScale || 1),
      card.draft?.symbolSizes,
      d,
    ) ?? 1
  );
}

export function positionAttached(this: HomeManagerCard): void {
  const overlay = this.root.querySelector<HTMLElement>('.overlay');
  if (!overlay || !this.draft) return;
  const byId = new Map(this.draft.catalog.devices.map(d => [d.id, d]));
  for (const box of overlay.querySelectorAll<HTMLElement>('.attached')) {
    const d = byId.get(box.dataset.device!);
    const marker = overlay.querySelector<HTMLElement>(`.marker[data-id="${CSS.escape(box.dataset.device!)}"]`);
    const stored = d?.display.attached?.find(item => item.id === box.dataset.att);
    if (!d || !stored || !marker) continue;
    const item =
      this.attachedPreview?.att === stored.id && this.attachedPreview.device === d.id
        ? this.attachedPreview.item
        : stored;
    box.hidden = marker.hidden && !this.editing;
    const point = this.screen(d.position);
    const scale = scaleOf(this, d, item);
    box.style.left = `${point.x + item.dx * scale}px`;
    box.style.top = `${point.y + item.dy * scale}px`;
    box.style.width = `${item.w}px`;
    box.style.height = `${item.h}px`;
    box.style.transform = `scale(${scale})`;
    box.style.opacity = String((item.look?.opacity ?? 100) / 100);
    box.classList.toggle('dim', marker.classList.contains('dim'));
  }
}

/** Shows a piece with other numbers while they move (the editor's sliders, a drag). */
export function previewAttached(this: HomeManagerCard, device: string, item: AttachedPiece | null): void {
  this.attachedPreview = item ? { device, att: item.id, item } : undefined;
  this.positionMarkers();
}

/** Saves a changed piece in the draft: one undo step. */
function commitAttached(card: HomeManagerCard, device: string, item: AttachedPiece): void {
  if (!card.draft) return;
  const next = structuredClone(card.draft);
  const d = next.catalog.devices.find(entry => entry.id === device);
  const list = d?.display.attached;
  const index = list?.findIndex(entry => entry.id === item.id) ?? -1;
  if (!list || index < 0) return;
  list[index] = item;
  card.attachedPreview = undefined;
  card.change(next);
}

const clampInt = (value: number, low: number, high: number) => Math.round(Math.max(low, Math.min(high, value)));

function startAttachedDrag(card: HomeManagerCard, event: PointerEvent, box: HTMLElement): void {
  if (event.button !== 0) return;
  event.stopPropagation();
  const device = box.dataset.device!;
  const d = card.draft?.catalog.devices.find(entry => entry.id === device);
  const stored = d?.display.attached?.find(entry => entry.id === box.dataset.att);
  if (!d || !stored) return;
  const target = event.target as HTMLElement;
  if (target.closest('[data-alock]')) {
    event.preventDefault();
    const next = { ...stored };
    if (next.locked) delete next.locked;
    else next.locked = true;
    commitAttached(card, device, next);
    return;
  }
  const already = card.attachedChosen?.device === device && card.attachedChosen.att === stored.id;
  card.attachedChosen = { device, att: stored.id };
  if (card.selected !== device) card.select(device);
  card.editor?.chooseAttached(stored.id);
  if (!already) {
    card.renderMarkers();
    return;
  }
  const grip = !!target.closest('[data-agrip]');
  if (stored.locked && !grip) return;
  event.preventDefault();
  const scale = scaleOf(card, d, stored);
  const start = [event.clientX, event.clientY];
  let item = stored;
  box.setPointerCapture(event.pointerId);
  const move = (moveEvent: PointerEvent) => {
    const dx = (moveEvent.clientX - start[0]) / scale;
    const dy = (moveEvent.clientY - start[1]) / scale;
    if (grip) item = { ...stored, w: clampInt(stored.w + dx, 24, 480), h: clampInt(stored.h + dy, 20, 320) };
    else {
      let x = stored.dx + dx,
        y = stored.dy + dy;
      // A soft magnet: centred on the symbol, across or along.
      if (Math.abs(y + stored.h / 2) < 6) y = -stored.h / 2;
      if (Math.abs(x + stored.w / 2) < 6) x = -stored.w / 2;
      item = { ...stored, dx: clampInt(x, -600, 600), dy: clampInt(y, -600, 600) };
    }
    card.previewAttached(device, item);
    card.editor?.showAttachedNumbers(item);
  };
  const end = () => {
    box.removeEventListener('pointermove', move);
    box.removeEventListener('pointerup', end);
    box.removeEventListener('pointercancel', end);
    if (item !== stored) commitAttached(card, device, item);
    else card.previewAttached(device, null);
  };
  box.addEventListener('pointermove', move);
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
}

export const attachedStyles = `
.attached{position:absolute;z-index:3;display:flex;transform-origin:0 0;pointer-events:auto;touch-action:none}
.attached>homemanager-rf-remote{flex:1;min-width:0;min-height:0}
.attached.dim{opacity:.35!important}
.attached.missing{outline:1px dashed var(--hm-alert);border-radius:10px}
.is-editing .attached{cursor:move}.is-editing .attached>homemanager-rf-remote{pointer-events:none}
.is-editing .attached.locked{cursor:default}
.attached.chosen{outline:2px dashed var(--hm-edit);outline-offset:5px;border-radius:8px}
.attached .agrip{position:absolute;right:-10px;bottom:-10px;width:14px;height:14px;border-radius:4px;background:var(--hm-edit);border:2px solid var(--hm-surface);cursor:nwse-resize;z-index:4}
.attached .alock{position:absolute;top:-38px;right:-6px;display:grid;place-items:center;width:30px;height:30px;min-height:30px;padding:0;border:0;border-radius:9px;background:var(--hm-ink);color:var(--hm-bg);z-index:4}
.attached .alock ha-icon{--mdc-icon-size:18px}
`;
