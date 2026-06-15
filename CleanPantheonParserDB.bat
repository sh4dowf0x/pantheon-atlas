@echo off
setlocal

cd /d "%~dp0"

if not exist "config.json" (
  echo config.json was not found.
  echo Run StartPantheonParser2.bat once first so config.json can be created.
  pause
  exit /b 1
)

echo.
echo Pantheon Parser 2 database cleanup
echo.
echo This will stop the running parser before touching the database.
echo Actor and pet name hints are preserved.
echo.
echo Choose cleanup mode:
echo   1. Keep the last 30 minutes of parser/map data
echo   2. Wipe all parser/map/packet data
echo   Q. Cancel
echo.
set /p MODE="Selection [1/2/Q]: "

if /i "%MODE%"=="Q" exit /b 0
if "%MODE%"=="1" (
  set CLEAN_ARGS=--yes --keep-minutes 30
) else if "%MODE%"=="2" (
  set CLEAN_ARGS=--yes --all
) else (
  echo Invalid selection.
  pause
  exit /b 1
)

echo.
echo Stopping Pantheon Parser 2 Node process...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$repo = [regex]::Escape((Resolve-Path '.').Path); $portPids = @(Get-NetTCPConnection -LocalPort 3117 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess); Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" | Where-Object { $_.CommandLine -match $repo -or $portPids -contains $_.ProcessId } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo.
echo Cleaning database. This can take a minute if the WAL file is huge...
node --no-warnings "%~dp0scripts\cleanup-db.js" %CLEAN_ARGS%
if errorlevel 1 (
  echo.
  echo Cleanup failed.
  pause
  exit /b 1
)

if exist "%~dp0data\pantheon-network.sqlite.compact" (
  echo.
  echo Installing compacted database...
  del /f /q "%~dp0data\pantheon-network.sqlite-wal" 2>nul
  del /f /q "%~dp0data\pantheon-network.sqlite-shm" 2>nul
  move /y "%~dp0data\pantheon-network.sqlite.compact" "%~dp0data\pantheon-network.sqlite" >nul
)

echo.
echo Cleanup complete.
echo Run StartPantheonParser2.bat to start the parser again.
echo.
pause
