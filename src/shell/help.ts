import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { VERSION } from '../version.js';

/** How to use the plan and what each state means; shown in Settings › Help. */
export function helpBody(): string {
  const p = (text: string) => `<p>${e(text)}</p>`;
  return (
    p(
      t(
        'Tocá un dispositivo para su acción principal. Mantenelo pulsado, hacé clic derecho o usá el botón ⋯ para abrir sus controles.',
      ),
    ) +
    p(
      t(
        'Arrastrá para desplazarte, pellizcá o usá la rueda para acercar, y tocá dos veces para ampliar. Los números agrupan dispositivos cercanos: tocalos para acercarte.',
      ),
    ) +
    p(t('Versión {version}', { version: VERSION })) +
    `<dl class="confidence-list"><dt>${e(t('Confirmado'))}</dt><dd>${e(t('Feedback medido y verificado.'))}</dd><dt>${e(t('Estimado'))}</dt><dd>${e(t('Lectura sin confirmación independiente.'))}</dd><dt>${e(t('Comando aceptado'))}</dt><dd>${e(t('HA aceptó la llamada; el efecto físico no está confirmado.'))}</dd><dt>${e(t('Desconocido / error'))}</dt><dd>${e(t('Sin evidencia válida o llamada fallida.'))}</dd></dl>`
  );
}
