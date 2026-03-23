import { readFileSync } from 'node:fs';
import path from 'node:path';
// Mock database module to avoid expo-sqlite ESM issues in transitive imports
jest.mock('@/services/database', () => ({
  getWorkoutQueue: jest.fn(),
  saveWorkoutQueue: jest.fn(),
  clearWorkoutQueue: jest.fn(),
}));

import {
  executePromptThroughCoachPipeline,
  materializeCanonicalFixtureQueue,
  runCoachPromptSuite,
  type CoachPromptCase,
  type ProxyMessage,
} from '@/services/coach/prompt-test-runner';
import { OFFICIAL_HEADLESS_GATE_BASELINE } from '@/services/coach/headless-gate-baseline';

const TEST_PROMPTS_PATH = path.resolve(__dirname, '../../data/TestPrompts30.JSON');
const TEST_PROMPTS = JSON.parse(readFileSync(TEST_PROMPTS_PATH, 'utf8')) as CoachPromptCase[];

const COACH_API_TIMEOUT_MS = 60000;

const getCoachProxyUrl = (): string => process.env.EXPO_PUBLIC_COACH_PROXY_URL?.trim() ?? '';

const getOptionalAccessToken = (): string | null => process.env.SUPABASE_ACCESS_TOKEN?.trim() || null;

const extractProxyResponseText = (rawBody: string): string => {
  const trimmedBody = rawBody.trim();
  if (!trimmedBody) return '';

  try {
    const parsed = JSON.parse(trimmedBody) as unknown;

    if (typeof parsed === 'string') return parsed;
    if (!parsed || typeof parsed !== 'object') return trimmedBody;

    const payload = parsed as {
      response?: unknown;
      content?: unknown;
      output?: unknown;
      text?: unknown;
      message?: { content?: unknown };
      choices?: { text?: unknown; message?: { content?: unknown } }[];
    };

    if (typeof payload.response === 'string') return payload.response;
    if (typeof payload.content === 'string') return payload.content;
    if (typeof payload.output === 'string') return payload.output;
    if (typeof payload.text === 'string') return payload.text;
    if (typeof payload.message?.content === 'string') return payload.message.content;

    const firstChoice = payload.choices?.[0];
    if (typeof firstChoice?.text === 'string') return firstChoice.text;
    if (typeof firstChoice?.message?.content === 'string') return firstChoice.message.content;

    return trimmedBody;
  } catch {
    return trimmedBody;
  }
};

const callCoachProxy = async (
  proxyUrl: string,
  messages: ProxyMessage[],
  accessToken?: string | null
): Promise<string> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), COACH_API_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (accessToken?.trim()) {
      headers.Authorization = `Bearer ${accessToken.trim()}`;
    }

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });

    const rawBody = await response.text();

    if (!response.ok) {
      throw new Error(rawBody || `Coach proxy request failed (${response.status})`);
    }

    const parsedText = extractProxyResponseText(rawBody);
    if (!parsedText.trim()) {
      throw new Error('Coach proxy returned an empty response.');
    }

    return parsedText;
  } finally {
    clearTimeout(timeoutId);
  }
};

describe('headless live proxy gate', () => {
  it(
    'runs full 30-prompt suite against live proxy using official baseline fixture',
    async () => {
      const proxyUrl = getCoachProxyUrl();
      if (!proxyUrl) {
        throw new Error('EXPO_PUBLIC_COACH_PROXY_URL is required for live gate test');
      }

      const accessToken = getOptionalAccessToken();
      const baseQueue = materializeCanonicalFixtureQueue(OFFICIAL_HEADLESS_GATE_BASELINE);

      const suiteResult = await runCoachPromptSuite({
        prompts: TEST_PROMPTS,
        baseQueue,
        runPrompt: ({ promptCase, queue }) =>
          executePromptThroughCoachPipeline(
            {
              callCoachProxy: (messages) => callCoachProxy(proxyUrl, messages, accessToken),
            },
            promptCase,
            queue
          ),
      });

      const summaryLine = `LIVE_GATE_SUMMARY passed=${suiteResult.summary.passed} failed=${suiteResult.summary.failed} total=${suiteResult.summary.total} gatePassed=${suiteResult.summary.gatePassed}`;
      console.log(summaryLine);
      for (const [index, result] of suiteResult.results.entries()) {
        console.log(`LIVE_GATE_CASE ${index + 1}/${suiteResult.results.length} type="${result.type}" status=${result.status} reasons="${result.reasons.join(' | ')}"`);
      }

      expect(suiteResult.summary.total).toBe(30);
      expect(suiteResult.summary.gatePassed).toBe(true);
    },
    900000
  );
});

