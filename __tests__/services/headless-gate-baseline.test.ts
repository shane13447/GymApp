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
});

