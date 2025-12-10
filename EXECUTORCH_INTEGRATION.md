# Executorch Integration Guide for Llama 3.2 3B

## Overview: Executorch vs HTTP Server Approach

### HTTP Server Approach (Current)
- **How it works:** llama.cpp server runs as a separate process, app makes HTTP requests
- **Pros:** Easier setup, works immediately, can use existing GGUF models
- **Cons:** Network overhead, separate process, requires server management

### Executorch Approach
- **How it works:** Model runs directly in your app's process using Executorch runtime
- **Pros:** Better performance, no network overhead, fully integrated, can use device accelerators
- **Cons:** More complex setup, requires model conversion, larger app size

---

## What is Executorch?

Executorch is Meta's PyTorch runtime designed for on-device inference. It allows you to:
- Run PyTorch models directly in your mobile app
- Leverage device hardware (CPU, GPU, NPU) automatically
- Achieve better performance than HTTP-based approaches
- Keep everything self-contained in your app

---

## Prerequisites

1. **Python environment** with PyTorch and Executorch
2. **Llama model in PyTorch format** (or convert from Hugging Face)
3. **react-native-executorch** (already installed in your project)
4. **Android NDK** (for building native components if needed)

---

## Step 1: Convert Llama Model to Executorch Format

### Option A: Use Pre-converted Model (Easiest)

Check if Meta provides Executorch-compatible Llama models:
- Look for `.pte` (PyTorch Executorch) files
- Check Meta's official repositories

### Option B: Convert from PyTorch Model

1. **Install Executorch:**

```bash
pip install executorch
```

2. **Download Llama 3.2 3B in PyTorch format:**

```python
from transformers import AutoModel, AutoTokenizer
import torch

# Load model from Hugging Face
model_name = "meta-llama/Llama-3.2-3B-Instruct"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModel.from_pretrained(model_name)

# Save PyTorch model
torch.save(model.state_dict(), "llama-3.2-3b.pt")
```

3. **Convert to Executorch format (.pte):**

```python
import torch
from executorch.exir import to_edge_transform_and_lower
from executorch.backends.xnnpack.partition.xnnpack_partitioner import XnnpackPartitioner

# Load your model
model = YourLlamaModel()  # Your model class
model.load_state_dict(torch.load("llama-3.2-3b.pt"))
model.eval()

# Example input (adjust based on your model)
example_inputs = (torch.randint(0, 1000, (1, 128)),)  # token_ids

# Export to Executorch
exported_program = torch.export.export(model, example_inputs)

# Optimize for mobile (XNNPACK backend for CPU)
program = to_edge_transform_and_lower(
    exported_program,
    partitioner=[XnnpackPartitioner()]
).to_executorch()

# Save as .pte file
with open("llama-3.2-3b-instruct.pte", "wb") as f:
    f.write(program.buffer)

print("Model converted successfully!")
```

**Note:** Llama models are large and complex. You may need to:
- Use quantization (INT8 or INT4)
- Split the model into smaller parts
- Use model optimization tools

---

## Step 2: Add Model to Your App

1. **Create assets directory:**

```bash
mkdir -p assets/models
```

2. **Copy your .pte model file:**

```bash
cp llama-3.2-3b-instruct.pte assets/models/
```

3. **Update app.json to include assets:**

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

## Step 3: Create Executorch Service

Create a service to handle model loading and inference:

```typescript
// services/executorch-service.ts
import { NativeModules } from 'react-native';
import * as FileSystem from 'expo-file-system';

const { ExecutorchModule } = NativeModules;

export interface InferenceResult {
  output: number[];
  tokens: string[];
}

class ExecutorchService {
  private modelPath: string | null = null;
  private isLoaded: boolean = false;

  /**
   * Load the Executorch model
   */
  async loadModel(): Promise<void> {
    try {
      // Get the model file path
      const modelUri = require('@/assets/models/llama-3.2-3b-instruct.pte');
      
      // Copy to app's document directory if needed
      const documentsDir = FileSystem.documentDirectory;
      const localPath = `${documentsDir}llama-model.pte`;
      
      // Check if already exists
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      if (!fileInfo.exists) {
        // Copy from assets
        await FileSystem.copyAsync({
          from: modelUri,
          to: localPath,
        });
      }

      // Load model in Executorch
      await ExecutorchModule.loadModel(localPath);
      this.modelPath = localPath;
      this.isLoaded = true;
      
      console.log('Model loaded successfully');
    } catch (error) {
      console.error('Error loading model:', error);
      throw error;
    }
  }

  /**
   * Run inference on the model
   */
  async runInference(input: string): Promise<string> {
    if (!this.isLoaded) {
      await this.loadModel();
    }

    try {
      // Tokenize input (you'll need a tokenizer)
      const tokens = this.tokenize(input);
      
      // Run inference
      const result: InferenceResult = await ExecutorchModule.runInference(
        tokens,
        {
          maxTokens: 512,
          temperature: 0.7,
          topP: 0.9,
        }
      );

      // Detokenize output
      return this.detokenize(result.tokens);
    } catch (error) {
      console.error('Error running inference:', error);
      throw error;
    }
  }

  /**
   * Simple tokenization (you'll need proper tokenizer)
   */
  private tokenize(text: string): number[] {
    // TODO: Implement proper tokenization
    // For now, simple character-based encoding
    return text.split('').map(char => char.charCodeAt(0));
  }

  /**
   * Simple detokenization
   */
  private detokenize(tokens: number[]): string {
    // TODO: Implement proper detokenization
    return String.fromCharCode(...tokens);
  }

  /**
   * Check if model is loaded
   */
  isModelLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Unload model to free memory
   */
  async unloadModel(): Promise<void> {
    if (this.isLoaded) {
      await ExecutorchModule.unloadModel();
      this.isLoaded = false;
    }
  }
}

export default new ExecutorchService();
```

