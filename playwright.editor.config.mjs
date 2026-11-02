import config from './playwright.config.mjs';

// The fixture routes fulfil the synthetic app directly, without a test-server socket.
export default {
  ...config,
  testMatch: '**/editor-dock.browser.spec.mjs',
  webServer: undefined,
};
