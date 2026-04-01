/**
 * Unit tests for lib/variant-utils.ts
 * Tests applyVariantOption, removeVariantOption, isVariantOptionSelected
 * with Valid, Invalid, Null/Empty, Boundary, and Exception categories
 */

import {
  applyVariantOption,
  removeVariantOption,
  isVariantOptionSelected,
  getVariantOptionKey,
  getVariantOptionLabel,
} from '@/lib/variant-utils';
import type { ExerciseVariant, ExerciseVariantOption } from '@/types';

// =============================================================================
// getVariantOptionKey
// =============================================================================

describe('getVariantOptionKey', () => {
  it('should generate key with field and value', () => {
    const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
    expect(getVariantOptionKey(option)).toBe('angle:Incline');
  });

  it('should use "extra" prefix when no field', () => {
    const option: ExerciseVariantOption = { label: 'Tempo' };
    expect(getVariantOptionKey(option)).toBe('extra:Tempo');
  });

  it('should use label as fallback when no value', () => {
    const option: ExerciseVariantOption = { label: 'Pause', field: 'grip' };
    expect(getVariantOptionKey(option)).toBe('grip:Pause');
  });
});

// =============================================================================
// getVariantOptionLabel
// =============================================================================

describe('getVariantOptionLabel', () => {
  it('should return value when present', () => {
    const option: ExerciseVariantOption = { label: 'Incline Press', field: 'angle', value: 'Incline' };
    expect(getVariantOptionLabel(option)).toBe('Incline');
  });

  it('should return label when no value', () => {
    const option: ExerciseVariantOption = { label: 'Tempo' };
    expect(getVariantOptionLabel(option)).toBe('Tempo');
  });
});

// =============================================================================
// applyVariantOption
// =============================================================================

describe('applyVariantOption', () => {
  describe('valid inputs', () => {
    it('should add angle to null variant', () => {
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      const result = applyVariantOption(null, option);
      expect(result).toEqual({ angle: 'Incline' });
    });

    it('should add grip to existing variant', () => {
      const current: ExerciseVariant = { angle: 'Flat' };
      const option: ExerciseVariantOption = { label: 'Wide', field: 'grip', value: 'Wide' };
      const result = applyVariantOption(current, option);
      expect(result).toEqual({ angle: 'Flat', grip: 'Wide' });
    });

    it('should overwrite existing field value', () => {
      const current: ExerciseVariant = { angle: 'Flat' };
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      const result = applyVariantOption(current, option);
      expect(result).toEqual({ angle: 'Incline' });
    });

    it('should add extra when no field', () => {
      const option: ExerciseVariantOption = { label: 'Tempo' };
      const result = applyVariantOption(null, option);
      expect(result).toEqual({ extras: ['Tempo'] });
    });

    it('should append extra to existing extras', () => {
      const current: ExerciseVariant = { extras: ['Pause'] };
      const option: ExerciseVariantOption = { label: 'Tempo' };
      const result = applyVariantOption(current, option);
      expect(result).toEqual({ extras: ['Pause', 'Tempo'] });
    });
  });

  describe('invalid inputs', () => {
    it('should not add duplicate extra', () => {
      const current: ExerciseVariant = { extras: ['Tempo'] };
      const option: ExerciseVariantOption = { label: 'Tempo' };
      const result = applyVariantOption(current, option);
      expect(result).toEqual({ extras: ['Tempo'] });
    });

    it('should handle option with empty value as extra', () => {
      const option: ExerciseVariantOption = { label: 'Test', field: 'angle', value: '' };
      const result = applyVariantOption(null, option);
      expect(result).toEqual({ extras: ['Test'] });
    });
  });

  describe('null and empty inputs', () => {
    it('should handle undefined variant', () => {
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      const result = applyVariantOption(undefined, option);
      expect(result).toEqual({ angle: 'Incline' });
    });

    it('should handle null variant with extra', () => {
      const option: ExerciseVariantOption = { label: 'Belt' };
      const result = applyVariantOption(null, option);
      expect(result).toEqual({ extras: ['Belt'] });
    });
  });

  describe('boundary inputs', () => {
    it('should handle adding all four field types', () => {
      let variant: ExerciseVariant | null = null;
      variant = applyVariantOption(variant, { label: 'I', field: 'angle', value: 'Incline' });
      variant = applyVariantOption(variant, { label: 'W', field: 'grip', value: 'Wide' });
      variant = applyVariantOption(variant, { label: 'S', field: 'posture', value: 'Seated' });
      variant = applyVariantOption(variant, { label: 'U', field: 'laterality', value: 'Unilateral' });
      expect(variant).toEqual({
        angle: 'Incline',
        grip: 'Wide',
        posture: 'Seated',
        laterality: 'Unilateral',
      });
    });

    it('should handle multiple extras', () => {
      let variant: ExerciseVariant | null = null;
      variant = applyVariantOption(variant, { label: 'Tempo' });
      variant = applyVariantOption(variant, { label: 'Pause' });
      variant = applyVariantOption(variant, { label: 'Belt' });
      expect(variant).toEqual({ extras: ['Tempo', 'Pause', 'Belt'] });
    });
  });

  describe('exception inputs', () => {
    it('should not mutate original variant', () => {
      const current: ExerciseVariant = { angle: 'Flat' };
      const option: ExerciseVariantOption = { label: 'Wide', field: 'grip', value: 'Wide' };
      applyVariantOption(current, option);
      expect(current).toEqual({ angle: 'Flat' });
    });

    it('should handle option with field but no value as extra', () => {
      const option: ExerciseVariantOption = { label: 'Something', field: 'grip' };
      const result = applyVariantOption(null, option);
      expect(result).toEqual({ extras: ['Something'] });
    });
  });
});

