/**
 * Coach Screen
 * AI-powered workout coach for modifying workout queues and general fitness advice
 */

import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from 'react-native';

import { CoachGeneratedProgramPreview } from '@/components/coach/CoachGeneratedProgramPreview';
import { CoachQueueList } from '@/components/coach/CoachQueueList';
import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import WorkoutModificationModal from '@/components/WorkoutModificationModal';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type CoachProxyMessage } from '@/lib/coach-utils';
import {
  DEFAULT_QUEUE_HORIZON,
  resolveQueueHorizonBlur,
  sanitizeQueueHorizonInput,
} from '@/lib/queue-horizon-input';
import { getSupabaseAccessToken } from '@/lib/supabase';
import * as db from '@/services/database';
import { callCoachProxy, getCoachProxyUrl } from '@/services/coach/proxy-client';
import {
  buildProgramDraftRequest,
  prepareProgramDraftFromModelResponse,
} from '@/services/coach/program-draft';
import { TEST_PROMPTS } from '@/services/coach/test-prompts';
import {
  executePromptThroughCoachPipeline,
  runCoachPromptSuite,
} from '@/services/coach/prompt-test-runner';
import { processCoachResponse } from '@/services/coach/response-processor';
import {
  buildCompressedPrompt,
  COMPRESSED_SYSTEM_PROMPT,
} from '@/services/queue/codec';
import {
  extractTargetExerciseRefs,
  preprocessMuscleGroupRequest,
} from '@/services/queue/repair';
import type {
  TargetedExerciseRef,
  ProposedChanges,
} from '@/services/queue/types';
import type { DraftProgram, WorkoutQueueItem } from '@/types';

type CoachTestResult = {
  type: string;
  success: boolean;
  error?: string;
};


