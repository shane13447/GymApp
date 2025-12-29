import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { LLAMA3_2_1B, Message, useLLM } from 'react-native-executorch';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import WorkoutModificationModal from '@/components/WorkoutModificationModal';
import {
  loadWorkoutQueue,
  buildModificationPrompt,
  parseModificationResponse,
  formatProposedChanges,
  applyModifications,
  WORKOUT_MODIFICATION_SYSTEM_PROMPT,
  type ProposedChanges,
} from '@/services/workout-queue-modifier';
import type { WorkoutQueueItem } from './ActiveWorkout';
import type { Exercise } from './Programs';
import exercisesData from '@/data/exerciseSelection.json';

type CoachMode = 'chat' | 'modify_workout';

export default function HomeScreen() {
  const [mode, setMode] = useState<CoachMode>('chat');
  const [inputText, setInputText] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [proposedChanges, setProposedChanges] = useState<ProposedChanges | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [workoutQueue, setWorkoutQueue] = useState<WorkoutQueueItem[]>([]);
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const queueScrollViewRef = useRef<ScrollView>(null);

  // Initialize Executorch LLM - Llama 3.2 1B (smaller, faster model)
  const llm = useLLM({ 
    model: LLAMA3_2_1B,
    preventLoad: false // Auto-load on mount
  });

  // Load workout queue and available exercises on mount
  useEffect(() => {
    loadWorkoutQueue().then(setWorkoutQueue);
    
    // Load available exercises from JSON
    try {
      const exercises: Exercise[] = exercisesData.map((ex: any) => ({
        name: ex.name,
        equipment: ex.equipment,
        muscle_groups_worked: ex.muscle_groups_worked,
      }));
      setAvailableExercises(exercises);
    } catch (error) {
      console.error('Error loading exercises:', error);
    }
  }, []);

  // Watch for response updates from Executorch
  useEffect(() => {
    if (llm.response) {
      setResponse(llm.response);
    }
    // Clear loading state when generation completes
    if (!llm.isGenerating && loading) {
      setLoading(false);
      // Clear error if we have a response
      if (llm.response) {
        setError('');
      }
    }
  }, [llm.response, llm.isGenerating, loading]);

  // Watch for errors from Executorch
  useEffect(() => {
    if (llm.error) {
      setError(llm.error);
      setLoading(false);
    }
  }, [llm.error]);

  const sendToLlama = async () => {
    if (!inputText.trim()) {
      setError('Please enter some text');
      return;
    }

    // Check if model is ready
    if (!llm.isReady) {
      setError('Model is still loading. Please wait...');
      return;
    }

    setLoading(true);
    setError('');
    setResponse('');

    try {
      if (mode === 'modify_workout') {
        // Workout modification mode
        if (workoutQueue.length === 0) {
          setError('No workout queue found. Please create a program and start a workout first.');
          setLoading(false);
          return;
        }

        const userPrompt = buildModificationPrompt(inputText, workoutQueue, availableExercises);
        const chat: Message[] = [
          { 
            role: 'system', 
            content: WORKOUT_MODIFICATION_SYSTEM_PROMPT
          },
          { 
            role: 'user', 
            content: userPrompt
          }
        ];

        await llm.generate(chat);
      } else {
        // Regular chat mode
        const chat: Message[] = [
          { 
            role: 'system', 
            content: 'you are a fitness coach, provide exercises only in the form of JSON objects listing the exercise containing sets, reps, weight, rest time and muscle groups worked, a full workout routine shout be an array of these JSON objects' 
          },
          { 
            role: 'user', 
            content: inputText 
          }
        ];

        await llm.generate(chat);
      }
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to get response';
      
      setError(errorMessage);
      console.error('Error calling Llama:', err);
      setLoading(false);
    }
  };

  // Handle response when in modify_workout mode
  useEffect(() => {
    if (mode === 'modify_workout' && llm.response && !llm.isGenerating && loading) {
      const modifications = parseModificationResponse(llm.response);
      if (modifications) {
        const formatted = formatProposedChanges(modifications, workoutQueue);
        setProposedChanges(formatted);
        setShowModal(true);
        setLoading(false);
      } else {
        setError('Could not parse modification response. Please try again.');
        setLoading(false);
      }
    }
  }, [llm.response, llm.isGenerating, mode, loading, workoutQueue]);

  const handleConfirmChanges = async () => {
    if (!proposedChanges) return;

    try {
      // Re-parse the response to get the modifications
      const modifications = parseModificationResponse(llm.response || '');
      if (modifications) {
        const success = await applyModifications(modifications, availableExercises);
        if (success) {
          // Reload workout queue
          const updatedQueue = await loadWorkoutQueue();
          setWorkoutQueue(updatedQueue);
          Alert.alert('Success', 'Workout queue has been updated!');
          setShowModal(false);
          setProposedChanges(null);
          setInputText('');
        } else {
          Alert.alert('Error', 'Failed to apply modifications.');
        }
      }
    } catch (err) {
      console.error('Error applying modifications:', err);
      Alert.alert('Error', 'Failed to apply modifications.');
    }
  };

  const handleCancelChanges = () => {
    setShowModal(false);
    setProposedChanges(null);
  };

  return (
    <ParallaxScrollView>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Coach</ThemedText>
        <HelloWave />
      </ThemedView>
      
      <ThemedView style={styles.container}>
        {/* Mode Selector */}
        <View style={styles.modeSelector}>
          <Pressable
            onPress={() => {
              setMode('chat');
              setInputText('');
              setResponse('');
              setError('');
            }}
            style={({ pressed }) => [
              styles.modeButton,
              mode === 'chat' && styles.modeButtonActive,
              pressed && styles.modeButtonPressed,
            ]}
          >
            <ThemedText
              style={[
                styles.modeButtonText,
                mode === 'chat' && styles.modeButtonTextActive,
              ]}
            >
              Chat
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => {
              setMode('modify_workout');
              setInputText('');
              setResponse('');
              setError('');
              loadWorkoutQueue().then(setWorkoutQueue);
            }}
            style={({ pressed }) => [
              styles.modeButton,
              mode === 'modify_workout' && styles.modeButtonActive,
              pressed && styles.modeButtonPressed,
            ]}
          >
            <ThemedText
              style={[
                styles.modeButtonText,
                mode === 'modify_workout' && styles.modeButtonTextActive,
              ]}
            >
              Modify Workout Queue
            </ThemedText>
          </Pressable>
        </View>

        <ThemedText type="subtitle" style={styles.label}>
          {mode === 'modify_workout' 
            ? 'Request workout modifications:' 
            : 'Ask your AI Coach:'}
        </ThemedText>

        {mode === 'modify_workout' && (
          <>
            <ThemedView style={styles.infoBox}>
              <ThemedText style={styles.infoBoxText}>
                💡 Examples: "Change bench press to 185 lbs", "Remove all chest exercises", 
                "Add barbell curl to day 1", "Swap bench press with dumbbell press",
                "Change squat to 225 lbs and add deadlift"
              </ThemedText>
              {workoutQueue.length > 0 && (
                <ThemedText style={styles.infoBoxText}>
                  📋 {workoutQueue.length} workout{workoutQueue.length !== 1 ? 's' : ''} in queue
                </ThemedText>
              )}
            </ThemedView>

            {/* Workout Queue List */}
            {workoutQueue.length > 0 && (
              <ThemedView style={styles.queueContainer}>
                <ThemedText type="subtitle" style={styles.queueTitle}>
                  Current Workout Queue
                </ThemedText>
                <ScrollView 
                  ref={queueScrollViewRef}
                  style={styles.queueScrollView} 
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                  scrollEnabled={true}
                  bounces={true}
                >
                  {workoutQueue.map((queueItem, queueIndex) => (
                    <ThemedView 
                      key={queueItem.id} 
                      style={styles.queueItemCard}
                      lightColor="#fff"
                      darkColor="#1e1e1e"
                    >
                      <ThemedText style={styles.queueItemHeader}>
                        {queueItem.programName} - Day {queueItem.dayNumber}
                      </ThemedText>
                      {queueItem.exercises.map((exercise, exIndex) => (
                        <ThemedView 
                          key={`${exercise.name}-${exIndex}`} 
                          style={styles.exerciseRow}
                          lightColor="#f9f9f9"
                          darkColor="#2a2a2a"
                        >
                          <ThemedText style={styles.exerciseName} numberOfLines={1}>
                            {exercise.name}
                          </ThemedText>
                          <View style={styles.exerciseDetails}>
                            <ThemedText style={styles.exerciseDetail}>
                              Sets: {exercise.sets || 'N/A'}
                            </ThemedText>
                            <ThemedText style={styles.exerciseDetail}>
                              Reps: {exercise.reps || 'N/A'}
                            </ThemedText>
                            <ThemedText style={styles.exerciseDetail}>
                              Weight: {exercise.weight || 'N/A'}
                            </ThemedText>
                          </View>
                        </ThemedView>
                      ))}
                    </ThemedView>
                  ))}
                </ScrollView>
              </ThemedView>
            )}

            {workoutQueue.length === 0 && (
              <ThemedView style={styles.emptyQueueContainer}>
                <ThemedText style={styles.emptyQueueText}>
                  No workout queue found. Create a program and start a workout first.
                </ThemedText>
              </ThemedView>
            )}
          </>
        )}

        {/* Model Status */}
        {!llm.isReady && (
          <ThemedView style={styles.statusContainer}>
            <ActivityIndicator size="small" />
            <ThemedText style={styles.statusText}>
              Loading model... {llm.downloadProgress > 0 ? `${Math.round(llm.downloadProgress * 100)}%` : ''}
            </ThemedText>
          </ThemedView>
        )}

        {llm.isReady && (
          <ThemedView style={styles.infoContainer}>
            <ThemedText style={styles.infoText}>
              ✓ Using Executorch - Llama 3.2 1B (on-device, offline-capable)
            </ThemedText>
          </ThemedView>
        )}
        
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Enter your question or message..."
          placeholderTextColor="#999"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={llm.isReady}
        />

        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            pressed && styles.sendButtonPressed,
            (loading || llm.isGenerating || !llm.isReady) && styles.sendButtonDisabled,
          ]}
          onPress={sendToLlama}
          disabled={loading || llm.isGenerating || !llm.isReady}
        >
          {(loading || llm.isGenerating) ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <ThemedText type="defaultSemiBold" className="text-white">
              Send
            </ThemedText>
          )}
        </Pressable>

        {error ? (
          <ThemedView style={styles.errorContainer}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </ThemedView>
        ) : null}

        {response ? (
          <ThemedView style={styles.responseContainer}>
            <ThemedText type="subtitle" style={styles.responseLabel}>
              Response:
            </ThemedText>
            <ScrollView style={styles.responseScroll}>
              <ThemedText style={[styles.responseText, { color: '#000' }]}>{response}</ThemedText>
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

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  container: {
    gap: 16,
    marginTop: 20,
  },
  label: {
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    backgroundColor: '#fff',
    color: '#000',
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  sendButtonPressed: {
    opacity: 0.7,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f44336',
  },
  errorText: {
    color: '#c62828',
  },
  responseContainer: {
    marginTop: 16,
    gap: 8,
  },
  responseLabel: {
    marginBottom: 8,
  },
  responseScroll: {
    maxHeight: 300,
  },
  responseText: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    lineHeight: 20,
    color: '#000',
  },
  infoContainer: {
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#2e7d32',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 12,
    color: '#e65100',
  },
  modeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#007AFF',
  },
  modeButtonPressed: {
    opacity: 0.7,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  infoBox: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 4,
  },
  infoBoxText: {
    fontSize: 12,
    color: '#1976d2',
    lineHeight: 16,
  },
  queueContainer: {
    marginTop: 12,
    marginBottom: 12,
    maxHeight: 300,
  },
  queueTitle: {
    marginBottom: 8,
    fontSize: 16,
    fontWeight: 'bold',
  },
  queueScrollView: {
    maxHeight: 280,
    minHeight: 100,
  },
  queueItemCard: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  queueItemHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    opacity: 0.9,
  },
  exerciseRow: {
    padding: 8,
    borderRadius: 6,
    marginBottom: 6,
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  exerciseDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  exerciseDetail: {
    fontSize: 12,
    opacity: 0.7,
  },
  emptyQueueContainer: {
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  emptyQueueText: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
  },
});
