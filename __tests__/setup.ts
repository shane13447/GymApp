/**
 * Jest setup file
 * Runs before each test file
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Suppress console.log and console.warn in tests unless debugging
// Uncomment the lines below to silence logs during tests
// global.console.log = jest.fn();
// global.console.warn = jest.fn();

// Keep console.error visible for debugging
// global.console.error = jest.fn();
