import type { Hass } from '../card/types.js';

/** Websocket client of the RF remote manager (custom_components/homemanager/rf*.py).
 * Codes never travel here: captures are referenced by candidate id and buttons
 * by a short fingerprint. */

export type RfFunction =
  | 'off'
  | 'power'
  | 'light'
  | 'light_on'
  | 'light_off'
  | 'brightness_up'
  | 'brightness_down'
  | 'color_temperature'
  | 'speed_up'
  | 'speed_down'
  | 'direction'
  | 'timer'
  | 'mode'
  | 'other'
  | `speed_${number}`;

export interface RfSettings {
  transmitter: string;
  protocol: number;
  nbits: number;
  pulse_us: number;
  repeats: number;
  wait_us: number;
  speeds: number | null;
}
export interface RfButton {
  id: string;
  name: string;
  function: RfFunction | null;
  fingerprint: string;
}
export interface RfRemote extends RfSettings {
  id: string;
  name: string;
  buttons: RfButton[];
}
export interface RfTransmitter {
  id: string;
  name: string;
  device_id: string | null;
  can_capture: boolean;
}
export interface RfCandidate {
  candidate_id: string;
  transmitter: string;
  protocol: number;
  nbits: number;
  pulse_us: number;
  frames: number;
  bursts: number;
  confirmed: boolean;
  fingerprint: string;
  known_as: string[];
}

function ws<T>(hass: Hass, message: Record<string, unknown>): Promise<T> {
  if (!hass.callWS) return Promise.reject(new Error('not connected'));
  return hass.callWS<T>(message);
}

export const rf = {
  library: (hass: Hass) => ws<{ remotes: RfRemote[] }>(hass, { type: 'homemanager/rf/library' }),
  transmitters: (hass: Hass) =>
    ws<{ transmitters: RfTransmitter[] }>(hass, { type: 'homemanager/rf/transmitters' }).then(
      result => result.transmitters,
    ),
  saveRemote: (hass: Hass, remote: Partial<RfSettings> & { name: string }, remoteId?: string) =>
    ws<RfRemote>(hass, { type: 'homemanager/rf/remote/save', remote, ...(remoteId ? { remote_id: remoteId } : {}) }),
  deleteRemote: (hass: Hass, remoteId: string) =>
    ws<null>(hass, { type: 'homemanager/rf/remote/delete', remote_id: remoteId }),
  saveButton: (
    hass: Hass,
    remoteId: string,
    button: { name: string; function: RfFunction | null },
    options: { buttonId?: string; candidateId?: string } = {},
  ) =>
    ws<RfButton>(hass, {
      type: 'homemanager/rf/button/save',
      remote_id: remoteId,
      button,
      ...(options.buttonId ? { button_id: options.buttonId } : {}),
      ...(options.candidateId ? { candidate_id: options.candidateId } : {}),
    }),
  deleteButton: (hass: Hass, remoteId: string, buttonId: string) =>
    ws<null>(hass, { type: 'homemanager/rf/button/delete', remote_id: remoteId, button_id: buttonId }),
  press: (hass: Hass, remoteId: string, buttonId: string) =>
    ws<{ result: 'sent' }>(hass, { type: 'homemanager/rf/press', remote_id: remoteId, button_id: buttonId }),
  test: (
    hass: Hass,
    candidateId: string,
    settings: Partial<Pick<RfSettings, 'transmitter' | 'pulse_us' | 'repeats' | 'wait_us'>>,
  ) =>
    ws<RfSettings & { result: 'sent' }>(hass, { type: 'homemanager/rf/test', candidate_id: candidateId, ...settings }),
  assume: (hass: Hass, entityId: string, isOn: boolean) =>
    ws<null>(hass, { type: 'homemanager/rf/assume', entity_id: entityId, is_on: isOn }),
  /** Opens a capture window; resolves with a function that closes it early. */
  capture(
    hass: Hass,
    transmitter: string,
    seconds: number,
    listener: (event: { candidate?: RfCandidate; done?: boolean }) => void,
  ): Promise<() => void> {
    const connection = hass.connection;
    if (!connection?.subscribeMessage) return Promise.reject(new Error('not connected'));
    return connection.subscribeMessage(event => listener(event as { candidate?: RfCandidate; done?: boolean }), {
      type: 'homemanager/rf/capture',
      transmitter,
      seconds,
    });
  },
};

/** Functions in the order a fan-with-light remote usually presents them. */
export function suggestedFunctions(kind: 'fan' | 'light' | 'other', speeds = 6): RfFunction[] {
  const levels = Array.from({ length: speeds }, (_, index) => `speed_${index + 1}` as RfFunction);
  if (kind === 'fan') return ['off', ...levels, 'direction', 'light', 'timer'];
  if (kind === 'light') return ['light_on', 'light_off', 'brightness_up', 'brightness_down', 'color_temperature'];
  return [];
}
