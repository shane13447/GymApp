jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe('database queue generation race handling', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('does not save a stale queue after the current program is cleared', async () => {
    const progressionGate = createDeferred<unknown[]>();
    const progressionStarted = createDeferred<void>();
    const runSql: string[] = [];
    const runCalls: Array<{ sql: string; params?: unknown[] }> = [];

    const database = {
      execAsync: jest.fn(async () => undefined),
      runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        runSql.push(sql);
        runCalls.push({ sql, params });
        return { lastInsertRowId: 1 };
      }),
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes("SELECT name FROM sqlite_master WHERE type = 'table'")) {
          return null;
        }

        if (sql.includes('SELECT * FROM programs WHERE id = ?')) {
          return {
            id: 'program-1',
            name: 'Program A',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          };
        }

        return null;
      }),
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes('PRAGMA table_info(active_rest_timers)')) {
          return [];
        }

        if (sql.includes('PRAGMA table_info(')) {
          return [];
        }

        if (sql.includes('SELECT * FROM workout_days WHERE program_id = ? ORDER BY day_number')) {
          return [{ id: 1, program_id: 'program-1', day_number: 1 }];
        }

        if (sql.includes('SELECT * FROM program_exercises WHERE workout_day_id = ? ORDER BY position')) {
          return [
            {
              id: 1,
              name: 'Barbell Bench Press',
              equipment: 'Barbell',
              muscle_groups: JSON.stringify(['chest']),
              is_compound: 1,
              weight: 80,
              reps: 8,
              sets: 3,
              rest_time: 180,
              progression: 2.5,
              has_customised_sets: 0,
              variant_json: null,
              position: 0,
            },
          ];
        }

        if (sql.includes('FROM workout_exercises')) {
          progressionStarted.resolve();
          return progressionGate.promise;
        }

        return [];
      }),
      getAllSync: jest.fn(),
      getFirstSync: jest.fn(),
    };

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => database),
    }));

    const { setCurrentProgramId } = await import('@/services/database');

    const generatePromise = setCurrentProgramId('program-1');
    await progressionStarted.promise;

    await setCurrentProgramId(null);
    progressionGate.resolve([]);
    await generatePromise;

    expect(
      runSql.some((sql) => sql.includes('INSERT INTO workout_queue'))
    ).toBe(false);
    expect(
      runSql.filter((sql) => sql.includes('DELETE FROM workout_queue')).length
    ).toBeGreaterThan(0);
    expect(
      runCalls.some((call) =>
        call.sql.includes('UPDATE user_preferences SET current_program_id = ?') &&
        call.params?.[0] === 'program-1'
      )
    ).toBe(false);
  });
});
