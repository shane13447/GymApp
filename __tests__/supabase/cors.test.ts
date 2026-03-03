import { corsHeadersForRequest } from '@/supabase/functions/_shared/cors';

describe('coach proxy CORS', () => {
  const originalEnv = process.env.COACH_PROXY_ALLOWED_ORIGINS;

  afterEach(() => {
    process.env.COACH_PROXY_ALLOWED_ORIGINS = originalEnv;
  });

  it('allows configured origin when allowlist is set', () => {
    process.env.COACH_PROXY_ALLOWED_ORIGINS = 'https://app.example.com, https://admin.example.com';

    const request = new Request('https://proxy.example.com', {
      headers: { Origin: 'https://app.example.com' },
    });

    const headers = corsHeadersForRequest(request) as Record<string, string>;
    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
  });

  it('blocks non-allowlisted origin when allowlist is set', () => {
    process.env.COACH_PROXY_ALLOWED_ORIGINS = 'https://app.example.com';

    const request = new Request('https://proxy.example.com', {
      headers: { Origin: 'https://evil.example.com' },
    });

    const headers = corsHeadersForRequest(request) as Record<string, string>;
    expect(headers['Access-Control-Allow-Origin']).toBe('null');
  });

  it('supports requests without Origin header for native/mobile', () => {
    process.env.COACH_PROXY_ALLOWED_ORIGINS = 'https://app.example.com';

    const request = new Request('https://proxy.example.com');
    const headers = corsHeadersForRequest(request) as Record<string, string>;

    expect(headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
