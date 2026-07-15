export interface MockPoyoRequest {
  method: string;
  path: string;
  authorizationScheme: string | null;
  contentType: string | null;
  bodyKind: 'none' | 'json' | 'multipart' | 'text';
  json: unknown;
  multipart: Record<string, string | { name: string; size: number; type: string }> | null;
}

export interface MockPoyoResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export type MockPoyoHandler = (
  request: MockPoyoRequest,
  index: number
) => MockPoyoResponse | Promise<MockPoyoResponse>;

function sanitizeJson(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source).map(([key, entry]) => [
      key,
      key === 'base64_data' && typeof entry === 'string'
        ? `[REDACTED_MEDIA:${entry.length}]`
        : sanitizeJson(entry)
    ])
  );
}

async function captureRequest(request: Request): Promise<MockPoyoRequest> {
  const contentType = request.headers.get('content-type');
  const authorization = request.headers.get('authorization');
  let bodyKind: MockPoyoRequest['bodyKind'] = 'none';
  let json: unknown = null;
  let multipart: MockPoyoRequest['multipart'] = null;

  if (contentType?.includes('application/json')) {
    bodyKind = 'json';
    json = sanitizeJson(await request.json());
  } else if (contentType?.includes('multipart/form-data')) {
    bodyKind = 'multipart';
    multipart = {};
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') multipart[key] = value;
      else {
        const file = value as unknown as File;
        multipart[key] = { name: file.name, size: file.size, type: file.type };
      }
    }
  } else if (request.body) {
    bodyKind = 'text';
    await request.text();
  }

  return {
    method: request.method,
    path: new URL(request.url).pathname,
    authorizationScheme: authorization?.split(' ', 1)[0] ?? null,
    contentType,
    bodyKind,
    json,
    multipart
  };
}

export async function startMockPoyoServer(handlers: MockPoyoHandler | MockPoyoHandler[]): Promise<{
  baseUrl: string;
  requests: MockPoyoRequest[];
  stop: () => Promise<void>;
}> {
  const requests: MockPoyoRequest[] = [];
  const sequence = Array.isArray(handlers) ? handlers : [handlers];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (incoming) => {
      const request = await captureRequest(incoming);
      const index = requests.push(request) - 1;
      const handler = sequence[Math.min(index, sequence.length - 1)];
      if (!handler) return Response.json({ detail: 'Missing mock response' }, { status: 500 });
      const response = await handler(request, index);
      return Response.json(response.body ?? null, {
        status: response.status ?? 200,
        ...(response.headers ? { headers: response.headers } : {})
      });
    }
  });

  return {
    baseUrl: `http://${server.hostname}:${server.port}`,
    requests,
    stop: async () => server.stop(true)
  };
}
