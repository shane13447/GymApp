const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';
const ALLOWED_METHODS = 'POST, OPTIONS';

const parseAllowedOrigins = (): Set<string> => {
  const raw = Deno.env.get('COACH_PROXY_ALLOWED_ORIGINS') ?? '';
  return new Set(
    raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
};

export const corsHeadersForRequest = (request: Request): HeadersInit => {
  const requestOrigin = request.headers.get('origin')?.trim();
  const allowedOrigins = parseAllowedOrigins();
  const hasAllowlist = allowedOrigins.size > 0;

  const allowOrigin = !requestOrigin
    ? '*'
    : hasAllowlist
      ? (allowedOrigins.has(requestOrigin) ? requestOrigin : 'null')
      : requestOrigin;

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    Vary: 'Origin',
  };
};

export const jsonResponse = (body: unknown, status = 200, request?: Request): Response => {
  const corsHeaders = request
    ? corsHeadersForRequest(request)
    : {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Allow-Methods': ALLOWED_METHODS,
      };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
};
