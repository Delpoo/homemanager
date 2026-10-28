import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import './validate-foundation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
mkdirSync(dist, { recursive: true });
cpSync(path.join(root, 'schemas'), path.join(dist, 'schemas'), { recursive: true });
writeFileSync(path.join(dist, 'build-status.json'), `${JSON.stringify({ product: 'HomeManager', stage: 'foundation', functional: false, frontendBundle: null, schemaVersion: 1 }, null, 2)}\n`);
console.log('Built contract artifacts only. No installable frontend card or functional release was produced.');
