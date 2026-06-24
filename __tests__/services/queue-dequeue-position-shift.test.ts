jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

interface QueueRow {
  id: string;
  program_id: string;
  program_name: string;
  day_number: number;
  scheduled_date: string | null;
  position: number;
}

/**
 * Build a fake SQLite database whose workout_queue rows are exactly `rows`,
 * with no exercises for any item. Records every runAsync call so assertions can
 * inspect the position-shift UPDATE.
 */
function createFakeDatabase(rows: QueueRow[]) {
  const runCalls: Array<{ sql: string; params?: unknown[] }> = [];

  const database = {
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
      runCalls.push({ sql, params });
      return { lastInsertRowId: 0, changes: 0 };
    }),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM workout_queue ORDER BY position')) {
        return rows;
      }
      if (sql.includes('FROM queue_exercises')) {
        return [];
      }
      return [];
    }),
    getAllSync: jest.fn(),
    getFirstSync: jest.fn(),
  };

  return { database, runCalls };
}

describe('dequeueFirstWorkout position shift', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function loadModuleWith(rows: QueueRow[]) {
    const { database, runCalls } = createFakeDatabase(rows);

    // Mock the connection module so getDatabase returns our fake DB while
    // keeping the real runInTransaction (which just brackets the operation in
    // BEGIN/COMMIT exec calls on the fake DB).
    jest.doMock('@/services/db/connection', () => {
      const actual = jest.requireActual('@/services/db/connection');
      return {
        ...actual,
        getDatabase: jest.fn(async () => database),
      };
    });

    const { dequeueFirstWorkout } = await import('@/services/db/queue');
    return { dequeueFirstWorkout, database, runCalls };
  }

  it('shifts positions using the first item position (non-zero), not a hard-coded 0', async () => {
    const rows: QueueRow[] = [
      {
        id: 'q-a',
        program_id: 'program-1',
        program_name: 'Program A',
        day_number: 1,
        scheduled_date: null,
        position: 2,
      },
      {
        id: 'q-b',
        program_id: 'program-1',
        program_name: 'Program A',
        day_number: 2,
        scheduled_date: null,
        position: 3,
      },
    ];

    const { dequeueFirstWorkout, runCalls } = await loadModuleWith(rows);

    const result = await dequeueFirstWorkout();

    const shiftCall = runCalls.find((call) =>
      call.sql.includes('UPDATE workout_queue SET position = position - 1')
    );

    expect(shiftCall).toBeDefined();
    expect(shiftCall?.sql).toContain('WHERE position > ?');
    // Must shift relative to the actual first item's position (2), NOT 0.
    expect(shiftCall?.params).toEqual([2]);

    // Still deletes the first item's exercises and row by first.id.
    expect(runCalls).toContainEqual({
      sql: 'DELETE FROM queue_exercises WHERE queue_item_id = ?',
      params: ['q-a'],
    });
    expect(runCalls).toContainEqual({
      sql: 'DELETE FROM workout_queue WHERE id = ?',
      params: ['q-a'],
    });

    // Returns the first item.
    expect(result?.id).toBe('q-a');
    expect(result?.position).toBe(2);
  });

  it('shifts with param 0 when the first item is at position 0 (no regression)', async () => {
    const rows: QueueRow[] = [
      {
        id: 'q-0',
        program_id: 'program-1',
        program_name: 'Program A',
        day_number: 1,
        scheduled_date: null,
        position: 0,
      },
      {
        id: 'q-1',
        program_id: 'program-1',
        program_name: 'Program A',
        day_number: 2,
        scheduled_date: null,
        position: 1,
      },
    ];

    const { dequeueFirstWorkout, runCalls } = await loadModuleWith(rows);

    const result = await dequeueFirstWorkout();

    const shiftCall = runCalls.find((call) =>
      call.sql.includes('UPDATE workout_queue SET position = position - 1')
    );

    expect(shiftCall?.sql).toContain('WHERE position > ?');
    expect(shiftCall?.params).toEqual([0]);
    expect(result?.id).toBe('q-0');
  });

  it('returns null and performs no shift when the queue is empty', async () => {
    const { dequeueFirstWorkout, runCalls } = await loadModuleWith([]);

    const result = await dequeueFirstWorkout();

    expect(result).toBeNull();
    expect(
      runCalls.some((call) => call.sql.includes('UPDATE workout_queue SET position'))
    ).toBe(false);
  });
});
