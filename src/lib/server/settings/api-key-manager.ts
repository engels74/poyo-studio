import { timingSafeEqual } from 'node:crypto';
import type { MaintenanceGate } from '../platform/maintenance-gate';
import type {
  ApiKeySource,
  ApiKeyStatus,
  SecretMetadata,
  SecretMetadataRepository,
  SecretStoreKind
} from './secret-metadata-repository';
import { type SecretStore, SecretStoreCorruptError } from './secret-store';

export interface ApiKeyStatusDto {
  source: ApiKeySource;
  status: ApiKeyStatus;
  storeKind: SecretStoreKind;
  onboardingAvailable: boolean;
  environmentManaged: boolean;
  localMutationAvailable: boolean;
  updatedAt: string | null;
}

export interface ResolvedApiKey {
  key: string | null;
  status: ApiKeyStatusDto;
}

export interface ApiKeyManagerOptions {
  environment: Record<string, string | undefined>;
  metadataRepository: SecretMetadataRepository;
  secretStore: SecretStore;
  mutationGate?: Pick<MaintenanceGate, 'status' | 'withWriterPermit'>;
  now?: () => Date;
}

export class EnvironmentKeyActiveError extends Error {
  constructor() {
    super('The environment-provided Poyo API key is authoritative and cannot be overridden.');
    this.name = 'EnvironmentKeyActiveError';
  }
}

export class CredentialBackendError extends Error {
  readonly code = 'verification_failed' as const;

  constructor(message: string) {
    super(message);
    this.name = 'CredentialBackendError';
  }
}

type StatusMetadata = Omit<SecretMetadata, 'updatedAt'> & { updatedAt: string | null };

function environmentKey(environment: Record<string, string | undefined>): string | null {
  const value = environment.POYO_API_KEY?.trim();
  return value || null;
}

function secretsEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function validateSecret(secret: string): string {
  const value = secret.trim();
  if (!value || Buffer.byteLength(value) > 4096) {
    throw new Error('API key is empty or too large.');
  }
  return value;
}

export class ApiKeyManager {
  private readonly now: () => Date;
  private queue = Promise.resolve();
  private connectivityBinding: {
    source: ApiKeySource;
    key: string | null;
    checkedAt: string;
    status: 'ok' | 'failed';
  } | null = null;

