import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { tokens } from './theme.js';

/** Native modal confirmation: await the result, then mutate. Cancel is focused;
 * the browser traps focus and Esc cancels. The trigger is restored on close. */
export function confirmDialog(
  host: ShadowRoot,
  options: { title: string; message: string; confirm?: string; trigger?: HTMLElement },
): Promise<boolean> {
  const trigger = options.trigger ?? (host.activeElement as HTMLElement | undefined);
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'hm-confirm-title');
  dialog.setAttribute('aria-describedby', 'hm-confirm-message');
  dialog.innerHTML = `<style>${tokens}dialog{width:min(420px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;border:1px solid var(--hm-line);border-radius:20px;padding:24px;color:var(--hm-text);background:var(--hm-bg);box-shadow:var(--hm-shadow)}dialog::backdrop{background:#10251d77}h2{font-size:19px;margin:0 0 12px;overflow-wrap:anywhere}p{line-height:1.5;margin:0}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:24px}.danger{background:var(--hm-error);border-color:var(--hm-error);color:var(--hm-on-accent)}</style><h2 id="hm-confirm-title">${e(options.title)}</h2><p id="hm-confirm-message">${e(options.message)}</p><div class="actions"><button type="button" autofocus>${e(t('Cancelar'))}</button><button type="button" class="danger">${e(options.confirm ?? t('Eliminar'))}</button></div>`;
  return new Promise(resolve => {
    dialog.querySelector('button')!.onclick = () => dialog.close();
    dialog.querySelector<HTMLButtonElement>('.danger')!.onclick = () => dialog.close('confirmed');
    // Explicit wrapping also covers browsers that put the dialog itself in the
    // tab order when it is nested inside more than one shadow root.
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button')];
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && host.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && host.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    dialog.addEventListener(
      'close',
      () => {
        const confirmed = dialog.returnValue === 'confirmed';
        dialog.remove();
        if (trigger?.isConnected) trigger.focus();
        resolve(confirmed);
      },
      { once: true },
    );
    host.append(dialog);
    dialog.showModal();
  });
}
