import { Database } from 'bun:sqlite';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DATABASE_SCHEMA_VERSION } from './version';
import {
  migrations as defaultMigrations,
  type AppliedMigration,
  type Migration
} from '../../../../migrations';

const migrationTableSql = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
`;

export interface OpenDatabaseOptions {
  migrations?: readonly Migration[];
  now?: () => Date;
}

export interface MigrationResult {
  currentVersion: number;
  appliedVersions: number[];
}

export function migrationChecksum(migration: Pick<Migration, 'name' | 'sql'>): string {
  return new Bun.CryptoHasher('sha256')
    .update(`${migration.name}\n${migration.sql.trim()}\n`)
    .digest('hex');
}

function assertOrderedMigrations(migrations: readonly Migration[]): void {
  let previous = 0;
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version <= previous) {
      throw new Error('Migrations must have unique, strictly increasing positive versions.');
    }
    previous = migration.version;
  }
}

export function migrateDatabase(
  database: Database,
  migrations: readonly Migration[] = defaultMigrations,
  now: () => Date = () => new Date()
): MigrationResult {
  assertOrderedMigrations(migrations);
  database.exec(migrationTableSql);

  const applied = database
    .query<AppliedMigration, []>(
      'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version'
    )
    .all();
  const byVersion = new Map(applied.map((migration) => [migration.version, migration]));
  const knownVersions = new Set(migrations.map((migration) => migration.version));

  for (const recorded of applied) {
    const expected = migrations.find((migration) => migration.version === recorded.version);
    if (!expected) {
      throw new Error(`Database contains unknown migration version ${recorded.version}.`);
    }
    if (recorded.name !== expected.name || recorded.checksum !== migrationChecksum(expected)) {
      throw new Error(`Migration ${recorded.version} no longer matches its recorded checksum.`);
    }
  }

  const appliedVersions: number[] = [];
  const apply = database.transaction((migration: Migration) => {
    database.exec(migration.sql);
    migration.afterSql?.(database);
    database
      .query(
        'INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)'
      )
      .run(migration.version, migration.name, migrationChecksum(migration), now().toISOString());
  });

  for (const migration of migrations) {
    if (byVersion.has(migration.version)) continue;
    apply(migration);
    appliedVersions.push(migration.version);
  }

  const currentVersion = database
    .query<{ version: number }, []>(
      'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations'
    )
    .get()?.version;

  if (currentVersion === undefined || !knownVersions.has(currentVersion)) {
    throw new Error('Database schema version could not be verified.');
  }
  if (migrations === defaultMigrations && currentVersion !== DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `Database schema ${currentVersion} does not match application schema ${DATABASE_SCHEMA_VERSION}.`
    );
  }

  return { currentVersion, appliedVersions };
}

export async function openDatabase(
  path: string,
  options: OpenDatabaseOptions = {}
): Promise<Database> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const database = new Database(path, { create: true, strict: true });

  try {
    database.exec('PRAGMA foreign_keys = ON;');
    database.exec('PRAGMA busy_timeout = 5000;');
    database.exec('PRAGMA journal_mode = WAL;');
    database.exec('PRAGMA synchronous = NORMAL;');
    migrateDatabase(database, options.migrations, options.now);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function inTransaction<T>(database: Database, operation: () => T): T {
  return database.transaction(operation)();
}

export function databaseHealth(database: Database): {
  quickCheck: 'ok' | 'error';
  foreignKeys: boolean;
  schemaVersion: number;
} {
  const quickCheck = database.query<{ quick_check: string }, []>('PRAGMA quick_check').get();
  const foreignKeys = database.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get();
  const schema = database
    .query<{ version: number }, []>(
      'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations'
    )
    .get();

  return {
    quickCheck: quickCheck?.quick_check === 'ok' ? 'ok' : 'error',
    foreignKeys: foreignKeys?.foreign_keys === 1,
    schemaVersion: schema?.version ?? 0
  };
}
