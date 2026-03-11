/**
 * Coach Screen
 * AI-powered workout coach for modifying workout queues and general fitness advice
 */

import Constants from 'expo-constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import WorkoutModificationModal from '@/components/WorkoutModificationModal';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getSupabaseAccessToken } from '@/lib/supabase';
import { formatExerciseDisplayName } from '@/lib/utils';
import * as db from '@/services/database';
import {
  buildCompressedPrompt,
  compareWorkoutQueues,
  COMPRESSED_SYSTEM_PROMPT,
  differencesToProposedChanges,
  evaluateInjurySemanticOutcome,
  evaluatePromptIntentOutcome,
  evaluateVariantSemanticOutcome,
  extractTargetExerciseRefs,
  parseQueueFormatResponse,
  preprocessMuscleGroupRequest,
  type TargetedExerciseRef,
  validateChanges,
  validateQueueStructure,
  type ProposedChanges,
} from '@/services/workout-queue-modifier';
import type { WorkoutQueueItem } from '@/types';
import { CoachMode } from '@/types';

// Test prompts for automated testing
// Note: These use values DIFFERENT from current queue to ensure changes are detected
const TEST_PROMPTS = [
  // --- TIER 1: CONVERSATIONAL BASICS ---
  { type: 'Single - Weight', prompt: 'I want to do 25kg for decline crunches today' },
  { type: 'Single - Reps', prompt: 'can we bump leg extensions up to 15 reps?' },
  { type: 'Single - Sets', prompt: 'sets of 5 for lat pulldowns please' },
  { type: 'Single - Add', prompt: 'put barbell curls into my day 2 workout' },
  { type: 'Single - Remove', prompt: 'get rid of fingertip curls' },

  // --- TIER 2: MULTI-TASKING ---
  { type: 'Multi - Weight', prompt: 'up the crunches to 30 and bicep curls to 10' },
  { type: 'Multi - Reps', prompt: 'make calf press 20 reps but drop leg extensions to 6' },
  { type: 'Multi - Sets', prompt: 'I want 4 sets of pulldowns and 5 sets of triangle rows' },
  { type: 'Multi - Add', prompt: 'can you add hammer curls to day 2 and also dumbbell flyes to day 3?' },
  { type: 'Multi - Remove', prompt: 'delete fingertip curls and reverse forearm curls' },

  // --- TIER 2.5: CONCURRENT ATTRIBUTES ---
  { type: 'Single - Weight + Reps', prompt: 'change decline crunches weight to 15 and reps to 5' },
  { type: 'Single - Reps + Weight', prompt: 'set leg extensions to 12 reps and 40kg' },
  { type: 'Single - Weight + Sets', prompt: 'crunches at 20kg for 5 sets' },
  { type: 'Single - Full Mod', prompt: 'make lat pulldowns 50kg, 10 reps, and 4 sets' },

  // --- TIER 3: INFORMAL BATCHING ---
  { type: 'Muscle - Weight', prompt: 'put all my back exercises at 30kg' },
  { type: 'Muscle - Reps', prompt: 'I want to do high volume legs today so set everything to 20 reps' },
  { type: 'Muscle - Sets', prompt: 'can we do 5 sets for every chest exercise?' },
  { type: 'Muscle - Remove', prompt: 'I hurt my wrists, take out all the forearm stuff' },

  // --- TIER 4: SAFETY & SLANG ---
  // Slang/Fuzzy matching
  { type: 'Safety - Fuzzy Name', prompt: 'set deadlifts to a hundred' },

  // Implicit context (Asking for a change without saying "weight" or "reps")
  { type: 'Safety - Day Boundary', prompt: 'switch lat pulldowns to 50' },

  // Testing if the LLM/Repair system handles "by" vs "to"
  { type: 'Logic - Relative Math', prompt: 'add 5kg to my decline crunches' },

  // Very blunt/short phrasing
  { type: 'Logic - Ambiguity', prompt: 'leg extensions 12 reps' },

  // Natural language duplication
  { type: 'Safety - Duplicate Add', prompt: 'hey add decline crunches to day 2 again' },

  // --- TIER 5: VARIANT COVERAGE ---
  { type: 'Variant - Single', prompt: 'switch my lat pulldowns to close grip today' },
  {
    type: 'Variant - Multi',
    prompt: 'make lat pulldowns and cable rows neutral grip for this workout',
  },
  { type: 'Variant - Muscle', prompt: 'use incline variations for all chest moves today' },
  { type: 'Variant - Safety', prompt: 'give me a wrist-friendly variant for barbell curls' },

  // --- TIER 6: INJURY SCENARIOS ---
  { type: 'Injury - Mild', prompt: 'my shoulder feels a little irritated today, go easier on pressing' },
  { type: 'Injury - Moderate', prompt: 'my lower back is sore, adjust today\'s plan so it doesn\'t flare up' },
  { type: 'Injury - Severe', prompt: 'I tweaked my knee badly, I cannot do any painful leg work today' },
];

type CoachProxyMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type CoachTestResult = {
  type: string;
  success: boolean;
  error?: string;
};

const inferRequestedVariant = (prompt: string): string | null => {
  const lowerPrompt = prompt.toLowerCase();

  const explicitVariants = [
    'neutral grip',
    'close grip',
    'wide grip',
    'incline',
    'decline',
    'high bar',
    'low bar',
  ];

  for (const variant of explicitVariants) {
    if (lowerPrompt.includes(variant)) {
      return variant;
    }
  }

  if (lowerPrompt.includes('wrist-friendly')) {
    return 'neutral grip';
  }

  return null;
};

const inferInjurySeverity = (type: string): 'mild' | 'moderate' | 'severe' | null => {
  const lowerType = type.toLowerCase();
  if (lowerType.includes('injury - severe')) return 'severe';
  if (lowerType.includes('injury - moderate')) return 'moderate';
  if (lowerType.includes('injury - mild')) return 'mild';
  return null;
};

const COACH_API_TIMEOUT_MS = 60000;

const getCoachProxyUrl = (): string => {
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

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }

  return '';
};

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

export default function CoachScreen() {
  const [mode, setMode] = useState<CoachMode>(CoachMode.ModifyWorkout);
  const [inputText, setInputText] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [proposedChanges, setProposedChanges] = useState<ProposedChanges | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [workoutQueue, setWorkoutQueue] = useState<WorkoutQueueItem[]>([]);
  const [generatedQueue, setGeneratedQueue] = useState<WorkoutQueueItem[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [proxyResponse, setProxyResponse] = useState('');
  const [proxyError, setProxyError] = useState('');
  const targetedExercisesRef = useRef<TargetedExerciseRef[]>([]); // Sync ref for race condition fix
  const lastProcessedResponseRef = useRef<string>('');
  const coachProxyUrl = useRef(getCoachProxyUrl());
  const requestCounterRef = useRef(0);
  const activeRequestIdRef = useRef<number | null>(null);
  const sendLockRef = useRef(false);

  // Test mode state
  const [isTestMode, setIsTestMode] = useState(false);
  const [testIndex, setTestIndex] = useState(0);
  const [testResults, setTestResults] = useState<CoachTestResult[]>([]);
  const pendingNextTestRef = useRef<number | null>(null);
  const totalTests = TEST_PROMPTS.length;

  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? '#ffffff' : '#000000';

  const loadData = useCallback(async () => {
    try {
      const queue = await db.getWorkoutQueue();
      setWorkoutQueue(queue);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  }, []);

  // Load workout queue on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keep response/error state in sync with proxy transport
  useEffect(() => {
    if (proxyResponse) {
      setResponse(proxyResponse);
    }

    if (!isGenerating && loading && mode === CoachMode.Chat) {
      setLoading(false);
      if (proxyResponse) {
        setError('');
      }
    }
  }, [proxyResponse, isGenerating, loading, mode]);

  useEffect(() => {
    if (proxyError) {
      setError(proxyError);
      setLoading(false);
      setIsGenerating(false);
    }
  }, [proxyError]);

  // Handle response in modify_workout mode
  useEffect(() => {
    if (
      mode === CoachMode.ModifyWorkout &&
      proxyResponse &&
      !isGenerating &&
      proxyResponse !== lastProcessedResponseRef.current
    ) {
      console.log('[QUEUE FORMAT] Processing LLM response');
      lastProcessedResponseRef.current = proxyResponse;

      // Parse and repair in one step - repair is now integrated into parseQueueFormatResponse
      // Use ref to avoid race condition with async state updates
      const parsedQueue = parseQueueFormatResponse(proxyResponse, workoutQueue, inputText, targetedExercisesRef.current);

      if (parsedQueue && parsedQueue.length > 0) {
        const structureValidation = validateQueueStructure(workoutQueue, parsedQueue);
        if (!structureValidation.valid) {
          console.warn('[QUEUE FORMAT] Structure validation failed:', structureValidation.errors);

          const structureError = `Unable to safely apply AI changes: ${structureValidation.errors.join(' ')}`;

          if (isTestMode) {
            const currentTest = TEST_PROMPTS[testIndex];
            console.log(
              `[TEST ${testIndex + 1}/${TEST_PROMPTS.length}] ${currentTest.type}: STRUCTURE VALIDATION FAILED`
            );
            setTestResults((prev) => [
              ...prev,
              { type: currentTest.type, success: false, error: structureError },
            ]);

            if (testIndex < TEST_PROMPTS.length - 1) {
              pendingNextTestRef.current = testIndex + 1;
            } else {
              setIsTestMode(false);
              console.log('[TEST] All tests complete!');
              Alert.alert('Test Complete', `Ran ${TEST_PROMPTS.length} tests. Check console for results.`);
            }
          } else {
            setError(structureError);
          }

          setGeneratedQueue(null);
          setProposedChanges(null);
          setShowModal(false);
          setLoading(false);
          return;
        }

        console.log('[QUEUE FORMAT] Parsed and repaired queue with', parsedQueue.length, 'items');

        setGeneratedQueue(parsedQueue);

        const differences = compareWorkoutQueues(workoutQueue, parsedQueue);

        if (differences.length > 0) {
          const formatted = differencesToProposedChanges(differences);

          // Validate for unexpected changes
          const validation = validateChanges(inputText, differences);
          if (!validation.valid) {
            console.warn('[VALIDATION] Warnings:', validation.warnings);
          }

          setProposedChanges(formatted);

          // In test mode, auto-discard and log result
          if (isTestMode) {
            const currentTest = TEST_PROMPTS[testIndex];
            const isVariantTest = currentTest.type.startsWith('Variant -');
            const isInjuryTest = currentTest.type.startsWith('Injury -');

            let semanticResult: { passed: boolean; reason?: string } = { passed: true };

            if (isVariantTest) {
              const requestedVariant = inferRequestedVariant(currentTest.prompt) ?? '';
              semanticResult = evaluateVariantSemanticOutcome(
                currentTest.prompt,
                workoutQueue,
                parsedQueue,
                targetedExercisesRef.current,
                requestedVariant
              );
            } else if (isInjuryTest) {
              const injurySeverity = inferInjurySeverity(currentTest.type);
              const semanticRequest = injurySeverity
                ? `${injurySeverity} injury: ${currentTest.prompt}`
                : currentTest.prompt;

              semanticResult = evaluateInjurySemanticOutcome(
                semanticRequest,
                workoutQueue,
                parsedQueue,
                targetedExercisesRef.current.map((exercise) => exercise.displayName)
              );
            }

            const deterministicIntentResult =
              !isVariantTest && !isInjuryTest
                ? evaluatePromptIntentOutcome(
                    currentTest.prompt,
                    workoutQueue,
                    parsedQueue,
                    targetedExercisesRef.current
                  )
                : { passed: true };

            const hasWarnings = !validation.valid;
            const success = hasWarnings
              ? false
              : semanticResult.passed && deterministicIntentResult.passed;

            console.log(
              `[TEST ${testIndex + 1}/${TEST_PROMPTS.length}] ${currentTest.type}: ${success ? 'SUCCESS' : 'FAILED'}`
            );

            if (hasWarnings) {
              console.log(`[TEST][FAILED_VALIDATION]`, validation.warnings);
            }

            if (!semanticResult.passed) {
              console.log(`[TEST][FAILED_SEMANTIC]`, semanticResult.reason);
            }

            if (!deterministicIntentResult.passed) {
              console.log(`[TEST][FAILED_INTENT_MISMATCH]`, deterministicIntentResult.reason);
            }

            console.log(`[TEST] Changes proposed:`, formatted);
            const failureReasons: string[] = [];
            if (hasWarnings) {
              failureReasons.push(validation.warnings.join('; '));
            }
            if (!semanticResult.passed) {
              failureReasons.push(
                semanticResult.reason ?? `Semantic validation failed for ${currentTest.type}.`
              );
            }
            if (!deterministicIntentResult.passed) {
              failureReasons.push(
                deterministicIntentResult.reason ?? `Intent mismatch for ${currentTest.type}.`
              );
            }

            setTestResults((prev) => [
              ...prev,
              {
                type: currentTest.type,
                success,
                error: failureReasons.length > 0 ? failureReasons.join('; ') : undefined,
              },
            ]);

            // Auto-discard and proceed to next test
            setGeneratedQueue(null);
            setProposedChanges(null);

            // Schedule next test
            if (testIndex < TEST_PROMPTS.length - 1) {
              pendingNextTestRef.current = testIndex + 1;
            } else {
              // All tests complete
              setIsTestMode(false);
              console.log('[TEST] All tests complete!');
              Alert.alert('Test Complete', `Ran ${TEST_PROMPTS.length} tests. Check console for results.`);
            }
          } else {
            // Block confirmation when validation has warnings
            if (!validation.valid) {
              setGeneratedQueue(null);
              setProposedChanges(null);
              setShowModal(false);
              setError(`Unable to apply AI changes safely: ${validation.warnings.join(' ')}`);
            } else {
              setError('');
              setShowModal(true);
            }
          }
        } else {
          if (isTestMode) {
            const currentTest = TEST_PROMPTS[testIndex];
            console.log(
              `[TEST ${testIndex + 1}/${TEST_PROMPTS.length}] ${currentTest.type}: NO CHANGES DETECTED`
            );
            setTestResults((prev) => [
              ...prev,
              { type: currentTest.type, success: false, error: 'No changes detected' },
            ]);

            // Schedule next test
            if (testIndex < TEST_PROMPTS.length - 1) {
              pendingNextTestRef.current = testIndex + 1;
            } else {
              setIsTestMode(false);
              console.log('[TEST] All tests complete!');
              Alert.alert('Test Complete', `Ran ${TEST_PROMPTS.length} tests. Check console for results.`);
            }
          } else {
            Alert.alert('No Changes', 'The generated workout queue is identical to the current one.');
          }
        }

        setLoading(false);
      } else {
        console.warn('[QUEUE FORMAT] Failed to parse response');

        if (isTestMode) {
          const currentTest = TEST_PROMPTS[testIndex];
          console.log(`[TEST ${testIndex + 1}/${TEST_PROMPTS.length}] ${currentTest.type}: PARSE FAILED`);
          setTestResults((prev) => [
            ...prev,
            { type: currentTest.type, success: false, error: 'Parse failed' },
          ]);

          // Schedule next test
          if (testIndex < TEST_PROMPTS.length - 1) {
            pendingNextTestRef.current = testIndex + 1;
          } else {
            setIsTestMode(false);
            console.log('[TEST] All tests complete!');
            Alert.alert('Test Complete', `Ran ${TEST_PROMPTS.length} tests. Check console for results.`);
          }
          setLoading(false);
        } else {
          setError(
            'Could not parse queue from response. Expected format like "Q0:D1:BBP/80/5/5,BBS/100/5/5". Please try again.'
          );
          setLoading(false);
        }
      }
    }
  }, [proxyResponse, isGenerating, mode, workoutQueue, isTestMode, testIndex, inputText, testResults]);

  const sendToCoach = async () => {
    if (sendLockRef.current || loading || isGenerating) {
      return;
    }

    const trimmedInput = inputText.trim();
    if (!trimmedInput) {
      setError('Please enter some text');
      return;
    }

    if (!coachProxyUrl.current) {
      setError('Coach proxy URL is not configured.');
      return;
    }

    sendLockRef.current = true;

    const requestId = requestCounterRef.current + 1;
    requestCounterRef.current = requestId;
    activeRequestIdRef.current = requestId;

    setLoading(true);
    setIsGenerating(true);
    setError('');
    setProxyError('');
    setResponse('');
    setProxyResponse('');
    setGeneratedQueue(null);
    targetedExercisesRef.current = []; // Reset ref too
    lastProcessedResponseRef.current = '';

    try {
      const accessToken = await getSupabaseAccessToken();

      if (mode === CoachMode.ModifyWorkout) {
        if (workoutQueue.length === 0) {
          setError('No workout queue found. Please create a program and start a workout first.');
          setLoading(false);
          setIsGenerating(false);
          sendLockRef.current = false;
          return;
        }

        const {
          processedRequest,
          wasProcessed,
          matchedExercises,
          matchedExerciseRefs,
          muscleGroupDetected,
          noMatchesFound,
        } = preprocessMuscleGroupRequest(trimmedInput, workoutQueue);

        // Store matched exercises for use in repair system
        // For muscle group requests, use matchedExercises from preprocessor
        // For other requests, extract from the original request
        const exercisesToStore =
          wasProcessed && matchedExerciseRefs.length > 0
            ? matchedExerciseRefs
            : extractTargetExerciseRefs(trimmedInput, workoutQueue);
        console.log(
          '[TARGETED] Setting targetedExercises:',
          exercisesToStore.map((exercise) => exercise.displayName)
        );
        targetedExercisesRef.current = exercisesToStore; // Sync update for immediate use
        
        // Check if user mentioned a muscle group but no matching exercises exist in queue
        if (noMatchesFound && muscleGroupDetected) {
          setError(
            `No ${muscleGroupDetected} exercises found in your workout queue. The queue only contains exercises for other muscle groups.`
          );
          setLoading(false);
          setIsGenerating(false);
          sendLockRef.current = false;
          return;
        }

        if (wasProcessed) {
          console.log(
            `[PREPROCESS] Muscle group detected, matched exercises: ${matchedExercises.join(', ')}`
          );
        }

        const userPrompt = buildCompressedPrompt(processedRequest, workoutQueue);
        console.log(`[COMPRESSED] User prompt: ${userPrompt}`);
        console.log(
          `[PROMPT LENGTH] System: ${COMPRESSED_SYSTEM_PROMPT.length}, User: ${userPrompt.length}, Total: ${COMPRESSED_SYSTEM_PROMPT.length + userPrompt.length}`
        );

        const messages: CoachProxyMessage[] = [
          { role: 'system', content: COMPRESSED_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ];

        const generatedText = await callCoachProxy(coachProxyUrl.current, messages, accessToken);
        if (activeRequestIdRef.current !== requestId) {
          return;
        }
        setProxyResponse(generatedText);
      } else {
        const messages: CoachProxyMessage[] = [
          {
            role: 'system',
            content:
              'You are a fitness coach. Provide motivational advice and help with workout planning and execution.',
          },
          { role: 'user', content: trimmedInput },
        ];

        const generatedText = await callCoachProxy(coachProxyUrl.current, messages, accessToken);
        if (activeRequestIdRef.current !== requestId) {
          return;
        }
        setProxyResponse(generatedText);
      }
    } catch (err) {
      if (activeRequestIdRef.current !== requestId) {
        return;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        setProxyError('Coach proxy request timed out. Please try again.');
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Failed to get response';
        setProxyError(errorMessage);
      }
      console.error('Error calling coach proxy:', err);
    } finally {
      if (activeRequestIdRef.current === requestId) {
        activeRequestIdRef.current = null;
        setIsGenerating(false);
        if (mode === CoachMode.Chat) {
          setLoading(false);
        }
      }
      sendLockRef.current = false;
    }
  };

  // Run a specific test by index
  const runNextTest = useCallback(
    async (index: number) => {
      if (index >= TEST_PROMPTS.length) {
        setIsTestMode(false);
        console.log('[TEST] All tests complete!');
        return;
      }

      // Wait for any previous generation to complete
      if (isGenerating) {
        console.log('[TEST] Waiting for previous generation to complete...');
        pendingNextTestRef.current = index;
        return;
      }

      if (!coachProxyUrl.current) {
        setError('Coach proxy URL is not configured.');
        setIsTestMode(false);
        return;
      }

      const test = TEST_PROMPTS[index];
      console.log(`\n[TEST ${index + 1}/${TEST_PROMPTS.length}] Running: ${test.type}`);
      console.log(`[TEST] Prompt: "${test.prompt}"`);

      setTestIndex(index);
      setInputText(test.prompt);
      setError('');
      setProxyError('');
      setResponse('');
      setProxyResponse('');
      setGeneratedQueue(null);
      lastProcessedResponseRef.current = '';
      setLoading(true);
      setIsGenerating(true);

      try {
        const accessToken = await getSupabaseAccessToken();

        const {
          processedRequest,
          wasProcessed,
          matchedExercises,
          matchedExerciseRefs,
          muscleGroupDetected,
          noMatchesFound,
        } = preprocessMuscleGroupRequest(test.prompt, workoutQueue);

        // Check if user mentioned a muscle group but no matching exercises exist in queue
        if (noMatchesFound && muscleGroupDetected) {
          console.log(
            `[TEST ${index + 1}/${TEST_PROMPTS.length}] ${test.type}: SKIPPED - No ${muscleGroupDetected} exercises in queue`
          );
          setTestResults((prev) => [
            ...prev,
            { type: test.type, success: false, error: `No ${muscleGroupDetected} exercises` },
          ]);
          setLoading(false);
          setIsGenerating(false);

          if (index < TEST_PROMPTS.length - 1) {
            pendingNextTestRef.current = index + 1;
          } else {
            setIsTestMode(false);
            Alert.alert('Test Complete', `Ran ${TEST_PROMPTS.length} tests. Check console for results.`);
          }
          return;
        }

        if (wasProcessed) {
          console.log(
            `[PREPROCESS] Muscle group detected, matched exercises: ${matchedExercises.join(', ')}`
          );
        }

        // Store matched exercises for use in repair system (same as sendToCoach)
        const exercisesToStore =
          wasProcessed && matchedExerciseRefs.length > 0
            ? matchedExerciseRefs
            : extractTargetExerciseRefs(test.prompt, workoutQueue);
        console.log(
          '[TARGETED] Setting targetedExercises:',
          exercisesToStore.map((exercise) => exercise.displayName)
        );
        targetedExercisesRef.current = exercisesToStore;
        
        const userPrompt = buildCompressedPrompt(processedRequest, workoutQueue);
        console.log(`[COMPRESSED] User prompt: ${userPrompt}`);
        console.log(
          `[PROMPT LENGTH] System: ${COMPRESSED_SYSTEM_PROMPT.length}, User: ${userPrompt.length}, Total: ${COMPRESSED_SYSTEM_PROMPT.length + userPrompt.length}`
        );

        const messages: CoachProxyMessage[] = [
          { role: 'system', content: COMPRESSED_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ];

        const generatedText = await callCoachProxy(coachProxyUrl.current, messages, accessToken);
        setProxyResponse(generatedText);
      } catch (err) {
        console.log(`[TEST ${index + 1}/${TEST_PROMPTS.length}] ${test.type}: ERROR - ${err}`);
        const errorMessage =
          err instanceof Error && err.name === 'AbortError'
            ? 'Coach proxy request timed out.'
            : String(err);

        setTestResults((prev) => [...prev, { type: test.type, success: false, error: errorMessage }]);
        setProxyError(errorMessage);

        if (index < TEST_PROMPTS.length - 1) {
          pendingNextTestRef.current = index + 1;
        } else {
          setIsTestMode(false);
          Alert.alert('Test Complete', `Ran ${TEST_PROMPTS.length} tests. Check console for results.`);
        }
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, workoutQueue]
  );

  // Watch for pending test and run when proxy call is idle
  useEffect(() => {
    if (pendingNextTestRef.current !== null && !isGenerating && isTestMode) {
      const nextIndex = pendingNextTestRef.current;
      pendingNextTestRef.current = null;
      // Small delay to ensure state is settled
      setTimeout(() => {
        runNextTest(nextIndex);
      }, 500);
    }
  }, [isGenerating, isTestMode, runNextTest]);

  // Start the test suite
  const startTests = () => {
    if (!coachProxyUrl.current) {
      setError('Coach proxy URL is not configured.');
      return;
    }

    if (workoutQueue.length === 0) {
      setError('No workout queue found. Please create a program and start a workout first.');
      return;
    }

    setError('');
    console.log('\n========================================');
    console.log('[TEST] Starting automated test suite');
    console.log(`[TEST] ${totalTests} tests to run`);
    console.log('========================================\n');

    setIsTestMode(true);
    setTestIndex(0);
    setTestResults([]);
    runNextTest(0);
  };

  const handleConfirmChanges = async () => {
    if (!generatedQueue) {
      Alert.alert('Error', 'No generated queue to apply.');
      return;
    }

    try {
      await db.saveWorkoutQueue(generatedQueue);
      const updatedQueue = await db.getWorkoutQueue();
      setWorkoutQueue(updatedQueue);
      Alert.alert('Success', 'Workout queue has been updated!');
      setShowModal(false);
      setProposedChanges(null);
      setGeneratedQueue(null);
      setInputText('');
    } catch (err) {
      console.error('Error applying changes:', err);
      Alert.alert('Error', 'Failed to apply changes.');
    }
  };

  const handleCancelChanges = () => {
    setShowModal(false);
    setProposedChanges(null);
    setGeneratedQueue(null);
  };

  const switchMode = useCallback(async (newMode: CoachMode) => {
    setMode(newMode);
    setInputText('');
    setResponse('');
    setError('');
    if (newMode === CoachMode.ModifyWorkout) {
      const queue = await db.getWorkoutQueue();
      setWorkoutQueue(queue);
    }
  }, []);

  const renderQueueItem = useCallback(
    ({ item: queueItem }: { item: WorkoutQueueItem }) => (
      <ThemedView
        className="mb-3 p-3 rounded-lg border border-gray-300 dark:border-gray-600"
        lightColor="#fff"
        darkColor="#1e1e1e"
      >
        <ThemedText className="font-bold text-sm mb-2 opacity-90">
          {queueItem.programName} - Day {queueItem.dayNumber}
        </ThemedText>
        {queueItem.exercises.map((exercise, exIndex) => (
          <ThemedView
            key={`${exercise.name}-${exIndex}`}
            className="p-2 rounded mb-1"
            lightColor="#f9f9f9"
            darkColor="#2a2a2a"
          >
            <ThemedText className="font-semibold text-sm" numberOfLines={1}>
              {formatExerciseDisplayName(exercise.name, exercise.variant)}
            </ThemedText>
            <View className="flex-row flex-wrap gap-3 mt-1">
              <ThemedText className="text-xs opacity-70">Sets: {exercise.sets || 'N/A'}</ThemedText>
              <ThemedText className="text-xs opacity-70">Reps: {exercise.reps || 'N/A'}</ThemedText>
              <ThemedText className="text-xs opacity-70">
                Weight: {exercise.weight || 'N/A'}
              </ThemedText>
            </View>
          </ThemedView>
        ))}
      </ThemedView>
    ),
    []
  );

  return (
    <ParallaxScrollView>
      <ThemedView className="flex-row items-center gap-2">
        <ThemedText type="title">Coach</ThemedText>
        <HelloWave />
      </ThemedView>

      <ThemedView className="gap-4 mt-5">
        {/* Mode Selector */}
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => switchMode(CoachMode.ModifyWorkout)}
            className="flex-1"
            accessibilityRole="button"
            accessibilityState={{ selected: mode === CoachMode.ModifyWorkout }}
          >
            {({ pressed }) => (
              <View
                className={`py-2.5 px-4 rounded-lg items-center justify-center ${
                  mode === CoachMode.ModifyWorkout
                    ? 'bg-blue-500'
                    : 'bg-gray-200 dark:bg-gray-700'
                } ${pressed ? 'opacity-70' : ''}`}
              >
                <ThemedText
                  className={`text-sm font-semibold ${
                    mode === CoachMode.ModifyWorkout ? 'text-white' : ''
                  }`}
                >
                  Modify Workouts
                </ThemedText>
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={() => switchMode(CoachMode.Chat)}
            className="flex-1"
            accessibilityRole="button"
            accessibilityState={{ selected: mode === CoachMode.Chat }}
          >
            {({ pressed }) => (
              <View
                className={`py-2.5 px-4 rounded-lg items-center justify-center ${
                  mode === CoachMode.Chat ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
                } ${pressed ? 'opacity-70' : ''}`}
              >
                <ThemedText
                  className={`text-sm font-semibold ${mode === CoachMode.Chat ? 'text-white' : ''}`}
                >
                  Chat
                </ThemedText>
              </View>
            )}
          </Pressable>
        </View>

        <ThemedText type="subtitle">
          {mode === CoachMode.ModifyWorkout
            ? 'Request workout modifications:'
            : 'Ask your AI Coach:'}
        </ThemedText>

        {/* Input - Moved to top */}
        <TextInput
          className="border border-gray-300 dark:border-gray-600 rounded-lg p-3 min-h-[100px] bg-white dark:bg-gray-800"
          value={inputText}
          onChangeText={setInputText}
          placeholder="Enter your question or message..."
          placeholderTextColor="#999"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={Boolean(coachProxyUrl.current)}
          style={{ color: textColor, fontSize: 16 }}
          accessibilityLabel="Message input"
        />

        {/* Send Button */}
        <Pressable
          onPress={sendToCoach}
          disabled={loading || isGenerating || !coachProxyUrl.current}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          {({ pressed }) => (
            <View
              className={`bg-blue-500 px-6 py-3 rounded-lg items-center justify-center min-h-[44px] ${
                loading || isGenerating || !coachProxyUrl.current ? 'opacity-50' : ''
              } ${pressed ? 'opacity-70' : ''}`}
            >
              {loading || isGenerating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <ThemedText className="text-white font-semibold">Send</ThemedText>
              )}
            </View>
          )}
        </Pressable>

        {/* Test Button - Only show in ModifyWorkout mode */}
        {mode === CoachMode.ModifyWorkout && (
          <Pressable
            onPress={startTests}
            disabled={loading || isGenerating || !coachProxyUrl.current || isTestMode}
            accessibilityRole="button"
            accessibilityLabel={`Run all tests (${totalTests})`}
          >
            {({ pressed }) => (
              <View
                className={`bg-purple-500 px-6 py-3 rounded-lg items-center justify-center min-h-[44px] ${
                  loading || isGenerating || !coachProxyUrl.current || isTestMode ? 'opacity-50' : ''
                } ${pressed ? 'opacity-70' : ''}`}
              >
                {isTestMode ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <ThemedText className="text-white font-semibold">
                      Test {testIndex + 1}/{totalTests}
                    </ThemedText>
                  </View>
                ) : (
                  <ThemedText className="text-white font-semibold">Run All Tests ({totalTests})</ThemedText>
                )}
              </View>
            )}
          </Pressable>
        )}

        {/* Error Display - Dismissable */}
        {error ? (
          <ThemedView className="bg-red-100 dark:bg-red-900/30 p-3 rounded-lg border border-red-300 dark:border-red-700">
            <View className="flex-row items-start justify-between gap-2">
              <ThemedText className="text-red-800 dark:text-red-200 text-sm flex-1">{error}</ThemedText>
              <Pressable
                onPress={() => setError('')}
                accessibilityRole="button"
                accessibilityLabel="Dismiss error"
              >
                {({ pressed }) => (
                  <View
                    className={`bg-red-200 dark:bg-red-800 w-6 h-6 rounded-full items-center justify-center ${
                      pressed ? 'opacity-70' : ''
                    }`}
                  >
                    <ThemedText className="text-red-800 dark:text-red-200 text-xs font-bold">✕</ThemedText>
                  </View>
                )}
              </Pressable>
            </View>
          </ThemedView>
        ) : null}

        {/* Coach Proxy Status */}
        {!coachProxyUrl.current ? (
          <ThemedView className="flex-row items-center gap-2 bg-orange-100 dark:bg-orange-900/30 p-3 rounded-lg">
            <ActivityIndicator size="small" />
            <ThemedText className="text-xs text-orange-800 dark:text-orange-200">
              Coach proxy URL is missing. Set extra.coachProxyUrl in app config.
            </ThemedText>
          </ThemedView>
        ) : (
          <ThemedView className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg">
            <ThemedText className="text-xs text-green-800 dark:text-green-200">
              ✓ Using backend Coach proxy
            </ThemedText>
          </ThemedView>
        )}

        {mode === CoachMode.ModifyWorkout && (
          <>
            <ThemedView className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
              <ThemedText className="text-xs text-blue-800 dark:text-blue-200 leading-4">
                💡 Examples: &quot;Change bench press to 84 kg&quot;, &quot;Remove all chest exercises&quot;,
                &quot;Add barbell curl to day 1&quot;, &quot;Swap bench press with dumbbell press&quot;
              </ThemedText>
            </ThemedView>

            {/* Workout Queue Header with Refresh Button */}
            <ThemedView className="flex-row items-center justify-between">
              <ThemedText type="subtitle" className="text-base">
                Current Workout Queue
              </ThemedText>
              <Pressable
                onPress={loadData}
                accessibilityRole="button"
                accessibilityLabel="Refresh workout queue"
              >
                {({ pressed }) => (
                  <View
                    className={`bg-gray-200 dark:bg-gray-700 px-3 py-1.5 rounded-lg ${
                      pressed ? 'opacity-70' : ''
                    }`}
                  >
                    <ThemedText className="text-sm font-semibold">↻ Refresh</ThemedText>
                  </View>
                )}
              </Pressable>
            </ThemedView>

            {/* Workout Queue List */}
            {workoutQueue.length > 0 ? (
              <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled showsVerticalScrollIndicator>
                {workoutQueue.map((queueItem) => (
                  <View key={queueItem.id}>
                    {renderQueueItem({ item: queueItem })}
                  </View>
                ))}
              </ScrollView>
            ) : (
              <ThemedView className="p-4 items-center">
                <ThemedText className="text-sm opacity-70 text-center">
                  No workout queue found. Create a program and start a workout first.
                </ThemedText>
              </ThemedView>
            )}
          </>
        )}

        {/* Response Display */}
        {response ? (
          <ThemedView className="gap-2 mt-4">
            <ThemedText type="subtitle">Response:</ThemedText>
            <ThemedView className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg max-h-[300px]">
              <ThemedText className="text-sm leading-5">{response}</ThemedText>
            </ThemedView>
          </ThemedView>
        ) : null}
      </ThemedView>

      {/* Workout Modification Modal */}
      <WorkoutModificationModal
        visible={showModal}
        proposedChanges={proposedChanges}
        onConfirm={handleConfirmChanges}
        onCancel={handleCancelChanges}
      />
    </ParallaxScrollView>
  );
}
