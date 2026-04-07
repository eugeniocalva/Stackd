import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [], // Add setup file if needed
    include: ['tests/unit/**/*.test.js'],
  },
});
