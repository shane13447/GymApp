import { corsHeadersForRequest, jsonResponse } from '@/supabase/functions/_shared/cors';
import {
  classifyUpstreamHttpStatus,
  evaluateAuthMode,
  extractModelText,
  extractStrictToonCandidate,
  formatInvalidToonDiagnostics,
  formatProxyDebugLog,
  getBearerToken,
  isValidToonResponse,
  parseAuthModeFromValue,
  parseProviderFromValue,
  resolveProviderConfig,
} from '@/supabase/functions/coach-proxy/logic';
import { createCoachProxyHandler } from '@/supabase/functions/coach-proxy/handler';

const createEnvReader = (values: Record<string, string | undefined>) => (name: string): string | undefined => {
  return values[name];
};

const createHandler = (env: Record<string, string | undefined>, fetchImpl: typeof fetch) => {
  return createCoachProxyHandler({
    fetchImpl,
    readEnv: createEnvReader(env),
    corsHeadersForRequest,
    jsonResponse,
    parseAuthModeFromValue,
    getBearerToken,
    evaluateAuthMode,
    parseProviderFromValue,
    resolveProviderConfig,
    extractModelText,
    classifyUpstreamHttpStatus,
    isValidToonResponse,
    extractStrictToonCandidate,
    formatInvalidToonDiagnostics,
    formatProxyDebugLog,
  });
};

describe('coach proxy handler', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('returns 405 for non-POST methods', async () => {
    const handler = createHandler({ COACH_PROXY_AUTH_MODE: 'off' }, jest.fn() as unknown as typeof fetch);

    const response = await handler(new Request('https://proxy.example.com', { method: 'GET' }));
    expect(response.status).toBe(405);
  });

  it('returns 400 for invalid JSON body', async () => {
    const handler = createHandler(
      {
        COACH_PROXY_AUTH_MODE: 'off',
        OPENROUTER_API_KEY: 'or-key',
        OPENROUTER_MODEL: 'openai/gpt-4o-mini',
      },
      jest.fn() as unknown as typeof fetch,
    );

    const response = await handler(
      new Request('https://proxy.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not-valid-json',
      }),
    );

    expect(response.status).toBe(400);
  });

  it('returns 500 when provider config is missing for openrouter', async () => {
    const handler = createHandler(
      {
        COACH_PROXY_AUTH_MODE: 'off',
        COACH_MODEL_PROVIDER: 'openrouter',
      },
      jest.fn() as unknown as typeof fetch,
    );

    const response = await handler(
      new Request('https://proxy.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
      }),
    );

    expect(response.status).toBe(500);
  });

  it('uses openrouter provider by default when COACH_MODEL_PROVIDER is missing', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Q0:D1:Bench Press|80|8|3' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const handler = createHandler(
      {
        COACH_PROXY_AUTH_MODE: 'off',
        OPENROUTER_API_KEY: 'or-key',
        OPENROUTER_MODEL: 'openai/gpt-4o-mini',
      },
      fetchImpl,
    );

    const response = await handler(
      new Request('https://proxy.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = (fetchImpl as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('routes to deepseek when provider is deepseek', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Q0:D1:Bench Press|80|8|3' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const handler = createHandler(
      {
        COACH_PROXY_AUTH_MODE: 'off',
        COACH_MODEL_PROVIDER: 'deepseek',
        DEEPSEEK_API_KEY: 'deepseek-key',
      },
      fetchImpl,
    );

    const response = await handler(
      new Request('https://proxy.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = (fetchImpl as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
  });

  it('does not automatically fail over to deepseek when openrouter returns 503', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'upstream down' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const handler = createHandler(
      {
        COACH_PROXY_AUTH_MODE: 'off',
        COACH_MODEL_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: 'or-key',
        OPENROUTER_MODEL: 'openai/gpt-4o-mini',
        DEEPSEEK_API_KEY: 'deepseek-key',
      },
      fetchImpl,
    );

    const response = await handler(
      new Request('https://proxy.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
      }),
    );

    expect(response.status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = (fetchImpl as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('maps provider 429 and 5xx responses to 502', async () => {
    const fetch429 = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'rate limit' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const handler429 = createHandler(
      {
        COACH_PROXY_AUTH_MODE: 'off',
        OPENROUTER_API_KEY: 'or-key',
        OPENROUTER_MODEL: 'openai/gpt-4o-mini',
      },
      fetch429,
    );

    const response429 = await handler429(
      new Request('https://proxy.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
      }),
    );

    const fetch500 = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const handler500 = createHandler(
      {
        COACH_PROXY_AUTH_MODE: 'off',
        OPENROUTER_API_KEY: 'or-key',
        OPENROUTER_MODEL: 'openai/gpt-4o-mini',
      },
      fetch500,
    );

    const response500 = await handler500(
      new Request('https://proxy.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
      }),
    );

    expect(response429.status).toBe(502);
    expect(response500.status).toBe(502);
  });

  it('maps transport exceptions to 502', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('network failed')) as unknown as typeof fetch;

    const handler = createHandler(
      {
        COACH_PROXY_AUTH_MODE: 'off',
        OPENROUTER_API_KEY: 'or-key',
        OPENROUTER_MODEL: 'openai/gpt-4o-mini',
      },
      fetchImpl,
    );

    const response = await handler(
      new Request('https://proxy.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
      }),
    );

    expect(response.status).toBe(502);
  });

  it('maps AbortError timeout to 504', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const fetchImpl = jest.fn().mockRejectedValue(abortError) as unknown as typeof fetch;

    const handler = createHandler(
      {
        COACH_PROXY_AUTH_MODE: 'off',
        OPENROUTER_API_KEY: 'or-key',
        OPENROUTER_MODEL: 'openai/gpt-4o-mini',
      },
      fetchImpl,
    );

    const response = await handler(
      new Request('https://proxy.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
      }),
    );

    expect(response.status).toBe(504);
  });

  it('preserves auth required behavior for missing token', async () => {
    const handler = createHandler(
      {
        COACH_PROXY_AUTH_MODE: 'required',
        SUPABASE_URL: 'https://supabase.example.com',
        SUPABASE_ANON_KEY: 'anon',
        OPENROUTER_API_KEY: 'or-key',
        OPENROUTER_MODEL: 'openai/gpt-4o-mini',
      },
      jest.fn() as unknown as typeof fetch,
    );

    const response = await handler(
      new Request('https://proxy.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it('returns 422 when TOON output remains invalid after retry and strict extraction fails', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'Q0:D1:Bench Press|80|8-10|3' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'Still invalid output with prose' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ) as unknown as typeof fetch;

    const handler = createHandler(
      {
        COACH_PROXY_AUTH_MODE: 'off',
        OPENROUTER_API_KEY: 'or-key',
        OPENROUTER_MODEL: 'openai/gpt-4o-mini',
      },
      fetchImpl,
    );

    const response = await handler(
      new Request('https://proxy.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are IronLogic. Output TOON only.' },
            {
              role: 'user',
              content: 'QUEUE: Q0:D1:Bench Press|80|8|3 REQUEST: lower weight by 5kg',
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
