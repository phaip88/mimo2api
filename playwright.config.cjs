const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:18089",
    viewport: { width: 1440, height: 1050 },
    launchOptions: process.env.MIMO_TEST_BROWSER
      ? { executablePath: process.env.MIMO_TEST_BROWSER }
      : {},
  },
  webServer: {
    command: "node tests/fixture-server.cjs",
    url: "http://127.0.0.1:18089",
    reuseExistingServer: false,
  },
  outputDir: "test-results",
});
