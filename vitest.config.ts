import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths"; // Import the plugin
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

export default defineConfig({
  plugins: [tsconfigPaths()], // Add the plugin here
  test: {
    globals: true, // Optional: Use if you want global test APIs like describe, it, expect
    environment: "jsdom", // Set environment to jsdom for React component tests
  },
  // resolve: { // Remove manual alias section
  //   alias: {
  //     '~': path.resolve(__dirname, './src'), // Map '~' to the src directory
  //     // Add alias to resolve next/server import issue in next-auth during tests
  //     'next/server': 'next/server.js',
  //   },
  // },
  // Ensure next-auth is processed by Vitest/Vite
  ssr: {
    noExternal: ['next-auth'],
  },
});