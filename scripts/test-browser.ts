const suites = {
  e2e: [
    './tests/e2e/media-readiness.browser.ts',
    './tests/e2e/gallery.browser.ts',
    './tests/e2e/gallery-viewer-lifecycle.browser.ts',
    './tests/e2e/studio-flows.browser.ts',
    './tests/e2e/job-history.browser.ts',
    './tests/e2e/storage-onboarding.browser.ts'
  ],
  security: [
    'tests/security/static-architecture.test.ts',
    './tests/security/browser-security.browser.ts'
  ]
} as const;

const mode = Bun.argv[2] as keyof typeof suites | 'all' | undefined;
if (!mode || (mode !== 'all' && !suites[mode])) {
  throw new Error(`Choose a browser suite: ${Object.keys(suites).join(', ')}, all.`);
}

const build = Bun.spawnSync({
  cmd: [process.execPath, '--bun', 'vite', 'build'],
  stdout: 'inherit',
  stderr: 'inherit'
});
if (build.exitCode !== 0) process.exit(build.exitCode);

const files =
  mode === 'all' ? [...suites.e2e, './tests/security/browser-security.browser.ts'] : suites[mode];
for (const file of files) {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'test', '--max-concurrency', '1', file],
    stdout: 'inherit',
    stderr: 'inherit'
  });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

if (mode === 'all') {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'scripts/production-smoke.ts'],
    stdout: 'inherit',
    stderr: 'inherit'
  });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
