import { defineConfig } from 'vitest/config';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export default defineConfig({
  test: {
    globals: true, // Optional: Use if you want global test APIs like describe, it, expect
    environment: 'node', // Or 'jsdom' if testing React components
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'), // Map '~' to the src directory
      // Add alias to resolve next/server import issue in next-auth during tests
      'next/server': 'next/server.js',
    },
  },
  // Ensure next-auth is processed by Vitest/Vite
  ssr: {
    noExternal: ['next-auth'],
  },
});