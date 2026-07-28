import { initialMigration } from './0001-initial';
import { galleryOrderMigration } from './0002-gallery-order';
import type { Migration } from './types';

export const migrations: readonly Migration[] = [initialMigration, galleryOrderMigration];

export type { AppliedMigration, Migration } from './types';
