import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAppPaths } from '../src/lib/server/platform/app-paths';
import { openDatabase } from '../src/lib/server/platform/database';
import { SettingsRepository } from '../src/lib/server/settings/settings-repository';
import { updateOnboarding } from '../src/lib/server/settings/studio-settings';

const host = '127.0.0.1';
const startupTimeoutMs = 15_000;
const requestTimeoutMs = 1_000;
const routeChecks = [
  ['/', 'Dashboard'],
  ['/studio/image', 'Image Studio'],
  ['/studio/video', 'Video Studio'],
  ['/jobs', 'Jobs'],
  ['/library', 'Library'],
  ['/models', 'Models'],
  ['/presets', 'Presets'],
  ['/settings', 'Settings'],
  ['/settings/diagnostics', 'Diagnostics']
] as const;

function reserveLoopbackPort(): number {
  const reservation = Bun.serve({
    hostname: host,
    port: 0,
    fetch: () => new Response(null, { status: 204 })
  });
  const { port } = reservation;
  reservation.stop(true);
  return port;
}

async function stopProcess(server: ReturnType<typeof Bun.spawn>): Promise<void> {
  if (server.exitCode !== null) return;

  server.kill('SIGTERM');
  const stopped = await Promise.race([
    server.exited.then(() => true),
    Bun.sleep(2_000).then(() => false)
  ]);

  if (!stopped) {
    server.kill('SIGKILL');
    await server.exited;
  }
}

async function assertNonLoopbackStartRejected(): Promise<void> {
  const rejected = Bun.spawn({
    cmd: [process.execPath, 'run', 'start'],
    env: { ...Bun.env, HOST: '0.0.0.0' },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe'
  });
  const exitCode = await Promise.race([
    rejected.exited,
    Bun.sleep(2_000).then(async () => {
      await stopProcess(rejected);
      return null;
    })
  ]);
  const errorOutput = await new Response(rejected.stderr).text();
  if (exitCode === null || exitCode === 0 || !errorOutput.includes('Non-loopback listeners')) {
    throw new Error(
      'The packaged start command did not reject a non-loopback HOST before startup.'
    );
  }
}

const entrypoint = Bun.file('build/index.js');
if (!(await entrypoint.exists())) {
  throw new Error('Missing build/index.js. Run `bun run build` before the production smoke test.');
}

await assertNonLoopbackStartRejected();

const port = reserveLoopbackPort();
const url = `http://${host}:${port}/`;
const origin = url.slice(0, -1);
const smokeDirectory = await mkdtemp(join(tmpdir(), 'poyo-production-smoke-'));
const appData = join(smokeDirectory, 'data');
const appPaths = resolveAppPaths({ environment: { PLS_APP_DATA_DIR: appData } });
const server = Bun.spawn({
  cmd: [process.execPath, 'run', 'start'],
  env: {
    ...Bun.env,
    HOST: host,
    ORIGIN: origin,
    PORT: String(port),
    POYO_API_KEY: '',
    PLS_APP_DATA_DIR: appData
  },
  stdout: 'pipe',
  stderr: 'pipe'
});
const stdout = new Response(server.stdout).text();
const stderr = new Response(server.stderr).text();

let failure: unknown;

try {
  const deadline = Date.now() + startupTimeoutMs;
  let response: Response | undefined;
  let lastError: unknown;

  while (Date.now() < deadline && server.exitCode === null) {
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(requestTimeoutMs)
      });
      if (response.ok) break;
      lastError = new Error(`Production server responded with HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await Bun.sleep(150);
  }

  if (!response?.ok) {
    throw new Error(`Production server did not become ready within ${startupTimeoutMs}ms.`, {
      cause: lastError
    });
  }

  const welcomeBody = await response.text();
  if (
    new URL(response.url).pathname !== '/welcome' ||
    !welcomeBody.includes('Poyo Local Studio') ||
    !welcomeBody.includes('Welcome to Poyo Local Studio')
  ) {
    throw new Error('Fresh production startup did not enter onboarding.');
  }

  const database = await openDatabase(appPaths.database);
  try {
    updateOnboarding(new SettingsRepository(database), { dismiss: true });
  } finally {
    database.close();
  }

  for (const [pathname, marker] of routeChecks) {
    const routeResponse = await fetch(new URL(pathname, url), {
      signal: AbortSignal.timeout(requestTimeoutMs)
    });

    if (!routeResponse.ok) {
      throw new Error(`Production route ${pathname} responded with HTTP ${routeResponse.status}.`);
    }

    const body = await routeResponse.text();
    if (!body.includes('Poyo Local Studio') || !body.includes(marker)) {
      throw new Error(`Production route ${pathname} did not contain its application markers.`);
    }
  }

  console.log(
    `Production smoke passed: onboarding and ${routeChecks.length} routes responded on the loopback listener ${url}.`
  );
} catch (error) {
  failure = error;
} finally {
  try {
    await stopProcess(server);
  } catch (error) {
    failure ??= error;
  }
  try {
    await rm(smokeDirectory, { recursive: true, force: true });
  } catch (error) {
    failure ??= error;
  }
}

const [serverStdout, serverStderr] = await Promise.all([stdout, stderr]);
if (failure) {
  if (serverStdout.trim()) console.error(`Server stdout:\n${serverStdout.trim()}`);
  if (serverStderr.trim()) console.error(`Server stderr:\n${serverStderr.trim()}`);
  throw failure;
}
