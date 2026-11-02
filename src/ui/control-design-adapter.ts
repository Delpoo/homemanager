import { t } from '../i18n/index.js';
import type { Configuration, Device, DeviceControl } from '../card/types.js';
import { controlsOf, serviceLabel } from '../card/device-controls.js';
import { layoutFromControls, type ControlPiece } from '../model/control-layout.js';
import type { RfRemote } from '../integration/rf.js';
import { ControlView, type ControlHost } from './control-view.js';

/** A visual adapter, never an RF transport. Actions remain in the plan and
 * every executed piece uses the existing ControlHost/adapter permission path. */
export function designRemote(device: Device, configuration: Configuration, controls = controlsOf(device)): RfRemote {
  return {
    id: device.id,
    name: device.display.label,
    icon: device.display.icon,
    description: null,
    transmitter: '',
    protocol: 1,
    nbits: 24,
    pulse_us: 350,
    repeats: 5,
    wait_us: 0,
    measured_pulse_us: null,
    parts: [],
    buttons: Object.entries(configuration.actions).map(([id, a]) => ({
      id,
      name: `${serviceLabel(a.service, a.domain)} · ${(Array.isArray(a.target.entity_id) ? a.target.entity_id : [a.target.entity_id]).map(id => id.replace(/^[^.]+\./, '').replace(/_/g, ' ')).join(', ')}`,
      icon: null,
      fingerprint: '',
    })),
    layout: device.bindings.layout ?? layoutFromControls(controls),
  };
}
export function pieceControl(piece: ControlPiece, controls: DeviceControl[]): DeviceControl | null {
  if (['title', 'separator', 'indicator'].includes(piece.type)) return null;
  if (piece.type === 'control') return controls.find(c => c.id === piece.buttons[0]) ?? null;
  const type =
    piece.type === 'modes'
      ? 'select'
      : piece.type === 'steps'
        ? 'slider'
        : piece.type === 'toggle'
          ? piece.buttons.length === 1
            ? 'button'
            : 'cycle'
          : piece.type;
  return {
    id: `design-${piece.id}`,
    type: type as DeviceControl['type'],
    label: piece.label ?? t('Control'),
    steps: piece.buttons.map(actionId => ({ actionId, ...(piece.icon ? { icon: piece.icon } : {}) })),
  };
}
export function renderDesignPiece(
  piece: ControlPiece,
  controls: DeviceControl[],
  host: ControlHost,
  views?: ControlView[],
): HTMLElement | null {
  if (['title', 'separator', 'indicator'].includes(piece.type)) return null;
  const control = pieceControl(piece, controls);
  if (!control) {
    const p = document.createElement('p');
    p.textContent = t('Este control ya no está disponible.');
    return p;
  }
  const view = new ControlView(control, host, false);
  views?.push(view);
  return view.element;
}
