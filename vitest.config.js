import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [], // Add setup file if needed
    include: ['tests/unit/**/*.test.js'],
    // v1.14: `npm test` has to be a release gate, so it must not fail for
    // reasons that have nothing to do with the code. Vitest defaults to one
    // worker per core, and every one of the 70+ files boots its own jsdom and
    // evaluates ~1 MB of source through the executeFile pattern — on a
    // 14-core machine that starved the workers and tripped the 5 s default
    // timeout with "Timeout waiting for worker to respond". Capping the pool
    // and raising the timeouts makes the run deterministic; it costs about a
    // minute of wall clock and buys a gate that can be trusted.
    pool: 'forks',
    maxWorkers: 4,
    testTimeout: 15000,
    hookTimeout: 20000,
    teardownTimeout: 10000
  }
});
