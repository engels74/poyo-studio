import type { Migration } from './types';

export const outputDimensionsMigration: Migration = {
  version: 4,
  name: 'persist verified output dimensions',
  sql: `
ALTER TABLE job_outputs
  ADD COLUMN pixel_width INTEGER CHECK (pixel_width IS NULL OR pixel_width > 0);
ALTER TABLE job_outputs
  ADD COLUMN pixel_height INTEGER CHECK (pixel_height IS NULL OR pixel_height > 0);
`
};
