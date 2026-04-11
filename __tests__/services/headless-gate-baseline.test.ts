// Mock database module to avoid expo-sqlite ESM issues in transitive imports
jest.mock('@/services/database', () => ({
  getWorkoutQueue: jest.fn(),
  saveWorkoutQueue: jest.fn(),
  clearWorkoutQueue: jest.fn(),
}));

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { OFFICIAL_HEADLESS_GATE_BASELINE } from '@/services/coach/headless-gate-baseline';
import { materializeCanonicalFixtureQueue } from '@/services/coach/prompt-test-runner';

describe('headless gate baseline fixture', () => {
  it('uses lowercase json fixture filename on disk', () => {
    const dataDir = path.resolve(__dirname, '../../data');
    const entries = readdirSync(dataDir);

    expect(entries).toContain('TestProgram.json');
    expect(entries).not.toContain('TestProgram.JSON');
  });

  it('is sourced from data/TestProgram.json', () => {
    const dataFiles = readdirSync(path.resolve(__dirname, '../../data'));
    expect(dataFiles).toContain('TestProgram.json');

    const fixturePath = path.resolve(__dirname, '../../data/TestProgram.json');

    expect(existsSync(fixturePath)).toBe(true);
    if (!existsSync(fixturePath)) return;

    const parsed = JSON.parse(readFileSync(fixturePath, 'utf8'));
    expect(OFFICIAL_HEADLESS_GATE_BASELINE).toEqual(parsed);
  });

  it('keeps canonical reps/weight arrays aligned for every exercise', () => {
    for (const day of OFFICIAL_HEADLESS_GATE_BASELINE) {
      for (const exercise of day.exercises) {
        expect(exercise.reps.length).toBeGreaterThan(0);
        expect(exercise.reps.length).toBe(exercise.weight.length);
      }
    }
  });

  it('materializes to customized-set queue exercises without set drift', () => {
    const queue = materializeCanonicalFixtureQueue(OFFICIAL_HEADLESS_GATE_BASELINE);

    for (const item of queue) {
      for (const exercise of item.exercises) {
        expect(exercise.hasCustomisedSets).toBe(true);
        const reps = JSON.parse(exercise.reps) as number[];
        const weight = JSON.parse(exercise.weight) as number[];
        expect(reps.length).toBe(weight.length);
        expect(exercise.sets).toBe(String(reps.length));
      }
    }
  });

  // =============================================================================
  // Phase 00: Baseline structural invariants for strict parity zone
  // =============================================================================

  /**
   * The number of days in the canonical fixture must remain stable.
   * Any change is a parity drift signal.
   */
  it('has a stable day count in canonical fixture', () => {
    expect(OFFICIAL_HEADLESS_GATE_BASELINE.length).toMatchSnapshot('day-count');
  });

  /**
   * The total exercise count across all days must remain stable.
   * This catches accidental fixture deletions or additions.
   */
  it('has a stable total exercise count in canonical fixture', () => {
    const totalExercises = OFFICIAL_HEADLESS_GATE_BASELINE.reduce(
      (sum, day) => sum + day.exercises.length,
      0,
    );
    expect(totalExercises).toMatchSnapshot('total-exercise-count');
  });

  /**
   * Materialized queue must produce the same number of queue items as
   * the fixture has days.
   */
  it('materializes queue items equal in count to fixture days', () => {
    const queue = materializeCanonicalFixtureQueue(OFFICIAL_HEADLESS_GATE_BASELINE);
    expect(queue.length).toBe(OFFICIAL_HEADLESS_GATE_BASELINE.length);
  });

  /**
   * Each materialized exercise preserves its canonical name.
   * Name changes indicate fixture drift.
   */
  it('materialized exercise names match canonical fixture names', () => {
    const queue = materializeCanonicalFixtureQueue(OFFICIAL_HEADLESS_GATE_BASELINE);

    for (let dayIndex = 0; dayIndex < OFFICIAL_HEADLESS_GATE_BASELINE.length; dayIndex++) {
      const fixtureDay = OFFICIAL_HEADLESS_GATE_BASELINE[dayIndex];
      const queueDay = queue[dayIndex];

      for (let exIndex = 0; exIndex < fixtureDay.exercises.length; exIndex++) {
        expect(queueDay.exercises[exIndex].name).toBe(fixtureDay.exercises[exIndex].name);
      }
    }
  });
});

