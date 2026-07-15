import { afterEach, describe, expect, test } from 'bun:test';
import { createJobFixture, createTestJob } from '../../helpers/job-fixture';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('durable job repository invariants', () => {
  test('JOB-01 keeps local, remote, and failure axes orthogonal with atomic transitions', async () => {
    const fixture = await createJobFixture();
    cleanups.push(fixture.cleanup);
    const job = createTestJob(fixture.repository, 'state');
    expect(job).toMatchObject({
      localPhase: 'submission_prepared',
      remoteStatus: 'unknown',
      failureDomain: 'none'
    });
    expect(() => fixture.repository.transition(job.id, 'complete')).toThrow(
      'Invalid job transition'
    );
    expect(fixture.repository.get(job.id)?.localPhase).toBe('submission_prepared');
    expect(fixture.repository.get(job.id)?.normalizedPayload).toEqual(job.normalizedPayload);
  });

  test('JOB-02 and DB-05 grant one one-way paid claim to competing reconcilers', async () => {
    const fixture = await createJobFixture();
    cleanups.push(fixture.cleanup);
    const job = createTestJob(fixture.repository, 'claim');
    const claims = await Promise.all([
      Promise.resolve(fixture.repository.claimSubmission(job.id, 'worker-a', 60_000)),
      Promise.resolve(fixture.repository.claimSubmission(job.id, 'worker-b', 60_000))
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(fixture.repository.get(job.id)?.localPhase).toBe('submitting');
  });

  test('JOB-03 freezes expired possible transmission and creates a linked explicit retry', async () => {
    const fixture = await createJobFixture();
    cleanups.push(fixture.cleanup);
    const job = createTestJob(fixture.repository, 'ambiguous');
    const claim = fixture.repository.claimSubmission(job.id, 'worker', 1000);
    if (!claim) throw new Error('claim missing');
    fixture.repository.markSubmissionTransmitted(job.id, claim.token);
    fixture.setNow(new Date('2026-07-15T12:00:02Z'));
    expect(fixture.repository.claimSubmission(job.id, 'worker-2', 1000)).toBeNull();
    expect(fixture.repository.get(job.id)).toMatchObject({
      localPhase: 'requires_attention',
      attentionCode: 'submission_unknown',
      remoteStatus: 'unknown'
    });
    const retry = fixture.repository.retryAmbiguous(job.id);
    expect(retry.retryOfJobId).toBe(job.id);
    expect(retry.id).not.toBe(job.id);
  });

  test('JOB-09 safely reclaims expired owner-token leases and rejects stale completion', async () => {
    const fixture = await createJobFixture();
    cleanups.push(fixture.cleanup);
    const first = fixture.repository.claimWork('poll', 'job-1', 'a', 1000);
    expect(first).not.toBeNull();
    expect(fixture.repository.claimWork('poll', 'job-1', 'b', 1000)).toBeNull();
    fixture.setNow(new Date('2026-07-15T12:00:02Z'));
    const second = fixture.repository.claimWork('poll', 'job-1', 'b', 1000);
    expect(second).toMatchObject({ owner: 'b', attempt: 2 });
    if (!first || !second) throw new Error('work claim missing');
    expect(fixture.repository.releaseWork(first)).toBe(false);
    expect(fixture.repository.releaseWork(second)).toBe(true);
    for (const type of ['download', 'cleanup'] as const) {
      const claim = fixture.repository.claimWork(type, `${type}-1`, 'worker', 1000);
      if (!claim) throw new Error('work claim missing');
      expect(fixture.repository.releaseWork(claim)).toBe(true);
    }
  });

  test('JOB-02 rejects credential-like payload fields before creating an intent', async () => {
    const fixture = await createJobFixture();
    cleanups.push(fixture.cleanup);
    expect(() =>
      fixture.repository.create({
        workflow: 'text-to-image',
        publicModelId: 'model',
        guidedRequest: {},
        normalizedPayload: { model: 'model', input: { api_key: 'forbidden' } }
      })
    ).toThrow('credential');
    expect(fixture.repository.list()).toHaveLength(0);
  });

  test('JOB-05 only an authoritative status response sets remote failed', async () => {
    const fixture = await createJobFixture();
    cleanups.push(fixture.cleanup);
    const job = createTestJob(fixture.repository, 'remote');
    const claim = fixture.repository.claimSubmission(job.id, 'worker', 1000);
    if (!claim) throw new Error('claim missing');
    fixture.repository.markSubmissionTransmitted(job.id, claim.token);
    fixture.repository.acknowledgeSubmission(job.id, claim.token, {
      taskId: 'task-1',
      statusRaw: 'not_started',
      status: 'not_started',
      createdTime: 'now'
    });
    fixture.repository.recordPollFailure(job.id, 'network_failure', true);
    expect(fixture.repository.get(job.id)?.remoteStatus).toBe('not_started');
    fixture.repository.applyStatus(
      job.id,
      {
        taskId: 'task-1',
        statusRaw: 'failed',
        status: 'failed',
        creditsAmount: 2,
        files: [],
        createdTime: 'now',
        progress: null,
        errorMessage: 'provider failed'
      },
      1000
    );
    expect(fixture.repository.get(job.id)).toMatchObject({
      remoteStatus: 'failed',
      failureDomain: 'remote_generation',
      localPhase: 'complete'
    });
  });
});
