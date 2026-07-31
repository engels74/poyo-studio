import type { Migration } from './types';

export const attachmentRequestsMigration: Migration = {
  version: 3,
  name: 'attachment download requests',
  sql: `
CREATE TABLE attachment_requests (
  id TEXT PRIMARY KEY,
  request_token TEXT NOT NULL UNIQUE,
  job_output_id TEXT NOT NULL REFERENCES job_outputs(id) ON DELETE CASCADE,
  requested_at TEXT NOT NULL
);
CREATE INDEX idx_attachment_requests_ledger
  ON attachment_requests(requested_at DESC, id DESC);
`
};
