import type { Hass } from '../card/types.js';
import type { IrDevice } from './remotes.js';

export type SignalSource = 'rf' | 'ir';
export type SignalCandidate = { source: SignalSource; candidate_id: string };
export type SignalButton = { source: SignalSource; remote_id: string; button_id: string };
export type SignalTarget = SignalCandidate | SignalButton;
export interface SignalSummary {
  node: string | null;
  at: string | null;
  integrity: string;
  duration_us: number;
  count: number;
  protocol: string | null;
  frames: number;
  levels: number[];
  base_us: number | null;
}
export interface SignalSample {
  node: string | null;
  at: string | null;
  format: string;
  integrity: string;
  timings_us: number[];
  receptions?: { frames: number; presses: number };
  settings?: Record<string, string | number | boolean | null>;
  analysis: {
    duration_us: number;
    count: number;
    transitions: number;
    base_us: number | null;
    spread_us: number | null;
    frames: { start: number; end: number; gap_us: number }[];
    histogram: { low_us: number; high_us: number; marks: number; spaces: number }[];
    decoded:
      | ({ protocol: string; bits: string; word_length: number; hex: string } & Record<
          string,
          string | number | boolean
        >)
      | null;
    discontinuities: number[];
    leading_pause: boolean;
  };
}
export interface SignalComparison {
  compared: number;
  different: number;
  opposite_sign: number;
  length_delta: number;
  indices: number[];
  start: [number, number];
  absolute_us: number;
  relative: number;
  polarity_inverted?: boolean;
  reference_blocks: number;
  observed_blocks: number;
}
export type CameraResult = 'visible' | 'not_visible' | 'inconclusive';
export type DeviceResponse = 'confirmed' | 'no_response' | 'inconclusive';
export interface SignalTrial {
  id: string;
  at: string;
  kind: 'send' | 'observation';
  status?: 'sent';
  emitter: string;
  camera?: CameraResult;
  response?: DeviceResponse;
  note?: string;
  trial_id?: string;
  snapshot: boolean;
}
export interface SignalEvidence {
  original: SignalSample | null;
  prepared: SignalSample | null;
  comparison: SignalComparison | null;
}
export interface SignalSheet extends SignalEvidence {
  identity: SignalButton & { remote_name: string; button_name: string; icon: string | null };
  emitter: string;
  observed: Record<
    string,
    {
      receiver: string;
      status: 'observed' | 'not_observed' | 'indeterminate';
      blocks: SignalSample[];
      comparisons: SignalComparison[];
    }
  >;
  history: SignalTrial[];
}

function ws<T>(hass: Hass, command: string, fields: Record<string, unknown>): Promise<T> {
  if (!hass.callWS) return Promise.reject(new Error('not connected'));
  return hass.callWS<T>({ type: `homemanager/remotes/diagnostics/${command}`, ...fields });
}

export const diagnostics = {
  summary: (hass: Hass, target: SignalCandidate) => ws<SignalSummary | null>(hass, 'candidate', target),
  candidate: (hass: Hass, target: SignalCandidate) =>
    ws<SignalEvidence>(hass, 'candidate', { ...target, advanced: true }),
  sheet: (hass: Hass, target: SignalButton, trialId?: string) =>
    ws<SignalSheet>(hass, 'sheet', { ...target, ...(trialId ? { trial_id: trialId } : {}) }),
  devices: (hass: Hass, source: SignalSource) =>
    ws<{ receivers: IrDevice[]; emitters: IrDevice[] }>(hass, 'devices', { source }),
  run: (hass: Hass, target: SignalButton, fields: { emitter: string; external?: string; self?: string }) =>
    ws<{ id?: string; status: 'sent'; saved: boolean }>(hass, 'run', { ...target, ...fields }),
  note: (
    hass: Hass,
    target: SignalButton,
    fields: { camera?: CameraResult; response?: DeviceResponse; note?: string; trial_id?: string },
  ) => ws<{ id: string }>(hass, 'note', { ...target, ...fields }),
  clear: (hass: Hass, target: SignalButton) => ws<void>(hass, 'clear', target),
};
