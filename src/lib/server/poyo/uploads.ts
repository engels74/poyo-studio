import { PoyoError } from './errors';
import type {
  Base64Upload,
  LocalFileUpload,
  RemoteUrlUpload,
  UploadMethod,
  UploadOptions,
  UploadSource
} from './types';

export const POYO_STREAM_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const POYO_BASE64_RECOMMENDED_MAX_BYTES = 5 * 1024 * 1024;

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const videoTypes = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska'
]);

function uploadValidation(
  message: string,
  operation: 'upload_url' | 'upload_base64' | 'upload_stream'
) {
  return new PoyoError({
    category: 'upload',
    technicalCode: 'local_upload_validation',
    message,
    retryable: false,
    operation
  });
}

function containsControlCharacters(value: string): boolean {
  return [...value].some((character) => character.charCodeAt(0) < 32);
}

function validateOptions(
  options: UploadOptions,
  operation: 'upload_url' | 'upload_base64' | 'upload_stream'
) {
  if (options.fileName !== undefined) {
    if (
      options.fileName.length === 0 ||
      options.fileName.length > 255 ||
      options.fileName === '.' ||
      options.fileName === '..' ||
      containsControlCharacters(options.fileName) ||
      options.fileName.includes('/') ||
      options.fileName.includes('\\')
    ) {
      throw uploadValidation('The upload filename is unsafe.', operation);
    }
  }
  if (options.uploadPath !== undefined) {
    const segments = options.uploadPath.split('/');
    if (
      options.uploadPath.length === 0 ||
      options.uploadPath.length > 512 ||
      options.uploadPath.startsWith('/') ||
      options.uploadPath.includes('\\') ||
      containsControlCharacters(options.uploadPath) ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      throw uploadValidation('The upload path is unsafe.', operation);
    }
  }
}

function blockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (
    host === '::' ||
    host === '::1' ||
    host.startsWith('fe80:') ||
    (host.startsWith('fc') && host.includes(':')) ||
    (host.startsWith('fd') && host.includes(':')) ||
    host.startsWith('::ffff:')
  ) {
    return true;
  }
  const octets = host.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }
  const [first = -1, second = -1] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function validateRemoteUrl(source: RemoteUrlUpload): void {
  validateOptions(source, 'upload_url');
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw uploadValidation('The remote upload URL is invalid.', 'upload_url');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    blockedHost(url.hostname)
  ) {
    throw uploadValidation('The remote upload must use a public HTTP(S) URL.', 'upload_url');
  }
  if (source.mimeType && !imageTypes.has(source.mimeType.toLowerCase())) {
    throw uploadValidation(
      'Poyo URL upload supports JPEG, PNG, GIF, and WebP images only.',
      'upload_url'
    );
  }
}

function base64Bytes(data: string): number {
  const raw = data.startsWith('data:') ? data.slice(data.indexOf(',') + 1) : data;
  const padding = raw.endsWith('==') ? 2 : raw.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((raw.length * 3) / 4) - padding);
}

export function validateBase64(source: Base64Upload): number {
  validateOptions(source, 'upload_base64');
  if (/\s/.test(source.data)) {
    throw uploadValidation('Base64 upload data must not contain whitespace.', 'upload_base64');
  }
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(source.data);
  const raw = match?.[2] ?? source.data;
  const mimeType = match?.[1] ?? source.mimeType;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length === 0 || raw.length % 4 !== 0) {
    throw uploadValidation('The base64 upload is not valid base64 data.', 'upload_base64');
  }
  if (mimeType && !imageTypes.has(mimeType.toLowerCase())) {
    throw uploadValidation(
      'Poyo base64 upload supports JPEG, PNG, GIF, and WebP images only.',
      'upload_base64'
    );
  }
  const size = source.sizeBytes ?? base64Bytes(source.data);
  if (size <= 0) throw uploadValidation('The base64 upload is empty.', 'upload_base64');
  if (size > POYO_BASE64_RECOMMENDED_MAX_BYTES) {
    throw uploadValidation(
      'Large inputs must use streaming upload instead of base64.',
      'upload_base64'
    );
  }
  return size;
}

export function validateLocalFile(source: LocalFileUpload): void {
  validateOptions(source, 'upload_stream');
  if (source.sizeBytes <= 0 || source.file.size <= 0) {
    throw uploadValidation('The local upload file is empty.', 'upload_stream');
  }
  if (source.sizeBytes !== source.file.size) {
    throw uploadValidation(
      'The local upload size metadata does not match the file.',
      'upload_stream'
    );
  }
  const type = source.mimeType.toLowerCase();
  if (source.file.type && source.file.type.toLowerCase() !== type) {
    throw uploadValidation(
      'The local upload MIME metadata does not match the file.',
      'upload_stream'
    );
  }
  const supported = source.mediaKind === 'image' ? imageTypes.has(type) : videoTypes.has(type);
  if (!supported)
    throw uploadValidation('The local file format is not supported by Poyo.', 'upload_stream');
  if (source.mediaKind === 'video' && source.sizeBytes > POYO_STREAM_VIDEO_MAX_BYTES) {
    throw uploadValidation('Poyo streaming video uploads are limited to 100 MB.', 'upload_stream');
  }
}

export function selectUploadMethod(source: UploadSource): UploadMethod {
  if (source.kind === 'remote-url') {
    validateRemoteUrl(source);
    return 'url';
  }
  if (source.kind === 'base64') {
    validateBase64(source);
    return 'base64';
  }
  validateLocalFile(source);
  return 'stream';
}

export function buildUrlUploadBody(source: RemoteUrlUpload): Record<string, string> {
  validateRemoteUrl(source);
  return {
    file_url: source.url,
    ...(source.uploadPath ? { upload_path: source.uploadPath } : {}),
    ...(source.fileName ? { file_name: source.fileName } : {})
  };
}

export function buildBase64UploadBody(source: Base64Upload): Record<string, string> {
  validateBase64(source);
  return {
    base64_data: source.data,
    ...(source.uploadPath ? { upload_path: source.uploadPath } : {}),
    ...(source.fileName ? { file_name: source.fileName } : {})
  };
}

export function buildStreamUploadBody(source: LocalFileUpload): FormData {
  validateLocalFile(source);
  const form = new FormData();
  form.append('file', source.file, source.fileName ?? 'upload');
  if (source.uploadPath) form.append('upload_path', source.uploadPath);
  if (source.fileName) form.append('file_name', source.fileName);
  return form;
}
