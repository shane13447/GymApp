const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';
const ALLOWED_METHODS = 'POST, OPTIONS';

/**
 * Read an environment variable, supporting both the Deno runtime and a
 * Node/process fallback, returning an empty string when unset.
 *
 * @param {string} key - The environment variable name.
 * @returns {string} The variable's value, or an empty string if not set.
 */
const getEnvValue = (key: string): string => {
  const denoGlobal = (globalThis as { Deno?: { env?: { get: (name: string) => string | undefined } } }).Deno;
  if (denoGlobal?.env) {
    return denoGlobal.env.get(key) ?? '';
  }

  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] ?? '';
  }

  return '';
};

/**
 * Parse the comma-separated COACH_PROXY_ALLOWED_ORIGINS env var into a set of
 * trimmed, non-empty origins.
 *
 * @returns {Set<string>} The configured allowed origins (empty when unset).
 */
const parseAllowedOrigins = (): Set<string> => {
  const raw = getEnvValue('COACH_PROXY_ALLOWED_ORIGINS');
  return new Set(
    raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
};

/**
 * Compute CORS headers for a request, honouring the configured origin
 * allowlist. With no Origin header, allows `*`; with an allowlist, echoes the
 * origin only if permitted (otherwise `null`); with no allowlist, echoes the
 * request origin.
 *
 * @param {Request} request - The incoming request.
 * @returns {HeadersInit} The CORS response headers.
 */
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

/**
 * Build a JSON Response with appropriate CORS and content-type headers,
 * deriving CORS headers from the request when provided or using permissive
 * defaults otherwise.
 *
 * @param {unknown} body - The response body to JSON-serialize.
 * @param {number} [status] - The HTTP status code (defaults to 200).
 * @param {Request} [request] - Optional request used to compute CORS headers.
 * @returns {Response} The constructed JSON response.
 */
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
