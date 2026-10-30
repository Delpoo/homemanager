import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { reviewedScreenshot } from '../../scripts/public-assets.mjs';
test('only exact reviewed fictional PNG bytes are admitted; changes and other media fail', () => {
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const path = 'docs/evidence/0.7/desktop-plan.png';
  const manifest = {
    schemaVersion: 1,
    assets: [
      {
        path,
        source: 'tests/browser/fixtures/shell.html',
        review: 'fictional-only',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    ],
  };
  assert.equal(reviewedScreenshot(path, bytes, manifest), true);
  assert.equal(reviewedScreenshot(path, Buffer.concat([bytes, Buffer.of(2)]), manifest), false);
  assert.equal(reviewedScreenshot('docs/private.png', bytes, manifest), false);
  assert.equal(reviewedScreenshot(path, bytes, { schemaVersion: 1, assets: [] }), false);
  const pickerPath = 'docs/evidence/0.8-picker/mobile-readings.png';
  const pickerManifest = structuredClone(manifest);
  pickerManifest.assets[0].path = pickerPath;
  pickerManifest.assets[0].source = 'tests/browser/fixtures/picker.html';
  assert.equal(reviewedScreenshot(pickerPath, bytes, pickerManifest), true);
  pickerManifest.assets[0].source = 'docs/vision-mockup.html';
  assert.equal(reviewedScreenshot(pickerPath, bytes, pickerManifest), false);
  assert.equal(reviewedScreenshot('docs/evidence/0.8-picker/private.png', bytes, pickerManifest), false);
});
