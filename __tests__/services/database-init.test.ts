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

    const { getAllPrograms } = await import('@/services/database');
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
    await firstLoad.getAllPrograms();

    jest.resetModules();

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => db),
    }));

    const secondLoad = await import('@/services/database');
    await secondLoad.getAllPrograms();

    expect(programs.filter((program) => program.id === 'seed-test-program')).toHaveLength(1);
    expect(programs.filter((program) => program.id === 'seed-3day-full-body')).toHaveLength(1);
  });

  it('does not mutate current program, queue, workouts, or profile during seed phase', async () => {
    const programs: Array<{ id: string; name: string; created_at: string; updated_at: string }> = [];
    const writeStatements: string[] = [];

    const runAsync = jest.fn(async (sql: string, params?: unknown[]) => {
      writeStatements.push(sql);

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
        execAsync: jest.fn(async () => {}),
        getAllAsync: jest.fn(async (sql: string, params?: unknown[]) => {
          if (sql.includes('SELECT id FROM programs WHERE id IN')) {
            const seedIds = (params as string[]) ?? [];
            return programs
              .filter((program) => seedIds.includes(program.id))
              .map((program) => ({ id: program.id }));
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
        getFirstAsync: jest.fn(async () => null),
        runAsync,
        getAllSync: jest.fn(),
        getFirstSync: jest.fn(),
      })),
    }));

    const { getAllPrograms } = await import('@/services/database');
    await getAllPrograms();

    expect(writeStatements.some((sql) => sql.includes('UPDATE user_preferences SET current_program_id'))).toBe(false);
    expect(writeStatements.some((sql) => sql.includes('INSERT INTO workout_queue'))).toBe(false);
    expect(writeStatements.some((sql) => sql.includes('DELETE FROM workout_queue'))).toBe(false);
    expect(writeStatements.some((sql) => sql.includes('INSERT INTO workouts'))).toBe(false);
    expect(writeStatements.some((sql) => sql.includes('UPDATE user_profile'))).toBe(false);
  });
});
