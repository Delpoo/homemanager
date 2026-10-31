import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Optional local transport for the same browser suites and fictional fixtures.
 * It changes no assertions or HA mocks; useful when localhost sockets are blocked. */
export const test = base.extend({
  page: async ({ page }, use) => {
    if (process.env.HM_TEST_IN_PROCESS === '1') {
      const root = process.cwd();
      await page.route('**/*', async route => {
        const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
        const file = path.resolve(root, relative);
        if (
          !file.startsWith(root + path.sep) ||
          !/^(tests\/browser\/fixtures\/|dist\/|\.work\/|docs\/vision-mockup\.html$|docs\/rediseno\/)/.test(relative)
        )
          return route.abort();
        try {
          await route.fulfill({
            status: 200,
            contentType:
              {
                '.html': 'text/html',
                '.js': 'text/javascript',
                '.mjs': 'text/javascript',
                '.json': 'application/json',
                '.svg': 'image/svg+xml',
              }[path.extname(file)] ?? 'application/octet-stream',
            body: await readFile(file),
          });
        } catch {
          await route.fulfill({ status: 404, body: 'Missing fictional test fixture' });
        }
      });
    }
    await use(page);
  },
});
export { expect };
