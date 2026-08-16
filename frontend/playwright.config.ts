import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: externalBaseUrl || 'http://127.0.0.1:4180',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox-invoice-actions',
      testMatch: /invoice-actions\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  webServer: externalBaseUrl ? undefined : {
    command:
      'WEB_COMMIT_SHA=0000000000000000000000000000000000000000'
      + ' VITE_DISTRIBUTION=cloud VITE_GOOGLE_AUTH_ENABLED=false npm run build'
      + ' && npm run preview -- --host 127.0.0.1 --port 4180',
    url: 'http://127.0.0.1:4180/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
