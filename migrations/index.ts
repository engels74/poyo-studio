import { initialMigration } from './0001-initial';
import { galleryOrderMigration } from './0002-gallery-order';
import { attachmentRequestsMigration } from './0003-attachment-requests';
import type { Migration } from './types';

export const migrations: readonly Migration[] = [
  initialMigration,
  galleryOrderMigration,
  attachmentRequestsMigration
];

export type { AppliedMigration, Migration } from './types';
