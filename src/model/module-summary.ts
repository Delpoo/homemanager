import type { ModuleId } from './modules.js';
import type { ModelDevice } from './types.js';
import type { GestureBinding } from './gestures.js';

/** One line under each module card (#71), as a translation key and its values: the
 * editor translates it, so the model stays free of the UI layers. */
export interface Summary {
  key: string;
  vars?: Record<string, string | number>;
}
export interface SummaryContext {
  /** Rules (and kept warnings) that affect this symbol. */
  rules: number;
  /** A control's name, for gestures that run one. */
  controlLabel: (id: string) => string | undefined;
}

/** What a module adds, for the + Agregar list (mockup 3). */
export const MODULE_PURPOSE: Record<ModuleId, string> = {
  device: 'Lo conecta a un dispositivo de Home Assistant y a sus lecturas.',
  indicators: 'Muestra valores en el símbolo, como temperatura o batería.',
  gestures: 'Decide qué pasa al tocarlo y al mantenerlo pulsado.',
  control: 'Arma los botones y deslizadores de su control completo.',
  pinned: 'Pone atajos de su control junto al símbolo.',
  native: 'Abre un panel propio de Home Assistant.',
  rules: 'Lista las reglas que avisan o lo resaltan.',
};
export const MODULE_ICONS: Record<ModuleId, string> = {
  device: 'mdi:link-variant',
  indicators: 'mdi:gauge',
  gestures: 'mdi:gesture-tap',
  control: 'mdi:tune-variant',
  pinned: 'mdi:pin-outline',
  native: 'mdi:view-list-outline',
  rules: 'mdi:format-list-checks',
};

function gestureName(binding: GestureBinding | undefined, context: SummaryContext, fallback: string): Summary {
  if (binding === undefined) return { key: fallback };
  if (binding === null) return { key: 'control completo' };
  if (typeof binding === 'string') return { key: '{name}', vars: { name: context.controlLabel(binding) ?? binding } };
  switch (binding.action) {
    case 'control':
      return { key: '{name}', vars: { name: context.controlLabel(binding.controlId ?? '') ?? '—' } };
    case 'screen':
      return { key: 'pantalla' };
    case 'panel':
      return { key: 'control completo' };
    case 'native':
      return { key: 'panel avanzado' };
    default:
      return { key: 'nada' };
  }
}

export function moduleSummary(id: ModuleId, device: ModelDevice, context: SummaryContext): Summary | Summary[] {
  const b = device.bindings;
  switch (id) {
    case 'device': {
      if (!b.entityId && !b.deviceId) return { key: 'Sin vincular' };
      const readings = new Set([...(b.entityId ? [b.entityId] : []), ...(b.readings ?? [])]).size;
      return readings === 1 ? { key: '1 lectura' } : { key: '{count} lecturas', vars: { count: readings } };
    }
    case 'indicators':
      return {
        key:
          device.display.show === 'value'
            ? 'Muestra el valor'
            : device.display.show === 'both'
              ? 'Muestra icono y valor'
              : 'Muestra el icono',
      };
    case 'gestures':
      return [
        { key: 'Tocar:' },
        gestureName(b.tap, context, b.primaryAction ? 'acción principal' : 'control completo'),
        { key: '· Mantener:' },
        gestureName(b.hold, context, 'control completo'),
      ];
    case 'control': {
      const count = b.controls?.length ?? 0;
      if (b.remoteId && !count) return { key: 'Control RF' };
      if (b.irRemoteId && !count) return { key: 'Control IR' };
      return count === 1
        ? { key: '1 control' }
        : count
          ? { key: '{count} controles', vars: { count } }
          : { key: 'Sin controles' };
    }
    case 'pinned': {
      const count = device.display.pinned?.length ?? 0;
      return count === 1
        ? { key: '1 atajo' }
        : count
          ? { key: '{count} atajos', vars: { count } }
          : { key: 'Sin atajos' };
    }
    case 'native':
      return { key: b.advancedPopupId ? 'Panel elegido' : 'Sin panel' };
    case 'rules':
      return context.rules === 1
        ? { key: '1 regla lo afecta' }
        : context.rules
          ? { key: '{count} reglas lo afectan', vars: { count: context.rules } }
          : { key: 'Ninguna regla lo afecta' };
  }
}
