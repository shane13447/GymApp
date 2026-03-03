import Constants from 'expo-constants';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

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
