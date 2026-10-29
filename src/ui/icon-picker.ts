import { t } from '../i18n/index.js';
import { escapeHTML as e } from '../card/types.js';
import { tokens } from './theme.js';

/**
 * Icon chooser: a button that shows the icon and opens a searchable, scrollable
 * grid. With nothing typed it suggests the common icons; typing filters them by
 * name or by words in Spanish or English; any other `mdi:` name can be typed and
 * used as is. The grid is a native popover, so a scrolling sheet never clips it.
 * Fires `change` with `value`.
 */
const ICONS: [string, string][] = [
  ['lightbulb', 'luz bombilla lampara light'],
  ['lightbulb-outline', 'luz bombilla light'],
  ['lightbulb-off', 'luz apagada off'],
  ['lightbulb-group', 'luces grupo lights'],
  ['ceiling-light', 'luz techo plafon ceiling'],
  ['ceiling-light-outline', 'luz techo plafon'],
  ['ceiling-fan', 'ventilador techo fan'],
  ['ceiling-fan-light', 'ventilador luz techo fan light'],
  ['lamp', 'lampara velador mesa'],
  ['floor-lamp', 'lampara pie floor'],
  ['desk-lamp', 'lampara escritorio desk'],
  ['wall-sconce', 'aplique pared luz wall'],
  ['led-strip-variant', 'tira led strip'],
  ['string-lights', 'guirnalda luces'],
  ['track-light', 'riel spot luz'],
  ['outdoor-lamp', 'farol exterior luz'],
  ['fan', 'ventilador fan'],
  ['fan-off', 'ventilador apagado off'],
  ['fan-speed-1', 'velocidad 1 ventilador speed'],
  ['fan-speed-2', 'velocidad 2 ventilador speed'],
  ['fan-speed-3', 'velocidad 3 ventilador speed'],
  ['air-conditioner', 'aire acondicionado clima ac'],
  ['air-purifier', 'purificador aire'],
  ['air-humidifier', 'humidificador'],
  ['radiator', 'calefactor radiador calefaccion heater'],
  ['heat-wave', 'calor calefaccion'],
  ['snowflake', 'frio nieve cool'],
  ['thermometer', 'temperatura termometro'],
  ['thermostat', 'termostato clima'],
  ['water-percent', 'humedad humidity'],
  ['weather-sunny', 'sol dia'],
  ['weather-night', 'noche luna'],
  ['power', 'encendido apagado power'],
  ['power-off', 'apagar off'],
  ['power-plug', 'enchufe toma plug'],
  ['power-plug-off', 'enchufe apagado'],
  ['power-socket-eu', 'toma corriente enchufe socket'],
  ['toggle-switch', 'interruptor switch'],
  ['toggle-switch-off', 'interruptor apagado'],
  ['light-switch', 'llave luz interruptor'],
  ['gesture-tap-button', 'boton pulsar button'],
  ['remote', 'control remoto mando'],
  ['remote-tv', 'control remoto tele'],
  ['radio-tower', 'antena rf radio'],
  ['access-point', 'antena wifi'],
  ['curtains', 'cortina curtains'],
  ['curtains-closed', 'cortina cerrada'],
  ['blinds', 'persiana blinds'],
  ['blinds-open', 'persiana abierta'],
  ['roller-shade', 'roller cortina'],
  ['window-shutter', 'persiana postigo'],
  ['garage', 'garaje porton'],
  ['garage-open', 'garaje abierto'],
  ['gate', 'porton reja'],
  ['door', 'puerta door'],
  ['door-open', 'puerta abierta'],
  ['window-closed-variant', 'ventana cerrada'],
  ['window-open-variant', 'ventana abierta'],
  ['lock', 'cerradura candado lock'],
  ['lock-open-variant', 'abierto cerradura'],
  ['doorbell', 'timbre'],
  ['bell', 'campana alarma'],
  ['alarm-light', 'alarma sirena'],
  ['shield-home', 'seguridad alarma casa'],
  ['cctv', 'camara seguridad'],
  ['camera', 'camara foto'],
  ['motion-sensor', 'movimiento presencia sensor'],
  ['smoke-detector', 'humo detector'],
  ['water', 'agua'],
  ['water-off', 'agua cortada'],
  ['water-pump', 'bomba agua'],
  ['water-boiler', 'termotanque calefon boiler'],
  ['pipe-valve', 'valvula canilla'],
  ['sprinkler', 'riego aspersor'],
  ['flower', 'planta flor'],
  ['sprout', 'planta brote'],
  ['pool', 'pileta piscina'],
  ['television', 'tele television tv'],
  ['television-off', 'tele apagada'],
  ['monitor', 'monitor pantalla'],
  ['speaker', 'parlante altavoz'],
  ['volume-high', 'volumen sonido'],
  ['volume-off', 'silencio mute'],
  ['music', 'musica'],
  ['play', 'reproducir play'],
  ['pause', 'pausa'],
  ['stop', 'detener stop'],
  ['projector', 'proyector'],
  ['gamepad-variant', 'consola juegos'],
  ['router-wireless', 'router wifi'],
  ['laptop', 'notebook computadora'],
  ['desktop-tower-monitor', 'pc computadora'],
  ['printer', 'impresora'],
  ['robot-vacuum', 'aspiradora robot'],
  ['washing-machine', 'lavarropas lavadora'],
  ['tumble-dryer', 'secarropas secadora'],
  ['dishwasher', 'lavavajillas'],
  ['fridge', 'heladera nevera refrigerador'],
  ['stove', 'cocina hornalla'],
  ['microwave', 'microondas'],
  ['coffee-maker', 'cafetera'],
  ['kettle', 'pava hervidor'],
  ['toaster', 'tostadora'],
  ['iron', 'plancha'],
  ['hair-dryer', 'secador pelo'],
  ['bed', 'cama dormitorio'],
  ['sofa', 'sillon living'],
  ['table-furniture', 'mesa'],
  ['desk', 'escritorio'],
  ['shower', 'ducha bano'],
  ['toilet', 'bano inodoro'],
  ['home', 'casa hogar'],
  ['home-outline', 'casa'],
  ['stairs', 'escalera'],
  ['car', 'auto coche'],
  ['car-electric', 'auto electrico'],
  ['ev-station', 'cargador auto'],
  ['bicycle', 'bicicleta'],
  ['flash', 'energia electricidad'],
  ['lightning-bolt', 'energia rayo'],
  ['solar-panel', 'panel solar'],
  ['battery', 'bateria'],
  ['gauge', 'medidor indicador'],
  ['chart-line', 'grafico consumo'],
  ['clock-outline', 'reloj hora'],
  ['timer-outline', 'temporizador'],
  ['calendar', 'calendario'],
  ['brightness-6', 'brillo intensidad'],
  ['palette', 'color'],
  ['tune-vertical-variant', 'ajuste deslizador slider'],
  ['arrow-up-bold', 'subir arriba'],
  ['arrow-down-bold', 'bajar abajo'],
  ['plus', 'mas'],
  ['minus', 'menos'],
  ['swap-horizontal', 'direccion invertir'],
  ['rotate-3d-variant', 'rotar oscilar'],
  ['sync', 'ciclo repetir'],
  ['dog', 'perro mascota'],
  ['cat', 'gato mascota'],
  ['baby-carriage', 'bebe'],
  ['account', 'persona usuario'],
  ['star', 'favorito'],
  ['heart', 'corazon'],
  ['shape', 'forma generico'],
];
const fold = (value: string) => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VALID = /^[a-z0-9-]+:[a-z0-9-]+$/;

