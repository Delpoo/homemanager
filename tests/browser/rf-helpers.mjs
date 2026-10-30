import { readFileSync } from 'node:fs';
export { ceiling } from './fixtures/rf-server.js';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
export async function setup(page, { remotes = [] } = {}) {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(
    async ([initial, version]) => {
      const { mountRfFixture } = await import('/tests/browser/fixtures/rf-server.js');
      await mountRfFixture(initial, version);
    },
    [remotes, version],
  );
  return page.locator('homemanager-rf');
}

export const calls = (page, type) =>
  page.evaluate(type => window.rfServer.calls.filter(call => call.type === type), type);
