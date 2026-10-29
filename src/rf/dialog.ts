import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';

/** A short modal confirmation inside a shadow root (native <dialog>: focus is
 * trapped, Esc cancels, focus returns to the opener). Resolves true when the
 * person confirms. */

export const dialogCss = `
dialog.confirm{border:0;border-radius:var(--hm-radius);padding:20px;max-width:min(92vw,380px);background:var(--hm-bg);color:var(--hm-text);box-shadow:var(--hm-shadow)}
dialog.confirm::backdrop{background:rgba(0,0,0,.4)}
dialog.confirm h3{margin:0 0 8px;font-size:17px}
dialog.confirm p{margin:0 0 16px;color:var(--hm-muted);line-height:1.5}
dialog.confirm .actions{display:flex;gap:8px;justify-content:flex-end}
dialog.confirm .danger{background:var(--hm-error);border-color:var(--hm-error);color:#fff;font-weight:600}
`;

export function confirmDialog(
  root: ShadowRoot,
  options: { title: string; text: string; confirm: string },
): Promise<boolean> {
  const opener = root.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog');
  dialog.className = 'confirm';
  dialog.setAttribute('aria-labelledby', 'confirm-title');
  dialog.innerHTML = `<h3 id="confirm-title">${e(options.title)}</h3><p>${e(options.text)}</p><div class="actions"><button type="button" value="cancel">${e(t('Cancelar'))}</button><button type="button" class="danger" value="ok">${e(options.confirm)}</button></div>`;
  root.append(dialog);
  return new Promise(resolve => {
    let result = false;
    dialog.querySelectorAll('button').forEach(button =>
      button.addEventListener('click', () => {
        result = button.value === 'ok';
        dialog.close();
      }),
    );
    dialog.addEventListener('close', () => {
      dialog.remove();
      opener?.focus();
      resolve(result);
    });
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('button[value=cancel]')!.focus();
  });
}
