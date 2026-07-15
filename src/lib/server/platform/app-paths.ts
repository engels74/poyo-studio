import { chmod, lstat, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const APP_DIRECTORY_NAME = 'poyo-local-studio';

export interface AppPaths {
  root: string;
  database: string;
  media: string;
  uploads: string;
  thumbnails: string;
  logs: string;
  secrets: string;
  temporary: string;
  source: 'environment' | 'platform-default';
}

export interface ResolveAppPathsOptions {
  environment?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  homeDirectory?: string;
}

function requireSafePath(value: string, variable: string): string {
  if (value.includes('\0')) throw new Error(`${variable} contains a null byte.`);
  return resolve(value);
}

function resolveHome(environment: Record<string, string | undefined>, explicit?: string): string {
  const home = explicit ?? environment.HOME ?? environment.USERPROFILE;
  if (!home) throw new Error('Unable to resolve the current user home directory.');
  return requireSafePath(home, 'home directory');
}

function platformRoot(
  platform: NodeJS.Platform,
  environment: Record<string, string | undefined>,
  home: string
): string {
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Poyo Local Studio');
  }

  if (platform === 'win32') {
    const localAppData = environment.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    return join(requireSafePath(localAppData, 'LOCALAPPDATA'), 'Poyo Local Studio');
  }

  const xdgDataHome = environment.XDG_DATA_HOME
    ? requireSafePath(environment.XDG_DATA_HOME, 'XDG_DATA_HOME')
    : join(home, '.local', 'share');
  return join(xdgDataHome, APP_DIRECTORY_NAME);
}

export function resolveAppPaths(options: ResolveAppPathsOptions = {}): AppPaths {
  const environment = options.environment ?? Bun.env;
  const platform = options.platform ?? process.platform;
  const home = resolveHome(environment, options.homeDirectory);
  const configuredRoot = environment.PLS_APP_DATA_DIR?.trim();
  const root = configuredRoot
    ? requireSafePath(configuredRoot, 'PLS_APP_DATA_DIR')
    : platformRoot(platform, environment, home);

  return {
    root,
    database: environment.PLS_DATABASE_PATH
      ? requireSafePath(environment.PLS_DATABASE_PATH, 'PLS_DATABASE_PATH')
      : join(root, 'data', 'poyo-studio.sqlite'),
    media: environment.PLS_MEDIA_DIR
      ? requireSafePath(environment.PLS_MEDIA_DIR, 'PLS_MEDIA_DIR')
      : join(root, 'media'),
    uploads: join(root, 'uploads'),
    thumbnails: join(root, 'thumbnails'),
    logs: environment.PLS_LOG_DIR
      ? requireSafePath(environment.PLS_LOG_DIR, 'PLS_LOG_DIR')
      : join(root, 'logs'),
    secrets: join(root, 'secrets'),
    temporary: join(root, 'tmp'),
    source: configuredRoot ? 'environment' : 'platform-default'
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

async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') return;

  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Expected a private directory at ${path}.`);
  }
  await chmod(path, 0o700);
}

export async function ensureAppPaths(paths: AppPaths): Promise<void> {
  await Promise.all([
    ensurePrivateDirectory(paths.root),
    ensurePrivateDirectory(dirname(paths.database)),
    ensurePrivateDirectory(paths.media),
    ensurePrivateDirectory(paths.uploads),
    ensurePrivateDirectory(paths.thumbnails),
    ensurePrivateDirectory(paths.logs),
    ensurePrivateDirectory(paths.temporary)
  ]);
}
