import { describe, expect, test } from 'bun:test';
import {
  MaintenanceGate,
  MaintenanceUnavailableError,
  requestRequiresWriterPermit
} from '../../../src/lib/server/platform/maintenance-gate';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function expectPending(promise: Promise<unknown>): Promise<void> {
  const outcome = await Promise.race([
    promise.then(
      () => 'settled',
      () => 'settled'
    ),
    Bun.sleep(10).then(() => 'pending')
  ]);
  expect(outcome).toBe('pending');
}

describe('process-wide maintenance gate', () => {
  test('keeps explicit read-only HTTP methods outside the writer drain', () => {
    expect(requestRequiresWriterPermit('GET')).toBe(false);
    expect(requestRequiresWriterPermit('HEAD')).toBe(false);
    expect(requestRequiresWriterPermit('OPTIONS')).toBe(false);
    expect(requestRequiresWriterPermit('POST')).toBe(true);
    expect(requestRequiresWriterPermit('PUT')).toBe(true);
    expect(requestRequiresWriterPermit('DELETE')).toBe(true);
    expect(requestRequiresWriterPermit('DELETE', '/api/settings/logs')).toBe(false);
    expect(requestRequiresWriterPermit('POST', '/api/settings/logs')).toBe(true);
  });

  test('upgrades an initiator without awaiting itself and closes admission atomically', async () => {
    const gate = new MaintenanceGate();
    const initiator = gate.acquireMaintenanceInitiator('log-clear');
    const lease = await Promise.race([
      gate.upgradeToExclusiveMaintenance(initiator),
      Bun.sleep(100).then(() => {
        throw new Error('maintenance initiator awaited itself');
      })
    ]);

    expect(gate.status()).toMatchObject({ admission: 'closed', activeWriters: 0 });
    expect(() => gate.acquireWriter('nested')).toThrow(MaintenanceUnavailableError);
    expect(() => initiator.release()).toThrow('released or upgraded');
    lease.reopenBeforePublication();
    const writer = gate.acquireWriter('after-rollback');
    writer.release();
    expect(() => writer.release()).toThrow('already been released');
  });

  test('waits for every other writer but excludes the initiating request from the drain count', async () => {
    const gate = new MaintenanceGate();
    const initiator = gate.acquireMaintenanceInitiator('log-clear');
    const other = gate.acquireWriter('in-flight-route');
    const upgrade = gate.upgradeToExclusiveMaintenance(initiator);

    expect(gate.status()).toMatchObject({ admission: 'closed', activeWriters: 1 });
    await expectPending(upgrade);
    other.release();
    const lease = await upgrade;
    expect(gate.status().activeWriters).toBe(0);
    lease.reopenBeforePublication();
  });

  test('joins detached work as an independent cohort before granting exclusivity', async () => {
    const gate = new MaintenanceGate();
    const detached = deferred();
    const drain = deferred();
    let drainStarted = false;
    gate.trackDetached('detached-reconcile', () => detached.promise);
    gate.registerDrain('worker', async () => {
      drainStarted = true;
      await drain.promise;
    });
    const initiator = gate.acquireMaintenanceInitiator('log-clear');
    const upgrade = gate.upgradeToExclusiveMaintenance(initiator);

    expect(gate.status()).toMatchObject({
      admission: 'closed',
      activeWriters: 0,
      detachedTasks: 1
    });
    await expectPending(upgrade);
    expect(drainStarted).toBe(false);
    expect(() => gate.trackDetached('late-detached', async () => undefined)).toThrow(
      MaintenanceUnavailableError
    );
    detached.resolve();
    await Bun.sleep(0);
    expect(drainStarted).toBe(true);
    await expectPending(upgrade);
    drain.resolve();
    const lease = await upgrade;
    expect(gate.status()).toMatchObject({ detachedTasks: 0, activeWriters: 0 });
    lease.reopenBeforePublication();
  });

  test('keeps mutation frozen after publication until process restart', async () => {
    const gate = new MaintenanceGate();
    const lease = await gate.upgradeToExclusiveMaintenance(
      gate.acquireMaintenanceInitiator('log-clear')
    );
    lease.freezeUntilRestart();
    expect(gate.status().admission).toBe('frozen');
    expect(() => gate.acquireWriter('live-swap')).toThrow(MaintenanceUnavailableError);
    expect(() => lease.reopenBeforePublication()).toThrow('already been finalized');
  });

  test.each([
    ['media-cleanup', 'media-cleanup'],
    ['log-clear', 'log-clear'],
    ['database-maintenance', 'log-clear']
  ] as const)(
    'consumes the losing %s/%s maintenance initiator without leaking a permit',
    async (firstLabel, secondLabel) => {
      const gate = new MaintenanceGate();
      const first = gate.acquireMaintenanceInitiator(firstLabel);
      const second = gate.acquireMaintenanceInitiator(secondLabel);
      const firstUpgrade = gate.upgradeToExclusiveMaintenance(first);
      const secondUpgrade = gate.upgradeToExclusiveMaintenance(second);

      const [winner, loser] = await Promise.race([
        Promise.allSettled([firstUpgrade, secondUpgrade]),
        Bun.sleep(250).then(() => {
          throw new Error('concurrent maintenance upgrades deadlocked');
        })
      ]);

      expect(winner.status).toBe('fulfilled');
      expect(loser).toMatchObject({
        status: 'rejected',
        reason: expect.any(MaintenanceUnavailableError)
      });
      expect(gate.status()).toMatchObject({ admission: 'closed', activeWriters: 0 });
      if (winner.status === 'fulfilled') winner.value.reopenBeforePublication();
      expect(gate.status()).toMatchObject({ admission: 'open', activeWriters: 0 });
      expect(() => second.release()).toThrow('released or upgraded');
    }
  );
});
