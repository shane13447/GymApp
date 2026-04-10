/**
 * Jest setup file
 * Runs before each test file
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';

const envFilePath = path.resolve(process.cwd(), '.env');
try {
  const envFile = readFileSync(envFilePath, 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
} catch {
  // No local .env file is fine in CI and should not fail test setup.
}

// Suppress console.log and console.warn in tests unless debugging
// Uncomment the lines below to silence logs during tests
// global.console.log = jest.fn();
// global.console.warn = jest.fn();

// Keep console.error visible for debugging
// global.console.error = jest.fn();
