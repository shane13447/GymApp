/**
 * Coach Screen
 * AI-powered workout coach for modifying workout queues and general fitness advice
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { LLAMA3_2_3B_QLORA, Message, useLLM } from 'react-native-executorch';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import WorkoutModificationModal from '@/components/WorkoutModificationModal';
import exercisesData from '@/data/exerciseSelection.json';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as db from '@/services/database';
import {
  buildCompressedPrompt,
  compareWorkoutQueues,
  COMPRESSED_SYSTEM_PROMPT,
  differencesToProposedChanges,
  parseQueueFormatResponse,
  preprocessMuscleGroupRequest,
  repairQueue,
  validateChanges,
  type ProposedChanges,
} from '@/services/workout-queue-modifier';
import type { Exercise, WorkoutQueueItem } from '@/types';
import { CoachMode } from '@/types';

// Test prompts for automated testing
// Note: These use values DIFFERENT from current queue to ensure changes are detected
const TEST_PROMPTS = [
  // Single changes
  { type: 'Single - Weight', prompt: 'change decline crunches weight to 25' },
  { type: 'Single - Reps', prompt: 'change leg extensions reps to 15' },
  { type: 'Single - Sets', prompt: 'change lat pulldowns sets to 5' },
  { type: 'Single - Add', prompt: 'add barbell curl to day 2' },
  { type: 'Single - Remove', prompt: 'remove fingertip curls' },
  // Multiple changes
  { type: 'Multi - Weight', prompt: 'change decline crunches weight to 30 and seated bicep curl weight to 10' },
  { type: 'Multi - Reps', prompt: 'change calf press reps to 20 and leg extensions reps to 6' },
  { type: 'Multi - Sets', prompt: 'change lat pulldowns sets to 4 and triangle rows sets to 5' },
  { type: 'Multi - Add', prompt: 'add hammer curl to day 2 and add dumbbell fly to day 3' },
  { type: 'Multi - Remove', prompt: 'remove fingertip curls and remove reverse forearm curls' },
  // Muscle group changes
  { type: 'Muscle - Weight', prompt: 'change all back exercises weight to 30' },
  { type: 'Muscle - Reps', prompt: 'change all leg exercises reps to 20' },
  { type: 'Muscle - Sets', prompt: 'change all chest exercises sets to 5' },
  { type: 'Muscle - Remove', prompt: 'remove all forearm exercises' },
];

export default function CoachScreen() {
  const [mode, setMode] = useState<CoachMode>(CoachMode.ModifyWorkout);
  const [inputText, setInputText] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [proposedChanges, setProposedChanges] = useState<ProposedChanges | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [workoutQueue, setWorkoutQueue] = useState<WorkoutQueueItem[]>([]);
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [generatedQueue, setGeneratedQueue] = useState<WorkoutQueueItem[] | null>(null);
  const lastProcessedResponseRef = useRef<string>('');
  
  // Test mode state
  const [isTestMode, setIsTestMode] = useState(false);
  const [testIndex, setTestIndex] = useState(0);
  const [testResults, setTestResults] = useState<{ type: string; success: boolean; error?: string }[]>([]);
  const pendingNextTestRef = useRef<number | null>(null);

  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? '#ffffff' : '#000000';

  // Initialize Executorch LLM
  const llm = useLLM({
    model: LLAMA3_2_3B_QLORA,
    preventLoad: false,
  });

  // Configure LLM when ready
  useEffect(() => {
    if (llm.isReady) {
      llm.configure({
        chatConfig: {
          contextWindowLength: 8192,
        },
        generationConfig: {
          outputTokenBatchSize: 32,
          batchTimeInterval: 50,
        },
      });
    }
  }, [llm.isReady]);

  // Load workout queue and exercises on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = useCallback(async () => {
    try {
      const queue = await db.getWorkoutQueue();
      setWorkoutQueue(queue);

      const exercises: Exercise[] = exercisesData.map((ex) => ({
        name: ex.name,
        equipment: ex.equipment,
        muscle_groups_worked: ex.muscle_groups_worked,
      }));
      setAvailableExercises(exercises);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  }, []);

  // Watch for response updates
  useEffect(() => {
    if (llm.response) {
      setResponse(llm.response);
    }
    if (!llm.isGenerating && loading && mode === CoachMode.Chat) {
      setLoading(false);
      if (llm.response) {
        setError('');
      }
    }
  }, [llm.response, llm.isGenerating, loading, mode]);

  // Watch for errors
  useEffect(() => {
    if (llm.error) {
      setError(llm.error);
      setLoading(false);
    }
  }, [llm.error]);

  // Handle response in modify_workout mode
  useEffect(() => {
    if (
      mode === CoachMode.ModifyWorkout &&
      llm.response &&
      !llm.isGenerating &&
      llm.response !== lastProcessedResponseRef.current
    ) {
      console.log('[QUEUE FORMAT] Processing LLM response');
      lastProcessedResponseRef.current = llm.response;

      let parsedQueue = parseQueueFormatResponse(llm.response, workoutQueue);

      if (parsedQueue && parsedQueue.length > 0) {
        console.log('[QUEUE FORMAT] Parsed queue with', parsedQueue.length, 'items');
        
        // Apply queue repair to fix LLM issues
        parsedQueue = repairQueue(workoutQueue, parsedQueue, inputText);
        console.log('[QUEUE FORMAT] Repaired queue');
        
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
            const hasWarnings = !validation.valid;
            console.log(`[TEST ${testIndex + 1}/${TEST_PROMPTS.length}] ${currentTest.type}: ${hasWarnings ? 'SUCCESS (with warnings)' : 'SUCCESS'}`);
            if (hasWarnings) {
              console.log(`[TEST] Validation warnings:`, validation.warnings);
            }
            console.log(`[TEST] Changes proposed:`, formatted);
            setTestResults(prev => [...prev, { type: currentTest.type, success: true, error: hasWarnings ? validation.warnings.join('; ') : undefined }]);
            
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
            // Show warnings to user in non-test mode
            if (!validation.valid) {
              setError(`Warning: ${validation.warnings.join(' ')}`);
            }
            setShowModal(true);
          }
        } else {
          if (isTestMode) {
            const currentTest = TEST_PROMPTS[testIndex];
            console.log(`[TEST ${testIndex + 1}/${TEST_PROMPTS.length}] ${currentTest.type}: NO CHANGES DETECTED`);
            setTestResults(prev => [...prev, { type: currentTest.type, success: false, error: 'No changes detected' }]);
            
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
          setTestResults(prev => [...prev, { type: currentTest.type, success: false, error: 'Parse failed' }]);
          
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
  }, [llm.response, llm.isGenerating, mode, workoutQueue, isTestMode, testIndex]);

  const sendToLlama = async () => {
    if (!inputText.trim()) {
      setError('Please enter some text');
      return;
    }

    if (!llm.isReady) {
      setError('Model is still loading. Please wait...');
      return;
    }

    setLoading(true);
    setError('');
    setResponse('');
    setGeneratedQueue(null);
    lastProcessedResponseRef.current = '';

    try {
      if (mode === CoachMode.ModifyWorkout) {
        if (workoutQueue.length === 0) {
          setError('No workout queue found. Please create a program and start a workout first.');
          setLoading(false);
          return;
        }

        const { processedRequest, wasProcessed, matchedExercises, muscleGroupDetected, noMatchesFound } = preprocessMuscleGroupRequest(
          inputText,
          workoutQueue
        );

        // Check if user mentioned a muscle group but no matching exercises exist in queue
        if (noMatchesFound && muscleGroupDetected) {
          setError(`No ${muscleGroupDetected} exercises found in your workout queue. The queue only contains exercises for other muscle groups.`);
          setLoading(false);
          return;
        }

        if (wasProcessed) {
          console.log(
            `[PREPROCESS] Muscle group detected, matched exercises: ${matchedExercises.join(', ')}`
          );
        }

        const userPrompt = buildCompressedPrompt(processedRequest, workoutQueue);
        console.log(`[COMPRESSED] User prompt: ${userPrompt}`);
        console.log(`[PROMPT LENGTH] System: ${COMPRESSED_SYSTEM_PROMPT.length}, User: ${userPrompt.length}, Total: ${COMPRESSED_SYSTEM_PROMPT.length + userPrompt.length}`);

        const chat: Message[] = [
          { role: 'system', content: COMPRESSED_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ];

        await llm.generate(chat);
      } else {
        const chat: Message[] = [
          {
            role: 'system',
            content:
              'You are a fitness coach. Provide motivational advice and help with workout planning and execution.',
          },
          { role: 'user', content: inputText },
        ];

        await llm.generate(chat);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get response';
      setError(errorMessage);
      console.error('Error calling Llama:', err);
      setLoading(false);
    }
  };

  // Run a specific test by index
  const runNextTest = useCallback(async (index: number) => {
    if (index >= TEST_PROMPTS.length) {
      setIsTestMode(false);
      console.log('[TEST] All tests complete!');
      return;
    }

    // Wait for any previous generation to complete
    if (llm.isGenerating) {
      console.log('[TEST] Waiting for previous generation to complete...');
      pendingNextTestRef.current = index;
      return;
    }

    const test = TEST_PROMPTS[index];
    console.log(`\n[TEST ${index + 1}/${TEST_PROMPTS.length}] Running: ${test.type}`);
    console.log(`[TEST] Prompt: "${test.prompt}"`);
    
    setTestIndex(index);
    setInputText(test.prompt);
    setError('');
    setResponse('');
    setGeneratedQueue(null);
    lastProcessedResponseRef.current = '';
    setLoading(true);
    
    try {
      const { processedRequest, wasProcessed, matchedExercises, muscleGroupDetected, noMatchesFound } = preprocessMuscleGroupRequest(
        test.prompt,
        workoutQueue
      );

      // Check if user mentioned a muscle group but no matching exercises exist in queue
      if (noMatchesFound && muscleGroupDetected) {
        console.log(`[TEST ${index + 1}/${TEST_PROMPTS.length}] ${test.type}: SKIPPED - No ${muscleGroupDetected} exercises in queue`);
        setTestResults(prev => [...prev, { type: test.type, success: false, error: `No ${muscleGroupDetected} exercises` }]);
        setLoading(false);
        // Mark any existing response as processed to prevent stale response handling
        lastProcessedResponseRef.current = llm.response || '';
        
        if (index < TEST_PROMPTS.length - 1) {
          pendingNextTestRef.current = index + 1;
        } else {
          setIsTestMode(false);
          Alert.alert('Test Complete', `Ran ${TEST_PROMPTS.length} tests. Check console for results.`);
        }
        return;
      }

      if (wasProcessed) {
        console.log(`[PREPROCESS] Muscle group detected, matched exercises: ${matchedExercises.join(', ')}`);
      }

      const userPrompt = buildCompressedPrompt(processedRequest, workoutQueue);
      console.log(`[COMPRESSED] User prompt: ${userPrompt}`);
      console.log(`[PROMPT LENGTH] System: ${COMPRESSED_SYSTEM_PROMPT.length}, User: ${userPrompt.length}, Total: ${COMPRESSED_SYSTEM_PROMPT.length + userPrompt.length}`);

      const chat: Message[] = [
        { role: 'system', content: COMPRESSED_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ];

      await llm.generate(chat);
    } catch (err) {
      console.log(`[TEST ${index + 1}/${TEST_PROMPTS.length}] ${test.type}: ERROR - ${err}`);
      setTestResults(prev => [...prev, { type: test.type, success: false, error: String(err) }]);
      setLoading(false);
      
      if (index < TEST_PROMPTS.length - 1) {
        pendingNextTestRef.current = index + 1;
      } else {
        setIsTestMode(false);
        Alert.alert('Test Complete', `Ran ${TEST_PROMPTS.length} tests. Check console for results.`);
      }
    }
  }, [llm.isGenerating, llm, workoutQueue]);

  // Watch for pending test and run when LLM is ready
  useEffect(() => {
    if (pendingNextTestRef.current !== null && !llm.isGenerating && isTestMode) {
      const nextIndex = pendingNextTestRef.current;
      pendingNextTestRef.current = null;
      // Small delay to ensure state is settled
      setTimeout(() => {
        runNextTest(nextIndex);
      }, 500);
    }
  }, [llm.isGenerating, isTestMode, runNextTest]);

  // Start the test suite
  const startTests = () => {
    if (!llm.isReady) {
      setError('Model is still loading. Please wait...');
      return;
    }
    
    if (workoutQueue.length === 0) {
      setError('No workout queue found. Please create a program and start a workout first.');
      return;
    }

    console.log('\n========================================');
    console.log('[TEST] Starting automated test suite');
    console.log(`[TEST] ${TEST_PROMPTS.length} tests to run`);
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
              {exercise.name}
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
          editable={llm.isReady}
          style={{ color: textColor, fontSize: 16 }}
          accessibilityLabel="Message input"
        />

        {/* Send Button */}
        <Pressable
          onPress={sendToLlama}
          disabled={loading || llm.isGenerating || !llm.isReady}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          {({ pressed }) => (
            <View
              className={`bg-blue-500 px-6 py-3 rounded-lg items-center justify-center min-h-[44px] ${
                loading || llm.isGenerating || !llm.isReady ? 'opacity-50' : ''
              } ${pressed ? 'opacity-70' : ''}`}
            >
              {loading || llm.isGenerating ? (
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
            disabled={loading || llm.isGenerating || !llm.isReady || isTestMode}
            accessibilityRole="button"
            accessibilityLabel="Run automated tests"
          >
            {({ pressed }) => (
              <View
                className={`bg-purple-500 px-6 py-3 rounded-lg items-center justify-center min-h-[44px] ${
                  loading || llm.isGenerating || !llm.isReady || isTestMode ? 'opacity-50' : ''
                } ${pressed ? 'opacity-70' : ''}`}
              >
                {isTestMode ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <ThemedText className="text-white font-semibold">
                      Test {testIndex + 1}/{TEST_PROMPTS.length}
                    </ThemedText>
                  </View>
                ) : (
                  <ThemedText className="text-white font-semibold">🧪 Run All Tests ({TEST_PROMPTS.length})</ThemedText>
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

        {/* Model Status */}
        {!llm.isReady && (
          <ThemedView className="flex-row items-center gap-2 bg-orange-100 dark:bg-orange-900/30 p-3 rounded-lg">
            <ActivityIndicator size="small" />
            <ThemedText className="text-xs text-orange-800 dark:text-orange-200">
              Loading model...{' '}
              {llm.downloadProgress > 0 ? `${Math.round(llm.downloadProgress * 100)}%` : ''}
            </ThemedText>
          </ThemedView>
        )}

        {llm.isReady && (
          <ThemedView className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg">
            <ThemedText className="text-xs text-green-800 dark:text-green-200">
              ✓ Using Executorch - Llama 3.2 3B QLoRA (on-device, offline-capable)
            </ThemedText>
          </ThemedView>
        )}

        {mode === CoachMode.ModifyWorkout && (
          <>
            <ThemedView className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
              <ThemedText className="text-xs text-blue-800 dark:text-blue-200 leading-4">
                💡 Examples: "Change bench press to 84 kg", "Remove all chest exercises", "Add
                barbell curl to day 1", "Swap bench press with dumbbell press"
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