// =============================================================================
// removeVariantOption
// =============================================================================

describe('removeVariantOption', () => {
  describe('valid inputs', () => {
    it('should remove angle field', () => {
      const current: ExerciseVariant = { angle: 'Incline', grip: 'Wide' };
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      const result = removeVariantOption(current, option);
      expect(result).toEqual({ grip: 'Wide' });
    });

    it('should remove specific extra', () => {
      const current: ExerciseVariant = { extras: ['Tempo', 'Pause'] };
      const option: ExerciseVariantOption = { label: 'Tempo' };
      const result = removeVariantOption(current, option);
      expect(result).toEqual({ extras: ['Pause'] });
    });

    it('should return null when removing last field', () => {
      const current: ExerciseVariant = { angle: 'Incline' };
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      const result = removeVariantOption(current, option);
      expect(result).toBeNull();
    });

    it('should return null when removing last extra', () => {
      const current: ExerciseVariant = { extras: ['Tempo'] };
      const option: ExerciseVariantOption = { label: 'Tempo' };
      const result = removeVariantOption(current, option);
      expect(result).toBeNull();
    });

    it('should remove extras array when last extra removed but other fields exist', () => {
      const current: ExerciseVariant = { angle: 'Flat', extras: ['Tempo'] };
      const option: ExerciseVariantOption = { label: 'Tempo' };
      const result = removeVariantOption(current, option);
      expect(result).toEqual({ angle: 'Flat' });
      expect(result).not.toHaveProperty('extras');
    });
  });

  describe('invalid inputs', () => {
    it('should not remove if field value does not match', () => {
      const current: ExerciseVariant = { angle: 'Flat' };
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      const result = removeVariantOption(current, option);
      expect(result).toEqual({ angle: 'Flat' });
    });

    it('should not remove non-existent extra', () => {
      const current: ExerciseVariant = { extras: ['Tempo'] };
      const option: ExerciseVariantOption = { label: 'Belt' };
      const result = removeVariantOption(current, option);
      expect(result).toEqual({ extras: ['Tempo'] });
    });
  });

  describe('null and empty inputs', () => {
    it('should return null for null variant', () => {
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      expect(removeVariantOption(null, option)).toBeNull();
    });

    it('should return null for undefined variant', () => {
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      expect(removeVariantOption(undefined, option)).toBeNull();
    });
  });

  describe('boundary inputs', () => {
    it('should handle removing all fields one by one', () => {
      let variant: ExerciseVariant | null = {
        angle: 'Incline',
        grip: 'Wide',
        posture: 'Seated',
        laterality: 'Unilateral',
      };
      variant = removeVariantOption(variant, { label: 'I', field: 'angle', value: 'Incline' });
      variant = removeVariantOption(variant, { label: 'W', field: 'grip', value: 'Wide' });
      variant = removeVariantOption(variant, { label: 'S', field: 'posture', value: 'Seated' });
      variant = removeVariantOption(variant, { label: 'U', field: 'laterality', value: 'Unilateral' });
      expect(variant).toBeNull();
    });

    it('should handle removing all extras one by one', () => {
      let variant: ExerciseVariant | null = { extras: ['A', 'B', 'C'] };
      variant = removeVariantOption(variant, { label: 'A' });
      variant = removeVariantOption(variant, { label: 'B' });
      variant = removeVariantOption(variant, { label: 'C' });
      expect(variant).toBeNull();
    });
  });

  describe('exception inputs', () => {
    it('should not mutate original variant', () => {
      const current: ExerciseVariant = { angle: 'Flat', grip: 'Wide' };
      removeVariantOption(current, { label: 'Flat', field: 'angle', value: 'Flat' });
      expect(current).toEqual({ angle: 'Flat', grip: 'Wide' });
    });

    it('should handle removing extra with no field option', () => {
      const current: ExerciseVariant = { angle: 'Flat', extras: ['Tempo'] };
      const option: ExerciseVariantOption = { label: 'Tempo' };
      const result = removeVariantOption(current, option);
      expect(result).toEqual({ angle: 'Flat' });
    });
  });
});

