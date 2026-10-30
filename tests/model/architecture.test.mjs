import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
test('pure models have no DOM or imports from other layers; the card stays below 600 lines', () => {
  for (const file of readdirSync(new URL('../../src/model/', import.meta.url))) {
    const source = readFileSync(new URL(`../../src/model/${file}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g))
      assert.ok(match[1].startsWith('./'), `${file}: ${match[1]}`);
    assert.doesNotMatch(source, /\b(?:document|window|customElements)\s*\./);
  }
  assert.ok(
    readFileSync(new URL('../../src/card/home-manager-card.ts', import.meta.url), 'utf8').split('\n').length < 600,
  );
});
