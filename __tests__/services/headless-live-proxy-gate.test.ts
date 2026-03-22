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

const TEST_PROMPTS: CoachPromptCase[] = [
  { type: 'Single - Weight', prompt: 'I want to do 25kg for decline crunches today' },
  { type: 'Single - Reps', prompt: 'can we bump leg extensions up to 15 reps?' },
  { type: 'Single - Sets', prompt: 'sets of 5 for lat pulldowns please' },
  { type: 'Single - Add', prompt: 'put barbell curls into my day 2 workout' },
  { type: 'Single - Remove', prompt: 'get rid of fingertip curls' },
  { type: 'Multi - Weight', prompt: 'up the crunches to 30 and bicep curls to 10' },
  { type: 'Multi - Reps', prompt: 'make calf press 20 reps but drop leg extensions to 6' },
  { type: 'Multi - Sets', prompt: 'I want 4 sets of pulldowns and 5 sets of triangle rows' },
  { type: 'Multi - Add', prompt: 'can you add hammer curls to day 2 and also dumbbell flyes to day 3?' },
  { type: 'Multi - Remove', prompt: 'delete fingertip curls and reverse forearm curls' },
  { type: 'Single - Weight + Reps', prompt: 'change decline crunches weight to 15 and reps to 5' },
  { type: 'Single - Reps + Weight', prompt: 'set leg extensions to 12 reps and 40kg' },
  { type: 'Single - Weight + Sets', prompt: 'crunches at 20kg for 5 sets' },
  { type: 'Single - Full Mod', prompt: 'make lat pulldowns 50kg, 10 reps, and 4 sets' },
  { type: 'Muscle - Weight', prompt: 'put all my back exercises at 30kg' },
  { type: 'Muscle - Reps', prompt: 'I want to do high volume legs today so set everything to 20 reps' },
  { type: 'Muscle - Sets', prompt: 'can we do 5 sets for every chest exercise?' },
  { type: 'Muscle - Remove', prompt: 'I hurt my wrists, take out all the forearm stuff' },
  { type: 'Safety - Fuzzy Name', prompt: 'set deadlifts to a hundred' },
  { type: 'Safety - Day Boundary', prompt: 'switch lat pulldowns to 50' },
  { type: 'Logic - Relative Math', prompt: 'add 5kg to my decline crunches' },
  { type: 'Logic - Ambiguity', prompt: 'leg extensions 12 reps' },
  { type: 'Safety - Duplicate Add', prompt: 'hey add decline crunches to day 2 again' },
  { type: 'Variant - Single', prompt: 'switch my lat pulldowns to close grip today' },
  { type: 'Variant - Multi', prompt: 'make lat pulldowns and cable rows neutral grip for this workout' },
  { type: 'Variant - Muscle', prompt: 'use incline variations for all chest moves today' },
  { type: 'Variant - Safety', prompt: 'give me a wrist-friendly variant for barbell curls' },
  { type: 'Injury - Mild', prompt: 'my shoulder feels a little irritated today, go easier on pressing' },
  { type: 'Injury - Moderate', prompt: "my lower back is sore, adjust today's plan so it doesn't flare up" },
  { type: 'Injury - Severe', prompt: 'I tweaked my knee badly, I cannot do any painful leg work today' },
];

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

