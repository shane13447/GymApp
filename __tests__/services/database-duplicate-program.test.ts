import type { Program } from '@/types';

describe('duplicateProgram', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('duplicates full program structure with new identity and name', async () => {
    const programs: Array<{ id: string; name: string; created_at: string; updated_at: string }> = [];
    const workoutDaysByProgram = new Map<string, Array<{ id: number; day_number: number }>>();
    const exercisesByWorkoutDay = new Map<
      number,
      Array<{
        id: number;
        name: string;
        equipment: string;
        muscle_groups: string;
        is_compound: number;
        weight: number;
        reps: number;
        sets: number;
        rest_time: number;
        progression: number;
        has_customised_sets: number;
        variant_json: string | null;
        position: number;
      }>
    >();
    let nextWorkoutDayId = 1;

    const runAsync = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO programs')) {
        const [id, name, createdAt, updatedAt] = (params as [string, string, string, string]) ?? ['', '', '', ''];
        if (programs.some((program) => program.id === id)) {
          throw new Error('UNIQUE constraint failed: programs.id');
        }
        programs.push({ id, name, created_at: createdAt, updated_at: updatedAt });
        return { lastInsertRowId: 0, changes: 1 };
      }

      if (sql.includes('INSERT INTO workout_days')) {
        const [programId, dayNumber] = (params as [string, number]) ?? ['', 1];
        const dayId = nextWorkoutDayId++;
        const days = workoutDaysByProgram.get(programId) ?? [];
        days.push({ id: dayId, day_number: dayNumber });
        workoutDaysByProgram.set(programId, days);
        exercisesByWorkoutDay.set(dayId, []);
        return { lastInsertRowId: dayId, changes: 1 };
      }

      if (sql.includes('INSERT INTO program_exercises')) {
        const payload = (params as unknown[]) ?? [];
        const dayId = Number(payload[0]);
        const rows = exercisesByWorkoutDay.get(dayId) ?? [];
        rows.push({
          id: rows.length + 1,
          name: String(payload[1] ?? ''),
          equipment: String(payload[2] ?? ''),
          muscle_groups: String(payload[3] ?? '[]'),
          is_compound: Number(payload[4] ?? 0),
          weight: Number(payload[5] ?? 0),
          reps: Number(payload[6] ?? 0),
          sets: Number(payload[7] ?? 0),
          rest_time: Number(payload[8] ?? 0),
          progression: Number(payload[9] ?? 0),
          has_customised_sets: Number(payload[10] ?? 0),
          variant_json: (payload[11] as string | null) ?? null,
          position: Number(payload[12] ?? 0),
        });
        exercisesByWorkoutDay.set(dayId, rows);
        return { lastInsertRowId: rows.length, changes: 1 };
      }

      return { lastInsertRowId: 0, changes: 0 };
    });

    const getAllAsync = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT * FROM programs ORDER BY created_at DESC')) {
        return [...programs].sort((a, b) => b.created_at.localeCompare(a.created_at));
      }

      if (sql.includes('SELECT * FROM workout_days WHERE program_id = ?')) {
        const [programId] = (params as [string]) ?? [''];
        return (workoutDaysByProgram.get(programId) ?? []).map((day) => ({
          id: day.id,
          program_id: programId,
          day_number: day.day_number,
        }));
      }

      if (sql.includes('SELECT * FROM program_exercises WHERE workout_day_id = ?')) {
        const [dayId] = (params as [number]) ?? [0];
        return exercisesByWorkoutDay.get(dayId) ?? [];
      }

      return [];
    });

    const getFirstAsync = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT * FROM programs WHERE id = ?')) {
        const [programId] = (params as [string]) ?? [''];
        return programs.find((program) => program.id === programId) ?? null;
      }
      return null;
    });

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => ({
        execAsync: jest.fn(),
        runAsync,
        getAllAsync,
        getFirstAsync,
        getAllSync: jest.fn(),
        getFirstSync: jest.fn(),
      })),
    }));

    const { createProgram, duplicateProgram, getAllPrograms } = await import('@/services/database');

    const sourceProgram: Omit<Program, 'createdAt' | 'updatedAt'> = {
      id: 'program-source',
      name: 'PPL',
      workoutDays: [
        {
          dayNumber: 1,
          exercises: [
            {
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
            },
          ],
        },
      ],
    };

    await createProgram(sourceProgram);
    const duplicate = await duplicateProgram(sourceProgram.id, 'PPL Copy');

    expect(duplicate.id).not.toBe(sourceProgram.id);
    expect(duplicate.name).toBe('PPL Copy');
    expect(duplicate.workoutDays).toHaveLength(sourceProgram.workoutDays.length);
    expect(duplicate.workoutDays[0].dayNumber).toBe(sourceProgram.workoutDays[0].dayNumber);
    expect(duplicate.workoutDays[0].exercises).toHaveLength(sourceProgram.workoutDays[0].exercises.length);
    expect(duplicate.workoutDays[0].exercises[0]).toMatchObject(sourceProgram.workoutDays[0].exercises[0]);

    const allPrograms = await getAllPrograms();
    expect(allPrograms.some((program) => program.name === 'PPL')).toBe(true);
    expect(allPrograms.some((program) => program.name === 'PPL Copy')).toBe(true);
  });

  it('rejects duplicate name collisions', async () => {
    const programs: Array<{ id: string; name: string; created_at: string; updated_at: string }> = [];

    const runAsync = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO programs')) {
        const [id, name, createdAt, updatedAt] = (params as [string, string, string, string]) ?? ['', '', '', ''];
        programs.push({ id, name, created_at: createdAt, updated_at: updatedAt });
        return { lastInsertRowId: 0, changes: 1 };
      }

      if (sql.includes('INSERT INTO workout_days')) {
        return { lastInsertRowId: 1, changes: 1 };
      }

      if (sql.includes('INSERT INTO program_exercises')) {
        return { lastInsertRowId: 1, changes: 1 };
      }

      return { lastInsertRowId: 0, changes: 0 };
    });

    const getAllAsync = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM programs ORDER BY created_at DESC')) {
        return programs;
      }
      if (sql.includes('SELECT * FROM workout_days WHERE program_id = ?')) {
        return [];
      }
      if (sql.includes('SELECT * FROM program_exercises WHERE workout_day_id = ?')) {
        return [];
      }
      return [];
    });

    const getFirstAsync = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT * FROM programs WHERE id = ?')) {
        const [programId] = (params as [string]) ?? [''];
        return programs.find((program) => program.id === programId) ?? null;
      }
      return null;
    });

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => ({
        execAsync: jest.fn(),
        runAsync,
        getAllAsync,
        getFirstAsync,
        getAllSync: jest.fn(),
        getFirstSync: jest.fn(),
      })),
    }));

    const { createProgram, duplicateProgram } = await import('@/services/database');

    const sourceProgram: Omit<Program, 'createdAt' | 'updatedAt'> = {
      id: 'program-collision-source',
      name: 'Upper Lower',
      workoutDays: [
        {
          dayNumber: 1,
          exercises: [
            {
              name: 'Lat Pulldowns',
              equipment: 'Cable',
              muscle_groups_worked: ['lats'],
              isCompound: true,
              weight: '60',
              reps: '10',
              sets: '3',
              restTime: '120',
              progression: '2.5',
              hasCustomisedSets: false,
            },
          ],
        },
      ],
    };

    await createProgram(sourceProgram);
    await createProgram({
      ...sourceProgram,
      id: 'program-existing-name',
      name: 'Upper Lower Copy',
    });

    await expect(duplicateProgram(sourceProgram.id, 'Upper Lower Copy')).rejects.toThrow('Program name already exists');
  });
});
