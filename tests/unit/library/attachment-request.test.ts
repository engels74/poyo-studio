import { expect, spyOn, test } from 'bun:test';
import { downloadCopy } from '../../../src/lib/features/library/attachment-request';

test('reports request-token generation failures through the shared error callback', async () => {
  const randomUuid = spyOn(crypto, 'randomUUID').mockImplementation(() => {
    throw new Error('UUID generation unavailable');
  });
  let errorCalls = 0;

  try {
    await downloadCopy('output-id', { onerror: () => (errorCalls += 1) });
  } finally {
    randomUuid.mockRestore();
  }

  expect(errorCalls).toBe(1);
});
