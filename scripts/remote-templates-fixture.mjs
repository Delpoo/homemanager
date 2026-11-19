// Writes tests/fixtures/remote-templates.json from the built templates, so the integration
// (tests/integration/test_remote_templates.py) checks exactly what the app offers.
// Run after `npm run build`.
import { writeFileSync } from 'node:fs';
import { APPLIANCES, DESIGNS, template } from '../.work/model/remote-templates.js';

const all = Object.fromEntries(
  APPLIANCES.flatMap(([kind]) => DESIGNS.map(([design]) => [`${kind}/${design}`, template(kind, design)])),
);
writeFileSync(new URL('../tests/fixtures/remote-templates.json', import.meta.url), `${JSON.stringify(all, null, 2)}\n`);
console.log(`${Object.keys(all).length} designs`);
