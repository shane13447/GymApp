type AuthMode = 'off' | 'optional' | 'required';

type AuthDecision =
  | { allow: true }
  | { allow: false; status: 401; error: string };

type CoachProvider = 'openrouter' | 'deepseek';

type CoachProxyMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ResolvedProviderConfig = {
  ok: true;
  provider: CoachProvider;
  apiKey: string;
  model: string;
  url: string;
};

type MissingProviderConfig = {
  ok: false;
  missing: string[];
};

type ProviderConfigResult = ResolvedProviderConfig | MissingProviderConfig;

type HandlerDeps = {
  fetchImpl: typeof fetch;
  readEnv: (name: string) => string | undefined;
  corsHeadersForRequest: (request: Request) => HeadersInit;
  jsonResponse: (body: unknown, status?: number, request?: Request) => Response;
  parseAuthModeFromValue: (modeRaw?: string | null) => AuthMode;
  getBearerToken: (request: Request) => string | null;
  evaluateAuthMode: (mode: AuthMode, token: string | null, tokenIsValid: boolean | null) => AuthDecision;
  parseProviderFromValue: (value?: string | null) => CoachProvider;
  resolveProviderConfig: (provider: CoachProvider, env: Record<string, string | undefined>) => ProviderConfigResult;
  extractModelText: (payload: unknown) => string | null;
  classifyUpstreamHttpStatus: (status: number) => 'bad_gateway' | 'bad_gateway_rate_limited';
  isValidToonResponse: (text: string) => boolean;
  extractStrictToonCandidate: (text: string) => string | null;
  formatInvalidToonDiagnostics: (firstOutput: string, retryOutput: string) => string;
  formatProxyDebugLog: (messages: CoachProxyMessage[], output: string) => string;
};

const OPENROUTER_DEFAULT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const REQUEST_TIMEOUT_MS = 60000;

const TOON_RETRY_INSTRUCTION =
  'FORMAT REQUIREMENT: Output TOON queue only. No prose, no markdown, no explanations. Use exact format Qn:Dm:exercise|kg|reps|sets or Qn:Dm:exercise|kg|reps|sets|variant with queue items separated by semicolons and exercises separated by commas.';

class UpstreamHttpError extends Error {
  status: number;

  constructor(status: number) {
    super(`Upstream model request failed with status ${status}.`);
    this.name = 'UpstreamHttpError';
    this.status = status;
  }
}

