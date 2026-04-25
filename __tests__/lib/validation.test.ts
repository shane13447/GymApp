/**
 * Unit tests for lib/validation.ts
 * Tests validation functions with valid, invalid, incorrectly typed, null, and edge case data
 */

import {
    formatReps,
    formatWeight,
    parseReps,
    parseWeight,
    validateExercise,
    validateNumberOfDays,
    validateProgram,
    validateProgramName,
    validateWorkoutDay,
} from '@/lib/validation';
import type { Program, ProgramExercise, WorkoutDay } from '@/types';

// =============================================================================
// TEST HELPERS
// =============================================================================

const createValidExercise = (overrides: Partial<ProgramExercise> = {}): ProgramExercise => ({
  name: 'Barbell Bench Press',
  equipment: 'Barbell',
  muscle_groups_worked: ['chest', 'triceps', 'shoulders'],
  isCompound: true,
  weight: '80',
  reps: '8',
  sets: '3',
  restTime: '180',
  progression: '2.5',
  hasCustomisedSets: false,
  ...overrides,
});

const createValidWorkoutDay = (overrides: Partial<WorkoutDay> = {}): WorkoutDay => ({
  dayNumber: 1,
  exercises: [createValidExercise()],
  ...overrides,
});

const createValidProgram = (overrides: Partial<Program> = {}): Program => ({
  id: 'test-program-1',
  name: 'Test Program',
  workoutDays: [createValidWorkoutDay()],
  createdAt: new Date().toISOString(),
  ...overrides,
});

// =============================================================================
// validateProgramName
// =============================================================================

