import { initialMigration } from './0001-initial';
import { cleanupOperationsMigration } from './0002-cleanup-operations';
import { managedSourcesMigration } from './0003-managed-sources';
import type { Migration } from './types';

export const migrations: readonly Migration[] = [
  initialMigration,
  cleanupOperationsMigration,
  managedSourcesMigration
];

export type { AppliedMigration, Migration } from './types';
