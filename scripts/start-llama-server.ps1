# PowerShell script to start Llama server on Android device
# Usage: .\scripts\start-llama-server.ps1

Write-Host "Starting Llama server on Android device..." -ForegroundColor Cyan
Write-Host ""

# Check if ADB is available
$adbPath = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adbPath) {
    Write-Host "❌ ADB not found. Please install Android SDK Platform Tools." -ForegroundColor Red
    exit 1
}

# Check device connection
$devices = adb devices | Select-String "device$"
$deviceCount = ($devices | Measure-Object).Count
if ($deviceCount -eq 0) {
    Write-Host "❌ No Android device found." -ForegroundColor Red
    exit 1
}

# Start server
Write-Host "Starting server on port 8080..." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

adb shell "/data/local/tmp/llama-server -m /sdcard/llama/llama-3.2-3b-instruct-q4_k_m.gguf -c 2048 --port 8080 --host 0.0.0.0 -t 4"



