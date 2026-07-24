import { describe, expect, test } from 'bun:test';
import { shouldRefreshJobDetail } from '../../../src/lib/features/library/job-detail-events';

const availabilityEventTypes = [
  'download.started',
  'download.verified',
  'output.local_file_removed',
  'output.local_metadata_removed',
  'output.local_both_removed'
];

function event(jobId: string, eventType: string): string {
  return JSON.stringify({ jobId, eventType });
}

describe('job detail durable event refreshes', () => {
  test('refreshes for every valid event belonging to the current job', () => {
    expect(shouldRefreshJobDetail(event('current', 'job.complete'), 'current', 'image')).toBe(true);
    expect(shouldRefreshJobDetail(event('current', 'status.observed'), 'current', 'video')).toBe(
      true
    );
  });

  test('refreshes image navigation for unrelated output availability changes', () => {
    for (const eventType of availabilityEventTypes) {
      expect(shouldRefreshJobDetail(event('other', eventType), 'current', 'image')).toBe(true);
    }
  });

  test('ignores ordinary lifecycle events from unrelated jobs', () => {
    expect(shouldRefreshJobDetail(event('other', 'job.complete'), 'current', 'image')).toBe(false);
    expect(shouldRefreshJobDetail(event('other', 'status.observed'), 'current', 'image')).toBe(
      false
    );
  });

  test('does not refresh video details for unrelated output availability changes', () => {
    for (const eventType of availabilityEventTypes) {
      expect(shouldRefreshJobDetail(event('other', eventType), 'current', 'video')).toBe(false);
    }
  });

  test('ignores malformed event payloads', () => {
    expect(shouldRefreshJobDetail('{', 'current', 'image')).toBe(false);
    expect(shouldRefreshJobDetail('null', 'current', 'image')).toBe(false);
    expect(shouldRefreshJobDetail(JSON.stringify({ jobId: 'current' }), 'current', 'image')).toBe(
      false
    );
    expect(
      shouldRefreshJobDetail(
        JSON.stringify({ jobId: 'current', eventType: 123 }),
        'current',
        'image'
      )
    ).toBe(false);
  });
});