class UpstreamTransportError extends Error {
  constructor() {
    super('Upstream model transport failed before receiving a response.');
    this.name = 'UpstreamTransportError';
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isValidRole = (role: unknown): role is CoachProxyMessage['role'] => {
  return role === 'system' || role === 'user' || role === 'assistant';
};

const parseRequestMessages = (body: unknown): CoachProxyMessage[] | null => {
  if (!isObject(body) || !Array.isArray(body.messages)) {
    return null;
  }

  const validated: CoachProxyMessage[] = [];
  for (const item of body.messages) {
    if (!isObject(item)) {
      return null;
    }

    const role = item.role;
    const content = item.content;
    if (!isValidRole(role) || typeof content !== 'string') {
      return null;
    }

    validated.push({ role, content });
  }

  return validated;
};

const isModifyWorkoutMode = (messages: CoachProxyMessage[]): boolean => {
  const systemText = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n')
    .toLowerCase();

  if (
    systemText.includes('ironlogic')
    || systemText.includes('toon')
    || systemText.includes('output toon only')
    || systemText.includes('gym queue modifier')
  ) {
    return true;
  }

  const userText = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join('\n')
    .toLowerCase();

  return userText.includes('queue:') && userText.includes('request:');
};

const verifyAccessToken = async (
  token: string,
  deps: HandlerDeps,
): Promise<boolean> => {
  const supabaseUrl = deps.readEnv('SUPABASE_URL');
  const supabaseAnonKey = deps.readEnv('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[coach-proxy] Missing SUPABASE_URL or SUPABASE_ANON_KEY for auth verification');
    return false;
  }

  try {
    const response = await deps.fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch (error) {
    console.error('[coach-proxy] Token verification request failed:', error);
    return false;
  }
};

const enforceAuthMode = async (
  request: Request,
  mode: AuthMode,
  deps: HandlerDeps,
): Promise<Response | null> => {
  const token = deps.getBearerToken(request);
  const tokenIsValid = token ? await verifyAccessToken(token, deps) : null;
  const decision = deps.evaluateAuthMode(mode, token, tokenIsValid);

  if (!decision.allow) {
    return deps.jsonResponse({ error: decision.error }, decision.status, request);
  }

  return null;
};

const callUpstreamModel = async (
  config: ResolvedProviderConfig,
  messages: CoachProxyMessage[],
  deps: HandlerDeps,
): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await deps.fetchImpl(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      throw new UpstreamTransportError();
    }

    if (!response.ok) {
      throw new UpstreamHttpError(response.status);
    }

    const payload = (await response.json()) as unknown;
    const text = deps.extractModelText(payload);
    if (!text) {
      throw new Error('Upstream model response did not contain text content.');
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
};

export const createCoachProxyHandler = (deps: HandlerDeps) => {
  return async (request: Request): Promise<Response> => {
    const corsHeaders = deps.corsHeadersForRequest(request);

    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return deps.jsonResponse({ error: 'Method not allowed.' }, 405, request);
    }

    try {
      const authMode = deps.parseAuthModeFromValue(deps.readEnv('COACH_PROXY_AUTH_MODE'));
      const authFailure = await enforceAuthMode(request, authMode, deps);
      if (authFailure) {
        return authFailure;
      }

      const provider = deps.parseProviderFromValue(deps.readEnv('COACH_MODEL_PROVIDER'));
      const providerConfig = deps.resolveProviderConfig(provider, {
        OPENROUTER_API_KEY: deps.readEnv('OPENROUTER_API_KEY'),
        OPENROUTER_MODEL: deps.readEnv('OPENROUTER_MODEL'),
        OPENROUTER_URL: deps.readEnv('OPENROUTER_URL'),
        DEEPSEEK_API_KEY: deps.readEnv('DEEPSEEK_API_KEY'),
        DEEPSEEK_MODEL: deps.readEnv('DEEPSEEK_MODEL'),
        OPENROUTER_DEFAULT_URL,
        DEEPSEEK_URL,
      });

      if (!providerConfig.ok) {
        console.error(`[coach-proxy] Missing provider config: ${providerConfig.missing.join(', ')}`);
        return deps.jsonResponse({ error: 'Coach proxy is not configured.' }, 500, request);
      }

      let rawBody: unknown;
      try {
        rawBody = (await request.json()) as unknown;
      } catch {
        return deps.jsonResponse({ error: 'Request body must be valid JSON.' }, 400, request);
      }
      const messages = parseRequestMessages(rawBody);

      if (!messages || messages.length === 0) {
        return deps.jsonResponse(
          { error: 'Invalid request body. Expected { messages: [{ role, content }] }.' },
          400,
          request,
        );
      }

      const isToonMode = isModifyWorkoutMode(messages);

      let modelOutput = await callUpstreamModel(providerConfig, messages, deps);

      if (isToonMode && !deps.isValidToonResponse(modelOutput)) {
        const firstOutput = modelOutput;
        const retriedMessages: CoachProxyMessage[] = [
          ...messages,
          { role: 'system', content: TOON_RETRY_INSTRUCTION },
        ];

        modelOutput = await callUpstreamModel(providerConfig, retriedMessages, deps);
        const retryOutput = modelOutput;

        if (!deps.isValidToonResponse(modelOutput)) {
          const candidate = deps.extractStrictToonCandidate(modelOutput);
          if (!candidate || !deps.isValidToonResponse(candidate)) {
            console.log(deps.formatInvalidToonDiagnostics(firstOutput, retryOutput));
            return deps.jsonResponse(
              { error: 'Model returned invalid TOON output after retry.' },
              422,
              request,
            );
          }

          modelOutput = candidate;
        }
      }

      console.log(deps.formatProxyDebugLog(messages, modelOutput));
      return deps.jsonResponse({ response: modelOutput }, 200, request);
    } catch (error) {
      if (
        error instanceof SyntaxError
        || (error instanceof TypeError && error.message.toLowerCase().includes('json'))
      ) {
        return deps.jsonResponse({ error: 'Request body must be valid JSON.' }, 400, request);
      }

      if (error instanceof Error && error.name === 'AbortError') {
        return deps.jsonResponse({ error: 'Coach proxy request timed out.' }, 504, request);
      }

      if (error instanceof UpstreamHttpError) {
        const className = deps.classifyUpstreamHttpStatus(error.status);
        const rateTag = className === 'bad_gateway_rate_limited' ? ' rate_limited=true' : '';
        console.error(`[coach-proxy] upstream provider failure status=${error.status}${rateTag}`);
        return deps.jsonResponse({ error: error.message }, 502, request);
      }

      if (error instanceof UpstreamTransportError) {
        console.error('[coach-proxy] Upstream transport failure');
        return deps.jsonResponse({ error: error.message }, 502, request);
      }

      const message = error instanceof Error ? error.message : 'Unhandled proxy error.';
      console.error('[coach-proxy] Request failed:', message);

      if (message.includes('Upstream model response did not contain text content')) {
        return deps.jsonResponse({ error: message }, 502, request);
      }

      return deps.jsonResponse({ error: 'Unable to process coach request.' }, 500, request);
    }
  };
};
