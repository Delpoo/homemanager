import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('CP6 RF screens only compose shared UI; no styles, colors or geometry styles live in screens', () => {
  for (const name of ['manager', 'learn', 'devices', 'remote-view']) {
    const source = readFileSync(new URL(`../../src/rf/${name}.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /<style\b|style\s*=|\.style\.|#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\s*\(/i, name);
    assert.match(source, /from ['"]\.\.\/ui\/panel-components\.js['"]/);
  }
  const app = readFileSync(new URL('../../src/app/index.ts', import.meta.url), 'utf8');
  const block = app.slice(app.indexOf('private renderMessages('), app.indexOf('private select(homeId:'));
  assert.match(block, /homeStart\(this\.root/);
  assert.doesNotMatch(block, /<style\b|style\s*=/);
});
