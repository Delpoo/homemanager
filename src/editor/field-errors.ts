import { t } from '../i18n/index.js';

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** The app's own message for a field, never the browser bubble (in the browser's language). */
function messageFor(field: Field): string {
  const validity = field.validity;
  if (validity.valueMissing) return t('Completá este campo.');
  if (validity.tooLong) return t('Es demasiado largo.');
  if (validity.rangeUnderflow || validity.rangeOverflow || validity.stepMismatch) return t('Revisá este número.');
  return t('Revisá este valor.');
}

/** Shows translated messages next to every invalid field of the form, focuses the first
 * one and returns whether the form is valid. Each message goes away when its field changes. */
export function showFieldErrors(form: HTMLFormElement): boolean {
  const root = form.getRootNode() as Document | ShadowRoot;
  for (const old of root.querySelectorAll(`.field-error[data-form="${CSS.escape(form.id)}"]`)) old.remove();
  let first: Field | undefined;
  let index = 0;
  // Not form.elements: Home Assistant's frontend makes walking that collection throw.
  const own = `input[form="${CSS.escape(form.id)}"],select[form="${CSS.escape(form.id)}"],textarea[form="${CSS.escape(form.id)}"]`;
  const fields = [
    ...form.querySelectorAll<Field>('input,select,textarea'),
    ...(form.id ? root.querySelectorAll<Field>(own) : []),
  ];
  for (const element of fields) {
    // Only native fields: Home Assistant's own form elements may not answer validity (0.13).
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      !element.willValidate
    )
      continue;
    if (element.validity.valid) {
      element.removeAttribute('aria-invalid');
      continue;
    }
    const id = `${form.id}-error-${index++}`;
    const message = document.createElement('p');
    message.className = 'field-error';
    message.id = id;
    message.dataset.form = form.id;
    message.textContent = messageFor(element);
    element.setAttribute('aria-invalid', 'true');
    element.setAttribute('aria-describedby', id);
    element.insertAdjacentElement('afterend', message);
    element.addEventListener(
      'input',
      () => {
        message.remove();
        element.removeAttribute('aria-invalid');
        element.removeAttribute('aria-describedby');
      },
      { once: true },
    );
    for (let details = element.closest('details'); details; details = details.parentElement?.closest('details') ?? null)
      details.open = true;
    first ??= element;
  }
  first?.focus();
  return !first;
}

export const fieldErrorStyles = `.field-error{margin:2px 0 0;font-size:12px;line-height:1.5;color:var(--hm-error)}[aria-invalid=true]{border-color:var(--hm-error)}`;
