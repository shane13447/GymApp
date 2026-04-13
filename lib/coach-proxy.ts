/**
 * Coach proxy pure utilities extracted from Coach.tsx.
 *
 * Contains response-parsing logic and URL resolution that has no
 * React or platform dependencies, making it independently testable.
 * The callCoachProxy async function remains in Coach.tsx because it
 * depends on AbortController and fetch side-effects.
 */

/**
 * Timeout for coach proxy API calls (ms).
 * Kept as a named constant so callers can reference it.
 */
export const COACH_API_TIMEOUT_MS = 60000;

/**
 * Resolves the coach proxy URL from an ordered list of candidate values.
 *
 * Candidates are typically gathered from expo-constants manifests and
 * environment variables. The first non-empty trimmed string wins.
 *
 * @param candidates - Ordered list of candidate URL values (may include undefined, null, non-strings)
 * @returns First valid trimmed URL string, or empty string if none found
 */
export const resolveProxyUrlFromCandidates = (candidates: unknown[]): string => {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }
  return '';
};

/**
 * Extracts the response text from a raw coach proxy response body.
 *
 * The proxy may return plain text, a JSON-wrapped string, or a structured
 * JSON object with various known response fields. This function tries each
 * known field in priority order and falls back to the trimmed raw body.
 *
 * Priority order:
 * 1. Top-level string (if JSON-parsed result is a string)
 * 2. `response` field
 * 3. `content` field
 * 4. `output` field
 * 5. `text` field
 * 6. `message.content` field
 * 7. `choices[0].text` field
 * 8. `choices[0].message.content` field
 * 9. Raw trimmed body (fallback)
 *
 * @param rawBody - Raw response body string from the proxy
 * @returns Extracted response text, or empty string if input is empty
 */
export const extractProxyResponseText = (rawBody: string): string => {
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