import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { installDialogComponents, panelDialog } from './panel-components.js';
import { uiButton } from './components.js';
let activeConfirmation: HTMLDialogElement | undefined;

/** Native modal confirmation: await the result, then mutate. Cancel is focused;
 * the browser traps focus and Esc cancels. The trigger is restored on close. */
export function confirmDialog(
  host: ShadowRoot,
  options: { title: string; message: string; confirm?: string; trigger?: HTMLElement },
): Promise<boolean> {
  if (activeConfirmation?.isConnected && activeConfirmation.open) return Promise.resolve(false);
  const trigger = options.trigger ?? (host.activeElement as HTMLElement | undefined);
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'hm-confirm-title');
  dialog.setAttribute('aria-describedby', 'hm-confirm-message');
  installDialogComponents(host);
  const markup = panelDialog(
    options.title,
    `<p id="hm-confirm-message">${e(options.message)}</p>`,
    uiButton(t('Cancelar'), 'cancel') + uiButton(options.confirm ?? t('Eliminar'), 'confirm', 'danger solid-danger'),
    { descriptionId: 'hm-confirm-message' },
  );
  const template = document.createElement('template');
  template.innerHTML = markup;
  dialog.className = 'k-dialog';
  dialog.innerHTML = template.content.querySelector('dialog')!.innerHTML;
  dialog.setAttribute('aria-labelledby', 'hm-panel-title');
  dialog.querySelector('button')!.setAttribute('autofocus', '');

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
        if (activeConfirmation === dialog) activeConfirmation = undefined;
        const confirmed = dialog.returnValue === 'confirmed';
        dialog.remove();
        if (trigger?.isConnected) trigger.focus();
        resolve(confirmed);
      },
      { once: true },
    );
    host.append(dialog);
    activeConfirmation = dialog;
    dialog.showModal();
  });
}

/** A modal with several answers (for example «Seguir editando», «Descartar», «Guardar»).
 * Resolves with the chosen id, or null when it is dismissed (Esc). The first answer is focused. */
export function choiceDialog(
  host: ShadowRoot,
  options: { title: string; message: string; choices: [string, string, string?][]; trigger?: HTMLElement },
): Promise<string | null> {
  if (activeConfirmation?.isConnected && activeConfirmation.open) return Promise.resolve(null);
  const trigger = options.trigger ?? (host.activeElement as HTMLElement | undefined);
  const dialog = document.createElement('dialog');
  installDialogComponents(host);
  const markup = panelDialog(
    options.title,
    `<p id="hm-confirm-message">${e(options.message)}</p>`,
    options.choices
      .map(([id, label, kind]) => uiButton(label, `choice-${id}`, kind === 'primary' ? 'primary' : 'secondary'))
      .join(''),
    { descriptionId: 'hm-confirm-message' },
  );
  const template = document.createElement('template');
  template.innerHTML = markup;
  dialog.className = 'k-dialog';
  dialog.innerHTML = template.content.querySelector('dialog')!.innerHTML;
  dialog.setAttribute('aria-labelledby', 'hm-panel-title');
  dialog.setAttribute('aria-describedby', 'hm-confirm-message');
  const answers = [...dialog.querySelectorAll<HTMLButtonElement>('.k-dialog-foot button')];
  answers.forEach((button, i) => {
    const id = options.choices[i]?.[0];
    if (id) button.onclick = () => dialog.close(id);
  });
  answers[0]?.setAttribute('autofocus', '');
  return new Promise(resolve => {
    dialog.addEventListener(
      'close',
      () => {
        if (activeConfirmation === dialog) activeConfirmation = undefined;
        const value = dialog.returnValue;
        dialog.remove();
        if (trigger?.isConnected) trigger.focus();
        resolve(options.choices.some(([id]) => id === value) ? value : null);
      },
      { once: true },
    );
    host.append(dialog);
    activeConfirmation = dialog;
    dialog.showModal();
  });
}
