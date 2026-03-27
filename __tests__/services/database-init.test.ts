describe('database initialization', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('initializes successfully when migration target tables are missing', async () => {
    const execAsync = jest.fn(async (sql: string) => {
      if (sql.includes('ALTER TABLE')) {
        throw new Error('no such table');
      }
    });

    const getAllAsync = jest.fn(async () => []);
    const getFirstAsync = jest.fn(async () => null);

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => ({
        execAsync,
        getAllAsync,
        getFirstAsync,
        runAsync: jest.fn(),
        getAllSync: jest.fn(),
        getFirstSync: jest.fn(),
      })),
    }));

    const { getDatabase } = await import('@/services/database');

    await expect(getDatabase()).resolves.toBeDefined();
    expect(execAsync).not.toHaveBeenCalledWith(expect.stringContaining('ALTER TABLE'));
  });

  it('does not run seed reconciliation during getDatabase initialization', async () => {
    const runAsync = jest.fn(async () => ({ lastInsertRowId: 1, changes: 1 }));

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => ({
        execAsync: jest.fn(async () => {}),
        getAllAsync: jest.fn(async () => []),
        getFirstAsync: jest.fn(async () => null),
        runAsync,
        getAllSync: jest.fn(),
        getFirstSync: jest.fn(),
      })),
    }));

    const { getDatabase } = await import('@/services/database');

    await getDatabase();

    expect(
      runAsync.mock.calls.some((call) => String((call as unknown[])[0]).includes('INSERT OR IGNORE INTO programs'))
    ).toBe(false);
  });

  it('runs seed reconciliation during deferred maintenance', async () => {
    const runAsync = jest.fn(async () => ({ lastInsertRowId: 1, changes: 1 }));

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => ({
        execAsync: jest.fn(async () => {}),
        getAllAsync: jest.fn(async () => []),
        getFirstAsync: jest.fn(async () => null),
        runAsync,
        getAllSync: jest.fn(),
        getFirstSync: jest.fn(),
      })),
    }));

    const { getDatabase, runDeferredDatabaseMaintenance } = await import('@/services/database');

    await getDatabase();
    await runDeferredDatabaseMaintenance();

    expect(
      runAsync.mock.calls.some((call) => String((call as unknown[])[0]).includes('INSERT OR IGNORE INTO programs'))
    ).toBe(true);
  });

  it('initializes seed lifecycle states for both programs as pending when absent', async () => {
    const execAsync = jest.fn(async () => {});
    const getAllAsync = jest.fn(async () => []);
    const getFirstAsync = jest.fn(async () => null);

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => ({
        execAsync,
        getAllAsync,
        getFirstAsync,
        runAsync: jest.fn(),
        getAllSync: jest.fn(),
        getFirstSync: jest.fn(),
      })),
    }));

    const { getSeedLifecycleState } = await import('@/services/database');

    await expect(getSeedLifecycleState('seed-test-program')).resolves.toBe('pending');
    await expect(getSeedLifecycleState('seed-3day-full-body')).resolves.toBe('pending');
  });

  it('seeds both built-in programs on first initialization', async () => {
    const programs: Array<{ id: string; name: string; created_at: string; updated_at: string }> = [];

    const execAsync = jest.fn(async () => {});
    const getFirstAsync = jest.fn(async () => null);
    const getAllAsync = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT id FROM programs WHERE id IN')) {
        const seedIds = (params as string[]) ?? [];
        return programs.filter((program) => seedIds.includes(program.id)).map((program) => ({ id: program.id }));
      }

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

    const runAsync = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT OR IGNORE INTO programs')) {
        const [id, name, createdAt, updatedAt] = (params as [string, string, string, string]) ?? [
          '',
          '',
          '',
          '',
        ];

        if (programs.some((program) => program.id === id)) {
          return { lastInsertRowId: 0, changes: 0 };
        }

        programs.push({ id, name, created_at: createdAt, updated_at: updatedAt });
        return { lastInsertRowId: programs.length, changes: 1 };
      }

      if (sql.includes('INSERT INTO workout_days')) {
        return { lastInsertRowId: 1, changes: 1 };
      }

      if (sql.includes('INSERT INTO program_exercises')) {
        return { lastInsertRowId: 1, changes: 1 };
      }

      return { lastInsertRowId: 1, changes: 1 };
    });

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => ({
        execAsync,
        getAllAsync,
        getFirstAsync,
        runAsync,
        getAllSync: jest.fn(),
        getFirstSync: jest.fn(),
      })),
    }));

    const { getAllPrograms, runDeferredDatabaseMaintenance } = await import('@/services/database');
    await runDeferredDatabaseMaintenance();
    const seededPrograms = await getAllPrograms();

    expect(seededPrograms.find((program) => program.id === 'seed-test-program')?.name).toBe('Test Program');
    expect(seededPrograms.find((program) => program.id === 'seed-3day-full-body')?.name).toBe('3 Day Full body');
  });

  it('does not duplicate seeded programs on relaunch init', async () => {
    const programs: Array<{ id: string; name: string; created_at: string; updated_at: string }> = [];

    const db = {
      execAsync: jest.fn(async () => {}),
      getAllSync: jest.fn(),
      getFirstSync: jest.fn(),
      getFirstAsync: jest.fn(async () => null),
      getAllAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT id FROM programs WHERE id IN')) {
          const seedIds = (params as string[]) ?? [];
          return programs.filter((program) => seedIds.includes(program.id)).map((program) => ({ id: program.id }));
        }

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
      }),
      runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT OR IGNORE INTO programs')) {
          const [id, name, createdAt, updatedAt] = (params as [string, string, string, string]) ?? [
            '',
            '',
            '',
            '',
          ];

          if (programs.some((program) => program.id === id)) {
            return { lastInsertRowId: 0, changes: 0 };
          }

          programs.push({ id, name, created_at: createdAt, updated_at: updatedAt });
          return { lastInsertRowId: programs.length, changes: 1 };
        }

        if (sql.includes('INSERT INTO workout_days')) {
          return { lastInsertRowId: 1, changes: 1 };
        }

        if (sql.includes('INSERT INTO program_exercises')) {
          return { lastInsertRowId: 1, changes: 1 };
        }

        return { lastInsertRowId: 1, changes: 1 };
      }),
    };

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => db),
    }));

    const firstLoad = await import('@/services/database');
    await firstLoad.runDeferredDatabaseMaintenance();
    await firstLoad.getAllPrograms();

    jest.resetModules();

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => db),
    }));

    const secondLoad = await import('@/services/database');
    await secondLoad.runDeferredDatabaseMaintenance();
    await secondLoad.getAllPrograms();

    expect(programs.filter((program) => program.id === 'seed-test-program')).toHaveLength(1);
    expect(programs.filter((program) => program.id === 'seed-3day-full-body')).toHaveLength(1);
  });

  it('repairs an existing seeded shell program that has zero workout days', async () => {
    const programs: Array<{ id: string; name: string; created_at: string; updated_at: string }> = [
      {
        id: 'seed-test-program',
        name: 'Test Program',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ];
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
        variant_json: string;
        position: number;
      }>
    >();
    let dayIdSequence = 1;

    const seedState: {
      seed_test_program_state: 'pending' | 'seeded' | 'deleted_by_user';
      seed_3day_full_body_state: 'pending' | 'seeded' | 'deleted_by_user';
    } = {
      seed_test_program_state: 'seeded',
      seed_3day_full_body_state: 'pending',
    };

    const db = {
      execAsync: jest.fn(async () => {}),
      getAllSync: jest.fn(),
      getFirstSync: jest.fn(),
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT seed_test_program_state FROM user_preferences')) {
          return { seed_test_program_state: seedState.seed_test_program_state };
        }

        if (sql.includes('SELECT seed_3day_full_body_state FROM user_preferences')) {
          return { seed_3day_full_body_state: seedState.seed_3day_full_body_state };
        }

        return null;
      }),
      getAllAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT id FROM programs WHERE id IN')) {
          const seedIds = (params as string[]) ?? [];
          return programs.filter((program) => seedIds.includes(program.id)).map((program) => ({ id: program.id }));
        }

        if (sql.includes('SELECT * FROM programs ORDER BY created_at DESC')) {
          return programs;
        }

        if (sql.includes('SELECT * FROM workout_days WHERE program_id = ?')) {
          const programId = (params?.[0] as string) ?? '';
          return workoutDaysByProgram.get(programId) ?? [];
        }

        if (sql.includes('SELECT * FROM program_exercises WHERE workout_day_id = ?')) {
          const workoutDayId = (params?.[0] as number) ?? 0;
          return exercisesByWorkoutDay.get(workoutDayId) ?? [];
        }

        return [];
      }),
      runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('UPDATE user_preferences SET seed_test_program_state = ?')) {
          seedState.seed_test_program_state = (params?.[0] as 'pending' | 'seeded' | 'deleted_by_user') ?? 'pending';
          return { lastInsertRowId: 1, changes: 1 };
        }

        if (sql.includes('UPDATE user_preferences SET seed_3day_full_body_state = ?')) {
          seedState.seed_3day_full_body_state = (params?.[0] as 'pending' | 'seeded' | 'deleted_by_user') ?? 'pending';
          return { lastInsertRowId: 1, changes: 1 };
        }

        if (sql.includes('DELETE FROM programs WHERE id = ?')) {
          const programId = (params?.[0] as string) ?? '';
          const index = programs.findIndex((program) => program.id === programId);
          if (index >= 0) {
            programs.splice(index, 1);
          }
          workoutDaysByProgram.delete(programId);
          return { lastInsertRowId: 0, changes: index >= 0 ? 1 : 0 };
        }

        if (sql.includes('INSERT OR IGNORE INTO programs')) {
          const [id, name, createdAt, updatedAt] = (params as [string, string, string, string]) ?? ['', '', '', ''];
          if (programs.some((program) => program.id === id)) {
            return { lastInsertRowId: 0, changes: 0 };
          }

          programs.push({ id, name, created_at: createdAt, updated_at: updatedAt });
          return { lastInsertRowId: programs.length, changes: 1 };
        }

        if (sql.includes('INSERT INTO workout_days')) {
          const programId = (params?.[0] as string) ?? '';
          const dayNumber = (params?.[1] as number) ?? 1;
          const nextDayId = dayIdSequence++;
          const existing = workoutDaysByProgram.get(programId) ?? [];
          existing.push({ id: nextDayId, day_number: dayNumber });
          workoutDaysByProgram.set(programId, existing);
          return { lastInsertRowId: nextDayId, changes: 1 };
        }

        if (sql.includes('INSERT INTO program_exercises')) {
          const workoutDayId = (params?.[0] as number) ?? 0;
          const existing = exercisesByWorkoutDay.get(workoutDayId) ?? [];
          existing.push({
            id: existing.length + 1,
            name: (params?.[1] as string) ?? '',
            equipment: (params?.[2] as string) ?? '',
            muscle_groups: (params?.[3] as string) ?? '[]',
            is_compound: (params?.[4] as number) ?? 0,
            weight: (params?.[5] as number) ?? 0,
            reps: (params?.[6] as number) ?? 0,
            sets: (params?.[7] as number) ?? 0,
            rest_time: (params?.[8] as number) ?? 180,
            progression: (params?.[9] as number) ?? 0,
            has_customised_sets: (params?.[10] as number) ?? 0,
            variant_json: (params?.[11] as string) ?? '',
            position: (params?.[12] as number) ?? 0,
          });
          exercisesByWorkoutDay.set(workoutDayId, existing);
          return { lastInsertRowId: existing.length, changes: 1 };
        }

        return { lastInsertRowId: 1, changes: 1 };
      }),
    };

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => db),
    }));

    const { getAllPrograms, runDeferredDatabaseMaintenance } = await import('@/services/database');
    await runDeferredDatabaseMaintenance();
    const seededPrograms = await getAllPrograms();

    const repairedProgram = seededPrograms.find((program) => program.id === 'seed-test-program');
    expect(repairedProgram).toBeDefined();
    expect(repairedProgram?.workoutDays.length).toBeGreaterThan(0);
    expect(repairedProgram?.workoutDays.some((day) => day.exercises.length > 0)).toBe(true);
  });

  it('retries only missing pending seed on later startup after partial first-run failure', async () => {
    const programs: Array<{ id: string; name: string; created_at: string; updated_at: string }> = [];
    const seedState: {
      seed_test_program_state: 'pending' | 'seeded' | 'deleted_by_user';
      seed_3day_full_body_state: 'pending' | 'seeded' | 'deleted_by_user';
    } = {
      seed_test_program_state: 'pending',
      seed_3day_full_body_state: 'pending',
    };
    let failSeed3DayInsertOnce = true;

    const db = {
      execAsync: jest.fn(async () => {}),
      getAllSync: jest.fn(),
      getFirstSync: jest.fn(),
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT seed_test_program_state FROM user_preferences')) {
          return { seed_test_program_state: seedState.seed_test_program_state };
        }

        if (sql.includes('SELECT seed_3day_full_body_state FROM user_preferences')) {
          return { seed_3day_full_body_state: seedState.seed_3day_full_body_state };
        }

        if (sql.includes('SELECT * FROM user_preferences WHERE id = ?')) {
          return {
            id: 'default',
            current_program_id: null,
            weight_unit: 'kg',
            theme: 'system',
            queue_size: 6,
            rest_timer_enabled: 1,
            haptic_feedback_enabled: 1,
          };
        }

        return null;
      }),
      getAllAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT id FROM programs WHERE id IN')) {
          const seedIds = (params as string[]) ?? [];
          return programs.filter((program) => seedIds.includes(program.id)).map((program) => ({ id: program.id }));
        }

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
      }),
      runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('UPDATE user_preferences SET seed_test_program_state = ?')) {
          seedState.seed_test_program_state = (params?.[0] as 'pending' | 'seeded' | 'deleted_by_user') ?? 'pending';
          return { lastInsertRowId: 1, changes: 1 };
        }

        if (sql.includes('UPDATE user_preferences SET seed_3day_full_body_state = ?')) {
          seedState.seed_3day_full_body_state = (params?.[0] as 'pending' | 'seeded' | 'deleted_by_user') ?? 'pending';
          return { lastInsertRowId: 1, changes: 1 };
        }

        if (sql.includes('INSERT OR IGNORE INTO programs')) {
          const [id, name, createdAt, updatedAt] = (params as [string, string, string, string]) ?? [
            '',
            '',
            '',
            '',
          ];

          if (id === 'seed-3day-full-body' && failSeed3DayInsertOnce) {
            failSeed3DayInsertOnce = false;
            throw new Error('Injected first-run insert failure for seed-3day-full-body');
          }

          if (programs.some((program) => program.id === id)) {
            return { lastInsertRowId: 0, changes: 0 };
          }

          programs.push({ id, name, created_at: createdAt, updated_at: updatedAt });
          return { lastInsertRowId: programs.length, changes: 1 };
        }

        if (sql.includes('INSERT INTO workout_days')) {
          return { lastInsertRowId: 1, changes: 1 };
        }

        if (sql.includes('INSERT INTO program_exercises')) {
          return { lastInsertRowId: 1, changes: 1 };
        }

        return { lastInsertRowId: 1, changes: 1 };
      }),
    };

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => db),
    }));

    const firstLoad = await import('@/services/database');
    await firstLoad.runDeferredDatabaseMaintenance();
    await firstLoad.getAllPrograms();

    expect(programs.some((program) => program.id === 'seed-test-program')).toBe(true);
    expect(programs.some((program) => program.id === 'seed-3day-full-body')).toBe(false);
    expect(seedState.seed_test_program_state).toBe('seeded');
    expect(seedState.seed_3day_full_body_state).toBe('pending');

    jest.resetModules();

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => db),
    }));

    const secondLoad = await import('@/services/database');
    await secondLoad.runDeferredDatabaseMaintenance();
    await secondLoad.getAllPrograms();

    expect(programs.filter((program) => program.id === 'seed-test-program')).toHaveLength(1);
    expect(programs.filter((program) => program.id === 'seed-3day-full-body')).toHaveLength(1);
    expect(seedState.seed_test_program_state).toBe('seeded');
    expect(seedState.seed_3day_full_body_state).toBe('seeded');
  });

  it('does not recreate a seed marked deleted_by_user on later startup', async () => {
    const programs: Array<{ id: string; name: string; created_at: string; updated_at: string }> = [];
    const seedState: {
      seed_test_program_state: 'pending' | 'seeded' | 'deleted_by_user';
      seed_3day_full_body_state: 'pending' | 'seeded' | 'deleted_by_user';
    } = {
      seed_test_program_state: 'pending',
      seed_3day_full_body_state: 'pending',
    };

    const db = {
      execAsync: jest.fn(async () => {}),
      getAllSync: jest.fn(),
      getFirstSync: jest.fn(),
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT seed_test_program_state FROM user_preferences')) {
          return { seed_test_program_state: seedState.seed_test_program_state };
        }

        if (sql.includes('SELECT seed_3day_full_body_state FROM user_preferences')) {
          return { seed_3day_full_body_state: seedState.seed_3day_full_body_state };
        }

        if (sql.includes('SELECT * FROM user_preferences WHERE id = ?')) {
          return {
            id: 'default',
            current_program_id: null,
            weight_unit: 'kg',
            theme: 'system',
            queue_size: 6,
            rest_timer_enabled: 1,
            haptic_feedback_enabled: 1,
          };
        }

        return null;
      }),
      getAllAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT id FROM programs WHERE id IN')) {
          const seedIds = (params as string[]) ?? [];
          return programs.filter((program) => seedIds.includes(program.id)).map((program) => ({ id: program.id }));
        }

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
      }),
      runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('UPDATE user_preferences SET seed_test_program_state = ?')) {
          seedState.seed_test_program_state = (params?.[0] as 'pending' | 'seeded' | 'deleted_by_user') ?? 'pending';
          return { lastInsertRowId: 1, changes: 1 };
        }

        if (sql.includes('UPDATE user_preferences SET seed_3day_full_body_state = ?')) {
          seedState.seed_3day_full_body_state = (params?.[0] as 'pending' | 'seeded' | 'deleted_by_user') ?? 'pending';
          return { lastInsertRowId: 1, changes: 1 };
        }

        if (sql.includes('INSERT OR IGNORE INTO programs')) {
          const [id, name, createdAt, updatedAt] = (params as [string, string, string, string]) ?? [
            '',
            '',
            '',
            '',
          ];

          if (programs.some((program) => program.id === id)) {
            return { lastInsertRowId: 0, changes: 0 };
          }

          programs.push({ id, name, created_at: createdAt, updated_at: updatedAt });
          return { lastInsertRowId: programs.length, changes: 1 };
        }

        if (sql.includes('DELETE FROM programs WHERE id = ?')) {
          const programId = (params?.[0] as string) ?? '';
          const index = programs.findIndex((program) => program.id === programId);
          if (index >= 0) {
            programs.splice(index, 1);
          }
          return { lastInsertRowId: 0, changes: index >= 0 ? 1 : 0 };
        }

        if (sql.includes('INSERT INTO workout_days')) {
          return { lastInsertRowId: 1, changes: 1 };
        }

        if (sql.includes('INSERT INTO program_exercises')) {
          return { lastInsertRowId: 1, changes: 1 };
        }

        return { lastInsertRowId: 1, changes: 1 };
      }),
    };

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => db),
    }));

    const firstLoad = await import('@/services/database');
    await firstLoad.runDeferredDatabaseMaintenance();
    await firstLoad.getAllPrograms();
    await firstLoad.deleteProgram('seed-test-program');

    expect(programs.some((program) => program.id === 'seed-test-program')).toBe(false);
    await expect(firstLoad.getSeedLifecycleState('seed-test-program')).resolves.toBe('deleted_by_user');

    jest.resetModules();

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => db),
    }));

    const secondLoad = await import('@/services/database');
    await secondLoad.runDeferredDatabaseMaintenance();
    await secondLoad.getAllPrograms();

    expect(programs.some((program) => program.id === 'seed-test-program')).toBe(false);
    expect(programs.filter((program) => program.id === 'seed-3day-full-body')).toHaveLength(1);
  });
});

