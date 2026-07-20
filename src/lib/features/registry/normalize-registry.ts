import { IMAGE_REGISTRY_ENTRIES } from './image-registry';
import { normalizeImageRequest } from './normalize';
import { normalizeVideoRequest } from './normalize-video';
import { canonicalizeVideoSelection } from './video-selection';
import type {
  ExpertOverride,
  GuidedImageRequest,
  GuidedVideoRequest,
  NormalizedPreview
} from './types';

export function normalizeRegistryRequest(
  entryKey: string,
  values: GuidedImageRequest | GuidedVideoRequest,
  overrides: readonly ExpertOverride[] = []
): NormalizedPreview {
  if (IMAGE_REGISTRY_ENTRIES.some((entry) => entry.key === entryKey))
    return normalizeImageRequest(entryKey, values as GuidedImageRequest, overrides);
  const selection = canonicalizeVideoSelection(entryKey);
  return normalizeVideoRequest(
    selection?.entryKey ?? entryKey,
    values as GuidedVideoRequest,
    overrides
  );
}
