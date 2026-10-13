@echo off
rem Runs the relay in this window, for testing. For normal use run install-autostart.bat instead.
title Vision7 BioStar Relay (test run)
cd /d "%~dp0"
if not exist config.env (
  echo config.env not found. Copy config.env.example to config.env and fill it in first.
  pause
  exit /b 1
)
node index.js
echo.
echo The relay has stopped. Read the message above to see why.
pause
