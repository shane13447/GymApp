import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { corsHeadersForRequest, jsonResponse } from '../_shared/cors.ts';
import {
  classifyUpstreamHttpStatus,
  evaluateAuthMode,
  extractModelText,
  extractStrictToonCandidate,
  formatInvalidToonDiagnostics,
  formatProxyDebugLog,
  getBearerToken,
  isValidToonResponse,
  parseAuthModeFromValue,
  parseProviderFromValue,
  resolveProviderConfig,
} from './logic.ts';
import { createCoachProxyHandler } from './handler.ts';

const handler = createCoachProxyHandler({
  fetchImpl: fetch,
  readEnv: (name: string) => Deno.env.get(name),
  corsHeadersForRequest,
  jsonResponse,
  parseAuthModeFromValue,
  getBearerToken,
  evaluateAuthMode,
  parseProviderFromValue,
  resolveProviderConfig,
  extractModelText,
  classifyUpstreamHttpStatus,
  isValidToonResponse,
  extractStrictToonCandidate,
  formatInvalidToonDiagnostics,
  formatProxyDebugLog,
});

if (typeof Deno !== 'undefined' && 'serve' in Deno) {
  Deno.serve(handler);
}
