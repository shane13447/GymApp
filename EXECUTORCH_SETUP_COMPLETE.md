# Executorch Setup Complete - Getting Llama Running

## ✅ What's Installed

1. **Python Executorch** - Installed at `C:\Users\Shane\AppData\Local\Programs\Python\Python312`
2. **react-native-executorch** - Already in your package.json
3. **Conversion Script** - Created at `scripts/convert-llama-to-executorch.py`

## 🚀 Quick Start: Two Approaches

### Approach 1: Use Pre-converted Model (Easiest) ⭐ Recommended

The `react-native-executorch` package has built-in support for Llama models!

#### Step 1: Check Available Models

The `react-native-executorch` package may include pre-converted models. Check the documentation:

```bash
# Check what models are available
npm info react-native-executorch
```

#### Step 2: Use the useLLM Hook

Update your `Coach.tsx` to use Executorch:

```typescript
import { useLLM } from 'react-native-executorch';

export default function CoachScreen() {
  // Initialize Llama model
  const llm = useLLM({
    model: 'llama-3.2-3b', // or check available models
  });

  const [inputText, setInputText] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const sendToLlama = async () => {
    setLoading(true);
    try {
      // Use Executorch directly - no HTTP needed!
      const chat = [
        { role: 'system', content: 'You are a helpful fitness coach.' },
        { role: 'user', content: inputText }
      ];

      await llm.generate(chat);
      setResponse(llm.response);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // ... rest of component
}
```

#### Step 3: Add Model to Assets

If the package doesn't include models, download a pre-converted `.pte` file:

1. **Find Pre-converted Model:**
   - Check Hugging Face: https://huggingface.co/models?search=executorch+llama
   - Look for `.pte` format files
   - Download `llama-3.2-3b-instruct.pte`

2. **Add to Project:**
   ```bash
   mkdir -p assets/models
   # Copy your .pte file here
   ```

3. **Update app.json:**
   ```json
   {
     "expo": {
       "assetBundlePatterns": [
         "assets/models/**/*"
       ]
     }
   }
   ```

---

### Approach 2: Convert Model Yourself

If you need to convert the model:

#### Step 1: Run Conversion Script

```bash
C:\Users\Shane\AppData\Local\Programs\Python\Python312\python.exe scripts/convert-llama-to-executorch.py
```

**Note:** This requires:
- Hugging Face account with Llama access
- 16GB+ RAM
- 10GB+ disk space
- May take 30+ minutes

#### Step 2: Use Converted Model

After conversion, use the model in your app as shown in Approach 1.

---

## 📝 Updated Coach Component

Here's how to update your `app/(tabs)/Coach.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useLLM } from 'react-native-executorch';

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

  // Initialize Executorch LLM
  const llm = useLLM({
    model: 'llama-3.2-3b', // Check available models
    // Or specify path to your .pte file:
    // modelPath: require('@/assets/models/llama-3.2-3b-instruct.pte'),
  });

  const sendToLlama = async () => {
    if (!inputText.trim()) {
      setError('Please enter some text');
      return;
    }

    setLoading(true);
    setError('');
    setResponse('');

    try {
      if (useExecutorch && llm) {
        // Use Executorch (on-device)
        const chat = [
          { role: 'system', content: 'You are a helpful fitness coach. Provide clear, actionable advice.' },
          { role: 'user', content: inputText }
        ];

        await llm.generate(chat);
        setResponse(llm.response || 'No response generated');
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

        {useExecutorch && (
          <ThemedView style={styles.infoContainer}>
            <ThemedText style={styles.infoText}>
              ✓ Using Executorch (on-device, offline-capable)
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

// ... your existing styles
```

---

## 🔍 Check react-native-executorch API

The package may have different APIs. Check:

1. **Package Documentation:**
   ```bash
   npm info react-native-executorch
   ```

2. **Type Definitions:**
   ```bash
   # Check node_modules/react-native-executorch for .d.ts files
   ```

3. **GitHub Repository:**
   - Visit the package's GitHub page
   - Check README and examples

---

## 🎯 Next Steps

1. **Check Available Models:**
   - Look at `react-native-executorch` documentation
   - See what models are pre-converted

2. **Test with Simple Example:**
   - Try the `useLLM` hook with a small test
   - Verify it works before full integration

3. **Download Model if Needed:**
   - Find pre-converted `.pte` file
   - Or run conversion script

4. **Update Coach Component:**
   - Use the code above as a template
   - Test on Android device/emulator

---

## ⚠️ Important Notes

1. **Model Size:**
   - Llama 3.2 3B is large (~2-3GB even quantized)
   - May increase app size significantly
   - Consider using smaller model for testing

2. **Performance:**
   - First inference may be slow (model loading)
   - Subsequent inferences should be faster
   - May use significant device memory

3. **Expo Compatibility:**
   - `react-native-executorch` may require custom development build
   - May not work with Expo Go
   - Check package requirements

4. **Fallback:**
   - Keep HTTP server approach as fallback
   - Allows switching between methods
   - Useful for development/testing

---

## 🐛 Troubleshooting

### "useLLM is not a function"
- Check if `react-native-executorch` exports `useLLM`
- May need different import or API
- Check package version and documentation

### "Model not found"
- Ensure model file exists in `assets/models/`
- Check file path in `useLLM` config
- Verify model format is `.pte`

### "Native module not found"
- May need custom development build
- Check if native code is properly linked
- Rebuild app after adding native dependencies

### Performance Issues
- Use quantized model (INT8 or INT4)
- Reduce model size if possible
- Consider smaller model for testing

---

## 📚 Resources

- **react-native-executorch Docs:** Check npm package page
- **Executorch Docs:** https://executorch.ai/
- **Hugging Face Models:** https://huggingface.co/models?search=executorch
- **Llama Models:** https://huggingface.co/meta-llama

---

## Summary

✅ **Executorch is installed and ready!**

**To get Llama running:**
1. Check `react-native-executorch` for available models
2. Use `useLLM` hook in your component
3. Download pre-converted model if needed
4. Test and enjoy on-device inference!

The HTTP server approach still works as a fallback, so you have both options available! 🚀