---

## Step 4: Update Coach.tsx to Use Executorch

Update your Coach component to use Executorch instead of HTTP:

```typescript
// app/(tabs)/Coach.tsx
import { useState, useEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import ExecutorchService from '@/services/executorch-service';

export default function HomeScreen() {
  const [inputText, setInputText] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modelLoading, setModelLoading] = useState(false);
  const [useExecutorch, setUseExecutorch] = useState(true); // Toggle between methods

  // Load model on mount
  useEffect(() => {
    if (useExecutorch && !ExecutorchService.isModelLoaded()) {
      loadModel();
    }
  }, [useExecutorch]);

  const loadModel = async () => {
    setModelLoading(true);
    try {
      await ExecutorchService.loadModel();
    } catch (err) {
      setError('Failed to load model. Falling back to HTTP mode.');
      setUseExecutorch(false);
    } finally {
      setModelLoading(false);
    }
  };

  const sendToLlama = async () => {
    if (!inputText.trim()) {
      setError('Please enter some text');
      return;
    }

    setLoading(true);
    setError('');
    setResponse('');

    try {
      let result: string;

      if (useExecutorch && ExecutorchService.isModelLoaded()) {
        // Use Executorch
        result = await ExecutorchService.runInference(inputText);
      } else {
        // Fallback to HTTP (your existing code)
        result = await sendToHttpServer(inputText);
      }

      setResponse(result);
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to get response';
      setError(errorMessage);
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Your existing HTTP method (as fallback)
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

        {modelLoading && (
          <ThemedView style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <ThemedText>Loading model...</ThemedText>
          </ThemedView>
        )}

        {useExecutorch && (
          <ThemedView style={styles.infoContainer}>
            <ThemedText style={styles.infoText}>
              ✓ Using Executorch (on-device inference)
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
            (loading || modelLoading) && styles.sendButtonDisabled,
          ]}
          onPress={sendToLlama}
          disabled={loading || modelLoading}
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

// ... rest of your styles
```

---

## Step 5: Native Module Setup (Android)

You'll need to create a native module bridge. Create these files:

### android/app/src/main/java/com/yourpackage/ExecutorchModule.java

```java
package com.yourpackage;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

// Import Executorch classes
import org.pytorch.executorch.ExecutorchModule as ExecutorchNative;

public class ExecutorchModule extends ReactContextBaseJavaModule {
    private ExecutorchNative module = null;

    public ExecutorchModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "ExecutorchModule";
    }

    @ReactMethod
    public void loadModel(String modelPath, Promise promise) {
        try {
            module = ExecutorchNative.load(modelPath);
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("LOAD_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void runInference(int[] input, Promise promise) {
        try {
            // Convert input to tensor
            // Run inference
            // Convert output back
            // Return result
            WritableMap result = Arguments.createMap();
            // ... populate result
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("INFERENCE_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void unloadModel(Promise promise) {
        try {
            module = null;
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("UNLOAD_ERROR", e.getMessage());
        }
    }
}
```

**Note:** This is a simplified example. You'll need to:
- Add proper Executorch Android dependencies
- Implement tensor conversion
- Handle tokenization/detokenization
- Add proper error handling

---

## Step 6: Install Required Dependencies

```bash
npm install expo-file-system
```

---

## Comparison: When to Use Each Approach

### Use HTTP Server Approach When:
- ✅ Quick prototyping
- ✅ Model is too large for app bundle
- ✅ You want to update model without app updates
- ✅ Multiple apps share the same model
- ✅ You're using GGUF format (llama.cpp)

### Use Executorch Approach When:
- ✅ You want best performance
- ✅ You need offline functionality
- ✅ Model size is manageable (<500MB recommended)
- ✅ You want to leverage device accelerators
- ✅ You want everything self-contained

---

## Troubleshooting

### Model Too Large
- Use quantization (INT8, INT4)
- Split model into smaller parts
- Use model compression techniques

### Performance Issues
- Enable hardware acceleration in Executorch config
- Use appropriate backend (XNNPACK, CoreML, etc.)
- Optimize model architecture

### Build Errors
- Ensure Android NDK is properly configured
- Check Executorch native dependencies
- Verify model format is correct (.pte)

---

## Additional Resources

- [Executorch Official Docs](https://executorch.ai/)
- [react-native-executorch GitHub](https://github.com/pytorch/executorch)
- [PyTorch Mobile](https://pytorch.org/mobile/)

---

## Next Steps

1. Convert your Llama model to .pte format
2. Integrate the Executorch service
3. Test performance vs HTTP approach
4. Optimize model size and inference speed
5. Add proper tokenization (use transformers.js or similar)



