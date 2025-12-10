# PowerShell script to set up Llama 3.2 3B on Android device
# Usage: .\scripts\setup-llama-android.ps1

Write-Host "=== Llama 3.2 3B Android Setup Helper ===" -ForegroundColor Cyan
Write-Host ""

# Check if ADB is available
$adbPath = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adbPath) {
    Write-Host "❌ ADB not found. Please install Android SDK Platform Tools." -ForegroundColor Red
    Write-Host "   Download from: https://developer.android.com/studio/releases/platform-tools" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ ADB found" -ForegroundColor Green
Write-Host ""

# Check device connection
Write-Host "Checking for connected devices..."
$devices = adb devices | Select-String "device$"
$deviceCount = ($devices | Measure-Object).Count

if ($deviceCount -eq 0) {
    Write-Host "❌ No Android device found." -ForegroundColor Red
    Write-Host "   Please connect your device via USB and enable USB debugging." -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Found $deviceCount device(s)" -ForegroundColor Green
Write-Host ""

# Create directory structure
Write-Host "Creating directories on device..."
adb shell "mkdir -p /sdcard/llama"
adb shell "mkdir -p /data/local/tmp"
Write-Host "✓ Directories created" -ForegroundColor Green
Write-Host ""

# Check if model file exists locally
$modelFile = "llama-3.2-3b-instruct-q4_k_m.gguf"
if (-not (Test-Path $modelFile)) {
    Write-Host "⚠ Model file not found: $modelFile" -ForegroundColor Yellow
    Write-Host "   Please download it from:" -ForegroundColor Yellow
    Write-Host "   https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF" -ForegroundColor Cyan
    Write-Host ""
    $continue = Read-Host "Do you want to continue anyway? (y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
} else {
    Write-Host "✓ Model file found: $modelFile" -ForegroundColor Green
    Write-Host "  Pushing to device (this may take a while)..." -ForegroundColor Yellow
    adb push $modelFile /sdcard/llama/
    Write-Host "✓ Model pushed to device" -ForegroundColor Green
}

Write-Host ""

# Check if llama-server exists
$serverBinary = "llama-server"
if (-not (Test-Path $serverBinary)) {
    Write-Host "⚠ llama-server binary not found: $serverBinary" -ForegroundColor Yellow
    Write-Host "   Please build it or download a pre-built version." -ForegroundColor Yellow
    Write-Host "   See LLAMA_ANDROID_SETUP.md for instructions." -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Do you want to continue anyway? (y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
} else {
    Write-Host "✓ Server binary found: $serverBinary" -ForegroundColor Green
    Write-Host "  Pushing to device..." -ForegroundColor Yellow
    adb push $serverBinary /data/local/tmp/
    adb shell "chmod 755 /data/local/tmp/llama-server"
    Write-Host "✓ Server binary pushed and made executable" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the Llama server, run:" -ForegroundColor Yellow
Write-Host "  adb shell /data/local/tmp/llama-server -m /sdcard/llama/llama-3.2-3b-instruct-q4_k_m.gguf -c 2048 --port 8080 --host 0.0.0.0" -ForegroundColor White
Write-Host ""
Write-Host "Or use the start script:" -ForegroundColor Yellow
Write-Host "  .\scripts\start-llama-server.ps1" -ForegroundColor White
Write-Host ""



