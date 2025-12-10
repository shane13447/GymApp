# Executorch Quick Start Guide

## What is Executorch?

Executorch is Meta's PyTorch runtime that lets you run AI models **directly in your app** without needing a separate server. Think of it as running the model "on-device" instead of making HTTP requests.

## Key Differences

| Feature | HTTP Server | Executorch |
|---------|-------------|------------|
| **Setup** | Easy (separate process) | Complex (model conversion) |
| **Performance** | Good (network overhead) | Excellent (direct execution) |
| **Offline** | ❌ Requires server | ✅ Fully offline |
| **App Size** | Small | Larger (model in app) |
| **Updates** | Easy (update server) | Hard (app update needed) |

## When to Use Executorch

✅ **Use Executorch when:**
- You want the best performance
- You need offline functionality
- Model size is reasonable (<500MB)
- You want everything self-contained

❌ **Stick with HTTP when:**
- Quick prototyping
- Model is very large
- You want easy model updates
- Using GGUF format (llama.cpp)

---

## Step-by-Step Setup

### 1. Convert Llama Model to Executorch Format

**The Challenge:** Llama models are typically in GGUF format (for llama.cpp) or PyTorch format. Executorch needs `.pte` format.

**Option A: Use Pre-converted Model (If Available)**
- Check Meta's official repositories for Executorch-compatible Llama models
- Look for files ending in `.pte`

**Option B: Convert from PyTorch**

```python
# install dependencies
pip install torch executorch transformers

# Convert script
from transformers import AutoModel, AutoTokenizer
import torch
from executorch.exir import to_edge_transform_and_lower
from executorch.backends.xnnpack.partition.xnnpack_partitioner import XnnpackPartitioner

# Load model
model_name = "meta-llama/Llama-3.2-3B-Instruct"
model = AutoModel.from_pretrained(model_name)
model.eval()

# Export to Executorch
example_inputs = (torch.randint(0, 1000, (1, 128)),)  # Adjust shape
exported_program = torch.export.export(model, example_inputs)

# Optimize for mobile
program = to_edge_transform_and_lower(
    exported_program,
    partitioner=[XnnpackPartitioner()]
).to_executorch()

# Save
with open("llama-3.2-3b-instruct.pte", "wb") as f:
    f.write(program.buffer)
```

**⚠️ Important Notes:**
- Llama 3.2 3B is large (~6GB in FP32, ~3GB in FP16)
- You'll likely need quantization (INT8 ~1.5GB, INT4 ~750MB)
- Conversion can take significant time and memory

### 2. Add Model to Your App

```bash
# Create models directory
mkdir -p assets/models

# Copy your .pte file
cp llama-3.2-3b-instruct.pte assets/models/
```

Update `app.json`:
```json
{
  "expo": {
    "assetBundlePatterns": [
      "assets/models/**/*"
    ]
  }
}
```

### 3. Set Up Native Module

Executorch requires native code. Since you're using Expo, you have two options:

**Option A: Use Expo Development Build**
- Create a development build (not Expo Go)
- Add native Executorch module
- More complex but full control

**Option B: Use react-native-executorch Package**
- The package you have installed should provide the bridge
- Check its documentation for setup

### 4. Use the Service

The `services/executorch-service.ts` file is already created. Use it in your Coach component:

```typescript
import ExecutorchService from '@/services/executorch-service';

// Load model on mount
useEffect(() => {
  if (ExecutorchService.isAvailable()) {
    ExecutorchService.loadModel().catch(console.error);
  }
}, []);

// Run inference
const result = await ExecutorchService.runInference(prompt, {
  maxTokens: 512,
  temperature: 0.7,
});
```

---

## Current Status of Your Setup

✅ **What you have:**
- `react-native-executorch` package installed
- Service file created (`services/executorch-service.ts`)
- App structure ready

❌ **What you need:**
- Converted `.pte` model file
- Native module implementation (or verify react-native-executorch works)
- Tokenizer integration (for proper text → tokens conversion)

---

## Practical Recommendation

**For now, stick with the HTTP server approach** because:
1. ✅ It works immediately
2. ✅ No model conversion needed
3. ✅ Easier to debug
4. ✅ Can update model without app updates

**Consider Executorch later when:**
- You need offline functionality
- Performance becomes critical
- You have time for model conversion
- You want to leverage device accelerators

---

## If You Want to Proceed with Executorch

1. **Check react-native-executorch docs:**
   ```bash
   npm info react-native-executorch
   # Or check: https://github.com/pytorch/executorch
   ```

2. **Verify it works with Expo:**
   - May need custom development build
   - May need to eject from Expo managed workflow

3. **Test with a smaller model first:**
   - Don't start with 3B model
   - Try a smaller model (100M-1B) to verify setup

4. **Handle tokenization:**
   - Use `transformers.js` for React Native tokenization
   - Or implement native tokenizer module

---

## Need Help?

- **Executorch Docs:** https://executorch.ai/
- **React Native Executorch:** Check package GitHub
- **Model Conversion:** PyTorch export documentation
- **Tokenization:** transformers.js or native implementation

---

## Summary

Executorch is powerful but complex. The HTTP server approach is simpler and works well for most use cases. Consider Executorch when you specifically need:
- Offline functionality
- Maximum performance
- Self-contained app

For your workout app, the HTTP approach is probably the better starting point! 🚀



