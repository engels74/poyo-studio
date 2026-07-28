import { afterEach, describe, expect, test } from 'bun:test';
import { createViewerSequenceHandler } from '../../../src/lib/server/library/viewer-sequence-handler';
import { createJobFixture } from '../../helpers/job-fixture';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

async function handlerFixture() {
  const fixture = await createJobFixture();
  cleanups.push(fixture.cleanup);
  fixture.database
    .query(
      `INSERT INTO jobs(id,workflow,public_model_id,local_phase,remote_status,failure_domain,guided_request_json,actual_payload_json,prompt_text,search_text,correlation_id,created_at,updated_at,completed_at)
       VALUES ('handler-job','text-to-image','flux-schnell','complete','finished','none','{}','{}','safe prompt','safe prompt','handler','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`
    )
    .run();
  fixture.database
    .query(
      `INSERT INTO job_outputs(id,job_id,output_order,media_kind,remote_url,local_path,content_type,byte_size,download_state,favorite,pinned,created_at,verified_at)
       VALUES ('handler-output','handler-job',0,'image','https://private.example/file','/private/media/file.png','image/png',123,'verified',0,0,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`
    )
    .run();
  return fixture;
}

function event(url: string, init: RequestInit = {}) {
  const request = new Request(url, { method: 'GET', ...init });
  return { request, url: new URL(url) };
}

describe('viewer sequence handler factory', () => {
  test('rejects method, origin, and malformed bounded input before database resolution', async () => {
    let resolutions = 0;
    const handler = createViewerSequenceHandler({
      resolveDatabase: () => {
        resolutions += 1;
        throw new Error('database must not resolve');
      },
      tokenContext: {
        secret: new TextEncoder().encode('handler-test-secret'),
        nonce: 'handler-test'
      }
    });
    const forbidden = await handler(
      event('https://studio.test/api/library/viewer-sequence', {
        headers: { origin: 'https://attacker.test' }
      })
    );
    expect(forbidden.status).toBe(403);
    const malformed = await handler(
      event('https://studio.test/api/library/viewer-sequence?limit=201')
    );
    expect(malformed.status).toBe(400);
    const duplicate = await handler(
      event('https://studio.test/api/library/viewer-sequence?q=a&q=b')
    );
    expect(duplicate.status).toBe(400);
    const controller = new AbortController();
    controller.abort();
    const aborted = await handler(
      event('https://studio.test/api/library/viewer-sequence', { signal: controller.signal })
    );
    expect(aborted.status).toBe(499);
    const method = await handler({
      request: new Request('https://studio.test/api/library/viewer-sequence', { method: 'POST' }),
      url: new URL('https://studio.test/api/library/viewer-sequence')
    });
    expect(method.status).toBe(405);
    expect(resolutions).toBe(0);
  });
  test('rejects impossible calendar filters before database resolution', async () => {
    let resolutions = 0;
    const handler = createViewerSequenceHandler({
      resolveDatabase: () => {
        resolutions += 1;
        throw new Error('database must not resolve');
      },
      tokenContext: {
        secret: new TextEncoder().encode('handler-test-secret'),
        nonce: 'handler-test'
      }
    });

    for (const filter of ['dateFrom=2025-02-29', 'dateTo=2026-04-31']) {
      const response = await handler(
        event(`https://studio.test/api/library/viewer-sequence?${filter}`)
      );
      expect(response.status).toBe(400);
    }

    expect(resolutions).toBe(0);
  });
  test('does not publish sequence responses with impossible timestamps', async () => {
    const fixture = await handlerFixture();
    const handler = createViewerSequenceHandler({
      resolveDatabase: () => fixture.database,
      tokenContext: {
        secret: new TextEncoder().encode('handler-test-secret'),
        nonce: 'handler-test'
      }
    });

    for (const createdAt of ['2025-02-29T00:00:00.000Z', '2026-01-01T24:00:00.000Z']) {
      fixture.database
        .query('UPDATE jobs SET created_at = ? WHERE id = ?')
        .run(createdAt, 'handler-job');
      const response = await handler(
        event('https://studio.test/api/library/viewer-sequence?limit=1')
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'viewer_sequence_failed' });
    }
  });

  test('returns bounded, redacted same-origin sequence responses and maps changed snapshots', async () => {
    const fixture = await handlerFixture();
    const handler = createViewerSequenceHandler({
      resolveDatabase: () => fixture.database,
      tokenContext: {
        secret: new TextEncoder().encode('handler-test-secret'),
        nonce: 'handler-test'
      }
    });
    const first = await handler(event('https://studio.test/api/library/viewer-sequence?limit=1'));
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('private, no-store');
    expect(first.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(first.headers.get('x-content-type-options')).toBe('nosniff');
    const page = (await first.json()) as {
      items: Array<Record<string, unknown>>;
      snapshot: string;
      total: number;
    };
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      outputId: 'handler-output',
      mediaUrl: '/api/media/handler-output'
    });
    expect(JSON.stringify(page)).not.toContain('/private/media');
    expect(JSON.stringify(page)).not.toContain('https://private.example');
    expect(JSON.stringify(page)).not.toContain('byte_size');

    const conflict = await handler(
      event(
        `https://studio.test/api/library/viewer-sequence?limit=1&cursor=bad&snapshot=${encodeURIComponent(page.snapshot)}`
      )
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: 'viewer_sequence_changed' });
  });
});
