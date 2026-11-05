import type { Hass } from '../card/types.js';

export interface IrDevice {
  id: string;
  name: string;
}

export interface IrRemote {
  source: 'ir';
  id: string;
  name: string;
  buttons: { id: string; name: string }[];
}

export type IrCaptureEvent =
  | { candidate_id: string; count: number; duration_us: number }
  | { status: 'timeout' }
  | { status: 'error'; code: string };

export interface IrReplay {
  candidate_id: string;
  emitter_id: string;
  carrier_hz: number;
  carrier_source: 'estimated' | 'known';
}

function ws<T>(hass: Hass, type: string, fields: Record<string, unknown> = {}): Promise<T> {
  if (!hass.callWS) return Promise.reject(new Error('not connected'));
  return hass.callWS<T>({ type: `homemanager/remotes/${type}`, ...fields });
}

export const remotes = {
  async library(hass: Hass): Promise<IrRemote[]> {
    const { remotes: items } = await ws<{ remotes: (IrRemote | { source: 'rf' })[] }>(hass, 'library');
    return items.filter((remote): remote is IrRemote => remote.source === 'ir');
  },
  devices: (hass: Hass) => ws<{ receivers: IrDevice[]; emitters: IrDevice[] }>(hass, 'ir/devices'),
  capture(
    hass: Hass,
    receiverId: string,
    listener: (event: IrCaptureEvent) => void,
    stillListening: () => boolean,
  ): Promise<() => void> {
    if (!hass.connection?.subscribeMessage) return Promise.reject(new Error('not connected'));
    return hass.connection.subscribeMessage(
      event => listener(event as IrCaptureEvent),
      { type: 'homemanager/remotes/ir/capture', receiver_id: receiverId },
      { resubscribe: false, preCheck: stillListening },
    );
  },
  test: (hass: Hass, replay: IrReplay) => ws<{ result: 'sent' }>(hass, 'ir/test', { ...replay }),
  save: (hass: Hass, replay: IrReplay, buttonName: string, target: { remote_id: string } | { remote_name: string }) =>
    ws<{ id: string }>(hass, 'ir/save', { ...replay, ...target, button_name: buttonName }),
  press: (hass: Hass, remoteId: string, buttonId: string) =>
    ws<{ result: 'sent' }>(hass, 'ir/press', { remote_id: remoteId, button_id: buttonId }),
};
