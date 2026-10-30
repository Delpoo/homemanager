export { ceiling } from './fixtures/rf-server.js';
export async function setup(page, { remotes = [] } = {}) {
  await page.goto('/tests/browser/fixtures/card.html');
  await page.waitForFunction(() => window.testHarnessReady);
  await page.evaluate(async initial => {
    const { mountRfFixture } = await import('/tests/browser/fixtures/rf-server.js');
    await mountRfFixture(initial);
  }, remotes);
  return page.locator('homemanager-rf');
}

export const calls = (page, type) =>
  page.evaluate(type => window.rfServer.calls.filter(call => call.type === type), type);
