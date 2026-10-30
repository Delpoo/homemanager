import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
// HM_TEST_PORT lets two checkouts test at once without serving each other's code.
const port = process.env.HM_TEST_PORT ?? '4184';
const localOrigin = ['http:', '', `127.0.0.1:${port}`].join('/');
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(value => value && existsSync(value));
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.browser.spec.mjs',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: '.work/playwright-report', open: 'never' }]],
  use: {
    baseURL: localOrigin,
    launchOptions: executablePath ? { executablePath } : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, defaultBrowserType: 'chromium' },
    },
  ],
  webServer: {
    command: 'node scripts/test-server.mjs',
    url: localOrigin + '/tests/browser/fixtures/card.html',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
