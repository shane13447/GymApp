/**
 * Tests for workout progression pure logic extracted from ActiveWorkout.tsx.
 * Covers auto-weight calculation, numeric coercion, and edge-case guards.
 */

import { calculateAutoWeight } from '@/lib/workout-progression';

describe('calculateAutoWeight', () => {
  it('returns 0 when lastWeight is null', () => {
    expect(calculateAutoWeight(null, 5)).toBe(0);
  });

  it('returns lastWeight unchanged when progression is 0', () => {
    expect(calculateAutoWeight(80, 0)).toBe(80);
  });

  it('returns lastWeight unchanged when progression is undefined/NaN', () => {
    expect(calculateAutoWeight(80, NaN)).toBe(80);
    expect(calculateAutoWeight(80, Number(undefined))).toBe(80);
  });

  it('adds positive progression to lastWeight', () => {
    expect(calculateAutoWeight(80, 2.5)).toBe(82.5);
  });

  it('handles negative progression (deload)', () => {
    expect(calculateAutoWeight(80, -5)).toBe(75);
  });

  it('handles string-like numeric inputs via coercion', () => {
    // The function receives numbers, but the original code used Number() coercion
    // on both parameters to guard against DB-returned strings
    expect(calculateAutoWeight(80, Number('2.5'))).toBe(82.5);
    expect(calculateAutoWeight(Number('80'), Number('2.5'))).toBe(82.5);
  });

  it('returns progression value when lastWeight is 0 and progression is non-zero', () => {
    // 0 + progression = progression (baseline of 0 means "no previous weight",
    // so the autopopulated value is just the progression)
    expect(calculateAutoWeight(0, 5)).toBe(5);
  });

  it('returns lastWeight when progression results in NaN', () => {
    // NaN progression: should fallback to lastWeight
    expect(calculateAutoWeight(80, NaN)).toBe(80);
  });

  it('handles decimal progression precisely', () => {
    expect(calculateAutoWeight(60, 1.25)).toBe(61.25);
  });

  it('handles large progression values', () => {
    expect(calculateAutoWeight(60, 20)).toBe(80);
  });

  it('returns lastWeight when lastWeight is null regardless of progression', () => {
    expect(calculateAutoWeight(null, 10)).toBe(0);
    expect(calculateAutoWeight(null, -5)).toBe(0);
  });

  it('returns 0 for lastWeight=0 with progression=0', () => {
    expect(calculateAutoWeight(0, 0)).toBe(0);
  });
});