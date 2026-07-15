import { mkdir, rename, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { AppPaths } from '../platform/app-paths';
import { resolvePathWithin } from '../platform/app-paths';
import { RequestSecurityError } from '../platform/request-security';
import { validateLocalFile } from '../poyo/uploads';

const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
const REQUEST_MAX_BYTES = 101 * 1024 * 1024;

const extensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/x-matroska': '.mkv'
};

export interface LocalSourceIntake {
  id: string;
  originalName: string;
  mediaKind: 'image' | 'video';
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  signature: string;
  createdAt: string;
  localPath: string;
}

function assertSameOriginMultipart(request: Request): void {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (!origin)
    throw new RequestSecurityError('origin_required', 403, 'An Origin header is required.');
  if (origin !== expectedOrigin)
    throw new RequestSecurityError('origin_mismatch', 403, 'Request origin does not match.');
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new RequestSecurityError('cross_site', 403, 'Cross-site requests are not allowed.');
  if (!/^multipart\/form-data(?:\s*;|$)/i.test(request.headers.get('content-type') ?? ''))
    throw new RequestSecurityError(
      'invalid_content_type',
      415,
      'Source intake requires multipart/form-data.'
    );
  const declared = request.headers.get('content-length');
  if (declared && (!Number.isSafeInteger(Number(declared)) || Number(declared) > REQUEST_MAX_BYTES))
    throw new RequestSecurityError('body_too_large', 413, 'Source upload is too large.');
}

function hasSignature(type: string, bytes: Uint8Array): boolean {
  const ascii = (start: number, end: number) => new TextDecoder().decode(bytes.slice(start, end));
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (type === 'image/png') return ascii(1, 4) === 'PNG';
  if (type === 'image/gif') return ascii(0, 3) === 'GIF';
  if (type === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (type === 'video/mp4' || type === 'video/quicktime') return ascii(4, 8) === 'ftyp';
  if (type === 'video/x-msvideo') return ascii(0, 4) === 'RIFF' && ascii(8, 11) === 'AVI';
  if (type === 'video/webm' || type === 'video/x-matroska')
    return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

function safeOriginalName(value: string): string {
  const name = Array.from(basename(value))
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .trim();
  return name && name !== '.' && name !== '..' ? name.slice(0, 255) : 'source';
}

async function writeStreamed(file: File, destination: string): Promise<string> {
  const writer = Bun.file(destination).writer();
  const reader = file.stream().getReader();
  const hasher = new Bun.CryptoHasher('sha256');
  let written = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hasher.update(value);
      written += value.byteLength;
      writer.write(value);
    }
    writer.flush();
    writer.end();
    if (written !== file.size) throw new Error('The local source copy is incomplete.');
    return hasher.digest('hex');
  } catch (error) {
    writer.end();
    throw error;
  }
}

export async function intakeLocalSource(
  request: Request,
  paths: AppPaths
): Promise<LocalSourceIntake> {
  assertSameOriginMultipart(request);
  const form = await request.formData();
  const file = form.get('file');
  const requestedKind = form.get('mediaKind');
  if (!(file instanceof File)) throw new Error('Choose one local source file.');
  if (requestedKind !== 'image' && requestedKind !== 'video')
    throw new Error('Source media kind must be image or video.');
  if (requestedKind === 'image' && file.size > IMAGE_MAX_BYTES)
    throw new Error('Local image sources are limited to 25 MB.');
  const type = file.type.toLowerCase();
  const extension = extensions[type];
  if (!extension) throw new Error('The selected local file format is not supported.');
  validateLocalFile({
    kind: 'local-file',
    file,
    mimeType: type,
    sizeBytes: file.size,
    mediaKind: requestedKind,
    fileName: safeOriginalName(file.name)
  });
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!hasSignature(type, header))
    throw new Error('The local source signature does not match its type.');

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const bucket = createdAt.slice(0, 7);
  const directory = resolvePathWithin(paths.uploads, bucket);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = resolvePathWithin(paths.uploads, join(bucket, `${id}${extension}`));
  const temporary = resolvePathWithin(paths.temporary, `${id}.part`);
  let checksum: string;
  try {
    checksum = await writeStreamed(file, temporary);
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return {
    id,
    originalName: safeOriginalName(file.name),
    mediaKind: requestedKind,
    mimeType: type,
    sizeBytes: file.size,
    checksum,
    signature: Array.from(header, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    createdAt,
    localPath: destination
  };
}