// =============================================================================
// isVariantOptionSelected
// =============================================================================

describe('isVariantOptionSelected', () => {
  describe('valid inputs', () => {
    it('should return true when field matches', () => {
      const variant: ExerciseVariant = { angle: 'Incline' };
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      expect(isVariantOptionSelected(variant, option)).toBe(true);
    });

    it('should return false when field does not match', () => {
      const variant: ExerciseVariant = { angle: 'Flat' };
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      expect(isVariantOptionSelected(variant, option)).toBe(false);
    });

    it('should return true when extra is present', () => {
      const variant: ExerciseVariant = { extras: ['Tempo', 'Pause'] };
      const option: ExerciseVariantOption = { label: 'Tempo' };
      expect(isVariantOptionSelected(variant, option)).toBe(true);
    });

    it('should return false when extra is not present', () => {
      const variant: ExerciseVariant = { extras: ['Tempo'] };
      const option: ExerciseVariantOption = { label: 'Belt' };
      expect(isVariantOptionSelected(variant, option)).toBe(false);
    });

    it('should return true when field matches among multiple fields', () => {
      const variant: ExerciseVariant = { angle: 'Incline', grip: 'Wide' };
      const option: ExerciseVariantOption = { label: 'Wide', field: 'grip', value: 'Wide' };
      expect(isVariantOptionSelected(variant, option)).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('should return false for mismatched field value', () => {
      const variant: ExerciseVariant = { angle: 'Flat' };
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      expect(isVariantOptionSelected(variant, option)).toBe(false);
    });

    it('should return false for non-existent field on variant', () => {
      const variant: ExerciseVariant = { grip: 'Wide' };
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      expect(isVariantOptionSelected(variant, option)).toBe(false);
    });
  });

  describe('null and empty inputs', () => {
    it('should return false for null variant', () => {
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      expect(isVariantOptionSelected(null, option)).toBe(false);
    });

    it('should return false for undefined variant', () => {
      const option: ExerciseVariantOption = { label: 'Incline', field: 'angle', value: 'Incline' };
      expect(isVariantOptionSelected(undefined, option)).toBe(false);
    });

    it('should return false for empty extras array', () => {
      const variant: ExerciseVariant = { extras: [] };
      const option: ExerciseVariantOption = { label: 'Tempo' };
      expect(isVariantOptionSelected(variant, option)).toBe(false);
    });
  });

  describe('boundary inputs', () => {
    it('should check all four field types', () => {
      const variant: ExerciseVariant = {
        angle: 'Incline',
        grip: 'Wide',
        posture: 'Seated',
        laterality: 'Unilateral',
      };
      expect(isVariantOptionSelected(variant, { label: 'I', field: 'angle', value: 'Incline' })).toBe(true);
      expect(isVariantOptionSelected(variant, { label: 'W', field: 'grip', value: 'Wide' })).toBe(true);
      expect(isVariantOptionSelected(variant, { label: 'S', field: 'posture', value: 'Seated' })).toBe(true);
      expect(isVariantOptionSelected(variant, { label: 'U', field: 'laterality', value: 'Unilateral' })).toBe(true);
    });
  });

  describe('exception inputs', () => {
    it('should handle variant with only extras', () => {
      const variant: ExerciseVariant = { extras: ['Tempo'] };
      const option: ExerciseVariantOption = { label: 'Tempo' };
      expect(isVariantOptionSelected(variant, option)).toBe(true);
    });

    it('should handle empty variant object', () => {
      const variant: ExerciseVariant = {};
      const option: ExerciseVariantOption = { label: 'Tempo' };
      expect(isVariantOptionSelected(variant, option)).toBe(false);
    });
  });
});
