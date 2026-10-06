import { defineConfig } from '@playwright/test';

/** API-only tests for the trigger route. No browser projects needed. */
export default defineConfig({
  testDir: './tests',
  timeout: 20_000,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000' },
});
