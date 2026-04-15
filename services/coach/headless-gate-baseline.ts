import type { CanonicalFixtureDay } from '@/services/coach/prompt-test-runner';

let _baseline: CanonicalFixtureDay[] | null = null;

/**
 * Official headless gate baseline fixture approved for Task 11 Step 0.
 * Canonical format: reps[] and weight[] only (set count = array length).
 *
 * Lazy-loaded to avoid crashing React Native (node:fs unavailable on device).
 * Only call from Node.js test contexts.
 */
export const getOfficialHeadlessGateBaseline = (): CanonicalFixtureDay[] => {
  if (_baseline) return _baseline;

  if (typeof jest === 'undefined') {
    throw new Error(
      'getOfficialHeadlessGateBaseline() requires Node.js (node:fs) and must only be called from test contexts.'
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('node:fs') as typeof import('node:fs');
  const pathMod = require('node:path') as typeof import('node:path');
  const filePath = pathMod.resolve(__dirname, '../../data/TestProgram.json');
  _baseline = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CanonicalFixtureDay[];
  return _baseline;
};

/**
 * @deprecated Use getOfficialHeadlessGateBaseline() instead. Kept for backward
 * compatibility but will crash if imported in a React Native context.
 */
export const OFFICIAL_HEADLESS_GATE_BASELINE: CanonicalFixtureDay[] = typeof jest !== 'undefined'
  ? getOfficialHeadlessGateBaseline()
  : ([] as CanonicalFixtureDay[]);
