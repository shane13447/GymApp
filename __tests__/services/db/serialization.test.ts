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
      expect(result.params[12]).toBeNull();
      expect(result.params[13]).toBeNull();
      expect(result.params[14]).toBeNull();
      expect(result.params[15]).toBe(0);
      expect(result.params[16]).toBe(0);
    });

    it('serializes double-progression fields', () => {
      const result = serializeExerciseToSqlParams({
        ...baseExercise,
        repRangeMin: 8,
        repRangeMax: 12,
        progressionThreshold: 3,
        timesRepsHitInARow: 2,
      } as any, 0, 'day-1');

      expect(result.params[12]).toBe(8);
      expect(result.params[13]).toBe(12);
      expect(result.params[14]).toBe(3);
      expect(result.params[15]).toBe(2);
    });

    it('preserves zero numeric values instead of falling back to defaults', () => {
      const exercise = { ...baseExercise, weight: '0', reps: '0', sets: '0', restTime: '0' };
      const result = serializeExerciseToSqlParams(exercise as any, 0, 'day-1');
      expect(result.params[5]).toBe(0);
      expect(result.params[6]).toBe(0);
      expect(result.params[7]).toBe(0);
      expect(result.params[8]).toBe(0);
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

    it('serializes double-progression fields for queue exercises', () => {
      const result = serializeQueueExerciseToSqlParams({
        ...baseExercise,
        repRangeMin: 6,
        repRangeMax: 10,
        progressionThreshold: 2,
        timesRepsHitInARow: 1,
      } as any, 0, 'queue-1');

      expect(result.params[12]).toBe(6);
      expect(result.params[13]).toBe(10);
      expect(result.params[14]).toBe(2);
      expect(result.params[15]).toBe(1);
    });

    it('preserves zero numeric values instead of falling back to defaults', () => {
      const exercise = { ...baseExercise, weight: '0', reps: '0' };
      const result = serializeQueueExerciseToSqlParams(exercise as any, 0, 'queue-1');
      expect(result.params[5]).toBe(0);
      expect(result.params[6]).toBe(0);
    });
  });

  describe('zero-value regression tests (Phase 06)', () => {
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

    it('preserves weight "0" as param 0, not as default', () => {
      const exercise = { ...baseExercise, weight: '0', reps: '5', sets: '3', restTime: '180', progression: '0' };
      const result = serializeExerciseToSqlParams(exercise as any, 0, 'day-1');
      // parseFloat("0") || 0 would give 0 (coincidence), but safeParseFloat gives 0 intentionally.
      expect(result.params[5]).toBe(0);
    });

    it('preserves reps "0" as param 0, not as default 8 (falsy-guard bug)', () => {
      const exercise = { ...baseExercise, weight: '80', reps: '0', sets: '3', restTime: '180', progression: '0' };
      const result = serializeExerciseToSqlParams(exercise as any, 0, 'day-1');
      // OLD BEHAVIOR: parseInt("0", 10) || 8 → 8 (BUG)
      // NEW BEHAVIOR: safeParseInt("0", 8) → 0 (CORRECT)
      expect(result.params[6]).toBe(0);
    });

    it('preserves sets "0" as param 0, not as default 3 (falsy-guard bug)', () => {
      const exercise = { ...baseExercise, weight: '80', reps: '5', sets: '0', restTime: '180', progression: '0' };
      const result = serializeExerciseToSqlParams(exercise as any, 0, 'day-1');
      // OLD BEHAVIOR: parseInt("0", 10) || 3 → 3 (BUG)
      // NEW BEHAVIOR: safeParseInt("0", 3) → 0 (CORRECT)
      expect(result.params[7]).toBe(0);
    });

    it('preserves restTime "0" as param 0, not as default 180', () => {
      const exercise = { ...baseExercise, weight: '80', reps: '5', sets: '3', restTime: '0', progression: '0' };
      const result = serializeExerciseToSqlParams(exercise as any, 0, 'day-1');
      expect(result.params[8]).toBe(0);
    });

    it('preserves progression "0" as param 0, not as default 0 (explicit check)', () => {
      const exercise = { ...baseExercise, weight: '80', reps: '5', sets: '3', restTime: '180', progression: '0' };
      const result = serializeExerciseToSqlParams(exercise as any, 0, 'day-1');
      expect(result.params[9]).toBe(0);
    });

    it('queue exercise serialization also preserves zero reps and sets', () => {
      const exercise = { ...baseExercise, weight: '100', reps: '0', sets: '0', restTime: '0', progression: '0' };
      const result = serializeQueueExerciseToSqlParams(exercise as any, 0, 'queue-1');
      expect(result.params[6]).toBe(0); // reps
      expect(result.params[7]).toBe(0); // sets
      expect(result.params[8]).toBe(0); // restTime
    });

    it('still provides defaults for empty/NaN strings', () => {
      const exercise = { ...baseExercise, weight: '', reps: 'abc', sets: '', restTime: '', progression: '' };
      const result = serializeExerciseToSqlParams(exercise as any, 0, 'day-1');
      expect(result.params[5]).toBe(0);  // weight default
      expect(result.params[6]).toBe(8);  // reps default
      expect(result.params[7]).toBe(3);  // sets default
      expect(result.params[8]).toBe(180); // restTime default
      expect(result.params[9]).toBeCloseTo(0); // progression default
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
        rep_range_min: 8,
        rep_range_max: 12,
        progression_threshold: 3,
        times_reps_hit_in_a_row: 2,
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
      expect(result.repRangeMin).toBe(8);
      expect(result.repRangeMax).toBe(12);
      expect(result.progressionThreshold).toBe(3);
      expect(result.timesRepsHitInARow).toBe(2);
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
        rep_range_min: null,
        rep_range_max: null,
        progression_threshold: null,
        times_reps_hit_in_a_row: 0,
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
        rep_range_min: null,
        rep_range_max: null,
        progression_threshold: null,
        times_reps_hit_in_a_row: 0,
        position: 0,
      };

      const result = deserializeProgramExerciseRow(row);
      expect(result.weight).toBe('0');
      expect(result.reps).toBe('0');
      expect(result.sets).toBe('0');
      expect(result.restTime).toBe('0');
      expect(result.progression).toBe('');
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
        rep_range_min: null,
        rep_range_max: null,
        progression_threshold: null,
        times_reps_hit_in_a_row: 0,
        position: 0,
        exercise_instance_id: 'q0:e0',
      };

      const result = deserializeProgramExerciseRow(row);
      expect(result.exerciseInstanceId).toBe('q0:e0');
    });
  });
});
