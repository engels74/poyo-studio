import { RequestSecurityError } from '../platform/request-security';
import { PoyoError } from '../poyo/errors';
export function jobHttpError(error: unknown): Response {
  if (error instanceof RequestSecurityError)
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  if (error instanceof PoyoError)
    return Response.json(
      { error: error.toSafeDto() },
      { status: error.httpStatus && error.httpStatus >= 400 ? error.httpStatus : 400 }
    );
  return Response.json(
    { error: { code: 'job_request_failed', message: 'The job request could not be completed.' } },
    { status: 400 }
  );
}
