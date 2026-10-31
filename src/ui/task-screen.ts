import { t } from '../i18n/index.js';
import { uiEscape as e, uiIcon } from './components.js';
import { confirmDialog } from './confirm-dialog.js';

const stacks = new WeakMap<ShadowRoot, TaskScreen[]>();
const installed = new WeakSet<ShadowRoot>();
type Covered = { element: HTMLElement; inert: boolean; visibility: string; aria: string | null };

/** A task replaces the current page. Its predecessor stays mounted, including
 * form values, selection and scroll. Only yes/no confirmations enter the top layer. */
export class TaskScreen extends HTMLElement {
  returnValue = '';
  onBack?: () => void;
  guardChanges = false;
  private changed = false;
  private closing = false;
  private covered: Covered[] = [];
  private owner?: ShadowRoot;
  private trigger?: HTMLElement;
  get open(): boolean {
    return this.hasAttribute('open');
  }
  constructor() {
    super();
    this.addEventListener('input', () => (this.changed = true));
    this.addEventListener('change', () => (this.changed = true));
    this.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Let a help/icon popover handle Escape before navigating the task.
      if (event.composedPath().some(node => (node as Element).localName === 'homemanager-icon-picker')) return;
      event.preventDefault();
      event.stopPropagation();
      void this.back();
    });
  }
  async back(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    try {
      if (this.guardChanges && this.changed && this.owner && !(await confirmDialog(this.owner, {
        title: t('¿Descartar los cambios?'),
        message: t('Los cambios de esta pantalla todavía no se aplicaron.'),
        confirm: t('Descartar cambios'),
      }))) return;
      if (this.onBack) this.onBack();
      else this.close();
    } finally {
      this.closing = false;
    }
  }
  show(root: ShadowRoot, title?: string): void {
    this.owner = root;
    if (!installed.has(root)) {
      installed.add(root);
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(taskScreenStyles);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    }
    if (!this.querySelector(':scope > .task-head')) {
      const content = document.createElement('div');
      content.className = 'task-body';
      content.append(...this.childNodes);
      const name = title ?? this.getAttribute('aria-label') ?? content.querySelector('h2')?.textContent ?? '';
      this.setAttribute('aria-label', name);
      this.removeAttribute('aria-labelledby');
      const header = document.createElement('header');
      header.className = 'task-head';
      header.innerHTML = `<button type="button" class="task-back" aria-label="${e(t('Volver'))}">${uiIcon('mdi:arrow-left')}</button><h2 tabindex="-1">${e(name)}</h2>`;
      header.querySelector('button')!.onclick = () => void this.back();
      this.append(header, content);
    }
    this.setAttribute('role', 'region');
    const stack = (stacks.get(root) ?? []).filter(screen => screen.isConnected && screen !== this);
    stacks.set(root, [...stack, this]);
    this.trigger ??= root.activeElement instanceof HTMLElement ? root.activeElement : undefined;
    if (!this.isConnected) root.append(this);
    this.covered = [];
    const hostTask = ['homemanager-device-picker', 'homemanager-panel'].includes(root.host.localName);
    const coverRoot = hostTask && root.host.getRootNode() instanceof ShadowRoot ? root.host.getRootNode() as ShadowRoot : root;
    for (const child of coverRoot.children) {
      if (!(child instanceof HTMLElement) || child === this || child === root.host || child.localName === 'style' || child.localName === 'dialog') continue;
      this.covered.push({ element: child, inert: child.inert, visibility: child.style.visibility, aria: child.getAttribute('aria-hidden') });
      child.inert = true;
      child.style.visibility = 'hidden';
      child.setAttribute('aria-hidden', 'true');
    }
    this.setAttribute('open', '');
    this.inert = false;
    this.style.visibility = 'visible';
    this.removeAttribute('aria-hidden');
    this.dispatchEvent(new CustomEvent('homemanager-task-change', { bubbles: true, composed: true }));
    this.querySelector<HTMLElement>('.task-head h2')?.focus({ preventScroll: true });
  }
  close(value = ''): void {
    if (!this.open) return;
    this.returnValue = value;
    this.removeAttribute('open');
    this.restore();
    this.dispatchEvent(new Event('close'));
    this.remove();
    if (this.trigger?.isConnected && !this.trigger.closest('[inert]')) this.trigger.focus({ preventScroll: true });
  }
  disconnectedCallback(): void {
    this.restore();
  }
  private restore(): void {
    for (const { element, inert, visibility, aria } of this.covered) {
      element.inert = inert;
      element.style.visibility = visibility;
      if (aria === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', aria);
    }
    this.covered = [];
    if (this.owner) stacks.set(this.owner, (stacks.get(this.owner) ?? []).filter(screen => screen !== this));
    this.owner?.host.dispatchEvent(new CustomEvent('homemanager-task-change', { bubbles: true, composed: true }));
  }
}
if (!customElements.get('homemanager-task-screen')) customElements.define('homemanager-task-screen', TaskScreen);

export function taskScreen(title: string, body: string, footer = '', className = ''): string {
  return `<homemanager-task-screen class="${e(className)}" aria-label="${e(title)}"><div class="k-dialog-body">${body}</div>${footer ? `<footer class="k-dialog-foot">${footer}</footer>` : ''}</homemanager-task-screen>`;
}

export const taskScreenStyles = `
:host{position:relative}
homemanager-task-screen[open]{position:absolute;inset:0;z-index:20;display:flex!important;flex-direction:column;width:100%;height:100%;min-width:0;max-width:none;max-height:none;margin:0;padding:0;border:0;border-radius:0;box-shadow:none;overflow:hidden;background:var(--hm-bg,var(--hm-surface));color:var(--hm-ink,var(--hm-text));box-sizing:border-box;visibility:visible}
homemanager-task-screen:not([open]){display:none}
.task-head{display:flex;align-items:center;gap:12px;flex:none;padding:12px 20px;border-bottom:1px solid var(--hm-line);background:var(--hm-surface)}
.task-head h2{margin:0;font-size:18px;overflow-wrap:anywhere;min-width:0;flex:1;outline:none}.task-head .task-back{display:grid;place-items:center;flex:none;width:44px;min-height:44px;padding:8px;border:1px solid var(--hm-line);border-radius:50%;color:inherit;background:var(--hm-bg);cursor:pointer}.task-back ha-icon{--mdc-icon-size:20px}
.task-body{flex:1;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;padding:20px;overflow-wrap:anywhere}.task-body>*{min-width:0}.task-body .actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:16px}.task-body input,.task-body select,.task-body textarea{max-width:100%;box-sizing:border-box}.task-body .k-dialog-body{padding:0}.task-body .k-dialog-foot{padding:16px 0 0}.task-body .k-dialog-head{display:none}
@media(max-width:650px){.task-head{padding:8px 12px}.task-body{padding:16px 12px max(16px,env(safe-area-inset-bottom))}.task-head h2{font-size:16px}.task-body .actions>button{min-height:44px}}
`;
