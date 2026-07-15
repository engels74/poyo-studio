import { chmod, lstat, mkdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppPaths } from '../platform/app-paths';

const service = 'ai.poyo.local-studio';
const name = 'poyo-api-key';

export type SecretStoreRuntimeKind = 'os' | 'file' | 'unavailable';

export interface SecretStore {
  readonly kind: SecretStoreRuntimeKind;
  checkAvailability(): Promise<boolean>;
  get(): Promise<string | null>;
  set(secret: string): Promise<void>;
  delete(): Promise<boolean>;
}

export interface BunSecretsApi {
  get(options: { service: string; name: string }): Promise<string | null>;
  set(options: { service: string; name: string; value: string }): Promise<void>;
  delete(options: { service: string; name: string }): Promise<boolean>;
}

export class SecretStoreUnavailableError extends Error {
  constructor(message = 'Secure local credential storage is unavailable.') {
    super(message);
    this.name = 'SecretStoreUnavailableError';
  }
}

export function detectBunSecrets(): BunSecretsApi | null {
  const candidate = (Bun as unknown as { secrets?: BunSecretsApi }).secrets;
  if (
    !candidate ||
    typeof candidate.get !== 'function' ||
    typeof candidate.set !== 'function' ||
    typeof candidate.delete !== 'function'
  ) {
    return null;
  }
  return candidate;
}

export class OsSecretStore implements SecretStore {
  readonly kind = 'os' as const;

  constructor(private readonly api: BunSecretsApi) {}

  async checkAvailability(): Promise<boolean> {
    try {
      await this.api.get({ service, name });
      return true;
    } catch {
      return false;
    }
  }

  get(): Promise<string | null> {
    return this.api.get({ service, name });
  }

  set(secret: string): Promise<void> {
    return this.api.set({ service, name, value: secret });
  }

  delete(): Promise<boolean> {
    return this.api.delete({ service, name });
  }
}

async function assertPrivateDirectory(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new SecretStoreUnavailableError('Local secret directory is not a regular directory.');
  }
  if ((info.mode & 0o077) !== 0) {
    throw new SecretStoreUnavailableError('Local secret directory permissions are not private.');
  }
}

async function assertPrivateFile(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new SecretStoreUnavailableError('Local secret is not a regular file.');
  }
  if ((info.mode & 0o077) !== 0) {
    throw new SecretStoreUnavailableError('Local secret file permissions are not private.');
  }
}

export class PermissionFileSecretStore implements SecretStore {
  readonly kind = 'file' as const;
  private readonly filePath: string;

  constructor(
    private readonly directory: string,
    private readonly platform: NodeJS.Platform = process.platform
  ) {
    this.filePath = join(directory, name);
  }

  private async ensureDirectory(): Promise<void> {
    if (this.platform === 'win32') {
      throw new SecretStoreUnavailableError(
        'Permission-file fallback is unavailable on Windows without operating-system credentials.'
      );
    }

    try {
      await assertPrivateDirectory(this.directory);
    } catch (error) {
      if (error instanceof SecretStoreUnavailableError) throw error;
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await chmod(this.directory, 0o700);
      await assertPrivateDirectory(this.directory);
    }
  }

  async checkAvailability(): Promise<boolean> {
    try {
      await this.ensureDirectory();
      return true;
    } catch {
      return false;
    }
  }

  async get(): Promise<string | null> {
    await this.ensureDirectory();
    if (!(await Bun.file(this.filePath).exists())) return null;
    await assertPrivateFile(this.filePath);
    const value = await Bun.file(this.filePath).text();
    return value || null;
  }

  async set(secret: string): Promise<void> {
    if (!secret) throw new Error('API key cannot be empty.');
    await this.ensureDirectory();
    if (await Bun.file(this.filePath).exists()) await assertPrivateFile(this.filePath);

    const temporaryPath = join(this.directory, `.${name}.${Bun.randomUUIDv7()}.tmp`);
    try {
      await Bun.write(temporaryPath, secret, { createPath: false, mode: 0o600 });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, this.filePath);
      await chmod(this.filePath, 0o600);
      await assertPrivateFile(this.filePath);
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  async delete(): Promise<boolean> {
    await this.ensureDirectory();
    if (!(await Bun.file(this.filePath).exists())) return false;
    await assertPrivateFile(this.filePath);
    await unlink(this.filePath);
    return true;
  }
}

export class UnavailableSecretStore implements SecretStore {
  readonly kind = 'unavailable' as const;

  checkAvailability(): Promise<boolean> {
    return Promise.resolve(false);
  }

  get(): Promise<string | null> {
    return Promise.reject(new SecretStoreUnavailableError());
  }

  set(): Promise<void> {
    return Promise.reject(new SecretStoreUnavailableError());
  }

  delete(): Promise<boolean> {
    return Promise.reject(new SecretStoreUnavailableError());
  }
}

export interface CreateSecretStoreOptions {
  paths: Pick<AppPaths, 'secrets'>;
  platform?: NodeJS.Platform;
  bunSecrets?: BunSecretsApi | null;
}

export async function createPreferredSecretStore(
  options: CreateSecretStoreOptions
): Promise<SecretStore> {
  const platform = options.platform ?? process.platform;
  const bunSecrets = options.bunSecrets === undefined ? detectBunSecrets() : options.bunSecrets;

  if (bunSecrets) {
    const osStore = new OsSecretStore(bunSecrets);
    if (await osStore.checkAvailability()) return osStore;
  }

  if (platform !== 'win32') {
    const fileStore = new PermissionFileSecretStore(options.paths.secrets, platform);
    if (await fileStore.checkAvailability()) return fileStore;
  }

  return new UnavailableSecretStore();
}
