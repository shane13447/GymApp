/**
 * Unit tests for lib/utils.ts
 * Tests the cn() utility function with valid, invalid, incorrectly typed, null, and edge case data
 */

import { cn, getExerciseVariantLabel, formatExerciseDisplayName } from '@/lib/utils';

// =============================================================================
// cn (className utility)
// =============================================================================

describe('cn', () => {
  describe('valid data', () => {
    it('should merge single class', () => {
      const result = cn('bg-blue-500');
      expect(result).toBe('bg-blue-500');
    });

    it('should merge multiple classes', () => {
      const result = cn('bg-blue-500', 'text-white', 'p-4');
      expect(result).toBe('bg-blue-500 text-white p-4');
    });

    it('should handle conditional classes with truthy values', () => {
      const isActive = true;
      const result = cn('base-class', isActive && 'active-class');
      expect(result).toBe('base-class active-class');
    });

    it('should handle conditional classes with falsy values', () => {
      const isActive = false;
      const result = cn('base-class', isActive && 'active-class');
      expect(result).toBe('base-class');
    });

    it('should merge conflicting Tailwind classes (last wins)', () => {
      const result = cn('bg-red-500', 'bg-blue-500');
      expect(result).toBe('bg-blue-500');
    });

    it('should merge conflicting padding classes', () => {
      const result = cn('p-2', 'p-4');
      expect(result).toBe('p-4');
    });

    it('should handle object syntax', () => {
      const result = cn({
        'bg-blue-500': true,
        'text-white': true,
        'hidden': false,
      });
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('text-white');
      expect(result).not.toContain('hidden');
    });

    it('should handle array syntax', () => {
      const result = cn(['bg-blue-500', 'text-white']);
      expect(result).toBe('bg-blue-500 text-white');
    });

    it('should handle nested arrays', () => {
      const result = cn(['bg-blue-500', ['text-white', 'p-4']]);
      expect(result).toBe('bg-blue-500 text-white p-4');
    });

    it('should handle mixed syntax', () => {
      const result = cn(
        'base',
        ['array-class'],
        { 'object-class': true },
        true && 'conditional'
      );
      expect(result).toContain('base');
      expect(result).toContain('array-class');
      expect(result).toContain('object-class');
      expect(result).toContain('conditional');
    });
  });

  describe('invalid data', () => {
    it('should handle empty string', () => {
      const result = cn('');
      expect(result).toBe('');
    });

    it('should handle whitespace-only string', () => {
      const result = cn('   ');
      expect(result).toBe('');
    });

    it('should filter out empty strings in array', () => {
      const result = cn('valid', '', 'another');
      expect(result).toBe('valid another');
    });
  });

  describe('null and empty data', () => {
    it('should handle no arguments', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('should handle null', () => {
      const result = cn(null);
      expect(result).toBe('');
    });

    it('should handle undefined', () => {
      const result = cn(undefined);
      expect(result).toBe('');
    });

    it('should handle null in array', () => {
      const result = cn('valid', null, 'another');
      expect(result).toBe('valid another');
    });

    it('should handle undefined in array', () => {
      const result = cn('valid', undefined, 'another');
      expect(result).toBe('valid another');
    });

    it('should handle empty object', () => {
      const result = cn({});
      expect(result).toBe('');
    });

    it('should handle empty array', () => {
      const result = cn([]);
      expect(result).toBe('');
    });
  });

  describe('incorrectly typed data', () => {
    it('should handle number (converted to string)', () => {
      const result = cn(123 as unknown as string);
      expect(result).toBe('123');
    });

    it('should handle boolean false', () => {
      const result = cn(false);
      expect(result).toBe('');
    });

    it('should handle boolean true (unusual but possible)', () => {
      const result = cn(true as unknown as string);
      expect(result).toBe('');
    });

    it('should handle zero (falsy value returns empty)', () => {
      const result = cn(0 as unknown as string);
      // clsx/tailwind-merge treats 0 as falsy, so it returns empty string
      expect(result).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should deduplicate identical classes', () => {
      const result = cn('p-4', 'p-4');
      expect(result).toBe('p-4');
    });

    it('should handle very long class strings', () => {
      const longClass = 'a'.repeat(1000);
      const result = cn(longClass);
      expect(result).toBe(longClass);
    });

    it('should handle many arguments', () => {
      const classes = Array.from({ length: 100 }, (_, i) => `class-${i}`);
      const result = cn(...classes);
      expect(result.split(' ').length).toBe(100);
    });

    it('should handle special characters in class names', () => {
      const result = cn('hover:bg-blue-500', 'focus:ring-2', 'sm:p-4');
      expect(result).toBe('hover:bg-blue-500 focus:ring-2 sm:p-4');
    });

    it('should handle arbitrary value syntax', () => {
      const result = cn('w-[100px]', 'h-[50px]');
      expect(result).toBe('w-[100px] h-[50px]');
    });

    it('should handle negative values', () => {
      const result = cn('-mt-4', '-ml-2');
      expect(result).toBe('-mt-4 -ml-2');
    });

    it('should handle !important modifier', () => {
      const result = cn('!p-4', '!m-2');
      expect(result).toBe('!p-4 !m-2');
    });

    it('should properly merge responsive variants', () => {
      const result = cn('p-2', 'sm:p-4', 'md:p-6', 'lg:p-8');
      expect(result).toBe('p-2 sm:p-4 md:p-6 lg:p-8');
    });

    it('should handle dark mode variants', () => {
      const result = cn('bg-white', 'dark:bg-gray-900');
      expect(result).toBe('bg-white dark:bg-gray-900');
    });

    it('should merge conflicting responsive classes', () => {
      const result = cn('sm:p-2', 'sm:p-4');
      expect(result).toBe('sm:p-4');
    });
  });

  describe('real-world usage patterns', () => {
    it('should handle component variant pattern', () => {
      const variant: string = 'primary';
      const size: string = 'lg';
      const result = cn(
        'rounded-full font-medium',
        variant === 'primary' && 'bg-blue-500 text-white',
        variant === 'secondary' && 'bg-gray-200 text-gray-800',
        size === 'sm' && 'px-2 py-1 text-sm',
        size === 'lg' && 'px-4 py-2 text-lg'
      );
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('px-4');
      expect(result).not.toContain('bg-gray-200');
      expect(result).not.toContain('px-2');
    });

    it('should handle disabled state pattern', () => {
      const isDisabled = true;
      const result = cn(
        'bg-blue-500 cursor-pointer',
        isDisabled && 'opacity-50 cursor-not-allowed'
      );
      expect(result).toContain('opacity-50');
      expect(result).toContain('cursor-not-allowed');
    });

    it('should handle pressed state pattern', () => {
      const isPressed = true;
      const result = cn(
        'bg-blue-500',
        isPressed ? 'opacity-70' : 'opacity-100'
      );
      expect(result).toContain('opacity-70');
      expect(result).not.toContain('opacity-100');
    });
  });
});

// =============================================================================
// getExerciseVariantLabel
// =============================================================================

describe('getExerciseVariantLabel', () => {
  describe('valid data', () => {
    it('should return angle label', () => {
      expect(getExerciseVariantLabel({ angle: 'Incline' })).toBe('Incline');
    });

    it('should return grip label', () => {
      expect(getExerciseVariantLabel({ grip: 'Wide' })).toBe('Wide');
    });

    it('should return multiple labels in order', () => {
      expect(getExerciseVariantLabel({ angle: 'Decline', grip: 'Close' })).toBe('Decline, Close');
    });

    it('should return extras when no field labels', () => {
      expect(getExerciseVariantLabel({ extras: ['Tempo'] })).toBe('Tempo');
    });

    it('should combine field labels and extras', () => {
      expect(getExerciseVariantLabel({ angle: 'Flat', extras: ['Pause'] })).toBe('Flat, Pause');
    });

    it('should return all four field labels in correct order', () => {
      expect(getExerciseVariantLabel({
        angle: 'Incline',
        grip: 'Wide',
        posture: 'Seated',
        laterality: 'Unilateral',
      })).toBe('Incline, Wide, Seated, Unilateral');
    });
  });

  describe('invalid data', () => {
    it('should return empty string for empty angle', () => {
      expect(getExerciseVariantLabel({ angle: '' })).toBe('');
    });

    it('should return empty string for whitespace-only grip', () => {
      expect(getExerciseVariantLabel({ grip: '  ' })).toBe('');
    });

    it('should ignore unknown fields', () => {
      expect(getExerciseVariantLabel({ unknown: 'value' } as any)).toBe('');
    });
  });

  describe('null and empty data', () => {
    it('should return empty string for null', () => {
      expect(getExerciseVariantLabel(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(getExerciseVariantLabel(undefined)).toBe('');
    });

    it('should return empty string for empty object', () => {
      expect(getExerciseVariantLabel({})).toBe('');
    });
  });

  describe('boundary inputs', () => {
    it('should handle all fields plus extras', () => {
      expect(getExerciseVariantLabel({
        angle: 'a',
        grip: 'b',
        posture: 'c',
        laterality: 'd',
        extras: ['e', 'f'],
      })).toBe('a, b, c, d, e, f');
    });

    it('should handle single-character labels', () => {
      expect(getExerciseVariantLabel({ angle: 'X' })).toBe('X');
    });
  });

  describe('exception inputs', () => {
    it('should filter empty strings from extras', () => {
      expect(getExerciseVariantLabel({ extras: ['', '', 'valid'] })).toBe('valid');
    });

    it('should trim whitespace from labels', () => {
      expect(getExerciseVariantLabel({ angle: '  Incline  ' })).toBe('Incline');
    });

    it('should trim whitespace from extras', () => {
      expect(getExerciseVariantLabel({ extras: ['  Tempo  '] })).toBe('Tempo');
    });

    it('should return empty if all extras are empty', () => {
      expect(getExerciseVariantLabel({ extras: ['', '  ', ''] })).toBe('');
    });
  });
});

// =============================================================================
// formatExerciseDisplayName
// =============================================================================

describe('formatExerciseDisplayName', () => {
  describe('valid data', () => {
    it('should format name with angle variant', () => {
      expect(formatExerciseDisplayName('Bench Press', { angle: 'Incline' })).toBe('Bench Press (Incline)');
    });

    it('should return name without parens when no variant', () => {
      expect(formatExerciseDisplayName('Squat', null)).toBe('Squat');
    });

    it('should format name with multiple variant fields', () => {
      expect(formatExerciseDisplayName('Deadlift', { grip: 'Mixed', extras: ['Belt'] })).toBe('Deadlift (Mixed, Belt)');
    });

    it('should format name with all four fields', () => {
      expect(formatExerciseDisplayName('Row', {
        angle: '45',
        grip: 'Wide',
        posture: 'Seated',
        laterality: 'Bilateral',
      })).toBe('Row (45, Wide, Seated, Bilateral)');
    });
  });

  describe('null and empty data', () => {
    it('should return name when variant is null', () => {
      expect(formatExerciseDisplayName('Bench Press', null)).toBe('Bench Press');
    });

    it('should return name when variant is undefined', () => {
      expect(formatExerciseDisplayName('Bench Press', undefined)).toBe('Bench Press');
    });

    it('should return name when variant is empty object', () => {
      expect(formatExerciseDisplayName('Bench Press', {})).toBe('Bench Press');
    });

    it('should return name when variant has only empty fields', () => {
      expect(formatExerciseDisplayName('Bench Press', { angle: '' })).toBe('Bench Press');
    });
  });

  describe('boundary inputs', () => {
    it('should handle long exercise name with all variant fields', () => {
      const result = formatExerciseDisplayName('Very Long Exercise Name That Is Quite Long', {
        angle: 'Incline',
        grip: 'Wide',
        posture: 'Seated',
        laterality: 'Unilateral',
      });
      expect(result).toContain('Very Long Exercise Name That Is Quite Long');
      expect(result).toContain('(Incline, Wide, Seated, Unilateral)');
    });

    it('should handle single-character name', () => {
      expect(formatExerciseDisplayName('X', { angle: 'Y' })).toBe('X (Y)');
    });
  });

  describe('exception inputs', () => {
    it('should filter empty extras in display', () => {
      expect(formatExerciseDisplayName('Exercise', { extras: ['', '', 'only'] })).toBe('Exercise (only)');
    });

    it('should return variant label alone for empty name', () => {
      expect(formatExerciseDisplayName('', { angle: 'Flat' })).toBe('Flat');
    });
  });
});
