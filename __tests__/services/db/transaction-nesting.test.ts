import * as SQLite from 'expo-sqlite';
import { runInTransaction } from '@/services/db/connection';

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

/**
 * Build a minimal fake SQLiteDatabase that records every SQL string passed to
 * execAsync, so tests can assert how many BEGIN/COMMIT/ROLLBACK were issued.
 */
function createFakeDatabase() {
  const execSql: string[] = [];
  const database = {
    execAsync: jest.fn(async (sql: string) => {
      execSql.push(sql);
      return undefined;
    }),
  } as unknown as SQLite.SQLiteDatabase;

  return { database, execSql };
}

const count = (execSql: string[], needle: string): number =>
  execSql.filter((sql) => sql.includes(needle)).length;

describe('runInTransaction nesting-safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is nesting-safe: a nested call issues exactly one BEGIN and one COMMIT', async () => {
    const { database, execSql } = createFakeDatabase();
    let innerRan = false;

    const result = await runInTransaction(database, async () => {
      // Nested transaction on the SAME database must not throw and must not
      // issue a second BEGIN.
      const inner = await runInTransaction(database, async () => {
        innerRan = true;
        return 'inner-value';
      });
      return inner;
    });

    expect(result).toBe('inner-value');
    expect(innerRan).toBe(true);
    expect(count(execSql, 'BEGIN IMMEDIATE TRANSACTION')).toBe(1);
    expect(count(execSql, 'COMMIT')).toBe(1);
    expect(count(execSql, 'ROLLBACK')).toBe(0);
  });

  it('rolls back (not commits) and rethrows when a single transaction operation throws', async () => {
    const { database, execSql } = createFakeDatabase();
    const boom = new Error('boom');

    await expect(
      runInTransaction(database, async () => {
        throw boom;
      })
    ).rejects.toBe(boom);

    expect(count(execSql, 'BEGIN IMMEDIATE TRANSACTION')).toBe(1);
    expect(count(execSql, 'ROLLBACK')).toBe(1);
    expect(count(execSql, 'COMMIT')).toBe(0);
  });

  it('rolls back once at the outer level when a nested operation throws', async () => {
    const { database, execSql } = createFakeDatabase();
    const boom = new Error('nested boom');

    await expect(
      runInTransaction(database, async () => {
        await runInTransaction(database, async () => {
          throw boom;
        });
      })
    ).rejects.toBe(boom);

    expect(count(execSql, 'BEGIN IMMEDIATE TRANSACTION')).toBe(1);
    expect(count(execSql, 'ROLLBACK')).toBe(1);
    expect(count(execSql, 'COMMIT')).toBe(0);
  });

  it('runs sequential independent transactions each with their own BEGIN/COMMIT', async () => {
    const { database, execSql } = createFakeDatabase();

    await runInTransaction(database, async () => 'one');
    await runInTransaction(database, async () => 'two');

    expect(count(execSql, 'BEGIN IMMEDIATE TRANSACTION')).toBe(2);
    expect(count(execSql, 'COMMIT')).toBe(2);
    expect(count(execSql, 'ROLLBACK')).toBe(0);
  });
});
