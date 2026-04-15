export type AuthMode = 'off' | 'optional' | 'required';
export type CoachProvider = 'openrouter' | 'deepseek';

type CoachProxyMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type UpstreamModelResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
};

type ProviderEnv = {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_URL?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  DEEPSEEK_URL?: string;
  OPENROUTER_DEFAULT_URL?: string;
};

export type ResolvedProviderConfig = {
  ok: true;
  provider: CoachProvider;
  apiKey: string;
  model: string;
  url: string;
};

export type MissingProviderConfig = {
  ok: false;
  missing: string[];
};

export type ProviderConfigResult = ResolvedProviderConfig | MissingProviderConfig;

const DEFAULT_OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';

const OPERATION_TYPES = new Set([
  'modify_weight',
  'modify_reps',
  'modify_sets',
  'add_exercise',
  'remove_exercise',
  'swap_variant',
]);

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const normalizeEnvValue = (value?: string): string | null => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

export const parseProviderFromValue = (value?: string | null): CoachProvider => {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'deepseek' ? 'deepseek' : 'openrouter';
};

export const resolveProviderConfig = (
  provider: CoachProvider,
  env: ProviderEnv
): ProviderConfigResult => {
  if (provider === 'openrouter') {
    const apiKey = normalizeEnvValue(env.OPENROUTER_API_KEY);
    const model = normalizeEnvValue(env.OPENROUTER_MODEL);
    const missing = [
      ...(apiKey ? [] : ['OPENROUTER_API_KEY']),
      ...(model ? [] : ['OPENROUTER_MODEL']),
    ];

    if (missing.length > 0) {
      return { ok: false, missing };
    }

    return {
      ok: true,
      provider,
      apiKey: apiKey as string,
      model: model as string,
      url: normalizeEnvValue(env.OPENROUTER_URL)
        ?? normalizeEnvValue(env.OPENROUTER_DEFAULT_URL)
        ?? DEFAULT_OPENROUTER_URL,
    };
  }

  const apiKey = normalizeEnvValue(env.DEEPSEEK_API_KEY);
  if (!apiKey) {
    return { ok: false, missing: ['DEEPSEEK_API_KEY'] };
  }

  return {
    ok: true,
    provider,
    apiKey,
    model: normalizeEnvValue(env.DEEPSEEK_MODEL) ?? DEFAULT_DEEPSEEK_MODEL,
    url: normalizeEnvValue(env.DEEPSEEK_URL) ?? DEFAULT_DEEPSEEK_URL,
  };
};

export const extractModelText = (payload: unknown): string | null => {
  if (!isObject(payload)) {
    return null;
  }

  const response = payload as UpstreamModelResponse;
  const firstChoice = response.choices?.[0];

  if (typeof firstChoice?.message?.content === 'string') {
    return firstChoice.message.content.trim();
  }

  if (typeof firstChoice?.text === 'string') {
    return firstChoice.text.trim();
  }

  return null;
};

export const classifyUpstreamHttpStatus = (
  status: number
): 'bad_gateway' | 'bad_gateway_rate_limited' => {
  return status === 429 ? 'bad_gateway_rate_limited' : 'bad_gateway';
};

const parseJson = (text: string): unknown | null => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const stripJsonFence = (text: string): string => {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
};

export const isOperationContractMode = (messages: CoachProxyMessage[]): boolean => {
  const combinedText = messages.map((message) => message.content).join('\n').toLowerCase();
  return combinedText.includes('gymapp.queue.operations.v1')
    || combinedText.includes('json operation contract')
    || combinedText.includes('allowed operation types only')
    || combinedText.includes('modify_weight');
};

export const extractOperationContractCandidate = (text: string): Record<string, unknown> | null => {
  const parsed = parseJson(stripJsonFence(text));
  if (!isObject(parsed)) {
    return null;
  }

  if (parsed.version !== 1 || !Array.isArray(parsed.operations) || parsed.operations.length === 0) {
    return null;
  }

  for (const operation of parsed.operations) {
    if (!isObject(operation) || typeof operation.type !== 'string' || !OPERATION_TYPES.has(operation.type)) {
      return null;
    }
  }

  return parsed;
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
