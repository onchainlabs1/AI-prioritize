const path = require("node:path");
const { defineConfig } = require("@playwright/test");

const chromeExecutablePath =
  process.env.PLAYWRIGHT_CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

module.exports = defineConfig({
  testDir: "./enterprise-ai-prioritizer/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: "list",
  outputDir: path.join(__dirname, "test-results"),
  use: {
    baseURL: "http://127.0.0.1:8787",
    headless: true,
    launchOptions: {
      executablePath: chromeExecutablePath,
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--disable-component-update",
        "--no-first-run",
      ],
    },
  },
});
