import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import './validate-foundation.mjs';
// Single source of truth for the release version (checked against manifest.json by tests).
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(path.join(root, 'dist'), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['src/card/index.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: 'dist/homemanager.js',
  define: { __HOMEMANAGER_VERSION__: JSON.stringify(version) },
  minify: true,
  legalComments: 'none',
  charset: 'utf8',
});
cpSync(path.join(root, 'schemas'), path.join(root, 'dist/schemas'), { recursive: true });
// The companion integration serves the same bundle (custom_components/homemanager/frontend is git-ignored).
mkdirSync(path.join(root, 'custom_components/homemanager/frontend'), { recursive: true });
cpSync(
  path.join(root, 'dist/homemanager.js'),
  path.join(root, 'custom_components/homemanager/frontend/homemanager.js'),
);
writeFileSync(
  path.join(root, 'dist/build-status.json'),
  JSON.stringify(
    {
      product: 'HomeManager',
      stage: 'integration',
      frontendBundle: 'homemanager.js',
      integrationPackage: 'homemanager.zip',
      schemaVersion: 2,
      version,
      realHomeAssistantTested: 'disposable local instances 2026.2.3 and 2026.10.4',
      deployed: false,
    },
    null,
    2,
  ) + '\n',
);
// Inspectable test entry points, excluded from publication inputs.
await build({
  absWorkingDir: root,
  entryPoints: [
    'src/card/configuration.ts',
    'src/card/geometry.ts',
    'src/editor/model.ts',
    'src/editor/entity-picker.ts',
    'src/editor/storage.ts',
    'src/editor/index.ts',
    'src/panels/native-panel.ts',
    'src/integration/store.ts',
    'src/app/index.ts',
    'src/panels/controls.ts',
    'src/card/markers.ts',
    'src/rf/layout.ts',
    'src/card/device-controls.ts',
    'src/model/archetype.ts',
    'src/model/category.ts',
    'src/model/room-shapes.ts',
    'src/model/room-nav.ts',
    'src/model/plan-health.ts',
    'src/model/zone-edit.ts',
    'src/model/names.ts',
    'src/model/device-screen.ts',
    'src/model/now.ts',
    'src/model/device-catalog.ts',
    'src/model/symbol-spec.ts',
    'src/model/alerts.ts',
    'src/model/alert-settings.ts',
    'src/model/activity.ts',
    'src/model/plan-import.ts',
    'src/shell/runtime-feed.ts',
  ],
  outbase: 'src',
  outdir: '.work',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  legalComments: 'none',
});
console.log('Built dist/homemanager.js. No instance configuration or runtime state is embedded.');
