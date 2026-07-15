import {
  IMAGE_PAGE_SLUGS,
  IMAGE_PUBLIC_IDS,
  IMAGE_REGISTRY
} from '../src/lib/features/registry/image-registry';
import { minimumValidRequest, normalizeImageRequest } from '../src/lib/features/registry/normalize';
import {
  minimumValidVideoRequest,
  normalizeVideoRequest
} from '../src/lib/features/registry/normalize-video';
import {
  VIDEO_AUDIT_RECORDS,
  VIDEO_CURRENT_ENTRIES,
  VIDEO_EXCLUDED_ENTRIES,
  VIDEO_PAGE_SLUGS,
  VIDEO_PUBLIC_IDS,
  VIDEO_REGISTRY
} from '../src/lib/features/registry/video-registry';

const errors: string[] = [];
const keys = new Set<string>();
for (const entry of IMAGE_REGISTRY.entries) {
  if (keys.has(entry.key)) errors.push(`duplicate key ${entry.key}`);
  keys.add(entry.key);
  if (!entry.provenance.markdownUrl || entry.provenance.sourceHash.length !== 64)
    errors.push(`missing provenance ${entry.key}`);
  try {
    const preview = normalizeImageRequest(entry.key, minimumValidRequest(entry));
    if (preview.request.model !== entry.publicModelId)
      errors.push(`adapter model mismatch ${entry.key}`);
  } catch (error) {
    errors.push(`${entry.key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (IMAGE_PAGE_SLUGS.length !== 22)
  errors.push(`expected 22 image pages, found ${IMAGE_PAGE_SLUGS.length}`);
if (IMAGE_PUBLIC_IDS.length !== 44)
  errors.push(`expected 44 public image IDs, found ${IMAGE_PUBLIC_IDS.length}`);
if (IMAGE_REGISTRY.sourceHash.length !== 64 || IMAGE_REGISTRY.manifestHash.length !== 64)
  errors.push('registry hashes are invalid');
for (const entry of VIDEO_CURRENT_ENTRIES) {
  if (keys.has(entry.key)) errors.push(`duplicate cross-modality key ${entry.key}`);
  keys.add(entry.key);
  if (!entry.provenance.markdownUrl || entry.provenance.sourceHash.length !== 64)
    errors.push(`missing video provenance ${entry.key}`);
  try {
    const preview = normalizeVideoRequest(entry.key, minimumValidVideoRequest(entry));
    if (preview.request.model !== entry.publicModelId)
      errors.push(`video adapter model mismatch ${entry.key}`);
  } catch (error) {
    errors.push(`${entry.key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (VIDEO_PAGE_SLUGS.length !== 35)
  errors.push(`expected 35 video pages, found ${VIDEO_PAGE_SLUGS.length}`);
if (VIDEO_PUBLIC_IDS.length !== 53)
  errors.push(`expected 53 video public IDs, found ${VIDEO_PUBLIC_IDS.length}`);
if (VIDEO_CURRENT_ENTRIES.length !== 121)
  errors.push(
    `expected 121 current video workflow variants, found ${VIDEO_CURRENT_ENTRIES.length}`
  );
if (
  VIDEO_EXCLUDED_ENTRIES.length !== 2 ||
  VIDEO_EXCLUDED_ENTRIES.some((entry) => entry.workflow !== 'avatar-video')
)
  errors.push('Kling Avatar 2.0 exclusion records are incomplete');
if (VIDEO_AUDIT_RECORDS.length !== 8)
  errors.push(`expected 8 video legacy/unindexed records, found ${VIDEO_AUDIT_RECORDS.length}`);
if (VIDEO_REGISTRY.sourceHash.length !== 64 || VIDEO_REGISTRY.manifestHash.length !== 64)
  errors.push('video registry hashes are invalid');
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log(
  `Registry valid: image=${IMAGE_REGISTRY.pageCount} pages/${IMAGE_REGISTRY.publicIdCount} IDs/${IMAGE_REGISTRY.entries.length} workflows; video=${VIDEO_REGISTRY.pageCount} pages/${VIDEO_REGISTRY.publicIdCount} IDs/${VIDEO_CURRENT_ENTRIES.length} current workflows/${VIDEO_EXCLUDED_ENTRIES.length} excluded; video audit=${VIDEO_AUDIT_RECORDS.length}; hashes=${IMAGE_REGISTRY.manifestHash},${VIDEO_REGISTRY.manifestHash}.`
);
