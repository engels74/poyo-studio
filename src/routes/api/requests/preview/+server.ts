import { RegistryValidationError } from '$lib/features/registry/normalize';
import { normalizeRegistryRequest } from '$lib/features/registry/normalize-registry';
import type {
  ExpertOverride,
  GuidedImageRequest,
  GuidedVideoRequest
} from '$lib/features/registry/types';
import { readSameOriginJson, RequestSecurityError } from '$lib/server/platform/request-security';
import type { RequestHandler } from './$types';
type PreviewBody = {
  entryKey: string;
  values: GuidedImageRequest | GuidedVideoRequest;
  expertOverrides?: ExpertOverride[];
};
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await readSameOriginJson<PreviewBody>(request, { maxBytes: 256 * 1024 });
    const preview = normalizeRegistryRequest(
      body.entryKey,
      body.values,
      body.expertOverrides ?? []
    );
    return Response.json(preview);
  } catch (error) {
    if (error instanceof RequestSecurityError)
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    if (error instanceof RegistryValidationError)
      return Response.json(
        { error: { code: 'registry_validation', issues: error.issues } },
        { status: 422 }
      );
    return Response.json(
      { error: { code: 'preview_failed', message: 'The request preview could not be created.' } },
      { status: 400 }
    );
  }
};
