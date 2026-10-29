import type { Hass, HassEntity } from '../card/types.js';

/** Websocket client of the RF remote manager (custom_components/homemanager/rf*.py).
 * Codes never travel here: captures are referenced by candidate id and buttons
 * by a short fingerprint. */

export type PartKind = 'fan' | 'light';
export type WidgetType = 'button' | 'toggle' | 'updown' | 'steps' | 'modes';

export interface RfSettings {
  transmitter: string;
  protocol: number;
  nbits: number;
  pulse_us: number;
  repeats: number;
  wait_us: number;
  measured_pulse_us: number | null;
}
export interface RfAbout {
  name: string;
  icon: string | null;
  description: string | null;
}
export interface RfButton {
  id: string;
  name: string;
  icon: string | null;
  fingerprint: string;
}
/** A fan or light for Home Assistant: roles name the buttons that do each thing. */
export interface RfPart {
  id: string;
  name: string;
  kind: PartKind;
  speeds: number | null;
  roles: Record<string, string>;
}
/** One control of the drawn remote, on a grid of four columns. */
export interface RfWidget {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  buttons: string[];
  label: string | null;
  icon: string | null;
}
export interface RfRemote extends RfSettings, RfAbout {
  id: string;
  buttons: RfButton[];
  parts: RfPart[];
  /** null: not designed yet; the default drawing is used. */
  layout: RfWidget[] | null;
}
export interface RfTransmitter {
  id: string;
  name: string;
  device_id: string | null;
  can_capture: boolean;
}
export interface RfDevice extends RfTransmitter {
  manufacturer: string | null;
  model: string | null;
  online: boolean;
  has_package: boolean;
}
export interface RfDevices {
  devices: RfDevice[];
  default_receiver: string | null;
  /** What goes after `homemanager_rf:` in the device YAML. */
  package: string;
  builder_url: string | null;
}
export interface RfCandidate {
  candidate_id: string;
  transmitter: string;
  protocol: number;
  nbits: number;
  pulse_us: number;
  frames: number;
  bursts: number;
  burst_frames: number;
  confirmed: boolean;
  confirmed_by: 'frames' | 'presses' | null;
  fingerprint: string;
  known_as: string[];
}
export type RfCaptureEvent = { candidate?: RfCandidate; noise?: number; done?: boolean };

/** Roles each part kind accepts (rf_model.ROLES). */
export const ROLES: Record<PartKind, string[]> = {
  fan: [
    'on',
    'off',
    'toggle',
    ...Array.from({ length: 12 }, (_, index) => `speed_${index + 1}`),
    'speed_up',
    'speed_down',
    'direction',
  ],
  light: ['on', 'off', 'toggle'],
};

/** Whether the last transmission of an RF remote was heard on air by a receiver
 * (the transmitter itself or another one). Evidence that the signal went out,
 * never that the device received it or changed. */
export type AirResult = 'heard' | 'not_heard' | 'unverified';
interface AirAttribute {
  at?: unknown;
  result?: unknown;
  by?: unknown;
}
const air = (entity?: HassEntity) => entity?.attributes?.homemanager_on_air as AirAttribute | undefined;
/** Identifies the last echo report of the remote behind an entity. */
export function airStamp(entity?: HassEntity): string | null {
  const value = air(entity);
  return value && typeof value.at === 'string' ? value.at : null;
}
/** The echo of a transmission sent after `baseline` was read; null while pending. */
export function onAir(entity: HassEntity | undefined, baseline: string | null): AirResult | null {
  const value = air(entity);
  if (!value || typeof value.at !== 'string' || value.at === baseline) return null;
  return value.result === 'heard' || value.result === 'not_heard' || value.result === 'unverified'
    ? value.result
    : null;
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
  devices: (hass: Hass) => ws<RfDevices>(hass, { type: 'homemanager/rf/devices' }),
  setDefaultReceiver: (hass: Hass, receiver: string | null) =>
    ws<null>(hass, { type: 'homemanager/rf/default_receiver', receiver }),
  saveRemote: (hass: Hass, remote: Partial<RfSettings & RfAbout> & { name: string }, remoteId?: string) =>
    ws<RfRemote>(hass, { type: 'homemanager/rf/remote/save', remote, ...(remoteId ? { remote_id: remoteId } : {}) }),
  deleteRemote: (hass: Hass, remoteId: string) =>
    ws<null>(hass, { type: 'homemanager/rf/remote/delete', remote_id: remoteId }),
  saveParts: (hass: Hass, remoteId: string, parts: (Omit<RfPart, 'id'> & { id?: string })[]) =>
    ws<RfRemote>(hass, { type: 'homemanager/rf/parts/save', remote_id: remoteId, parts }),
  saveLayout: (hass: Hass, remoteId: string, layout: RfWidget[] | null) =>
    ws<RfRemote>(hass, { type: 'homemanager/rf/layout/save', remote_id: remoteId, layout }),
  saveButton: (
    hass: Hass,
    remoteId: string,
    button: { name: string; icon?: string | null },
    options: { buttonId?: string; candidateId?: string; role?: { part: string; role: string } } = {},
  ) =>
    ws<RfButton>(hass, {
      type: 'homemanager/rf/button/save',
      remote_id: remoteId,
      button,
      ...(options.buttonId ? { button_id: options.buttonId } : {}),
      ...(options.candidateId ? { candidate_id: options.candidateId } : {}),
      ...(options.role ? { role: options.role } : {}),
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
    listener: (event: RfCaptureEvent) => void,
  ): Promise<() => void> {
    const connection = hass.connection;
    if (!connection?.subscribeMessage) return Promise.reject(new Error('not connected'));
    return connection.subscribeMessage(event => listener(event as RfCaptureEvent), {
      type: 'homemanager/rf/capture',
      transmitter,
      seconds,
    });
  },
};
