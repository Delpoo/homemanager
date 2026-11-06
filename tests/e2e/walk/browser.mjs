// Opens Chrome on the DISPOSABLE Home Assistant (local only), signed in with the
// test account (see docs/testing.md), with fictional ESPHome hardware (two Athom boards, an energy meter,
// an old offline board). Stays open; walk.mjs connects to it.
//   HM_E2E_CREDENTIALS=<folder>/TEST_CREDENTIALS.local.json node tests/e2e/walk/browser.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const credentials = JSON.parse(readFileSync(process.env.HM_E2E_CREDENTIALS, 'utf8'));
const base = credentials.hassUrl;
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/, 'Only a local disposable instance is allowed');
const response = await fetch(`${base}/auth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credentials.tokens.refresh_token,
    client_id: credentials.clientId,
  }),
});
assert.ok(response.ok, `token refresh failed: ${response.status}`);
Object.assign(credentials.tokens, await response.json());

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: process.env.HEADED !== '1',
  args: ['--remote-debugging-port=9333'],
});
const context = await browser.newContext({ viewport: { width: 1500, height: 900 }, locale: 'es-AR' });
await context.addInitScript(
  ([tokens, hassUrl, clientId]) => {
    // Only once: afterwards Home Assistant renews the access with the refresh token.
    if (localStorage.getItem('hassTokens')) return;
    localStorage.setItem(
      'hassTokens',
      JSON.stringify({ ...tokens, hassUrl, clientId, expires: Date.now() + tokens.expires_in * 1000 }),
    );
  },
  [credentials.tokens, base, credentials.clientId],
);
await context.addInitScript({ path: fileURLToPath(new URL('./hardware.js', import.meta.url)) });
const page = await context.newPage();
await page.goto(`${base}/homemanager`);
console.log('walk browser ready');
setInterval(() => {}, 1 << 30);
