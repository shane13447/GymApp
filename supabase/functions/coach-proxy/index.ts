import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { corsHeadersForRequest, jsonResponse } from '../_shared/cors.ts';

type CoachProxyMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
};

type AuthMode = 'off' | 'optional' | 'required';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const REQUEST_TIMEOUT_MS = 60000;

const TOON_RETRY_INSTRUCTION =
  'FORMAT REQUIREMENT: Output TOON queue only. No prose, no markdown, no explanations. Use exact format Qn:Dm:exercise|kg|reps|sets or Qn:Dm:exercise|kg|reps|sets|variant with queue items separated by semicolons and exercises separated by commas.';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const parseAuthMode = (): AuthMode => {
  const modeRaw = Deno.env.get('COACH_PROXY_AUTH_MODE')?.trim().toLowerCase();
  if (modeRaw === 'off' || modeRaw === 'optional' || modeRaw === 'required') {
    return modeRaw;
  }
  return 'off';
};

const getBearerToken = (request: Request): string | null => {
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

const verifyAccessToken = async (token: string): Promise<boolean> => {
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

const enforceAuthMode = async (request: Request, mode: AuthMode): Promise<Response | null> => {
  if (mode === 'off') {
    return null;
  }

  const token = getBearerToken(request);

  if (!token) {
    if (mode === 'required') {
      return jsonResponse({ error: 'Authorization token is required.' }, 401, request);
    }
    return null;
  }

  const isValid = await verifyAccessToken(token);
  if (!isValid) {
    return jsonResponse({ error: 'Invalid authorization token.' }, 401, request);
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

const extractModelText = (payload: unknown): string | null => {
  if (!isObject(payload)) {
    return null;
  }

  const response = payload as DeepSeekResponse;
  const firstChoice = response.choices?.[0];

  if (typeof firstChoice?.message?.content === 'string') {
    return firstChoice.message.content.trim();
  }

  if (typeof firstChoice?.text === 'string') {
    return firstChoice.text.trim();
  }

  return null;
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

const isValidToonResponse = (text: string): boolean => {
  const trimmed = text.trim();
  const queueItems = trimmed.match(/Q\d+:D\d+:[^;]+(?:;Q\d+:D\d+:[^;]+)*/)?.[0];

  if (!queueItems || queueItems !== trimmed) {
    return false;
  }

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

const callDeepSeek = async (
  apiKey: string,
  messages: CoachProxyMessage[],
): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const suffix = response.status === 401 ? ' (unauthorized key)' : '';
      throw new Error(`Upstream model request failed with status ${response.status}${suffix}.`);
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
    const authMode = parseAuthMode();
    const authFailure = await enforceAuthMode(request, authMode);
    if (authFailure) {
      return authFailure;
    }

    const apiKey = Deno.env.get('DEEPSEEK_API_KEY');
    if (!apiKey) {
      console.error('[coach-proxy] Missing DEEPSEEK_API_KEY');
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

    const isToonMode = isModifyWorkoutMode(messages);

    let modelOutput = await callDeepSeek(apiKey, messages);

    if (isToonMode && !isValidToonResponse(modelOutput)) {
      const retriedMessages: CoachProxyMessage[] = [
        ...messages,
        { role: 'system', content: TOON_RETRY_INSTRUCTION },
      ];

      modelOutput = await callDeepSeek(apiKey, retriedMessages);

      if (!isValidToonResponse(modelOutput)) {
        return jsonResponse(
          { error: 'Model returned invalid TOON output after retry.' },
          422,
          request,
        );
      }
    }

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
      return jsonResponse({ error: message }, 502, request);
    }

    if (message.includes('Upstream model response did not contain text content')) {
      return jsonResponse({ error: message }, 502, request);
    }

    return jsonResponse({ error: 'Unable to process coach request.' }, 500, request);
  }
});
