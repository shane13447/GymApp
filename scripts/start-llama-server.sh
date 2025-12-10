#!/bin/bash
# Start Llama server on Android device
# Usage: ./scripts/start-llama-server.sh

echo "Starting Llama server on Android device..."
echo ""

# Check if ADB is available
if ! command -v adb &> /dev/null; then
    echo "❌ ADB not found. Please install Android SDK Platform Tools."
    exit 1
fi

# Check device connection
DEVICES=$(adb devices | grep -v "List" | grep "device$" | wc -l)
if [ "$DEVICES" -eq 0 ]; then
    echo "❌ No Android device found."
    exit 1
fi

# Start server
echo "Starting server on port 8080..."
echo "Press Ctrl+C to stop the server"
echo ""

adb shell /data/local/tmp/llama-server \
    -m /sdcard/llama/llama-3.2-3b-instruct-q4_k_m.gguf \
    -c 2048 \
    --port 8080 \
    --host 0.0.0.0 \
    -t 4



