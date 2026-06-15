@echo off
setlocal

cd /d "%~dp0"

if not exist "data" mkdir "data"

if not exist "config.json" (
  echo Creating config.json from config.example.json...
  copy "config.example.json" "config.json" >nul
)

echo Starting Pantheon Parser 2...
echo.
echo Dashboard will open at http://localhost:3117
echo.
echo If one Pantheon.exe instance is open, it will be selected automatically.
echo If multiple are open, choose the PID you want this parser to monitor.
echo To select character-specific addon files, run:
echo   StartPantheonParser2.bat --character Nexerin
echo.
echo Stopping any existing Pantheon Parser 2 Node process...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$repo = [regex]::Escape((Resolve-Path '.').Path); $portPids = @(Get-NetTCPConnection -LocalPort 3117 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess); Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" | Where-Object { $_.CommandLine -match $repo -or $portPids -contains $_.ProcessId } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3117'"

node --no-warnings "%~dp0src\app.js" %*

echo.
echo Pantheon Parser 2 stopped.
pause
