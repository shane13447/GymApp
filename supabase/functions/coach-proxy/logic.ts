export type AuthMode = 'off' | 'optional' | 'required';

type CoachProxyMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

interface ProxyLogMeta {
  statusCategory: string;
  latencyMs: number;
}

const redactSensitiveText = (input: string): string => {
  if (!input.trim()) {
    return input;
  }

  let redacted = input;

  // Redact bearer credentials and API-like secret tokens.
  redacted = redacted.replace(/authorization\s*:\s*bearer\s+[^\s|,;]+/gi, 'Authorization: Bearer [REDACTED]');
  redacted = redacted.replace(/\b(?:sk|rk)-[a-z0-9_-]+\b/gi, '[REDACTED]');

  // Redact profile-sensitive key/value patterns.
  redacted = redacted.replace(/\b(currentWeight|goalWeight|name)\s*=\s*[^\s|,;]+/gi, '$1=[REDACTED]');

  return redacted;
};

export const formatProxyDebugLog = (
  messages: CoachProxyMessage[],
  output: string,
  meta?: ProxyLogMeta
): string => {
  const input = messages.map((message) => `${message.role}:${redactSensitiveText(message.content)}`).join(' | ');
  const safeOutput = redactSensitiveText(output);
  const statusCategory = meta?.statusCategory ?? 'unknown';
  const latencyMs = meta?.latencyMs ?? -1;

  return `[coach-proxy] status_category=${statusCategory} latency_ms=${latencyMs} input=${input} output=${safeOutput}`;
};

export const parseAuthModeFromValue = (modeRaw?: string | null): AuthMode => {
  const normalised = modeRaw?.trim().toLowerCase();
  if (normalised === 'off' || normalised === 'optional' || normalised === 'required') {
    return normalised;
  }
  return 'off';
};

export const getBearerToken = (request: Request): string | null => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const token = match[1].trim();
  return token.length > 0 ? token : null;
};

export type AuthDecision =
  | { allow: true }
  | { allow: false; status: 401; error: string };

export const evaluateAuthMode = (
  mode: AuthMode,
  token: string | null,
  tokenIsValid: boolean | null
): AuthDecision => {
  if (mode === 'off') {
    return { allow: true };
  }

  if (!token) {
    if (mode === 'required') {
      return { allow: false, status: 401, error: 'Authorization token is required.' };
    }
    return { allow: true };
  }

  if (tokenIsValid === false) {
    return { allow: false, status: 401, error: 'Invalid authorization token.' };
  }

  return { allow: true };
};

const STRICT_TOON_PATTERN = /Q\d+:D\d+:[^;\n`]+(?:;Q\d+:D\d+:[^;\n`]+)*/;

const isValidStrictToonQueue = (queueItems: string): boolean => {
  const items = queueItems.split(';').filter(Boolean);
  if (items.length === 0) {
    return false;
  }

  for (const item of items) {
    const match = item.match(/^Q\d+:D\d+:(.+)$/);
    if (!match) {
      return false;
    }

    const exercises = match[1].split(',').map((exercise) => exercise.trim()).filter(Boolean);
    if (exercises.length === 0) {
      return false;
    }

    for (const exercise of exercises) {
      const fields = exercise.split('|');
      if (fields.length !== 4 && fields.length !== 5) {
        return false;
      }

      if (fields[0].trim().length === 0) {
        return false;
      }

      if (fields.slice(1, 4).some((field) => field.trim().length === 0)) {
        return false;
      }

      if (!/^\d+$/.test(fields[2].trim()) || !/^\d+$/.test(fields[3].trim())) {
        return false;
      }

      if (fields.length === 5 && fields[4].trim().length === 0) {
        return false;
      }
    }
  }

  return true;
};

export const extractStrictToonCandidate = (text: string): string | null => {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const exactMatch = trimmed.match(STRICT_TOON_PATTERN)?.[0];
  if (exactMatch && exactMatch === trimmed) {
    return isValidStrictToonQueue(exactMatch) ? exactMatch : null;
  }

  const embeddedMatch = text.match(STRICT_TOON_PATTERN)?.[0]?.trim();
  if (!embeddedMatch || embeddedMatch.length === 0) {
    return null;
  }

  return isValidStrictToonQueue(embeddedMatch) ? embeddedMatch : null;
};

export const isValidToonResponse = (text: string): boolean => {
  const trimmed = text.trim();
  const queueItems = extractStrictToonCandidate(trimmed);

  if (!queueItems || queueItems !== trimmed) {
    return false;
  }

  return isValidStrictToonQueue(queueItems);
};

const isAbortLikeError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { name?: unknown };
  return maybeError.name === 'AbortError';
};

export const classifyProxyFailure = (error: unknown): { status: number; error: string } => {
  if (error instanceof SyntaxError) {
    return { status: 400, error: 'Request body must be valid JSON.' };
  }

  if (isAbortLikeError(error)) {
    return { status: 504, error: 'Coach proxy request timed out.' };
  }

  const message = error instanceof Error ? error.message : 'Unhandled proxy error.';

  if (message.includes('Upstream model request failed')) {
    return { status: 502, error: message };
  }

  if (message.includes('Upstream model response did not contain text content')) {
    return { status: 502, error: message };
  }

  return { status: 500, error: 'Unable to process coach request.' };
};
