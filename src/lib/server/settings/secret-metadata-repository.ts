import { DatabaseRepository } from '../platform/repository';

export type ApiKeySource = 'environment' | 'local' | 'none';
export type ApiKeyStatus = 'configured' | 'missing' | 'unavailable' | 'error';
export type SecretStoreKind = 'environment' | 'file';

export interface SecretMetadata {
  activeSource: ApiKeySource;
  status: ApiKeyStatus;
  storeKind: SecretStoreKind;
  lastConnectivityAt: string | null;
  lastConnectivityStatus: string | null;
  updatedAt: string;
}

interface SecretMetadataRow {
  active_source: ApiKeySource;
  status: ApiKeyStatus;
  store_kind: string;
  last_connectivity_at: string | null;
  last_connectivity_status: string | null;
  updated_at: string;
}

function parseStoreKind(value: string): SecretStoreKind {
  if (value === 'environment' || value === 'file') return value;
  throw new Error('Credential metadata is invalid.');
}

export class SecretMetadataRepository extends DatabaseRepository {
  get(): SecretMetadata | null {
    const row = this.database
      .query<SecretMetadataRow, []>(
        `SELECT active_source, status, store_kind, last_connectivity_at,
                last_connectivity_status, updated_at
         FROM secret_metadata WHERE id = 1`
      )
      .get();
    if (!row) return null;

    return {
      activeSource: row.active_source,
      status: row.status,
      storeKind: parseStoreKind(row.store_kind),
      lastConnectivityAt: row.last_connectivity_at,
      lastConnectivityStatus: row.last_connectivity_status,
      updatedAt: row.updated_at
    };
  }

  save(metadata: Omit<SecretMetadata, 'updatedAt'>, now = new Date()): SecretMetadata {
    const updatedAt = now.toISOString();
    this.database
      .query(
        `INSERT INTO secret_metadata(
           id, active_source, status, store_kind, last_connectivity_at,
           last_connectivity_status, updated_at
         ) VALUES (1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           active_source = excluded.active_source,
           status = excluded.status,
           store_kind = excluded.store_kind,
           last_connectivity_at = excluded.last_connectivity_at,
           last_connectivity_status = excluded.last_connectivity_status,
           updated_at = excluded.updated_at`
      )
      .run(
        metadata.activeSource,
        metadata.status,
        metadata.storeKind,
        metadata.lastConnectivityAt,
        metadata.lastConnectivityStatus,
        updatedAt
      );

    return { ...metadata, updatedAt };
  }
}
