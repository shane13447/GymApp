import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CanonicalFixtureDay } from '@/services/coach/prompt-test-runner';

const TEST_PROGRAM_PATH = path.resolve(__dirname, '../../data/TestProgram.JSON');

/**
 * Official headless gate baseline fixture approved for Task 11 Step 0.
 * Canonical format: reps[] and weight[] only (set count = array length).
 */
export const OFFICIAL_HEADLESS_GATE_BASELINE = JSON.parse(
  readFileSync(TEST_PROGRAM_PATH, 'utf8')
) as CanonicalFixtureDay[];
