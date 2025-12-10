# Llama 3.2 3B Setup Guide for Android

This guide walks you through setting up Llama 3.2 3B to run locally on an Android device and connect it to your workout app.

## Overview

There are two main approaches:
1. **Option A: llama.cpp with HTTP Server** (Recommended - easier setup)
2. **Option B: Executorch Integration** (More complex, but better performance)

We'll use **Option A** as it's more straightforward and works well with your existing HTTP-based setup.

---

## Prerequisites

- Android device or emulator (Android 8.0+ recommended)
- ADB (Android Debug Bridge) installed
- At least 4GB free storage on device
- Android device with 4GB+ RAM for best performance

---

## Step 1: Download Llama 3.2 3B Model

1. Download the quantized model (GGUF format) from Hugging Face:
   - Visit: https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF
   - Download: `llama-3.2-3b-instruct-q4_k_m.gguf` (recommended size/quality balance)
   - File size: ~2.3GB

2. Save it to a location you can access (e.g., Downloads folder)

---

## Step 2: Build llama.cpp for Android

### Option 2A: Pre-built Binary (Easiest)

1. Download pre-built llama.cpp server for Android:
   - Visit: https://github.com/ggerganov/llama.cpp/releases
   - Look for Android ARM64 builds, or build yourself (see Option 2B)

### Option 2B: Build from Source

1. **Install Android NDK:**
   ```bash
   # Download Android NDK from https://developer.android.com/ndk/downloads
   # Extract to a location like C:\Android\ndk\25.2.9519653
   ```

2. **Clone llama.cpp:**
   ```bash
   git clone https://github.com/ggerganov/llama.cpp.git
   cd llama.cpp
   ```

3. **Build for Android:**
   ```bash
   # Set NDK path
   set ANDROID_NDK=C:\Android\ndk\25.2.9519653
   
   # Build server
   mkdir build-android
   cd build-android
   cmake .. -DCMAKE_TOOLCHAIN_FILE=%ANDROID_NDK%\build\cmake\android.toolchain.cmake -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-21 -DBUILD_SHARED_LIBS=ON
   cmake --build . --config Release
   ```

4. **Copy the server binary:**
   - Find `llama-server` or `server` executable in `build-android/bin/`
   - This is what you'll push to your Android device

---

## Step 3: Set Up Model on Android Device

1. **Enable USB Debugging on your Android device:**
   - Settings → About Phone → Tap "Build Number" 7 times
   - Settings → Developer Options → Enable "USB Debugging"

2. **Connect device via USB and verify:**
   ```bash
   adb devices
   ```

3. **Create directory on device:**
   ```bash
   adb shell mkdir -p /sdcard/llama
   ```

4. **Push model file to device:**
   ```bash
   adb push llama-3.2-3b-instruct-q4_k_m.gguf /sdcard/llama/
   ```

5. **Push llama-server binary:**
   ```bash
   adb push llama-server /data/local/tmp/
   adb shell chmod 755 /data/local/tmp/llama-server
   ```

---

## Step 4: Start Llama Server on Android

1. **Start the server:**
   ```bash
   adb shell /data/local/tmp/llama-server -m /sdcard/llama/llama-3.2-3b-instruct-q4_k_m.gguf -c 2048 --port 8080 --host 0.0.0.0
   ```

   **Note:** The server will run in the foreground. Keep this terminal open.

2. **Verify server is running:**
   ```bash
   # In another terminal
   adb shell netstat -an | grep 8080
   ```

---

## Step 5: Configure Your App

### For Android Emulator:
- Use `http://10.0.2.2:8080` (special IP for emulator's host machine)

### For Physical Android Device:
- Find your device's IP address:
  ```bash
  adb shell ip addr show wlan0
  # Or check in Settings → About Phone → Status → IP Address
  ```
- Use `http://[DEVICE_IP]:8080` (e.g., `http://192.168.1.100:8080`)

### Update the App Code:
The app has been updated to automatically detect the correct endpoint. See `app/(tabs)/Coach.tsx` for the implementation.

---

## Step 6: Test the Connection

1. **Start your Expo app:**
   ```bash
   npm run android
   ```

2. **Navigate to the Coach tab**

3. **Try sending a message:**
   - Example: "What's a good workout for beginners?"

4. **Check the response** - it should come from your local Llama model!

---

## Troubleshooting

### Server won't start:
- Check if port 8080 is already in use: `adb shell netstat -an | grep 8080`
- Try a different port: `--port 8081`
- Ensure model file is accessible: `adb shell ls -lh /sdcard/llama/`

### Connection refused:
- **Emulator:** Make sure you're using `10.0.2.2:8080`
- **Physical device:** Verify the device IP and that both devices are on the same network
- Check firewall settings on your device

### Out of memory:
- Use a smaller quantized model (q3_k_m or q2_k)
- Reduce context size: `-c 1024` instead of `-c 2048`

### Server stops when terminal closes:
- Use `nohup` or run in background:
  ```bash
  adb shell "nohup /data/local/tmp/llama-server -m /sdcard/llama/llama-3.2-3b-instruct-q4_k_m.gguf -c 2048 --port 8080 --host 0.0.0.0 > /sdcard/llama/server.log 2>&1 &"
  ```

---

## Alternative: Using Termux (Easier for Testing)

If building is too complex, you can use Termux on Android:

1. **Install Termux from F-Droid** (not Play Store - that version is outdated)

2. **In Termux:**
   ```bash
   pkg update && pkg upgrade
   pkg install wget
   wget https://github.com/ggerganov/llama.cpp/releases/download/b1234/llama-server-android-arm64
   chmod +x llama-server-android-arm64
   ```

3. **Download model:**
   ```bash
   wget https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/llama-3.2-3b-instruct-q4_k_m.gguf
   ```

4. **Run server:**
   ```bash
   ./llama-server-android-arm64 -m llama-3.2-3b-instruct-q4_k_m.gguf --port 8080 --host 0.0.0.0
   ```

---

## Performance Tips

- **Quantization:** q4_k_m is a good balance. q3_k_m is faster but lower quality.
- **Context size:** Reduce `-c` parameter if you get OOM errors
- **Threads:** Add `-t 4` to use 4 threads (adjust based on your device)
- **GPU:** If your device supports it, llama.cpp can use GPU acceleration

---

## Next Steps

Once working, you can:
- Create a background service to keep the server running
- Add model management UI in your app
- Implement streaming responses for better UX
- Add conversation history/memory



