import { randomUUID } from 'node:crypto';
import { appendFile, lstat, mkdir, readdir, realpath, rename, rm, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  type MaintenanceGate,
  maintenanceGate,
  type WriterPermit
} from '../platform/maintenance-gate';
import { redact } from './redaction';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface FileInfo {
  size: number;
  mtimeMs: number;
  isFile?: boolean;
  isDirectory?: boolean;
  isSymbolicLink?: boolean;
}

export interface LoggerFileOperations {
  append(path: string, content: string): Promise<void>;
  canonicalize(path: string): Promise<string>;
  captureDirectory(path: string): Promise<string | null>;
  list(path: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  removeTree(path: string): Promise<void>;
  stat(path: string): Promise<FileInfo | null>;
}

const defaultFileOperations: LoggerFileOperations = {
  append: (path, content) => appendFile(path, content, { encoding: 'utf8', mode: 0o600 }),
  canonicalize: (path) => realpath(path),
  captureDirectory: async (path) => {
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    if (!info.isDirectory() && !info.isSymbolicLink()) {
      throw new Error('Log directory is unavailable.');
    }
    const captured = join(dirname(path), `.${basename(path)}.clear-${randomUUID()}`);
    await rename(path, captured);
    try {
      await mkdir(path, { mode: 0o700 });
    } catch (error) {
      await rename(captured, path).catch(() => undefined);
      throw error;
    }
    return captured;
  },
  list: async (path) => readdir(path),
  mkdir: async (path) => mkdir(path, { recursive: true, mode: 0o700 }).then(() => undefined),
  remove: async (path) => unlink(path),
  rename: async (from, to) => rename(from, to),
  removeTree: async (path) => rm(path, { force: false, recursive: true }),
  stat: async (path) => {
    try {
      const info = await lstat(path);
      return {
        size: info.size,
        mtimeMs: info.mtimeMs,
        isFile: info.isFile(),
        isDirectory: info.isDirectory(),
        isSymbolicLink: info.isSymbolicLink()
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
};

export interface LoggerConfig {
  directory: string;
  separateErrorFile?: boolean;
  maxBytes?: number;
  maxAgeMs?: number;
  retentionAgeMs?: number;
  maxRotatedFiles?: number;
  now?: () => Date;
  files?: LoggerFileOperations;
  onRotationError?: (error: unknown) => void;
  gate?: MaintenanceGate | null;
}

export interface LogContext {
  correlationId?: string;
  localJobId?: string;
  poyoTaskId?: string;
  data?: unknown;
}

export interface LoggerDiagnostics {
  status: 'ok' | 'degraded';
  separateErrorFile: boolean;
  files: number;
  bytes: number;
  lastRotationError: { name: string; message: string } | null;
  rotation: LoggerRotationSettings;
}

export interface LoggerRotationSettings {
  separateErrorFile: boolean;
  maxBytes: number;
  maxAgeMs: number;
  retentionAgeMs: number;
  maxRotatedFiles: number;
}

export interface LogClearResult {
  cleared: boolean;
}

export class StructuredLogger {
  private readonly files: LoggerFileOperations;
  private readonly now: () => Date;
  private rotation: LoggerRotationSettings;
  private queue = Promise.resolve();
  private suspended = false;
  private lastRotationError: { name: string; message: string } | null = null;

  constructor(private readonly config: LoggerConfig) {
    this.files = config.files ?? defaultFileOperations;
    this.now = config.now ?? (() => new Date());
    this.rotation = {
      separateErrorFile: config.separateErrorFile ?? true,
      maxBytes: config.maxBytes ?? 5 * 1024 * 1024,
      maxAgeMs: config.maxAgeMs ?? 24 * 60 * 60 * 1000,
      retentionAgeMs: config.retentionAgeMs ?? 14 * 24 * 60 * 60 * 1000,
      maxRotatedFiles: config.maxRotatedFiles ?? 10
    };
  }

  updateRotationSettings(settings: LoggerRotationSettings): void {
    const valid =
      typeof settings.separateErrorFile === 'boolean' &&
      Number.isSafeInteger(settings.maxBytes) &&
      settings.maxBytes >= 64 * 1024 &&
      settings.maxBytes <= 1024 * 1024 * 1024 &&
      Number.isSafeInteger(settings.maxAgeMs) &&
      settings.maxAgeMs >= 60_000 &&
      settings.maxAgeMs <= 30 * 24 * 60 * 60 * 1000 &&
      Number.isSafeInteger(settings.retentionAgeMs) &&
      settings.retentionAgeMs >= 60 * 60 * 1000 &&
      settings.retentionAgeMs <= 365 * 24 * 60 * 60 * 1000 &&
      Number.isSafeInteger(settings.maxRotatedFiles) &&
      settings.maxRotatedFiles >= 1 &&
      settings.maxRotatedFiles <= 100;
    if (!valid) throw new Error('Log rotation settings are outside the supported bounds.');
    this.rotation = { ...settings };
  }

  rotationSettings(): LoggerRotationSettings {
    return { ...this.rotation };
  }

  private activeFile(directory: string, level: LogLevel): string {
    return join(
      directory,
      level === 'error' && this.rotation.separateErrorFile ? 'error.jsonl' : 'app.jsonl'
    );
  }

  private async resolveManagedDirectory(create: boolean): Promise<string | null> {
    if (create) await this.files.mkdir(this.config.directory);
    const configured = await this.files.stat(this.config.directory);
    if (!configured) return null;
    if (configured.isDirectory !== true || configured.isSymbolicLink !== false) {
      throw new Error('Log directory is unavailable.');
    }
    const directory = await this.files.canonicalize(this.config.directory);
    const canonical = await this.files.stat(directory);
    if (canonical?.isDirectory !== true || canonical.isSymbolicLink !== false) {
      throw new Error('Log directory is unavailable.');
    }
    return directory;
  }

  private async pendingClearCaptures(): Promise<string[]> {
    const parent = dirname(this.config.directory);
    const prefix = `.${basename(this.config.directory)}.clear-`;
    const captureId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const names = await this.files.list(parent);
    return names
      .filter((name) => name.startsWith(prefix) && captureId.test(name.slice(prefix.length)))
      .map((name) => join(parent, name));
  }

  private async removePendingClearCaptures(): Promise<void> {
    for (const path of await this.pendingClearCaptures()) await this.files.removeTree(path);
    if ((await this.pendingClearCaptures()).length > 0) {
      throw new Error('Pending log deletion could not be completed.');
    }
  }

  private async nextRotationPath(path: string): Promise<string> {
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const suffix = attempt === 0 ? '' : `-${attempt}`;
      const candidate = `${path}.${stamp}${suffix}`;
      if (!(await this.files.stat(candidate))) return candidate;
    }
    throw new Error('Unable to allocate a rotated log filename.');
  }

  private async prune(path: string): Promise<void> {
    const prefix = `${basename(path)}.`;
    const now = this.now().getTime();
    const directory = dirname(path);
    const candidates = await this.files.list(directory);
    const records = (
      await Promise.all(
        candidates
          .filter((file) => file.startsWith(prefix))
          .map(async (file) => {
            const fullPath = join(directory, file);
            return { fullPath, info: await this.files.stat(fullPath) };
          })
      )
    )
      .filter((record): record is { fullPath: string; info: FileInfo } => record.info !== null)
      .sort((left, right) => right.info.mtimeMs - left.info.mtimeMs);

    for (const [index, record] of records.entries()) {
      if (
        index >= this.rotation.maxRotatedFiles ||
        now - record.info.mtimeMs > this.rotation.retentionAgeMs
      ) {
        await this.files.remove(record.fullPath).catch(() => undefined);
      }
    }
  }

  private async rotateIfNeeded(path: string, incomingBytes: number): Promise<void> {
    const info = await this.files.stat(path);
    if (!info) return;
    const exceedsSize = info.size + incomingBytes > this.rotation.maxBytes;
    const exceedsAge = this.now().getTime() - info.mtimeMs >= this.rotation.maxAgeMs;
    if (!exceedsSize && !exceedsAge) return;

    try {
      await this.files.rename(path, await this.nextRotationPath(path));
      await this.prune(path);
      this.lastRotationError = null;
    } catch (error) {
      this.lastRotationError = { name: 'Error', message: 'Log rotation failed.' };
      this.config.onRotationError?.(error);
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  log(level: LogLevel, event: string, context: LogContext = {}): Promise<void> {
    if (this.suspended) return Promise.reject(new Error('Logger is suspended for maintenance.'));
    const gate = this.config.gate === null ? null : (this.config.gate ?? maintenanceGate);
    let permit: WriterPermit | undefined;
    try {
      permit = gate?.acquireWriter('logger.write');
    } catch (error) {
      return Promise.reject(error);
    }
    return this.enqueue(async () => {
      try {
        const directory = await this.resolveManagedDirectory(true);
        if (!directory) throw new Error('Log directory is unavailable.');
        const record = redact({
          timestamp: this.now().toISOString(),
          level,
          event,
          correlationId: context.correlationId ?? null,
          localJobId: context.localJobId ?? null,
          poyoTaskId: context.poyoTaskId ?? null,
          data: context.data ?? null
        });
        const line = `${JSON.stringify(record)}\n`;
        const path = this.activeFile(directory, level);
        await this.rotateIfNeeded(path, Buffer.byteLength(line));
        await this.files.append(path, line);
      } finally {
        permit?.release();
      }
    });
  }

  info(event: string, context?: LogContext): Promise<void> {
    return this.log('info', event, context);
  }

  warn(event: string, context?: LogContext): Promise<void> {
    return this.log('warn', event, context);
  }

  error(event: string, error: unknown, context: LogContext = {}): Promise<void> {
    return this.log('error', event, { ...context, data: { error, context: context.data ?? null } });
  }

  async suspendAndDrain(): Promise<void> {
    this.suspended = true;
    await this.queue;
  }

  recoverPendingClears(): Promise<void> {
    return this.enqueue(() => this.removePendingClearCaptures());
  }

  async clearManagedFiles(): Promise<LogClearResult> {
    if (!this.suspended) throw new Error('Logger must be suspended before logs are cleared.');
    await this.queue;
    await this.removePendingClearCaptures();
    const captured = await this.files.captureDirectory(this.config.directory);
    if (captured) await this.files.removeTree(captured);
    await this.removePendingClearCaptures();
    this.lastRotationError = null;
    return { cleared: true };
  }

  resumeBeforePublication(): void {
    if (!this.suspended) throw new Error('Logger is not suspended.');
    this.suspended = false;
  }

  async diagnostics(): Promise<LoggerDiagnostics> {
    await this.queue;
    let directory: string | null = null;
    let directoryUnavailable = false;
    try {
      directory = await this.resolveManagedDirectory(false);
    } catch {
      directoryUnavailable = true;
    }
    const names = directory ? await this.files.list(directory) : [];
    const infos = directory
      ? await Promise.all(
          names
            .filter((name) => name.startsWith('app.jsonl') || name.startsWith('error.jsonl'))
            .map((name) => this.files.stat(join(directory, name)))
        )
      : [];

    return {
      status: this.lastRotationError || directoryUnavailable ? 'degraded' : 'ok',
      separateErrorFile: this.rotation.separateErrorFile,
      files: infos.filter(Boolean).length,
      bytes: infos.reduce((total, info) => total + (info?.size ?? 0), 0),
      lastRotationError: this.lastRotationError,
      rotation: this.rotationSettings()
    };
  }
}
