#!/bin/bash
# Helper script to set up Llama 3.2 3B on Android device
# Usage: ./scripts/setup-llama-android.sh

echo "=== Llama 3.2 3B Android Setup Helper ==="
echo ""

# Check if ADB is available
if ! command -v adb &> /dev/null; then
    echo "❌ ADB not found. Please install Android SDK Platform Tools."
    echo "   Download from: https://developer.android.com/studio/releases/platform-tools"
    exit 1
fi

echo "✓ ADB found"
echo ""

# Check device connection
echo "Checking for connected devices..."
DEVICES=$(adb devices | grep -v "List" | grep "device$" | wc -l)

if [ "$DEVICES" -eq 0 ]; then
    echo "❌ No Android device found."
    echo "   Please connect your device via USB and enable USB debugging."
    exit 1
fi

echo "✓ Found $DEVICES device(s)"
echo ""

# Create directory structure
echo "Creating directories on device..."
adb shell mkdir -p /sdcard/llama
adb shell mkdir -p /data/local/tmp
echo "✓ Directories created"
echo ""

# Check if model file exists locally
MODEL_FILE="llama-3.2-3b-instruct-q4_k_m.gguf"
if [ ! -f "$MODEL_FILE" ]; then
    echo "⚠ Model file not found: $MODEL_FILE"
    echo "   Please download it from:"
    echo "   https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF"
    echo ""
    read -p "Do you want to continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✓ Model file found: $MODEL_FILE"
    echo "  Pushing to device (this may take a while)..."
    adb push "$MODEL_FILE" /sdcard/llama/
    echo "✓ Model pushed to device"
fi

echo ""

# Check if llama-server exists
SERVER_BINARY="llama-server"
if [ ! -f "$SERVER_BINARY" ]; then
    echo "⚠ llama-server binary not found: $SERVER_BINARY"
    echo "   Please build it or download a pre-built version."
    echo "   See LLAMA_ANDROID_SETUP.md for instructions."
    echo ""
    read -p "Do you want to continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✓ Server binary found: $SERVER_BINARY"
    echo "  Pushing to device..."
    adb push "$SERVER_BINARY" /data/local/tmp/
    adb shell chmod 755 /data/local/tmp/llama-server
    echo "✓ Server binary pushed and made executable"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To start the Llama server, run:"
echo "  adb shell /data/local/tmp/llama-server -m /sdcard/llama/llama-3.2-3b-instruct-q4_k_m.gguf -c 2048 --port 8080 --host 0.0.0.0"
echo ""
echo "Or use the start script:"
echo "  ./scripts/start-llama-server.sh"
echo ""



