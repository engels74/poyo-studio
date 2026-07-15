import { afterEach, describe, expect, test } from 'bun:test';
import {
  createJobEventStream,
  decodeEventChunk,
  initialJobEvents
} from '../../../src/lib/server/jobs/events';
import { createJobFixture, createTestJob } from '../../helpers/job-fixture';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});
describe('durable job SSE protocol', () => {
  test('JOB-08/INT-10 snapshots with a watermark then replays unseen durable IDs once', async () => {
    const fixture = await createJobFixture();
    cleanups.push(fixture.cleanup);
    const first = createTestJob(fixture.repository, 'event-1');
    const initial = initialJobEvents(fixture.repository, null);
    expect(initial.mode).toBe('snapshot');
    const snapshotChunk = initial.chunks[0];
    if (!snapshotChunk) throw new Error('snapshot missing');
    const snapshot = decodeEventChunk(snapshotChunk);
    expect(snapshot.event).toBe('snapshot');
    expect(snapshot.id).toBe(initial.cursor);
    fixture.repository.transition(first.id, 'submitting');
    const second = createTestJob(fixture.repository, 'event-2');
    const replay = initialJobEvents(fixture.repository, String(initial.cursor));
    const decoded = replay.chunks.map(decodeEventChunk);
    expect(replay.mode).toBe('replay');
    expect(decoded.map((event) => event.id)).toEqual([
      ...new Set(decoded.map((event) => event.id))
    ]);
    expect(decoded.every((event) => event.id > initial.cursor)).toBe(true);
    expect(decoded.some((event) => JSON.stringify(event.data).includes(second.id))).toBe(true);
  });
  test('SSE-01 invalid and compacted cursors fall back to a fresh SQLite snapshot', async () => {
    const fixture = await createJobFixture();
    cleanups.push(fixture.cleanup);
    createTestJob(fixture.repository, 'compact-1');
    createTestJob(fixture.repository, 'compact-2');
    fixture.database
      .query('DELETE FROM job_events WHERE event_id=(SELECT MIN(event_id) FROM job_events)')
      .run();
    for (const cursor of ['invalid', '0', '999999']) {
      const result = initialJobEvents(fixture.repository, cursor);
      expect(result.mode).toBe('snapshot');
      const chunk = result.chunks[0];
      if (!chunk) throw new Error('snapshot missing');
      const decoded = decodeEventChunk(chunk);
      expect(decoded.event).toBe('snapshot');
      expect(decoded.id).toBe(result.cursor);
      expect(JSON.stringify(decoded.data)).not.toContain('normalizedPayload');
    }
  });
  test('SSE-02 live delivery follows the durable database rather than process memory', async () => {
    const fixture = await createJobFixture();
    cleanups.push(fixture.cleanup);
    const controller = new AbortController();
    const reader = createJobEventStream(fixture.repository, null, controller.signal, 5).getReader();
    const initial = await reader.read();
    expect(decodeEventChunk(initial.value ?? new Uint8Array()).event).toBe('snapshot');
    const job = createTestJob(fixture.repository, 'live-event');
    const delivered = await reader.read();
    const event = decodeEventChunk(delivered.value ?? new Uint8Array());
    expect(event.event).toBe('job');
    expect(JSON.stringify(event.data)).toContain(job.id);
    controller.abort();
  });

  test('PERF-04 durable event replay is bounded and resumes from the returned cursor', async () => {
    const fixture = await createJobFixture();
    cleanups.push(fixture.cleanup);
    for (let index = 0; index < 520; index += 1) {
      createTestJob(fixture.repository, `bounded-${index}`);
    }

    const first = fixture.repository.eventsAfter(0);
    expect(first).toHaveLength(500);
    const cursor = first.at(-1)?.eventId;
    if (!cursor) throw new Error('Expected a replay cursor.');
    const remainder = fixture.repository.eventsAfter(cursor);
    expect(remainder).toHaveLength(20);
    expect(remainder.every((event) => event.eventId > cursor)).toBe(true);
  });
});
