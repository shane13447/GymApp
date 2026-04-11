import { ExerciseVariant } from '@/types';
import {
  serializeVariant,
  parseStringArrayField,
  parseNumberArrayField,
  parseVariant,
  serializeExerciseToSqlParams,
  serializeQueueExerciseToSqlParams,
  deserializeProgramExerciseRow,
  SqlExerciseRow,
} from '@/services/db/serialization';

describe('db/serialization', () => {
  describe('serializeVariant', () => {
    it('returns empty string for null', () => {
      expect(serializeVariant(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(serializeVariant(undefined)).toBe('');
    });

    it('serializes a full variant', () => {
      const variant: ExerciseVariant = { angle: 'Incline', grip: 'Wide', extras: ['Pause'] };
      expect(serializeVariant(variant)).toBe(JSON.stringify(variant));
    });

    it('serializes a variant with empty object', () => {
      expect(serializeVariant({})).toBe('{}');
    });
  });

  describe('parseVariant', () => {
    it('returns null for null', () => {
      expect(parseVariant(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(parseVariant(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseVariant('')).toBeNull();
    });

    it('returns null for whitespace', () => {
      expect(parseVariant('   ')).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(parseVariant('not-json')).toBeNull();
    });

    it('parses a valid variant JSON', () => {
      const variant: ExerciseVariant = { angle: 'Incline' };
      const result = parseVariant(JSON.stringify(variant));
      expect(result).toEqual({ angle: 'Incline' });
    });

    it('strips empty string fields', () => {
      const result = parseVariant(JSON.stringify({ angle: '', grip: 'Close' }));
      expect(result).toEqual({ grip: 'Close' });
    });

    it('returns null when all fields are empty', () => {
      expect(parseVariant(JSON.stringify({ angle: '', grip: '' }))).toBeNull();
    });

    it('filters non-string extras', () => {
      const result = parseVariant(JSON.stringify({ extras: [1, 'Pause', true] }));
      expect(result?.extras).toEqual(['Pause']);
    });

    it('returns null for empty extras array', () => {
      expect(parseVariant(JSON.stringify({ extras: [] }))).toBeNull();
    });
  });

  describe('parseStringArrayField', () => {
    it('returns empty array for null', () => {
      expect(parseStringArrayField(null, 'test', {})).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      expect(parseStringArrayField('', 'test', {})).toEqual([]);
    });

    it('parses a valid JSON array', () => {
      expect(parseStringArrayField('["chest","shoulders"]', 'muscles', {})).toEqual(['chest', 'shoulders']);
    });

    it('filters non-string entries', () => {
      expect(parseStringArrayField('["a",1,true,"b"]', 'test', {})).toEqual(['a', 'b']);
    });

    it('returns empty array for non-array JSON', () => {
      expect(parseStringArrayField('{"key":"val"}', 'test', {})).toEqual([]);
    });

    it('returns empty array for invalid JSON', () => {
      expect(parseStringArrayField('not-json', 'test', {})).toEqual([]);
    });
  });

  describe('parseNumberArrayField', () => {
    it('returns empty array for null', () => {
      expect(parseNumberArrayField(null, 'test', {})).toEqual([]);
    });

    it('parses a valid JSON number array', () => {
      expect(parseNumberArrayField('[1,2,3]', 'test', {})).toEqual([1, 2, 3]);
    });

    it('filters non-number entries', () => {
      expect(parseNumberArrayField('[1,"a",2]', 'test', {})).toEqual([1, 2]);
    });

    it('returns empty array for non-array JSON', () => {
      expect(parseNumberArrayField('"hello"', 'test', {})).toEqual([]);
    });
  });

  describe('serializeExerciseToSqlParams', () => {
    const baseExercise = {
      name: 'Bench Press',
      equipment: 'Barbell',
      muscle_groups_worked: ['chest', 'triceps'],
      isCompound: true,
      weight: '80',
      reps: '8',
      sets: '3',
      restTime: '180',
      progression: '2.5',
      hasCustomisedSets: false,
      variant: null as ExerciseVariant | null,
    };

    it('produces correct INSERT SQL for program_exercises', () => {
      const result = serializeExerciseToSqlParams(baseExercise as any, 0, 'day-1');
      expect(result.sql).toContain('INSERT INTO program_exercises');
      expect(result.params[0]).toBe('day-1');
      expect(result.params[1]).toBe('Bench Press');
      expect(result.params[2]).toBe('Barbell');
      expect(result.params[3]).toBe('["chest","triceps"]');
      expect(result.params[4]).toBe(1);
      expect(result.params[5]).toBe(80);
      expect(result.params[6]).toBe(8);
      expect(result.params[7]).toBe(3);
      expect(result.params[8]).toBe(180);
      expect(result.params[9]).toBeCloseTo(2.5);
      expect(result.params[10]).toBe(0);
      expect(result.params[11]).toBe('');
      expect(result.params[12]).toBe(0);
    });

    it('applies default values for missing numeric fields', () => {
      const exercise = { ...baseExercise, weight: '0', reps: '0', sets: '0', restTime: '0' };
      const result = serializeExerciseToSqlParams(exercise as any, 0, 'day-1');
      expect(result.params[5]).toBe(0);
      expect(result.params[6]).toBe(8);
      expect(result.params[7]).toBe(3);
      expect(result.params[8]).toBe(180);
    });

    it('serializes variant JSON', () => {
      const variant: ExerciseVariant = { angle: 'Incline' };
      const exercise = { ...baseExercise, variant };
      const result = serializeExerciseToSqlParams(exercise as any, 0, 'day-1');
      expect(result.params[11]).toBe(JSON.stringify(variant));
    });
  });

  describe('serializeQueueExerciseToSqlParams', () => {
    const baseExercise = {
      name: 'Squat',
      equipment: 'Barbell',
      muscle_groups_worked: ['quads', 'glutes'],
      isCompound: true,
      weight: '100',
      reps: '5',
      sets: '5',
      restTime: '180',
      progression: '2.5',
      hasCustomisedSets: false,
      variant: null as ExerciseVariant | null,
    };

    it('produces correct INSERT SQL for queue_exercises', () => {
      const result = serializeQueueExerciseToSqlParams(baseExercise as any, 0, 'queue-1');
      expect(result.sql).toContain('INSERT INTO queue_exercises');
      expect(result.params[0]).toBe('queue-1');
      expect(result.params[1]).toBe('Squat');
    });

    it('applies default values for zero weight', () => {
      const exercise = { ...baseExercise, weight: '0', reps: '0' };
      const result = serializeQueueExerciseToSqlParams(exercise as any, 0, 'queue-1');
      expect(result.params[5]).toBe(0);
      expect(result.params[6]).toBe(8);
    });
  });

  describe('deserializeProgramExerciseRow', () => {
    it('maps a SQL row to ProgramExercise', () => {
      const row: SqlExerciseRow = {
        id: 1,
        name: 'Bench Press',
        equipment: 'Barbell',
        muscle_groups: '["chest","triceps"]',
        is_compound: 1,
        weight: 80,
        reps: 8,
        sets: 3,
        rest_time: 180,
        progression: 2.5,
        has_customised_sets: 0,
        variant_json: '{"angle":"Flat"}',
        position: 0,
      };

      const result = deserializeProgramExerciseRow(row);
      expect(result.name).toBe('Bench Press');
      expect(result.equipment).toBe('Barbell');
      expect(result.muscle_groups_worked).toEqual(['chest', 'triceps']);
      expect(result.isCompound).toBe(true);
      expect(result.weight).toBe('80');
      expect(result.reps).toBe('8');
      expect(result.sets).toBe('3');
      expect(result.restTime).toBe('180');
      expect(result.progression).toBe('2.5');
      expect(result.hasCustomisedSets).toBe(false);
      expect(result.variant).toEqual({ angle: 'Flat' });
    });

    it('handles null muscle_groups gracefully', () => {
      const row: SqlExerciseRow = {
        id: 1,
        name: 'Squat',
        equipment: '',
        muscle_groups: null as any,
        is_compound: 1,
        weight: 100,
        reps: 5,
        sets: 5,
        rest_time: 180,
        progression: 0,
        has_customised_sets: 0,
        variant_json: null,
        position: 0,
      };

      const result = deserializeProgramExerciseRow(row);
      expect(result.muscle_groups_worked).toEqual([]);
      expect(result.variant).toBeNull();
    });

    it('handles zero numeric values with defaults', () => {
      const row: SqlExerciseRow = {
        id: 1,
        name: 'Press',
        equipment: '',
        muscle_groups: '[]',
        is_compound: 0,
        weight: 0,
        reps: 0,
        sets: 0,
        rest_time: 0,
        progression: 0,
        has_customised_sets: 0,
        variant_json: null,
        position: 0,
      };

      const result = deserializeProgramExerciseRow(row);
      expect(result.weight).toBe('0');
      expect(result.reps).toBe('0');
      expect(result.sets).toBe('0');
      expect(result.restTime).toBe('0');
    });

    it('preserves exerciseInstanceId when present', () => {
      const row: SqlExerciseRow = {
        id: 1,
        name: 'Bench Press',
        equipment: 'Barbell',
        muscle_groups: '[]',
        is_compound: 1,
        weight: 80,
        reps: 8,
        sets: 3,
        rest_time: 180,
        progression: 2.5,
        has_customised_sets: 0,
        variant_json: null,
        position: 0,
        exercise_instance_id: 'q0:e0',
      };

      const result = deserializeProgramExerciseRow(row);
      expect(result.exerciseInstanceId).toBe('q0:e0');
    });
  });
});