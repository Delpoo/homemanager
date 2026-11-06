import type { RfDevice, RfTransmitter } from '../integration/rf.js';
import type { IrDevice } from '../integration/remotes.js';

/** One physical ESPHome board, with what it can do for remotes. Home Assistant
 * reports RF (the HomeManager RF package) and IR (ESPHome IR Proxy) separately:
 * this joins them by device, so each board shows once. */
export interface Equipment {
  key: string;
  name: string;
  /** Home Assistant device id, for its page in Settings. */
  deviceId: string | null;
  online: boolean;
  rf: RfDevice | null;
  /** Sends and listens to RF with the HomeManager RF package. */
  rfReady: boolean;
  rfListens: boolean;
  irReceiver: IrDevice | null;
  irEmitter: IrDevice | null;
  /** 'remote': sends or listens (RF or IR); 'other': an ESPHome device that does
   * neither (an energy meter); 'offline': not connected to Home Assistant. */
  group: 'remote' | 'other' | 'offline';
}

/** "Athom A · IR Proxy Receiver" → "Athom A". */
const boardOf = (device: IrDevice): string => device.device_name ?? device.name.split(' · ')[0];

export function equipmentOf(
  rfDevices: readonly RfDevice[],
  transmitters: readonly RfTransmitter[],
  irReceivers: readonly IrDevice[],
  irEmitters: readonly IrDevice[],
): Equipment[] {
  const list: Equipment[] = [];
  const find = (deviceId: string | null | undefined, name: string) =>
    list.find(item => (deviceId && item.deviceId === deviceId) || item.name === name);
  for (const device of rfDevices)
    list.push({
      key: device.id,
      name: device.name,
      deviceId: device.device_id,
      online: device.online,
      rf: device,
      rfReady: device.online && device.has_package,
      rfListens: device.online && device.has_package && device.can_capture,
      irReceiver: null,
      irEmitter: null,
      group: 'other',
    });
  // A transmitter Home Assistant still lists but the devices page did not.
  for (const transmitter of transmitters)
    if (!find(transmitter.device_id, transmitter.name))
      list.push({
        key: transmitter.id,
        name: transmitter.name,
        deviceId: transmitter.device_id,
        online: true,
        rf: null,
        rfReady: true,
        rfListens: transmitter.can_capture,
        irReceiver: null,
        irEmitter: null,
        group: 'other',
      });
  const addIr = (device: IrDevice, role: 'irReceiver' | 'irEmitter') => {
    const name = boardOf(device);
    let item = find(device.device, name);
    if (!item) {
      item = {
        key: device.device ?? device.id,
        name,
        deviceId: device.device ?? null,
        online: true,
        rf: null,
        rfReady: false,
        rfListens: false,
        irReceiver: null,
        irEmitter: null,
        group: 'other',
      };
      list.push(item);
    }
    item[role] ??= device;
  };
  for (const device of irReceivers) addIr(device, 'irReceiver');
  for (const device of irEmitters) addIr(device, 'irEmitter');
  for (const item of list)
    item.group = !item.online ? 'offline' : item.rfReady || item.irReceiver || item.irEmitter ? 'remote' : 'other';
  const order = { remote: 0, other: 1, offline: 2 };
  return list.sort((a, b) => order[a.group] - order[b.group] || a.name.localeCompare(b.name));
}

/** The emitter on the same board as a receiver, or the only one there is. */
export function emitterFor(receiver: IrDevice | undefined, emitters: readonly IrDevice[]): IrDevice | undefined {
  if (!emitters.length) return undefined;
  if (receiver) {
    const same = emitters.find(
      emitter => (receiver.device && emitter.device === receiver.device) || boardOf(emitter) === boardOf(receiver),
    );
    if (same) return same;
  }
  return emitters[0];
}

/** Where ESPHome Builder opens in this Home Assistant: its sidebar panel (the
 * same link as in the sidebar), else the Supervisor ingress path. */
export function builderPath(
  panels: Record<string, { url_path?: string; title?: string | null; component_name?: string }> | undefined,
  fallback: string | null,
): string | null {
  const panel = Object.values(panels ?? {}).find(item => /esphome/i.test(`${item.url_path ?? ''} ${item.title ?? ''}`));
  return panel?.url_path ? `/${panel.url_path}` : fallback;
}
