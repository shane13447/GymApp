import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { corsHeadersForRequest, jsonResponse } from '../_shared/cors.ts';
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
  type ResolvedProviderConfig,
  type AuthMode,
} from './logic.ts';

type CoachProxyMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const OPENROUTER_DEFAULT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const REQUEST_TIMEOUT_MS = 60000;

const TOON_RETRY_INSTRUCTION =
  'FORMAT REQUIREMENT: Output TOON queue only. No prose, no markdown, no explanations. Use exact format Qn:Dm:exercise|kg|reps|sets or Qn:Dm:exercise|kg|reps|sets|variant with queue items separated by semicolons and exercises separated by commas.';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

export const verifyAccessToken = async (token: string): Promise<boolean> => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[coach-proxy] Missing SUPABASE_URL or SUPABASE_ANON_KEY for auth verification');
    return false;
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
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

export const enforceAuthMode = async (request: Request, mode: AuthMode): Promise<Response | null> => {
  const token = getBearerToken(request);
  const tokenIsValid = token ? await verifyAccessToken(token) : null;
  const decision = evaluateAuthMode(mode, token, tokenIsValid);

  if (!decision.allow) {
    return jsonResponse({ error: decision.error }, decision.status, request);
  }

  return null;
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
    systemText.includes('ironlogic') ||
    systemText.includes('toon') ||
    systemText.includes('output toon only') ||
    systemText.includes('gym queue modifier')
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

const callUpstreamModel = async (
  config: ResolvedProviderConfig,
  messages: CoachProxyMessage[],
): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(config.url, {
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

    if (!response.ok) {
      throw new Error(`Upstream model request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as unknown;
    const text = extractModelText(payload);

    if (!text) {
      throw new Error('Upstream model response did not contain text content.');
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
};

Deno.serve(async (request: Request): Promise<Response> => {
  const corsHeaders = corsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, request);
  }

  try {
    const authMode = parseAuthModeFromValue(Deno.env.get('COACH_PROXY_AUTH_MODE'));
    const authFailure = await enforceAuthMode(request, authMode);
    if (authFailure) {
      return authFailure;
    }

    const provider = parseProviderFromValue(Deno.env.get('COACH_MODEL_PROVIDER'));
    const providerConfig = resolveProviderConfig(provider, {
      OPENROUTER_API_KEY: Deno.env.get('OPENROUTER_API_KEY'),
      OPENROUTER_MODEL: Deno.env.get('OPENROUTER_MODEL'),
      OPENROUTER_URL: Deno.env.get('OPENROUTER_URL'),
      DEEPSEEK_API_KEY: Deno.env.get('DEEPSEEK_API_KEY'),
      DEEPSEEK_MODEL: Deno.env.get('DEEPSEEK_MODEL'),
      DEEPSEEK_URL,
      OPENROUTER_DEFAULT_URL,
    });

    if (!providerConfig.ok) {
      console.error(`[coach-proxy] Missing provider config: ${providerConfig.missing.join(', ')}`);
      return jsonResponse({ error: 'Coach proxy is not configured.' }, 500, request);
    }

    const rawBody = (await request.json()) as unknown;
    const messages = parseRequestMessages(rawBody);

    if (!messages || messages.length === 0) {
      return jsonResponse(
        { error: 'Invalid request body. Expected { messages: [{ role, content }] }.' },
        400,
        request,
      );
    }

    const isOperationMode = isOperationContractMode(messages);
    const isToonMode = !isOperationMode && isModifyWorkoutMode(messages);

    let modelOutput = await callUpstreamModel(providerConfig, messages);

    if (isOperationMode) {
      const operationPayload = extractOperationContractCandidate(modelOutput);
      if (!operationPayload) {
        return jsonResponse(
          { error: 'Model returned invalid operation contract output.' },
          422,
          request,
        );
      }

      console.log(formatProxyDebugLog(messages, JSON.stringify(operationPayload)));
      return jsonResponse(operationPayload, 200, request);
    }

    if (isToonMode && !isValidToonResponse(modelOutput)) {
      const firstOutput = modelOutput;
      const retriedMessages: CoachProxyMessage[] = [
        ...messages,
        { role: 'system', content: TOON_RETRY_INSTRUCTION },
      ];

      modelOutput = await callUpstreamModel(providerConfig, retriedMessages);
      const retryOutput = modelOutput;

      if (!isValidToonResponse(modelOutput)) {
        const candidate = extractStrictToonCandidate(modelOutput);
        if (!candidate || !isValidToonResponse(candidate)) {
          console.log(formatInvalidToonDiagnostics(firstOutput, retryOutput));
          return jsonResponse(
            { error: 'Model returned invalid TOON output after retry.' },
            422,
            request,
          );
        }

        modelOutput = candidate;
      }
    }

    console.log(formatProxyDebugLog(messages, modelOutput));
    return jsonResponse({ response: modelOutput }, 200, request);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonResponse({ error: 'Request body must be valid JSON.' }, 400, request);
    }

    if (error instanceof Error && error.name === 'AbortError') {
      return jsonResponse({ error: 'Coach proxy request timed out.' }, 504, request);
    }

    const message = error instanceof Error ? error.message : 'Unhandled proxy error.';
    console.error('[coach-proxy] Request failed:', message);

    if (message.includes('Upstream model request failed')) {
      const statusMatch = message.match(/status\s+(\d+)/i);
      const status = statusMatch ? Number.parseInt(statusMatch[1], 10) : 0;
      const className = status ? classifyUpstreamHttpStatus(status) : 'bad_gateway';
      const rateTag = className === 'bad_gateway_rate_limited' ? ' rate_limited=true' : '';
      console.error(`[coach-proxy] upstream provider failure status=${status || 'unknown'}${rateTag}`);
      return jsonResponse({ error: message }, 502, request);
    }

    if (message.includes('Upstream model response did not contain text content')) {
      return jsonResponse({ error: message }, 502, request);
    }

    return jsonResponse({ error: 'Unable to process coach request.' }, 500, request);
  }
});
