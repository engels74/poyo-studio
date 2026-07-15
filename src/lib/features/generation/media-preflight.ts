import type { InputRole } from '../registry/types';

export const LOCAL_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const LOCAL_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

export interface LocalFileDescriptor {
  name: string;
  type: string;
  size: number;
}

export interface BrowserMediaMetadata {
  width: number;
  height: number;
  durationSeconds?: number;
}

const formatMimeTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska'
};

function acceptedTypes(role: InputRole): Set<string> {
  return new Set(
    role.formats.map((format) =>
      format.includes('/')
        ? format.toLowerCase()
        : (formatMimeTypes[format.toLowerCase()] ?? format)
    )
  );
}

export function validateLocalFileSelection(
  role: InputRole,
  existingCount: number,
  files: readonly LocalFileDescriptor[]
): string[] {
  const issues: string[] = [];
  if (role.max !== null && existingCount + files.length > role.max) {
    issues.push(
      `${role.role} supports at most ${role.max} input${role.max === 1 ? '' : 's'}; remove an existing input or select fewer files.`
    );
  }
  const accepted = acceptedTypes(role);
  const maximum = role.mediaKind === 'image' ? LOCAL_IMAGE_MAX_BYTES : LOCAL_VIDEO_MAX_BYTES;
  for (const file of files) {
    if (file.size <= 0) issues.push(`${file.name} is empty.`);
    if (!accepted.has(file.type.toLowerCase())) {
      issues.push(
        `${file.name} has type ${file.type || 'unknown'}; choose ${role.formats.join(', ')}.`
      );
    }
    if (file.size > maximum) {
      issues.push(
        `${file.name} exceeds the ${role.mediaKind === 'image' ? '25 MB image' : '100 MB video'} upload limit.`
      );
    }
  }
  return issues;
}

function finitePositive(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function probeBrowserMedia(
  file: File,
  mediaKind: 'image' | 'video',
  timeoutMs = 8_000
): Promise<BrowserMediaMetadata | null> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<BrowserMediaMetadata | null>((resolve) => {
      let settled = false;
      const finish = (metadata: BrowserMediaMetadata | null): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(metadata);
      };
      const timeout = window.setTimeout(() => finish(null), timeoutMs);
      if (mediaKind === 'image') {
        const image = new Image();
        image.onload = () => {
          const width = finitePositive(image.naturalWidth);
          const height = finitePositive(image.naturalHeight);
          finish(width && height ? { width, height } : null);
        };
        image.onerror = () => finish(null);
        image.src = url;
        return;
      }
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const width = finitePositive(video.videoWidth);
        const height = finitePositive(video.videoHeight);
        const durationSeconds = finitePositive(video.duration);
        finish(width && height && durationSeconds ? { width, height, durationSeconds } : null);
      };
      video.onerror = () => finish(null);
      video.src = url;
      video.load();
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function mediaMetadataLabel(metadata: BrowserMediaMetadata): string {
  const dimensions = `${metadata.width} × ${metadata.height} px`;
  return metadata.durationSeconds === undefined
    ? dimensions
    : `${dimensions} · ${metadata.durationSeconds.toFixed(2)} s`;
}
