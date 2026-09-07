import { defineConfig } from 'vitest/config';

// Plain node vitest: the Durable Objects are exercised through in-memory
// fakes (test/fakes.ts) and GoCardless through an injected fetch, so the
// suite needs neither workerd nor the network.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 10000
  }
});
