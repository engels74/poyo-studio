import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { chmod, lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AppPaths } from '../platform/app-paths';

const secretFileName = 'poyo-api-key';
const maximumSecretBytes = 4096;

export interface SecretStore {
  readonly kind: 'file';
  get(): Promise<string | null>;
  set(secret: string): Promise<void>;
  delete(): Promise<boolean>;
}

export class SecretStoreUnavailableError extends Error {
  constructor(message = 'Secure local credential storage is unavailable.') {
    super(message);
    this.name = 'SecretStoreUnavailableError';
  }
}

export class SecretStoreCorruptError extends Error {
  constructor() {
    super('The local credential file is corrupt.');
    this.name = 'SecretStoreCorruptError';
  }
}

async function pathDetails(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function assertPrivateDirectory(
  info: Awaited<ReturnType<typeof lstat>>,
  enforcePermissions: boolean
): void {
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new SecretStoreUnavailableError('Local secret directory is not a regular directory.');
  }
  if (enforcePermissions && (Number(info.mode) & 0o077) !== 0) {
    throw new SecretStoreUnavailableError('Local secret directory permissions are not private.');
  }
}

function assertPrivateFile(
  info: Awaited<ReturnType<typeof lstat>>,
  enforcePermissions: boolean
): void {
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new SecretStoreUnavailableError('Local secret is not a regular file.');
  }
  if (enforcePermissions && (Number(info.mode) & 0o077) !== 0) {
    throw new SecretStoreUnavailableError('Local secret file permissions are not private.');
  }
}

async function syncDirectory(path: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, fsConstants.O_RDONLY);
  } catch (error) {
    if (
      ['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'EISDIR'].includes(
        String((error as NodeJS.ErrnoException).code)
      )
    ) {
      return;
    }
    throw error;
  }
  try {
    await handle.sync().catch((error) => {
      if (
        !['EINVAL', 'ENOTSUP', 'EOPNOTSUPP'].includes(String((error as NodeJS.ErrnoException).code))
      ) {
        throw error;
      }
    });
  } finally {
    await handle.close();
  }
}

function decodeSecret(bytes: Uint8Array): string {
  if (bytes.byteLength === 0 || bytes.byteLength > maximumSecretBytes) {
    throw new SecretStoreCorruptError();
  }
  let value: string;
  try {
    value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new SecretStoreCorruptError();
  }
  if (!value.trim()) throw new SecretStoreCorruptError();
  return value;
}

export type PermissionFileSecretStoreCheckpoint =
  | 'directory-created'
  | 'parent-directory-synced'
  | 'temporary-opened'
  | 'temporary-written'
  | 'temporary-synced'
  | 'target-renamed'
  | 'directory-synced'
  | 'target-deleted'
  | 'delete-directory-synced';

export interface PermissionFileSecretStoreOptions {
  checkpoint?: (checkpoint: PermissionFileSecretStoreCheckpoint) => void | Promise<void>;
  capabilities?: Partial<SecretStoreCapabilities>;
}

export interface SecretStoreCapabilities {
  posixPermissions: boolean;
  directorySync: boolean;
  noFollowOpen: boolean;
}

function runtimeCapabilities(): SecretStoreCapabilities {
  const posixFilesystemSemantics = typeof process.getuid === 'function';
  return {
    posixPermissions: posixFilesystemSemantics,
    directorySync: posixFilesystemSemantics,
    noFollowOpen: posixFilesystemSemantics && typeof fsConstants.O_NOFOLLOW === 'number'
  };
}

export class PermissionFileSecretStore implements SecretStore {
  readonly kind = 'file' as const;
  private readonly filePath: string;
  private readonly capabilities: SecretStoreCapabilities;

  constructor(
    private readonly directory: string,
    private readonly options: PermissionFileSecretStoreOptions = {}
  ) {
    this.filePath = join(directory, secretFileName);
    this.capabilities = { ...runtimeCapabilities(), ...options.capabilities };
  }

