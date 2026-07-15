import type { Database } from 'bun:sqlite';
import { inTransaction } from './database';

export abstract class DatabaseRepository {
  constructor(protected readonly database: Database) {}

  protected transaction<T>(operation: () => T): T {
    return inTransaction(this.database, operation);
  }
}
