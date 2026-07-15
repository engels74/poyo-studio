import { mkdir, open, rename, rm } from 'node:fs/promises';
import { basename, dirname, extname } from 'node:path';
import { resolvePathWithin, type AppPaths } from '../platform/app-paths';
import { safeErrorSummary } from '../diagnostics/redaction';
import type { JobRepository } from './repository';
import type { OutputRecord } from './types';

const extensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov'
};
function safeName(output: OutputRecord): string {
  const remote = output.remoteUrl ? basename(new URL(output.remoteUrl).pathname) : '';
  const clean = remote
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 100);
  const fallback = `output-${output.outputOrder}${extensions[output.contentType ?? ''] ?? (output.mediaKind === 'video' ? '.mp4' : '.bin')}`;
  const name = clean && extname(clean) ? clean : fallback;
  return `${output.outputOrder}-${output.id.slice(0, 8)}-${name}`;
}
function signature(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 16))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
function validSignature(type: string | null, bytes: Uint8Array): boolean {
  if (!type) return true;
  const hex = signature(bytes);
  const ascii = new TextDecoder().decode(bytes.slice(0, 12));
  if (type === 'image/png') return hex.startsWith('89504e470d0a1a0a');
  if (type === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (type === 'image/gif') return ascii.startsWith('GIF8');
  if (type === 'image/webp') return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
  if (type === 'video/mp4' || type === 'video/quicktime') return ascii.slice(4, 8) === 'ftyp';
  if (type === 'video/webm') return hex.startsWith('1a45dfa3');
  return true;
}

export interface OutputDownloaderOptions {
  repository: JobRepository;
  paths: Pick<AppPaths, 'media' | 'temporary'>;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  maxBytes?: number;
}
export class OutputDownloader {
  private readonly fetcher;
  private readonly maxBytes: number;
  constructor(private readonly options: OutputDownloaderOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.maxBytes = options.maxBytes ?? 2 * 1024 * 1024 * 1024;
  }
  async download(outputId: string): Promise<OutputRecord> {
    const output = this.options.repository.output(outputId);
    if (!output?.remoteUrl) throw new Error('Download output is unavailable.');
    const attempt = this.options.repository.startDownload(outputId);
    const directory = resolvePathWithin(this.options.paths.media, output.jobId);
    const destination = resolvePathWithin(directory, safeName(output));
    const temporary = resolvePathWithin(directory, `.${output.id}.${crypto.randomUUID()}.partial`);
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await mkdir(dirname(temporary), { recursive: true, mode: 0o700 });
      const response = await this.fetcher(output.remoteUrl, { redirect: 'manual' });
      if (response.status === 404 || response.status === 410)
        throw Object.assign(new Error('Remote output has expired.'), { expired: true });
      if (!response.ok || !response.body)
        throw new Error(`Remote download failed with HTTP ${response.status}.`);
      const declaredHeader = response.headers.get('content-length');
      const declared = declaredHeader === null ? null : Number(declaredHeader);
      if (declared !== null && Number.isFinite(declared) && declared > this.maxBytes)
        throw new Error('Remote output exceeds the local download limit.');
      handle = await open(temporary, 'wx', 0o600);
      const reader = response.body.getReader();
      const hasher = new Bun.CryptoHasher('sha256');
      let total = 0;
      let prefix = new Uint8Array();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > this.maxBytes)
          throw new Error('Remote output exceeds the local download limit.');
        if (prefix.length < 16) {
          const needed = 16 - prefix.length;
          const merged = new Uint8Array(prefix.length + Math.min(needed, value.length));
          merged.set(prefix);
          merged.set(value.slice(0, needed), prefix.length);
          prefix = merged;
        }
        hasher.update(value);
        await handle.write(value);
      }
      if (total === 0) throw new Error('Remote output was empty.');
      if (declared !== null && Number.isFinite(declared) && declared >= 0 && declared !== total)
        throw new Error('Remote output length did not match Content-Length.');
      if (output.byteSize !== null && output.byteSize !== total)
        throw new Error('Remote output length did not match Poyo metadata.');
      const contentType =
        (response.headers.get('content-type') ?? output.contentType)?.split(';')[0] ?? null;
      if (output.contentType && contentType && output.contentType !== contentType)
        throw new Error('Remote output Content-Type did not match metadata.');
      if (!validSignature(contentType, prefix))
        throw new Error('Remote output signature did not match its media type.');
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporary, destination);
      this.options.repository.verifyDownload(outputId, attempt, {
        path: destination,
        size: total,
        checksum: hasher.digest('hex'),
        signature: signature(prefix),
        contentType
      });
      const verified = this.options.repository.output(outputId);
      if (!verified) throw new Error('Verified output was not found.');
      return verified;
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
      this.options.repository.failDownload(
        outputId,
        attempt,
        safeErrorSummary(error),
        (error as { expired?: boolean }).expired === true
      );
      throw error;
    }
  }
}
