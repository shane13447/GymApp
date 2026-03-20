import {
  classifyProxyFailure,
  evaluateAuthMode,
  extractStrictToonCandidate,
  formatProxyDebugLog,
  getBearerToken,
  isValidToonResponse,
  parseAuthModeFromValue,
} from '@/supabase/functions/coach-proxy/logic';

describe('coach proxy logic', () => {
  describe('TOON validation', () => {
    it('accepts 4-field TOON rows', () => {
      const response = 'Q0:D1:Bench Press|80|8|3;Q1:D2:Back Squat|100|5|5';
      expect(isValidToonResponse(response)).toBe(true);
    });

    it('accepts 5-field TOON rows with variant', () => {
      const response = 'Q0:D1:Bench Press|80|8|3|Incline';
      expect(isValidToonResponse(response)).toBe(true);
    });

    it('extracts valid strict TOON candidate from wrapped output', () => {
      const wrapped = [
        'Here is your updated queue:',
        '```',
        'Q0:D1:Bench Press|70|8|3;Q1:D2:Back Squat|100|5|5',
        '```',
      ].join('\n');

      expect(extractStrictToonCandidate(wrapped)).toBe('Q0:D1:Bench Press|70|8|3;Q1:D2:Back Squat|100|5|5');
    });

    it('returns null when wrapped output does not contain valid strict TOON candidate', () => {
      const wrappedInvalid = [
        'Queue update:',
        '```',
        'Q0:D1:Bench Press|70|8-10|3',
        '```',
      ].join('\n');

      expect(extractStrictToonCandidate(wrappedInvalid)).toBeNull();
      expect(isValidToonResponse(wrappedInvalid)).toBe(false);
    });

    it('rejects non-integer reps and sets', () => {
      expect(isValidToonResponse('Q0:D1:Bench Press|80|8-10|3')).toBe(false);
      expect(isValidToonResponse('Q0:D1:Bench Press|80|8|3.5')).toBe(false);
    });
  });

  describe('auth mode parsing', () => {
    it('defaults to off for unknown values', () => {
      expect(parseAuthModeFromValue(undefined)).toBe('off');
      expect(parseAuthModeFromValue('unexpected')).toBe('off');
    });

    it('supports off optional required', () => {
      expect(parseAuthModeFromValue('off')).toBe('off');
      expect(parseAuthModeFromValue('optional')).toBe('optional');
      expect(parseAuthModeFromValue('required')).toBe('required');
    });
  });

  describe('auth mode decisions', () => {
    it('off allows all requests', () => {
      expect(evaluateAuthMode('off', null, null)).toEqual({ allow: true });
      expect(evaluateAuthMode('off', 'token', false)).toEqual({ allow: true });
    });

    it('optional allows missing token but rejects invalid token', () => {
      expect(evaluateAuthMode('optional', null, null)).toEqual({ allow: true });
      expect(evaluateAuthMode('optional', 'token', false)).toEqual({
        allow: false,
        status: 401,
        error: 'Invalid authorization token.',
      });
    });

    it('required rejects missing token and invalid token, allows valid token', () => {
      expect(evaluateAuthMode('required', null, null)).toEqual({
        allow: false,
        status: 401,
        error: 'Authorization token is required.',
      });
      expect(evaluateAuthMode('required', 'token', false)).toEqual({
        allow: false,
        status: 401,
        error: 'Invalid authorization token.',
      });
      expect(evaluateAuthMode('required', 'token', true)).toEqual({ allow: true });
    });
  });

  describe('bearer token extraction', () => {
    it('extracts bearer tokens from authorization header', () => {
      const request = new Request('https://example.com', {
        headers: { Authorization: 'Bearer abc123' },
      });

      expect(getBearerToken(request)).toBe('abc123');
    });

    it('returns null for missing or malformed authorization header', () => {
      const missing = new Request('https://example.com');
      const malformed = new Request('https://example.com', {
        headers: { Authorization: 'Token abc123' },
      });

      expect(getBearerToken(missing)).toBeNull();
      expect(getBearerToken(malformed)).toBeNull();
    });
  });

  describe('proxy debug logging', () => {
    it('formats structured log with status and latency', () => {
      const logLine = formatProxyDebugLog(
        [
          { role: 'system', content: 'Output TOON only' },
          { role: 'user', content: 'Queue: Q0:D1:Bench|80|8|3 Request: lower weight' },
        ],
        'Q0:D1:Bench|70|8|3',
        { statusCategory: 'ok', latencyMs: 123 }
      );

      expect(logLine).toContain('input=');
      expect(logLine).toContain('output=');
      expect(logLine).toContain('status_category=ok');
      expect(logLine).toContain('latency_ms=123');
    });

    it('redacts secrets and profile-sensitive values from logs', () => {
      const logLine = formatProxyDebugLog(
        [
          { role: 'system', content: 'Authorization: Bearer real-token sk-live-raw-secret' },
          { role: 'user', content: 'currentWeight=82 goalWeight=75 name=Shane' },
        ],
        'token=sk-live-raw-secret',
        { statusCategory: 'ok', latencyMs: 10 }
      );

      expect(logLine).not.toContain('sk-live-raw-secret');
      expect(logLine).not.toContain('Authorization: Bearer real-token');
      expect(logLine).not.toContain('currentWeight=82');
      expect(logLine).not.toContain('goalWeight=75');
      expect(logLine).toContain('[REDACTED]');
    });
  });

  describe('proxy failure mapping', () => {
    it('maps abort errors to timeout hard-fail', () => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      expect(classifyProxyFailure(abortError)).toEqual({
        status: 504,
        error: 'Coach proxy request timed out.',
      });
    });

    it('maps upstream overload and invalid output to 502', () => {
      expect(classifyProxyFailure(new Error('Upstream model request failed with status 503.'))).toEqual({
        status: 502,
        error: 'Upstream model request failed with status 503.',
      });

      expect(classifyProxyFailure(new Error('Upstream model response did not contain text content.'))).toEqual({
        status: 502,
        error: 'Upstream model response did not contain text content.',
      });
    });

    it('maps unhandled failures to generic 500 hard-fail', () => {
      expect(classifyProxyFailure(new Error('Unexpected failure'))).toEqual({
        status: 500,
        error: 'Unable to process coach request.',
      });
    });
  });
});
