import { afterEach, describe, expect, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { intakeLocalSource } from '../../../src/lib/server/media/source-intake';
import { ensureAppPaths, resolveAppPaths } from '../../../src/lib/server/platform/app-paths';
import { createTemporaryDirectory } from '../../helpers/temporary-directory';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function fixture() {
  const temporary = await createTemporaryDirectory('poyo-source-');
  cleanups.push(temporary.cleanup);
  const paths = resolveAppPaths({
    environment: { PLS_APP_DATA_DIR: join(temporary.path, 'studio') },
    homeDirectory: temporary.path
  });
  await ensureAppPaths(paths);
  return paths;
}

function uploadRequest(bytes: Uint8Array, type = 'image/png', origin?: string): Request {
  const form = new FormData();
  form.set('mediaKind', 'image');
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  form.set('file', new File([buffer], '../unsafe-name.png', { type }));
  return new Request('http://127.0.0.1:5173/api/sources', {
    method: 'POST',
    headers: origin === undefined ? {} : { origin },
    body: form
  });
}

describe('local source intake', () => {
  test('UPLOAD-01 requires same origin, validates signatures and atomically retains a local source', async () => {
    const paths = await fixture();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    await expect(intakeLocalSource(uploadRequest(png), paths)).rejects.toMatchObject({
      code: 'origin_required',
      status: 403
    });
    await expect(
      intakeLocalSource(uploadRequest(png, 'image/png', 'https://attacker.test'), paths)
    ).rejects.toMatchObject({ code: 'origin_mismatch', status: 403 });
    const source = await intakeLocalSource(
      uploadRequest(png, 'image/png', 'http://127.0.0.1:5173'),
      paths
    );
    expect(source.originalName).toBe('unsafe-name.png');
    expect(source.localPath).toStartWith(paths.uploads);
    expect((await stat(source.localPath)).size).toBe(png.byteLength);
    expect(await Array.fromAsync(new Bun.Glob('*.part').scan(paths.temporary))).toEqual([]);
  });

  test('UPLOAD-02 rejects content whose signature disagrees with its declared type', async () => {
    const paths = await fixture();
    const request = uploadRequest(
      new TextEncoder().encode('not an image'),
      'image/png',
      'http://127.0.0.1:5173'
    );
    await expect(intakeLocalSource(request, paths)).rejects.toThrow('signature');
  });
});
