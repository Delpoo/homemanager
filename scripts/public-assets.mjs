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
  const rfDialogs =
    /^docs\/evidence\/0\.9-cp6\/(?:desktop|mobile)-(?:light|dark)-(?:list|new|remote|learn|candidate|trial|designer|widget|roles|settings|confirm|devices|yaml|new-home|empty-home|empty|reference-components|reference-rf|reference-dialogs)\.png$/.test(
      relative,
    );
  const alertRules =
    /^docs\/evidence\/0\.9-cp4\/(?:desktop|mobile)-(?:light|dark)-(?:now|device|alerts|inspector-(?:plant|meter|alarm|presence|rule)|reference-(?:categories|device|now|components))\.png$/.test(
      relative,
    );
  const activityHeights =
    /^docs\/evidence\/0\.9-activity-heights\/(?:desktop|mobile)-(?:light|dark)-(?:plan|activity|edit|inspector|sidebar|reference-plan|reference-edit)\.png$/.test(
      relative,
    );
  const redesignMockup =
    /^docs\/rediseno\/maqueta\/(?:1-ficha-ventilador|2-ficha-planta|3-agregar|4-telefono|5-reglas|6-alternativas)\.png$/.test(
      relative,
    );
  const editorDock =
    /^docs\/evidence\/rediseno-e01\/(?:(?:desktop|mobile)-(?:light|dark)-ficha|desktop-dark-sidebar|mobile-dark-ampliada)\.png$/.test(
      relative,
    );
  if (
    !legacy &&
    !picker &&
    !deviceScreen &&
    !rfDialogs &&
    !alertRules &&
    !activityHeights &&
    !redesignMockup &&
    !editorDock
  )
    return false;
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.assets)) return false;
  const entry = manifest.assets.find(asset => asset.path === relative);
  return (
    entry?.source ===
      (editorDock
        ? 'tests/card/editor-dock.browser.spec.mjs'
        : redesignMockup
          ? 'docs/rediseno/maqueta-modulos.html'
          : /-reference(?:-devices|-readings|-components|-device|-now|-rf|-dialogs|-categories|-plan|-edit)?\.png$/.test(
                relative,
              )
            ? 'docs/vision-mockup.html'
            : picker
              ? 'tests/browser/fixtures/picker.html'
              : alertRules
                ? 'tests/editor/alerts.browser.spec.mjs'
                : rfDialogs
                  ? 'tests/rf/cp6.browser.spec.mjs'
                  : deviceScreen
                    ? 'tests/browser/fixtures/device-screen.html'
                    : 'tests/browser/fixtures/shell.html') &&
    entry?.review === 'fictional-only' &&
    entry?.sha256 === createHash('sha256').update(bytes).digest('hex') &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  );
}
