/** Compatibility API for existing panels. Capability decisions live in the pure model. */
import { getLanguage, t } from '../i18n/index.js';
import { stateName } from '../model/names.js';
import * as model from '../model/control-capabilities.js';
export type { Command, Control, ScriptFieldControl } from '../model/control-capabilities.js';
export {
  humanize,
  domainOf,
  scriptFieldControls,
  defaultPrimaryCommand,
  suggestPresentation,
  isActiveValue,
} from '../model/control-capabilities.js';
export function entityControls(...args: Parameters<typeof model.entityControls>): model.Control[] {
  return model.entityControls(...args).map(control => ({
    ...control,
    label: t(control.label),
    ...(control.kind === 'select'
      ? {
          options: control.options.map(option => ({
            ...option,
            label: stateName(option.value, { states: {}, language: getLanguage() }),
          })),
        }
      : {}),
    ...(control.kind === 'buttons'
      ? { buttons: control.buttons.map(button => ({ ...button, label: t(button.label) })) }
      : {}),
  }));
}
export function commandFor(...args: Parameters<typeof model.commandFor>): model.Command {
  try {
    return model.commandFor(...args);
  } catch (error) {
    throw new Error(t(error instanceof Error ? error.message : String(error)));
  }
}
