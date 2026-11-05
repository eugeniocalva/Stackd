import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'run-after-first-retry',
    // 1.2.0 (UX-5): the widget edit mode wiggles (CSS, gated on
    // prefers-reduced-motion: no-preference). Playwright's actionability
    // check needs stable boxes, so the suite runs with reduced motion — the
    // same gate the view transitions already honour.
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm.cmd run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
