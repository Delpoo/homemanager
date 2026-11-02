import test from 'node:test';
import assert from 'node:assert/strict';
import { learningProgress } from '../../.work/model/learning-progress.js';
test('learning progress reports receiver evidence and never promotes a local counter to trust', () => {
  assert.equal(learningProgress().frames, 0);
  for (const c of [
    { burst_frames: 2, bursts: 1, confirmed: false, confirmed_by: null },
    { burst_frames: 3, bursts: 1, confirmed: true, confirmed_by: 'frames' },
    { burst_frames: 1, bursts: 2, confirmed: true, confirmed_by: 'presses' },
    { burst_frames: 40, bursts: 12, confirmed: false, confirmed_by: null },
  ]) {
    const result = learningProgress(c);
    assert.equal(result.trusted, c.confirmed);
    assert.equal(result.frames, c.burst_frames);
    assert.equal(result.presses, c.bursts);
    assert.equal(result.reason, c.confirmed_by);
  }
});
