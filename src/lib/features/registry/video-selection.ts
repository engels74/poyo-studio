export const LEGACY_WAN_IMAGE_TO_VIDEO_KEY = 'wan2.7-image-to-video:frame-to-video';
export const WAN_IMAGE_TO_VIDEO_KEY = 'wan2.7-image-to-video:image-to-video';

export interface CanonicalVideoSelection {
  entryKey: string;
  workflow?: string;
  migrated: boolean;
}

function workflowFromKey(entryKey: string): string | undefined {
  const separator = entryKey.lastIndexOf(':');
  return separator > 0 && separator < entryKey.length - 1
    ? entryKey.slice(separator + 1)
    : undefined;
}

export function canonicalizeVideoSelection(
  entryKey: string,
  workflow?: string
): CanonicalVideoSelection | null {
  if (!entryKey.trim() || (workflow !== undefined && !workflow.trim())) return null;
  if (entryKey === LEGACY_WAN_IMAGE_TO_VIDEO_KEY) {
    if (workflow !== undefined && workflow !== 'frame-to-video') return null;
    return { entryKey: WAN_IMAGE_TO_VIDEO_KEY, workflow: 'image-to-video', migrated: true };
  }
  if (entryKey === WAN_IMAGE_TO_VIDEO_KEY) {
    if (workflow !== undefined && workflow !== 'image-to-video') return null;
    return { entryKey, workflow: 'image-to-video', migrated: false };
  }
  const keyWorkflow = workflowFromKey(entryKey);
  if (workflow !== undefined && keyWorkflow === undefined) return null;
  if (workflow !== undefined && keyWorkflow !== undefined && workflow !== keyWorkflow) return null;
  return {
    entryKey,
    ...(workflow === undefined ? {} : { workflow }),
    migrated: false
  };
}
