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

/**
 * Type guard for a non-null object value.
 *
 * @param {unknown} value - The value to test.
 * @returns {boolean} True if the value is a non-null object.
 */
const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

/**
 * Normalise an environment variable value to a trimmed non-empty string, or
 * null when missing/blank.
 *
 * @param {string} [value] - The raw environment value.
 * @returns {string | null} The trimmed value, or null if empty/undefined.
 */
const normalizeEnvValue = (value?: string): string | null => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

/**
 * Parse a provider identifier, defaulting to 'openrouter' for anything other
 * than 'deepseek'.
 *
 * @param {string | null} [value] - The raw provider value.
 * @returns {CoachProvider} The resolved provider.
 */
export const parseProviderFromValue = (value?: string | null): CoachProvider => {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'deepseek' ? 'deepseek' : 'openrouter';
};

/**
 * Resolve the API key, model, and URL for a provider from environment values,
 * reporting any missing required variables.
 *
 * @param {CoachProvider} provider - The provider to configure.
 * @param {ProviderEnv} env - The environment values to read configuration from.
 * @returns {ProviderConfigResult} A success config or a failure listing missing variables.
 */
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

/**
 * Extract the assistant text from an upstream model response, supporting both
 * `choices[0].message.content` and `choices[0].text` shapes.
 *
 * @param {unknown} payload - The upstream response payload.
 * @returns {string | null} The trimmed model text, or null if not present.
 */
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

/**
 * Classify an upstream HTTP error status into a coarse failure category,
 * distinguishing rate-limiting (429) from other gateway errors.
 *
 * @param {number} status - The upstream HTTP status code.
 * @returns {'bad_gateway' | 'bad_gateway_rate_limited'} The failure category.
 */
export const classifyUpstreamHttpStatus = (
  status: number
): 'bad_gateway' | 'bad_gateway_rate_limited' => {
  return status === 429 ? 'bad_gateway_rate_limited' : 'bad_gateway';
};

/**
 * Parse JSON, returning null instead of throwing on malformed input.
 *
 * @param {string} text - The JSON text to parse.
 * @returns {unknown | null} The parsed value, or null on failure.
 */
const parseJson = (text: string): unknown | null => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

/**
 * Strip a surrounding Markdown code fence (```json ... ```) from text, if present.
 *
 * @param {string} text - The possibly-fenced text.
 * @returns {string} The text with any code fence removed and trimmed.
 */
const stripJsonFence = (text: string): string => {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
};

/**
 * Detect whether a conversation is operating in operation-contract mode by
 * scanning the combined message text for contract marker phrases.
 *
 * @param {CoachProxyMessage[]} messages - The conversation messages.
 * @returns {boolean} True if the messages indicate operation-contract mode.
 */
export const isOperationContractMode = (messages: CoachProxyMessage[]): boolean => {
  const combinedText = messages.map((message) => message.content).join('\n').toLowerCase();
  return combinedText.includes('gymapp.queue.operations.v1')
    || combinedText.includes('json operation contract')
    || combinedText.includes('allowed operation types only')
    || combinedText.includes('modify_weight');
};

/**
 * Parse text into a candidate operation-contract object, validating that it is
 * version 1 with a non-empty operations array whose entries all have a
 * recognised operation type. Returns null when validation fails.
 *
 * @param {string} text - The model output text (possibly code-fenced).
 * @returns {Record<string, unknown> | null} The validated contract object, or null if invalid.
 */
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

/**
 * Format a privacy-safe debug log line for a proxy request, emitting only
 * metadata (per-message role and content length, plus output length) and never
 * the message contents themselves.
 *
 * Note: previously this logged full message contents and model output, which
 * was a privacy/security regression; it now logs metadata only.
 *
 * @param {CoachProxyMessage[]} messages - The conversation messages.
 * @param {string} output - The model output text.
 * @returns {string} A metadata-only debug log line.
 */
export const formatProxyDebugLog = (
  messages: CoachProxyMessage[],
  output: string
): string => {
  const roleSummary = messages.map((m) => `${m.role}:${m.content.length}chars`).join(', ');
  return `[coach-proxy] messages=[${roleSummary}] output_len=${output.length}`;
};

/**
 * Parse an authentication mode value, defaulting to 'off' for unrecognised
 * inputs.
 *
 * @param {string | null} [modeRaw] - The raw auth mode value.
 * @returns {AuthMode} The parsed mode ('off', 'optional', or 'required').
 */
export const parseAuthModeFromValue = (modeRaw?: string | null): AuthMode => {
  const normalised = modeRaw?.trim().toLowerCase();
  if (normalised === 'off' || normalised === 'optional' || normalised === 'required') {
    return normalised;
  }
  return 'off';
};

/**
 * Extract the bearer token from a request's Authorization header.
 *
 * @param {Request} request - The incoming request.
 * @returns {string | null} The token, or null when absent/malformed/empty.
 */
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
