import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true, // Optional: Use if you want global test APIs like describe, it, expect
    environment: 'node', // Or 'jsdom' if testing React components
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'), // Map '~' to the src directory
    },
  },
});