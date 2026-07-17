import { initialMigration } from './0001-initial';
import { cleanupOperationsMigration } from './0002-cleanup-operations';
import { managedSourcesMigration } from './0003-managed-sources';
import { outputDimensionsMigration } from './0004-output-dimensions';
import type { Migration } from './types';

export const migrations: readonly Migration[] = [
  initialMigration,
  cleanupOperationsMigration,
  managedSourcesMigration,
  outputDimensionsMigration
];

export type { AppliedMigration, Migration } from './types';
