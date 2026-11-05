import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { VERSION } from '../version.js';

/** Help (#77): an index in plain words, with an example where it helps. */
export function helpBody(): string {
  const part = (title: string, lines: string[]) =>
    `<details class="help-part"><summary>${e(t(title))}</summary>${lines.map(line => `<p>${e(t(line))}</p>`).join('')}</details>`;
  return (
    part('Usar el plano', [
      'Tocá un símbolo para su acción principal. Mantenelo pulsado, hacé clic derecho o usá el botón ⋯ para abrir su control completo.',
      'Arrastrá para desplazarte, pellizcá o usá la rueda para acercar, y tocá dos veces para ampliar. Los números agrupan dispositivos cercanos: tocalos para acercarte.',
      '⌂ vuelve a la vista inicial y ⛶ pone el plano a pantalla completa.',
    ]) +
    part('Símbolos y módulos', [
      'Cada símbolo tiene una base (nombre, icono, color, espacio y tamaño) y módulos que le suman cosas: dispositivo, indicadores, gestos, control, atajos y reglas.',
      'Por ejemplo, a un robot aspirador le podés poner su estado como valor y dos programas de limpieza como atajos.',
      'Para editar, tocá ✎. Los cambios se ven en ámbar hasta que los guardás.',
    ]) +
    part('Reglas y alertas', [
      'Una regla avisa o resalta un símbolo cuando una lectura pasa un límite, por ejemplo «humedad del suelo menos de 20 %».',
      'Las reglas base (batería baja, sin conexión, seguridad) ya vienen, con límites que podés cambiar. Ninguna regla envía comandos.',
    ]) +
    part('Controles RF', [
      'Un control RF es un control remoto infrarrojo o de radio que HomeManager aprende botón por botón.',
      'Abrilo desde Configuración › Controles, elegí Nuevo control y seguí los pasos de Aprender botones.',
    ]) +
    part('Configuración', [
      'El botón ⚙ abre Configuración, con las secciones agrupadas. Cada una dice debajo del título para qué sirve.',
      'Estado de la casa lista lo que no funciona y te lleva a arreglarlo.',
    ]) +
    `<details class="help-part" open><summary>${e(t('Qué significa cada estado'))}</summary><dl class="confidence-list"><dt>${e(t('Confirmado'))}</dt><dd>${e(t('Feedback medido y verificado.'))}</dd><dt>${e(t('Estimado'))}</dt><dd>${e(t('Lectura sin confirmación independiente.'))}</dd><dt>${e(t('Comando aceptado'))}</dt><dd>${e(t('HA aceptó la llamada; el efecto físico no está confirmado.'))}</dd><dt>${e(t('Desconocido / error'))}</dt><dd>${e(t('Sin evidencia válida o llamada fallida.'))}</dd></dl></details>` +
    `<p class="note">${e(t('Versión {version}', { version: VERSION }))}</p>`
  );
}
