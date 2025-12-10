# Quick Start: Llama 3.2 3B on Android

## TL;DR - Fastest Path

### 1. Download Model
```bash
# Download from Hugging Face (2.3GB)
# https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF
# File: llama-3.2-3b-instruct-q4_k_m.gguf
```

### 2. Get llama-server Binary
- **Option A (Easiest):** Use Termux on your Android device (see LLAMA_ANDROID_SETUP.md)
- **Option B:** Build from source using Android NDK
- **Option C:** Find pre-built ARM64 binary from llama.cpp releases

### 3. Setup on Device (PowerShell)
```powershell
# Run the setup script
.\scripts\setup-llama-android.ps1
```

### 4. Start Server
```powershell
# Start the server
.\scripts\start-llama-server.ps1
```

### 5. Run Your App
```bash
npm run android
```

### 6. Configure Connection
- **Android Emulator:** Leave IP field empty (uses 10.0.2.2 automatically)
- **Physical Device:** Enter your device's IP address in the Coach tab

## What Changed in Your App

1. **Coach.tsx** - Now detects Android and uses correct localhost address
2. **app.json** - Added cleartext traffic permission for HTTP
3. **API Format** - Updated to match llama.cpp server API

## Testing

1. Open the Coach tab in your app
2. Type a message like "What's a good workout routine?"
3. Tap Send
4. You should see a response from your local Llama model!

## Troubleshooting

**Connection refused?**
- Make sure server is running: `adb shell netstat -an | grep 8080`
- For physical device, check the IP address matches
- Verify both app and server are on the same network

**Server not starting?**
- Check model file exists: `adb shell ls -lh /sdcard/llama/`
- Verify binary is executable: `adb shell ls -l /data/local/tmp/llama-server`

**Out of memory?**
- Use smaller model (q3_k_m instead of q4_k_m)
- Reduce context: `-c 1024` instead of `-c 2048`

For detailed instructions, see **LLAMA_ANDROID_SETUP.md**



