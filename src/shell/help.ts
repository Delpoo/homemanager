import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { VERSION } from '../version.js';
import { setTips } from '../ui/tips.js';

/** Help (0.13, as in the approved mockup): a search, the hover-help switch, a card per
 * topic, the alerts guide and what each state means. Topics open in place. */
const TOPICS: [string, string][] = [
  ['Usar el plano', 'mdi:gesture-tap'],
  ['Símbolos y módulos', 'mdi:shape-outline'],
  ['Alertas', 'mdi:bell-outline'],
  ['Automatizaciones', 'mdi:robot-outline'],
  ['Controles RF', 'mdi:remote'],
  ['Configuración', 'mdi:cog-outline'],
];
const slug = (title: string) =>
  'help-' +
  title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
export function helpBody(options: { tips?: boolean; guide?: boolean } = {}): string {
  const part = (title: string, lines: string[]) =>
    `<details class="help-part" id="${slug(title)}" data-help-text="${e(
      [t(title), ...lines.map(line => t(line))].join(' ').toLowerCase(),
    )}"><summary>${e(t(title))}</summary>${lines.map(line => `<p>${e(t(line))}</p>`).join('')}</details>`;
  const glyph = (icon: string) => `<ha-icon icon="${icon}" aria-hidden="true"></ha-icon>`;
  const head =
    `<label class="help-search">${glyph('mdi:magnify')}<input type="search" data-help-search placeholder="${e(t('Buscar en la ayuda'))}" aria-label="${e(t('Buscar en la ayuda'))}"></label>` +
    (options.tips !== undefined
      ? `<div class="help-row">${glyph('mdi:tooltip-text-outline')}<span>${e(t('Ayudas al pasar el mouse'))}</span><input type="checkbox" role="switch" data-tips aria-label="${e(t('Ayudas al pasar el mouse'))}"${options.tips ? ' checked' : ''}></div>`
      : '') +
    `<div class="help-grid">${TOPICS.map(([title, icon]) => `<button type="button" class="help-card" data-help-topic="${slug(title)}">${glyph(icon)}<b>${e(t(title))}</b></button>`).join('')}${options.guide ? `<button type="button" class="help-card" data-command="alerts-guide">${glyph('mdi:school-outline')}<b>${e(t('Guía de alertas'))}</b></button>` : ''}</div>`;
  return (
    head +
    part('Usar el plano', [
      'Tocá un símbolo para su acción principal. Mantenelo pulsado, hacé clic derecho o usá el botón ⋯ para abrir su control completo.',
      'Arrastrá para desplazarte, pellizcá o usá la rueda para acercar, y tocá dos veces para ampliar. Los números agrupan dispositivos cercanos: tocalos para acercarte.',
      '⌂ vuelve a la vista inicial y ⛶ pone el plano a pantalla completa.',
    ]) +
    part('Símbolos y módulos', [
      'Cada símbolo tiene una base (nombre, icono, color, espacio y tamaño) y módulos que le suman cosas: dispositivo, indicadores, gestos, control, atajos y alertas.',
      'Por ejemplo, a un robot aspirador le podés poner su estado como valor y dos programas de limpieza como atajos.',
      'Para editar, tocá ✎. Los cambios se ven en ámbar hasta que los guardás.',
    ]) +
    part('Alertas', [
      'Una alerta avisa o resalta un símbolo cuando una lectura pasa un límite, por ejemplo «humedad del suelo menos de 20 % durante 10 minutos».',
      'Se arma como una frase: qué lectura mirar, la condición, el límite y cuánto tiempo. La vista previa dice si ahora se activaría.',
      'Las incluidas (batería baja, sin conexión, seguridad) ya vienen, con límites que podés cambiar. Ninguna alerta envía comandos.',
      'En Configuración › Alertas, el birrete abre una guía de cinco pasos.',
    ]) +
    part('Automatizaciones', [
      'Una automatización hace cosas sola: Cuando → Hacer → Comprobar → Si falla. Por ejemplo, «Dormir»: a las 23:30 apaga los aires y la luz.',
      'Comprobar mira el consumo de cada aparato: si no baja en el tiempo elegido, reenvía la orden hasta las veces que digas. Si el medidor no tiene datos, no reenvía.',
      'Si falla, el símbolo y Ahora muestran una alerta, y Home Assistant deja un aviso. La próxima vez que salga bien, la alerta se va.',
      'Con la ★ queda como botón arriba de Ahora. Se guardan como automatizaciones de Home Assistant, así que funcionan aunque la app esté cerrada.',
    ]) +
    part('Controles RF', [
      'Un control RF es un control remoto infrarrojo o de radio que HomeManager aprende botón por botón.',
      'Abrilo desde Configuración › Controles, elegí Nuevo control y seguí los pasos de Aprender botones.',
    ]) +
    part('Configuración', [
      'El botón ⚙ abre Configuración, con las secciones agrupadas. Cada una dice debajo del título para qué sirve.',
      'Estado de la casa lista lo que no funciona y te lleva a arreglarlo.',
    ]) +
    `<div class="help-lbl">${e(t('Estados'))}</div><div class="help-states">${(
      [
        ['ok', 'Confirmado', 'Medido y comprobado'],
        ['warn', 'Estimado', 'Lectura sin confirmar'],
        ['info', 'Comando aceptado', 'Home Assistant recibió la orden; el efecto no está confirmado'],
        ['muted', 'Desconocido / error', 'Sin datos o la orden falló'],
      ] as const
    )
      .map(
        ([tone, name, text]) =>
          `<span class="help-state" data-tone="${tone}">${e(t(name))}</span><span>${e(t(text))}</span>`,
      )
      .join('')}</div>` +
    `<p class="note">${e(t('Versión {version}', { version: VERSION }))}</p>`
  );
}

