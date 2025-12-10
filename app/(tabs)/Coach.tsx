import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HomeScreen() {
  const [inputText, setInputText] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [serverIP, setServerIP] = useState('');

  // Determine the correct API URL based on platform
  // For Android emulator: use 10.0.2.2 (special IP that maps to host machine's localhost)
  // For Android physical device: use device's IP address (user can configure)
  // For iOS simulator: use localhost
  // For physical device: use device's IP or localhost if on same machine
  const LLAMA_API_URL = useMemo(() => {
    const port = 8080;
    
    if (Platform.OS === 'android') {
      // Check if user has set a custom IP
      if (serverIP) {
        return `http://${serverIP}:${port}/completion`;
      }
      // Default to emulator IP (10.0.2.2) - works for both emulator and can be changed
      // For physical device, user should set their device's IP address
      return `http://10.0.2.2:${port}/completion`;
    } else if (Platform.OS === 'ios') {
      return `http://localhost:${port}/completion`;
    } else {
      // Web or other platforms
      return `http://localhost:${port}/completion`;
    }
  }, [serverIP]);

  const sendToLlama = async () => {
    if (!inputText.trim()) {
      setError('Please enter some text');
      return;
    }

    setLoading(true);
    setError('');
    setResponse('');

    try {
      // llama.cpp server API format
      const response = await fetch(LLAMA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: inputText,
          n_predict: 512, // Max tokens to generate
          temperature: 0.7,
          top_p: 0.9,
          repeat_penalty: 1.1,
          stream: false, // Set to true for streaming responses
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();
      // llama.cpp server returns content in 'content' field
      const content = data.content || data.response || JSON.stringify(data);
      setResponse(content);
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to connect to Llama server';
      
      let helpfulMessage = errorMessage;
      
      if (Platform.OS === 'android') {
        if (errorMessage.includes('Network request failed') || errorMessage.includes('ECONNREFUSED')) {
          helpfulMessage = `Connection failed. ${serverIP ? `Trying to connect to ${serverIP}:8080` : 'Using emulator IP (10.0.2.2:8080). For physical device, set your device IP above.'}\n\nMake sure:\n1. Llama server is running on your device\n2. Server is listening on 0.0.0.0:8080\n3. For physical device, enter your device's IP address`;
        }
      }
      
      setError(helpfulMessage);
      console.error('Error calling Llama:', err);
      console.error('API URL:', LLAMA_API_URL);
    } finally {
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
        
        {Platform.OS === 'android' && (
          <ThemedView style={styles.configContainer}>
            <ThemedText style={styles.configLabel}>
              Server IP (leave empty for emulator):
            </ThemedText>
            <TextInput
              style={styles.ipInput}
              value={serverIP}
              onChangeText={setServerIP}
              placeholder="e.g., 192.168.1.100"
              placeholderTextColor="#999"
              keyboardType="numeric"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ThemedText style={styles.configHint}>
              Current endpoint: {LLAMA_API_URL}
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
        />

        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            pressed && styles.sendButtonPressed,
            loading && styles.sendButtonDisabled,
          ]}
          onPress={sendToLlama}
          disabled={loading}
        >
          {loading ? (
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
              <ThemedText style={styles.responseText}>{response}</ThemedText>
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
  },
  configContainer: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    gap: 8,
  },
  configLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  configHint: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
  },
  ipInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    backgroundColor: '#fff',
    color: '#000',
  },
});
