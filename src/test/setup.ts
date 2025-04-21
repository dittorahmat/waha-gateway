// src/test/setup.ts
import dotenv from 'dotenv';
import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

// Load environment variables from .env file for test environment
// Ensure this runs before any code that relies on process.env
dotenv.config({ path: '.env' }); // Explicitly point to .env

import '@testing-library/jest-dom/vitest'; // Extends Vitest's expect with jest-dom matchers

// Extend Vitest's expect interface with jest-dom matchers
expect.extend(matchers);

// Optional: Add any other global setup needed for tests here
// Mock ResizeObserver for jsdom environment (used by some Radix UI components)
global.ResizeObserver = class ResizeObserver {
    observe() {
        // do nothing
    }
    unobserve() {
        // do nothing
    }
    disconnect() {
        // do nothing
    }
};