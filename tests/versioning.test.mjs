import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('one version everywhere: package, integration manifest and changelog', () => {
  const { version } = JSON.parse(read('package.json'));
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(JSON.parse(read('custom_components/homemanager/manifest.json')).version, version);
  const firstEntry = read('CHANGELOG.md').match(/^## (\S+)/m)?.[1];
  assert.equal(firstEntry, version, 'CHANGELOG.md must start with the current version');
});

test('HACS ships one integration package that includes the frontend', () => {
  const hacs = JSON.parse(read('hacs.json'));
  assert.equal(hacs.zip_release, true);
  assert.equal(hacs.filename, 'homemanager.zip');
  assert.match(hacs.homeassistant, /^\d{4}\.\d+\.\d+$/);
  assert.match(read('scripts/build.mjs'), /custom_components\/homemanager\/frontend\/homemanager\.js/);
});
