import { createHash } from 'node:crypto';
/** Exact, reviewed fictional screenshots only. Every byte change requires review. */
export function reviewedScreenshot(relative, bytes, manifest) {
  const legacy =
    /^docs\/evidence\/0\.7\/(?:desktop|mobile)-(?:plan|room|alert|activity|menu|review|reference)\.png$/.test(relative);
  const picker =
    /^docs\/evidence\/0\.8-picker\/(?:desktop|mobile)-(?:devices|readings|binding|plan|advanced|dark|empty|reference-devices|reference-readings|reference-components)\.png$/.test(
      relative,
    );
  const deviceScreen =
    /^docs\/evidence\/0\.8-device-screen\/(?:desktop|mobile)-(?:plan|now|meter|climate|sensor|infrastructure|appearance|meter-dark|now-dark|alert|empty|reference-device|reference-now|reference-components)\.png$/.test(
      relative,
    );
  if (!legacy && !picker && !deviceScreen) return false;
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.assets)) return false;
  const entry = manifest.assets.find(asset => asset.path === relative);
  return (
    entry?.source ===
      (/-reference(?:-devices|-readings|-components|-device|-now)?\.png$/.test(relative)
        ? 'docs/vision-mockup.html'
        : picker
          ? 'tests/browser/fixtures/picker.html'
          : deviceScreen
            ? 'tests/browser/fixtures/device-screen.html'
            : 'tests/browser/fixtures/shell.html') &&
    entry?.review === 'fictional-only' &&
    entry?.sha256 === createHash('sha256').update(bytes).digest('hex') &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  );
}
