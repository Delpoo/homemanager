import config from './playwright.config.mjs';
export default {
  ...config,
  testMatch: '**/task-screens.browser.spec.mjs',
  webServer: undefined,
};
