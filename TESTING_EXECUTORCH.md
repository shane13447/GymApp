# Testing Executorch Integration - Step-by-Step Guide

## ⚠️ Important: Development Build Required

**Executorch will NOT work in Expo Go.** You must create a development build because `react-native-executorch` requires native code.

## 🪟 Windows Users - Quick Start

**If you're on Windows PowerShell, use these commands:**

```powershell
# Navigate to project (if not already there)
cd c:\Users\Shane\ShanesGymApp\GymApp

# Install dependencies
npm install

# Create development build
npx expo prebuild --platform android --clean

# Build and run
npx expo run:android
```

**To clean/delete folders on Windows, use:**
```powershell
# Instead of: rm -rf android ios node_modules
Remove-Item -Recurse -Force android, ios, node_modules -ErrorAction SilentlyContinue
```

---

## 🚀 Quick Test Steps

### Step 1: Verify Prerequisites

✅ **Check your setup:**
- [ ] Node.js installed
- [ ] Android Studio installed (for Android) or Xcode (for iOS)
- [ ] Android SDK installed (for Android)
- [ ] Device/Emulator ready (Android 13+ recommended)

### Step 2: Install Dependencies

```bash
# Make sure you're in the project directory
cd c:\Users\Shane\ShanesGymApp\GymApp

# Install/update dependencies
npm install
```

### Step 3: Create Development Build

#### For Android:

```bash
# Generate native Android project
npx expo prebuild --platform android --clean

# Build and run on connected device/emulator
npx expo run:android
```

**OR** if you want to build manually:

```bash
# Generate native project
npx expo prebuild --platform android

# Open Android Studio and build from there
# Or use Gradle directly (Windows):
cd android
.\gradlew.bat assembleDebug
.\gradlew.bat installDebug

# Or on Mac/Linux:
# ./gradlew assembleDebug
# ./gradlew installDebug
```

#### For iOS (Mac only):

```bash
# Generate native iOS project
npx expo prebuild --platform ios --clean

# Build and run
npx expo run:ios
```

### Step 4: Test the Integration

1. **Launch the app** on your device/emulator
2. **Navigate to the Coach tab**
3. **Watch for model loading:**
   - First time: You'll see "Loading model..." with download progress
   - Model download: ~2-3GB (takes 10+ minutes on first run)
   - Model loading: After download, model loads into memory (~1-2 minutes)

4. **When ready:**
   - You'll see: "✓ Using Executorch - Llama 3.2 3B QLORA (on-device, offline-capable)"
   - Input field becomes enabled

5. **Test inference:**
   - Type a message like: "Create a 30-minute upper body workout"
   - Tap "Send"
   - Watch the response generate on-device!

---

## 🧪 Testing Checklist

### Basic Functionality

- [ ] App builds without errors
- [ ] App launches successfully
- [ ] Coach tab loads
- [ ] Model download starts automatically
- [ ] Download progress shows correctly
- [ ] Model loads after download
- [ ] "Using Executorch" message appears when ready
- [ ] Input field is enabled when model is ready
- [ ] Can type in input field
- [ ] Send button works
- [ ] Response generates successfully
- [ ] Response displays correctly

### Advanced Testing

- [ ] Toggle between Executorch and HTTP works
- [ ] HTTP fallback still works
- [ ] Error handling works (try with model not loaded)
- [ ] Model works offline (turn off WiFi after download)
- [ ] Multiple requests work sequentially
- [ ] Can interrupt generation (if implemented)

---

## 🐛 Troubleshooting

### "useLLM is not a function" or Import Errors

**Solution:**
```bash
# Clean and rebuild
npx expo prebuild --platform android --clean
npx expo run:android
```

### Model Won't Download

**Check:**
- [ ] Internet connection is stable
- [ ] Device has 5GB+ free storage
- [ ] Check console logs for errors
- [ ] Try again - download may resume

**Solution:**
- Check device storage: Settings → Storage
- Clear app data and try again
- Check network permissions in AndroidManifest.xml

### App Crashes on Launch

**Possible causes:**
- Insufficient RAM (need 4GB+)
- Android version too old (need 13+)
- Native module not linked properly

