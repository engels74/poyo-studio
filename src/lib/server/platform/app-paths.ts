import { existsSync } from 'node:fs';
import { chmod, lstat, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type AppPathSource = 'environment' | 'project-default';

export interface AppPaths {
  root: string;
  database: string;
  media: string;
  uploads: string;
  thumbnails: string;
  logs: string;
  secrets: string;
  temporary: string;
  source: AppPathSource;
}

export interface ResolveAppPathsOptions {
  environment?: Record<string, string | undefined>;
  projectRoot?: string;
  moduleDirectory?: string;
}

function requireSafePath(value: string, variable: string): string {
  if (value.includes('\0')) throw new Error(`${variable} contains a null byte.`);
  return resolve(value);
}

export function deriveProjectRoot(
  moduleDirectory = dirname(fileURLToPath(import.meta.url)),
  fileExists: (path: string) => boolean = existsSync
): string {
  let candidate = resolve(moduleDirectory);
  while (true) {
    if (fileExists(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) {
      throw new Error('Unable to derive the Poyo Local Studio project root.');
    }
    candidate = parent;
  }
}

export function resolveAppPaths(options: ResolveAppPathsOptions = {}): AppPaths {
  const environment = options.environment ?? Bun.env;
  const configuredRoot = environment.PLS_APP_DATA_DIR?.trim();
  const root = configuredRoot
    ? requireSafePath(configuredRoot, 'PLS_APP_DATA_DIR')
    : join(
        requireSafePath(
          options.projectRoot ?? deriveProjectRoot(options.moduleDirectory),
          'project root'
        ),
        'data'
      );

  return {
    root,
    database: join(root, 'state', 'poyo-studio.sqlite'),
    media: join(root, 'media'),
    uploads: join(root, 'uploads'),
    thumbnails: join(root, 'thumbnails'),
    logs: join(root, 'logs'),
    secrets: join(root, 'secrets'),
    temporary: join(root, 'tmp'),
    source: configuredRoot ? 'environment' : 'project-default'
  };
}

export function resolvePathWithin(root: string, candidate: string): string {
  if (candidate.includes('\0')) throw new Error('Path contains a null byte.');
  const resolvedRoot = resolve(root);
  const resolvedCandidate = isAbsolute(candidate)
    ? resolve(candidate)
    : resolve(resolvedRoot, candidate);
  const pathFromRoot = relative(resolvedRoot, resolvedCandidate);

  if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new Error('Path escapes the configured application root.');
  }

  return resolvedCandidate;
}

export async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Expected a private directory at ${path}.`);
  }
  if (typeof process.getuid === 'function') await chmod(path, 0o700);
}

/**
 * Ensure a configured directory exists and is a real (non-symlink) directory, creating it and any
 * missing parents when absent. Unlike {@link ensurePrivateDirectory} it never changes an existing
 * directory's permissions.
 */
export async function ensureDirectoryExists(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });

  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Expected a directory at ${path}.`);
  }
}

export async function ensureAppPaths(paths: AppPaths): Promise<void> {
  if (paths.source === 'project-default') await ensurePrivateDirectory(paths.root);
  else await ensureDirectoryExists(paths.root);
  await Promise.all([
    ensurePrivateDirectory(dirname(paths.database)),
    ensurePrivateDirectory(paths.media),
    ensurePrivateDirectory(paths.uploads),
    ensurePrivateDirectory(paths.thumbnails),
    ensurePrivateDirectory(paths.logs),
    ensurePrivateDirectory(paths.secrets),
    ensurePrivateDirectory(paths.temporary)
  ]);
}
