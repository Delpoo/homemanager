/** Symbol size by view and zoom (#94), as decided by the owner on 2026-11-04: one size for
 * the whole house, another for the per-space view; in between it grows with the zoom,
 * never below the minimum nor above the maximum. Without settings, symbols keep one fixed
 * size, as before. Sizes are factors of the medium symbol (44 px). */
export interface SymbolSizes {
  house: number;
  room: number;
  min: number;
  max: number;
}
export interface InitialView {
  /** The space framed, or null for the whole plan. */
  room: string | null;
  /** Centre of the view, as a fraction of the drawing. */
  x: number;
  y: number;
  /** Zoom relative to the whole plan fitting the screen. */
  zoom: number;
  /** The plan alternative shown, if any. */
  planView?: string;
}
export const DEFAULT_SIZES: SymbolSizes = { house: 1, room: 1.6, min: 0.8, max: 2 };
/** How much zoom counts as "a space" when the per-space view is not on. */
export const ROOM_ZOOM = 4;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function symbolScale(
  view: 'house' | 'room',
  zoom: number,
  sizes: SymbolSizes | undefined,
  device: { display: { scale?: number; roomScale?: number } },
): number | null {
  if (!sizes) return device.display.scale ?? null;
  const house = device.display.scale ?? sizes.house;
  const room = device.display.roomScale ?? sizes.room;
  const t = view === 'room' ? 1 : clamp(Math.log(Math.max(zoom, 1)) / Math.log(ROOM_ZOOM), 0, 1);
  const low = Math.min(sizes.min, sizes.max),
    high = Math.max(sizes.min, sizes.max);
  return Math.round(clamp(house + (room - house) * t, low, high) * 1000) / 1000;
}

/** The camera that shows a saved view on this screen. */
export function cameraForView(
  view: InitialView,
  box: { x: number; y: number; width: number; height: number },
  baseScale: number,
  viewport: { width: number; height: number },
): { x: number; y: number; scale: number } {
  const scale = baseScale * clamp(view.zoom, 0.5, 16);
  return {
    scale,
    x: viewport.width / 2 - (box.x + view.x * box.width) * scale,
    y: viewport.height / 2 - (box.y + view.y * box.height) * scale,
  };
}

/** What the screen shows now, to save as the initial view. */
export function viewFromCamera(
  camera: { x: number; y: number; scale: number },
  box: { x: number; y: number; width: number; height: number },
  baseScale: number,
  viewport: { width: number; height: number },
  room: string | null,
): InitialView {
  const round = (value: number) => Math.round(value * 10000) / 10000;
  return {
    room,
    x: round(clamp(((viewport.width / 2 - camera.x) / camera.scale - box.x) / box.width, -1, 2)),
    y: round(clamp(((viewport.height / 2 - camera.y) / camera.scale - box.y) / box.height, -1, 2)),
    zoom: round(clamp(camera.scale / baseScale, 0.5, 16)),
  };
}