  constructor(private readonly options: ApiKeyManagerOptions) {
    this.now = options.now ?? (() => new Date());
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private mutationAdmissionOpen(): boolean {
    return !this.options.mutationGate || this.options.mutationGate.status().admission === 'open';
  }

  private dto(metadata: StatusMetadata): ApiKeyStatusDto {
    return {
      source: metadata.activeSource,
      status: metadata.status,
      storeKind: metadata.storeKind,
      onboardingAvailable:
        metadata.activeSource !== 'environment' &&
        metadata.status !== 'unavailable' &&
        metadata.status !== 'error' &&
        this.mutationAdmissionOpen(),
      environmentManaged: metadata.activeSource === 'environment',
      localMutationAvailable:
        metadata.activeSource !== 'environment' && this.mutationAdmissionOpen(),
      updatedAt: metadata.updatedAt
    };
  }

  private observedMetadata(
    source: ApiKeySource,
    status: ApiKeyStatus,
    storeKind: SecretStoreKind
  ): StatusMetadata {
    const previous = this.options.metadataRepository.get();
    return {
      activeSource: source,
      status,
      storeKind,
      lastConnectivityAt: previous?.lastConnectivityAt ?? null,
      lastConnectivityStatus: previous?.lastConnectivityStatus ?? null,
      updatedAt: previous?.updatedAt ?? null
    };
  }

  private persistStatus(
    source: ApiKeySource,
    status: ApiKeyStatus,
    storeKind: SecretStoreKind
  ): SecretMetadata {
    const previous = this.options.metadataRepository.get();
    return this.options.metadataRepository.save(
      {
        activeSource: source,
        status,
        storeKind,
        lastConnectivityAt: previous?.lastConnectivityAt ?? null,
        lastConnectivityStatus: previous?.lastConnectivityStatus ?? null
      },
      this.now()
    );
  }

  private storeFailureStatus(error: unknown): ApiKeyStatus {
    return error instanceof SecretStoreCorruptError ? 'error' : 'unavailable';
  }

  private async statusUnlocked(): Promise<ApiKeyStatusDto> {
    if (environmentKey(this.options.environment)) {
      return this.dto(this.observedMetadata('environment', 'configured', 'environment'));
    }
    try {
      const key = await this.options.secretStore.get();
      return this.dto(
        this.observedMetadata(key ? 'local' : 'none', key ? 'configured' : 'missing', 'file')
      );
    } catch (error) {
      return this.dto(this.observedMetadata('none', this.storeFailureStatus(error), 'file'));
    }
  }

  private async resolveUnlocked(): Promise<ResolvedApiKey> {
    const fromEnvironment = environmentKey(this.options.environment);
    if (fromEnvironment) {
      const metadata = this.persistStatus('environment', 'configured', 'environment');
      return { key: fromEnvironment, status: this.dto(metadata) };
    }
    try {
      const key = await this.options.secretStore.get();
      const metadata = this.persistStatus(
        key ? 'local' : 'none',
        key ? 'configured' : 'missing',
        'file'
      );
      return { key, status: this.dto(metadata) };
    } catch (error) {
      const metadata = this.persistStatus('none', this.storeFailureStatus(error), 'file');
      return { key: null, status: this.dto(metadata) };
    }
  }

  private async verifyStored(expected: string): Promise<void> {
    const actual = await this.options.secretStore.get();
    if (!actual || !secretsEqual(actual, expected)) {
      throw new CredentialBackendError('The local credential could not be verified.');
    }
  }

  private recordConnectivityUnlocked(status: 'ok' | 'failed', resolved: ResolvedApiKey): void {
    const previous = this.options.metadataRepository.get();
    if (!previous) return;
    const checkedAt = this.now().toISOString();
    this.options.metadataRepository.save(
      {
        activeSource: previous.activeSource,
        status: previous.status,
        storeKind: previous.storeKind,
        lastConnectivityAt: checkedAt,
        lastConnectivityStatus: status
      },
      this.now()
    );
    this.connectivityBinding = {
      source: resolved.status.source,
      key: resolved.key,
      checkedAt,
      status
    };
  }

  private invalidateConnectivityUnlocked(): void {
    this.connectivityBinding = null;
    const previous = this.options.metadataRepository.get();
    if (!previous) return;
    this.options.metadataRepository.save(
      {
        activeSource: previous.activeSource,
        status: previous.status,
        storeKind: previous.storeKind,
        lastConnectivityAt: null,
        lastConnectivityStatus: null
      },
      this.now()
    );
  }

  async resolve(): Promise<ResolvedApiKey> {
    const resolve = () => this.serialized(() => this.resolveUnlocked());
    return this.options.mutationGate
      ? this.options.mutationGate.withWriterPermit('credential.status-persistence', resolve)
      : resolve();
  }

  async status(): Promise<ApiKeyStatusDto> {
    return this.serialized(() => this.statusUnlocked());
  }

  async verifyConnectivity<T>(probe: (resolved: ResolvedApiKey) => Promise<T>): Promise<T> {
    const verify = () =>
      this.serialized(async () => {
        const resolved = await this.resolveUnlocked();
        try {
          const result = await probe(resolved);
          this.recordConnectivityUnlocked('ok', resolved);
          return result;
        } catch (error) {
          this.recordConnectivityUnlocked('failed', resolved);
          throw error;
        }
      });
    return this.options.mutationGate
      ? this.options.mutationGate.withWriterPermit('credential.connectivity', verify)
      : verify();
  }

  connectivityStatus(): { checkedAt: string | null; status: string | null } {
    return {
      checkedAt: this.connectivityBinding?.checkedAt ?? null,
      status: this.connectivityBinding?.status ?? null
    };
  }

  async connectivityVerified(): Promise<boolean> {
    return this.serialized(async () => {
      const binding = this.connectivityBinding;
      if (binding?.status !== 'ok') return false;
      const resolved = await this.resolveUnlocked();
      const keyMatches =
        binding.key === null
          ? resolved.key === null
          : resolved.key !== null && secretsEqual(binding.key, resolved.key);
      return binding.source === resolved.status.source && keyMatches;
    });
  }

  async setLocal(secret: string): Promise<ApiKeyStatusDto> {
    return this.serialized(async () => {
      if (environmentKey(this.options.environment)) throw new EnvironmentKeyActiveError();
      const value = validateSecret(secret);
      await this.options.secretStore.set(value);
      await this.verifyStored(value);
      const status = (await this.resolveUnlocked()).status;
      this.invalidateConnectivityUnlocked();
      return status;
    });
  }

  async removeLocal(): Promise<ApiKeyStatusDto> {
    return this.serialized(async () => {
      if (environmentKey(this.options.environment)) throw new EnvironmentKeyActiveError();
      try {
        await this.options.secretStore.delete();
        if ((await this.options.secretStore.get()) !== null) {
          throw new CredentialBackendError('The local credential could not be cleared safely.');
        }
      } catch (error) {
        this.persistStatus('none', this.storeFailureStatus(error), this.options.secretStore.kind);
        if (error instanceof CredentialBackendError) throw error;
        throw new CredentialBackendError('The local credential could not be cleared safely.');
      }
      const status = (await this.resolveUnlocked()).status;
      this.invalidateConnectivityUnlocked();
      return status;
    });
  }
}
