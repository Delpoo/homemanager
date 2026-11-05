/** "Show link" (#95), per browser: never, only unlinked symbols (default) or always. */
export type ShowLink = 'never' | 'unlinked' | 'always';
const KEY = 'homemanager:show-link';
export function showLink(): ShowLink {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'never' || value === 'always' ? value : 'unlinked';
  } catch {
    return 'unlinked';
  }
}
export function setShowLink(value: string): void {
  try {
    localStorage.setItem(KEY, value === 'never' || value === 'always' ? value : 'unlinked');
  } catch {
    /* The default stays. */
  }
  document.dispatchEvent(new CustomEvent('homemanager-show-link'));
}
/** Every card on the page follows the choice at once. */
export function applyShowLink(shell: Element | null): void {
  shell?.setAttribute('data-show-link', showLink());
}
