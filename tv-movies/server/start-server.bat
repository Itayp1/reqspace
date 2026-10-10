@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Download it from https://nodejs.org & pause & exit /b 1)
if not exist config.json (
  echo config.json not found. Copy config.example.json to config.json and set your movie folders.
  pause
  exit /b 1
)
node server.js
pause
