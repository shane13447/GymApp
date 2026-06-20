/**
 * Database connection singleton and initialization
 *
 * Encapsulates the SQLite connection lifecycle, initialization promise,
 * and startup logging. Other db/ modules import getDatabase from here.
 */

import { DATABASE_NAME } from '@/constants';
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let maintenancePromise: Promise<void> | null = null;
let maintenanceCompleted = false;

let _getDatabase: (() => Promise<SQLite.SQLiteDatabase>) | null = null;

/**
 * Register the database getter so sibling modules (e.g. queue.ts)
 * can obtain the database without importing database.ts (avoids circular deps).
 */
export const registerDatabaseGetter = (fn: () => Promise<SQLite.SQLiteDatabase>): void => {
  _getDatabase = fn;
};

/**
 * Retrieve the database connection.
 * Must only be called after registerDatabaseGetter has been invoked (done at database.ts init).
 */
export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!_getDatabase) {
    throw new Error('Database getter not registered. Call registerDatabaseGetter first.');
  }
  return _getDatabase();
};

/**
 * Emit a namespaced startup log line for a given lifecycle stage.
 *
 * @param {string} stage - Short identifier for the startup stage being logged.
 * @param {Record<string, unknown>} [detail] - Optional structured detail to log alongside the stage.
 * @returns {void}
 */
export const logStartupStage = (stage: string, detail?: Record<string, unknown>): void => {
  if (detail) {
    console.log(`[startup][${stage}]`, detail);
    return;
  }
  console.log(`[startup][${stage}]`);
};

/**
 * Get the current cached SQLite database instance, if one is open.
 *
 * @returns {SQLite.SQLiteDatabase | null} The open database, or null if not yet opened.
 */
export const getDb = (): SQLite.SQLiteDatabase | null => db;
/**
 * Set the cached SQLite database instance.
 *
 * @param {SQLite.SQLiteDatabase | null} database - The database to cache, or null to clear it.
 * @returns {void}
 */
export const setDb = (database: SQLite.SQLiteDatabase | null): void => {
  db = database;
};
/**
 * Get the in-flight database initialization promise, if initialization is running.
 *
 * @returns {Promise<SQLite.SQLiteDatabase> | null} The init promise, or null when idle.
 */
export const getInitPromise = (): Promise<SQLite.SQLiteDatabase> | null => initPromise;
/**
 * Set the in-flight database initialization promise.
 *
 * @param {Promise<SQLite.SQLiteDatabase> | null} promise - The init promise, or null to clear it.
 * @returns {void}
 */
export const setInitPromise = (promise: Promise<SQLite.SQLiteDatabase> | null): void => {
  initPromise = promise;
};
/**
 * Get the in-flight startup maintenance promise, if maintenance is running.
 *
 * @returns {Promise<void> | null} The maintenance promise, or null when none is running.
 */
export const getMaintenancePromise = (): Promise<void> | null => maintenancePromise;
/**
 * Set the in-flight startup maintenance promise.
 *
 * @param {Promise<void> | null} promise - The maintenance promise, or null to clear it.
 * @returns {void}
 */
export const setMaintenancePromise = (promise: Promise<void> | null): void => {
  maintenancePromise = promise;
};
/**
 * Report whether startup maintenance has completed.
 *
 * @returns {boolean} True once maintenance has finished.
 */
export const isMaintenanceCompleted = (): boolean => maintenanceCompleted;
/**
 * Set the maintenance-completed flag.
 *
 * @param {boolean} value - The new completion state.
 * @returns {void}
 */
export const setMaintenanceCompleted = (value: boolean): void => {
  maintenanceCompleted = value;
};

/**
 * Core open-or-reuse logic for the SQLite connection. Returns the cached
 * database if present, joins an in-flight initialization if one is running,
 * or otherwise opens the database, enables foreign keys, and runs the
 * provided schema initializer exactly once.
 *
 * @param {(database: SQLite.SQLiteDatabase) => Promise<void>} initializeDatabase - Schema initializer invoked on first open.
 * @returns {Promise<SQLite.SQLiteDatabase>} The ready-to-use database connection.
 */
export const getDatabaseCore = async (
  initializeDatabase: (database: SQLite.SQLiteDatabase) => Promise<void>
): Promise<SQLite.SQLiteDatabase> => {
  if (db) {
    return db;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      logStartupStage('db_open_start');
      const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await database.execAsync('PRAGMA foreign_keys = ON');
      logStartupStage('db_open_end');

      logStartupStage('db_schema_start');
      await initializeDatabase(database);
      logStartupStage('db_schema_end');

      db = database;
      return database;
    } catch (error) {
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
};

/**
 * Reset all module-level connection state. Only intended for test teardown.
 */
export const resetConnectionState = (): void => {
  db = null;
  initPromise = null;
  maintenancePromise = null;
  maintenanceCompleted = false;
  _getDatabase = null;
};

/**
 * Tracks which databases currently have an active transaction started by
 * {@link runInTransaction}. Used to make nested transaction calls participate
 * in the outermost transaction instead of issuing a second BEGIN (which SQLite
 * rejects with "cannot start a transaction within a transaction").
 */
const activeTransactions = new WeakSet<SQLite.SQLiteDatabase>();

/**
 * Run an async operation inside an immediate SQLite transaction, committing on
 * success and rolling back on error. Rollback failures are logged but the
 * original error is rethrown.
 *
 * Nesting-safe: if a transaction is already active for the given database
 * (tracked via a module-level WeakSet), a nested call joins the outer
 * transaction and simply runs its operation WITHOUT issuing its own
 * BEGIN/COMMIT/ROLLBACK. Only the outermost call drives transaction control,
 * so a single BEGIN/COMMIT wraps the whole operation tree and an error from any
 * nested operation rolls the entire transaction back exactly once at the outer
 * level. This is behavior-preserving for non-nested callers.
 *
 * @template T
 * @param {SQLite.SQLiteDatabase} database - The database to run the transaction on.
 * @param {() => Promise<T>} operation - The work to perform within the transaction.
 * @returns {Promise<T>} The value returned by the operation when it commits successfully.
 */
export const runInTransaction = async <T>(
  database: SQLite.SQLiteDatabase,
  operation: () => Promise<T>
): Promise<T> => {
  if (activeTransactions.has(database)) {
    // A transaction is already in progress for this database: join the outer
    // transaction and run the operation without issuing nested BEGIN/COMMIT.
    return await operation();
  }

  activeTransactions.add(database);
  try {
    await database.execAsync('BEGIN IMMEDIATE TRANSACTION');

    try {
      const result = await operation();
      await database.execAsync('COMMIT');
      return result;
    } catch (error) {
      try {
        await database.execAsync('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
      throw error;
    }
  } finally {
    // Always clear the flag, even if BEGIN itself threw, so the flag never leaks.
    activeTransactions.delete(database);
  }
};