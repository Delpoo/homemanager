/** Receiver evidence, never a simulated progress counter. The backend owns
 * confirmation: three equal frames in one press OR two presses >0.3 s apart. */
export interface LearningEvidence {
  burst_frames: number;
  bursts: number;
  confirmed: boolean;
  confirmed_by: 'frames' | 'presses' | null;
}
export function learningProgress(c?: LearningEvidence | null) {
  const count = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
  return {
    frames: count(c?.burst_frames),
    presses: count(c?.bursts),
    trusted: c?.confirmed === true,
    reason: c?.confirmed_by ?? null,
    stage: c?.confirmed ? 3 : 2,
  };
}
