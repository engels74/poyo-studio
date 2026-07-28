import type { Migration } from './types';

export const galleryOrderMigration: Migration = {
  version: 2,
  name: 'gallery chronological order index',
  sql: `
CREATE INDEX idx_jobs_gallery_order
  ON jobs(created_at DESC, id DESC);
`
};
