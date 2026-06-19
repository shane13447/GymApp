import Constants from 'expo-constants';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolves the Supabase URL and publishable key from Expo config and env vars.
 *
 * Checks each known location in priority order (expoConfig extra, legacy
 * manifest/manifest2 extras, then `EXPO_PUBLIC_*` environment variables),
 * returning the first non-empty trimmed string for each value.
 *
 * @returns {{ url: string; publishableKey: string }} Resolved config; values are empty strings when unset.
 */
const getSupabaseConfig = (): { url: string; publishableKey: string } => {
  const constantsWithManifests = Constants as typeof Constants & {
    manifest?: { extra?: { supabaseUrl?: unknown; supabasePublishableKey?: unknown } };
    manifest2?: {
      extra?: {
        expoClient?: {
          extra?: { supabaseUrl?: unknown; supabasePublishableKey?: unknown };
        };
      };
    };
  };

  const urlCandidates: unknown[] = [
    Constants.expoConfig?.extra?.supabaseUrl,
    constantsWithManifests.manifest?.extra?.supabaseUrl,
    constantsWithManifests.manifest2?.extra?.expoClient?.extra?.supabaseUrl,
    process.env.EXPO_PUBLIC_SUPABASE_URL,
  ];

  const keyCandidates: unknown[] = [
    Constants.expoConfig?.extra?.supabasePublishableKey,
    constantsWithManifests.manifest?.extra?.supabasePublishableKey,
    constantsWithManifests.manifest2?.extra?.expoClient?.extra?.supabasePublishableKey,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ];

  /**
   * Returns the first candidate that is a non-empty trimmed string.
   *
   * @param {unknown[]} candidates - Possible config values in priority order.
   * @returns {string} The first valid trimmed string, or `''` when none qualify.
   */
  const resolveCandidate = (candidates: unknown[]): string => {
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
    return '';
  };

  return {
    url: resolveCandidate(urlCandidates),
    publishableKey: resolveCandidate(keyCandidates),
  };
};

let supabaseClient: SupabaseClient | null = null;

/**
 * Returns a lazily-created, memoized Supabase client.
 *
 * The client is created once on first call using the resolved config and
 * reused thereafter. Returns `null` when URL or key cannot be resolved.
 *
 * @returns {SupabaseClient | null} The shared client, or `null` if not configured.
 */
export const getSupabaseClient = (): SupabaseClient | null => {
  if (supabaseClient) {
    return supabaseClient;
  }

  const { url, publishableKey } = getSupabaseConfig();
  if (!url || !publishableKey) {
    return null;
  }

  supabaseClient = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return supabaseClient;
};

/**
 * Retrieves the current session's access token, if any.
 *
 * Returns `null` when the client is unconfigured, no session exists, or the
 * session lookup errors or throws.
 *
 * @returns {Promise<string | null>} The access token, or `null` when unavailable.
 */
export const getSupabaseAccessToken = async (): Promise<string | null> => {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  try {
    const {
      data: { session },
      error,
    } = await client.auth.getSession();

    if (error) {
      return null;
    }

    const typedSession = session as Session | null;
    return typedSession?.access_token ?? null;
  } catch {
    return null;
  }
};
