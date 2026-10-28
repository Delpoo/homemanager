import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import './validate-foundation.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
mkdirSync(path.join(root,'dist'),{recursive:true});
await build({absWorkingDir:root,entryPoints:['src/card/index.ts'],bundle:true,format:'esm',target:'es2022',outfile:'dist/homemanager.js',minify:true,legalComments:'none',charset:'utf8'});
cpSync(path.join(root,'schemas'),path.join(root,'dist/schemas'),{recursive:true});
// The companion integration serves the same bundle (custom_components/homemanager/frontend is git-ignored).
mkdirSync(path.join(root,'custom_components/homemanager/frontend'),{recursive:true});
cpSync(path.join(root,'dist/homemanager.js'),path.join(root,'custom_components/homemanager/frontend/homemanager.js'));
writeFileSync(path.join(root,'dist/build-status.json'),JSON.stringify({product:'HomeManager',stage:'integration',frontendBundle:'homemanager.js',integrationPackage:'homemanager.zip',schemaVersion:2,realHomeAssistantTested:'local disposable instance 2026.2.3',deployed:false},null,2)+'\n');
// Inspectable test entry points, excluded from publication inputs.
await build({absWorkingDir:root,entryPoints:['src/card/configuration.ts','src/card/geometry.ts','src/editor/model.ts','src/editor/storage.ts','src/editor/index.ts','src/panels/native-panel.ts','src/integration/store.ts','src/app/index.ts'],outbase:'src',outdir:'.work',bundle:true,format:'esm',target:'es2022',legalComments:'none'});
console.log('Built dist/homemanager.js. No instance configuration or runtime state is embedded.');
