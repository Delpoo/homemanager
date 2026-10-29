import { createHash } from 'node:crypto';
/** Exact, reviewed fictional screenshots only. Every byte change requires review. */
export function reviewedScreenshot(relative, bytes, manifest) {
  if (
    !/^docs\/evidence\/0\.7\/(?:desktop|mobile)-(?:plan|room|alert|activity|menu|review|reference)\.png$/.test(relative)
  )
    return false;
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.assets)) return false;
  const entry = manifest.assets.find(asset => asset.path === relative);
  return (
    entry?.source ===
      (relative.endsWith('-reference.png') ? 'docs/vision-mockup.html' : 'tests/browser/fixtures/shell.html') &&
    entry?.review === 'fictional-only' &&
    entry?.sha256 === createHash('sha256').update(bytes).digest('hex') &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  );
}
