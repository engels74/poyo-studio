import type { Migration } from './types';

export const managedSourcesMigration: Migration = {
  version: 3,
  name: 'durable managed source media',
  sql: `
CREATE TABLE managed_sources (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  media_kind TEXT NOT NULL CHECK (media_kind IN ('image', 'video')),
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  checksum TEXT NOT NULL,
  signature TEXT NOT NULL,
  relative_path TEXT NOT NULL UNIQUE,
  availability TEXT NOT NULL DEFAULT 'available' CHECK (
    availability IN ('available', 'missing', 'deleted')
  ),
  created_at TEXT NOT NULL,
  last_verified_at TEXT,
  missing_at TEXT,
  deleted_at TEXT
);

ALTER TABLE job_inputs
  ADD COLUMN managed_source_id TEXT REFERENCES managed_sources(id) ON DELETE SET NULL;

CREATE INDEX idx_managed_sources_retention
  ON managed_sources(availability, created_at, id);

CREATE INDEX idx_job_inputs_managed_source
  ON job_inputs(managed_source_id, job_id);
`
};
