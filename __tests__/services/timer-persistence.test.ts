type MockDatabase = {
  execAsync: jest.Mock;
  getAllAsync: jest.Mock;
  getFirstAsync: jest.Mock;
  runAsync: jest.Mock;
  getAllSync: jest.Mock;
  getFirstSync: jest.Mock;
};

const createMockDatabase = (): MockDatabase => ({
  execAsync: jest.fn(async () => undefined),
  getAllAsync: jest.fn(async () => []),
  getFirstAsync: jest.fn(async () => null),
  runAsync: jest.fn(async () => ({ changes: 1 })),
  getAllSync: jest.fn(() => []),
  getFirstSync: jest.fn(() => null),
});

const setupDatabaseModule = async (mockDb: MockDatabase) => {
  jest.resetModules();

  const openDatabaseAsync = jest.fn(async () => mockDb);
  jest.doMock('expo-sqlite', () => ({
    openDatabaseAsync,
  }));

  const db = await import('@/services/database');
  return { db, openDatabaseAsync };
};

describe('timer persistence hardening', () => {
  afterEach(() => {
    jest.dontMock('expo-sqlite');
  });

  it('uses exercise_instance_id when saving/loading/clearing timers', async () => {
    const mockDb = createMockDatabase();
    const { db } = await setupDatabaseModule(mockDb);

    await db.saveActiveTimer({
      exerciseInstanceId: 'program-1:d1:i0:Bench Press',
      exerciseName: 'Bench Press',
      programId: 'program-1',
      dayNumber: 1,
      endTimestamp: 999999,
      setsCompleted: 2,
      restDuration: 180,
    });

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('exercise_instance_id, exercise_name, program_id, day_number'),
      ['program-1:d1:i0:Bench Press', 'Bench Press', 'program-1', 1, 999999, 2, 180]
    );

    mockDb.getFirstAsync.mockResolvedValueOnce({
      exercise_instance_id: 'program-1:d1:i1:Bench Press',
      exercise_name: 'Bench Press',
      program_id: 'program-1',
      day_number: 1,
      end_timestamp: 888888,
      sets_completed: 1,
      rest_duration: 120,
    });

    const loaded = await db.getActiveTimer({
      exerciseInstanceId: 'program-1:d1:i1:Bench Press',
      exerciseName: 'Bench Press',
      programId: 'program-1',
      dayNumber: 1,
    });

    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('WHERE exercise_instance_id = ? AND program_id = ? AND day_number = ?'),
      ['program-1:d1:i1:Bench Press', 'program-1', 1]
    );

    expect(loaded).toEqual({
      exerciseInstanceId: 'program-1:d1:i1:Bench Press',
      exerciseName: 'Bench Press',
      programId: 'program-1',
      dayNumber: 1,
      endTimestamp: 888888,
      setsCompleted: 1,
      restDuration: 120,
    });

    await db.clearActiveTimer({
      exerciseInstanceId: 'program-1:d1:i1:Bench Press',
      exerciseName: 'Bench Press',
      programId: 'program-1',
      dayNumber: 1,
    });

    expect(mockDb.runAsync).toHaveBeenLastCalledWith(
      expect.stringContaining(
        'DELETE FROM active_rest_timers WHERE exercise_instance_id = ? AND program_id = ? AND day_number = ?'
      ),
      ['program-1:d1:i1:Bench Press', 'program-1', 1]
    );
  });

  it('keeps duplicate exercise-name timers isolated by exercise_instance_id', async () => {
    const mockDb = createMockDatabase();
    const { db } = await setupDatabaseModule(mockDb);

    await db.saveActiveTimer({
      exerciseInstanceId: 'program-1:d1:i0:Lat Pulldown',
      exerciseName: 'Lat Pulldown',
      programId: 'program-1',
      dayNumber: 1,
      endTimestamp: 1000,
      setsCompleted: 1,
      restDuration: 90,
    });

    await db.saveActiveTimer({
      exerciseInstanceId: 'program-1:d1:i1:Lat Pulldown',
      exerciseName: 'Lat Pulldown',
      programId: 'program-1',
      dayNumber: 1,
      endTimestamp: 2000,
      setsCompleted: 3,
      restDuration: 120,
    });

    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT OR REPLACE INTO active_rest_timers'),
      ['program-1:d1:i1:Lat Pulldown', 'Lat Pulldown', 'program-1', 1, 2000, 3, 120]
    );

    await db.updateTimerSetsCompleted(
      {
        exerciseInstanceId: 'program-1:d1:i0:Lat Pulldown',
        exerciseName: 'Lat Pulldown',
        programId: 'program-1',
        dayNumber: 1,
      },
      4
    );

    expect(mockDb.runAsync).toHaveBeenLastCalledWith(
      expect.stringContaining('WHERE exercise_instance_id = ? AND program_id = ? AND day_number = ?'),
      [4, 'program-1:d1:i0:Lat Pulldown', 'program-1', 1]
    );
  });

  it('uses timestamp-scoped clear for restart/clear race protection', async () => {
    const mockDb = createMockDatabase();
    const { db } = await setupDatabaseModule(mockDb);

    const timerContext = {
      exerciseInstanceId: 'program-1:d1:i0:Row',
      exerciseName: 'Row',
      programId: 'program-1',
      dayNumber: 1,
    };

    await db.saveActiveTimer({
      ...timerContext,
      endTimestamp: 1000,
      setsCompleted: 1,
      restDuration: 120,
    });

    await db.saveActiveTimer({
      ...timerContext,
      endTimestamp: 2000,
      setsCompleted: 2,
      restDuration: 120,
    });

    await db.clearActiveTimer(timerContext, 1000);

    expect(mockDb.runAsync).toHaveBeenLastCalledWith(
      expect.stringContaining(
        'DELETE FROM active_rest_timers WHERE exercise_instance_id = ? AND program_id = ? AND day_number = ? AND end_timestamp = ?'
      ),
      ['program-1:d1:i0:Row', 'program-1', 1, 1000]
    );
  });

  it('schema migration drops timer table when exercise_instance_id column is missing', async () => {
    const mockDb = createMockDatabase();

    mockDb.getAllAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('PRAGMA table_info(active_rest_timers)')) {
        return [
          { cid: 0, name: 'exercise_name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 },
          { cid: 1, name: 'program_id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 2 },
          { cid: 2, name: 'day_number', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 3 },
        ];
      }

      return [];
    });

    const { db } = await setupDatabaseModule(mockDb);
    await db.getDatabase();

    expect(mockDb.execAsync).toHaveBeenCalledWith('DROP TABLE IF EXISTS active_rest_timers');
  });
});
