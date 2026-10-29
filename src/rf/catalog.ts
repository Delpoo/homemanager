import { t } from '../i18n/index.js';
import type { PartKind, WidgetType } from '../integration/rf.js';

/** Labels and suggestions shared by the RF pages. Suggestions only fill
 * fields: nothing about a button depends on its name or icon. */

export const REMOTE_ICONS = [
  'mdi:remote',
  'mdi:ceiling-fan',
  'mdi:ceiling-fan-light',
  'mdi:fan',
  'mdi:lightbulb',
  'mdi:led-strip-variant',
  'mdi:television',
  'mdi:air-conditioner',
  'mdi:blinds',
  'mdi:garage',
  'mdi:gate',
  'mdi:power-socket-eu',
];

export const BUTTON_ICONS = [
  'mdi:power',
  'mdi:power-off',
  'mdi:lightbulb',
  'mdi:lightbulb-off',
  'mdi:fan',
  'mdi:fan-off',
  'mdi:plus',
  'mdi:minus',
  'mdi:brightness-7',
  'mdi:brightness-5',
  'mdi:thermometer',
  'mdi:rotate-3d-variant',
  'mdi:timer-outline',
  'mdi:weather-night',
  'mdi:tune-variant',
  'mdi:star-outline',
];

/** Names offered while learning; each fills the name and an icon. */
export function buttonSuggestions(): [string, string][] {
  return [
    [t('Encender'), 'mdi:power'],
    [t('Apagar'), 'mdi:power-off'],
    [t('Luz'), 'mdi:lightbulb'],
    ...Array.from({ length: 6 }, (_, index): [string, string] => [
      t('Velocidad {level}', { level: index + 1 }),
      `mdi:numeric-${index + 1}`,
    ]),
    [t('Más'), 'mdi:plus'],
    [t('Menos'), 'mdi:minus'],
    [t('Dirección'), 'mdi:rotate-3d-variant'],
    [t('Tono'), 'mdi:thermometer'],
    [t('Temporizador'), 'mdi:timer-outline'],
    [t('Modo noche'), 'mdi:weather-night'],
  ];
}

export function kindLabel(kind: PartKind): string {
  return kind === 'fan' ? t('Ventilador') : t('Luz');
}

export function roleLabel(role: string): string {
  const speed = /^speed_(\d+)$/.exec(role);
  if (speed) return t('Velocidad {level}', { level: speed[1] });
  const labels: Record<string, string> = {
    on: t('Encender'),
    off: t('Apagar'),
    toggle: t('Encender / apagar (alterna)'),
    speed_up: t('Más velocidad'),
    speed_down: t('Menos velocidad'),
    direction: t('Dirección'),
  };
  return labels[role] ?? role;
}

export function widgetLabel(type: WidgetType): string {
  const labels: Record<WidgetType, string> = {
    button: t('Pulsador'),
    toggle: t('Encender / apagar'),
    updown: t('Subir / bajar'),
    steps: t('Deslizador por pasos'),
    modes: t('Selector'),
  };
  return labels[type];
}

export function widgetHelp(type: WidgetType): string {
  const help: Record<WidgetType, string> = {
    button: t('Un toque, un código.'),
    toggle: t('Dos botones (encender y apagar) o uno que alterna.'),
    updown: t('Dos botones juntos: bajar y subir.'),
    steps: t('Una barra de 2 a 12 pasos, cada uno con su botón: velocidades, niveles.'),
    modes: t('De 2 a 8 opciones con nombre, cada una con su botón: tonos, modos.'),
  };
  return help[type];
}

export function icon(name: string | null | undefined): string {
  if (!name || !customElements.get('ha-icon')) return '';
  return `<ha-icon icon="${name.replace(/[^a-z0-9:-]/g, '')}" aria-hidden="true"></ha-icon>`;
}
