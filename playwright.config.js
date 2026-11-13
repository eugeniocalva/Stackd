import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  // 1.3.0 (GAP-2): a shared CI runner is slower than a dev machine; one
  // retry there keeps a load-sensitive test from failing the whole run.
  retries: process.env.CI ? 1 : 0,
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
    // 1.3.0 (GAP-2): npm.cmd only exists on Windows; CI runs on Linux.
    command: process.platform === 'win32' ? 'npm.cmd run dev' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
