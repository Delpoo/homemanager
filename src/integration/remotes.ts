import type { Hass } from '../card/types.js';
import type { RfButton, RfWidget } from './rf.js';
import type { DrawableRemote } from '../rf/layout.js';

export interface IrDevice {
  id: string;
  name: string;
}

export interface IrRemote {
  source: 'ir';
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  buttons: RfButton[];
  layout: RfWidget[] | null;
}

export function drawIr(remote: IrRemote): DrawableRemote {
  return { id: remote.id, buttons: remote.buttons, parts: [], layout: remote.layout ?? null };
}

export type IrCaptured = { candidate_id: string; count: number; duration_us: number };
export type IrCaptureEvent =
  | IrCaptured
  | { candidates: IrCaptured[] }
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
    batch = false,
  ): Promise<() => void> {
    if (!hass.connection?.subscribeMessage) return Promise.reject(new Error('not connected'));
    return hass.connection.subscribeMessage(
      event => listener(event as IrCaptureEvent),
      { type: 'homemanager/remotes/ir/capture', receiver_id: receiverId, ...(batch ? { batch: true } : {}) },
      { resubscribe: false, preCheck: stillListening },
    );
  },
  test: (hass: Hass, replay: IrReplay) => ws<{ result: 'sent' }>(hass, 'ir/test', { ...replay }),
  save: (
    hass: Hass,
    replay: IrReplay,
    buttonName: string,
    target: { remote_id: string; button_id?: string } | { remote_name: string },
  ) => ws<{ id: string }>(hass, 'ir/save', { ...replay, ...target, button_name: buttonName }),
  press: (hass: Hass, remoteId: string, buttonId: string) =>
    ws<{ result: 'sent' }>(hass, 'ir/press', { remote_id: remoteId, button_id: buttonId }),
  editRemote: (
    hass: Hass,
    remoteId: string,
    changes: (Partial<Pick<IrRemote, 'name' | 'description' | 'icon' | 'layout'>> & { emitter?: string }) | null,
  ) => ws<IrRemote | null>(hass, 'ir/remote/edit', { remote_id: remoteId, changes }),
  editButton: (
    hass: Hass,
    remoteId: string,
    buttonId: string,
    changes: {
      name?: string;
      icon?: string | null;
      emitter?: string | null;
      carrier_hz?: number;
      carrier_source?: IrReplay['carrier_source'];
    } | null,
  ) => ws<IrRemote>(hass, 'ir/button/edit', { remote_id: remoteId, button_id: buttonId, changes }),
  settings: (hass: Hass, remoteId: string) => ws<IrSettings>(hass, 'ir/settings', { remote_id: remoteId }),
};

export interface IrSettings {
  emitter: string;
  buttons: Record<string, { emitter: string | null; carrier_hz: number | null; carrier_source: string }>;
}
