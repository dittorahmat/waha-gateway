import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath, URL } from 'url'; // Import URL and fileURLToPath
import path from 'path'; // Import path

// Read environment variables from file.
// https://github.com/motdotla/dotenv
// require('dotenv').config(); // Use if needed for env vars during E2E tests

// Use process.env.PORT by default and fallback to port 3000
const PORT = process.env.PORT ?? 3000;
const baseURL = `http://localhost:${PORT}`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  timeout: 30 * 1000, // Global timeout for each test
  expect: {
    timeout: 5 * 1000, // Timeout for expect assertions
  },
  fullyParallel: true, // Run tests in parallel
  forbidOnly: !!process.env.CI, // Fail the build on CI if you accidentally left test.only in the source code.
  retries: process.env.CI ? 2 : 0, // Retry on CI only
  workers: process.env.CI ? 1 : undefined, // Opt out of parallel tests on CI.
  reporter: 'html', // Reporter to use. See https://playwright.dev/docs/test-reporters
  // Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions.
  use: {
    baseURL: baseURL, // Base URL to use in actions like `await page.goto('/')`
    trace: 'on-first-retry', // Record trace only when retrying a failed test. See https://playwright.dev/docs/trace-viewer
  },

  // Configure projects for major browsers.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  // Directory containing the E2E test files
  // Use URL constructor with import.meta.url for ES module compatibility
  testDir: path.join(path.dirname(fileURLToPath(import.meta.url)), 'e2e'),

  // Run your local dev server before starting the tests
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    timeout: 120 * 1000, // Timeout for web server to start
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});