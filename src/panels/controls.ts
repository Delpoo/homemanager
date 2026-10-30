/** Compatibility API for existing panels. Capability decisions live in the pure model. */
import { t } from '../i18n/index.js';
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
