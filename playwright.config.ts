import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'webkit',
      use: { ...devices['iPhone 14'], browserName: 'webkit' },
    },
  ],
});
