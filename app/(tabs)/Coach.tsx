import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { LLAMA3_2_1B, Message, useLLM } from 'react-native-executorch';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HomeScreen() {
  const [inputText, setInputText] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Initialize Executorch LLM - Llama 3.2 1B (smaller, faster model)
  const llm = useLLM({ 
    model: LLAMA3_2_1B,
    preventLoad: false // Auto-load on mount
  });

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
      // Use Executorch 
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

      // Generate response - runs entirely on-device!
      // Note: Response streams in via llm.response and is handled by useEffect
      // Don't check llm.response here as it may still be streaming
      await llm.generate(chat);
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to get response';
      
      setError(errorMessage);
      console.error('Error calling Llama:', err);
      setLoading(false);
    }
  };

  return (
    <ParallaxScrollView>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Coach</ThemedText>
        <HelloWave />
      </ThemedView>
      
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle" style={styles.label}>
          Ask your AI Coach:
        </ThemedText>

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
});
