export type AuthMode = 'off' | 'optional' | 'required';

type CoachProxyMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

// BUG FIX: Previously logged full message contents and model output including
// encoded queues, user prompts, and system instructions. This was a privacy/security
// regression - server logs should never contain PII or workout data. Now logs only
// metadata: message count, roles, and content length.
export const formatProxyDebugLog = (
  messages: CoachProxyMessage[],
  output: string
): string => {
  const roleSummary = messages.map((m) => `${m.role}:${m.content.length}chars`).join(', ');
  return `[coach-proxy] messages=[${roleSummary}] output_len=${output.length}`;
};

// BUG FIX: Previously logged full first and retry model outputs including raw TOON
// queue data with exercise names, weights, reps, and sets. Now logs only lengths
// to preserve debugging capability without leaking workout data into server logs.
export const formatInvalidToonDiagnostics = (
  firstOutput: string,
  retryOutput: string
): string => {
  return `[coach-proxy] invalid_toon first_output_len=${firstOutput.length} retry_output_len=${retryOutput.length}`;
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
