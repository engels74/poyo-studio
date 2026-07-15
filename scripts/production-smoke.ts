const host = '127.0.0.1';
const startupTimeoutMs = 15_000;
const requestTimeoutMs = 1_000;

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

function inspectListener(pid: number, port: number): void {
  const lsof = Bun.which('lsof');
  if (!lsof) {
    console.warn('Listener inspection skipped because lsof is unavailable.');
    return;
  }

  const result = Bun.spawnSync({
    cmd: [lsof, '-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN'],
    stdout: 'pipe',
    stderr: 'pipe'
  });
  const output = result.stdout.toString();
  const listeners = output
    .split('\n')
    .filter((line) => line.includes(`:${port}`) && line.includes('(LISTEN)'));

  if (result.exitCode !== 0 || listeners.length === 0) {
    throw new Error(`Unable to inspect the production listener on port ${port}.`);
  }

  if (!listeners.every((line) => line.includes(`127.0.0.1:${port}`))) {
    throw new Error(`Production server exposed a non-loopback listener:\n${listeners.join('\n')}`);
  }
}

const entrypoint = Bun.file('build/index.js');
if (!(await entrypoint.exists())) {
  throw new Error('Missing build/index.js. Run `bun run build` before the production smoke test.');
}

const port = reserveLoopbackPort();
const url = `http://${host}:${port}/`;
const server = Bun.spawn({
  cmd: [process.execPath, './build/index.js'],
  env: {
    ...Bun.env,
    HOST: host,
    ORIGIN: url.slice(0, -1),
    PORT: String(port)
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

  const body = await response.text();
  if (!body.includes('Poyo Local Studio')) {
    throw new Error('Production server response did not contain the application marker.');
  }

  inspectListener(server.pid, port);
  console.log(`Production smoke passed: ${url} responded on the loopback listener.`);
} catch (error) {
  failure = error;
} finally {
  await stopProcess(server);
}

const [serverStdout, serverStderr] = await Promise.all([stdout, stderr]);
if (failure) {
  if (serverStdout.trim()) console.error(`Server stdout:\n${serverStdout.trim()}`);
  if (serverStderr.trim()) console.error(`Server stderr:\n${serverStderr.trim()}`);
  throw failure;
}