export default function CoachScreen() {
  const [inputText, setInputText] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [proposedChanges, setProposedChanges] = useState<ProposedChanges | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [workoutQueue, setWorkoutQueue] = useState<WorkoutQueueItem[]>([]);
  const workoutQueueRef = useRef<WorkoutQueueItem[]>([]);
  const [queueHorizon, setQueueHorizon] = useState(DEFAULT_QUEUE_HORIZON);
  const [queueHorizonInput, setQueueHorizonInput] = useState(String(DEFAULT_QUEUE_HORIZON));
  const [generatedQueue, setGeneratedQueue] = useState<WorkoutQueueItem[] | null>(null);
  const [generatedProgramDraft, setGeneratedProgramDraft] = useState<DraftProgram | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [proxyResponse, setProxyResponse] = useState('');
  const [proxyError, setProxyError] = useState('');
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const targetedExercisesRef = useRef<TargetedExerciseRef[]>([]);
  const scopedQueueRef = useRef<WorkoutQueueItem[]>([]);
  const sentInputTextRef = useRef<string>('');
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

  const handleQueueHorizonChange = useCallback((text: string) => {
    const inputValue = sanitizeQueueHorizonInput(text);
    setQueueHorizonInput(inputValue);

    if (inputValue) {
      setQueueHorizon(Number.parseInt(inputValue, 10));
    }
  }, []);

  const handleQueueHorizonBlur = useCallback(() => {
    const resolved = resolveQueueHorizonBlur(queueHorizonInput, queueHorizon);
    setQueueHorizonInput(resolved.inputValue);
    setQueueHorizon(resolved.horizon);
  }, [queueHorizon, queueHorizonInput]);

  const loadData = useCallback(async () => {
    try {
      const [queue, profile] = await Promise.all([
        db.getWorkoutQueue(),
        db.getUserProfile(),
      ]);
      setWorkoutQueue(queue);
      workoutQueueRef.current = queue;
      const complete =
        profile.experienceLevel !== null &&
        profile.trainingDaysPerWeek !== null &&
        profile.sessionDurationMinutes !== null &&
        profile.trainingGoal !== null;
      setIsProfileComplete(complete);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  }, []);

  // Load workout queue on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Re-check profile completeness every time screen is focused
  useFocusEffect(
    useCallback(() => {
      const checkProfile = async () => {
        try {
          const profile = await db.getUserProfile();
          const complete =
            profile.experienceLevel !== null &&
            profile.trainingDaysPerWeek !== null &&
            profile.sessionDurationMinutes !== null &&
            profile.trainingGoal !== null;
          setIsProfileComplete(complete);
        } catch (err) {
          console.error('Error checking profile:', err);
        }
      };
      checkProfile();
    }, [])
  );

  // Keep response/error state in sync with proxy transport
  useEffect(() => {
    if (proxyResponse) {
      setResponse(proxyResponse);
    }

    if (!isGenerating && loading) {
      setLoading(false);
      if (proxyResponse) {
        setError('');
      }
    }
  }, [proxyResponse, isGenerating, loading]);

  useEffect(() => {
    if (proxyError) {
      setError(proxyError);
      setLoading(false);
      setIsGenerating(false);
    }
  }, [proxyError]);

// Handle response
  useEffect(() => {
    if (
      proxyResponse &&
      !isGenerating &&
      proxyResponse !== lastProcessedResponseRef.current
    ) {
      console.log('[QUEUE FORMAT] Processing LLM response');
      lastProcessedResponseRef.current = proxyResponse;

      const result = processCoachResponse({
        proxyResponse,
        scopedQueue: scopedQueueRef.current,
        fullQueue: workoutQueueRef.current,
        inputText: sentInputTextRef.current,
        targetedExercises: targetedExercisesRef.current,
        isTestMode,
        testIndex,
        totalTests: TEST_PROMPTS.length,
        currentTest: isTestMode ? TEST_PROMPTS[testIndex] : null,
      });

      switch (result.kind) {
        case 'parse_failed': {
          if (isTestMode) {
            const currentTest = TEST_PROMPTS[testIndex];
            console.log(`[TEST ${testIndex + 1}/${TEST_PROMPTS.length}] ${currentTest.type}: FAILED_PARSE`);
            console.log(`[TEST][FAILED_PARSE]`, 'Parse failed');
            setTestResults((prev) => [
              ...prev,
              { type: currentTest.type, success: false, error: 'Parse failed' },
            ]);
            if (testIndex < TEST_PROMPTS.length - 1) {
              pendingNextTestRef.current = testIndex + 1;
            } else {
              setIsTestMode(false);
              console.log('[TEST] All tests complete!');
              Alert.alert('Test Complete', `Ran ${TEST_PROMPTS.length} tests. Check console for results.`);
            }
          } else {
            setError('Could not parse queue from response. Expected format like "Q0:D1:BBP/80/5/5,BBS/100/5/5". Please try again.');
          }
          setLoading(false);
          break;
        }

        case 'structure_invalid': {
          console.warn('[QUEUE FORMAT] Structure validation failed');
          if (isTestMode) {
            const currentTest = TEST_PROMPTS[testIndex];
            console.log(`[TEST ${testIndex + 1}/${TEST_PROMPTS.length}] ${currentTest.type}: STRUCTURE VALIDATION FAILED`);
            setTestResults((prev) => [
              ...prev,
              { type: currentTest.type, success: false, error: result.error },
            ]);
            if (testIndex < TEST_PROMPTS.length - 1) {
              pendingNextTestRef.current = testIndex + 1;
            } else {
              setIsTestMode(false);
              console.log('[TEST] All tests complete!');
              Alert.alert('Test Complete', `Ran ${TEST_PROMPTS.length} tests. Check console for results.`);
            }
          } else {
            setError(result.error);
          }
          setGeneratedQueue(null);
          setProposedChanges(null);
          setShowModal(false);
          setLoading(false);
          break;
        }

        case 'no_changes': {
          if (isTestMode) {
            const currentTest = TEST_PROMPTS[testIndex];
            console.log(`[TEST ${testIndex + 1}/${TEST_PROMPTS.length}] ${currentTest.type}: NO_CHANGES`);
            console.log(`[TEST][NO_CHANGES]`, 'No changes detected');
            setTestResults((prev) => [
              ...prev,
              { type: currentTest.type, success: false, error: 'No changes detected' },
            ]);
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
          setLoading(false);
          break;
        }

        case 'changes_approved': {
          setGeneratedQueue(result.generatedQueue);
          setProposedChanges(result.proposedChanges);
          setError('');
          setShowModal(true);
          setLoading(false);
          break;
        }

        case 'changes_blocked': {
          setGeneratedQueue(null);
          setProposedChanges(null);
          setShowModal(false);
          setError(result.error);
          setLoading(false);
          break;
        }

        case 'test_result': {
          const currentTest = TEST_PROMPTS[testIndex];
          console.log(`[TEST ${testIndex + 1}/${TEST_PROMPTS.length}] ${currentTest.type}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
          if (result.errors.length > 0) {
            console.log(`[TEST][FAILED]`, result.errors.join('; '));
          }
          if (result.proposedChanges) {
            console.log(`[TEST] Changes proposed:`, result.proposedChanges);
          }
          setTestResults((prev) => [
            ...prev,
            { type: currentTest.type, success: result.success, error: result.errors.length > 0 ? result.errors.join('; ') : undefined },
          ]);
          setGeneratedQueue(null);
          setProposedChanges(null);
          if (result.pendingNextTestIndex !== null) {
            pendingNextTestRef.current = result.pendingNextTestIndex;
          } else {
            setIsTestMode(false);
            console.log('[TEST] All tests complete!');
            Alert.alert('Test Complete', `Ran ${TEST_PROMPTS.length} tests. Check console for results.`);
          }
          setLoading(false);
          break;
        }
      }
    }
  }, [proxyResponse, isGenerating, workoutQueue, isTestMode, testIndex, testResults]);

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
    sentInputTextRef.current = trimmedInput;

    const requestId = requestCounterRef.current + 1;
    requestCounterRef.current = requestId;
    activeRequestIdRef.current = requestId;

    lastProcessedResponseRef.current = '';

    setLoading(true);
    setIsGenerating(true);
    setError('');
    setProxyError('');
    setResponse('');
    setProxyResponse('');
    setGeneratedProgramDraft(null);
    setGeneratedQueue(null);
    setProposedChanges(null);

    try {
      const accessToken = await getSupabaseAccessToken();

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

      const scopedWorkoutQueue = workoutQueue.slice(0, queueHorizon);
      scopedQueueRef.current = scopedWorkoutQueue;
      console.log(`[HORIZON] Modifying ${scopedWorkoutQueue.length} of ${workoutQueue.length} workouts (horizon: ${queueHorizon})`);

      const exercisesToStore =
        wasProcessed && matchedExerciseRefs.length > 0
          ? matchedExerciseRefs
          : extractTargetExerciseRefs(trimmedInput, workoutQueue);
      console.log(
        '[TARGETED] Setting targetedExercises:',
        exercisesToStore.map((exercise) => exercise.displayName)
      );
      targetedExercisesRef.current = exercisesToStore;

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

      const userPrompt = buildCompressedPrompt(processedRequest, scopedWorkoutQueue);
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
        setLoading(false);
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
      sentInputTextRef.current = test.prompt;
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

        const scopedWorkoutQueue = workoutQueue.slice(0, queueHorizon);
        scopedQueueRef.current = scopedWorkoutQueue;
        const userPrompt = buildCompressedPrompt(processedRequest, scopedWorkoutQueue);
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
    [isGenerating, queueHorizon, workoutQueue]
  );

  // Watch for pending test and run when proxy call is idle
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (pendingNextTestRef.current !== null && !isGenerating && isTestMode) {
      const nextIndex = pendingNextTestRef.current;
      pendingNextTestRef.current = null;
      timeoutId = setTimeout(() => {
        runNextTest(nextIndex);
      }, 500);
    }
    return () => { if (timeoutId) clearTimeout(timeoutId); };
  }, [isGenerating, isTestMode, runNextTest]);

  // Start the test suite
  const startTests = async () => {
    if (!coachProxyUrl.current) {
      setError('Coach proxy URL is not configured.');
      return;
    }

    if (workoutQueue.length === 0) {
      setError('No workout queue found. Please create a program and start a workout first.');
      return;
    }

    setError('');
    setProxyError('');
    setLoading(true);
    setIsGenerating(true);
    setIsTestMode(true);
    setTestIndex(0);
    setTestResults([]);

    console.log('\n========================================');
    console.log('[TEST] Starting automated test suite');
    console.log(`[TEST] ${totalTests} tests to run`);
    console.log('========================================\n');

    try {
      const accessToken = await getSupabaseAccessToken();

      const suiteResult = await runCoachPromptSuite({
        prompts: TEST_PROMPTS,
        baseQueue: workoutQueue,
        onResult: (result, index, total) => {
          setTestIndex(index);
          setInputText(result.prompt);

          console.log(`[TEST ${index + 1}/${total}] ${result.type}: ${result.status}`);
          if (result.reasons.length > 0) {
            console.log('[TEST][REASONS]', result.reasons);
          }

          setTestResults((prev) => [
            ...prev,
            {
              type: result.type,
              success: result.status === 'SUCCESS',
              error: result.reasons.length > 0 ? result.reasons.join('; ') : undefined,
            },
          ]);
        },
        runPrompt: ({ promptCase, queue }) =>
          executePromptThroughCoachPipeline(
            {
              callCoachProxy: (messages) => callCoachProxy(coachProxyUrl.current, messages, accessToken),
            },
            promptCase,
            queue
          ),
      });

      console.log(
        `[TEST] Complete. Passed ${suiteResult.summary.passed}/${suiteResult.summary.total}, Failed ${suiteResult.summary.failed}`
      );
      Alert.alert(
        'Test Complete',
        `Passed ${suiteResult.summary.passed}/${suiteResult.summary.total}. ${suiteResult.summary.gatePassed ? 'Gate passed.' : 'Gate failed.'}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run test suite';
      setError(message);
      console.error('[TEST] Suite error:', err);
    } finally {
      setIsTestMode(false);
      setIsGenerating(false);
      setLoading(false);
    }
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
      workoutQueueRef.current = updatedQueue;
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

  const handleSaveGeneratedProgram = async () => {
    if (!generatedProgramDraft) {
      Alert.alert('Error', 'No generated draft program to save.');
      return;
    }

    try {
      const createdProgram = await db.createProgram(generatedProgramDraft);
      await db.setCurrentProgramId(createdProgram.id);
      Alert.alert('Success', 'Draft program saved and set as current program.');
      setGeneratedProgramDraft(null);
      setInputText('');
    } catch (err) {
      console.error('Error saving generated program:', err);
      Alert.alert('Error', 'Failed to save generated draft program.');
    }
  };

  const handleCancelChanges = () => {
    setShowModal(false);
    setProposedChanges(null);
    setGeneratedQueue(null);
  };

  const handleGenerateProgram = useCallback(async () => {
    if (!isProfileComplete) {
      Alert.alert('Profile Incomplete', 'Fill in the profile section for custom program generation');
      return;
    }

    if (!coachProxyUrl.current) {
      setError('Coach proxy URL is not configured.');
      return;
    }

    if (sendLockRef.current || loading || isGenerating) {
      return;
    }

    sendLockRef.current = true;

    const requestId = requestCounterRef.current + 1;
    requestCounterRef.current = requestId;
    activeRequestIdRef.current = requestId;

    lastProcessedResponseRef.current = '';

    setLoading(true);
    setIsGenerating(true);
    setError('');
    setProxyError('');
    setResponse('');
    setProxyResponse('');
    setGeneratedProgramDraft(null);
    setGeneratedQueue(null);
    setProposedChanges(null);

    try {
      const accessToken = await getSupabaseAccessToken();

      const profile = await db.getUserProfile();
      const { prompt, llmInput } = buildProgramDraftRequest({
        experienceLevel: profile.experienceLevel,
        trainingDaysPerWeek: profile.trainingDaysPerWeek,
        sessionDurationMinutes: profile.sessionDurationMinutes,
        trainingGoal: profile.trainingGoal,
      });

      const messages: CoachProxyMessage[] = [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: JSON.stringify({ ...llmInput, user_request: 'Generate a custom program for me based on my profile.' }),
        },
      ];

      const generatedText = await callCoachProxy(coachProxyUrl.current, messages, accessToken);
      if (activeRequestIdRef.current !== requestId) {
        return;
      }

      const draft = prepareProgramDraftFromModelResponse(generatedText);
      setGeneratedProgramDraft(draft);
      setResponse(JSON.stringify(draft, null, 2));
      setError('');
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
        setLoading(false);
      }
      sendLockRef.current = false;
    }
  }, [isProfileComplete, loading, isGenerating]);

  return (
    <ParallaxScrollView>
      <ThemedView className="flex-row items-center gap-2">
        <ThemedText type="title">Coach</ThemedText>
        <HelloWave />
      </ThemedView>

      <ThemedView className="gap-4 mt-5">
        {/* Queue Horizon Control */}
        <View className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
            <View className="flex-row items-center gap-2">
              <ThemedText className="text-sm font-semibold">
                Modify Workout Days (1-9):
              </ThemedText>
              <TextInput
                className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 w-16 text-center text-lg font-bold"
                value={queueHorizonInput}
                onChangeText={handleQueueHorizonChange}
                onBlur={handleQueueHorizonBlur}
                keyboardType="number-pad"
                selectTextOnFocus
                style={{ color: textColor }}
                accessibilityLabel="Modify workout days (1-9)"
              />
            </View>
            <ThemedText className="text-xs text-gray-500 mt-2">
              Number of upcoming workouts the AI can modify (1-9)
            </ThemedText>
          </View>

        <ThemedText type="subtitle">
          Request workout modifications:
        </ThemedText>

        {/* Input */}
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
                <ThemedText className="text-white font-semibold">
                  Send
                </ThemedText>
              )}
            </View>
          )}
        </Pressable>

        {/* Generate Program Button */}
        <Pressable
          onPress={handleGenerateProgram}
          disabled={loading || isGenerating || !coachProxyUrl.current}
          accessibilityRole="button"
          accessibilityLabel="Generate custom program"
        >
          {({ pressed }) => (
            <View
              className={`px-6 py-3 rounded-lg items-center justify-center min-h-[44px] ${
                loading || isGenerating || !coachProxyUrl.current
                  ? 'bg-gray-200 dark:bg-gray-700 opacity-50'
                  : isProfileComplete
                    ? 'bg-green-500'
                    : 'bg-gray-200 dark:bg-gray-700'
              } ${pressed ? 'opacity-70' : ''}`}
            >
              {isGenerating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <ThemedText
                  className={`font-semibold ${
                    loading || isGenerating || !coachProxyUrl.current
                      ? ''
                      : isProfileComplete
                        ? 'text-white'
                        : ''
                  }`}
                >
                  Generate Custom Program
                </ThemedText>
              )}
            </View>
          )}
        </Pressable>

        {/* Test Button */}
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

        {generatedProgramDraft ? (
          <CoachGeneratedProgramPreview
            generatedProgramDraft={generatedProgramDraft}
            loading={loading}
            isGenerating={isGenerating}
            onSave={handleSaveGeneratedProgram}
          />
        ) : null}

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
                    <ThemedText className="text-red-800 dark:text-red-200 text-xs font-bold">X</ThemedText>
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
              Using backend Coach proxy
            </ThemedText>
          </ThemedView>
        )}

        <>
            <ThemedView className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
              <ThemedText className="text-xs text-blue-800 dark:text-blue-200 leading-4">
                Examples: &quot;Change bench press to 84 kg&quot;, &quot;Remove all chest exercises&quot;,
                &quot;Add barbell curl to day 1&quot;, &quot;Swap bench press with dumbbell press&quot;
              </ThemedText>
            </ThemedView>

            <CoachQueueList workoutQueue={workoutQueue} onRefresh={loadData} />
          </>

        {/* Response Display (hidden when a structured draft preview is shown) */}
        {response && !generatedProgramDraft ? (
          <ThemedView className="gap-2 mt-4">
            <ThemedText type="subtitle">Response:</ThemedText>
            <ScrollView className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg max-h-[300px]" nestedScrollEnabled>
              <ThemedText className="text-sm leading-5">{response}</ThemedText>
            </ScrollView>
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
