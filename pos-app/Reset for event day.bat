@echo off
title GOLVIA POS - reset for event day
cd /d "%~dp0server"

echo ============================================================
echo   GOLVIA - clear test data before the event
echo ============================================================
echo.
echo This shows you what WOULD be removed. Nothing is deleted yet.
echo.

node src/services/resetForGoLive.js
if errorlevel 1 goto :failed

echo.
echo ============================================================
set /p ANSWER="Type  RESET  and press Enter to go ahead (anything else cancels): "

if /i not "%ANSWER%"=="RESET" (
  echo.
  echo Cancelled. Nothing was changed.
  echo.
  pause
  exit /b 0
)

echo.
node src/services/resetForGoLive.js --confirm
if errorlevel 1 goto :failed

echo.
echo Close the GOLVIA window and start it again so the changes take effect.
echo.
pause
exit /b 0

:failed
echo.
echo Something went wrong - nothing was reset. Read the message above.
echo.
pause
exit /b 1
