import { safeParseFloat, safeParseInt } from '@/lib/safe-convert';

describe('lib/safe-convert', () => {
  describe('safeParseFloat', () => {
    it('parses normal positive numbers', () => {
      expect(safeParseFloat('80.5', 0)).toBe(80.5);
      expect(safeParseFloat('92.5', 0)).toBe(92.5);
    });

    it('parses integer strings', () => {
      expect(safeParseFloat('8', 0)).toBe(8);
    });

    it('preserves zero without falling back', () => {
      expect(safeParseFloat('0', 99)).toBe(0);
      expect(safeParseFloat('0.0', 99)).toBe(0);
      expect(safeParseFloat(0, 99)).toBe(0);
    });

    it('preserves negative values', () => {
      expect(safeParseFloat('-5', 0)).toBe(-5);
      expect(safeParseFloat('-0.5', 0)).toBe(-0.5);
    });

    it('returns fallback for empty string', () => {
      expect(safeParseFloat('', 0)).toBe(0);
      expect(safeParseFloat('', 99)).toBe(99);
    });

    it('returns fallback for non-numeric strings', () => {
      expect(safeParseFloat('abc', 0)).toBe(0);
      expect(safeParseFloat('abc', 2.5)).toBe(2.5);
    });

    it('returns fallback for NaN input', () => {
      expect(safeParseFloat(NaN, 0)).toBe(0);
    });

    it('returns fallback for Infinity input', () => {
      expect(safeParseFloat(Infinity, 0)).toBe(0);
      expect(safeParseFloat(-Infinity, 0)).toBe(0);
    });

    it('accepts number input directly', () => {
      expect(safeParseFloat(80.5, 0)).toBe(80.5);
      expect(safeParseFloat(0, 99)).toBe(0);
    });
  });

  describe('safeParseInt', () => {
    it('parses normal positive integers', () => {
      expect(safeParseInt('8', 0)).toBe(8);
      expect(safeParseInt('3', 0)).toBe(3);
    });

    it('truncates floating-point strings to integer', () => {
      expect(safeParseInt('8.9', 0)).toBe(8);
      expect(safeParseInt('180.5', 0)).toBe(180);
    });

    it('preserves zero without falling back', () => {
      expect(safeParseInt('0', 8)).toBe(0);
      expect(safeParseInt('0', 3)).toBe(0);
      expect(safeParseInt(0, 180)).toBe(0);
    });

    it('preserves negative integers', () => {
      expect(safeParseInt('-5', 0)).toBe(-5);
    });

    it('returns fallback for empty string', () => {
      expect(safeParseInt('', 8)).toBe(8);
      expect(safeParseInt('', 3)).toBe(3);
    });

    it('returns fallback for non-numeric strings', () => {
      expect(safeParseInt('abc', 8)).toBe(8);
      expect(safeParseInt('abc', 180)).toBe(180);
    });

    it('returns fallback for NaN input', () => {
      expect(safeParseInt(NaN, 8)).toBe(8);
    });

    it('returns fallback for Infinity input', () => {
      expect(safeParseInt(Infinity, 8)).toBe(8);
    });

    it('accepts number input directly', () => {
      expect(safeParseInt(8, 0)).toBe(8);
      expect(safeParseInt(0, 99)).toBe(0);
    });
  });

  describe('regression: contrast with old falsy-guard patterns', () => {
    it('parseFloat("0") || 8 returns 8 (bug), safeParseInt("0", 8) returns 0 (fix)', () => {
      expect(parseFloat('0') || 8).toBe(8);
      expect(safeParseInt('0', 8)).toBe(0);
    });

    it('parseFloat("0") || 0 returns 0 (coincidence), safeParseFloat("0", 0) returns 0 (intentional)', () => {
      expect(parseFloat('0') || 0).toBe(0);
      expect(safeParseFloat('0', 0)).toBe(0);
    });

    it('parseInt("0", 10) || 3 returns 3 (bug), safeParseInt("0", 3) returns 0 (fix)', () => {
      expect(parseInt('0', 10) || 3).toBe(3);
      expect(safeParseInt('0', 3)).toBe(0);
    });

    it('parseFloat("") || 0 returns 0, safeParseFloat("", 0) also returns 0', () => {
      expect(parseFloat('') || 0).toBe(0);
      expect(safeParseFloat('', 0)).toBe(0);
    });
  });
});