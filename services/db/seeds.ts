import exercisesData from '@/data/exerciseSelection.json';
import { safeParseFloat, safeParseInt } from '@/lib/safe-convert';
import { serializeVariant } from '@/services/db/serialization';
import { runInTransaction } from '@/services/db/connection';
import type { Program, ProgramExercise } from '@/types';
import * as SQLite from 'expo-sqlite';

type SeedFixtureExercise = {
  name: string;
  variant?: Record<string, string | string[]>;
  reps: number[];
  weight: number[];
};

type SeedFixtureDay = {
  dayNumber: number;
  exercises: SeedFixtureExercise[];
};

type SeedFixture = SeedFixtureDay[];

type SeedCatalogEntry = {
  equipment?: string;
  muscle_groups_worked?: string[];
  isCompound?: boolean;
};

type SeedStateColumn = 'seed_test_program_state' | 'seed_3day_full_body_state';

export type SeedLifecycleState = 'pending' | 'seeded' | 'deleted_by_user';

// Keep fixture imports on lowercase .json extensions.
// Metro's resolver extension list is lowercase-only (json), and .JSON can fail during Android bundling.
const testProgramFixtureRaw = require('../../data/TestProgram.json') as unknown;
const testProgram2FixtureRaw = require('../../data/TestProgram2.json') as unknown;

/**
 * Normalises CommonJS/ESM JSON fixture modules into the canonical day-array shape.
 * Returns an empty fixture when the imported payload does not contain a usable array.
 */
const normaliseSeedFixtureModule = (fixtureModule: unknown): SeedFixture => {
  const normalised =
    fixtureModule && typeof fixtureModule === 'object' && 'default' in fixtureModule
      ? (fixtureModule as { default: unknown }).default
      : fixtureModule;

  return Array.isArray(normalised) ? (normalised as SeedFixture) : [];
};

const STATIC_SEED_FIXTURES: Record<'TestProgram.json' | 'TestProgram2.json', SeedFixture> = {
  'TestProgram.json': normaliseSeedFixtureModule(testProgramFixtureRaw),
  'TestProgram2.json': normaliseSeedFixtureModule(testProgram2FixtureRaw),
};

const SEED_PROGRAMS = [
  {
    id: 'seed-test-program',
    name: 'Test Program',
    fixtureName: 'TestProgram.json' as const,
  },
  {
    id: 'seed-3day-full-body',
    name: '3 Day Full body',
    fixtureName: 'TestProgram2.json' as const,
  },
] as const;

const SEED_STATE_KEY_BY_ID: Record<string, SeedStateColumn> = {
  'seed-test-program': 'seed_test_program_state',
  'seed-3day-full-body': 'seed_3day_full_body_state',
};

/**
 * Loads one of the bundled seed fixtures by its file name.
 * Returns an empty fixture if the lookup table contains a non-array value.
 */
const loadSeedFixture = (fixtureFileName: 'TestProgram.json' | 'TestProgram2.json'): SeedFixture => {
  const fixture = STATIC_SEED_FIXTURES[fixtureFileName];
  return Array.isArray(fixture) ? fixture : [];
};

/**
 * Resolves the persisted seed-state column for a seed program id.
 * Returns null for non-seed program ids so callers can no-op safely.
 */
export const getSeedStateColumn = (seedId: string): SeedStateColumn | null => {
  return SEED_STATE_KEY_BY_ID[seedId] ?? null;
};

/**
 * Builds a lowercase exercise-name index from the catalog fixture data.
 * The index supplies equipment, muscle groups, and compound metadata during seed mapping.
 */
const buildSeedCatalogIndex = (): Record<string, SeedCatalogEntry> => {
  return (exercisesData as Array<SeedCatalogEntry & { name?: string }>).reduce<Record<string, SeedCatalogEntry>>(
    (acc, entry) => {
      if (typeof entry.name === 'string' && entry.name.trim()) {
        acc[entry.name.toLowerCase()] = {
          equipment: entry.equipment,
          muscle_groups_worked: Array.isArray(entry.muscle_groups_worked)
            ? entry.muscle_groups_worked
            : [],
          isCompound: Boolean(entry.isCompound),
        };
      }
      return acc;
    },
    {}
  );
};

/**
 * Persists a fully mapped seed program directly through an injected SQLite database.
 * Returns false when the program row already exists and the insert was ignored.
 */
