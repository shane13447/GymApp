# Getting Llama Running with Executorch - Complete Guide

## ✅ Installation Complete!

Executorch is now installed and ready to use. Here's how to get Llama 3.2 3B running in your app.

---

## 🚀 Quick Start (3 Steps)

### Step 1: Update Coach.tsx

The `react-native-executorch` package has **LLAMA3_2_3B** pre-converted and ready to use! Here's the updated component:

```typescript
import { useState, useEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useLLM, LLAMA3_2_3B, Message } from 'react-native-executorch';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function CoachScreen() {
  const [inputText, setInputText] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [useExecutorch, setUseExecutorch] = useState(true);

  // Initialize Executorch LLM - Llama 3.2 3B!
  const llm = useLLM({ 
    model: LLAMA3_2_3B,
    preventLoad: false // Set to true if you want to load manually later
  });

  // Watch for response updates
  useEffect(() => {
    if (llm.response) {
      setResponse(llm.response);
      setLoading(false);
    }
  }, [llm.response]);

  // Watch for errors
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
      if (useExecutorch && llm.isReady) {
        // Use Executorch (on-device, no HTTP needed!)
        const chat: Message[] = [
          { 
            role: 'system', 
            content: 'You are a helpful fitness coach. Provide clear, actionable workout and nutrition advice.' 
          },
          { 
            role: 'user', 
            content: inputText 
          }
        ];

        // Generate response - runs entirely on-device!
        await llm.generate(chat);
        
        // Response will be available in llm.response (handled by useEffect above)
        if (!llm.response) {
          setError('No response generated');
        }
      } else {
        // Fallback to HTTP (your existing code)
        const result = await sendToHttpServer(inputText);
        setResponse(result);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get response';
      setError(errorMessage);
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Your existing HTTP method as fallback
  const sendToHttpServer = async (prompt: string): Promise<string> => {
    const LLAMA_API_URL = Platform.OS === 'android' 
      ? 'http://10.0.2.2:8080/completion'
      : 'http://localhost:8080/completion';

    const response = await fetch(LLAMA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        n_predict: 512,
        temperature: 0.7,
        top_p: 0.9,
        repeat_penalty: 1.1,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.content || data.response || JSON.stringify(data);
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

        {llm.isReady && useExecutorch && (
          <ThemedView style={styles.infoContainer}>
            <ThemedText style={styles.infoText}>
              ✓ Using Executorch - Llama 3.2 3B (on-device, offline-capable)
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
            (loading || !llm.isReady) && styles.sendButtonDisabled,
          ]}
          onPress={sendToLlama}
          disabled={loading || !llm.isReady}
        >
          {loading || llm.isGenerating ? (
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
```

### Step 2: Build and Run

Since `react-native-executorch` requires native code, you'll need to create a development build (not Expo Go):

```bash
# Install dependencies
npm install

# Create development build for Android
npx expo prebuild --platform android
npx expo run:android

# Or for iOS
npx expo prebuild --platform ios
npx expo run:ios
```

**Important:** This won't work in Expo Go - you need a custom development build!

### Step 3: Test It!

1. Open the Coach tab
2. Wait for model to load (first time will download ~2-3GB)
3. Type a message like "What's a good workout for beginners?"
4. Tap Send
5. Watch Llama respond - all on-device! 🎉

---

## 📦 Available Models

The package includes these pre-converted Llama models:

- **LLAMA3_2_3B** - 3B parameters (recommended for your use case)
- **LLAMA3_2_3B_QLORA** - Quantized version (smaller, faster)
- **LLAMA3_2_3B_SPINQUANT** - Another quantized variant
- **LLAMA3_2_1B** - Smaller 1B model (faster, less capable)

**Recommendation:** Start with `LLAMA3_2_3B_QLORA` for better performance on mobile devices.

---

## 🎯 Key Features

### What You Get:

✅ **On-device inference** - No HTTP server needed  
✅ **Offline capable** - Works without internet  
✅ **Pre-converted models** - No conversion needed  
✅ **Automatic tokenization** - Handled by the package  
✅ **Streaming support** - Real-time token generation  
✅ **Progress tracking** - See download/load progress  

### API Overview:

```typescript
const llm = useLLM({ model: LLAMA3_2_3B });

// Properties:
llm.isReady          // Is model loaded?
llm.isGenerating     // Is it generating?
llm.response         // Current response text
llm.token            // Current token being generated
llm.downloadProgress // Download progress (0-1)
llm.error            // Any error message
llm.messageHistory   // Chat history

// Methods:
await llm.generate(messages)  // Generate response
llm.sendMessage(text)         // Send message (adds to history)
llm.deleteMessage(index)      // Delete message from history
llm.interrupt()                // Stop generation
llm.configure({...})           // Configure model
```

---

## ⚙️ Configuration

You can configure the model behavior:

```typescript
llm.configure({
  chatConfig: {
    systemPrompt: 'You are a helpful fitness coach.',
    contextWindowLength: 2048,
  },
  generationConfig: {
    outputTokenBatchSize: 10,
    batchTimeInterval: 100,
  },
});
```

---

## 🐛 Troubleshooting

### "Model not loading"
- **Check internet connection** - First run downloads the model
- **Check device storage** - Model is ~2-3GB
- **Check RAM** - Need 4GB+ free RAM
- **Wait for download** - First time can take 10+ minutes

### "App crashes on Android"
- **Increase emulator RAM** - Set to 4GB+ in AVD settings
- **Use quantized model** - Try `LLAMA3_2_3B_QLORA` instead
- **Check device compatibility** - Requires Android 13+

### "useLLM is not a function"
- **Rebuild app** - Native modules need rebuild
- **Check import** - Ensure correct import path
- **Check package version** - Ensure react-native-executorch is installed

### "Model download fails"
- **Check storage space** - Need 5GB+ free
- **Check network** - Large download requires stable connection
- **Retry** - Download may resume automatically

---

## 📊 Performance Tips

1. **Use Quantized Models:**
   ```typescript
   const llm = useLLM({ model: LLAMA3_2_3B_QLORA });
   ```

2. **Configure Batching:**
   ```typescript
   llm.configure({
     generationConfig: {
       outputTokenBatchSize: 5, // Smaller = more responsive
       batchTimeInterval: 50,   // Lower = faster updates
     },
   });
   ```

3. **Manage Context:**
   ```typescript
   llm.configure({
     chatConfig: {
       contextWindowLength: 1024, // Smaller = faster
     },
   });
   ```

---

## 🔄 Switching Between HTTP and Executorch

You can easily switch between methods:

```typescript
const [useExecutorch, setUseExecutorch] = useState(true);

// In your sendToLlama function:
if (useExecutorch && llm.isReady) {
  // Use Executorch
  await llm.generate(chat);
} else {
  // Fallback to HTTP
  await sendToHttpServer(inputText);
}
```

---

## 📚 Additional Resources

- **Package Docs:** https://docs.swmansion.com/react-native-executorch
- **GitHub:** https://github.com/software-mansion/react-native-executorch
- **Models:** https://huggingface.co/software-mansion

---

## ✅ Summary

**You now have:**
1. ✅ Executorch Python tools installed
2. ✅ react-native-executorch package ready
3. ✅ Code example for Coach component
4. ✅ Pre-converted Llama 3.2 3B model available

**Next steps:**
1. Update `app/(tabs)/Coach.tsx` with the code above
2. Create development build: `npx expo prebuild`
3. Run: `npx expo run:android`
4. Test and enjoy on-device AI! 🚀

The model will download automatically on first use. After that, it works completely offline!