  private async ensureDirectory(): Promise<void> {
    const existing = await pathDetails(this.directory);
    if (existing) {
      assertPrivateDirectory(existing, this.capabilities.posixPermissions);
      return;
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (this.capabilities.posixPermissions) await chmod(this.directory, 0o700);
    const created = await lstat(this.directory);
    assertPrivateDirectory(created, this.capabilities.posixPermissions);
    await this.options.checkpoint?.('directory-created');
    if (this.capabilities.directorySync) {
      await syncDirectory(dirname(this.directory));
      await this.options.checkpoint?.('parent-directory-synced');
    }
  }

  private async readExisting(): Promise<string | null> {
    const details = await pathDetails(this.filePath);
    if (!details) return null;
    assertPrivateFile(details, this.capabilities.posixPermissions);

    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(
        this.filePath,
        fsConstants.O_RDONLY | (this.capabilities.noFollowOpen ? fsConstants.O_NOFOLLOW : 0)
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
        throw new SecretStoreUnavailableError('Local secret is not a regular file.');
      }
      throw error;
    }
    try {
      const opened = await handle.stat();
      assertPrivateFile(opened, this.capabilities.posixPermissions);
      if (opened.size > maximumSecretBytes) throw new SecretStoreCorruptError();
      return decodeSecret(await handle.readFile());
    } finally {
      await handle.close();
    }
  }

  async get(): Promise<string | null> {
    const directory = await pathDetails(this.directory);
    if (!directory) return null;
    assertPrivateDirectory(directory, this.capabilities.posixPermissions);
    return this.readExisting();
  }

  async set(secret: string): Promise<void> {
    const value = secret.trim();
    if (!value || Buffer.byteLength(value) > maximumSecretBytes) {
      throw new Error('API key is empty or too large.');
    }
    await this.ensureDirectory();
    const existing = await pathDetails(this.filePath);
    if (existing) assertPrivateFile(existing, this.capabilities.posixPermissions);

    const temporaryPath = join(this.directory, `.${secretFileName}.${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(
        temporaryPath,
        fsConstants.O_WRONLY |
          fsConstants.O_CREAT |
          fsConstants.O_EXCL |
          (this.capabilities.noFollowOpen ? fsConstants.O_NOFOLLOW : 0),
        0o600
      );
      await this.options.checkpoint?.('temporary-opened');
      await handle.writeFile(value, 'utf8');
      if (this.capabilities.posixPermissions) await handle.chmod(0o600);
      assertPrivateFile(await handle.stat(), this.capabilities.posixPermissions);
      await this.options.checkpoint?.('temporary-written');
      await handle.sync();
      await this.options.checkpoint?.('temporary-synced');
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, this.filePath);
      await this.options.checkpoint?.('target-renamed');
      await this.readExisting();
      if (this.capabilities.directorySync) {
        await syncDirectory(this.directory);
        await this.options.checkpoint?.('directory-synced');
      }
    } finally {
      await handle?.close();
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  async delete(): Promise<boolean> {
    const directory = await pathDetails(this.directory);
    if (!directory) return false;
    assertPrivateDirectory(directory, this.capabilities.posixPermissions);
    const existing = await pathDetails(this.filePath);
    if (!existing) return false;
    assertPrivateFile(existing, this.capabilities.posixPermissions);
    await unlink(this.filePath);
    await this.options.checkpoint?.('target-deleted');
    if (this.capabilities.directorySync) {
      await syncDirectory(this.directory);
      await this.options.checkpoint?.('delete-directory-synced');
    }
    return true;
  }
}

export interface CreateSecretStoreOptions {
  paths: Pick<AppPaths, 'secrets'>;
}

export function createSecretStore(options: CreateSecretStoreOptions): SecretStore {
  return new PermissionFileSecretStore(options.paths.secrets);
}