const createProgramWithDatabase = async (
  database: SQLite.SQLiteDatabase,
  program: Omit<Program, 'createdAt' | 'updatedAt'>
): Promise<boolean> => {
  const now = new Date().toISOString();

  return runInTransaction(database, async () => {
    const result = await database.runAsync(
      'INSERT OR IGNORE INTO programs (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [program.id, program.name, now, now]
    );

    const insertChanges = typeof result?.changes === 'number' ? result.changes : 1;
    if (insertChanges === 0) {
      return false;
    }

    for (const day of program.workoutDays) {
      const dayResult = await database.runAsync(
        'INSERT INTO workout_days (program_id, day_number) VALUES (?, ?)',
        [program.id, day.dayNumber]
      );

      const dayId = dayResult?.lastInsertRowId ?? null;

      for (let i = 0; i < day.exercises.length; i++) {
        const exercise = day.exercises[i];
        await database.runAsync(
          `INSERT INTO program_exercises
           (workout_day_id, name, equipment, muscle_groups, is_compound, weight, reps, sets, rest_time, progression, has_customised_sets, variant_json, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dayId,
            exercise.name ?? '',
            exercise.equipment ?? '',
            JSON.stringify(exercise.muscle_groups_worked ?? []),
            exercise.isCompound ? 1 : 0,
            safeParseFloat(exercise.weight, 0),
            safeParseInt(exercise.reps, 8),
            safeParseInt(exercise.sets, 3),
            safeParseInt(exercise.restTime, 180),
            safeParseFloat(exercise.progression, 0),
            exercise.hasCustomisedSets ? 1 : 0,
            serializeVariant(exercise.variant),
            i,
          ]
        );
      }
    }

    return true;
  });
};

/**
 * Persists the lifecycle state for a seed program using an already-open database.
 * Unknown program ids are ignored so non-seed deletions do not throw.
 */
export const setSeedLifecycleStateWithDatabase = async (
  database: SQLite.SQLiteDatabase,
  seedId: string,
  state: SeedLifecycleState
): Promise<void> => {
  const column = getSeedStateColumn(seedId);
  if (!column) {
    return;
  }

  await database.runAsync(
    `UPDATE user_preferences SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [state, 'default']
  );
};

/**
 * Reads the lifecycle state for a seed program from an already-open database.
 * Returns 'pending' when the seed id is unknown or the stored value is invalid.
 */
export const getSeedLifecycleStateWithDatabase = async (
  database: SQLite.SQLiteDatabase,
  seedId: string
): Promise<SeedLifecycleState> => {
  const column = getSeedStateColumn(seedId);
  if (!column) {
    return 'pending';
  }

  const row = await database.getFirstAsync<Record<string, string | null>>(
    `SELECT ${column} FROM user_preferences WHERE id = ?`,
    ['default']
  );

  const value = row?.[column];
  if (value === 'seeded' || value === 'deleted_by_user') {
    return value;
  }

  return 'pending';
};

/**
 * Checks whether a seed program still has the minimum persisted structure in SQLite.
 * The structure is considered valid only when the program has days and at least one exercise row.
 */
const hasSeedProgramStructure = async (
  database: SQLite.SQLiteDatabase,
  seedId: string
): Promise<boolean> => {
  const workoutDays = await database.getAllAsync<{ id: number }>(
    'SELECT * FROM workout_days WHERE program_id = ?',
    [seedId]
  );

  if (workoutDays.length === 0) {
    return false;
  }

  for (const workoutDay of workoutDays) {
    const exercises = await database.getAllAsync<{ id: number }>(
      'SELECT * FROM program_exercises WHERE workout_day_id = ?',
      [workoutDay.id]
    );

    if (exercises.length > 0) {
      return true;
    }
  }

  return false;
};

/**
 * Validates a raw seed fixture before it is mapped into the program domain.
 * Returns a failure reason that can be logged without throwing.
 */
export const validateSeedFixture = (fixture: unknown): { isValid: boolean; reason?: string } => {
  if (!Array.isArray(fixture)) {
    return { isValid: false, reason: 'Fixture must be an array of days.' };
  }

  if (fixture.length === 0) {
    return { isValid: false, reason: 'Fixture must contain at least one workout day.' };
  }

  for (let dayIndex = 0; dayIndex < fixture.length; dayIndex++) {
    const day = fixture[dayIndex] as SeedFixtureDay;

    if (!Number.isInteger(day?.dayNumber) || day.dayNumber < 1) {
      return { isValid: false, reason: `Invalid dayNumber at index ${dayIndex}.` };
    }

    if (!Array.isArray(day.exercises) || day.exercises.length === 0) {
      return { isValid: false, reason: `Invalid exercises array at day index ${dayIndex}.` };
    }

    for (let exerciseIndex = 0; exerciseIndex < day.exercises.length; exerciseIndex++) {
      const exercise = day.exercises[exerciseIndex];

      if (typeof exercise?.name !== 'string' || !exercise.name.trim()) {
        return {
          isValid: false,
          reason: `Invalid exercise name at day ${dayIndex}, exercise ${exerciseIndex}.`,
        };
      }

      if (!Array.isArray(exercise.reps) || !Array.isArray(exercise.weight)) {
        return {
          isValid: false,
          reason: `Missing reps/weight arrays at day ${dayIndex}, exercise ${exerciseIndex}.`,
        };
      }

      if (exercise.reps.length === 0 || exercise.weight.length === 0) {
        return {
          isValid: false,
          reason: `Empty reps/weight arrays at day ${dayIndex}, exercise ${exerciseIndex}.`,
        };
      }

      if (exercise.reps.length !== exercise.weight.length) {
        return {
          isValid: false,
          reason: `Mismatched reps/weight lengths at day ${dayIndex}, exercise ${exerciseIndex}.`,
        };
      }

      if (exercise.reps.some((value) => !Number.isFinite(value))) {
        return {
          isValid: false,
          reason: `Invalid reps values at day ${dayIndex}, exercise ${exerciseIndex}.`,
        };
      }

      if (exercise.weight.some((value) => !Number.isFinite(value))) {
        return {
          isValid: false,
          reason: `Invalid weight values at day ${dayIndex}, exercise ${exerciseIndex}.`,
        };
      }
    }
  }

  return { isValid: true };
};

/**
 * Maps a validated seed fixture into the canonical Program shape used by persistence.
 * Catalog metadata is merged by lowercase exercise name to enrich equipment and muscle groups.
 */
export const mapSeedFixtureToProgram = (
  programId: string,
  programName: string,
  fixture: SeedFixture,
  catalogIndex: Record<string, SeedCatalogEntry>
): Omit<Program, 'createdAt' | 'updatedAt'> => ({
  id: programId,
  name: programName,
  workoutDays: fixture.map((day) => ({
    dayNumber: day.dayNumber,
    exercises: day.exercises.map((exercise) => {
      const catalogEntry = catalogIndex[exercise.name.toLowerCase()];

      return {
        name: exercise.name,
        equipment: catalogEntry?.equipment ?? '',
        muscle_groups_worked: catalogEntry?.muscle_groups_worked ?? [],
        isCompound: catalogEntry?.isCompound ?? false,
        variant: exercise.variant ?? null,
        weight: String(exercise.weight[0]),
        reps: String(exercise.reps[0]),
        sets: String(exercise.reps.length),
        restTime: '180',
        progression: '0',
        hasCustomisedSets: true,
      } as ProgramExercise;
    }),
  })),
});

/**
 * Seeds bundled starter programs when they are missing or structurally corrupted.
 * Deleted-by-user seeds remain suppressed so we do not silently resurrect removed content.
 */
export const seedTestProgramsIfMissing = async (database: SQLite.SQLiteDatabase): Promise<void> => {
  const catalogIndex = buildSeedCatalogIndex();
  const seedIds = SEED_PROGRAMS.map((seedProgram) => seedProgram.id);

  const existingRows = await database.getAllAsync<{ id: string }>(
    `SELECT id FROM programs WHERE id IN (${seedIds.map(() => '?').join(', ')})`,
    seedIds
  );
  const existingProgramIds = new Set(existingRows.map((row) => row.id));

  for (const seedProgram of SEED_PROGRAMS) {
    const lifecycleState = await getSeedLifecycleStateWithDatabase(database, seedProgram.id);

    if (lifecycleState === 'deleted_by_user') {
      continue;
    }

    if (existingProgramIds.has(seedProgram.id)) {
      const hasStructure = await hasSeedProgramStructure(database, seedProgram.id);
      if (!hasStructure) {
        await database.runAsync('DELETE FROM programs WHERE id = ?', [seedProgram.id]);
        existingProgramIds.delete(seedProgram.id);
        if (lifecycleState === 'seeded') {
          await setSeedLifecycleStateWithDatabase(database, seedProgram.id, 'pending');
        }
      } else {
        if (lifecycleState !== 'seeded') {
          await setSeedLifecycleStateWithDatabase(database, seedProgram.id, 'seeded');
        }
        continue;
      }
    }

    const stateAfterIntegrityCheck = await getSeedLifecycleStateWithDatabase(database, seedProgram.id);
    if (stateAfterIntegrityCheck !== 'pending') {
      continue;
    }

    const fixture = loadSeedFixture(seedProgram.fixtureName);
    const validation = validateSeedFixture(fixture);
    if (!validation.isValid) {
      console.warn('[seed-programs]', {
        seed_id: seedProgram.id,
        fixture: seedProgram.fixtureName,
        reason: 'validation_failed',
        detail: validation.reason,
      });
      continue;
    }

    try {
      const mappedProgram = mapSeedFixtureToProgram(
        seedProgram.id,
        seedProgram.name,
        fixture,
        catalogIndex
      );

      const inserted = await createProgramWithDatabase(database, mappedProgram);
      if (inserted) {
        existingProgramIds.add(seedProgram.id);
      }

      await setSeedLifecycleStateWithDatabase(database, seedProgram.id, 'seeded');
    } catch (error) {
      console.warn('[seed-programs]', {
        seed_id: seedProgram.id,
        fixture: seedProgram.fixtureName,
        reason: 'insert_failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