/** Icons matching a query; extra names (for example icons of entities) join the list. */
export function searchIcons(query: string, extra: string[] = []): string[] {
  const words = fold(query.replace(/^mdi:/, '')).split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const all: [string, string][] = [
    ...ICONS.map(([name, words]) => [`mdi:${name}`, `${name} ${words}`] as [string, string]),
    ...extra.filter(icon => VALID.test(icon)).map(icon => [icon, icon] as [string, string]),
  ];
  const found: string[] = [];
  for (const [icon, haystack] of all) {
    if (seen.has(icon)) continue;
    seen.add(icon);
    const text = fold(haystack);
    if (words.every(word => text.includes(word))) found.push(icon);
  }
  return found;
}

class IconPicker extends HTMLElement {
  static observedAttributes = ['value'];
  private root = this.attachShadow({ mode: 'open' });
  /** Icons of the session's entities, offered after the built-in ones. */
  extra: string[] = [];
  get value(): string {
    return this.getAttribute('value') ?? '';
  }
  set value(icon: string) {
    this.setAttribute('value', icon);
  }
  connectedCallback(): void {
    if (this.root.childElementCount) return;
    const label = this.getAttribute('label') ?? t('Icono');
    const wide = this.hasAttribute('wide');
    this.root.innerHTML = `<style>${tokens}:host{display:inline-block}${wide ? ':host{display:block}' : ''}
button{font:inherit;color:inherit;cursor:pointer;background:var(--hm-bg);border:1px solid var(--hm-line);border-radius:9px;min-height:44px}
.trigger{display:flex;align-items:center;gap:8px;width:100%;padding:0 10px;text-align:left}
.trigger.small{width:44px;padding:0;justify-content:center}
.trigger ha-icon{--mdc-icon-size:22px}.trigger .name{flex:1;font-size:13px;color:var(--hm-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[popover]{position:fixed;margin:0;width:min(340px,calc(100vw - 24px));max-height:min(380px,calc(100dvh - 24px));display:none;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-bg);color:var(--hm-text);box-shadow:var(--hm-shadow)}
[popover]:popover-open{display:flex}
input{font:inherit;color:inherit;width:100%;min-height:44px;border:1px solid var(--hm-line);border-radius:8px;background:var(--hm-bg);padding:8px;box-sizing:border-box}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(48px,1fr));gap:4px;overflow:auto;min-height:0}
.grid button{min-height:48px;display:grid;place-items:center;padding:0}
.grid button[aria-pressed=true]{border-color:var(--hm-accent);box-shadow:0 0 0 2px var(--hm-accent) inset}
.grid ha-icon{--mdc-icon-size:24px}
.none{font-size:13px;color:var(--hm-muted);padding:8px}
button:focus-visible,input:focus-visible{outline:3px solid var(--hm-accent);outline-offset:2px}</style>
<button type="button" class="trigger${wide ? '' : ' small'}" aria-haspopup="dialog" aria-label="${e(label)}" title="${e(label)}"><ha-icon></ha-icon>${wide ? '<span class="name"></span>' : ''}</button>
<div popover="auto" role="dialog" aria-label="${e(label)}"><input type="search" aria-label="${e(t('Buscar icono'))}" placeholder="${e(t('Buscar: luz, ventilador, mdi:…'))}"><div class="grid" role="listbox" aria-label="${e(t('Iconos'))}"></div></div>`;
    const trigger = this.root.querySelector<HTMLButtonElement>('.trigger')!;
    const panel = this.root.querySelector<HTMLElement>('[popover]')!;
    const search = this.root.querySelector<HTMLInputElement>('input')!;
    trigger.addEventListener('click', () => {
      search.value = '';
      this.paint('');
      panel.showPopover?.();
      const anchor = trigger.getBoundingClientRect(),
        box = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.min(innerWidth - box.width - 12, anchor.left))}px`;
      panel.style.top = `${anchor.bottom + box.height + 12 <= innerHeight ? anchor.bottom + 6 : Math.max(12, anchor.top - box.height - 6)}px`;
      search.focus();
    });
    search.addEventListener('input', () => this.paint(search.value));
    search.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const typed = search.value.trim();
        const first = this.root.querySelector<HTMLButtonElement>('.grid button');
        if (VALID.test(typed)) this.choose(typed);
        else if (first) this.choose(first.dataset.icon!);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.root.querySelector<HTMLButtonElement>('.grid button')?.focus();
      }
    });
    this.root.querySelector('.grid')!.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-icon]');
      if (button) this.choose(button.dataset.icon!);
    });
    this.update();
  }
  attributeChangedCallback(): void {
    this.update();
  }
  private update(): void {
    this.root.querySelector('.trigger ha-icon')?.setAttribute('icon', this.value || 'mdi:shape');
    const name = this.root.querySelector('.name');
    if (name) name.textContent = this.value;
  }
  private paint(query: string): void {
    const icons = searchIcons(query, this.extra);
    const typed = query.trim();
    // A full name typed by hand is offered even if it is not in the list.
    if (VALID.test(typed) && !icons.includes(typed)) icons.unshift(typed);
    this.root.querySelector('.grid')!.innerHTML = icons.length
      ? icons
          .map(
            icon =>
              `<button type="button" role="option" data-icon="${e(icon)}" aria-pressed="${icon === this.value}" aria-label="${e(icon)}" title="${e(icon)}"><ha-icon icon="${e(icon)}"></ha-icon></button>`,
          )
          .join('')
      : `<p class="none">${e(t('Sin coincidencias. Escribí el nombre completo, p. ej. mdi:sofa.'))}</p>`;
  }
  private choose(icon: string): void {
    this.value = icon;
    this.root.querySelector<HTMLElement>('[popover]')!.hidePopover?.();
    this.root.querySelector<HTMLButtonElement>('.trigger')!.focus();
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }
}
if (!customElements.get('homemanager-icon-picker')) customElements.define('homemanager-icon-picker', IconPicker);
export const iconPicker = (value: string, label: string, extra = '') =>
  `<homemanager-icon-picker value="${e(value)}" label="${e(label)}" ${extra}></homemanager-icon-picker>`;
