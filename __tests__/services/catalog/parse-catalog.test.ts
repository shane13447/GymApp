import {
  parseVariantOption,
  parseVariantOptions,
  getDefaultVariantForExercise,
  parseExerciseCatalog,
} from '@/services/catalog/parse-catalog';
import type { ExerciseVariantOption } from '@/types';

describe('services/catalog/parse-catalog', () => {
  describe('parseVariantOption', () => {
    it('returns null for null', () => {
      expect(parseVariantOption(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(parseVariantOption(undefined)).toBeNull();
    });

    it('returns null for non-object', () => {
      expect(parseVariantOption('string')).toBeNull();
    });

    it('returns null for object with empty label', () => {
      expect(parseVariantOption({ label: '' })).toBeNull();
    });

    it('returns null for object with whitespace-only label', () => {
      expect(parseVariantOption({ label: '  ' })).toBeNull();
    });

    it('parses a valid variant option with field', () => {
      const result = parseVariantOption({ label: 'Flat', field: 'angle', value: 'Flat' });
      expect(result).toEqual({
        label: 'Flat',
        field: 'angle',
        value: 'Flat',
        aliases: undefined,
      });
    });

    it('parses a variant option without field (extra variant)', () => {
      const result = parseVariantOption({ label: 'Pause Reps', value: undefined });
      expect(result).toEqual({
        label: 'Pause Reps',
        field: undefined,
        value: undefined,
        aliases: undefined,
      });
    });

    it('rejects unknown field values', () => {
      const result = parseVariantOption({ label: 'Test', field: 'unknown_field', value: 'x' });
      expect(result?.field).toBeUndefined();
    });

    it('accepts all valid variant fields', () => {
      for (const field of ['angle', 'grip', 'posture', 'laterality'] as const) {
        const result = parseVariantOption({ label: 'Test', field, value: 'test' });
        expect(result?.field).toBe(field);
      }
    });

    it('trims label whitespace', () => {
      const result = parseVariantOption({ label: '  Wide  ' });
      expect(result?.label).toBe('Wide');
    });

    it('handles aliases', () => {
      const result = parseVariantOption({ label: 'Close Grip', field: 'grip', value: 'Close', aliases: ['CG', 'Narrow'] });
      expect(result?.aliases).toEqual(['CG', 'Narrow']);
    });

    it('filters non-string aliases', () => {
      const result = parseVariantOption({ label: 'Test', aliases: [1, 'a', true, 'b'] as any[] });
      expect(result?.aliases).toEqual(['a', 'b']);
    });

    it('returns undefined aliases when empty after filtering', () => {
      const result = parseVariantOption({ label: 'Test', aliases: [1, true] as any[] });
      expect(result?.aliases).toBeUndefined();
    });
  });

  describe('parseVariantOptions', () => {
    it('returns undefined for non-array', () => {
      expect(parseVariantOptions(null)).toBeUndefined();
      expect(parseVariantOptions(undefined)).toBeUndefined();
      expect(parseVariantOptions('string')).toBeUndefined();
      expect(parseVariantOptions({})).toBeUndefined();
    });

    it('returns undefined for empty array after parsing', () => {
      expect(parseVariantOptions([null, undefined, { label: '' }])).toBeUndefined();
    });

    it('parses valid variant options', () => {
      const raw = [
        { label: 'Incline', field: 'angle', value: 'Incline' },
        { label: 'Close', field: 'grip', value: 'Close' },
      ];
      const result = parseVariantOptions(raw);
      expect(result).toHaveLength(2);
      expect(result?.[0].label).toBe('Incline');
      expect(result?.[1].label).toBe('Close');
    });
  });

  describe('getDefaultVariantForExercise', () => {
    it('returns null for empty options', () => {
      expect(getDefaultVariantForExercise([])).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(getDefaultVariantForExercise(undefined)).toBeNull();
    });

    it('builds variant from first value of each field', () => {
      const options: ExerciseVariantOption[] = [
        { label: 'Flat', field: 'angle', value: 'Flat' },
        { label: 'Wide', field: 'grip', value: 'Wide' },
      ];
      const result = getDefaultVariantForExercise(options);
      expect(result).toEqual({ angle: 'Flat', grip: 'Wide' });
    });

    it('skips options without field or value', () => {
      const options: ExerciseVariantOption[] = [
        { label: 'Pause' },
        { label: 'Incline', field: 'angle', value: 'Incline' },
      ];
      const result = getDefaultVariantForExercise(options);
      expect(result).toEqual({ angle: 'Incline' });
    });

    it('takes first value per field and ignores duplicates', () => {
      const options: ExerciseVariantOption[] = [
        { label: 'Incline', field: 'angle', value: 'Incline' },
        { label: 'Decline', field: 'angle', value: 'Decline' },
      ];
      const result = getDefaultVariantForExercise(options);
      expect(result).toEqual({ angle: 'Incline' });
    });
  });

  describe('parseExerciseCatalog', () => {
    it('parses a valid exercise entry', () => {
      const data = [
        {
          name: 'Bench Press',
          equipment: 'Barbell',
          muscle_groups_worked: ['chest', 'triceps'],
          isCompound: true,
          variantOptions: [{ label: 'Flat', field: 'angle', value: 'Flat' }],
          aliases: ['BP'],
        },
      ];
      const result = parseExerciseCatalog(data as any[]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bench Press');
      expect(result[0].equipment).toBe('Barbell');
      expect(result[0].muscle_groups_worked).toEqual(['chest', 'triceps']);
      expect(result[0].isCompound).toBe(true);
      expect(result[0].variantOptions).toHaveLength(1);
      expect(result[0].aliases).toEqual(['BP']);
    });

    it('handles entry with missing fields gracefully', () => {
      const data = [{}];
      const result = parseExerciseCatalog(data as any[]);
      expect(result[0].name).toBe('');
      expect(result[0].equipment).toBe('');
      expect(result[0].muscle_groups_worked).toEqual([]);
      expect(result[0].isCompound).toBe(false);
    });

    it('handles non-array muscle_groups_worked', () => {
      const data = [{ name: 'Squat', muscle_groups_worked: 'not-array' }];
      const result = parseExerciseCatalog(data as any[]);
      expect(result[0].muscle_groups_worked).toEqual([]);
    });

    it('filters non-string entries from muscle_groups_worked', () => {
      const data = [{ name: 'Squat', muscle_groups_worked: ['quads', 42, true] }];
      const result = parseExerciseCatalog(data as any[]);
      expect(result[0].muscle_groups_worked).toEqual(['quads']);
    });

    it('handles null variantOptions', () => {
      const data = [{ name: 'Squat', variantOptions: null }];
      const result = parseExerciseCatalog(data as any[]);
      expect(result[0].variantOptions).toBeUndefined();
    });

    it('handles aliases with non-string entries', () => {
      const data = [{ name: 'Curl', aliases: [1, 'hammer', true] }];
      const result = parseExerciseCatalog(data as any[]);
      expect(result[0].aliases).toEqual(['hammer']);
    });

    it('returns undefined aliases when all filtered out', () => {
      const data = [{ name: 'Curl', aliases: [1, true] }];
      const result = parseExerciseCatalog(data as any[]);
      expect(result[0].aliases).toBeUndefined();
    });
  });
});