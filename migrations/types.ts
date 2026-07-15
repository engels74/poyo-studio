import type { Database } from 'bun:sqlite';

export interface Migration {
  version: number;
  name: string;
  sql: string;
  afterSql?: (database: Database) => void;
}

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  applied_at: string;
}
