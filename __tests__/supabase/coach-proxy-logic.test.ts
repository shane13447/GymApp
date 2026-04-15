import {
  classifyUpstreamHttpStatus,
  evaluateAuthMode,
  extractModelText,
  extractOperationContractCandidate,
  extractStrictToonCandidate,
  formatInvalidToonDiagnostics,
  formatProxyDebugLog,
  getBearerToken,
  isOperationContractMode,
  isValidToonResponse,
  parseAuthModeFromValue,
  parseProviderFromValue,
  resolveProviderConfig,
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

  describe('provider routing config', () => {
    it('defaults to openrouter for missing or invalid provider values', () => {
      expect(parseProviderFromValue(undefined)).toBe('openrouter');
      expect(parseProviderFromValue('wat')).toBe('openrouter');
      expect(parseProviderFromValue('deepseek')).toBe('deepseek');
    });

    it('requires openrouter key and model for the default provider', () => {
      expect(resolveProviderConfig('openrouter', {})).toEqual({
        ok: false,
        missing: ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL'],
      });
    });

    it('resolves openrouter config with the default url', () => {
      const result = resolveProviderConfig('openrouter', {
        OPENROUTER_API_KEY: 'key',
        OPENROUTER_MODEL: 'openai/gpt-4o-mini',
      });

      expect(result).toEqual({
        ok: true,
        provider: 'openrouter',
        apiKey: 'key',
        model: 'openai/gpt-4o-mini',
        url: 'https://openrouter.ai/api/v1/chat/completions',
      });
    });

    it('resolves deepseek only when explicitly requested', () => {
      const result = resolveProviderConfig('deepseek', { DEEPSEEK_API_KEY: 'deepseek-key' });

      expect(result).toEqual({
        ok: true,
        provider: 'deepseek',
        apiKey: 'deepseek-key',
        model: 'deepseek-chat',
        url: 'https://api.deepseek.com/chat/completions',
      });
    });

    it('extracts model text from OpenAI-compatible choices', () => {
      expect(extractModelText({ choices: [{ message: { content: 'hello' } }] })).toBe('hello');
      expect(extractModelText({ choices: [{ text: 'plain' }] })).toBe('plain');
      expect(extractModelText({ choices: [] })).toBeNull();
    });

    it('classifies 429 separately for rate-limit diagnostics', () => {
      expect(classifyUpstreamHttpStatus(429)).toBe('bad_gateway_rate_limited');
      expect(classifyUpstreamHttpStatus(503)).toBe('bad_gateway');
    });
  });

  describe('operation contract detection', () => {
    it('detects operation contract prompts', () => {
      expect(isOperationContractMode([
        { role: 'system', content: 'Use JSON operation contract. Allowed operation types only.' },
        { role: 'user', content: '{"contract":"gymapp.queue.operations.v1"}' },
      ])).toBe(true);
    });

    it('extracts valid operation contract JSON', () => {
      const payload = extractOperationContractCandidate(JSON.stringify({
        version: 1,
        operations: [
          {
            id: 'op_1',
            type: 'modify_weight',
            target: { exerciseInstanceId: 'ex-1' },
            value: { weight: 80 },
          },
        ],
      }));

      expect(payload?.version).toBe(1);
      expect(payload?.operations).toHaveLength(1);
    });

    it('rejects modify_rest operation contract output', () => {
      expect(extractOperationContractCandidate(JSON.stringify({
        version: 1,
        operations: [
          {
            id: 'op_1',
            type: 'modify_rest',
            target: { exerciseInstanceId: 'ex-1' },
            value: { restTime: 120 },
          },
        ],
      }))).toBeNull();
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
    it('formats a sanitized log line with metadata only (no PII)', () => {
      const logLine = formatProxyDebugLog(
        [
          { role: 'system', content: 'Output TOON only' },
          { role: 'user', content: 'Queue: Q0:D1:Bench|80|8|3 Request: lower weight' },
        ],
        'Q0:D1:Bench|70|8|3'
      );

      expect(logLine).toContain('[coach-proxy] messages=[');
      expect(logLine).toContain('output_len=');
      expect(logLine).toContain('system:16chars');
      expect(logLine).toContain('user:47chars');
      // Must NOT contain raw queue data or prompts
      expect(logLine).not.toContain('Bench|80');
      expect(logLine).not.toContain('Bench|70');
      expect(logLine).not.toContain('Request: lower weight');
    });
  });

  describe('invalid TOON diagnostics', () => {
    it('formats a sanitized log line with lengths only (no PII)', () => {
      const line = formatInvalidToonDiagnostics(
        'Q0:D1:Bench Press|80|8-10|3',
        'Q0:D1:Bench Press|80|8-10|3\nI changed the queue as requested.'
      );

      expect(line).toContain('[coach-proxy] invalid_toon');
      expect(line).toContain('first_output_len=');
      expect(line).toContain('retry_output_len=');
      // Must NOT contain raw queue data
      expect(line).not.toContain('Bench Press');
      expect(line).not.toContain('8-10');
    });
  });
});
