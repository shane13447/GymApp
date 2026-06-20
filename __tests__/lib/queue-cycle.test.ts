import { resolveCycledDayIndex } from '@/lib/queue-cycle';

/**
 * Regression coverage for the cycled-day-index helper that backs queue
 * building in useActiveWorkout. The hook previously computed `i % totalDays`
 * directly, which produced `NaN` (and an undefined day lookup → crash) when a
 * program had zero workout days.
 */
describe('lib/queue-cycle resolveCycledDayIndex', () => {
  it('cycles through day indices for a multi-day program', () => {
    expect(resolveCycledDayIndex(0, 3)).toBe(0);
    expect(resolveCycledDayIndex(1, 3)).toBe(1);
    expect(resolveCycledDayIndex(2, 3)).toBe(2);
    expect(resolveCycledDayIndex(3, 3)).toBe(0);
    expect(resolveCycledDayIndex(7, 3)).toBe(1);
  });

  it('handles a single-day program', () => {
    expect(resolveCycledDayIndex(0, 1)).toBe(0);
    expect(resolveCycledDayIndex(5, 1)).toBe(0);
  });

  it('returns null (no NaN) when the program has zero days', () => {
    expect(resolveCycledDayIndex(0, 0)).toBeNull();
    expect(resolveCycledDayIndex(4, 0)).toBeNull();
  });

  it('returns null for invalid (negative / non-integer) day counts', () => {
    expect(resolveCycledDayIndex(0, -2)).toBeNull();
    expect(resolveCycledDayIndex(0, 2.5)).toBeNull();
    expect(resolveCycledDayIndex(0, Number.NaN)).toBeNull();
  });

  it('never returns NaN regardless of slot index', () => {
    for (const total of [0, 1, 2, 5]) {
      for (let slot = 0; slot < 12; slot++) {
        const result = resolveCycledDayIndex(slot, total);
        expect(result === null || !Number.isNaN(result)).toBe(true);
      }
    }
  });
});
