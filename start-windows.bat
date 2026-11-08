@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing for first run...
  call npm install --omit=dev
)
node server.js
pause
