import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('HomeManager owns its light/dark palette and has no HA blue accent dependency', () => {
  const theme = readFileSync(new URL('../../src/ui/theme.ts', import.meta.url), 'utf8');
  for (const colour of ['#1F2A24', '#E8ECE6', '#4F7A5A', '#8FB38B', '#D0453A', '#E5645A'])
    assert.ok(theme.includes(colour));
  assert.ok(theme.includes(':host([data-theme=dark])'));
  assert.ok(theme.includes(':not([data-theme=light])'));
  assert.doesNotMatch(theme, /var\(--(?:primary-color|info-color|app-header-background-color)/);
  assert.match(theme, /--hm-sent:var\(--hm-muted\)/);
});

test('logo uses the reference house floorplan and the brand token', () => {
  const logo = readFileSync(new URL('../../src/ui/logo.ts', import.meta.url), 'utf8');
  const reference = readFileSync(new URL('../../docs/vision-mockup.html', import.meta.url), 'utf8');
  const paths = [...logo.matchAll(/<path d="([^"]+)"/g)].map(match => match[1]);
  assert.equal(paths.length, 2);
  for (const path of paths) assert.ok(reference.includes(`d="${path}"`));
  assert.match(logo, /var\(--hm-brand\)/);
});
