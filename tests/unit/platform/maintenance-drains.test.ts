import { describe, expect, test } from 'bun:test';
import type { CleanupRepository } from '../../../src/lib/server/cleanup/repository';
import { CleanupRuntime } from '../../../src/lib/server/cleanup/runtime';
import type { CleanupService } from '../../../src/lib/server/cleanup/service';
import {
  type LoggerFileOperations,
  StructuredLogger
} from '../../../src/lib/server/diagnostics/jsonl-logger';
import { JobWorker } from '../../../src/lib/server/jobs/coordinator';
import { MaintenanceGate } from '../../../src/lib/server/platform/maintenance-gate';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function expectPending(promise: Promise<unknown>): Promise<void> {
  expect(
    await Promise.race([promise.then(() => 'settled'), Bun.sleep(10).then(() => 'pending')])
  ).toBe('pending');
}

describe('maintenance drain adapters', () => {
  test('job recovery remains scheduled across exclusive log maintenance', async () => {
    const gate = new MaintenanceGate();
    let calls = 0;
    const worker = new JobWorker(
      {
        recoverOnce: async () => {
          calls += 1;
        }
      },
      5,
      gate
    );
    worker.start();
    try {
      const deadline = Date.now() + 500;
      while (calls === 0 && Date.now() < deadline) await Bun.sleep(5);
      expect(calls).toBeGreaterThan(0);

      const lease = await gate.upgradeToExclusiveMaintenance(
        gate.acquireMaintenanceInitiator('log-clear')
      );
      const beforeReopen = calls;
      lease.reopenBeforePublication();

      const reopenDeadline = Date.now() + 500;
      while (calls === beforeReopen && Date.now() < reopenDeadline) await Bun.sleep(5);
      expect(calls).toBeGreaterThan(beforeReopen);
    } finally {
      await worker.stopAndDrain();
    }
  });

  test('automatic cleanup remains scheduled across exclusive log maintenance', async () => {
    const gate = new MaintenanceGate();
    let scheduledRun: (() => Promise<void>) | undefined;
    let policyRuns = 0;
    const runtime = new CleanupRuntime({
      repository: {
        reconcileExpiredClaims: () => undefined,
        claimNext: () => null,
        actionCounts: () => ({})
      } as unknown as CleanupRepository,
      service: {
        scheduleEnabledPolicy: async () => {
          policyRuns += 1;
        },
        execute: () => Promise.resolve()
      } as unknown as CleanupService,
      gate,
      schedule: (run) => {
        scheduledRun = run;
        return () => {
          scheduledRun = undefined;
        };
      }
    });
    runtime.start();
    while (policyRuns === 0) await Bun.sleep(0);

    const lease = await gate.upgradeToExclusiveMaintenance(
      gate.acquireMaintenanceInitiator('log-clear')
    );
    lease.reopenBeforePublication();

    expect(runtime.diagnostics().scheduled).toBe(true);
    await scheduledRun?.();
    expect(policyRuns).toBe(2);
    runtime.stop();
  });

  test('JobWorker stopAndDrain cancels future ticks and awaits the running tick', async () => {
    const gate = new MaintenanceGate();
    const started = deferred();
    const finish = deferred();
    let calls = 0;
    const worker = new JobWorker(
      {
        recoverOnce: async () => {
          calls += 1;
          started.resolve();
          await finish.promise;
        }
      },
      60_000,
      gate
    );
    worker.start();
    await started.promise;

    const drain = worker.stopAndDrain();
    await expectPending(drain);
    finish.resolve();
    await drain;
    expect(calls).toBe(1);
    expect(gate.status().activeWriters).toBe(0);
  });

  test('CleanupRuntime stopAndDrain cancels its schedule and awaits runOnce', async () => {
    const gate = new MaintenanceGate();
    const started = deferred();
    const finish = deferred();
    let scheduleCancelled = false;
    const repository = {
      reconcileExpiredClaims: () => undefined,
      claimNext: () => null,
      actionCounts: () => ({})
    } as unknown as CleanupRepository;
    const service = {
      scheduleEnabledPolicy: async () => {
        started.resolve();
        await finish.promise;
      },
      execute: () => Promise.resolve()
    } as unknown as CleanupService;
    const runtime = new CleanupRuntime({
      repository,
      service,
      gate,
      schedule: () => () => {
        scheduleCancelled = true;
      }
    });
    runtime.start();
    await started.promise;

    const drain = runtime.stopAndDrain();
    expect(scheduleCancelled).toBe(true);
    await expectPending(drain);
    finish.resolve();
    await drain;
    expect(gate.status().activeWriters).toBe(0);
  });

  test('StructuredLogger suspends new appends and flushes its queued write', async () => {
    const gate = new MaintenanceGate();
    const appendStarted = deferred();
    const finishAppend = deferred();
    let appends = 0;
    const files: LoggerFileOperations = {
      append: async () => {
        appends += 1;
        appendStarted.resolve();
        await finishAppend.promise;
      },
      canonicalize: (path) => Promise.resolve(path),
      captureDirectory: () => Promise.resolve(null),
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      removeTree: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      stat: (path) =>
        Promise.resolve(
          path === '/logs'
            ? {
                size: 0,
                mtimeMs: 0,
                isFile: false,
                isDirectory: true,
                isSymbolicLink: false
              }
            : null
        )
    };
    const logger = new StructuredLogger({ directory: '/logs', files, gate });
    const write = logger.info('maintenance.drain');
    await appendStarted.promise;

    const drain = logger.suspendAndDrain();
    await expectPending(drain);
    finishAppend.resolve();
    await Promise.all([write, drain]);
    await expect(logger.info('must-not-append')).rejects.toThrow('suspended');
    expect(appends).toBe(1);
    expect(gate.status().activeWriters).toBe(0);
  });
});