export const helpStyles = `
.help-search{display:flex;align-items:center;gap:8px;min-height:42px;padding:0 12px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface)}
.help-search ha-icon{--mdc-icon-size:20px;color:var(--hm-muted)}.help-search input{flex:1;min-width:0;border:0;background:transparent;min-height:38px;padding:0}
.help-search input:focus{outline:none}
.help-row{display:flex;align-items:center;gap:10px;min-height:44px}.help-row ha-icon{--mdc-icon-size:20px;color:var(--hm-brand)}.help-row span{flex:1}
.help-row input[role=switch]{appearance:none;-webkit-appearance:none;width:42px;min-width:42px;height:24px;min-height:24px;margin:0;padding:0;border:0;border-radius:12px;background:var(--hm-line);position:relative;cursor:pointer}
.help-row input[role=switch]::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--hm-surface);box-shadow:var(--hm-shadow);transition:left .15s}
.help-row input[role=switch]:checked{background:var(--hm-brand)}.help-row input[role=switch]:checked::after{left:21px}
.help-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.help-card{display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-height:84px;padding:12px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface);color:var(--hm-ink);text-align:left;cursor:pointer}
.help-card:hover{border-color:var(--hm-brand)}.help-card ha-icon{--mdc-icon-size:24px;color:var(--hm-brand)}.help-card b{font-weight:500;font-size:13.5px}
.help-part[hidden]{display:none}
/* The cards are the index: a topic shows once opened or found. */
.help-grid~.help-part:not([open]){display:none}
.help-lbl{margin-top:6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--hm-muted)}
.help-states{display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:center;font-size:13px}
.help-state{justify-self:start;display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:color-mix(in srgb,var(--c) 14%,transparent);color:var(--c);font-weight:500;font-size:12.5px}
.help-state::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--c)}
.help-state[data-tone=ok]{--c:var(--hm-ok,#3f8f5f)}.help-state[data-tone=warn]{--c:var(--hm-warn)}.help-state[data-tone=info]{--c:#3f7fbf}.help-state[data-tone=muted]{--c:var(--hm-muted)}
`;

/** Search and topic cards, wherever Help is shown. */
export function bindHelp(root: ParentNode): void {
  // A change inside a shadow root does not reach the document: the switch saves itself.
  root.querySelector<HTMLInputElement>('[data-tips]')?.addEventListener('change', event => {
    setTips((event.target as HTMLInputElement).checked);
  });
  const search = root.querySelector<HTMLInputElement>('[data-help-search]');
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    root.querySelectorAll<HTMLDetailsElement>('.help-part').forEach(part => {
      const match = !query || (part.dataset.helpText ?? '').includes(query);
      part.hidden = !match;
      part.open = !!query && match;
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-help-topic]').forEach(card =>
    card.addEventListener('click', () => {
      const part = root.querySelector<HTMLDetailsElement>(`#${card.dataset.helpTopic}`);
      if (!part) return;
      part.hidden = false;
      part.open = true;
      part.scrollIntoView({ block: 'nearest' });
      part.querySelector<HTMLElement>('summary')?.focus();
    }),
  );
}
