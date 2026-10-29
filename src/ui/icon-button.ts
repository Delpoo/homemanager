import { escapeHTML as e } from '../card/types.js';

const paths: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3',
  save: 'M4 3h13l4 4v14H3V3h1M7 3v6h10V3M7 21v-8h10v8',
  settings: 'm9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3H9M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  undo: 'm8 4-5 5 5 5M3 9h11a7 7 0 0 1 0 14',
  redo: 'm16 4 5 5-5 5M21 9H10a7 7 0 0 0 0 14',
  discard: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15',
  check: 'm5 12.5 4.5 4.5L19 7',
  reset: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5',
  pin: 'M15 3 21 9l-3 1-4 4 1 5-2 2-4-4-5 5M8 13 4 9l2-2 5 1 4-4 1-3',
  tap: 'M9 11V5a2 2 0 1 1 4 0v5l4.5 1a2 2 0 0 1 1.5 2.3L18 19a2 2 0 0 1-2 2h-5.5a2 2 0 0 1-1.6-.8L5 15l1.3-1.3a1.5 1.5 0 0 1 2-.1L9 14',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
};
/** Native button markup: delegated data-command, accessible name and hover tooltip.
 * Include iconButtonStyles in the owning shadow root. No custom focus boundary. */
export function iconButton(command: string, label: string, icon: string, extra = ''): string {
  // A class="…" in extra is added to the base class (a second attribute would be ignored).
  let classes = 'hm-icon-button';
  extra = extra.replace(/\bclass="([^"]*)"/, (_, more: string) => {
    classes = `${classes} ${more.replace(/\bhm-icon-button\b/, '').trim()}`.trim();
    return '';
  });
  return `<button type="button" class="${classes}" data-command="${e(command)}" aria-label="${e(label)}" title="${e(label)}" ${extra}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[icon] ?? paths.plus}"/></svg></button>`;
}
/** The same look for a form's submit button (for example a sheet's save). */
export function submitIconButton(form: string, label: string, icon: string, extra = ''): string {
  return `<button type="submit" form="${e(form)}" class="hm-icon-button primary-action" aria-label="${e(label)}" title="${e(label)}" ${extra}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[icon] ?? paths.plus}"/></svg></button>`;
}
export const iconButtonStyles = `.hm-icon-button{display:inline-grid;place-items:center;flex:0 0 48px;width:48px;min-height:48px;padding:0;border-radius:50%;background:var(--hm-bg);border:1px solid var(--hm-line)}.hm-icon-button svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.hm-icon-button:focus-visible{outline:3px solid var(--hm-accent);outline-offset:2px}.hm-icon-button[data-danger=true]{color:var(--hm-error)}.hm-icon-button[aria-pressed=true]{background:var(--hm-accent);border-color:var(--hm-accent);color:var(--hm-on-accent)}.hm-icon-button.small{flex-basis:36px;width:36px;min-height:36px}.hm-icon-button.small svg{width:18px;height:18px}.hm-icon-button.primary-action{background:var(--hm-accent);border-color:var(--hm-accent);color:var(--hm-on-accent)}`;
