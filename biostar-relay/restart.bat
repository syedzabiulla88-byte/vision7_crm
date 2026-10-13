@echo off
rem Restarts the relay. Run this after you change config.env (for example a new BioStar password).
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
schtasks /End /TN "Vision7 BioStar Relay" >nul 2>&1
timeout /t 2 /nobreak >nul
schtasks /Run /TN "Vision7 BioStar Relay"
echo.
echo Relay restarted. Check https://localhost:8443/relay/health in a browser.
pause
