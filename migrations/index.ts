import type { Migration } from './types';
import { initialMigration } from './0001-initial';

export const migrations: readonly Migration[] = [initialMigration];

export type { AppliedMigration, Migration } from './types';