**Solution:**
```bash
# Clean everything (Windows PowerShell)
npx expo prebuild --platform android --clean
Remove-Item -Recurse -Force android, ios, node_modules -ErrorAction SilentlyContinue
npm install
npx expo prebuild --platform android
npx expo run:android

# Or on Mac/Linux:
# rm -rf android ios node_modules
```

### Model Loads But No Response

**Check:**
- [ ] Model is actually ready (`llm.isReady === true`)
- [ ] Check console for errors
- [ ] Try a simpler prompt
- [ ] Check if response is being set correctly

**Debug:**
```typescript
// Add to Coach.tsx temporarily
console.log('LLM State:', {
  isReady: llm.isReady,
  isGenerating: llm.isGenerating,
  error: llm.error,
  response: llm.response,
});
```

### Build Errors

#### "SDK location not found" Error

**This is the most common build error!** The Android SDK path is not configured.

**Solution:**
```powershell
# Find your Android SDK path (usually one of these):
# C:\Users\YourName\AppData\Local\Android\Sdk
# Or check Android Studio: File → Settings → Appearance & Behavior → System Settings → Android SDK

# Create local.properties file in android folder:
cd c:\Users\Shane\ShanesGymApp\GymApp\android

# Create the file with your SDK path (use forward slashes and escape backslashes):
# sdk.dir=C\:\\Users\\Shane\\AppData\\Local\\Android\\Sdk

# Or set ANDROID_HOME environment variable:
[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', 'C:\Users\Shane\AppData\Local\Android\Sdk', 'User')
```

**Note:** The `local.properties` file should already be created automatically, but if you get this error, create it manually.

#### Other Build Errors

**Common issues:**
- Gradle sync fails
- NDK not found
- SDK version mismatch

**Solution:**
```bash
# Update Android SDK
# In Android Studio: Tools → SDK Manager
# Install: Android SDK Platform 33+, NDK, CMake

# Or update build.gradle
# android/build.gradle - check minSdkVersion (should be 23+)
```

---

## 📊 Performance Testing

### Expected Performance

- **Model Download:** 10-30 minutes (first time only, depends on connection)
- **Model Loading:** 1-2 minutes (after download)
- **First Inference:** 5-15 seconds (model warmup)
- **Subsequent Inferences:** 2-8 seconds per response

### Test Different Scenarios

1. **Short prompts:** "Hello"
2. **Medium prompts:** "Create a workout for legs"
3. **Long prompts:** "Create a detailed 60-minute full body workout with 5 exercises, including sets, reps, and rest times"
4. **Multiple requests:** Send 3-4 requests in a row
5. **Offline mode:** Turn off WiFi and test

---

## 🔍 Debugging Tips

### Enable Debug Logging

Add to your `Coach.tsx`:

```typescript
useEffect(() => {
  console.log('Executorch State:', {
    isReady: llm.isReady,
    isGenerating: llm.isGenerating,
    downloadProgress: llm.downloadProgress,
    error: llm.error,
    hasResponse: !!llm.response,
  });
}, [llm.isReady, llm.isGenerating, llm.downloadProgress, llm.error, llm.response]);
```

### Check Native Module

```typescript
// Add temporarily to check if module is available
import { NativeModules } from 'react-native';
console.log('Available modules:', Object.keys(NativeModules));
```

### Monitor Network (for download)

- Check device network usage
- Monitor download progress in UI
- Check if download completes

---

## ✅ Success Indicators

You'll know it's working when:

1. ✅ App builds and runs without crashes
2. ✅ Model download progress shows in UI
3. ✅ "Using Executorch" message appears
4. ✅ You can send a message
5. ✅ Response generates and displays
6. ✅ Response is relevant to your prompt
7. ✅ Works offline (after initial download)

---

## 🎯 Quick Test Commands

```bash
# Full clean rebuild (if having issues)
# Windows PowerShell:
Remove-Item -Recurse -Force android, ios, node_modules, .expo -ErrorAction SilentlyContinue
npm install
npx expo prebuild --platform android --clean
npx expo run:android

# Mac/Linux:
# rm -rf android ios node_modules .expo
```

