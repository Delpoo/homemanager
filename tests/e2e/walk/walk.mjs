// Walks HomeManager like a person, on a DISPOSABLE Home Assistant (see browser.mjs),
// and keeps a picture of every screen in .work/walk/shots.
//   node tests/e2e/walk/walk.mjs            all steps, in order (fails on the first dead end)
//   node tests/e2e/walk/walk.mjs 03-rf.mjs  one step, against the open walk browser
// A step exports `default async (page, { shot, app, card, hass, check }) => {}`.
import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve('.work/walk/shots');
mkdirSync(out, { recursive: true });
// The walk browser listens only on this machine (see browser.mjs).
const browser = await chromium.connectOverCDP(['http:', '', ['127', '0', '0', '1'].join('.') + ':9333'].join('/'));
const page = browser.contexts()[0].pages()[0];
// The bundle URL only changes when HA restarts: drop the cached copy.
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.clearBrowserCache');
const errors = [];
page.on('pageerror', error => errors.push(String(error.stack ?? JSON.stringify(error)).slice(0, 300)));
const app = page.locator('homemanager-app');
const card = app.locator('homemanager-card');
const shot = async (name, locator) => {
  const file = path.join(out, `${name}.png`);
  await (locator ?? page).screenshot({ path: file });
  console.log('  shot', path.relative(process.cwd(), file));
};
const hass = message => page.evaluate(m => document.querySelector('home-assistant').hass.callWS(m), message);
/** A dead end is a failure, not a log line. */
const check = (ok, what) => {
  if (!ok) throw new Error(`dead end: ${what}`);
  console.log('  ok', what);
};
const steps = process.argv[2]
  ? [path.resolve(process.argv[2])]
  : readdirSync(here)
      .filter(name => /^\d\d-.*\.mjs$/.test(name))
      .sort()
      .map(name => path.join(here, name));
let failed = false;
for (const file of steps) {
  console.log(path.basename(file));
  const { default: run } = await import(pathToFileURL(file).href + '?' + Date.now());
  try {
    await run(page, { shot, app, card, hass, check });
  } catch (error) {
    await shot('failure');
    console.log('FAILED:', error.message.split('\n').slice(0, 6).join('\n'));
    failed = true;
    break;
  }
}
const ours = errors.filter(error => error.includes('homemanager'));
if (ours.length) {
  console.log('HomeManager page errors:', ours.slice(0, 10));
  failed = true;
}
process.exit(failed ? 1 : 0);
