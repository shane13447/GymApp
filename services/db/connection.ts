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

export const logStartupStage = (stage: string, detail?: Record<string, unknown>): void => {
  if (detail) {
    console.log(`[startup][${stage}]`, detail);
    return;
  }
  console.log(`[startup][${stage}]`);
};

export const getDb = (): SQLite.SQLiteDatabase | null => db;
export const setDb = (database: SQLite.SQLiteDatabase | null): void => {
  db = database;
};
export const getInitPromise = (): Promise<SQLite.SQLiteDatabase> | null => initPromise;
export const setInitPromise = (promise: Promise<SQLite.SQLiteDatabase> | null): void => {
  initPromise = promise;
};
export const getMaintenancePromise = (): Promise<void> | null => maintenancePromise;
export const setMaintenancePromise = (promise: Promise<void> | null): void => {
  maintenancePromise = promise;
};
export const isMaintenanceCompleted = (): boolean => maintenanceCompleted;
export const setMaintenanceCompleted = (value: boolean): void => {
  maintenanceCompleted = value;
};

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

export const runInTransaction = async <T>(
  database: SQLite.SQLiteDatabase,
  operation: () => Promise<T>
): Promise<T> => {
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
};