describe('validateProgramName', () => {
  describe('valid data', () => {
    it('should accept a valid program name', () => {
      const result = validateProgramName('My Workout Program');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept a single character name', () => {
      const result = validateProgramName('A');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept a name with exactly 100 characters', () => {
      const name = 'A'.repeat(100);
      const result = validateProgramName(name);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept names with special characters', () => {
      const result = validateProgramName('Push/Pull/Legs - Week 1 (Beginner)');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept names with numbers', () => {
      const result = validateProgramName('5x5 Stronglifts 2024');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept unicode characters', () => {
      const result = validateProgramName('肌肉训练 💪');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('invalid data', () => {
    it('should reject a name exceeding 100 characters', () => {
      const name = 'A'.repeat(101);
      const result = validateProgramName(name);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Program name must be 100 characters or less');
    });

    it('should reject a very long name', () => {
      const name = 'A'.repeat(1000);
      const result = validateProgramName(name);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('null and empty data', () => {
    it('should reject an empty string', () => {
      const result = validateProgramName('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Program name is required');
    });

    it('should reject a whitespace-only string', () => {
      const result = validateProgramName('   ');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Program name is required');
    });

    it('should reject tabs and newlines only', () => {
      const result = validateProgramName('\t\n\r');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Program name is required');
    });

    it('should handle null cast as string', () => {
      const result = validateProgramName(null as unknown as string);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Program name is required');
    });

    it('should handle undefined cast as string', () => {
      const result = validateProgramName(undefined as unknown as string);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Program name is required');
    });
  });

  describe('incorrectly typed data', () => {
    it('should fail gracefully on number cast as string', () => {
      // Numbers don't have .trim() method
      expect(() => validateProgramName(123 as unknown as string)).toThrow();
    });

    it('should fail gracefully on object cast as string', () => {
      // Objects don't have .trim() method
      expect(() => validateProgramName({} as unknown as string)).toThrow();
    });

    it('should fail gracefully on array cast as string', () => {
      // Arrays don't have .trim() method
      expect(() => validateProgramName(['test'] as unknown as string)).toThrow();
    });
  });

  describe('edge cases', () => {
    it('should trim whitespace and accept valid name', () => {
      const result = validateProgramName('  Valid Name  ');
      expect(result.isValid).toBe(true);
    });

    it('should handle name with only leading whitespace', () => {
      const result = validateProgramName('   Valid');
      expect(result.isValid).toBe(true);
    });

    it('should count trimmed length for max check', () => {
      // 98 chars + 4 spaces = should be valid after trimming
      const name = '  ' + 'A'.repeat(98) + '  ';
      const result = validateProgramName(name);
      expect(result.isValid).toBe(true);
    });
  });
});

// =============================================================================
// validateNumberOfDays
// =============================================================================

describe('validateNumberOfDays', () => {
  describe('valid data', () => {
    it('should accept 1 day (minimum)', () => {
      const result = validateNumberOfDays(1);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept 7 days (maximum)', () => {
      const result = validateNumberOfDays(7);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept 4 days (middle value)', () => {
      const result = validateNumberOfDays(4);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('invalid data', () => {
    it('should reject 0 days', () => {
      const result = validateNumberOfDays(0);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Must have at least 1 workout day');
    });

    it('should reject negative days', () => {
      const result = validateNumberOfDays(-1);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Must have at least 1 workout day');
    });

    it('should reject 8 days (exceeds max)', () => {
      const result = validateNumberOfDays(8);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Cannot have more than 7 workout days');
    });

    it('should reject very large numbers', () => {
      const result = validateNumberOfDays(1000);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Cannot have more than 7 workout days');
    });
  });

  describe('null and empty data', () => {
    it('should reject NaN', () => {
      const result = validateNumberOfDays(NaN);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Number of days must be a valid number');
    });

    it('should handle null cast as number', () => {
      const result = validateNumberOfDays(null as unknown as number);
      // null becomes 0, which is less than minimum
      expect(result.isValid).toBe(false);
    });

    it('should handle undefined cast as number', () => {
      const result = validateNumberOfDays(undefined as unknown as number);
      // undefined becomes NaN
      expect(result.isValid).toBe(false);
    });
  });

  describe('incorrectly typed data', () => {
    it('should handle string number cast as number', () => {
      const result = validateNumberOfDays('3' as unknown as number);
      // String '3' coerces to 3
      expect(result.isValid).toBe(true);
    });

    it('should handle non-numeric string', () => {
      const result = validateNumberOfDays('abc' as unknown as number);
      expect(result.isValid).toBe(false);
    });

    it('should handle floating point numbers (truncated)', () => {
      const result = validateNumberOfDays(3.7);
      // 3.7 is still greater than MIN and less than MAX
      expect(result.isValid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle Infinity', () => {
      const result = validateNumberOfDays(Infinity);
      expect(result.isValid).toBe(false);
    });

    it('should handle -Infinity', () => {
      const result = validateNumberOfDays(-Infinity);
      expect(result.isValid).toBe(false);
    });

    it('should handle very small negative numbers', () => {
      const result = validateNumberOfDays(-999999);
      expect(result.isValid).toBe(false);
    });
  });
});

// =============================================================================
// validateWorkoutDay
// =============================================================================

describe('validateWorkoutDay', () => {
  describe('valid data', () => {
    it('should accept a day with one exercise', () => {
      const day = createValidWorkoutDay();
      const result = validateWorkoutDay(day);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept a day with multiple exercises', () => {
      const day = createValidWorkoutDay({
        exercises: [
          createValidExercise({ name: 'Exercise 1' }),
          createValidExercise({ name: 'Exercise 2' }),
          createValidExercise({ name: 'Exercise 3' }),
        ],
      });
      const result = validateWorkoutDay(day);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept a day with exactly 20 exercises (max)', () => {
      const exercises = Array.from({ length: 20 }, (_, i) =>
        createValidExercise({ name: `Exercise ${i + 1}` })
      );
      const day = createValidWorkoutDay({ exercises });
      const result = validateWorkoutDay(day);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept the same exercise name with different variants', () => {
      const day = createValidWorkoutDay({
        exercises: [
          createValidExercise({ name: 'Lat Pulldowns', variant: { grip: 'wide' } }),
          createValidExercise({ name: 'Lat Pulldowns', variant: { grip: 'close' } }),
        ],
      });

      const result = validateWorkoutDay(day);
      expect(result.isValid).toBe(true);
    });
  });

  describe('invalid data', () => {
    it('should reject a day with no exercises', () => {
      const day = createValidWorkoutDay({ exercises: [] });
      const result = validateWorkoutDay(day);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('must have at least one exercise');
    });

    it('should reject a day with more than 20 exercises', () => {
      const exercises = Array.from({ length: 21 }, (_, i) =>
        createValidExercise({ name: `Exercise ${i + 1}` })
      );
      const day = createValidWorkoutDay({ exercises, dayNumber: 2 });
      const result = validateWorkoutDay(day);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('cannot have more than 20 exercises');
    });

    it('should reject duplicate same-name and same-variant exercises', () => {
      const day = createValidWorkoutDay({
        exercises: [
          createValidExercise({ name: 'Lat Pulldowns', variant: { grip: 'wide' } }),
          createValidExercise({ name: 'Lat Pulldowns', variant: { grip: 'wide' } }),
        ],
      });

      const result = validateWorkoutDay(day);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Duplicate exercise');
    });
  });

  describe('null and empty data', () => {
    it('should handle null exercises array', () => {
      const day = { dayNumber: 1, exercises: null as unknown as ProgramExercise[] };
      const result = validateWorkoutDay(day);
      expect(result.isValid).toBe(false);
    });

    it('should handle undefined exercises array', () => {
      const day = { dayNumber: 1, exercises: undefined as unknown as ProgramExercise[] };
      const result = validateWorkoutDay(day);
      expect(result.isValid).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should include day number in error message', () => {
      const day = createValidWorkoutDay({ dayNumber: 5, exercises: [] });
      const result = validateWorkoutDay(day);
      expect(result.errors[0]).toContain('Day 5');
    });
  });
});

// =============================================================================
// validateExercise
// =============================================================================

describe('validateExercise', () => {
  describe('valid data', () => {
    it('should accept a valid exercise', () => {
      const exercise = createValidExercise();
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept exercise with empty weight', () => {
      const exercise = createValidExercise({ weight: '' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(true);
    });

    it('should accept exercise with zero weight', () => {
      const exercise = createValidExercise({ weight: '0' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(true);
    });

    it('should accept exercise with decimal weight', () => {
      const exercise = createValidExercise({ weight: '82.5' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(true);
    });

    it('should accept exercise with weight including unit', () => {
      const exercise = createValidExercise({ weight: '80 kg' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(true);
    });

    it('should accept exercise with empty progression', () => {
      const exercise = createValidExercise({ progression: '' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(true);
    });
  });

  describe('invalid data', () => {
    it('should reject exercise with empty name', () => {
      const exercise = createValidExercise({ name: '' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Exercise name is required');
    });

    it('should reject exercise with name exceeding 100 characters', () => {
      const exercise = createValidExercise({ name: 'A'.repeat(101) });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('100 characters or less');
    });

    it('should reject exercise with negative weight', () => {
      const exercise = createValidExercise({ weight: '-10' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Weight cannot be negative');
    });

    it('should reject exercise with invalid sets (0)', () => {
      const exercise = createValidExercise({ sets: '0' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Must have at least 1 set');
    });

    it('should reject exercise with too many sets (>20)', () => {
      const exercise = createValidExercise({ sets: '21' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Cannot have more than 20 sets');
    });

    it('should reject exercise with zero reps', () => {
      const exercise = createValidExercise({ reps: '0' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Reps must be greater than 0');
    });

    it('should reject exercise with negative reps', () => {
      const exercise = createValidExercise({ reps: '-1' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Reps must be greater than 0');
    });

    it('should reject exercise with zero progression', () => {
      const exercise = createValidExercise({ progression: '0' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Progression must be greater than 0 or left empty');
    });

    it('should reject exercise with negative progression', () => {
      const exercise = createValidExercise({ progression: '-2.5' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Progression must be greater than 0 or left empty');
    });

    it('should reject exercise with negative rest time', () => {
      const exercise = createValidExercise({ restTime: '-60' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Rest time cannot be negative');
    });

    it('should reject exercise with rest time exceeding 10 minutes', () => {
      const exercise = createValidExercise({ restTime: '601' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Rest time cannot exceed 10 minutes (600 seconds)');
    });
  });

  describe('null and empty data', () => {
    it('should reject exercise with null name', () => {
      const exercise = createValidExercise({ name: null as unknown as string });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
    });

    it('should accept exercise with empty optional fields', () => {
      const exercise = createValidExercise({
        weight: '',
        sets: '',
        restTime: '',
      });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(true);
    });
  });

  describe('incorrectly typed data', () => {
    it('should fail gracefully on numeric weight cast as string', () => {
      // Numbers don't have .trim() method
      const exercise = createValidExercise({ weight: 80 as unknown as string });
      expect(() => validateExercise(exercise)).toThrow();
    });

    it('should reject non-numeric sets', () => {
      const exercise = createValidExercise({ sets: 'three' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Sets must be a valid number');
    });
  });

  describe('edge cases', () => {
    it('should accept exercise with whitespace-padded name', () => {
      const exercise = createValidExercise({ name: '  Bench Press  ' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(true);
    });

    it('should reject exercise with whitespace-only name', () => {
      const exercise = createValidExercise({ name: '   ' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(false);
    });

    it('should accept boundary rest time (600 seconds)', () => {
      const exercise = createValidExercise({ restTime: '600' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(true);
    });

    it('should accept boundary sets (20)', () => {
      const exercise = createValidExercise({ sets: '20' });
      const result = validateExercise(exercise);
      expect(result.isValid).toBe(true);
    });
  });
});

// =============================================================================
// validateProgram
// =============================================================================

describe('validateProgram', () => {
  describe('valid data', () => {
    it('should accept a valid program', () => {
      const program = createValidProgram();
      const result = validateProgram(program);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept a program with multiple days', () => {
      const program = createValidProgram({
        workoutDays: [
          createValidWorkoutDay({ dayNumber: 1 }),
          createValidWorkoutDay({ dayNumber: 2 }),
          createValidWorkoutDay({ dayNumber: 3 }),
        ],
      });
      const result = validateProgram(program);
      expect(result.isValid).toBe(true);
    });
  });

  describe('invalid data', () => {
    it('should reject program with no name', () => {
      const program = createValidProgram({ name: '' });
      const result = validateProgram(program);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Program name is required');
    });

    it('should reject program with no workout days', () => {
      const program = createValidProgram({ workoutDays: [] });
      const result = validateProgram(program);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Program must have at least one workout day');
    });

    it('should collect errors from nested validations', () => {
      const program = createValidProgram({
        name: '',
        workoutDays: [
          createValidWorkoutDay({ dayNumber: 1, exercises: [] }),
        ],
      });
      const result = validateProgram(program);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('should prefix exercise errors with day number', () => {
      const program = createValidProgram({
        workoutDays: [
          createValidWorkoutDay({
            dayNumber: 3,
            exercises: [createValidExercise({ name: '' })],
          }),
        ],
      });
      const result = validateProgram(program);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Day 3'))).toBe(true);
    });
  });

  describe('null and empty data', () => {
    it('should handle null workoutDays', () => {
      const program = { name: 'Test', workoutDays: null } as unknown as Program;
      const result = validateProgram(program);
      expect(result.isValid).toBe(false);
    });

    it('should handle empty program object', () => {
      const result = validateProgram({});
      expect(result.isValid).toBe(false);
    });
  });
});

// =============================================================================
// parseWeight
// =============================================================================

describe('parseWeight', () => {
  describe('valid data', () => {
    it('should parse numeric weight without unit', () => {
      const result = parseWeight('80');
      expect(result.value).toBe(80);
      expect(result.unit).toBe('');
      expect(result.isValid).toBe(true);
    });

    it('should parse weight with kg unit', () => {
      const result = parseWeight('80 kg');
      expect(result.value).toBe(80);
      expect(result.unit).toBe('kg');
      expect(result.isValid).toBe(true);
    });

    it('should parse weight with lbs unit', () => {
      const result = parseWeight('175 lbs');
      expect(result.value).toBe(175);
      expect(result.unit).toBe('lbs');
      expect(result.isValid).toBe(true);
    });

    it('should parse weight with lb unit (normalize to lbs)', () => {
      const result = parseWeight('175 lb');
      expect(result.value).toBe(175);
      expect(result.unit).toBe('lbs');
      expect(result.isValid).toBe(true);
    });

    it('should parse decimal weight', () => {
      const result = parseWeight('82.5 kg');
      expect(result.value).toBe(82.5);
      expect(result.unit).toBe('kg');
      expect(result.isValid).toBe(true);
    });

    it('should be case insensitive for units', () => {
      const result = parseWeight('80 KG');
      expect(result.value).toBe(80);
      expect(result.unit).toBe('kg');
      expect(result.isValid).toBe(true);
    });
  });

  describe('invalid data', () => {
    it('should reject non-numeric weight', () => {
      const result = parseWeight('heavy');
      expect(result.isValid).toBe(false);
    });

    it('should reject weight with invalid unit', () => {
      const result = parseWeight('80 stones');
      expect(result.isValid).toBe(false);
    });

    it('should reject mixed invalid format', () => {
      const result = parseWeight('80kg50');
      expect(result.isValid).toBe(false);
    });
  });

  describe('null and empty data', () => {
    it('should return valid empty for empty string', () => {
      const result = parseWeight('');
      expect(result.value).toBe(0);
      expect(result.unit).toBe('');
      expect(result.isValid).toBe(true);
    });

    it('should return valid empty for whitespace', () => {
      const result = parseWeight('   ');
      expect(result.value).toBe(0);
      expect(result.isValid).toBe(true);
    });

    it('should handle null cast as string', () => {
      const result = parseWeight(null as unknown as string);
      expect(result.isValid).toBe(true);
      expect(result.value).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero weight', () => {
      const result = parseWeight('0');
      expect(result.value).toBe(0);
      expect(result.isValid).toBe(true);
    });

    it('should handle very large weights', () => {
      const result = parseWeight('999999 kg');
      expect(result.value).toBe(999999);
      expect(result.isValid).toBe(true);
    });

    it('should handle very small decimal weights', () => {
      const result = parseWeight('0.5 kg');
      expect(result.value).toBe(0.5);
      expect(result.isValid).toBe(true);
    });
  });
});

// =============================================================================
// formatWeight
// =============================================================================

describe('formatWeight', () => {
  describe('valid data', () => {
    it('should format weight with default unit', () => {
      const result = formatWeight(80);
      expect(result).toBe('80 kg');
    });

    it('should format weight with specified unit', () => {
      const result = formatWeight(175, 'lbs');
      expect(result).toBe('175 lbs');
    });

    it('should format decimal weight', () => {
      const result = formatWeight(82.5, 'kg');
      expect(result).toBe('82.5 kg');
    });
  });

  describe('edge cases', () => {
    it('should return empty string for zero weight', () => {
      const result = formatWeight(0);
      expect(result).toBe('');
    });

    it('should return empty string for zero weight with unit', () => {
      const result = formatWeight(0, 'lbs');
      expect(result).toBe('');
    });
  });
});

// =============================================================================
// parseReps
// =============================================================================

describe('parseReps', () => {
  describe('valid data', () => {
    it('should parse single rep number', () => {
      const result = parseReps('10');
      expect(result.value).toBe(10);
      expect(result.isValid).toBe(true);
    });

    it('should parse various rep counts', () => {
      expect(parseReps('8').value).toBe(8);
      expect(parseReps('12').value).toBe(12);
      expect(parseReps('5').value).toBe(5);
    });
  });

  describe('invalid data', () => {
    it('should reject non-numeric reps', () => {
      const result = parseReps('many');
      expect(result.isValid).toBe(false);
    });

    it('should reject rep ranges (only whole numbers allowed)', () => {
      const result = parseReps('8-12');
      expect(result.isValid).toBe(false);
    });

    it('should reject zero reps', () => {
      const result = parseReps('0');
      expect(result.isValid).toBe(false);
    });

    it('should reject negative reps', () => {
      const result = parseReps('-5');
      expect(result.isValid).toBe(false);
    });

    it('should reject decimal reps', () => {
      const result = parseReps('8.5');
      expect(result.isValid).toBe(false);
    });
  });

  describe('null and empty data', () => {
    it('should return valid empty for empty string', () => {
      const result = parseReps('');
      expect(result.value).toBe(0);
      expect(result.isValid).toBe(true);
    });

    it('should return valid empty for whitespace', () => {
      const result = parseReps('   ');
      expect(result.value).toBe(0);
      expect(result.isValid).toBe(true);
    });

    it('should handle null cast as string', () => {
      const result = parseReps(null as unknown as string);
      expect(result.isValid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle very high rep counts', () => {
      const result = parseReps('100');
      expect(result.value).toBe(100);
      expect(result.isValid).toBe(true);
    });

    it('should reject numbers with leading zeros', () => {
      const result = parseReps('08');
      expect(result.isValid).toBe(false);
    });

    it('should reject numbers with trailing characters', () => {
      const result = parseReps('10reps');
      expect(result.isValid).toBe(false);
    });
  });
});

// =============================================================================
// formatReps
// =============================================================================

describe('formatReps', () => {
  describe('valid data', () => {
    it('should format rep count', () => {
      const result = formatReps(10);
      expect(result).toBe('10');
    });

    it('should format various rep counts', () => {
      expect(formatReps(8)).toBe('8');
      expect(formatReps(12)).toBe('12');
      expect(formatReps(5)).toBe('5');
    });
  });

  describe('edge cases', () => {
    it('should format zero reps', () => {
      const result = formatReps(0);
      expect(result).toBe('0');
    });

    it('should format high rep counts', () => {
      const result = formatReps(100);
      expect(result).toBe('100');
    });
  });
});
