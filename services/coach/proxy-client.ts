import Constants from 'expo-constants';

import { type CoachProxyMessage } from '@/lib/coach-utils';
import {
  COACH_API_TIMEOUT_MS,
  extractProxyResponseText,
  resolveProxyUrlFromCandidates,
} from '@/lib/coach-proxy';

/**
 * Resolves the Coach proxy URL from Expo config and environment fallbacks.
 * The returned string is empty when no configured candidate resolves cleanly.
 */
export const getCoachProxyUrl = (): string => {
  const constantsWithManifests = Constants as typeof Constants & {
    manifest?: { extra?: { coachProxyUrl?: unknown } };
    manifest2?: { extra?: { expoClient?: { extra?: { coachProxyUrl?: unknown } } } };
  };

  const candidates: unknown[] = [
    Constants.expoConfig?.extra?.coachProxyUrl,
    constantsWithManifests.manifest?.extra?.coachProxyUrl,
    constantsWithManifests.manifest2?.extra?.expoClient?.extra?.coachProxyUrl,
    process.env.EXPO_PUBLIC_COACH_PROXY_URL,
  ];

  return resolveProxyUrlFromCandidates(candidates);
};

/**
 * Sends a Coach proxy request and returns the extracted text payload.
 * Transport timeouts and empty responses are converted into explicit errors for the screen.
 */
export const callCoachProxy = async (
  proxyUrl: string,
  messages: CoachProxyMessage[],
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
    console.log('[COACH PROXY] Raw API response body:', rawBody);

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