# Just rebuild native code
npx expo prebuild --platform android
npx expo run:android

# Check if package is installed
npm list react-native-executorch

# Check Expo version
npx expo --version
```

---

## 📱 Testing on Physical Device

### Android:

1. Enable Developer Options on device
2. Enable USB Debugging
3. Connect via USB
4. Run: `npx expo run:android`
5. App will install and launch automatically

### iOS:

1. Connect iPhone via USB
2. Trust computer on device
3. Run: `npx expo run:ios`
4. Select your device when prompted

---

## 🚨 Common Error Messages

| Error | Solution |
|-------|----------|
| "Cannot find module 'react-native-executorch'" | Run `npm install` |
| "useLLM is not a function" | Rebuild app with `npx expo prebuild` |
| "Model download failed" | Check internet, storage, retry |
| "App crashes on launch" | Check RAM, Android version, rebuild |
| "No response generated" | Check if model is ready, check console |
| "install_failure_user_restricted" | See troubleshooting section below |

### "install_failure_user_restricted" Error

**This error appears even though you didn't cancel anything!** It's usually a device security/configuration issue.

**Common Causes & Solutions:**

1. **Device is Locked During Installation**
   - **Fix:** Unlock your device/emulator before installing
   - Keep device unlocked during the entire installation process

2. **USB Debugging Authorization Not Granted**
   - **Fix:** 
     - On device: Check for "Allow USB debugging?" popup → Tap "Allow"
     - Settings → Developer Options → Revoke USB debugging authorizations → Try again
     - Reconnect USB cable and grant permission again

3. **Developer Options Not Fully Enabled**
   - **Fix:**
     - Settings → About Phone → Tap "Build Number" 7 times
     - Settings → Developer Options → Enable "USB Debugging"
     - Enable "Install via USB" (if available)
     - Enable "USB Debugging (Security settings)" (if available)

4. **Multiple Devices Connected**
   - **Fix:**
     ```powershell
     # Check connected devices
     # Add Android SDK platform-tools to PATH first, then:
     adb devices
     # Disconnect extra devices, keep only one
     ```

5. **App Already Installed with Different Signature**
   - **Fix:**
     - Uninstall existing app: `adb uninstall com.anonymous.Shanesgymapp`
     - Or manually uninstall from device Settings → Apps
     - Then try installing again

6. **Device Storage Full**
   - **Fix:**
     - Free up space (need 5GB+ for model download)
     - Settings → Storage → Clear cache/data

7. **Emulator Issues**
   - **Fix:**
     - Cold boot emulator: Android Studio → AVD Manager → Cold Boot Now
     - Or restart emulator completely
     - Check emulator has enough RAM (4GB+)

8. **Security Settings Blocking Installation**
   - **Fix:**
     - Settings → Security → Unknown Sources → Allow (if installing APK directly)
     - Settings → Apps → Special Access → Install Unknown Apps → Allow for your app

**Quick Fix Steps (Try in Order):**

```powershell
# 1. Unlock your device/emulator
# 2. Uninstall existing app (if any)
# 3. Reconnect USB cable
# 4. Grant USB debugging permission on device
# 5. Try installing again:
npx expo run:android
```

**If Still Failing:**

1. **Check Device Connection:**
   - Ensure device shows as "device" (not "unauthorized" or "offline")
   - In Android Studio: Tools → Device Manager → Check device status

2. **Try Manual Installation:**
   ```powershell
   # Build APK first
   cd android
   .\gradlew.bat assembleDebug
   
   # Then install manually (if adb is in PATH):
   adb install app\build\outputs\apk\debug\app-debug.apk
   ```

3. **Check Logs:**
   ```powershell
   # View device logs for more details:
   adb logcat | Select-String "install"
   ```

---

## 📞 Need Help?

1. Check console logs in Metro bundler
2. Check device logs: `adb logcat` (Android)
3. Check `EXECUTORCH_GETTING_STARTED.md` for detailed guide
4. Check package docs: https://docs.swmansion.com/react-native-executorch

---

**Good luck testing! 🚀**
